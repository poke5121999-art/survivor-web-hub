"""Real rig pipeline for Xưởng 3D: rig.py (Make-It-Animatable v2 + build_rig, D:\\gen3d-spike\\rig) in the worker protocol.

Usage (pipelines.json): <rig venv python> pipe_rig.py <job.json> <out_dir> --rig D:/gen3d-spike/rig/rig.py
Input: the parent glb (texture job's textured glb, or the shape glb). rig.py keeps the UVs and the base colour only,
re-saved as PNG; this adapter puts the parent's own map images back (base colour bytes as they were, plus the normal and
metallic-roughness/occlusion maps), so the rigged glb keeps the whole texture and stays the parent's size.
Output: model.glb (skinned, 65 mixamorig bones, T-pose), thumb.png, result.json.
"""
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pipekit as K  # noqa: E402


def graft_maps(parent_glb, rig_glb):
    """Copy the parent's material maps into the rig glb (single material, UVs already preserved by build_rig)."""
    pj, pb = K.read_glb(parent_glb)
    pm = (pj.get("materials") or [None])[0]
    if not pm or not pj.get("images"):
        return []
    rj, rb = K.read_glb(rig_glb)
    if not rj.get("meshes") or "TEXCOORD_0" not in rj["meshes"][0]["primitives"][0]["attributes"]:
        return []
    views = [bytes(rb[v.get("byteOffset", 0): v.get("byteOffset", 0) + v["byteLength"]]) for v in rj["bufferViews"]]
    # drop rig.py's re-encoded image views (rebuilt below), keep geometry views
    old_img_views = {im["bufferView"] for im in rj.get("images") or [] if "bufferView" in im}
    remap, keep = {}, []
    for i, b in enumerate(views):
        if i not in old_img_views:
            remap[i] = len(keep)
            keep.append(b)
    bvs = [rj["bufferViews"][i] for i in sorted(remap)]
    for a in rj["accessors"]:
        if "bufferView" in a:
            a["bufferView"] = remap[a["bufferView"]]
    rj["bufferViews"] = bvs
    images, textures, samplers = [], [], pj.get("samplers") or []
    tex_map = {}

    def take_tex(ti):
        if ti in tex_map:
            return tex_map[ti]
        t = dict(pj["textures"][ti])
        im = pj["images"][t["source"]]
        v = pj["bufferViews"][im["bufferView"]]
        keep.append(bytes(pb[v.get("byteOffset", 0): v.get("byteOffset", 0) + v["byteLength"]]))
        rj["bufferViews"].append({"buffer": 0, "byteOffset": 0, "byteLength": 0})
        images.append({"bufferView": len(keep) - 1, "mimeType": im.get("mimeType", "image/png")})
        t["source"] = len(images) - 1
        textures.append(t)
        tex_map[ti] = len(textures) - 1
        return tex_map[ti]
    mat = {"name": pm.get("name", "mat")}
    got = []
    ppbr = pm.get("pbrMetallicRoughness") or {}
    pbr = {k: ppbr[k] for k in ("baseColorFactor", "metallicFactor", "roughnessFactor") if k in ppbr}
    for key in ("baseColorTexture", "metallicRoughnessTexture"):
        if key in ppbr:
            pbr[key] = dict(ppbr[key], index=take_tex(ppbr[key]["index"]))
            got.append(key)
    mat["pbrMetallicRoughness"] = pbr
    for key in ("normalTexture", "occlusionTexture", "emissiveTexture"):
        if key in pm:
            mat[key] = dict(pm[key], index=take_tex(pm[key]["index"]))
            got.append(key)
    for key in ("emissiveFactor", "alphaMode", "alphaCutoff", "doubleSided"):
        if key in pm:
            mat[key] = pm[key]
    rj["images"], rj["textures"], rj["materials"] = images, textures, [mat]
    if samplers:
        rj["samplers"] = samplers
    else:
        rj.pop("samplers", None)
    K.write_glb(rig_glb, rj, keep)
    return got


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("job_json")
    ap.add_argument("out_dir")
    ap.add_argument("--rig", default="D:/gen3d-spike/rig/rig.py")
    ap.add_argument("--timeout", type=float, default=1500)
    a = ap.parse_args()
    job = K.load_job(a.job_json)
    out = os.path.abspath(a.out_dir)
    parent = job.get("parent") or {}
    t0 = time.time()
    src = job["inputs"]["parent_glb"]
    glb = os.path.join(out, "model.glb")
    K.say("skeleton", "MIA đoán khớp mixamorig trên mesh %s" % ("đã có màu" if parent.get("kind") == "texture" else "trắng"))

    def on_line(line):
        if "GPU lock held" in line:
            K.say("skeleton", "chờ khoá GPU")
        elif "[rig]" in line and "skin" not in line.lower() and "verts" in line:
            K.say("skin", "dựng xương theo khung Mixamo + skin weights")

    code = K.run([sys.executable, a.rig, src, glb], a.timeout, on_line)
    if code:
        raise SystemExit("rig.py thoát mã %s" % code)
    K.say("skin", "gắn lại texture của model cha")
    grafted = graft_maps(src, glb)
    K.note("map gắn lại: %s" % (", ".join(grafted) or "không có"))
    K.shrink_glb(glb)
    K.render_thumb(glb, os.path.join(out, "thumb.png"))
    st = K.glb_stats(glb)
    rep = K.load_job(os.path.splitext(glb)[0] + ".json")
    stats = {"tris": st["tris"], "verts": st["verts"], "bones": 65, "bytes": os.path.getsize(glb), "seconds": round(time.time() - t0, 1),
             "vram_peak_mb": round(rep.get("vram_peak_gb", 0) * 1024) or None, "hip_scale_k": rep.get("hip_scale_k"),
             "maps": grafted, "gpu_wait_s": rep.get("sec_wait_lock")}
    K.write_result(out, {"glb": "model.glb", "thumb": "thumb.png"}, stats)
    return 0


if __name__ == "__main__":
    sys.exit(main())
