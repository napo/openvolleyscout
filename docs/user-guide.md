# Guida Utente

Questa guida descrive i flussi principali di OpenVolleyScout dal punto di vista
dell'utente: preparare squadre e gare, fare scouting, importare dati, analizzare
partite, collegare video e studiare più gare di una squadra.

OpenVolleyScout è local-first: i dati restano sul dispositivo. L'app non salva i
file video dentro il progetto; salva solo il percorso o l'URL del video e i
punti di sincronizzazione.

## 1. Home

Dalla home puoi aprire i flussi principali:

- Nuova gara
- Squadre
- Carica dati
- Scouting

Lo scouting è disponibile solo quando esiste un progetto gara attivo e pronto.

## 2. Squadre e Rose

Vai in **Squadre** per costruire l'archivio locale delle squadre.

Puoi:

- creare una nuova squadra
- modificare nome squadra e staff
- aggiungere, modificare o rimuovere atleti
- indicare capitano e libero
- generare una rosa di test
- importare rose da file OVS JSON o CSV
- esportare una squadra o tutte le squadre

Le squadre archiviate sono modelli riutilizzabili. Quando crei una gara, la
rosa viene copiata nel progetto gara: modificare l'archivio non cambia
automaticamente le gare già create.

## 3. Creare una Gara

Vai in **Gara** per preparare un nuovo progetto.

Compila:

- competizione
- stagione, turno, numero gara, sede e data quando disponibili
- formato gara
- squadra di casa
- squadra ospite
- rosa convocata per ogni squadra

Prima di iniziare lo scouting controlla che la gara sia pronta: squadre e rose
devono essere coerenti, e nella fase di set dovrai scegliere sestetti e squadra
al servizio.

## 4. Scouting Live

Vai in **Scouting** per registrare la gara.

Il flusso principale è:

1. configura la gara
2. prepara il set
3. scegli i sestetti e il servizio
4. avvia il rally
5. registra tocchi, valutazioni, punti ed eventi
6. chiudi set e gara

L'app mantiene un registro eventi. Questo permette di ricostruire punteggio,
statistiche, report e analisi anche dopo aver ricaricato il progetto.

### Modalità di scouting

La modalità **Quick** è il flusso guidato più rapido. La vecchia modalità
`simple` viene trattata come Quick.

La modalità **Advanced** mantiene più dettagli espliciti per flussi vicini a
DataVolley.

La modalità **Expert** usa l'inserimento tramite codici.

### Correzioni e undo

Durante la gara puoi usare correzioni di punteggio, undo e gestione eventi di
palla morta. Le correzioni vengono rappresentate nel registro eventi, non come
modifiche manuali scollegate.

### Pannello direzioni avversarie

Durante lo scouting puoi usare il pannello delle direzioni di attacco/servizio
per leggere frequenze e direzioni per zone DataVolley. Le zone 7, 8 e 9 sono
trattate come zone distinte.

## 5. Carica Dati e Import DataVolley

Vai in **Carica dati** per aprire progetti salvati o importare file
DataVolley `.dvw`.

Importando un file DataVolley, OpenVolleyScout mostra un'anteprima con:

- squadre
- punteggio
- set
- numero atleti
- numero azioni
- diagnostica
- piano di creazione o aggiornamento delle squadre archiviate

Se una gara sembra già importata, l'app propone come gestire il duplicato.

Dopo l'import, il progetto viene salvato e puoi aprire direttamente le
statistiche.

## 6. Statistiche Gara

Vai in **Statistiche gara** per analizzare il progetto attivo.

La pagina contiene diverse viste:

- **Tabellino**: report gara con rotazioni, presenze e statistiche.
- **Prestazioni squadre**: efficienze, distribuzioni valutazioni, punti ed
  errori.
- **Prestazioni atleta**: statistiche individuali, filtri e heatmap.
- **Studio cambio-palla**: distribuzione e qualità dopo ricezione.
- **Analisi video**: collegamento video, sincronizzazione e clip.

Azioni disponibili nella vista statistiche:

- aprire una versione stampabile del report
- esportare PDF
- esportare PNG
- esportare DataVolley `.dvw`

Le dashboard usano i dati registrati o importati nella gara. Se una partita non
contiene informazioni di zona, alcune heatmap possono non essere disponibili.

## 7. Video Associati alla Gara

Nella tab **Analisi video** puoi collegare un video alla gara.

Sorgenti supportate:

- file video locale
- percorso file locale, utile nelle build desktop
- URL YouTube

OpenVolleyScout non copia il video dentro il progetto. Salva solo:

- riferimento al file o URL
- punti di sincronizzazione
- secondi prima e dopo l'azione per playback e clip

### Sincronizzazione

Per usare il video:

1. collega una sorgente video
2. avvia la sincronizzazione sul primo servizio o su un'azione
3. porta il video al momento esatto dell'azione indicata
4. conferma la sincronizzazione

Dopo la sincronizzazione puoi cliccare sulle azioni filtrate e far partire il
video nel punto corrispondente.

### Filtri video

Puoi filtrare per:

- squadra
- set
- fondamentale
- atleta
- fase
- posizione del palleggiatore
- esito rally
- valutazioni

Puoi anche riprodurre in sequenza le azioni filtrate.

### Esportazione clip

Per file locali, quando il browser o la build desktop lo supportano, puoi
esportare clip delle azioni filtrate. Per YouTube non è disponibile il download
diretto delle clip; nella vista multi-gara puoi esportare una playlist testuale
con link temporizzati.

## 8. Studio Dati per Squadra

Dalla pagina **Squadre** puoi aprire lo studio dati di una squadra.

Il flusso è:

1. scegli la squadra
2. apri lo studio dati
3. seleziona le gare salvate da includere
4. avvia l'analisi

L'app aggrega le gare selezionate mettendo sempre la squadra studiata come lato
principale e combinando gli avversari nell'altro lato. In questo modo puoi
usare le stesse viste già disponibili per una singola gara:

- prestazioni squadra
- prestazioni atleta
- studio cambio-palla
- analisi video multi-gara

Nell'analisi video multi-gara vengono mostrate solo le azioni della squadra
studiata. Puoi filtrare anche per avversario e passare tra i video delle gare
selezionate.

## 9. Sistemi

Vai in **Sistemi** per gestire librerie tattiche di ricezione e difesa.

Puoi:

- passare tra sistemi di difesa e ricezione
- creare un nuovo sistema
- selezionare un sistema esistente
- modificare il nome
- scegliere la rotazione del palleggiatore
- spostare marker di ruolo sul campo
- salvare o cancellare il sistema
- esportare la definizione

I sistemi sono salvati localmente nel browser. Non sono ancora un archivio
IndexedDB collegato in modo duraturo alle singole gare.

## 10. Impostazioni

Vai in **Impostazioni** per:

- cambiare lingua
- riaprire la guida dello scouting live
- nelle build di sviluppo, cancellare i dati locali

La cancellazione dei dati locali rimuove progetti, squadre, rose, competizioni
e preferenze salvate sul dispositivo.

## 11. Cose da Ricordare

- I dati sono locali al dispositivo e al browser/app in uso.
- I video non vengono copiati nel progetto.
- Se un file video locale viene spostato, dovrai ricollegarlo.
- Le analisi aggregate per squadra sono calcolate al momento dalle gare
  selezionate.
- Report, DataVolley export, PNG, PDF, playlist e clip sono file generati: non
  diventano nuovi dati persistiti nel progetto.
