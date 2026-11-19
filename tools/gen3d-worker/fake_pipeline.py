"""Fake pipeline for Xưởng 3D so the whole queue loop runs without TripoSG.

Usage: python fake_pipeline.py <job.json> <out_dir>
Protocol (same as a real pipeline, see README.md):
  stdout "@@STAGE <stage> <message>"   -> progress
  stdout "@@PREVIEW <file in out_dir>"  -> preview image
  out_dir/result.json = {"files": {key: relative path}, "stats": {...}}
  exit 0 = done, exit 75 = give the job back (not enough memory), other = failed.
shape  -> UV sphere (triangle) or cube (quad), polycount-sized
texture-> same sphere with an embedded checker atlas
rig    -> three.js example Xbot.glb (Mixamo bones), cached in the work dir
"""
import json
import math
import os
import shutil
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbkit import cube, png_bytes, uv_sphere, write_glb  # noqa: E402

XBOT_URL = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/Xbot.glb"
STEP_S = float(os.environ.get("GEN3D_FAKE_STEP_S", "1.5"))


def say(stage, msg):
    print("@@STAGE %s %s" % (stage, msg), flush=True)
    time.sleep(STEP_S)


def thumb(path, hue_shift, checker=False):
    def px(x, y):
        dx, dy = (x - 128) / 90.0, (y - 128) / 90.0
        d = dx * dx + dy * dy
        if d > 1:
            return (24, 22, 30, 255)
        z = math.sqrt(1 - d)
        light = max(0.15, 0.3 * dx * -1 + 0.4 * dy * -1 + 0.8 * z)
        base = (200, 200, 205)
        if checker and ((int((dx + 2) * 4) + int((dy + 2) * 4)) % 2):
            base = (230, 120 + hue_shift % 80, 60)
        return (int(min(255, base[0] * light)), int(min(255, base[1] * light)), int(min(255, base[2] * light)), 255)
    with open(path, "wb") as f:
        f.write(png_bytes(256, 256, px))


def checker_png(size):
    cell = max(1, size // 16)
    return png_bytes(size, size, lambda x, y: (235, 140, 60, 255) if ((x // cell + y // cell) % 2) else (60, 120, 220, 255))


def sphere_for(polycount):
    seg = max(6, min(180, int(math.sqrt(polycount / 2.0))))
    return uv_sphere(seg, max(4, seg // 2))


def main():
    job = json.load(open(sys.argv[1], encoding="utf-8"))
    out = sys.argv[2]
    kind, p = job["kind"], job["params"]
    t0 = time.time()
    files, stats = {}, {}
    if kind == "shape":
        say("segment", "tách nền %d ảnh (giả)" % len(job["inputs"]["views"]))
        os.makedirs(os.path.join(out, "views_clean"), exist_ok=True)
        clean = {}
        for v, src in job["inputs"]["views"].items():
            ext = os.path.splitext(src)[1] or ".png"
            shutil.copy(src, os.path.join(out, "views_clean", v + ext))
            clean[v] = "views_clean/" + v + ext
        files["views_clean"] = clean
        say("generate", "dựng hình (giả: %s)" % ("cube" if p["topology"] == "quad" else "UV sphere"))
        thumb(os.path.join(out, "preview.png"), 0)
        print("@@PREVIEW preview.png", flush=True)
        say("optimize", "giảm còn khoảng %d mặt" % p["polycount"])
        if p["topology"] == "quad":
            mesh = cube()
            stats["quads"] = 6
        else:
            mesh = sphere_for(p["polycount"])
        stats["bytes"] = write_glb(os.path.join(out, "model.glb"), *mesh, name="shape")
        shutil.copy(os.path.join(out, "model.glb"), os.path.join(out, "raw.glb"))
        files.update(glb="model.glb", raw_glb="raw.glb")
        thumb(os.path.join(out, "thumb.png"), 0)
        files["thumb"] = "thumb.png"
    elif kind == "texture":
        if p.get("remove_lighting"):
            say("delight", "khử sáng ảnh (giả)")
        say("project", "chiếu ảnh lên mesh (giả)")
        say("inpaint", "vùng mù: %s" % ("diffusion vẽ bù" if p.get("ai_complete") else "tô màu lân cận"))
        say("bake", "atlas %s (giả ra 512 px)" % p.get("quality", "4K"))
        tex = checker_png(512)
        with open(os.path.join(out, "albedo.png"), "wb") as f:
            f.write(tex)
        mesh = sphere_for(20000)
        stats["bytes"] = write_glb(os.path.join(out, "model.glb"), *mesh, texture_png=tex, name="textured")
        thumb(os.path.join(out, "thumb.png"), 40, checker=True)
        files.update(glb="model.glb", thumb="thumb.png", albedo="albedo.png")
    elif kind == "rig":
        say("skeleton", "đặt xương mixamorig (giả: dùng Xbot mẫu)")
        cache = os.path.join(job["work_dir"], "cache", "Xbot.glb")
        if not os.path.exists(cache):
            os.makedirs(os.path.dirname(cache), exist_ok=True)
            with urllib.request.urlopen(XBOT_URL, timeout=60) as r, open(cache + ".part", "wb") as f:
                f.write(r.read())
            os.replace(cache + ".part", cache)
        say("skin", "skin weights (giả)")
        shutil.copy(cache, os.path.join(out, "model.glb"))
        stats["bytes"] = os.path.getsize(cache)
        thumb(os.path.join(out, "thumb.png"), 80)
        files.update(glb="model.glb", thumb="thumb.png")
    else:
        print("kind lạ: %s" % kind, file=sys.stderr)
        return 2
    if "tris" not in stats and kind != "rig":
        stats["tris"] = len(mesh[3]) // 3
        stats["verts"] = len(mesh[0])
    stats["seconds"] = round(time.time() - t0, 1)
    with open(os.path.join(out, "result.json"), "w", encoding="utf-8") as f:
        json.dump({"files": files, "stats": stats}, f)
    return 0


if __name__ == "__main__":
    sys.exit(main())
