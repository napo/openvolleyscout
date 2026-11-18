# SPDX-License-Identifier: AGPL-3.0-or-later
from pathlib import Path
exec(Path('tmp/pdfs/create_booklet_v2.py').read_text().split('compact=[')[0])
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPDF
from functools import lru_cache
@lru_cache(None)
def asset(key):return svg2rlg('tmp/pdfs/native/'+key+'.svg')
def native(c,key,x,y,w,h):
 d=asset(key);scale=min(w/d.width,h/d.height)
 c.saveState();c.translate(x+(w-d.width*scale)/2,y+(h-d.height*scale)/2);c.scale(scale,scale);renderPDF.draw(d,c,0,0);c.restoreState()
def head(c,n,total,title,subtitle):
 c.setFillColor(NAVY);c.rect(0,H-78,W,78,fill=1,stroke=0)
 txt(c,M,H-19,'PIANO PARTITA / AURORA VOLLEY vs RIVALE BLU',7,True,white)
 txt(c,M,H-44,title,19,True,white);txt(c,M,H-63,subtitle,7.2,False,white)
 c.setStrokeColor(LINE);c.setLineWidth(.4);c.line(M,25,W-M,25)
 footer=f'OpenVolleyScout di {AUTHOR} | {URL} | Software libero: GNU AGPL v3 o successive (AGPL-3.0-or-later)'
 size=min(5.2,CW/pdfmetrics.stringWidth(footer,'DV',1))
 txt(c,M,15,footer,size,color=GRAY);c.linkURL(URL,(M,11,W-M,22),relative=0)
 txt(c,M,5,'ESEMPIO / DATI FITTIZI',5.2,color=GRAY);txt(c,W-M-23,5,f'{n}/{total}',5.5,True)
def receptions(c,n,total,indices,compact):
 head(c,n,total,'Rotazioni di ricezione','Sestetti, libero, bersagli e alternative di battuta')
 para(c,M,H-90,'Palleggiatore #2, libero #8. Bersaglio evidenziato in rosso; sestetti e posizioni illustrativi. Rete in alto.',CW,7.3,GRAY)
 if compact:
  cw=(CW-12)/2;h=139;top=H-118
  for i,k in enumerate(indices):
   x=M+(i%2)*(cw+12);y=top-(i//2)*(h+7)-h
   native(c,f'receive-{k}',x,y+9,cw,h-9)
   center(c,x+cw/2,y+1,'Alternativa staff: corta in zona 2',6.2)
 else:
  h=139;top=H-118
  for i,k in enumerate(indices):
   y=top-i*(h+7)-h;box(c,M,y,CW,h)
   native(c,f'receive-{k}',M+3,y+3,132,h-6)
   xx=M+146;txt(c,xx,y+h-22,f'P{ROT[k]} / bersaglio #8',10,True)
   para(c,xx,y+h-36,'<b>Alternativa:</b> corta in zona 2.<br/><b>Obiettivo:</b> ricezione staccata da rete.<br/><br/>Confermare il sestetto e aggiornare dopo i cambi.',CW-155,8)
def attacks(c,n,total,indices,compact):
 head(c,n,total,'Direzioni di attacco','Frequenza dei colpi e direzione con piu punti')
 para(c,M,H-90,'Tutte le fasi. Coni = quota dei colpi; freccia = direzione con piu punti. Campioni illustrativi, solo colpi con direzione.',CW,7.3,GRAY)
 if compact:
  cw=(CW-12)/2;h=139;top=H-118
  for i,k in enumerate(indices):
   x=M+(i%2)*(cw+12);y=top-(i//2)*(h+7)-h
   txt(c,x+4,y+h-9,f'#{ATT[k][0]} / n={ATT[k][3]} colpi',7.3,True)
   native(c,f'attack-{k}',x,y,cw,h-13)
 else:
  h=139;top=H-118
  for i,k in enumerate(indices):
   item=ATT[k];y=top-i*(h+7)-h;box(c,M,y,CW,h)
   native(c,f'attack-{k}',M+2,y+3,132,h-6)
   xx=M+146;txt(c,xx,y+h-21,f'#{item[0]} / {item[1]}',10,True)
   txt(c,xx,y+h-38,f'{item[3]} colpi con direzione',8,color=GRAY)
   para(c,xx,y+h-52,'Il cono mostra dove indirizza gli attacchi. La freccia evidenzia la direzione che produce piu punti.',CW-155,8)
   para(c,xx,y+38,'Spazio per consegna di muro-difesa confermata dallo staff.',CW-155,7,TEAL)
def setter_compact(c,n,total):
 head(c,n,total,'Distribuzione dell’alzata','Palleggiatore principale #2 / ricezioni #, + e !, -')
 para(c,M,H-90,'Numeri nei cerchi = giocatori; prima percentuale = distribuzione, seconda = punti sul totale delle alzate.',CW,7.1,GRAY)
 cw=(CW-12)/2;h=113;top=H-119
 for i,r in enumerate(ROT):
  x=M+(i%2)*(cw+12);y=top-(i//2)*(h+6)-h
  box(c,x,y,cw,h);txt(c,x+5,y+h-10,f'P{r}',7.4,True)
  for j,key in enumerate(['good','bad']):
   xx=x+4+j*(cw/2);ww=cw/2-7
   center(c,xx+ww/2,y+h-20,'# / +' if j==0 else '! / -',6.6,True,TEAL)
   native(c,f'setter-{key}-{i}',xx,y+10,ww,h-32)
   center(c,xx+ww/2,y+3,'n=20',5.6,color=GRAY)
 y=H-119-3*119+6
 para(c,M,y-11,'<b>Secondo palleggiatore #5, sintesi aggregata.</b><br/># / +: Z4 35%, Z2 30%, primo tempo 25%, altre 10% (n=20).<br/>! / -: Z4 60%, Z2 25%, primo tempo 5%, altre 10% (n=20).',CW,7.3)
 para(c,M,57,'Le mappe sono ridotte per mantenere quattro pagine. La versione estesa offre percentuali piu leggibili.',CW,7,GRAY)
def setter_extended(c,n,total,good):
 key='good' if good else 'bad';band='# / +' if good else '! / -'
 head(c,n,total,'Alzata su ricezione '+band,'Palleggiatore principale #2 / distribuzione per rotazione')
 para(c,M,H-90,'Cerchi = giocatori. Sotto: distribuzione e punti sul totale delle alzate. Colori = preferenze con ricezione # / +. n=20 per mappa.',CW,7.3,GRAY)
 cw=(CW-12)/2;h=139;top=H-118
 for i,r in enumerate(ROT):
  x=M+(i%2)*(cw+12);y=top-(i//2)*(h+7)-h
  native(c,f'setter-{key}-{i}',x,y+1,cw,h-12);txt(c,x+6,y+h-8,f'P{r}',7.8,True)
def second(c,n,total):
 head(c,n,total,'Secondo palleggiatore','Extra opzionale incluso nell’esempio esteso / #5')
 para(c,M,H-92,'Esempio grafico sulla P1, n=20 per gruppo. La sintesi su tutte le rotazioni puo restare testuale; altre mappe aggiungono pagine.',CW,8,GRAY)
 cw=(CW-16)/2;y=H-335
 for j,(band,key) in enumerate([('# / +','good'),('! / -','bad')]):
  x=M+j*(cw+16);center(c,x+cw/2,y+195,'Ricezioni '+band,9,True,TEAL)
  native(c,'setter-second-'+key,x,y,cw,185)
 txt(c,M,y-28,'NOTE E CORREZIONI DELLO STAFF',9,True,TEAL)
 para(c,M,y-40,'Prima percentuale: distribuzione. Seconda percentuale: punti ottenuti sul totale delle alzate del gruppo. Il software genera i disegni senza cambiare proporzioni.',CW,8)
 c.setStrokeColor(LINE)
 for yy in [y-85,y-109,y-133,y-157]:c.line(M,yy,W-M,yy)
 para(c,M,59,'Le traiettorie di battuta avversarie restano un extra separato. Un fascicolo stampato cresce per multipli di quattro pagine.',CW,7,GRAY)
def serves(c,n,total,indices):
 head(c,n,total,'Battute avversarie','EXTRA OPZIONALE / zone di partenza, arrivo e direttrice prevalente')
 para(c,M,H-90,'Partenza sopra la rete, arrivo nelle nove zone del nostro campo. La freccia collega la coppia di zone piu frequente; non e una traiettoria misurata.',CW,7.2,GRAY)
 h=139;top=H-118
 for i,k in enumerate(indices):
  y=top-i*(h+7)-h;box(c,M,y,CW,h)
  native(c,f'serve-{k}',M+2,y+3,132,h-6)
  x=M+146;txt(c,x,y+h-20,f'#{ATT[k][0]} / 40 servizi',10,True)
  para(c,x,y+h-35,'<b>Zona preferita:</b> 1.<br/><b>Direttrice:</b> partenza e arrivo registrati.<br/><br/>Concordare le competenze della nostra ricezione.',CW-155,8)
def notes(c,n,total):
 head(c,n,total,'Consegne sulla ricezione','Spazio staff / pagina extra per completare il fascicolo stampato')
 txt(c,M,H-104,'RESPONSABILITA E ZONE DI CONFLITTO',10,True,TEAL)
 para(c,M,H-118,'Usare le mappe dei servizi per concordare chi prende corto, profondo e le palle tra due ricevitori. Annotare modifiche e sostituzioni.',CW,8)
 for y in range(420,95,-29):c.setStrokeColor(LINE);c.line(M,y,W-M,y)
def extra_cover(c,n,total):
 head(c,n,total,'Appunti e aggiornamenti','Spazio staff / pagina extra per completare il fascicolo stampato')
 para(c,M,H-96,'Verifiche durante la gara, cambi nelle rotazioni e correzioni alle indicazioni iniziali.',CW,8)
 for y in range(455,65,-29):c.setStrokeColor(LINE);c.line(M,y,W-M,y)
compact=[lambda c,n,t:priorities(c,n,t,'compatta'),lambda c,n,t:receptions(c,n,t,range(6),True),lambda c,n,t:attacks(c,n,t,range(6),True),setter_compact]
extended=[lambda c,n,t:priorities(c,n,t,'estesa'),lambda c,n,t:receptions(c,n,t,range(3),False),lambda c,n,t:receptions(c,n,t,range(3,6),False),lambda c,n,t:attacks(c,n,t,range(3),False),lambda c,n,t:attacks(c,n,t,range(3,6),False),lambda c,n,t:setter_extended(c,n,t,True),lambda c,n,t:setter_extended(c,n,t,False),second]
# Reuse only the uniform page imposition/export routine.
source=Path('tmp/pdfs/create_booklet_v2.py').read_text();exec('def export'+source.split('def export',1)[1].split("out=Path",1)[0])
out=Path('output/pdf')
export(compact,str(out/'esempio-foglio-tattico-a5.pdf'),str(out/'esempio-foglio-tattico-booklet-a4.pdf'))
export(extended,str(out/'esempio-foglio-tattico-esteso-a5.pdf'),str(out/'esempio-foglio-tattico-esteso-booklet-a4.pdf'))
extra=extended+[lambda c,n,t:serves(c,n,t,range(3)),lambda c,n,t:serves(c,n,t,range(3,6)),notes,extra_cover]
export(extra,str(out/'esempio-foglio-tattico-extra-battute-a5.pdf'),str(out/'esempio-foglio-tattico-extra-battute-booklet-a4.pdf'))
print('Updated 4/8/12 page examples using native application SVGs')
