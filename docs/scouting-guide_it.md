# Guida alla Rilevazione

Questa guida spiega passo passo come registrare una partita di pallavolo usando l'interfaccia di scouting live di OpenVolleyScout.

## Inizio del Rally

### Servizio

1. OVS mostra il battitore nella posizione di servizio predefinita (posizione 1).
2. Puoi toccare le zone di partenza del servizio (1, 6 o 5) sul lato della squadra al servizio per cambiare la posizione di partenza. Il battitore e la palla si spostano nella zona scelta.
3. Trascina la palla dal battitore verso il campo avversario, disegnando la traiettoria del servizio.
4. Se la palla atterra fuori dal campo o prima della rete, OVS registra un errore di servizio e assegna il punto all'avversario.

### Ricezione

5. La traiettoria del servizio si ferma nel campo avversario. OVS evidenzia tutti i giocatori della squadra in ricezione con un anello viola.
6. Tocca il giocatore che ha ricevuto. L'anello viola scompare da tutti i giocatori.
7. OVS assegna la ricezione con valutazione predefinita (+). La palla si sposta nella zona del campo corrispondente alla qualità della valutazione. La valutazione della battuta viene derivata automaticamente dalla ricezione.
8. Puoi cambiare la valutazione della ricezione dalla toolbar. La palla si sposta di conseguenza. Per le valutazioni - e = la palla resta dove si trova.
9. I giocatori della squadra in ricezione si spostano in assetto di attacco (il palleggiatore si muove verso la posizione di alzata).

## Dopo la Ricezione: Registrare il Rally

Dopo la ricezione sei libero di scegliere il livello di dettaglio che preferisci. Puoi eseguire una qualsiasi di queste azioni:

### Azione A: Trascinare la palla oltre la rete (attacco)

10. Trascina la palla dalla sua posizione attuale verso il campo avversario, disegnando la traiettoria dell'attacco.
11. OVS evidenzia i giocatori della squadra in attacco con anelli viola e chiede di selezionare l'attaccante.
12. Tocca il giocatore che ha attaccato.
13. OVS registra l'attacco. Se la ricezione era # o +, OVS auto-inserisce anche il tocco di alzata del palleggiatore con K1. OVS suggerisce la valutazione dell'attacco e puoi modificarla dalla toolbar.

### Azione B: Trascinare la palla sulla rete (muro)

10. Durante il trascinamento, se la palla si avvicina alla linea della rete, questa diventa spessa e gialla come feedback visivo.
11. Rilascia la palla sulla rete gialla. OVS pre-seleziona la valutazione A/ (murato) ed evidenzia i giocatori di prima linea avversari (posizioni 2, 3, 4) con anelli viola.
12. Tocca il muratore. Il punto viene assegnato alla squadra che ha murato.

### Azione C: Toccare un giocatore della stessa squadra (alzata, copertura)

10. Tocca un giocatore della squadra che ha il possesso.
11. La palla si sposta verso quel giocatore.
12. OVS propone lo skill in base al contesto:
    - Se il giocatore è il palleggiatore dopo ricezione o difesa: skill = alzata con K1 preimpostato
    - Altrimenti: skill = attacco
13. Puoi cambiare lo skill dalla toolbar (alzata, attacco, copertura, ecc.).
14. Puoi poi trascinare la palla per definire la traiettoria.

### Azione D: Toccare un giocatore dell'altra squadra (difesa, freeball)

10. Tocca un giocatore della squadra avversaria.
11. La palla si sposta verso quel giocatore.
12. OVS propone lo skill in base al contesto (difesa, freeball).
13. Puoi cambiare lo skill e la valutazione dalla toolbar.

## Dopo l'Attacco

In base alla valutazione dell'attacco:

- **A# (punto diretto)**: Punto per l'attaccante. Il rally finisce.
- **A= (errore)**: Punto per l'avversario. Il rally finisce.
- **A/ (murato)**: OVS chiede di selezionare il muratore. Punto per la squadra che ha murato.
- **A! (tocco di muro)**: OVS chiede di selezionare il muratore. Il rally continua.
- **A+ o A- (difeso)**: Il rally continua. La squadra avversaria ora ha il possesso. Si torna a "Dopo la Ricezione" e si ripete con la nuova squadra in possesso.

## Continuazione del Rally

Dopo qualsiasi tocco non terminale (difesa, alzata, freeball, copertura), si torna alle stesse tre opzioni: trascinare la palla oltre la rete (attacco), toccare un giocatore della stessa squadra, o toccare un giocatore dell'altra squadra. Il rally continua fino a quando una valutazione terminale (#, =, /) assegna il punto.

## Chiusura del Rally

- OVS assegna il punto alla squadra indicata dalla valutazione terminale.
- Il codice completo del rally viene aggiunto alla lista dei codici.
- Puoi correggere qualsiasi codice con Undo o dalla toolbar di inserimento manuale.

## Principio Guida

OVS non ti blocca mai. Il minimo indispensabile per registrare un rally completo è:

**Servizio (trascina) -> Ricevitore (tocca) -> Attacco (trascina oltre rete) -> Attaccante (tocca) -> Punto**

Tutto il resto (alzata esplicita, difesa, freeball, copertura) è opzionale e aggiunge dettaglio statistico.

## Controlli della Toolbar

Durante il rally, la toolbar in basso mostra:

- **Pulsanti skill**: Servizio, Ricezione, Attacco, Muro, Alzata, Difesa, Freeball, Copertura. Lo skill suggerito è pre-selezionato, ma puoi sempre cambiarlo.
- **Pulsanti valutazione**: Le valutazioni disponibili per lo skill selezionato (es. =, /, !, -, +, # per la ricezione).
- **Pulsanti codice K**: Quando lo skill è Alzata o Attacco, appare il selettore del codice di combinazione K (K1, K2, K7, KC, KM). K1 è il predefinito per le buone ricezioni.
- **Pulsanti tipo palla**: H, M, Q, T, U, N, O per i codici tipo servizio e attacco.
- **Numero di muratori**: 0, 1, 2, 3 per i tocchi di attacco.
