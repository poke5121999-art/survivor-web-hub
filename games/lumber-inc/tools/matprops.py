"""py -3.12 matprops.py <material-name>...: dump saved properties and keywords of materials with those names."""
import sys, json
import lm
names = set(sys.argv[1:])
seen = set()
for o in lm.load().objects:
    if o.type.name == "Material":
        m = o.read()
        if m.m_Name in names and m.m_Name not in seen:
            seen.add(m.m_Name)
            sp = m.m_SavedProperties
            try: sh = m.m_Shader.read().m_ParsedForm.m_Name
            except Exception: sh = "?"
            print("==", m.m_Name, sh, getattr(m, "m_ValidKeywords", None) or m.m_ShaderKeywords)
            print(" floats", {k: round(v, 4) for k, v in sp.m_Floats})
            print(" colors", {k: [round(v.r, 3), round(v.g, 3), round(v.b, 3), round(v.a, 3)] for k, v in sp.m_Colors})
            print(" tex", {k: (t.m_Texture.read().m_Name if t.m_Texture.m_PathID else None) for k, t in sp.m_TexEnvs})
