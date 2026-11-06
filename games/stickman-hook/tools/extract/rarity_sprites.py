"""Rarity holders (ShopHolder / ShopLocked / XpRoadHolder / CardHolder share one name across rarities): saved as
<Name>_<rarity>.png into the page_sprites.py folder, with their meta.
    py -3 -I rarity_sprites.py <outdir>
"""
import sys, os, json
import UnityPy
AND = r'D:/stickman-hook-ref/apk/assets/aa/Android/'
out = sys.argv[1]
meta_path = os.path.join(out, 'meta.json')
meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
for f in sorted(os.listdir(AND)):
    if not f.startswith('defaultlocalgroup_assets_rarities_'): continue
    rarity = f.split('_')[3]
    env = UnityPy.load(AND + f)
    for o in env.objects:
        if o.type.name != 'Sprite': continue
        d = o.read(); n = d.m_Name + '_' + rarity
        img = d.image; img.save(os.path.join(out, n + '.png'))
        meta[n] = {'w': img.width, 'h': img.height, 'border': [round(d.m_Border.x), round(d.m_Border.y), round(d.m_Border.z), round(d.m_Border.w)],
                   'bundle': f.rsplit('_', 1)[0].replace('defaultlocalgroup_assets_', '')}
        print(n, img.size)
json.dump(meta, open(meta_path, 'w'), indent=0)
