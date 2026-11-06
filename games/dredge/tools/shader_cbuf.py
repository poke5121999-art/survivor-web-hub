"""Tên biến cbuffer / texture của shader đã tuần tự hoá trong bundle (bổ trợ cho bản rã DXBC của tools/env.py --dis, tools/particles.py --dis).

    python -I games/dredge/tools/shader_cbuf.py [Tên_Shader ...]      (mặc định: Water_Shader FloatingParticle_Shader)

Ra: D:/dredge-ref/cache/particles/shaders/<Tên>.cbuf.txt — mỗi dòng "cN.k tên dimD" của $Globals, UnityPerMaterial, UnityPerDraw... và "tN tên"
cho texture, lấy từ SerializedPass.m_NameIndices + SerializedProgram.m_CommonParameters (Unity 2021.3). Đọc cùng bản rã: "cb0[126]" trong DXBC
ứng với dòng "c126.0" của chính shader đó.

[BẪY ĐÃ SẬP] bố cục $Globals KHÁC NHAU giữa các shader: Water_Shader có _ShallowColor c126, _DeepColor c127, _FoamColor c128, _WorldSize c132;
FloatingParticle_Shader có _WorldSize c128. Không được suy "cb0[126] của shader A = cb0[126] của shader B".
[BẪY] m_CommonParameters chỉ chứa tham số chung mọi biến thể; tham số riêng của một biến thể (vd. màu FoamColoured của FloatingParticle ở
c126) không có tên trong bản 1.5.3 (m_Parameters của subprogram rỗng) — phải đoán theo tên công tắc + đo ảnh, ghi [ĐỀ XUẤT].
Chạy lại cho cùng kết quả (chỉ đọc bundle). Tìm bundle chứa shader theo thứ tự tên; mất ~2 phút cho FloatingParticle (bundle itemdata).
"""
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')
DATA = os.environ.get('DREDGE_DATA', r'D:\dredge-ref\game\DREDGE.v1.5.3_LinkNeverDie.Com\DREDGE_Data')
AA = os.path.join(DATA, 'StreamingAssets', 'aa', 'StandaloneWindows')
OUT = r'D:\dredge-ref\cache\particles\shaders'
# bundle đã biết chứa shader (đỡ quét cả 113 bundle)
KNOWN = {'Water_Shader': 'gamescene_scenes_all_a6b10fb3c7f62093a9317419ae755456.bundle',
         'FloatingParticle_Shader': 'itemdata_assets_all_dd836e48bc36d21a77674a8ce00667d3.bundle'}


def dump(s):
    p = s.m_ParsedForm.m_SubShaders[0].m_Passes[0]
    names = {}
    for kv in p.m_NameIndices:
        k, v = (kv[0], kv[1]) if isinstance(kv, (tuple, list)) else (kv.first, kv.second)
        names[v] = k
    lines = []
    for kind in ('progVertex', 'progFragment'):
        P = getattr(p, kind).m_CommonParameters
        lines.append('== %s' % kind)
        for cb in P.m_ConstantBuffers:
            lines.append('cbuffer %s' % names.get(cb.m_NameIndex))
            for vp in sorted(cb.m_VectorParams, key=lambda v: v.m_Index):
                lines.append('  c%d.%d %s dim%d' % (vp.m_Index // 16, (vp.m_Index % 16) // 4, names.get(vp.m_NameIndex), vp.m_Dim))
            for mp in sorted(cb.m_MatrixParams, key=lambda v: v.m_Index):
                lines.append('  c%d %s (matrix)' % (mp.m_Index // 16, names.get(mp.m_NameIndex)))
        for t in P.m_TextureParams:
            lines.append('  t%d %s' % (t.m_Index, names.get(t.m_NameIndex)))
    return '\n'.join(lines) + '\n'


def main():
    import UnityPy
    want = sys.argv[1:] or ['Water_Shader', 'FloatingParticle_Shader']
    os.makedirs(OUT, exist_ok=True)
    for name in want:
        order = ([KNOWN[name]] if name in KNOWN else []) + sorted(b for b in os.listdir(AA) if b.endswith('.bundle'))
        done = False
        for b in order:
            env = UnityPy.load(os.path.join(AA, b))
            for o in env.objects:
                if o.type.name != 'Shader':
                    continue
                s = o.read()
                if s.m_ParsedForm.m_Name.split('/')[-1] != name:
                    continue
                fn = os.path.join(OUT, name + '.cbuf.txt')
                with open(fn, 'w', encoding='utf-8', newline='\n') as fh:
                    fh.write('// %s (%s)\n' % (s.m_ParsedForm.m_Name, b) + dump(s))
                print('cbuf', fn)
                done = True
                break
            if done:
                break
        if not done:
            print('không thấy shader', name)


if __name__ == '__main__':
    main()
