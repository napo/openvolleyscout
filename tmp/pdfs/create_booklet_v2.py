# SPDX-License-Identifier: AGPL-3.0-or-later
from pathlib import Path
import re, math
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white, Color
from reportlab.lib.pagesizes import A4,A5,landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
root=Path.cwd()
metadata=(root/'src/lib/constants/app.ts').read_text()
AUTHOR=re.search(r"author:\s*\{\s*name: '([^']+)'",metadata).group(1)
URL=re.search(r"webApp: '([^']+)'",metadata).group(1)
assert "license: 'AGPL-3.0-or-later'" in metadata
for name,f in [('DV','DejaVuSans.ttf'),('DVB','DejaVuSans-Bold.ttf')]:pdfmetrics.registerFont(TTFont(name,'/usr/share/fonts/truetype/dejavu/'+f))
W,H=A5; M=23; CW=W-2*M
NAVY=HexColor('#142E42'); TEAL=HexColor('#007E80'); INK=HexColor('#203847');GRAY=HexColor('#536775');LIGHT=HexColor('#EAF3F3');LINE=HexColor('#CDDBDF'); GOLD=HexColor('#A45A0E')
def txt(c,x,y,s,size=8,bold=False,color=INK):
 c.setFillColor(color);c.setFont('DVB' if bold else 'DV',size);c.drawString(x,y,s)
def center(c,x,y,s,size=7,bold=False,color=INK):
 c.setFillColor(color);c.setFont('DVB' if bold else 'DV',size);c.drawCentredString(x,y,s)
def para(c,x,top,s,w=CW,size=8,color=INK):
 p=Paragraph(s,ParagraphStyle('p',fontName='DV',fontSize=size,leading=size*1.35,textColor=color));_,h=p.wrap(w,1000);p.drawOn(c,x,top-h);return top-h

def box(c,x,y,w,h,fill=LIGHT):
 c.setFillColor(fill);c.roundRect(x,y,w,h,5,fill=1,stroke=0)
def head(c,n,total,title,subtitle):
 c.setFillColor(NAVY);c.rect(0,H-78,W,78,fill=1,stroke=0)
 txt(c,M,H-20,'OPENVOLLEYSCOUT  /  PIANO PARTITA',7.5,True,white)
 txt(c,M,H-44,title,19,True,white)
 txt(c,M,H-63,subtitle,7.4,False,white)
 c.setStrokeColor(LINE);c.setLineWidth(.5);c.line(M,47,W-M,47)
 center(c,W/2,36,f'Realizzato con OpenVolleyScout di {AUTHOR}',6.1)
 center(c,W/2,26,URL,6.1,color=TEAL)
 c.linkURL(URL,(M,23,W-M,33),relative=0)
 center(c,W/2,16,'Software libero - GNU AGPL v3 or later (AGPL-3.0-or-later)',6.1)
 txt(c,M,6,'ESEMPIO / DATI FITTIZI',5.4,color=GRAY);txt(c,W-M-21,6,f'{n}/{total}',5.6,True)
def court(c,x,y,s,labels=True):
 # Half court is always 9 x 9 m: identical side lengths and uniform scaling.
 c.setFillColor(white);c.setStrokeColor(LINE);c.setLineWidth(.6);c.rect(x,y,s,s,fill=1,stroke=1)
 c.setDash(2,2);c.line(x,y+s*2/3,x+s,y+s*2/3);c.setDash()
 c.setStrokeColor(NAVY);c.setLineWidth(1.5);c.line(x,y+s,x+s,y+s)
 if labels:
  for z,xx,yy in [(4,.13,.85),(3,.5,.85),(2,.87,.85),(5,.13,.08),(6,.5,.08),(1,.87,.08)]:
   center(c,x+s*xx,y+s*yy,str(z),5.6,color=GRAY)
def arrow(c,a,b,color=TEAL):
 c.setStrokeColor(color);c.setLineWidth(.8);c.line(*a,*b);ang=math.atan2(b[1]-a[1],b[0]-a[0]);l=3
 for d in [-.4,.4]:c.line(*b,b[0]-l*math.cos(ang+d),b[1]-l*math.sin(ang+d))
ROT=[1,6,5,4,3,2]
# Synthetic reception formations: a legal cyclic line-up, libero replacing a back-row central.
BASE=[2,7,14,9,3,11]
def lineup(index):
 # Slots are positions 1..6. P labels follow setter position 1,6,5,4,3,2.
 a=BASE[index:]+BASE[:index]
 return [8 if v in (14,11) and pos in (1,5,6) else v for pos,v in enumerate(a,1)]
def receive(c,x,y,s,index):
 court(c,x,y,s)
 coords={1:(.81,.32),2:(.82,.78),3:(.51,.89),4:(.18,.77),5:(.18,.32),6:(.49,.23)}
 players=lineup(index);target=8 if 8 in players else 3
 for pos,num in enumerate(players,1):
  xx,yy=coords[pos];px=x+s*xx;py=y+s*yy;r=max(4.5,s*.065)
  fill=TEAL if num==target else NAVY
  c.setFillColor(fill);c.circle(px,py,r,fill=1,stroke=0);center(c,px,py-2,str(num),max(5,s*.057),True,white)
  if num==2:
   txt(c,px+r+1,py+2,'P',5.5,True,color=TEAL)
  if num==target:
   c.setStrokeColor(TEAL);c.setLineWidth(.7);c.circle(px,py,r+2,fill=0,stroke=1)
 return target

def priorities(c,n,total,mode):
 head(c,n,total,'Cinque punti chiave',f'Aurora Volley vs Rivale Blu  |  Versione {mode}  |  Dati illustrativi')
 txt(c,M,H-99,'3 PRIORITA SELEZIONATE DALLO STAFF',8.3,True,TEAL)
 cards=[('01','Battuta sul libero #8 in P1 e P6','Cercare il bersaglio concordato nelle due rotazioni.','Cambio palla avversario: 42% (20/48) sulle sue ricezioni; 59% (33/56) sulle altre, nelle stesse rotazioni.'),('02','Su ricezione ! / -, riferimento al #7','Preparare muro-difesa sulla palla alta in zona 4.','Il #7 riceve il 60% delle alzate dopo ricezione ! / - (72/120). Verificare le direzioni prima della gara.'),('03','Contro il #9, presidiare zona 5','Confermare il riferimento difensivo sulla diagonale.','Da zona 2 indirizza il 50% dei colpi in zona 5 (20/40). Assegnare la responsabilita sul pallonetto.')]
 y=H-111
 for number,title,action,evidence in cards:
  box(c,M,y-86,CW,86)
  txt(c,M+9,y-18,number,11,True,TEAL);txt(c,M+34,y-17,title,9.3,True)
  para(c,M+9,y-29,action,CW-18,8.4)
  para(c,M+9,y-48,evidence,CW-18,7.7,GRAY);y-=95
 txt(c,M,y-8,'2 SECONDARIE / INCLUSE NELLA STAMPA DI ESEMPIO',7.7,True,GRAY);y-=25
 for title,body in [('04  Ricezione: attenzione al servizio del #11','Il 60% dei servizi osservati arriva in zona 1 (24/40). Concordare le competenze sul conflitto 1/6.'),('05  Nostro attacco: cercare la profondita','Scelta manuale dello staff: alternare profondo in 1 e 5; mantenere la copertura corta sul nostro attaccante.')]:
  txt(c,M,y,title,8.7,True);y=para(c,M,y-9,body,CW,8,GRAY)-14
 para(c,M,79,'Le priorita sono riordinabili e modificabili. Le posizioni 4-5 sono escludibili dalla stampa; le proposte 6-10 restano nell\'app.',CW,7,GRAY)

def receptions(c,n,total,indices,compact):
 head(c,n,total,'Rotazioni di ricezione','Avversario in ricezione  |  Sestetto, libero e bersaglio di battuta')
 para(c,M,H-90,'P = palleggiatore #2; #8 = libero. Cerchio verde = bersaglio. Assetti schematici dello staff, non tracking.',CW,7.3,GRAY)
 if compact:
  cw=(CW-12)/2;h=128;top=H-122
  for i,k in enumerate(indices):
   x=M+(i%2)*(cw+12);y=top-(i//2)*(h+9)-h;box(c,x,y,cw,h)
   txt(c,x+8,y+h-14,f'P{ROT[k]}',8,True);s=89;target=receive(c,x+(cw-s)/2,y+21,s,k)
   center(c,x+cw/2,y+8,f'Batti su #{target} | alternativa: corta',6.5)
 else:
  top=H-122;h=127
  for i,k in enumerate(indices):
   y=top-i*(h+10)-h;box(c,M,y,CW,h);s=109;target=receive(c,M+10,y+10,s,k)
   x=M+133;txt(c,x,y+h-20,f'P{ROT[k]} / ricezione',11,True)
   para(c,x,y+h-33,f'<b>Bersaglio:</b> #{target}<br/><b>Alternativa:</b> corta in zona 2.<br/><b>Obiettivo:</b> allontanare la ricezione dalla rete.',CW-145,8.3)
   para(c,x,y+35,'Confermare il sestetto prima della gara e aggiornare dopo i cambi.',CW-145,7.3,GRAY)
 para(c,M,68,'Ogni mezzo campo mantiene il rapporto 1:1 (9 x 9 m). Le rotazioni restano disponibili in entrambe le versioni.',CW,6.8,GRAY)

ATT=[('7','Schiacciatore',4,40,[50,30,20],[1,6,5]),('9','Opposto',2,40,[50,30,20],[5,6,1]),('14','Centrale',3,20,[40,40,20],[1,5,6]),('3','Schiacciatore',4,40,[40,35,25],[1,6,5]),('11','Centrale',3,20,[50,30,20],[5,1,6]),('6','Opposto',2,20,[40,35,25],[5,6,1])]
def attack_court(c,x,y,s,item):
 num,role,origin,n,pcts,zones=item;court(c,x,y,s)
 ox=x+s*{4:.94,2:.06,3:.5}[origin];oy=y+s
 for rank,(pct,z) in enumerate(zip(pcts,zones)):
  mid=x+s*{1:.82,5:.18,6:.5}[z];ey=y+s*.23;spread=s*.095
  c.setFillColor(Color(0,.49,.5,alpha=.10+pct/150));p=c.beginPath();p.moveTo(ox,oy);p.lineTo(mid-spread,ey);p.lineTo(mid+spread,ey);p.close();c.drawPath(p,fill=1,stroke=0)
  arrow(c,(ox,oy),(mid,ey));center(c,mid,y+s*.13,f'{pct}%',max(5.8,s*.065),True)

def attacks(c,n,total,indices,compact):
 head(c,n,total,'Direzioni di attacco','Coni e percentuali  |  Vista dalla nostra difesa, rete in alto')
 para(c,M,H-90,'Percentuali sui colpi con direzione registrata, tutte le fasi. Frequenza della direzione ed efficacia sono misure distinte.',CW,7.3,GRAY)
 if compact:
  cw=(CW-12)/2;h=128;top=H-122
  for i,k in enumerate(indices):
   item=ATT[k];x=M+(i%2)*(cw+12);y=top-(i//2)*(h+9)-h;box(c,x,y,cw,h)
   txt(c,x+8,y+h-13,f'#{item[0]} / da Z{item[2]} / n={item[3]}',7.5,True)
   s=89;attack_court(c,x+(cw-s)/2,y+22,s,item)
   center(c,x+cw/2,y+9,' | '.join(f'Z{z}: {v}%' for z,v in zip(item[5],item[4])),6.5,True)
 else:
  top=H-122;h=127
  for i,k in enumerate(indices):
   item=ATT[k];y=top-i*(h+10)-h;box(c,M,y,CW,h);s=109;attack_court(c,M+10,y+10,s,item)
   x=M+133;txt(c,x,y+h-20,f'#{item[0]} / {item[1]}',10,True)
   txt(c,x,y+h-36,f'Da zona {item[2]} | {item[3]} colpi',8,color=GRAY)
   for j,(pct,z) in enumerate(zip(item[4],item[5])):txt(c,x,y+h-57-j*16,f'Zona {z}: {pct}%',9,True,color=TEAL)
 para(c,M,68,'Z = zona di arrivo nel nostro campo. Esclusi i colpi privi di direzione. I coni sono schematici e non traiettorie misurate.',CW,6.8,GRAY)

# Per-rotation setting distribution; each list sums to 100, counts are integers for n=20.
GOOD=[[30,30,30,10],[35,25,25,15],[30,25,30,15],[25,30,30,15],[30,20,35,15],[30,20,30,20]]
BAD=[[60,25,5,10],[65,20,5,10],[55,25,10,10],[60,20,10,10],[65,20,5,10],[55,25,10,10]]
# Categories: zone 4, zone 2, first tempo, other (pipe/back row etc.).
def setting(c,x,y,s,values):
 court(c,x,y,s,False)
 origin=(x+s*.65,y+s*.55);dest=[(.14,.88),(.87,.88),(.48,.88),(.44,.25)]
 for val,(dx,dy) in zip(values,dest):
  end=(x+s*dx,y+s*dy);arrow(c,origin,end)
  center(c,end[0],end[1]+3,str(val)+'%',max(5.5,s*.074),True)
 c.setFillColor(TEAL);c.circle(*origin,2.6,fill=1,stroke=0)

def setter_compact(c,n,total):
 head(c,n,total,'Distribuzione dell’alzata','Palleggiatore principale #2  |  Sei rotazioni, due gruppi di ricezione')
 para(c,M,H-90,'Ricezioni # / + e ! / - separate. In ogni campo: Z4 a sinistra, primo tempo al centro, Z2 a destra; altre alzate in basso.',CW,7.2,GRAY)
 cw=(CW-12)/2;h=118;top=H-125;s=66
 for i,r in enumerate(ROT):
  x=M+(i%2)*(cw+12);y=top-(i//2)*(h+8)-h;box(c,x,y,cw,h)
  txt(c,x+7,y+h-13,f'P{r}',7.7,True)
  for j,(band,values) in enumerate([('# / +',GOOD[i]),('! / -',BAD[i])]):
   xx=x+12+j*(s+13);center(c,xx+s/2,y+h-27,band,7,True,TEAL)
   setting(c,xx,y+15,s,values);center(c,xx+s/2,y+5,'n=20 alzate',5.9,color=GRAY)
 y=H-125-3*126+8
 para(c,M,y-10,'<b>Secondo palleggiatore #5 - sintesi (tutte le rotazioni).</b><br/># / +: Z4 35%, Z2 30%, primo tempo 25%, altre 10% (n=20).<br/>! / -: Z4 60%, Z2 25%, primo tempo 5%, altre 10% (n=20).',CW,7.2)

def setter_extended(c,n,total,good):
 band='# / +' if good else '! / -'; vals=GOOD if good else BAD
 head(c,n,total,'Alzata su ricezione '+band,'Palleggiatore principale #2  |  Distribuzione distinta per rotazione')
 para(c,M,H-90,'Destinazioni: Z4 a sinistra, primo tempo al centro, Z2 a destra; altre alzate (incluse seconda linea) in basso.',CW,7.3,GRAY)
 cw=(CW-12)/2;h=128;top=H-122;s=89
 for i,r in enumerate(ROT):
  x=M+(i%2)*(cw+12);y=top-(i//2)*(h+9)-h;box(c,x,y,cw,h)
  txt(c,x+8,y+h-14,f'P{r} / {band}',8,True);setting(c,x+(cw-s)/2,y+20,s,vals[i]);center(c,x+cw/2,y+8,'n=20 alzate classificate',6.5,color=GRAY)
 para(c,M,68,'Le percentuali descrivono le scelte di alzata, non la probabilita di fare punto. Mezzi campi quadrati e scala uniforme.',CW,6.8,GRAY)

def second(c,n,total):
 head(c,n,total,'Secondo palleggiatore','Scheda opzionale inclusa in questo esempio esteso  |  #5')
 para(c,M,H-92,'Distribuzione aggregata su tutte le rotazioni. Campione ridotto: la scheda riporta i dati e non propone nuove priorita automatiche.',CW,8,GRAY)
 s=143;y=H-300
 for x,band,v in [(M+10,'Ricezioni # / +',[35,30,25,10]),(W-M-s-10,'Ricezioni ! / -',[60,25,5,10])]:
  center(c,x+s/2,y+s+17,band,9,True,TEAL);setting(c,x,y,s,v);center(c,x+s/2,y-14,'n=20 alzate',8,color=GRAY)
 txt(c,M,y-45,'LETTURA DELLE MAPPE',9,True,TEAL)
 para(c,M,y-56,'Z4 a sinistra, primo tempo al centro, Z2 a destra; altre alzate in basso. Il palleggiatore principale resta analizzato per tutte le sei rotazioni nelle pagine 6-7.',CW,8)
 txt(c,M,y-110,'NOTE E CORREZIONI DELLO STAFF',9,True,TEAL)
 c.setStrokeColor(LINE);c.setLineWidth(.6)
 for yy in [y-132,y-154,y-176,y-198]:c.line(M,yy,W-M,yy)
 para(c,M,74,'Il secondo palleggiatore puo restare testuale o avere schede grafiche dedicate. Ulteriori dettagli richiedono altre pagine; nessun campo viene deformato.',CW,7,GRAY)

compact=[lambda c,n,t:priorities(c,n,t,'compatta'),lambda c,n,t:receptions(c,n,t,range(6),True),lambda c,n,t:attacks(c,n,t,range(6),True),setter_compact]
extended=[lambda c,n,t:priorities(c,n,t,'estesa'),lambda c,n,t:receptions(c,n,t,range(3),False),lambda c,n,t:receptions(c,n,t,range(3,6),False),lambda c,n,t:attacks(c,n,t,range(3),False),lambda c,n,t:attacks(c,n,t,range(3,6),False),lambda c,n,t:setter_extended(c,n,t,True),lambda c,n,t:setter_extended(c,n,t,False),second]
def export(pages,read,book):
 N=len(pages);c=canvas.Canvas(read,pagesize=A5);c.setTitle(f'OpenVolleyScout - esempio {N} pagine A5 - dati fittizi');c.setAuthor(AUTHOR)
 for i,fn in enumerate(pages):fn(c,i+1,N);c.showPage()
 c.save()
 c=canvas.Canvas(book,pagesize=landscape(A4));c.setAuthor(AUTHOR);c.setTitle(f'OpenVolleyScout - booklet {N} pagine - A4 fronte-retro')
 AW,AH=landscape(A4)
 for sheet in range(N//4):
  for pair in [(N-1-2*sheet,2*sheet),(1+2*sheet,N-2-2*sheet)]:
   for slot,index in enumerate(pair):
    c.saveState();c.translate(slot*AW/2+(AW/2-W)/2,(AH-H)/2);pages[index](c,index+1,N);c.restoreState()
   c.showPage()
 c.save()
out=Path('output/pdf')
export(compact,str(out/'esempio-foglio-tattico-a5.pdf'),str(out/'esempio-foglio-tattico-booklet-a4.pdf'))
export(extended,str(out/'esempio-foglio-tattico-esteso-a5.pdf'),str(out/'esempio-foglio-tattico-esteso-booklet-a4.pdf'))
print('Creati 4 PDF. Footer da APP_METADATA:',AUTHOR,URL)
