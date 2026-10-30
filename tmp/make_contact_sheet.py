from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
p=Path(r'C:\Users\Administrator\Desktop\Aventure\CardLens\output\synthetic_cards')
files=sorted(p.glob('card_*.png'))
out=Image.new('RGB',(1600,1000),'white')
d=ImageDraw.Draw(out)
f=ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf',20)
for i,x in enumerate(files):
    im=Image.open(x); im.thumbnail((360,155))
    xx=(i%4)*400+20; yy=(i//4)*200+10
    out.paste(im,(xx,yy+28)); d.text((xx,yy),x.stem,fill='black',font=f)
out.save(p/'contact_sheet.png')
