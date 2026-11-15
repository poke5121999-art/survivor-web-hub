import json, numpy as np
from PIL import Image, ImageDraw
A=Image.open('ref/owner-weapons-sheet.png').convert('RGB'); a=np.array(A).astype(int)
rows=[((10,178),[80,185,290,366,441,527,628,722,816,916,1018,1118,1195,1272,1350,1428]),
((185,410),[35,125,222,308,405,500,585,680,745,830,930,1020,1140,1250,1320,1410]),
((420,605),[38,110,182,255,326,403,480,550,620,700,772,840,915,987,1053,1122,1210,1302,1410]),
((618,718),[100,345,610,870,1120,1280,1408])]
cells=[];n=1
for (y0,y1),cs in rows:
    xs=[0]+[(cs[i]+cs[i+1])//2 for i in range(len(cs)-1)]+[A.width]
    for i in range(len(cs)):
        x0,x1=xs[i],xs[i+1]
        sub=a[y0:y1,x0:x1]
        lum=sub.mean(2); sat=sub.max(2)-sub.min(2)
        # background estimate: median per row of the cell
        bg=np.median(sub.reshape(-1,3),axis=0)
        d=np.abs(sub-bg).max(2)
        m=(d>38)
        ys,xx=np.where(m)
        if len(ys)<20: bb=(x0,y0,x1,y1)
        else: bb=tuple(int(v) for v in (x0+xx.min(),y0+ys.min(),x0+xx.max()+1,y0+ys.max()+1))
        cells.append(dict(n=n,sheet=1,rect=[x0,y0,x1,y1],bbox=list(bb)))
        n+=1
S2=Image.open('ref/owner-tools-sheet.png').convert('RGB')
r2=[(290,60,640,650),(630,115,870,410),(900,235,1190,310),(1300,270,1520,395),(1620,280,1790,450),(1120,400,1400,515),(700,455,1000,655),(1520,455,1720,635),(870,565,1220,780),(1270,690,1430,895),(1290,545,1820,945),(520,715,830,880),(220,640,390,865),(140,475,400,645)]
for r in r2:
    cells.append(dict(n=n,sheet=2,rect=list(r),bbox=list(r))); n+=1
OV={25:(1,None,None,None,385),30:(1228,None,None,None,None),42:(688,472,720,572,None),56:(1045,None,None,None,None)}
for c in cells:
    if c['n']==25: c['bbox'][3]=385
    if c['n']==27: c['bbox'][3]=385
    if c['n']==30: c['bbox'][0]=1228
    if c['n']==42: c['bbox']=[688,472,722,572]
    if c['n']==56: c['bbox'][0]=1045
dbg=A.copy(); d=ImageDraw.Draw(dbg)
for c in cells:
    im=A if c['sheet']==1 else S2
    im.crop(tuple(c['rect'])).save('ref/cells/%02d.png'%c['n'])
    if c['sheet']==1: d.rectangle(c['bbox'],outline=(255,0,255))
dbg.save('ref/bbox-debug.png')
json.dump(cells,open('ref/cells.json','w'))
open('lib/sheet-layout.js','w').write('export default '+json.dumps(cells)+';\n')
print(len(cells))
