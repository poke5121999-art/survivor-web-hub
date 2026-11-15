import json, os
from PIL import Image, ImageDraw
cells=json.load(open('ref/cells.json'))
src={1:Image.open('ref/owner-weapons-sheet.png').convert('RGB'),2:Image.open('ref/owner-tools-sheet.png').convert('RGB')}
ours={1:Image.open('shots/sheet1-ours.png').convert('RGB'),2:Image.open('shots/sheet2-ours.png').convert('RGB')}
ids=json.load(open('ref/ids.json')) if os.path.exists('ref/ids.json') else {}
tiles=[]
for c in cells:
    r=tuple(c['rect']); a=src[c['sheet']].crop(r); b=ours[c['sheet']].crop(r)
    W,H=a.width,a.height
    im=Image.new('RGB',(W*2+6,H),(255,0,255)); im.paste(a,(0,0)); im.paste(b,(W+6,0))
    z=max(1,min(4,int(300/max(W,H)+0.99)))
    if z>1: im=im.resize((im.width*z,im.height*z),Image.LANCZOS)
    d=ImageDraw.Draw(im); d.text((3,3),'%02d %s'%(c['n'],ids.get(str(c['n']),'')),fill=(255,255,0))
    im.save('shots/compare/%02d.png'%c['n']); tiles.append(im)
per=12
for s in range(0,len(tiles),per):
    grp=tiles[s:s+per]; cols=3
    cw=max(t.width for t in grp); ch=max(t.height for t in grp); rows=(len(grp)+cols-1)//cols
    sh=Image.new('RGB',(cols*cw,rows*ch),(20,20,24))
    for i,t in enumerate(grp): sh.paste(t,((i%cols)*cw,(i//cols)*ch))
    sh.save('shots/compare/sheet-%02d-%02d.png'%(s+1,s+len(grp)))
print('ok')
