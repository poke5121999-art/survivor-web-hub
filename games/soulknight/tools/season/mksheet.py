import io,os,re,sys
from PIL import Image, ImageDraw
root=os.path.expanduser('~/Downloads/sk-ref/all')
out,bre,nre,cell,cols=sys.argv[1],sys.argv[2].replace(',','|'),sys.argv[3].replace(',','|'),int(sys.argv[4]),int(sys.argv[5])
rows=[l.rstrip('\n').split('\t') for l in io.open(root+'/manifest.tsv',encoding='utf-8')]
rows=[r for r in rows if re.search(bre,r[0]) and re.search(nre,r[1])]
n=len(rows); R=(n+cols-1)//cols; lab=10
im=Image.new('RGB',(cols*cell,R*(cell+lab)),(60,60,80)); d=ImageDraw.Draw(im)
for i,r in enumerate(rows):
    p=os.path.join(root,r[0],r[1]+'.png')
    try: s=Image.open(p).convert('RGBA')
    except Exception: continue
    k=min(cell/s.width,cell/s.height); k=max(1,int(k)) if k>=1 else k
    s=s.resize((max(1,int(s.width*k)),max(1,int(s.height*k))),Image.NEAREST)
    x=(i%cols)*cell; y=(i//cols)*(cell+lab)
    im.paste(s,(x+(cell-s.width)//2,y+(cell-s.height)//2),s)
    d.text((x+1,y+cell),r[1][:cell//5],fill=(255,255,0))
im.save(out); print(n,out,im.size)
