from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
from pathlib import Path
import random, json, math, zipfile

OUT=Path(r"C:\Users\Administrator\Desktop\Aventure\CardLens\output\synthetic_cards")
OUT.mkdir(parents=True,exist_ok=True)
random.seed(71)

people=[
('Avery Sample','Field Engineer'),('Morgan Example','Sales Director'),('Riley Placeholder','Operations Manager'),('Casey Test','Account Executive'),('Jordan Fiction','Aviation Consultant'),('Taylor Demo','Product Designer'),('Quinn Sample','Logistics Lead'),('Rowan Example','Project Manager'),('Skyler Placeholder','Systems Analyst'),('Parker Test','Regional Manager'),('Drew Fiction','Technical Advisor'),('Reese Sample','Business Development'),('Cameron Example','Service Coordinator'),('Finley Placeholder','Quality Specialist'),('Emerson Test','Research Associate'),('Sage Fiction','Customer Success Lead'),('Dakota Sample','Commercial Pilot'),('Robin Example','Workshop Manager'),('Ellis Placeholder','Data Engineer'),('Jamie Test','Training Coordinator')]
companies=['Northwind Demo Labs','Blue Harbor Sample Co','Cedarline Test Works','Copper Finch Example','Atlas Field Demo','Brightpath Sample Studio','Mosaic Test Partners','Orchard Lane Demo','Silver Kite Example','Juniper Sample Systems','Redwood Test Group','Clearwater Demo Works','Pinecrest Example Studio','Lighthouse Sample Tech','Daybreak Test Services','Maple Orbit Demo','Summit Sample Aviation','Fable Creek Test Co','OpenSky Example Labs','Westbridge Demo Group']
styles=[
 ('Clean ivory', '#F8F6F1','#152536','#2D6678','normal',0),('Navy corporate','#10233D','#FFFFFF','#68D4D1','normal',1),('Warm minimal','#FFF7E8','#1D1D1D','#9A552D','normal',-1),('Forest green','#173C35','#F7F3E8','#E8C36A','normal',0),
 ('Soft blue','#EAF4FB','#172C46','#2874A6','normal',0),('Charcoal','#22252B','#F7F7F7','#F2A65A','rotate',-5),('Slate','#3C4A55','#FFFFFF','#A8DADC','rotate',5),('Lilac minimal','#F2EEFA','#28213B','#8067A8','blur',0),
 ('Coral','#FFF1EB','#2E2523','#D65A48','blur',0),('Low contrast gray','#D8D8D8','#999999','#777777','lowcontrast',0),('Black and white','#FFFFFF','#111111','#111111','rotate',3),('Sandstone','#EDE0CC','#3A3025','#8B5E3C','perspective',0),
 ('Deep teal','#073B4C','#FFFFFF','#FFD166','perspective',0),('Two-column white','#FFFFFF','#222222','#217C78','columns',0),('Classic serif','#F8F5EF','#292520','#7A4132','serif',0),('High contrast yellow','#FFF4B8','#111111','#BB3E03','rotate',-3),
 ('Narrow type','#FAFAFA','#252525','#4D7C0F','small',0),('Purple gradient-like','#E8E2F4','#221A36','#5E548E','noise',0),('Photo shadow','#F3F2EC','#1A1A1A','#315A6D','shadow',0),('Blurred angled','#FCF8EE','#222222','#A34932','blurrotate',4)
]
arial=r'C:\Windows\Fonts\arial.ttf'; bold=r'C:\Windows\Fonts\arialbd.ttf'; italic=r'C:\Windows\Fonts\ariali.ttf'; serif=r'C:\Windows\Fonts\times.ttf'
def ft(path,size):
    try:return ImageFont.truetype(path,size)
    except:return ImageFont.load_default()

manifest=[]
for i,((name,title),(company),(label, bg, fg, accent, mode, angle)) in enumerate(zip(people,companies,styles),1):
    card=Image.new('RGB',(1050,600),bg); d=ImageDraw.Draw(card)
    fpath=serif if mode=='serif' else bold
    fs=40 if mode not in ('small',) else 29
    fperson=ft(fpath,fs); ftitle=ft(italic if mode=='serif' else arial,26 if fs>30 else 22)
    fcompany=ft(bold,30 if fs>30 else 25); fcontact=ft(arial,26 if fs>30 else 22); ftag=ft(bold,17)
    # A few layouts intentionally vary hierarchy and column positions.
    if mode=='columns':
        d.rounded_rectangle((45,55,350,545),radius=30,fill=accent)
        d.text((80,110),'SYNTHETIC',font=ft(bold,23),fill='white')
        d.text((80,270),company,font=ft(bold,32),fill='white')
        d.text((405,125),name,font=fperson,fill=fg)
        d.text((405,190),title,font=ftitle,fill=fg)
        x,y=405,310
    else:
        d.rounded_rectangle((0,0,18,600),radius=8,fill=accent)
        d.text((65,75),company,font=fcompany,fill=accent)
        d.line((65,128,985,128),fill=accent,width=3)
        d.text((65,180),name,font=fperson,fill=fg)
        d.text((67,239),title,font=ftitle,fill=fg)
        x,y=67,340
    email=name.lower().replace(' ',' .').replace(' .','.')+'@example.test'
    phone=f'+1 202-555-{100+i:04d}'
    website=f'www.sample{i:02d}.example.test'
    loc=['Karachi, Pakistan','Dubai, UAE','London, UK','Toronto, Canada','Doha, Qatar'][i%5]
    rows=[f'Email: {email}',f'Tel: {phone}',website,loc]
    for row in rows:
        d.text((x,y),row,font=fcontact,fill=fg); y+=48 if fs>30 else 39
    d.text((760,545),'SYNTHETIC TEST',font=ftag,fill=accent)
    if mode=='small':
        card=card.resize((780,445),Image.Resampling.LANCZOS)
        canvas=Image.new('RGB',(1050,600),'#C6C6C6'); canvas.paste(card,(135,78)); card=canvas
    if mode in ('rotate','blurrotate'):
        canvas=Image.new('RGB',(1200,760),'#D6D3CE'); card2=card.rotate(angle,expand=True,resample=Image.Resampling.BICUBIC,fillcolor='#D6D3CE'); canvas.paste(card2,((1200-card2.width)//2,(760-card2.height)//2)); card=canvas
    elif mode=='perspective':
        canvas=Image.new('RGB',(1200,760),'#D9D8D2')
        src=card
        w,h=src.size; target=((40,75),(w-5,20),(w-35,h-25),(75,h-5))
        # PIL QUAD maps the output rectangle into this source quadrilateral.
        warped=src.transform((w,h),Image.Transform.QUAD,(target[0][0],target[0][1],target[3][0],target[3][1],target[2][0],target[2][1],target[1][0],target[1][1]),Image.Resampling.BICUBIC)
        canvas.paste(warped,(70,30)); card=canvas
    elif mode=='shadow':
        canvas=Image.new('RGB',(1200,760),'#E6E3DD')
        shadow=Image.new('RGBA',(1090,640),(0,0,0,0)); sd=ImageDraw.Draw(shadow); sd.rounded_rectangle((25,25,1060,615),radius=20,fill=(0,0,0,75)); shadow=shadow.filter(ImageFilter.GaussianBlur(22)); canvas.paste(shadow,(45,55),shadow); canvas.paste(card,(75,80)); card=canvas
    elif angle and mode not in ('small',):
        card=card.rotate(angle,expand=False,resample=Image.Resampling.BICUBIC,fillcolor=bg)
    if mode in ('blur','blurrotate'):
        card=card.filter(ImageFilter.GaussianBlur(1.1 if mode=='blur' else 2.0))
    if mode=='lowcontrast': card=ImageEnhance.Contrast(card).enhance(.58)
    if mode=='noise':
        import numpy as np
        a=np.asarray(card).astype('int16'); n=np.random.default_rng(i).normal(0,5,a.shape[:2])[:,:,None]; card=Image.fromarray(np.uint8(np.clip(a+n,0,255)))
    if i in (6,7,11,12,13,16,19,20): card=card.resize((1000,650),Image.Resampling.LANCZOS)
    path=OUT/f'card_{i:02d}_{mode}.png'; card.save(path,optimize=True)
    manifest.append({'id':f'SYN-{i:02d}','file':path.name,'condition':label,'name':name,'title':title,'company':company,'email':email,'phone':phone,'website':website,'location':loc,'mode':mode})
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
zip_path=OUT.parent/'Lead71_20_Synthetic_Business_Cards.zip'
with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted(OUT.glob('*')): z.write(f,f.name)
print(f'Generated {len(manifest)} cards in {OUT}; archive {zip_path}')
