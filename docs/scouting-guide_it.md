# Guida alla Rilevazione

Questa guida spiega passo passo come registrare una partita di pallavolo usando l'interfaccia di scouting live di OpenVolleyScout.

## Principio Guida

OVS non ti blocca mai. Il minimo indispensabile per registrare un rally completo è:

**Servizio (trascina) → Ricevitore (tocca) → Attacco (trascina oltre rete) → Attaccante (tocca) → Valutazione → Punto**

Tutto il resto (alzata, difesa, freeball, copertura, muro) è opzionale e aggiunge dettaglio statistico.

## Il Ciclo a 3 Tocchi

Un rally di pallavolo è organizzato attorno a un ciclo ripetuto di 3 tocchi per squadra:

1. **1° tocco** — ricezione (in side-out) o difesa / freeball / copertura (in transizione)
2. **2° tocco** — alzata
3. **3° tocco** — attacco (la palla attraversa la rete)

Dopo l'attacco il ciclo ricomincia per l'altra squadra. Il 1° e il 2° tocco sono opzionali — puoi saltarli e andare direttamente all'attacco.

OVS determina quale skill proporre in base alla **direzione della traiettoria disegnata**:

| Traiettoria | Tocco | Skill proposto | Colore anello |
|-------------|-------|---------------|---------------|
| Resta nel proprio campo, palla dall'avversario | 1° | Difesa / freeball / copertura | Verde |
| Resta nel proprio campo | 2° | Alzata | Arancione |
| Attraversa la rete | 3° | Attacco | Rosso |

## Inizio del Rally

### Servizio

1. OVS mostra il battitore nella posizione di servizio predefinita (posizione 1).
2. Puoi toccare le zone di partenza del servizio (1, 6 o 5) sul lato della squadra al servizio per cambiare la posizione di partenza. Il battitore e la palla si spostano nella zona scelta.
3. Trascina la palla dal battitore verso il campo avversario, disegnando la traiettoria del servizio.
4. Se la palla atterra fuori dal campo o prima della rete, OVS registra un errore di servizio e assegna il punto all'avversario.

### Ricezione

5. La traiettoria del servizio si ferma nel campo avversario. OVS evidenzia tutti i giocatori della squadra in ricezione con un **anello viola**. I giocatori della squadra al servizio sono disabilitati e non possono essere toccati.
6. Tocca il giocatore che ha ricevuto. Gli anelli scompaiono.
7. OVS assegna la ricezione con valutazione predefinita (+). La palla si sposta nella zona del campo corrispondente alla qualità della valutazione. La valutazione della battuta viene derivata automaticamente dalla ricezione.
8. Puoi cambiare la valutazione della ricezione dalla toolbar. La palla si sposta di conseguenza. Per le valutazioni - e = la palla resta dove si trova. La ricezione = viene registrata automaticamente come errore di ricezione e il rally finisce.
9. I giocatori della squadra in ricezione si spostano in assetto di attacco (il palleggiatore si muove verso la posizione di alzata).

## Dopo la Ricezione: Registrare il Rally

Dopo la ricezione disegni una traiettoria. La direzione determina cosa succede:

### Traiettoria dentro al campo → Alzata

10. Disegna una traiettoria che resta dentro al campo della squadra.
11. OVS propone l'**alzata** (2° tocco). Se la ricezione era # o +, l'alzatore viene assegnato automaticamente. Se ci sono due alzatori, OVS chiede di selezionare con un **anello arancione**.
12. Puoi cambiare lo skill e la valutazione dalla toolbar.

### Traiettoria oltre la rete → Attacco

10. Trascina la palla dalla posizione attuale verso il campo avversario, disegnando la traiettoria dell'attacco. L'alzata viene inferita automaticamente (se ricezione # o +, alzatore assegnato con K1).
11. OVS evidenzia i giocatori della squadra in attacco con **anelli rossi** e chiede di selezionare l'attaccante.
12. Tocca il giocatore che ha attaccato.
13. OVS registra l'attacco con valutazione predefinita (+). Puoi modificare la valutazione dalla toolbar. L'**area muro** appare lungo la rete.

### Traiettoria sulla rete → Muro

10. Durante il trascinamento, se la palla si avvicina alla linea della rete, questa diventa spessa e gialla come feedback visivo.
11. Rilascia la palla sulla rete gialla. OVS entra nel sottostato muro.

## Continuazione del Rally (Ciclo a 3 Tocchi)

Dopo qualsiasi tocco non terminale il ciclo si ripete. Disegna una traiettoria e OVS propone lo skill in base alla direzione:

### 1° tocco di squadra — Difesa / Freeball / Copertura (palla dall'avversario)

- OVS evidenzia i giocatori con **anelli verdi**.
- Tocca il giocatore che ha fatto il primo tocco.
- Skill predefinito = difesa; modificabile dalla toolbar (freeball, copertura).

### 2° tocco di squadra — Alzata

- OVS evidenzia con **anelli arancioni** — l'anello dell'alzatore è ben visibile.
- Tocca l'alzatore (o chi ha alzato la palla).

### 3° tocco — Attacco (traiettoria oltre la rete)

- OVS evidenzia con **anelli rossi**.
- Tocca l'attaccante.
- Valutazione predefinita (+). L'area muro appare lungo la rete.

### Caso speciale: la palla torna nello stesso campo

Se l'avversario non riesce a tenere la palla (es. contrattacco fallito, difesa lunga), il contatore tocchi si resetta per la stessa squadra. Basta disegnare una nuova traiettoria oltre la rete per registrare un altro attacco.

## Dopo l'Attacco

Il chip della valutazione attacco è visibile (predefinito +). L'area muro è visibile lungo la rete. Puoi:

- **Selezionare #** — punto diretto, punto per l'attaccante. Rally finisce.
- **Selezionare =** — errore, punto per l'avversario. Rally finisce.
- **Selezionare + o -** — difeso (nessun muro coinvolto). Rally continua, ciclo 3 tocchi riparte per l'avversario.
- **Toccare l'area muro (o selezionare / o !)** — entra nel sottostato muro.

## Muro (sottostato dell'attacco)

Il muro è una conseguenza dell'attacco, non un'azione separata. Quando attivato, OVS evidenzia i giocatori di prima linea della squadra a muro con **anelli rosa**.

1. Tocca il muratore.
2. Seleziona persone a muro: 0, 1, 2, 3 (predefinito 2).
3. Seleziona la valutazione del muro:

| Valutazione | Significato | Risultato |
|-------------|-----------|-----------|
| B# | Muro vincente (punto diretto) | Punto per la squadra a muro, rally finisce |
| B= | Errore muro (mani fuori, in rete, palla a terra) | Punto per la squadra attaccante, rally finisce |
| B/ | Invasione | Punto per la squadra attaccante, rally finisce |
| B+ | Palla toccata, rigiocabile dalla squadra a muro | Rally continua, la squadra a muro ha il possesso |
| B- | Palla toccata, rigiocabile dall'attaccante | Rally continua, la squadra attaccante ha il possesso |
| B! | Murato ma ripreso in copertura dall'attaccante | Rally continua, la squadra attaccante ha il possesso |

## Chiusura del Rally

- OVS assegna il punto alla squadra indicata dalla valutazione terminale.
- Il codice completo del rally viene aggiunto alla lista dei codici e alla toolbar di inserimento manuale.
- Puoi correggere qualsiasi codice con Undo.
- OVS esegue la rotazione se necessario (side-out) e seleziona automaticamente il nuovo battitore.

## Controlli della Toolbar

Durante il rally, la toolbar in basso mostra:

- **Pulsanti skill**: Servizio, Ricezione, Attacco, Muro, Alzata, Difesa, Freeball, Copertura. Lo skill suggerito è pre-selezionato, ma puoi sempre cambiarlo.
- **Pulsanti valutazione**: Le valutazioni disponibili per lo skill selezionato. Passa sopra ogni pulsante per vederne il significato per lo skill corrente.
- **Pulsanti codice K**: Quando lo skill è Alzata o Attacco, appare il selettore del codice di combinazione K (K1, K2, K7, KC, KM). Passa sopra per le descrizioni.
- **Pulsanti tipo palla**: H, M, Q, T, U, N, O per i codici tipo servizio e attacco. Passa sopra per le descrizioni.
- **Persone a muro**: 0, 1, 2, 3 per i tocchi di attacco (predefinito 2). Passa sopra per le descrizioni.

## Riepilogo Colori Anelli

| Colore | Situazione |
|--------|-----------|
| Viola | Selezione ricevitore (dopo il servizio) |
| Verde | Difesa / freeball / copertura (1° tocco) |
| Arancione | Alzata (2° tocco) |
| Rosso | Attacco (3° tocco) |
| Rosa | Muro |
