"""Cut FSB5 blobs out of sharedassets0.resource per AudioClip json. Usage: export_audio.py DUMP_JSON RESOURCE OUT_DIR"""
import sys, json, os
recs = json.load(open(sys.argv[1])); res = open(sys.argv[2], 'rb').read(); out = sys.argv[3]
os.makedirs(out, exist_ok=True)
for r in recs:
    if r['type'] == 'AudioClip':
        d = r['data']; m = d['m_Resource']
        open(os.path.join(out, d['m_Name'] + '.fsb'), 'wb').write(res[m['m_Offset']:m['m_Offset'] + m['m_Size']])
        print(d['m_Name'])
