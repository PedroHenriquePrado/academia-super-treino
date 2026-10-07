"""Gera 18 GIFs próprios, ilustrações vetoriais simplificadas (não vídeos clínicos).
Dependência APENAS para regenerar mídias: pip install Pillow.
Os GIFs já vão prontos no pacote; o aluno/professor não instala Python.
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
from math import pi, cos
ROOT=Path(__file__).resolve().parent.parent/'public'/'exercicios'
GIF=ROOT/'gifs'; POSTER=ROOT/'posters'
GIF.mkdir(parents=True,exist_ok=True); POSTER.mkdir(parents=True,exist_ok=True)
W,H,S=480,300,2
BG='#11271f'; WHITE='#e6ffef'; GREEN='#6bf0b2'; GOLD='#ffdb80'; DIM='#779b8b'; DARK='#213d30'
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def typeface(filename,size):
    # O pacote já contém as imagens: esta rotina é opcional para designers.
    candidates=[filename,'C:/Windows/Fonts/arial.ttf','C:/Windows/Fonts/arialbd.ttf']
    for candidate in candidates:
        try: return ImageFont.truetype(candidate,size)
        except OSError: pass
    return ImageFont.load_default(size=size)
font=typeface(FONT,14*S); label=typeface(BOLD,19*S)
TITLES={
'supino-reto':'SUPINO RETO','supino-inclinado':'SUPINO INCLINADO','puxada-frente':'PUXADA FRENTE',
'remada-baixa':'REMADA BAIXA','remada-curvada':'REMADA CURVADA','agachamento':'AGACHAMENTO LIVRE',
'leg-press':'LEG PRESS','cadeira-extensora':'CADEIRA EXTENSORA','mesa-flexora':'MESA FLEXORA',
'stiff':'STIFF','elevacao-pelvica':'ELEVAÇÃO PÉLVICA','desenvolvimento':'DESENVOLVIMENTO',
'elevacao-lateral':'ELEVAÇÃO LATERAL','rosca-direta':'ROSCA DIRETA','triceps-corda':'TRÍCEPS CORDA',
'prancha':'PRANCHA','abdominal-supra':'ABDOMINAL SUPRA','panturrilha':'PANTURRILHA EM PÉ'}
def line(d, pts, color=WHITE, w=11):
    xy=[(int(x*S),int(y*S)) for x,y in pts]
    d.line(xy, fill=color,width=w*S,joint='curve')
    for x,y in [pts[0],pts[-1]]: d.ellipse(((x-w/2)*S,(y-w/2)*S,(x+w/2)*S,(y+w/2)*S),fill=color)
def circle(d,x,y,r=11,color=WHITE): d.ellipse(((x-r)*S,(y-r)*S,(x+r)*S,(y+r)*S),fill=color)
def disc(d,x,y,color=GOLD):
    circle(d,x,y,10,color); circle(d,x,y,3,BG)
def floor(d,y=254):line(d,[(60,y),(420,y)],DIM,2)
def bench(d,a,b):line(d,[a,b],GREEN,8)
def txt(d,x,y,t,fill=WHITE,f=font):d.text((x*S,y*S),t,fill=fill,font=f)
def draw(slug,p):
    im=Image.new('RGB',(W*S,H*S),BG); d=ImageDraw.Draw(im)
    d.rounded_rectangle((16*S,14*S,(W-16)*S,(H-14)*S),radius=22*S,outline=DARK,width=2*S)
    txt(d,37,28,TITLES[slug],WHITE,label)
    txt(d,38,55,'ANIMAÇÃO ILUSTRATIVA · orientação com professor',DIM)
    d.rounded_rectangle((355*S,28*S,444*S,52*S),radius=9*S,fill=DARK)
    txt(d,368,32,'ST  ·  V1.4',GREEN,typeface(BOLD,10*S))
    # Movimento = 0 posição inicial; = 1 amplitude final.
    if slug=='supino-reto':
        bench(d,(120,215),(360,215));line(d,[(160,215),(160,249)],DIM,5);line(d,[(322,215),(322,249)],DIM,5)
        line(d,[(162,193),(310,193)],WHITE,14);circle(d,146,190,12)
        y=130+46*p;line(d,[(265,193),(265,171+p*9),(265,y)],WHITE,10)
        line(d,[(219,y),(325,y)],GOLD,5);disc(d,222,y);disc(d,323,y)
        line(d,[(180,193),(170,213)],WHITE,7)
    elif slug=='supino-inclinado':
        bench(d,(155,235),(297,136));line(d,[(160,232),(150,251)],DIM,6)
        line(d,[(175,219),(275,150)],WHITE,14);circle(d,289,138,11)
        y=92+45*p
        line(d,[(268,154),(257,133+p*14),(253,y)],WHITE,10);line(d,[(280,147),(303,130+p*14),(313,y)],WHITE,10)
        disc(d,253,y);disc(d,313,y)
    elif slug=='puxada-frente':
        floor(d);line(d,[(130,239),(342,239)],DIM,3);bench(d,(195,201),(277,201));line(d,[(230,201),(230,252)],DIM,5)
        line(d,[(236,193),(238,136)],WHITE,15);circle(d,237,119,13)
        line(d,[(238,195),(211,230)],WHITE,10);line(d,[(238,195),(272,230)],WHITE,10)
        y=81+51*p
        line(d,[(241,140),(202,139-10*(1-p)),(193,y)],WHITE,9);line(d,[(241,140),(276,139-10*(1-p)),(285,y)],WHITE,9)
        line(d,[(191,y),(287,y)],GOLD,5);line(d,[(239,72),(239,y)],DIM,2)
    elif slug=='remada-baixa':
        floor(d);bench(d,(141,219),(269,219));line(d,[(173,219),(175,250)],DIM,5)
        line(d,[(183,209),(191,139)],WHITE,14);circle(d,192,120,12)
        line(d,[(185,204),(280,232),(343,231)],WHITE,9)
        x=310-75*p;line(d,[(188,147),(236,162),(x,174)],WHITE,9)
        line(d,[(x,165),(x,183)],GOLD,6);line(d,[(x,174),(407,174)],DIM,2)
        line(d,[(407,141),(407,222)],GOLD,7)
    elif slug=='remada-curvada':
        floor(d);line(d,[(226,240),(219,180),(168,182),(282,131)],WHITE,13);circle(d,296,119,12)
        y=201-44*p;line(d,[(257,143),(264,178),(257,y)],WHITE,9)
        line(d,[(217,y),(321,y)],GOLD,5);disc(d,220,y);disc(d,318,y)
    elif slug=='agachamento':
        floor(d);hipy=153+43*p;heady=89+28*p;sh=118+35*p
        circle(d,242,heady,15);line(d,[(240,heady+19),(242,hipy)],WHITE,15)
        line(d,[(242,hipy),(201,195+32*p),(200,243)],WHITE,12)
        line(d,[(242,hipy),(285,195+32*p),(285,243)],WHITE,12)
        line(d,[(239,sh),(181,147+19*p)],WHITE,9);line(d,[(239,sh),(298,146+19*p)],WHITE,9)
        line(d,[(170,sh),(314,sh)],GOLD,5);disc(d,180,sh);disc(d,306,sh)
    elif slug=='leg-press':
        floor(d);bench(d,(120,233),(205,160));line(d,[(150,232),(133,247)],DIM,5)
        line(d,[(148,227),(190,175)],WHITE,16);circle(d,206,163,11)
        knee=(240+49*p,192-33*p);foot=(304+57*p,164-50*p)
        line(d,[(180,218),knee,foot],WHITE,12)
        x,y=foot;line(d,[(x-5,y-57),(x+23,y+35)],GOLD,8)
    elif slug=='cadeira-extensora':
        floor(d);bench(d,(170,176),(285,176));line(d,[(167,176),(164,109)],GREEN,8);line(d,[(183,176),(183,253)],DIM,6)
        line(d,[(204,136),(211,167)],WHITE,14);circle(d,204,121,12)
        knee=(267,181);ankle=(271+67*p,245-67*p)
        line(d,[(208,171),knee,ankle],WHITE,12);disc(d,*ankle)
    elif slug=='mesa-flexora':
        floor(d);bench(d,(121,188),(352,188));line(d,[(155,188),(155,253)],DIM,6);line(d,[(323,188),(323,253)],DIM,6)
        line(d,[(150,162),(307,162)],WHITE,14);circle(d,130,162,12)
        ankle=(376-64*p,169-60*p)
        line(d,[(305,162),(352,163),ankle],WHITE,11);disc(d,*ankle)
    elif slug=='stiff':
        floor(d);hip=(231,171+8*p);shoulder=(238+85*p,120+58*p);head=(shoulder[0]+2,shoulder[1]-24)
        line(d,[(231,171),(213,204),(213,246)],WHITE,12);line(d,[(231,171),(267,202),(270,246)],WHITE,12)
        line(d,[hip,shoulder],WHITE,15);circle(d,*head,12)
        hand=(shoulder[0]+9,199+31*p);line(d,[shoulder,hand],WHITE,10)
        disc(d,hand[0],hand[1])
    elif slug=='elevacao-pelvica':
        floor(d);bench(d,(133,211),(216,211));line(d,[(168,211),(168,248)],DIM,6)
        hip=(271,213-65*p);line(d,[(189,184),hip],WHITE,16);circle(d,178,180,11)
        line(d,[hip,(326,212),(336,246)],WHITE,12);line(d,[(186,183),(233,207-20*p)],WHITE,9)
        disc(d,hip[0],hip[1]-12)
    elif slug=='desenvolvimento':
        floor(d);bench(d,(201,205),(273,205));line(d,[(207,205),(207,250)],DIM,5)
        line(d,[(235,195),(235,134)],WHITE,14);circle(d,235,113,14)
        y=143-56*p
        line(d,[(234,141),(201,144-18*p),(191,y)],WHITE,9)
        line(d,[(238,141),(274,144-18*p),(283,y)],WHITE,9)
        disc(d,191,y);disc(d,283,y)
        line(d,[(233,195),(209,228)],WHITE,9);line(d,[(236,195),(263,228)],WHITE,9)
    elif slug=='elevacao-lateral':
        floor(d);circle(d,240,108,14);line(d,[(240,129),(238,190)],WHITE,16)
        line(d,[(235,188),(217,225),(214,248)],WHITE,12);line(d,[(240,189),(265,225),(270,248)],WHITE,12)
        y=177-46*p
        line(d,[(236,141),(193-48*p,y)],WHITE,9);line(d,[(242,141),(287+48*p,y)],WHITE,9)
        disc(d,193-48*p,y);disc(d,287+48*p,y)
    elif slug=='rosca-direta':
        floor(d);circle(d,240,112,14);line(d,[(240,135),(240,193)],WHITE,15)
        line(d,[(239,189),(220,225),(219,247)],WHITE,12);line(d,[(242,189),(266,225),(268,247)],WHITE,12)
        y=202-52*p;line(d,[(239,145),(225,182),(224,y)],WHITE,9);line(d,[(241,145),(264,182),(265,y)],WHITE,9)
        line(d,[(206,y),(282,y)],GOLD,5);disc(d,207,y);disc(d,280,y)
    elif slug=='triceps-corda':
        floor(d);circle(d,237,112,14);line(d,[(237,136),(245,197)],WHITE,15)
        line(d,[(246,195),(220,223),(215,245)],WHITE,11);line(d,[(246,195),(279,225),(279,247)],WHITE,11)
        y=177+51*p;line(d,[(233,145),(217,160),(218,y)],WHITE,9);line(d,[(246,147),(264,162),(265,y)],WHITE,9)
        line(d,[(241,81),(241,139)],DIM,3);line(d,[(218,y),(218-9,y+12)],GOLD,5);line(d,[(265,y),(265+8,y+12)],GOLD,5)
    elif slug=='prancha':
        floor(d);pulse=2*cos(p*pi)
        line(d,[(148,206),(221,185+pulse),(310,190+pulse),(357,226)],WHITE,15)
        circle(d,132,205,12);line(d,[(197,195),(183,228),(156,230)],WHITE,9)
        txt(d,155,92,'CONTRAÇÃO ISOMÉTRICA',GREEN)
    elif slug=='abdominal-supra':
        floor(d);bench(d,(85,232),(389,232));line(d,[(171,207),(220,229)],WHITE,14)
        sh=(176+27*p,190-28*p);hip=(234,221);line(d,[sh,hip],WHITE,16);circle(d,sh[0]-16,sh[1]-13,12)
        line(d,[hip,(297,185),(325,226)],WHITE,12);line(d,[(208,202),(176+23*p,162-20*p)],WHITE,9)
    elif slug=='panturrilha':
        floor(d);dy=24*p;circle(d,239,112-dy,13);line(d,[(239,135-dy),(239,196-dy)],WHITE,15)
        line(d,[(236,192-dy),(218,235-dy),(215,246-dy)],WHITE,11)
        line(d,[(240,192-dy),(267,236-dy),(267,246-dy)],WHITE,11)
        line(d,[(240,149-dy),(285,178-dy)],WHITE,9);line(d,[(240,148-dy),(202,176-dy)],WHITE,9)
        line(d,[(209,247),(274,247)],GOLD,4)
    txt(d,37,272,'MOVIMENTO SIMPLIFICADO • NÃO SUBSTITUI ORIENTAÇÃO',DIM,typeface(BOLD,9*S))
    return im.resize((W,H),Image.Resampling.LANCZOS)
for slug in TITLES:
    frames=[]
    for i in range(16):
        # loop ida e volta com breve pausa na amplitude
        p = (1-cos(2*pi*i/16))/2
        frames.append(draw(slug,p))
    frames[0].save(POSTER/f'{slug}.webp',format='WEBP',quality=77,method=5)
    # optimize indexed image GIFs, no network and no copyright risk
    out=[frame.quantize(colors=88,method=Image.Quantize.FASTOCTREE) for frame in frames]
    out[0].save(GIF/f'{slug}.gif',save_all=True,append_images=out[1:],duration=95,loop=0,optimize=True,disposal=2)
    print(f'{slug}: {(GIF/f"{slug}.gif").stat().st_size/1024:.0f} KiB')
