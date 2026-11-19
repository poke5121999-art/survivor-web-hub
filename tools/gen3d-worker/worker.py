#!/usr/bin/env python3
"""Xưởng 3D worker: one process per machine. Asks the gen3d-studio queue for jobs of the kinds this machine can do,
runs the pipeline for that kind (command template from pipelines.json), uploads the result.
API contract: docs/gen3d-studio.md. Python 3.8+, stdlib + requests.
"""
import argparse
import json
import os
import platform
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
WIN = os.name == "nt"
SUPABASE_URL = os.environ.get("GEN3D_SUPABASE_URL", "https://jvdguaecnllejdmgytia.supabase.co")
ANON = os.environ.get("GEN3D_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2ZGd1YWVjbmxsZWpkbWd5dGlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNDM3MTAsImV4cCI6MjEwMDgxOTcxMH0.oo1rodkh8_c7tBa-jptqHfemxmY9h8Q_r8DYrUYL9AI")
FN = SUPABASE_URL + "/functions/v1/gen3d-studio"
PUB = SUPABASE_URL + "/storage/v1/object/public/gen3d/"
EX_TEMPFAIL = 75
CTYPES = {".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".json": "application/json"}

ap = argparse.ArgumentParser(description="Xưởng 3D worker")
ap.add_argument("--id", default=os.environ.get("GEN3D_WORKER_ID", socket.gethostname().lower() + ":gen3d"))
ap.add_argument("--label", default=os.environ.get("GEN3D_LABEL"))
ap.add_argument("--priority", type=int, default=int(os.environ.get("GEN3D_PRIORITY", "0")))
ap.add_argument("--delay", type=int, default=int(os.environ.get("GEN3D_DELAY", "0")), help="claim_delay_s")
ap.add_argument("--caps", default=os.environ.get("GEN3D_CAPS", "shape,texture,rig"))
ap.add_argument("--work-dir", default=os.environ.get("GEN3D_WORK_DIR", os.path.join(os.path.expanduser("~"), "gen3d-worker")))
ap.add_argument("--pipelines", default=os.path.join(HERE, "pipelines.json"))
ap.add_argument("--fake", action="store_true", help="dùng fake_pipeline.py cho mọi kind, bỏ qua pipelines.json")
ap.add_argument("--poll", type=float, default=4.0)
ap.add_argument("--once", action="store_true", help="thoát sau một job")
ap.add_argument("--max-idle", type=float, default=0, help="thoát sau N giây không có job (0 = chạy mãi)")
ap.add_argument("--keep-jobs", action="store_true", help="giữ thư mục jobs/<id> sau khi xong (mặc định xoá, kết quả đã nằm trên bucket)")
ap.add_argument("--min-commit-gb", type=float, default=8.0, help="Windows: commit trống tối thiểu")
ap.add_argument("--min-ram-gb", type=float, default=6.0, help="Linux: MemAvailable tối thiểu")
ap.add_argument("--min-vram-gb", type=float, default=4.0, help="VRAM trống tối thiểu (0 = bỏ kiểm GPU)")
A = ap.parse_args()

WORKER_ID = A.id
LABEL = A.label or WORKER_ID
CAPS = [c for c in (x.strip() for x in A.caps.split(",")) if c in ("shape", "texture", "rig")]
WORK_DIR = os.path.abspath(A.work_dir)
os.makedirs(WORK_DIR, exist_ok=True)
LOG_FILE = os.path.join(WORK_DIR, "worker-%s.log" % re.sub(r"[^A-Za-z0-9._-]", "_", WORKER_ID))


def read_key():
    k = os.environ.get("GEN3D_WORKER_KEY")
    if k:
        return k.strip()
    try:
        with open(os.path.join(os.path.expanduser("~"), ".gen3d-worker-key"), encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


WORKER_KEY = read_key()
if not WORKER_KEY:
    sys.exit("thiếu GEN3D_WORKER_KEY (~/.gen3d-worker-key)")
if not CAPS:
    sys.exit("--caps rỗng: cần ít nhất một trong shape,texture,rig")


def log(msg):
    line = "%s [%s] %s" % (time.strftime("%Y-%m-%dT%H:%M:%S"), WORKER_ID, msg)
    try:
        print(line, flush=True)
    except UnicodeEncodeError:
        print(line.encode("ascii", "replace").decode(), flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


HEADERS = {"apikey": ANON, "content-type": "application/json", "x-gen3d-worker-key": WORKER_KEY}
TRANSIENT = (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
config = {"enabled": True}


def with_retry(what, fn, tries=4):
    """Mạng văn phòng hay reset kết nối: thử lại lỗi mạng tạm thời, lỗi khác ném ra ngay."""
    for i in range(tries):
        try:
            return fn()
        except TRANSIENT as e:
            if i == tries - 1:
                raise
            log("%s lỗi mạng (%s), thử lại lần %d" % (what, type(e).__name__, i + 2))
            time.sleep(2 * (i + 1))


def api(action, timeout=30, **body):
    body["action"] = action
    data = json.dumps(body)
    r = with_retry(action, lambda: requests.post(FN, data=data, headers=HEADERS, timeout=timeout))
    try:
        j = r.json()
    except ValueError:
        j = {"ok": False, "error": {"code": "bad_json", "message": "HTTP %d" % r.status_code}}
    if not j.get("ok"):
        e = j.get("error") or {}
        raise RuntimeError("%s: %s %s" % (action, e.get("code", r.status_code), e.get("message", "")))
    if j.get("config"):
        config.update(j["config"])
    return j


# ---- đo tài nguyên -----------------------------------------------------------------------------
def mem_info():
    """Windows: commit trống (ullAvailPageFile) + RAM trống. Linux: MemAvailable."""
    if WIN:
        import ctypes

        class MS(ctypes.Structure):
            _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong), ("ullTotalPhys", ctypes.c_ulonglong),
                        ("ullAvailPhys", ctypes.c_ulonglong), ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                        ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong), ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
        m = MS()
        m.dwLength = ctypes.sizeof(MS)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
        return {"commit_free_gb": round(m.ullAvailPageFile / 2 ** 30, 1), "ram_free_gb": round(m.ullAvailPhys / 2 ** 30, 1)}
    try:
        with open("/proc/meminfo") as f:
            kv = dict(re.findall(r"^(\w+):\s+(\d+)", f.read(), re.M))
        return {"ram_free_gb": round(int(kv["MemAvailable"]) / 2 ** 20, 1)}
    except (OSError, KeyError):
        return {}


def gpu_info():
    exe = shutil.which("nvidia-smi")
    if not exe:
        return None
    try:
        out = subprocess.run([exe, "--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"],
                             capture_output=True, text=True, timeout=15).stdout.strip().splitlines()
        name, total, free = [x.strip() for x in out[0].split(",")]
        return {"name": name, "vram_total_mb": int(float(total)), "vram_free_mb": int(float(free))}
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        return None


def resource_gate():
    """Returns (ok, note, mem, gpu)."""
    mem, gpu = mem_info(), gpu_info()
    short = []
    if WIN and "commit_free_gb" in mem and mem["commit_free_gb"] < A.min_commit_gb:
        short.append("commit trống %.1f GB < %.0f GB" % (mem["commit_free_gb"], A.min_commit_gb))
    if not WIN and "ram_free_gb" in mem and mem["ram_free_gb"] < A.min_ram_gb:
        short.append("RAM trống %.1f GB < %.0f GB" % (mem["ram_free_gb"], A.min_ram_gb))
    if A.min_vram_gb > 0:
        if gpu is None:
            short.append("không đọc được GPU (nvidia-smi)")
        elif gpu["vram_free_mb"] < A.min_vram_gb * 1024:
            short.append("VRAM trống %.1f GB < %.0f GB" % (gpu["vram_free_mb"] / 1024, A.min_vram_gb))
    return (not short, "; ".join(short), mem, gpu)


# ---- pipeline --------------------------------------------------------------------------------
def load_pipelines():
    if A.fake:
        fake = {"argv": ["{python}", "{here}/fake_pipeline.py", "{job_json}", "{out_dir}"], "timeout_s": 600}
        return {k: fake for k in ("shape", "texture", "rig")}
    with open(A.pipelines, encoding="utf-8") as f:
        p = json.load(f)
    return {k: v for k, v in p.items() if not k.startswith("_")}


def fill(arg, ctx):
    return re.sub(r"\{(\w+)\}", lambda m: str(ctx.get(m.group(1), m.group(0))), arg)


def download(path, dest):
    return with_retry("tải về " + path, lambda: _download(path, dest))


def _download(path, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with requests.get(PUB + path, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(dest + ".part", "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    os.replace(dest + ".part", dest)
    return dest


def kill_tree(proc):
    if proc.poll() is not None:
        return
    try:
        if WIN:
            subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True, timeout=20)
        else:
            os.killpg(proc.pid, signal.SIGKILL)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


class Job:
    def __init__(self, job):
        self.job = job
        self.id = job["id"]
        self.proc = None
        self.abort = None  # lý do dừng: "canceled" | "shutdown"
        self.stop_hb = threading.Event()

    def progress(self, stage, msg, preview=None):
        self.stage = stage
        try:
            r = api("progress", worker_id=WORKER_ID, job_id=self.id, stage=stage, msg=msg, **({"preview": preview} if preview else {}))
            if r.get("job_status") != "running":
                self.cancel("canceled")
        except Exception as e:
            log("progress lỗi: %s" % e)

    def cancel(self, why):
        if not self.abort:
            self.abort = why
            log("dừng job %s (%s)" % (self.id, why))
        if self.proc:
            kill_tree(self.proc)

    def heartbeat_loop(self):
        while not self.stop_hb.wait(15):
            try:
                r = api("heartbeat", worker_id=WORKER_ID, status="busy", job_id=self.id)
                if r.get("job_status") not in ("running", None):
                    self.cancel("canceled")
            except Exception as e:
                log("heartbeat lỗi: %s" % e)

    def upload(self, out_dir, rel):
        ext = os.path.splitext(rel)[1].lower()
        ctype = CTYPES.get(ext)
        if not ctype:
            raise RuntimeError("không biết loại file %s" % rel)
        u = api("upload_urls", job_id=self.id, files=[{"name": rel, "type": ctype}])["files"][0]
        with open(os.path.join(out_dir, rel), "rb") as f:
            blob = f.read()
        r = with_retry("tải " + rel, lambda: requests.put(u["uploadUrl"], data=blob, headers={"content-type": ctype}, timeout=600))
        if not r.ok:
            raise RuntimeError("tải %s lên lỗi %d: %s" % (rel, r.status_code, r.text[:200]))
        return u["path"]

    def run(self, pipelines):
        j = self.job
        kind = j["kind"]
        hb = threading.Thread(target=self.heartbeat_loop, daemon=True)
        hb.start()
        job_dir = os.path.join(WORK_DIR, "jobs", self.id)
        in_dir, out_dir = os.path.join(job_dir, "in"), os.path.join(job_dir, "out")
        shutil.rmtree(job_dir, ignore_errors=True)
        os.makedirs(in_dir)
        os.makedirs(out_dir)
        try:
            spec = pipelines.get(kind)
            if not spec:
                return self.fail("máy này chưa cấu hình pipeline cho %s" % kind)
            self.progress("setup", "tải ảnh và mesh đầu vào")
            root = j.get("root") or j
            views = {}
            for v, path in (root.get("params", {}).get("views") or {}).items():
                views[v] = download(path, os.path.join(in_dir, "views", v + os.path.splitext(path)[1]))
            parent_glb = ""
            if kind != "shape":
                parent_glb = download(j["parent"]["result"]["files"]["glb"], os.path.join(in_dir, "parent.glb"))
            job_json = os.path.join(job_dir, "job.json")
            with open(job_json, "w", encoding="utf-8") as f:
                brief = lambda x: x and {k: x.get(k) for k in ("id", "kind", "parent_id", "params", "result")}  # noqa: E731
                json.dump({"id": self.id, "kind": kind, "params": j["params"], "root_params": root.get("params"),
                           "parent": brief(j.get("parent")), "root": brief(root), "pub_base": PUB,
                           "inputs": {"views": views, "parent_glb": parent_glb}, "work_dir": WORK_DIR, "out_dir": out_dir}, f, ensure_ascii=False)
            ctx = {"python": sys.executable, "here": HERE, "job_dir": job_dir, "job_json": job_json, "in_dir": in_dir, "out_dir": out_dir,
                   "parent_glb": parent_glb, "work_dir": WORK_DIR, "kind": kind}
            for v in ("front", "back", "left", "right"):
                ctx["view_" + v] = views.get(v, "")
            argv = [fill(a, ctx) for a in spec["argv"]]
            timeout = float(spec.get("timeout_s", 3600))
            log("chạy pipeline %s: %s" % (kind, " ".join(argv)))
            code, tail = self.run_proc(argv, out_dir, timeout, spec.get("cwd") and fill(spec["cwd"], ctx))
            if self.abort:
                return self.fail("máy gen tắt" if self.abort == "shutdown" else "đã huỷ", requeue=self.abort == "shutdown")
            if code == EX_TEMPFAIL:
                return self.fail("pipeline báo thiếu bộ nhớ: %s" % tail[-300:], requeue=True)
            if code != 0:
                return self.fail("pipeline %s thoát mã %s: %s" % (kind, code, tail[-600:]))
            with open(os.path.join(out_dir, "result.json"), encoding="utf-8") as f:
                res = json.load(f)
            self.progress("uploading", "tải kết quả lên")
            files = {}
            for key, rel in (res.get("files") or {}).items():
                if isinstance(rel, dict):
                    files[key] = {k: self.upload(out_dir, r) for k, r in rel.items()}
                else:
                    files[key] = self.upload(out_dir, rel)
            if self.abort:
                return self.fail("đã huỷ")
            r = api("complete", worker_id=WORKER_ID, job_id=self.id, result={"files": files, "stats": res.get("stats") or {}})
            log("xong job %s%s" % (self.id, ", tự ra texture %s" % r["child_id"] if r.get("child_id") else ""))
        except Exception as e:
            self.fail("worker lỗi: %s" % e, requeue=self.abort == "shutdown")
        finally:
            self.stop_hb.set()
            if self.proc:
                kill_tree(self.proc)
            if not A.keep_jobs:
                shutil.rmtree(job_dir, ignore_errors=True)

    def run_proc(self, argv, out_dir, timeout, cwd):
        kw = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if WIN else {"start_new_session": True}
        env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1")
        self.proc = subprocess.Popen(argv, cwd=cwd or out_dir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, **kw)
        timer = threading.Timer(timeout, lambda: (log("pipeline quá %d s, dừng" % timeout), kill_tree(self.proc)))
        timer.start()
        tail = []
        try:
            for raw in self.proc.stdout:
                line = raw.decode("utf-8", "replace").rstrip()
                if not line:
                    continue
                m = re.match(r"@@STAGE (\w+) ?(.*)", line)
                p = re.match(r"@@PREVIEW (.+)", line)
                if m:
                    self.progress(m.group(1), m.group(2))
                elif p:
                    try:
                        self.progress(getattr(self, "stage", "generate"), "cập nhật ảnh xem trước", preview=self.upload(out_dir, p.group(1).strip()))
                    except Exception as e:
                        log("preview lỗi: %s" % e)
                else:
                    tail.append(line)
                    tail[:] = tail[-40:]
            self.proc.wait()
        finally:
            timer.cancel()
        if self.proc.returncode != 0 and not self.abort:
            log("pipeline lỗi:\n  " + "\n  ".join(tail[-15:]))
        return self.proc.returncode, "\n".join(tail)

    def fail(self, error, requeue=False):
        log("job %s %s: %s" % (self.id, "trả về hàng đợi" if requeue else "hỏng", error))
        try:
            api("fail", worker_id=WORKER_ID, job_id=self.id, error=error, requeue=requeue)
        except Exception as e:
            log("fail lỗi: %s" % e)


# ---- vòng chính -------------------------------------------------------------------------------
current = None
shutdown = False


def on_signal(sig, _frame):
    global shutdown
    if shutdown:
        os._exit(1)
    shutdown = True
    log("nhận tín hiệu %s, thoát" % sig)
    if current:
        current.cancel("shutdown")


def hello():
    _, _, mem, gpu = resource_gate()
    delay = 2
    while not shutdown:
        try:
            api("hello", worker={"id": WORKER_ID, "label": LABEL, "host": platform.node(), "caps": CAPS, "gpu": gpu, "mem": mem,
                                 "defaults": {"priority": A.priority, "claim_delay_s": A.delay}})
            log("hello ok: caps %s, priority %s, delay %s s" % (",".join(CAPS), config.get("priority"), config.get("claim_delay_s")))
            return
        except Exception as e:
            log("hello lỗi: %s, thử lại sau %d s" % (e, delay))
            time.sleep(delay)
            delay = min(delay * 2, 60)


def main():
    global current
    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)
    pipelines = load_pipelines()
    log("khởi động: work-dir %s, pipeline %s" % (WORK_DIR, "FAKE" if A.fake else A.pipelines))
    hello()
    last_hb, errs, idle_since, state = 0.0, 0, time.time(), "idle"
    while not shutdown:
        try:
            if A.max_idle and time.time() - idle_since > A.max_idle:
                log("không nhận job nào trong %d s, thoát" % A.max_idle)
                break
            ok, note, mem, gpu = resource_gate()
            if not config.get("enabled", True):
                state, note = "paused", "tắt từ trang admin"
            elif not ok:
                state = "lowmem"
            else:
                state = "idle"
            if state != "idle":
                if time.time() - last_hb > 10:
                    api("heartbeat", worker_id=WORKER_ID, status=state, note=note, gpu=gpu, mem=mem)
                    last_hb = time.time()
                    log("%s: %s" % (state, note))
                time.sleep(A.poll * 2)
                continue
            r = api("claim", worker_id=WORKER_ID)
            errs = 0
            job = r.get("job")
            if not job:
                if time.time() - last_hb > 15:
                    api("heartbeat", worker_id=WORKER_ID, status="idle", gpu=gpu, mem=mem)
                    last_hb = time.time()
                time.sleep(A.poll)
                continue
            log("nhận job %s %s \"%s\"" % (job["id"], job["kind"], job.get("title", "")))
            current = Job(job)
            current.run(pipelines)
            current = None
            last_hb, idle_since = 0.0, time.time()
            if A.once:
                break
        except Exception as e:
            errs += 1
            log("vòng chính lỗi: %s" % e)
            if errs % 5 == 0:
                hello()
            time.sleep(min(A.poll * 2 ** min(errs, 4), 60))
    try:
        api("heartbeat", worker_id=WORKER_ID, status="paused", note="worker đã thoát")
    except Exception:
        pass
    log("thoát")


if __name__ == "__main__":
    main()
