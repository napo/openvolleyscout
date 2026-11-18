from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color, white
from reportlab.lib.pagesizes import A5, A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
import math
pdfmetrics.registerFont(TTFont('DV','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DVB','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
W,H=A5; M=25; CW=W-2*M
NAVY=HexColor('#142E42'); TEAL=HexColor('#007E80'); INK=HexColor('#203847'); GRAY=HexColor('#536775'); LIGHT=HexColor('#EAF3F3'); LINE=HexColor('#CDDBDF'); GOLD=HexColor('#B97813')
def text(c,x,y,s,size=9,bold=False,color=INK):
 c.setFillColor(color); c.setFont('DVB' if bold else 'DV',size); c.drawString(x,y,s)
def para(c,x,top,s,w=CW,size=9,color=INK):
 p=Paragraph(s,ParagraphStyle('p',fontName='DV',fontSize=size,leading=size*1.43,textColor=color)); _,h=p.wrap(w,1000); p.drawOn(c,x,top-h); return top-h

def box(c,x,y,w,h,fill=LIGHT):
 c.setFillColor(fill); c.roundRect(x,y,w,h,6,fill=1,stroke=0)
def header(c,n,title,sub):
 c.setFillColor(NAVY); c.rect(0,H-89,W,89,fill=1,stroke=0)
 text(c,M,H-23,'OPENVOLLEYSCOUT  /  PIANO PARTITA',8,True,white)
 text(c,M,H-49,title,21,True,white)
 text(c,M,H-70,sub,8,False,white)
 c.setStrokeColor(LINE); c.line(M,35,W-M,35)
 text(c,M,22,'ESEMPIO - DATI E SQUADRE INTERAMENTE FITTIZI',6.7,color=GRAY)
 text(c,W-M-18,22,f'{n}/4',7,True)
def arrow(c,x1,y1,x2,y2,color=TEAL,width=1.6):
 c.setStrokeColor(color); c.setLineWidth(width); c.line(x1,y1,x2,y2)
 a=math.atan2(y2-y1,x2-x1); l=5
 c.line(x2,y2,x2-l*math.cos(a-.42),y2-l*math.sin(a-.42)); c.line(x2,y2,x2-l*math.cos(a+.42),y2-l*math.sin(a+.42))
def court(c,x,y,w,h):
 c.setFillColor(white); c.setStrokeColor(LINE); c.setLineWidth(.8); c.rect(x,y,w,h,fill=1,stroke=1)
 c.line(x,y+h*2/3,x+w,y+h*2/3)
 c.setStrokeColor(NAVY);c.setLineWidth(2);c.line(x,y+h,x+w,y+h)
 for label,xx,yy in [('4',.16,.83),('3',.5,.83),('2',.84,.83),('5',.16,.16),('6',.5,.16),('1',.84,.16)]:
  text(c,x+w*xx-2,y+h*yy,label,6,color=GRAY)

def page1(c):
 header(c,1,'Cinque cose da ricordare','Aurora Volley vs Rivale Blu  |  Campione illustrativo: 4 gare, 15 set')
 text(c,M, H-111,'3 PRIORITA CONFERMATE DALLO STAFF',9,True,TEAL)
 cards=[('01','Battuta sul #8 in P1 e P6','Cercare il #8 nelle due rotazioni.','Cambio palla avversario: 42% (20/48) sulle sue ricezioni; 59% (33/56) sulle altre, nelle stesse rotazioni.'),('02','Su ricezione negativa, riferimento al #7','Preparare muro-difesa sulla palla alta in 4.','Al #7 va il 62% delle alzate dopo ricezione negativa (31/50). Direzioni e campione nella pagina 3.'),('03','Contro il #9, presidiare zona 5','Confermare il riferimento difensivo sulla diagonale.','Da zona 2 indirizza il 50% dei colpi in zona 5 (20/40). Mantenere un responsabile del pallonetto.')]
 y=H-125
 for num,title,action,evidence in cards:
  h=90; box(c,M,y-h,CW,h)
  text(c,M+10,y-19,num,12,True,TEAL);text(c,M+36,y-18,title,10,True)
  para(c,M+10,y-30,action,CW-20,9)
  para(c,M+10,y-49,evidence,CW-20,8,GRAY)
  y-=100
 text(c,M,y-9,'2 INDICAZIONI SECONDARIE  /  INCLUSE DALLO STAFF',8,True,GRAY)
 y-=23
 for title,body in [('04  Ricezione: attenzione al servizio del #11','Il 60% dei servizi osservati arriva in zona 1 (24/40). Concordare prima le competenze sulla zona di conflitto.'),('05  Nostro attacco: cercare la profondita','Consegna manuale dello staff: alternare palla profonda in 1 e 5. Copertura corta sul nostro attaccante.')]:
  text(c,M,y,title,9,True); y=para(c,M,y-8,body,CW,8,GRAY)-15
 para(c,M,69,'Le frasi operative sono decisioni dello staff. Le percentuali descrivono il campione e non garantiscono l\'effetto della scelta.',CW,7,GRAY)

def page2(c):
 header(c,2,'La nostra battuta','Sei rotazioni avversarie  |  Bersaglio principale + alternativa')
 para(c,M,H-102,'P1-P6: posizione del palleggiatore avversario. Assetti schematici confermati dallo staff, non posizioni ricostruite da tracking.',CW,8,GRAY)
 cardw=(CW-12)/2; cardh=120; top=H-145
 for i,(r,target,zone,alt) in enumerate([(1,8,5,'corta in 2'),(6,8,6,'profonda in 1'),(5,12,1,'conflitto 1/6'),(4,12,1,'corta in 3'),(3,8,5,'conflitto 5/6'),(2,12,6,'profonda in 5')]):
  x=M+(i%2)*(cardw+12); y=top-(i//2)*(cardh+10)-cardh
  box(c,x,y,cardw,cardh)
  text(c,x+9,y+cardh-17,f'P{r}  /  bersaglio #{target}',9,True)
  cx=x+10;cy=y+32;cw=cardw-20;ch=61;court(c,cx,cy,cw,ch)
  slots={5:(.18,.38),6:(.5,.28),1:(.82,.38)}
  for z,(xx,yy) in slots.items():
   px=cx+cw*xx;py=cy+ch*yy
   c.setFillColor(TEAL if z==zone else LINE);c.circle(px,py,9,fill=1,stroke=0)
   if z==zone: text(c,px-6,py-3,str(target),7,True,white)
  text(c,x+9,y+17,'Alternativa: '+alt,7.6)
 para(c,M,63,'Le mappe mostrano gli obiettivi concordati. Dove manca un confronto robusto sul cambio palla, il bersaglio resta una scelta manuale dello staff.',CW,7,GRAY)

def page3(c):
 header(c,3,'Direzioni di attacco','Contenuto fisso del booklet  |  Sei attaccanti, lettura immediata')
 para(c,M,H-101,'Vista dalla nostra difesa: rete in alto. Frecce = destinazione del colpo nel nostro campo; spessore proporzionale alla frequenza.',CW,8,GRAY)
 cardw=(CW-12)/2; cardh=124; top=H-138
 data=[('7','Schiacciatore','4',40,[50,30,20],[1,6,5]),('9','Opposto','2',40,[50,30,20],[5,6,1]),('14','Centrale','3',20,[40,40,20],[1,5,6]),('3','Schiacciatore','4',40,[40,35,25],[1,6,5]),('11','Centrale','3',20,[50,30,20],[5,1,6]),('6','Opposto','2',20,[40,35,25],[5,6,1])]
 for i,(num,role,origin,n,pcts,zones) in enumerate(data):
  x=M+(i%2)*(cardw+12);y=top-(i//2)*(cardh+9)-cardh
  box(c,x,y,cardw,cardh)
  text(c,x+9,y+cardh-16,f'#{num}  {role}',9,True)
  text(c,x+9,y+cardh-29,f'Da Z{origin} | {n} colpi con direzione',7,color=GRAY)
  cx=x+13;cy=y+37;cw=cardw-26;ch=51;court(c,cx,cy,cw,ch)
  start=cx+cw*({'4':.9,'2':.1,'3':.5}[origin]);sy=cy+ch+4
  for pct,z in zip(pcts,zones):
   ex=cx+cw*{1:.83,5:.17,6:.5}[z];ey=cy+ch*.3
   arrow(c,start,sy,ex,ey,width=.5+pct/22)
  text(c,x+8,y+21,' | '.join(f'Z{z} {p}%' for z,p in zip(zones,pcts)),7.4,True)
  text(c,x+8,y+9,'Tutte le fasi | esclusi colpi senza direzione',6.1,color=GRAY)
 para(c,M,61,'Z = zona di arrivo. Le direzioni non distinguono punto, errore e difesa. Per il muro: non confondere frequenza del colpo con efficacia.',CW,7,GRAY)

def page4(c):
 header(c,4,'Assetto e alternative','Distribuzione avversaria  /  nostra ricezione  /  piano B')
 text(c,M,H-113,'DOVE VA IL PALLEGGIATORE',10,True,TEAL)
 para(c,M,H-122,'Quote di alzate per attaccante. Le due condizioni hanno campioni distinti; sono escluse le azioni senza classificazione.',CW,8,GRAY)
 cols=[M+8,M+182,M+268];y=H-167
 box(c,M,y-17,CW,27,NAVY)
 for x,s in zip(cols,['Attaccante','Ric. positiva','Ric. negativa']):text(c,x,y-7,s,8,True,white)
 for j,row in enumerate([('#7 / zona 4','30% (30/100)','62% (31/50)'),('#9 / zona 2','25% (25/100)','20% (10/50)'),('#14 / centro','25% (25/100)','8% (4/50)'),('Altri','20% (20/100)','10% (5/50)')]):
  yy=y-18-(j+1)*25
  if j%2==0:box(c,M,yy-6,CW,25,LIGHT)
  for x,s in zip(cols,row):text(c,x,yy+2,s,8)
 y=H-321
 text(c,M,y,'NOSTRA RICEZIONE E PRIMO ATTACCO',10,True,TEAL)
 y=para(c,M,y-12,'<b>Servizio #11:</b> 24 servizi su 40 verso zona 1. Definire chi prende il conflitto 1/6 e chi copre il corto.',CW,9)-12
 y=para(c,M,y,'<b>Prima scelta dello staff:</b> con ricezione positiva mantenere il primo tempo disponibile; su palla staccata, chiamata alta concordata.',CW,9)-22
 text(c,M,y,'PIANO B DELLO STAFF',10,True,TEAL)
 y=para(c,M,y-12,'<b>Se cambia la ricezione:</b> verificare il nuovo assetto e passare al bersaglio alternativo di pagina 2.',CW,9)-10
 y=para(c,M,y,'<b>Se cambia il riferimento in attacco:</b> aggiornare la priorita di muro sulla distribuzione effettiva della gara.',CW,9)-14
 c.setStrokeColor(LINE)
 for yy in [y-6,y-24]:c.line(M,yy,W-M,yy)
 text(c,M,49,'NOTE LIVE / SOSTITUZIONI / CONSEGNE CONFERMATE',7,True,GRAY)

pages=[page1,page2,page3,page4]
read='output/pdf/esempio-foglio-tattico-a5.pdf'
c=canvas.Canvas(read,pagesize=A5);c.setTitle('OpenVolleyScout - esempio tattico A5 - dati fittizi')
for fn in pages:fn(c);c.showPage()
c.save()
# One physical A4 sheet, duplex short edge: outside 4|1, inside 2|3.
c=canvas.Canvas('output/pdf/esempio-foglio-tattico-booklet-a4.pdf',pagesize=landscape(A4));c.setTitle('OpenVolleyScout - booklet A4 - dati fittizi')
AW,AH=landscape(A4)
for pair in [(3,0),(1,2)]:
 for slot,index in enumerate(pair):
  c.saveState();c.translate(slot*AW/2+(AW/2-W)/2,(AH-H)/2);pages[index](c);c.restoreState()
 c.setStrokeColor(LINE);c.setDash(2,3);c.line(AW/2,6,AW/2,14);c.line(AW/2,AH-14,AW/2,AH-6);c.setDash()
 c.showPage()
c.save()
print(read)
