"""Real shape pipeline for Xưởng 3D: TripoSG CLI (D:\\gen3d\\gen3d\\cli.py shape) wrapped in the worker protocol.

Usage (pipelines.json): <gen3d venv python> pipe_shape.py <job.json> <out_dir> --cli D:/gen3d/gen3d/cli.py
out_dir: model.glb (optimised), model_raw.glb, thumb.png, views_clean/<view>.png, result.json.
The CLI takes the GPU lock itself; the extra views (back/left/right) are cut out here with the same preprocess.py
under the same lock, so pipe_texture.py gets every view cleaned.
"""
import argparse
import os
import shutil
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pipekit as K  # noqa: E402

NEED_COMMIT_GB = float(os.environ.get("GEN3D_SHAPE_COMMIT_GB", "9"))  # TripoSG shape peaks ~9.9 GB working set; the CLI itself only waits for 6
# --ultra (568^3 grid, 100 steps) needs ~12 GB free at start and spikes ~4 GB more at the end of the shape stage (S1 report)
ULTRA_COMMIT_GB = float(os.environ.get("GEN3D_ULTRA_COMMIT_GB", "12"))
FLOOR_GB = float(os.environ.get("GEN3D_COMMIT_FLOOR_GB", "1.2"))  # below this mid-run: stop our own CLI before the PC runs dry


def commit_free_gb():
    if os.name != "nt":
        return 1e9
    import ctypes  # commit free = GlobalMemoryStatusEx.ullAvailPageFile, same as the worker gate

    class MS(ctypes.Structure):
        _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong), ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong), ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong), ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
    m = MS()
    m.dwLength = ctypes.sizeof(MS)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
    return m.ullAvailPageFile / 2 ** 30


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("job_json")
    ap.add_argument("out_dir")
    ap.add_argument("--cli", default="D:/gen3d/gen3d/cli.py")
    ap.add_argument("--timeout", type=float, default=3300)
    ap.add_argument("--wait-commit-s", type=float, default=300)
    a = ap.parse_args()
    job = K.load_job(a.job_json)
    p, out = job["params"], os.path.abspath(a.out_dir)
    views = job["inputs"]["views"]
    t0 = time.time()
    order = [v for v in ("front", "back", "left", "right") if views.get(v)]
    if not order:
        raise SystemExit("job shape không có ảnh nào trong inputs.views")
    main_view = order[0]

    # RAM: shape peaks ~10 GB; wait a bit, then give the job back (exit 75) instead of crashing the shared PC.
    # Ultra needs more than this PC usually has free: after the wait it fails with the reason instead of requeueing forever.
    ultra = bool(p.get("ultra"))
    need = ULTRA_COMMIT_GB if ultra else NEED_COMMIT_GB
    t_wait = time.time()
    while commit_free_gb() < need:
        if time.time() - t_wait > a.wait_commit_s:
            if ultra:
                print("Ultra cần ~%.0f GB RAM trống (commit) để chạy, máy gen chỉ còn %.1f GB sau %d s chờ; tắt Ultra hoặc thử lại lúc máy rảnh"
                      % (need, commit_free_gb(), a.wait_commit_s), flush=True)
                return 3
            print("commit trống %.1f GB < %.0f GB sau %d s chờ" % (commit_free_gb(), need, a.wait_commit_s), flush=True)
            return 75
        K.say("setup", "chờ bộ nhớ: commit trống %.1f GB < %.0f GB%s" % (commit_free_gb(), need, " (Ultra)" if ultra else ""))
        time.sleep(30)

    glb = os.path.join(out, "model.glb")
    stem = os.path.splitext(glb)[0]
    rgba = stem + "_work/input_rgba.png"
    report = os.path.join(out, "shape.report.json")
    state = {"phase": None}

    def on_line(line):
        if "stage preprocess" in line and state["phase"] is None:
            state["phase"] = "segment"
            K.say("segment", "tách nền ảnh %s (BiRefNet)" % main_view)
        elif "stage shape" in line and state["phase"] != "generate":
            state["phase"] = "generate"
            K.say("generate", "TripoSG dựng hình%s" % (" (Ultra)" if p.get("ultra") else ""))
            if os.path.exists(rgba):
                shutil.copy(rgba, os.path.join(out, "preview.png"))
                print("@@PREVIEW preview.png", flush=True)
        elif "GPU lock released" in line and state["phase"] == "generate":
            state["phase"] = "optimize"
            K.say("optimize", "giảm còn khoảng %d %s" % (p.get("polycount", 20000), "mặt tứ giác" if p.get("topology") == "quad" else "tam giác"))
        elif "GPU lock held" in line:
            K.say("setup", "chờ khoá GPU (máy đang chạy việc GPU khác)")

    argv = [sys.executable, a.cli, "shape", "--image", views[main_view], "--out", glb,
            "--polycount", str(int(p.get("polycount", 20000))), "--topology", p.get("topology", "triangle"),
            "--seed", str(int(p.get("seed", 42))), "--report", report]
    if p.get("ultra"):
        argv.append("--ultra")
    low = []

    def watch(proc):  # the end-of-shape spike can take the shared PC to 0: stop our own CLI first
        while proc.poll() is None:
            if commit_free_gb() < FLOOR_GB:
                low.append(round(commit_free_gb(), 1))
                K.kill_tree(proc)
                return
            time.sleep(2)
    code = K.run(argv, a.timeout, on_line, on_start=lambda proc: threading.Thread(target=watch, args=(proc,), daemon=True).start())
    if low:
        print("dừng dựng hình: commit trống tụt còn %.1f GB giữa chừng%s" % (low[0], " (Ultra cần ~16 GB lúc cao điểm)" if ultra else ""), flush=True)
        return 3 if ultra else 75
    if code:
        raise SystemExit("cli shape thoát mã %s" % code)
    rep = K.load_job(report)

    # views_clean: the CLI cut out the main view; cut the others with the same preprocess.py
    vc = os.path.join(out, "views_clean")
    os.makedirs(vc, exist_ok=True)
    clean = {main_view: "views_clean/%s.png" % main_view}
    # texture projects from views_clean: keep the cut-out at the photo's own scale when preprocess saved one (<= 2048)
    full = os.path.splitext(rgba)[0] + "_full.png"
    shutil.copy(full if os.path.exists(full) else rgba, os.path.join(vc, main_view + ".png"))
    rest = order[1:]
    if rest:
        K.say("segment", "tách nền %d ảnh còn lại cho texture" % len(rest))
        pre = os.path.join(os.path.dirname(a.cli), "preprocess.py")
        root = os.path.dirname(os.path.dirname(os.path.abspath(a.cli)))
        env = {"HF_HOME": os.path.join(root, "weights"), "HF_HUB_OFFLINE": "1"}
        with K.GpuLock():
            for v in rest:
                dst = os.path.join(vc, v + ".png")
                if K.run([sys.executable, pre, views[v], dst], 900, env=env) == 0 and os.path.exists(dst):
                    vfull = os.path.splitext(dst)[0] + "_full.png"
                    if os.path.exists(vfull):
                        os.replace(vfull, dst)
                    clean[v] = "views_clean/%s.png" % v
                else:
                    print("tách nền ảnh %s lỗi, bỏ ảnh này" % v, flush=True)

    files = {"glb": "model.glb", "thumb": "thumb.png", "views_clean": clean}
    raw = stem + "_raw.glb"
    if os.path.getsize(raw) <= K.MAX_FILE:
        files["raw_glb"] = "model_raw.glb"
    else:
        print("model_raw.glb %.1f MB quá giới hạn, không tải lên (texture sẽ bake normal từ mesh tối ưu)" % (os.path.getsize(raw) / 2 ** 20), flush=True)
    K.shrink_glb(glb)
    K.render_thumb(glb, os.path.join(out, "thumb.png"))
    st = K.glb_stats(glb)
    stats = {"tris": rep.get("tris", st["tris"]), "verts": st["verts"], "bytes": os.path.getsize(glb), "raw_tris": rep.get("raw_tris"),
             "raw_bytes": os.path.getsize(raw), "seconds": round(time.time() - t0, 1), "vram_peak_mb": rep.get("peak_vram_mib"),
             "ram_peak_mb": rep.get("peak_ram_mib"), "gpu_wait_s": rep.get("queue_wait_s"), "shape_view": main_view}
    if p.get("topology") == "quad":
        stats["quads"] = rep.get("quads")
    K.write_result(out, files, stats)
    return 0


if __name__ == "__main__":
    sys.exit(main())
