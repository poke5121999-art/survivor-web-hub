"""Real texture pipeline for Xưởng 3D: tex.py (route A, D:\\gen3d-spike\\tex) wrapped in the worker protocol.

Usage (pipelines.json): <tex venv python> pipe_texture.py <job.json> <out_dir> --tex D:/gen3d-spike/tex/tex.py
Inputs: parent shape glb (worker downloads it), the parent's raw_glb (normal bake with PBR) and the root's views_clean
(downloaded here; falls back to the raw photos). Output: model.glb (<= 48 MB, maps re-encoded if needed), thumb.png,
model_albedo.png, model_orm.png?, model_normal.png?, result.json.
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pipekit as K  # noqa: E402

VIEWS = ("front", "back", "left", "right")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("job_json")
    ap.add_argument("out_dir")
    ap.add_argument("--tex", default="D:/gen3d-spike/tex/tex.py")
    ap.add_argument("--timeout", type=float, default=3300)
    a = ap.parse_args()
    job = K.load_job(a.job_json)
    p, out = job["params"], os.path.abspath(a.out_dir)
    root, parent = job.get("root") or {}, job.get("parent") or {}
    rp = job.get("root_params") or root.get("params") or {}
    t0 = time.time()
    if rp.get("source") == "upload":
        print("model tự tải lên (source = upload) không có ảnh chụp nào để chiếu màu: Gen texture cần ảnh của model", flush=True)
        return 3
    if parent.get("kind") not in (None, "shape"):
        print("job cha là %s, texture chỉ chạy trên mesh của job shape" % parent.get("kind"), flush=True)
        return 3

    in_dir = os.path.join(os.path.dirname(out), "in")
    pub = job["pub_base"]
    # views: cleaned cut-outs from the shape job, else the photos the user sent
    clean = ((root.get("result") or {}).get("files") or {}).get("views_clean") or {}
    views = {}
    for v in VIEWS:
        if isinstance(clean, dict) and clean.get(v):
            views[v] = K.download(pub, clean[v], os.path.join(in_dir, "clean", v + os.path.splitext(clean[v])[1]))
        elif job["inputs"]["views"].get(v):
            views[v] = job["inputs"]["views"][v]
    if not views.get("front"):
        print("không có ảnh mặt trước (front) để chiếu màu: shape dựng từ ảnh %s" % (", ".join(views) or "không có ảnh nào"), flush=True)
        return 3
    raw = None
    raw_path = ((parent.get("result") or {}).get("files") or {}).get("raw_glb")
    if p.get("pbr") and raw_path:
        raw = K.download(pub, raw_path, os.path.join(in_dir, "parent_raw.glb"))

    glb = os.path.join(out, "model.glb")
    argv = [sys.executable, a.tex, job["inputs"]["parent_glb"], "--quality", p.get("quality", "2K"), "--out", glb]
    for v, f in views.items():
        argv += ["--" + v, f]
    # sample the photos at their own resolution (views_clean keeps up to 2048 px since the fix round), not tex.py's 1024
    try:
        from PIL import Image
        side = max(max(Image.open(f).size) for f in views.values())
    except Exception:
        side = 1024
    argv += ["--view-res", str(int(min(2048, max(1024, side))))]
    if len(views) == 1:
        argv.append("--no-mirror")  # 1 photo: a mirrored front on the back puts a face on the back of the head
    if p.get("ai_complete"):
        argv.append("--ai-complete")
    if p.get("remove_lighting"):
        argv.append("--remove-lighting")
    if p.get("pbr"):
        argv.append("--pbr")
        if raw:
            argv += ["--high", raw]

    def on_line(line):
        if "[tex] atlas_raster" in line:
            if p.get("remove_lighting"):
                K.say("delight", "khử sáng ảnh")
            K.say("project", "chiếu %d ảnh (%s) lên mesh" % (len(views), ", ".join(views)))
        elif "[tex] project" in line:
            K.say("inpaint", "vùng mù: %s" % ("diffusion vẽ bù (SD1.5)" if p.get("ai_complete") else "tô màu lân cận"))
        elif "[tex] fill" in line:
            K.say("bake", "atlas %s%s" % (p.get("quality", "2K"), " + PBR" if p.get("pbr") else ""))
        elif "GPU lock" in line or "[ai]" in line and "lock" in line:
            K.say("inpaint", "chờ khoá GPU cho AI Complete")

    K.say("project", "chuẩn bị chiếu %d ảnh" % len(views))
    code = K.run(argv, a.timeout, on_line)
    if code:
        raise SystemExit("tex.py thoát mã %s" % code)
    rep = K.load_job(os.path.splitext(glb)[0] + ".report.json")
    shrink = K.shrink_glb(glb)
    files = {"glb": "model.glb", "thumb": "thumb.png"}
    for key in ("albedo", "orm", "normal"):
        f = os.path.join(out, "model_%s.png" % key)
        if os.path.exists(f):
            name = K.fit_map(f)
            if name:
                files[key] = name
    K.render_thumb(glb, os.path.join(out, "thumb.png"))
    st = K.glb_stats(glb)
    stats = {"tris": st["tris"], "verts": st["verts"], "bytes": os.path.getsize(glb), "seconds": round(time.time() - t0, 1),
             "views": sorted(views), "atlas": (rep.get("atlas") or {}).get("size"), "coverage_real_photos": rep.get("coverage_real_photos"),
             "ram_peak_mb": rep.get("peak_rss_mb"), "vram_peak_mb": rep.get("peak_vram_mb") or None}
    if shrink.get("changes"):
        stats["glb_bytes_before_shrink"] = shrink["bytes_before"]
        stats["glb_shrink"] = shrink["changes"]
    K.write_result(out, files, stats)
    return 0


if __name__ == "__main__":
    sys.exit(main())
