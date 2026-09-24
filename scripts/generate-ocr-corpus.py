from PIL import Image, ImageDraw, ImageFont, ImageFilter
import json, pathlib
root=pathlib.Path('validation/ocr');root.mkdir(parents=True,exist_ok=True)
fontpath='C:/Windows/Fonts/arial.ttf'
cases=[]
categories=['clear','blurred','alternate layout','small text','multiple phones','international','dense logo','front and back']
for i in range(30):
    category=categories[i%len(categories)]
    name=['Alice Example','David Sample','Sarah Fiction','James Demo','Maria Sample'][i%5]
    company='Fictional Aviation'
    email=f'card{i+1:02}@example.com'
    phone=['+1 202 555 0101','+44 20 7946 0000','+61 2 5550 0100','+92 21 5555 0101'][i%4]
    lines=[name,'Sales Manager',company,email,phone]
    if category=='multiple phones':lines+=['+1 202 555 0102']
    size=18 if category=='small text' else 32
    image=Image.new('RGB',(1000,600),'white');d=ImageDraw.Draw(image)
    font=ImageFont.truetype(fontpath,size);small=ImageFont.truetype(fontpath,16)
    x=420 if category=='alternate layout' else 65
    if category=='dense logo':
        d.rectangle((30,30,200,100),outline='black',width=3);d.text((40,45),'DEMO AIR',font=font,fill='black');x=250
    for j,line in enumerate(lines):d.text((x,130+j*(size+20)),line,font=font,fill='black')
    d.text((30,560),'FICTIONAL TEST CARD  NO REAL CUSTOMER DATA',font=small,fill='black')
    if category=='blurred':image=image.rotate(3,fillcolor='white').filter(ImageFilter.GaussianBlur(1.8))
    files=[f'card-{i+1:02}.png'];image.save(root/files[0])
    if category=='front and back':
        back=Image.new('RGB',(1000,600),'white');bd=ImageDraw.Draw(back);bd.text((60,100),company+'\n'+email+'\n'+phone,font=font,fill='black');files.append(f'card-{i+1:02}-back.png');back.save(root/files[-1])
    cases.append({'id':i+1,'category':category,'files':files,'expected':{'fullName':name,'companyName':company,'email':email,'phone':phone}})
(root/'manifest.json').write_text(json.dumps(cases,indent=2))
print('Created 30 fictional cards with 3 additional back images')
