"""Write the game's own shaders (MyShaders/*) as the GLSL ES 3 the Android build runs, for js/materials.js to follow.

Usage: PYTHONIOENCODING=utf-8 py -3.12 dump_shaders.py
Writes games/fish-bowl/tools/shaders/<name>.glsl: the Forward pass's first vertex + fragment program (uniform block and
main), straight from Shader.compressedBlob (LZ4, platform GLES3 = the first blob). The shader source is not in the
build; these compiled programs are the ground truth for blend formulas (UnlitMatCap is additive, not a multiply).
"""
import os, re
import lz4.block
import UnityPy

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "shaders")
DATA = os.path.join(os.environ.get("FL_REF", "D:/fishlife-ref"), "data", "sharedassets2.assets")


def main():
    os.makedirs(OUT, exist_ok=True)
    for o in UnityPy.load(DATA).objects:
        if o.type.name != "Shader":
            continue
        d = o.read()
        name = d.m_ParsedForm.m_Name if d.m_ParsedForm else ""
        if not name.startswith("MyShaders/"):
            continue
        blob = bytes(d.compressedBlob)
        txt = lz4.block.decompress(blob[d.offsets[0][0]:d.offsets[0][0] + d.compressedLengths[0][0]],
                                   uncompressed_size=d.decompressedLengths[0][0]).decode("latin1")
        parts = []
        for stage in ("VERTEX", "FRAGMENT"):
            i = txt.find(f"#ifdef {stage}")
            j = txt.find("#endif", txt.find("void main()", i))
            prog = txt[i:j]
            prog = re.sub(r"\n#if HLSLCC_ENABLE_UNIFORM_BUFFERS.*?#endif\n", "\n", prog, flags=re.S)
            parts.append(prog.strip())
        path = os.path.join(OUT, name.split("/")[-1] + ".glsl")
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(f"// {name}: Forward pass, GLES3, first variant\n" + "\n\n".join(parts) + "\n")
        print(name, os.path.getsize(path))


if __name__ == "__main__":
    main()
