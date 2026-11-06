import sys, io, re, contextlib
sys.path.insert(0, r'D:/stickman-hook-ref/tools')
import arm_method as A

NOISE = ('#0xff2170', '#0xff2034', '#0xff1f04')
for cls in sys.argv[1:]:
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        for ad, n in A.M:
            if n.startswith(cls + '$$'):
                print('====', n, hex(ad)); A.disasm(ad)
    lines = [l for l in buf.getvalue().splitlines() if not any(x in l for x in NOISE)]
    open(rf'D:/stickman-hook-ref/dump/asm/{cls}.s', 'w', encoding='utf-8').write('\n'.join(lines))
    print(cls, len(lines))
