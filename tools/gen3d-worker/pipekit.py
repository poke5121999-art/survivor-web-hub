"""Helpers for the real Xưởng 3D pipelines (pipe_shape.py, pipe_texture.py, pipe_rig.py).

Runs inside the venv of each CLI (numpy, trimesh, cv2, PIL, requests are there). The fake pipeline keeps using glbkit.py.
"""
import io
import json
import os
import struct
import subprocess
import sys
import threading
import time

import numpy as np

GPU_LOCK = os.environ.get("GEN3D_GPU_LOCK", "D:/gen3d-locks/gpu")
MAX_FILE = 48 * 2 ** 20  # bucket limit is 50 MB per file; keep a margin


def say(stage, msg):
    print("@@STAGE %s %s" % (stage, msg), flush=True)


def note(msg):
    print(msg, flush=True)


def load_job(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_result(out_dir, files, stats):
    with open(os.path.join(out_dir, "result.json"), "w", encoding="utf-8") as f:
        json.dump({"files": files, "stats": stats}, f, ensure_ascii=False)


def download(pub_base, path, dest):
    import requests
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    for i in range(4):
        try:
            with requests.get(pub_base + path, stream=True, timeout=120) as r:
                r.raise_for_status()
                with open(dest + ".part", "wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
            os.replace(dest + ".part", dest)
            return dest
        except requests.exceptions.RequestException:
            if i == 3:
                raise
            time.sleep(2 * (i + 1))


def kill_tree(p):
    if p.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(p.pid)], capture_output=True, timeout=20)
    else:
        p.kill()


def run(argv, timeout, on_line=None, env=None, on_start=None):
    """Run a CLI, stream its output (so the worker keeps it in the error tail), kill it after timeout s."""
    note("chạy: " + " ".join(argv))
    kw = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
    p = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUNBUFFERED="1", **(env or {})), **kw)
    killed = []
    if on_start:
        on_start(p)

    def kill():
        killed.append(1)
        kill_tree(p)
    t = threading.Timer(timeout, kill)
    t.start()
    try:
        for raw in p.stdout:
            line = raw.decode("utf-8", "replace").rstrip()
            if not line:
                continue
            print("  | " + line, flush=True)
            if on_line:
                on_line(line)
        p.wait()
    finally:
        t.cancel()
    if killed:
        raise SystemExit("%s quá %d s, đã dừng" % (os.path.basename(argv[1] if len(argv) > 1 else argv[0]), timeout))
    return p.returncode


class GpuLock:
    """Same lock dir the CLIs use (mkdir is atomic). Only for GPU work the adapter does itself."""
    def __enter__(self):
        os.makedirs(os.path.dirname(GPU_LOCK), exist_ok=True)
        while True:
            try:
                os.mkdir(GPU_LOCK)
                return self
            except FileExistsError:
                try:
                    if time.time() - os.path.getmtime(GPU_LOCK) > 40 * 60:
                        os.rmdir(GPU_LOCK)
                        continue
                except OSError:
                    pass
                note("khoá GPU đang bận, chờ 20 s")
                time.sleep(20)

    def __exit__(self, *a):
        try:
            os.rmdir(GPU_LOCK)
        except OSError:
            pass


# ---------------------------------------------------------------- GLB: read, write, shrink embedded images
def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, _ver, _len = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        raise ValueError("%s không phải glb" % path)
    off, js, blob = 12, None, b""
    while off < len(data):
        n, typ = struct.unpack_from("<II", data, off)
        chunk = data[off + 8: off + 8 + n]
        if typ == 0x4E4F534A:
            js = json.loads(chunk.decode("utf-8"))
        elif typ == 0x004E4942:
            blob = chunk
        off += 8 + n
    return js, blob


def write_glb(path, js, views_bytes):
    """views_bytes: list of bytes, one per bufferView in order; offsets are rebuilt."""
    blob = bytearray()
    for i, b in enumerate(views_bytes):
        while len(blob) % 4:
            blob.append(0)
        js["bufferViews"][i]["byteOffset"] = len(blob)
        js["bufferViews"][i]["byteLength"] = len(b)
        js["bufferViews"][i]["buffer"] = 0
        blob.extend(b)
    while len(blob) % 4:
        blob.append(0)
    js["buffers"] = [{"byteLength": len(blob)}]
    j = json.dumps(js, separators=(",", ":")).encode()
    j += b" " * ((4 - len(j) % 4) % 4)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(j) + 8 + len(blob))
    out += struct.pack("<II", len(j), 0x4E4F534A) + j + struct.pack("<II", len(blob), 0x004E4942) + bytes(blob)
    with open(path + ".part", "wb") as f:
        f.write(out)
    os.replace(path + ".part", path)
    return len(out)


def _image_roles(js):
    """image index -> 'base' | 'normal' | 'orm' | 'other' and whether base needs alpha."""
    roles, alpha = {}, set()
    texs = js.get("textures") or []

    def mark(ti, role, blend=False):
        if ti is None or ti >= len(texs):
            return
        src = texs[ti].get("source")
        if src is not None:
            roles.setdefault(src, role)
            if blend:
                alpha.add(src)
    for m in js.get("materials") or []:
        pbr = m.get("pbrMetallicRoughness") or {}
        blend = m.get("alphaMode", "OPAQUE") != "OPAQUE"
        mark((pbr.get("baseColorTexture") or {}).get("index"), "base", blend)
        mark((pbr.get("metallicRoughnessTexture") or {}).get("index"), "orm")
        mark((m.get("occlusionTexture") or {}).get("index"), "orm")
        mark((m.get("normalTexture") or {}).get("index"), "normal")
        mark((m.get("emissiveTexture") or {}).get("index"), "other")
    return roles, alpha


def shrink_glb(path, limit=MAX_FILE, log=note):
    """Keep the glb under `limit` bytes: first re-encode embedded PNG maps as JPEG (q 92; normal maps q 95),
    then halve the map sides until it fits. Returns {bytes, changes}. Untouched if already small enough."""
    from PIL import Image
    size0 = os.path.getsize(path)
    if size0 <= limit:
        return {"bytes": size0, "changes": []}
    js, blob = read_glb(path)
    views = [bytes(blob[v.get("byteOffset", 0): v.get("byteOffset", 0) + v["byteLength"]]) for v in js["bufferViews"]]
    roles, alpha = _image_roles(js)
    imgs = [(i, im) for i, im in enumerate(js.get("images") or []) if "bufferView" in im]
    pil = {i: Image.open(io.BytesIO(views[im["bufferView"]])) for i, im in imgs}
    for i in pil:
        pil[i].load()
    changes, scale = [], 1.0
    for step in range(6):
        for i, im in imgs:
            src = pil[i]
            if scale < 1:
                src = src.resize((max(64, int(src.width * scale)), max(64, int(src.height * scale))), Image.LANCZOS)
            buf = io.BytesIO()
            if i in alpha:
                src.save(buf, "PNG", optimize=True)
                im["mimeType"] = "image/png"
            else:
                src.convert("RGB").save(buf, "JPEG", quality=95 if roles.get(i) == "normal" else 92, optimize=True)
                im["mimeType"] = "image/jpeg"
            views[im["bufferView"]] = buf.getvalue()
        total = 12 + 16 + len(json.dumps(js)) + sum((len(v) + 3) // 4 * 4 for v in views)
        changes.append("JPEG" if scale == 1 else "maps x%.2f" % scale)
        if total <= limit:
            break
        scale *= 0.5
    n = write_glb(path, js, views)
    log("glb %.1f MB → %.1f MB (%s)" % (size0 / 2 ** 20, n / 2 ** 20, ", ".join(changes)))
    if n > limit:
        raise SystemExit("glb vẫn %.1f MB sau khi nén ảnh, quá giới hạn %d MB" % (n / 2 ** 20, limit // 2 ** 20))
    return {"bytes": n, "changes": changes, "bytes_before": size0}


def fit_map(path, limit=MAX_FILE, log=note):
    """A separate PNG map over the limit becomes a JPEG next to it. Returns the file name to publish, or None."""
    if os.path.getsize(path) <= limit:
        return os.path.basename(path)
    from PIL import Image
    im = Image.open(path).convert("RGB")
    jp = os.path.splitext(path)[0] + ".jpg"
    for q in (92, 85, 75):
        im.save(jp, "JPEG", quality=q, optimize=True)
        if os.path.getsize(jp) <= limit:
            log("%s %.1f MB → %s %.1f MB" % (os.path.basename(path), os.path.getsize(path) / 2 ** 20, os.path.basename(jp), os.path.getsize(jp) / 2 ** 20))
            return os.path.basename(jp)
    log("%s quá lớn, không tải riêng" % os.path.basename(path))
    return None


# ---------------------------------------------------------------- thumbnail: flat-shaded front render
def glb_stats(path):
    import trimesh
    sc = trimesh.load(path, force="scene")
    tris = verts = 0
    for g in sc.geometry.values():
        if hasattr(g, "faces"):
            tris += len(g.faces)
            verts += len(g.vertices)
    return {"tris": int(tris), "verts": int(verts)}


def render_thumb(glb_path, png_path, size=256, yaw_deg=25.0):
    """Painter's-algorithm render of the glb from the front (+Z), turned yaw_deg, base colour from the texture if any."""
    import cv2
    import trimesh
    sc = trimesh.load(glb_path, force="scene")
    V, F, C = [], [], []
    n0 = 0
    for name in sc.graph.nodes_geometry:
        tf, gname = sc.graph[name]
        g = sc.geometry[gname]
        if not hasattr(g, "faces") or not len(g.faces):
            continue
        v = trimesh.transform_points(np.asarray(g.vertices, np.float64), tf)
        col = None
        try:
            vis = g.visual
            if vis.kind == "texture":
                col = np.asarray(vis.to_color().vertex_colors, np.float64)[:, :3]
            elif vis.kind is not None:
                col = np.asarray(vis.vertex_colors, np.float64)[:, :3]
        except Exception:
            col = None
        if col is None or len(col) != len(v):
            col = np.full((len(v), 3), 200.0)
        V.append(v); F.append(np.asarray(g.faces) + n0); C.append(col)
        n0 += len(v)
    if not V:
        raise SystemExit("glb không có mesh để chụp thumb")
    V, F, C = np.concatenate(V), np.concatenate(F), np.concatenate(C)
    a = np.radians(yaw_deg)
    R = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
    V = V @ R.T
    lo, hi = V.min(0), V.max(0)
    S = size * 2
    k = 0.86 * S / max(hi[0] - lo[0], hi[1] - lo[1], 1e-9)
    cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    xy = np.stack([(V[:, 0] - cx) * k + S / 2, S / 2 - (V[:, 1] - cy) * k], 1)
    tri = V[F]
    nrm = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)
    light = np.array([0.35, 0.55, 0.75]); light /= np.linalg.norm(light)
    shade = 0.35 + 0.65 * np.abs(nrm @ light)
    col = C[F].mean(1) * shade[:, None]
    order = np.argsort(tri[:, :, 2].mean(1))  # far (small z) first, camera on +Z
    img = np.zeros((S, S, 3), np.uint8)
    img[:] = (30, 22, 24)  # BGR of #18161e
    pts = np.round(xy[F] * 4).astype(np.int32)  # 2 bits sub-pixel
    colb = np.clip(col[:, ::-1], 0, 255).astype(np.uint8)
    for f in order:
        c = colb[f]
        cv2.fillConvexPoly(img, pts[f], (int(c[0]), int(c[1]), int(c[2])), lineType=cv2.LINE_AA, shift=2)
    img = cv2.resize(img, (size, size), interpolation=cv2.INTER_AREA)
    cv2.imwrite(png_path, img)
    return png_path
