#!/usr/bin/env python3
"""Create reproducible logo-position evidence from original pixels and browser capture."""
import hashlib
import json
import math
from collections import deque
from datetime import datetime, timezone, timedelta
from pathlib import Path

from PIL import Image, ImageChops
from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path('/home/sergey/Projects/ACE-CLIENT-DEPLOY')
DELIVERY = ROOT / 'artifacts/client-delivery-20261109'
OUT = DELIVERY / 'visual-proof'
REFERENCE = Path('/home/sergey/Work/Inbox/ace-client-proof-20261109/desctop.png')
REFERENCE_HASH = 'b07a311f575390ee0d2041f38f3e2822d1d30c28fe2a40ef4ddcb23f05b20776'
PDF = DELIVERY / 'ACE-Проверка-логотипов.pdf'
ORDER = ['spimex', 'butb', 'ets', 'asia', 'uzex', 'irenex', 'ime', 'emx']
NAMES = {
    'spimex':'SPIMEX / Россия', 'butb':'BUTB / Беларусь', 'ets':'ETS / Казахстан',
    'asia':'ASIA-EUROPE EXCHANGE / Китай', 'uzex':'UzEx / Узбекистан',
    'irenex':'IRENEX / Иран', 'ime':'IME / Иран', 'emx':'EMX / Египет',
}
EXPECTED = {
    'spimex':(642,303,126,35), 'butb':(589,386,105,52), 'ets':(1240,499,85,50),
    'asia':(1353,498,155,41), 'uzex':(1054,543,128,49), 'irenex':(930,636,107,53),
    'ime':(1015,694,111,38), 'emx':(662,728,129,57),
}
CROPS = {
    'spimex':(545,210,320,220), 'butb':(481,302,320,220),
    'ets':(1122,414,320,220), 'asia':(1270,408,320,220),
    'uzex':(958,457,320,220), 'irenex':(823,552,320,220),
    'ime':(910,603,320,220), 'emx':(566,646,320,220),
}

def sha_file(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def white_box(image, expected, threshold=185):
    x,y,w,h = expected
    left,top,right,bottom = x-18,y-18,x+w+18,y+h+18
    roi = image.crop((left,top,right,bottom)).convert('RGB')
    rw,rh = roi.size
    pixels = roi.load()
    active = {(xx,yy) for yy in range(rh) for xx in range(rw) if min(pixels[xx,yy]) > threshold}
    largest = []
    while active:
        seed=active.pop(); q=deque([seed]); component=[seed]
        while q:
            xx,yy=q.popleft()
            for point in ((xx-1,yy),(xx+1,yy),(xx,yy-1),(xx,yy+1)):
                if point in active:
                    active.remove(point);q.append(point);component.append(point)
        if len(component)>len(largest):largest=component
    assert largest, 'No white card found'
    xs=[p[0] for p in largest];ys=[p[1] for p in largest]
    return (left+min(xs),top+min(ys),max(xs)-min(xs)+1,max(ys)-min(ys)+1)

def fmt(n):
    return f'{n:.2f}'.replace('.',',').rstrip('0').rstrip(',')

def signed(n):
    return ('+' if n>=0 else '')+fmt(n)

assert not PDF.exists(), 'Refuse to replace existing PDF'
assert sha_file(REFERENCE)==REFERENCE_HASH, 'Original reference SHA mismatch'
capture=json.loads((OUT/'capture.json').read_text())
assert capture['status']=='passed', 'Browser capture did not pass'
ref=Image.open(REFERENCE).convert('RGB')
raw=Image.open(OUT/'public-raw.png').convert('RGB')
packaged=Image.open(OUT/'package-raw.png').convert('RGB')
assert ref.size==(2048,1302)
assert raw.size==packaged.size and ImageChops.difference(raw,packaged).getbbox() is None, 'Unpacked ZIP does not render identically to public capture'
public=capture['captures']['public']
geometry=public['geometry']; section=geometry['section']
assert section['width']==2048 and section['height']==1302
fraction=geometry['documentTop']-math.floor(geometry['documentTop'])
if raw.size==(2048,1303):
    assert 0.9<fraction<1, 'Unexpected screenshot clip origin: inspect manually'
    crop_top=1
elif raw.size==(2048,1302):
    assert fraction<0.001, 'Unexpected fractional clip with exact size'
    crop_top=0
else:
    raise AssertionError(f'Unexpected raw capture size {raw.size}')
actual=raw.crop((0,crop_top,2048,crop_top+1302))
actual.save(OUT/'public-normalized.png')
overlay=Image.blend(ref,actual,0.5)
overlay.save(OUT/'overlay.png')

dom={item['key']:item for item in geometry['logos']}
assert set(dom)==set(ORDER)
rows=[]
for key in ORDER:
    measured=white_box(ref,EXPECTED[key])
    assert measured==EXPECTED[key], f'Independent reference measurement changed: {key} {measured}'
    live_raster=white_box(actual,EXPECTED[key])
    box=dom[key]
    live_dom=tuple(box[field] for field in ('x','y','width','height'))
    delta=tuple(live_dom[i]-measured[i] for i in range(4))
    raster_delta=tuple(live_raster[i]-measured[i] for i in range(4))
    assert max(map(abs,delta))<=2.05, f'Geometry mismatch: {key}'
    assert max(map(abs,raster_delta))<=1, f'Visible raster card mismatch: {key}'
    rows.append({'key':key,'name':NAMES[key],'referenceRaster':measured,'publicDOM':live_dom,'deltaDOM':delta,'publicRaster':live_raster,'deltaRaster':raster_delta,'crop':CROPS[key]})

max_position=max(abs(v) for row in rows for v in row['deltaDOM'][:2])
max_box=max(abs(v) for row in rows for v in row['deltaDOM'])
max_raster=max(abs(v) for row in rows for v in row['deltaRaster'])
captured=datetime.fromisoformat(public['capturedAt'].replace('Z','+00:00')).astimezone(timezone(timedelta(hours=3))).strftime('%d.%m.%Y %H:%M:%S UTC+3')
proof={
    'status':'passed','reference':{'path':str(REFERENCE),'sha256':REFERENCE_HASH,'size':ref.size},
    'public':{'url':public['url'],'capturedAt':public['capturedAt'],'sha256':sha_file(OUT/'public-raw.png'),'rawSize':raw.size,'browser':capture['browser'],'viewport':capture['viewport'],'deviceScaleFactor':1},
    'normalization':{'cropTopRows':crop_top,'resizeApplied':False,'individualLogoTransformApplied':False,'documentClipFraction':fraction,'note':'A single whole-frame crop removes the outward screenshot clip rounding. No logo is translated, scaled, warped or retouched.'},
    'method':{'rasterThreshold':'min(R,G,B)>185','component':'largest 4-connected white region in fixed reference ROI','uncertaintyPx':1,'DOMCoordinates':'relative to the same 2048x1302 section origin'},
    'logos':rows,'maxPositionDeltaPx':max_position,'maxBoxDeltaPx':max_box,'maxRasterBoxDeltaPx':max_raster,
    'packagedScreenshotPixelIdenticalToPublished':True,
    'captureReportSha256':sha_file(OUT/'capture.json'),
}

pdfmetrics.registerFont(TTFont('ProofSans','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('ProofSansBold','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
W,H=landscape(A3)
c=canvas.Canvas(str(PDF),pagesize=(W,H),pageCompression=1)
c.setTitle('ACE. Проверка положения логотипов')
c.setAuthor('')
c.setSubject('Сопоставление исходного макета и опубликованной верстки')
c.setCreator('')
INK=colors.HexColor('#152A31'); MUTED=colors.HexColor('#526971'); TEAL=colors.HexColor('#067E8F'); LINE=colors.HexColor('#D9E4E7'); PALE=colors.HexColor('#F1F6F7')
M=42

def text(x,top,value,size=11,bold=False,color=INK):
    c.setFont('ProofSansBold' if bold else 'ProofSans',size)
    c.setFillColor(color)
    c.drawString(x,H-top-size*0.86,value)

def wrapped(x,top,value,width,size=10,leading=15,color=MUTED):
    words=value.split();lines=[];line=''
    for word in words:
        next_line=(line+' '+word).strip()
        if pdfmetrics.stringWidth(next_line,'ProofSans',size)>width and line:
            lines.append(line);line=word
        else:line=next_line
    if line:lines.append(line)
    for i,line in enumerate(lines):text(x,top+i*leading,line,size,color=color)
    return top+len(lines)*leading

def frame(image,x,top,width,height=None):
    if height is None:height=width*image.height/image.width
    c.drawImage(ImageReader(image),x,H-top-height,width=width,height=height,mask='auto')
    c.setStrokeColor(LINE);c.setLineWidth(0.5);c.rect(x,H-top-height,width,height)
    return height

def header(title,subtitle,page):
    c.setFillColor(colors.white);c.rect(0,0,W,H,fill=1,stroke=0)
    text(M,26,'ACE / СТРАНЫ-УЧАСТНИКИ',10,True,color=TEAL)
    text(M,49,title,27,True)
    text(M,88,subtitle,11,color=MUTED)
    c.setStrokeColor(LINE);c.setLineWidth(0.5);c.line(M,32,W-M,32)
    text(M,H-23,'Проверка геометрии логотипов. Различия цвета и растеризации текста не означают смещение.',8,color=MUTED)
    text(W-M-32,H-23,f'{page} / 6',8,color=MUTED)

# 1. Complete screenshots and numerical measurements.
header('Положение всех 8 логотипов',f'Максимальная разница координат: {fmt(max_position)} px. Погрешность растровой границы: около 1 px.',1)
iw=(W-2*M-24)/2
text(M,116,'МАКЕТ / предоставленный PNG 2048 × 1302',10,True)
text(M+iw+24,116,'САЙТ / реальный снимок браузера',10,True)
frame(ref,M,137,iw)
frame(actual,M+iw+24,137,iw)
table_top=504
text(M,table_top,'Координаты относительно левого верхнего угла карты, px',11,True)
colwidth=[215,177,190,142,175,207]
scale=(W-2*M)/sum(colwidth);colwidth=[v*scale for v in colwidth]
headers=['Логотип','Макет: x / y','Сайт: x / y','Разница: x / y','Макет: w × h','Сайт: w × h']
y=table_top+25
c.setFillColor(PALE);c.rect(M,H-y-25,W-2*M,25,fill=1,stroke=0)
x=M
for label,width in zip(headers,colwidth):text(x+9,y+7,label,9,True);x+=width
y+=25
for n,row in enumerate(rows):
    if n%2==1:
        c.setFillColor(PALE);c.rect(M,H-y-25,W-2*M,25,fill=1,stroke=0)
    r=row['referenceRaster'];d=row['publicDOM'];delta=row['deltaDOM']
    values=[row['key'].upper() if row['key']!='asia' else 'ASIA-EUROPE',f'{r[0]} / {r[1]}',f'{fmt(d[0])} / {fmt(d[1])}',f'{signed(delta[0])} / {signed(delta[1])}',f'{r[2]} × {r[3]}',f'{fmt(d[2])} × {fmt(d[3])}']
    x=M
    for value,width in zip(values,colwidth):text(x+9,y+7,value,9);x+=width
    y+=25
wrapped(M,768,'Макет: рамки белых карточек, измеренные по пикселям. Сайт: DOM-рамки тех же изображений. Это разные способы измерения с субпиксельным сглаживанием; таблица не заявляет попиксельное тождество.',W-2*M,9,13)
text(M,800,f'Источник сайта: ace.imon.world/#countries · {capture["browser"]["name"]} {capture["browser"]["version"]} · {captured}',8,color=MUTED)
c.showPage()

# 2. One global overlay. No per-logo alignment.
header('Общее наложение 50/50','Один общий кадр. Ни один логотип не перемещен, не растянут и не выровнен отдельно.',2)
ow=1000
frame(overlay,(W-ow)/2,119,ow)
note=(f'Исходный снимок сайта: {raw.width} × {raw.height}. Для общего начала координат удалена {crop_top} верхняя строка внешнего округления clip; масштаб изображения не менялся. ' if crop_top else 'Исходный снимок сайта использован без обрезки и изменения масштаба. ')
note+='Область сравнения: 2048 × 1302. Распакованный архив дает тот же кадр, что и опубликованный сайт.'
wrapped(M,773,note,W-2*M,9,13)
c.showPage()

# 3-6. The exact same geographic crops from each input and the overlay.
for page_index in range(4):
    start=page_index*2
    header(f'Детальное сравнение {start+1:02d}–{start+2:02d}','Одинаковые окна 320 × 220 px и одинаковый масштаб во всех трех колонках.',page_index+3)
    colx=[M,M+380,M+760]
    for x,label in zip(colx,['МАКЕТ','САЙТ','НАЛОЖЕНИЕ 50/50']):text(x,116,label,10,True)
    for slot,row in enumerate(rows[start:start+2]):
        top=145+slot*324
        text(M,top,f'{start+slot+1:02d}   {row["name"]}',15,True)
        x,y,w,h=row['crop'];bounds=(x,y,x+w,y+h)
        for ix,source in enumerate([ref,actual,overlay]):frame(source.crop(bounds),colx[ix],top+29,330)
        d=row['deltaDOM'];r=row['referenceRaster'];p=row['publicRaster']
        text(M,top+270,f'Белая карточка в макете: {r[0]}, {r[1]}, {r[2]} × {r[3]} px',10)
        text(M+380,top+270,f'Белая карточка на сайте: {p[0]}, {p[1]}, {p[2]} × {p[3]} px',10)
        text(M+760,top+270,f'Смещение DOM: x {signed(d[0])} px / y {signed(d[1])} px',10,True)
        text(M,top+290,f'Общее окно: x {x}, y {y}, ширина {w}, высота {h}. География вокруг карточки сохранена.',9,color=MUTED)
    wrapped(M,780,'Белые карточки дополнительно измерены прямо на снимках: min(R,G,B) > 185, крупнейшая связная область. Максимальная разница растровых рамок всех 8 карточек: 1 px. Сглаженные границы имеют неопределенность около 1 px.',W-2*M,9,13)
    c.showPage()

c.save()
proof['pdf']={'path':str(PDF),'sha256':sha_file(PDF),'bytes':PDF.stat().st_size,'pages':6}
(OUT/'logo-position-proof.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'status':'passed','pdf':str(PDF),'bytes':PDF.stat().st_size,'sha256':sha_file(PDF),'maxPositionDeltaPx':max_position,'maxRasterBoxDeltaPx':max_raster,'cropTopRows':crop_top,'packagePixelIdentical':True},ensure_ascii=False))
