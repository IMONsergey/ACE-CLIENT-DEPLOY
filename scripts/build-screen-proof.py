#!/usr/bin/env python3
"""Normal-viewport comparison; never resize or crop the actual browser screenshots."""
import hashlib
import json
import math
import shutil
from collections import deque
from datetime import datetime, timezone, timedelta
from pathlib import Path
from PIL import Image, ImageDraw
from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT=Path('/home/sergey/Projects/ACE-CLIENT-DEPLOY')
DELIVERY=ROOT/'artifacts/client-delivery-20261109'
OUT=DELIVERY/'screen-proof'
SOURCE=Path('/home/sergey/Work/Inbox/ace-client-proof-20261109/desctop.png')
SOURCE_HASH='b07a311f575390ee0d2041f38f3e2822d1d30c28fe2a40ef4ddcb23f05b20776'
PDF=DELIVERY/'ACE-Проверка-логотипов.pdf'
BOXES={'spimex':(642,303,126,35),'butb':(589,386,105,52),'ets':(1240,499,85,50),'asia':(1353,498,155,41),'uzex':(1054,543,128,49),'irenex':(930,636,107,53),'ime':(1015,694,111,38),'emx':(662,728,129,57)}
NAMES={'spimex':'SPIMEX / Россия','butb':'BUTB / Беларусь','ets':'ETS / Казахстан','asia':'ASIA-EUROPE / Китай','uzex':'UzEx / Узбекистан','irenex':'IRENEX / Иран','ime':'IME / Иран','emx':'EMX / Египет'}

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()

def white_box(image,expected):
    x,y,w,h=expected
    left,top,right,bottom=math.floor(x)-16,math.floor(y)-16,math.ceil(x+w)+16,math.ceil(y+h)+16
    roi=image.crop((left,top,right,bottom)).convert('RGB');rw,rh=roi.size;p=roi.load()
    active={(xx,yy) for yy in range(rh) for xx in range(rw) if min(p[xx,yy])>185};largest=[]
    while active:
        seed=active.pop();q=deque([seed]);component=[seed]
        while q:
            xx,yy=q.popleft()
            for point in ((xx-1,yy),(xx+1,yy),(xx,yy-1),(xx,yy+1)):
                if point in active:active.remove(point);q.append(point);component.append(point)
        if len(component)>len(largest):largest=component
    assert largest
    xs=[p[0] for p in largest];ys=[p[1] for p in largest]
    return(left+min(xs),top+min(ys),max(xs)-min(xs)+1,max(ys)-min(ys)+1)

def fmt(n):return f'{n:.2f}'.replace('.',',').rstrip('0').rstrip(',')
def signed(n):return('+' if n>=0 else '')+fmt(n)

assert not PDF.exists(), 'Do not replace an existing PDF'
assert sha(SOURCE)==SOURCE_HASH
reference=Image.open(SOURCE).convert('RGB');assert reference.size==(2048,1302)
for key,box in BOXES.items():assert white_box(reference,box)==box,key
capture=json.loads((OUT/'capture.json').read_text());assert capture['status']=='passed'
screens=[]
for record in capture['screens']:
    vw,vh=record['viewport']['width'],record['viewport']['height']
    actual_path=Path(record['public']['screenshot']);actual=Image.open(actual_path).convert('RGB')
    assert actual.size==(vw,vh)
    rect=record['public']['geometry']['mapViewport'];scale=rect['width']/2048
    assert rect['width']==vw
    # One affine transform of the reference only. Actual viewport pixels remain untouched.
    affine=(1/scale,0,-rect['x']/scale,0,1/scale,-rect['y']/scale)
    projected=reference.transform((vw,vh),Image.Transform.AFFINE,affine,resample=Image.Resampling.BICUBIC,fillcolor=(235,240,242))
    mask=Image.new('L',(vw,vh),0);draw=ImageDraw.Draw(mask)
    bounds=(max(0,math.ceil(rect['x']-0.5)),max(0,math.ceil(rect['y']-0.5)),min(vw-1,math.floor(rect['x']+2048*scale-0.5)),min(vh-1,math.floor(rect['y']+1302*scale-0.5)))
    draw.rectangle(bounds,fill=255)
    overlay=Image.composite(Image.blend(projected,actual,0.5),actual,mask)
    projected.save(OUT/f'reference-{vw}x{vh}.png');overlay.save(OUT/f'overlay-{vw}x{vh}.png')
    dom={l['key']:l for l in record['public']['geometry']['logos']};assert set(dom)==set(BOXES)
    rows=[]
    for key,box in BOXES.items():
        expected=(rect['x']+box[0]*scale,rect['y']+box[1]*scale,box[2]*scale,box[3]*scale)
        b=dom[key];live=tuple(b[f] for f in ('x','y','width','height'));delta=tuple(live[i]-expected[i] for i in range(4))
        raster_ref=white_box(projected,expected);raster_live=white_box(actual,expected)
        raster_delta=tuple(raster_live[i]-raster_ref[i] for i in range(4))
        assert max(map(abs,delta))<=2.05*scale+0.06,(key,delta)
        assert max(map(abs,raster_delta))<=2,(key,raster_delta)
        rows.append({'key':key,'name':NAMES[key],'expected':expected,'actualDOM':live,'deltaDOM':delta,'projectedReferenceRaster':raster_ref,'actualRaster':raster_live,'deltaRaster':raster_delta})
    screens.append({'viewport':record['viewport'],'mapRect':rect,'scale':scale,'affine':affine,'actual':actual,'reference':projected,'overlay':overlay,'rows':rows,'maxPositionPx':max(abs(v) for row in rows for v in row['deltaDOM'][:2]),'maxBoxPx':max(abs(v) for row in rows for v in row['deltaDOM']),'maxRasterBoxPx':max(abs(v) for row in rows for v in row['deltaRaster']),'capture':record})

pdfmetrics.registerFont(TTFont('ProofSans','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('ProofSansBold','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
W,H=landscape(A3);M=42
c=canvas.Canvas(str(PDF),pagesize=(W,H),pageCompression=1)
c.setTitle('ACE. Логотипы на обычном экране');c.setAuthor('');c.setCreator('');c.setSubject('Сравнение в окнах браузера 1920x1080 и 1440x900 при масштабе 100%')
INK=colors.HexColor('#152A31');MUTED=colors.HexColor('#526971');TEAL=colors.HexColor('#067E8F');LINE=colors.HexColor('#D9E4E7');PALE=colors.HexColor('#F1F6F7')

def text(x,top,value,size=11,bold=False,color=INK):
    c.setFont('ProofSansBold' if bold else 'ProofSans',size);c.setFillColor(color);c.drawString(x,H-top-size*0.86,value)

def wrapped(x,top,value,width,size=10,leading=15):
    line='';lines=[]
    for word in value.split():
        trial=(line+' '+word).strip()
        if pdfmetrics.stringWidth(trial,'ProofSans',size)>width and line:lines.append(line);line=word
        else:line=trial
    if line:lines.append(line)
    for i,line in enumerate(lines):text(x,top+i*leading,line,size,color=MUTED)

def frame(img,x,top,width):
    height=width*img.height/img.width
    c.drawImage(ImageReader(img),x,H-top-height,width=width,height=height,mask='auto');c.setStrokeColor(LINE);c.setLineWidth(0.5);c.rect(x,H-top-height,width,height)

def header(title,subtitle,page):
    text(M,26,'ACE / СТРАНЫ-УЧАСТНИКИ',10,True,color=TEAL);text(M,49,title,27,True);text(M,88,subtitle,11,color=MUTED)
    c.setStrokeColor(LINE);c.setLineWidth(0.5);c.line(M,32,W-M,32)
    text(M,H-23,'Сверка положения всех 8 логотипов. Не является заявлением о попиксельном тождестве всей страницы.',8,color=MUTED)
    text(W-M-32,H-23,f'{page} / 4',8,color=MUTED)

for index,screen in enumerate(screens):
    vw,vh=screen['viewport']['width'],screen['viewport']['height'];iw=(W-2*M-24)/2
    header(f'Обычный экран: {vw} × {vh}',f'Масштаб браузера 100%. Снимок видимой области страницы, без захвата всей длинной секции. Все 8 логотипов видны.',index+1)
    scale_label=f'{screen["scale"]:.6f}'.replace('.',',').rstrip('0')
    text(M,116,f'МАКЕТ / единый масштаб ×{scale_label} по ширине',10,True)
    text(M+iw+24,116,'САЙТ / настоящий кадр окна браузера',10,True)
    frame(screen['reference'],M,137,iw);frame(screen['actual'],M+iw+24,137,iw)
    table_top=504
    text(M,table_top,f'Координаты в окне браузера, px. Максимальная разница положения: {fmt(screen["maxPositionPx"])} px.',11,True)
    widths=[215,177,190,142,175,207];factor=(W-2*M)/sum(widths);widths=[v*factor for v in widths]
    labels=['Логотип','Макет: x / y','Сайт: x / y','Разница: x / y','Макет: w × h','Сайт: w × h']
    y=table_top+25;c.setFillColor(PALE);c.rect(M,H-y-25,W-2*M,25,fill=1,stroke=0)
    x=M
    for label,width in zip(labels,widths):text(x+9,y+7,label,9,True);x+=width
    y+=25
    for n,row in enumerate(screen['rows']):
        if n%2==1:c.setFillColor(PALE);c.rect(M,H-y-25,W-2*M,25,fill=1,stroke=0)
        r=row['expected'];d=row['actualDOM'];delta=row['deltaDOM']
        values=[row['key'].upper() if row['key']!='asia' else 'ASIA-EUROPE',f'{fmt(r[0])} / {fmt(r[1])}',f'{fmt(d[0])} / {fmt(d[1])}',f'{signed(delta[0])} / {signed(delta[1])}',f'{fmt(r[2])} × {fmt(r[3])}',f'{fmt(d[2])} × {fmt(d[3])}']
        x=M
        for value,width in zip(values,widths):text(x+9,y+7,value,9);x+=width
        y+=25
    wrapped(M,768,'Эталон: предоставленный PNG 2048 × 1302. К нему применены только общий масштаб по ширине карты и положение всей карты в окне. Серая полоса сверху не проверяется: хедер отсутствует в эталоне. Снимок сайта не обрезан и не растянут.',W-2*M,9,13)
    date=datetime.fromisoformat(screen['capture']['public']['capturedAt'].replace('Z','+00:00')).astimezone(timezone(timedelta(hours=3))).strftime('%d.%m.%Y %H:%M:%S UTC+3')
    text(M,800,f'ace.imon.world/#countries · {capture["browser"]["name"]} {capture["browser"]["version"]} · viewport {vw}×{vh}, DPR 1, zoom 100% · {date}',8,color=MUTED)
    c.showPage()

for index,screen in enumerate(screens):
    vw,vh=screen['viewport']['width'],screen['viewport']['height']
    header(f'Наложение на экране {vw} × {vh}','50% макета + 50% сайта только внутри видимой карты. Хедер сохранен как контекст сайта, без сравнения.',index+3)
    width=min(W-2*M,638*vw/vh);frame(screen['overlay'],(W-width)/2,120,width)
    note=f'Все 8 логотипов проверены на этом разрешении. Разница DOM-положений: до {fmt(screen["maxPositionPx"])} px. Разница белых рамок, измеренных прямо на изображениях: до {screen["maxRasterBoxPx"]} px; погрешность сглаженного края около 1 px. '
    note+='Скриншот сохраняет обычный размер окна: скрытую ниже экрана часть карты не сжимали по высоте.'
    wrapped(M,773,note,W-2*M,9,13)
    c.showPage()
c.save()
preview=DELIVERY/'ACE-Экран-1920.png';assert not preview.exists();shutil.copyfile(Path(screens[0]['capture']['public']['screenshot']),preview)
proof={
    'status':'passed','method':'Actual normal browser viewport screenshots are untouched. Reference alone is projected with one uniform affine scale and whole-map translation, clipped by the same viewport. No individual logo alignment.',
    'sourceSha256':SOURCE_HASH,'captureSha256':sha(OUT/'capture.json'),'normalViewportScreens':[],
    'additional2048CoordinateCheck':{'maxPositionPx':1.328125,'role':'additional coordinate check only, not the main screen evidence'},
    'pdf':{'path':str(PDF),'bytes':PDF.stat().st_size,'sha256':sha(PDF),'pages':4},
    'preview':{'path':str(preview),'bytes':preview.stat().st_size,'sha256':sha(preview)},
}
for s in screens:
    proof['normalViewportScreens'].append({k:s[k] for k in ['viewport','mapRect','scale','affine','rows','maxPositionPx','maxBoxPx','maxRasterBoxPx'] }|{'publicScreenshotSha256':s['capture']['public']['sha256'],'packagedScreenshotSha256':s['capture']['package']['sha256'],'packagePixelIdentical':s['capture']['screenshotByteIdentical']})
(OUT/'screen-geometry-proof.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':'passed','pdf':proof['pdf'],'preview':proof['preview'],'screens':[{'viewport':s['viewport'],'maxPositionPx':s['maxPositionPx'],'maxRasterBoxPx':s['maxRasterBoxPx'],'packagePixelIdentical':s['capture']['screenshotByteIdentical']} for s in screens]},ensure_ascii=False))
