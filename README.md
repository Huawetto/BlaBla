# BlaBla — Editor Documenti

Editor di documenti **offline-first**, in **HTML/CSS/JavaScript vanilla** (nessun
framework, nessun build step). Interfaccia in italiano stile suite per ufficio:
ribbon con icone vettoriali, pagine A4 multi-pagina con reflow automatico,
salvataggio automatico, "Salva come" in **.blab** (formato nativo) o **PDF**,
import da DOCX/DOC/RTF/PDF/TXT, **OCR** di PDF scansionati.

## Avvio
Fai **doppio clic su `blabla.html`**. Si apre nel browser e funziona anche
offline (`file://`). Nessuna installazione.

In alternativa, vedi **[App desktop](#app-desktop-blablaexe)** sotto per un
vero eseguibile `.exe` con finestra propria, senza aprire il browser.

## Struttura del progetto
```
blabla.html               File principale (apri questo). Contiene tutto:
                           markup, CSS e JavaScript in un unico file, così
                           funziona con un doppio clic senza server (i moduli
                           ES e le richieste fetch verso file:// sono bloccati
                           dal browser; uno script unico non ha questo limite).
fonts/
  fonts.js                 Elenco dei font locali (rigenerato da tools/update-fonts.*)
                            usato per il caricamento automatico all'avvio.
  *.ttf / *.otf / *.woff*  I tuoi font: aggiungili qui e rilancia lo script update-fonts.
tools/
  update-fonts.ps1/.bat    Rigenera fonts/fonts.js scansionando la cartella fonts/.
  fetch-new-fonts.py       Scarica in blocco altre famiglie da Google Fonts (licenza
                           OFL), saltando quelle già presenti.
  launcher.py              Punto d'ingresso dell'app desktop (vedi sotto).
  build_exe.py/.bat        Crea dist/BlaBla.exe (vedi sotto).
engine/pdfengine.js        Motore di analisi layout dei PDF (tabelle, colonne, figure, OCR).
vendor/                    Librerie di terze parti, TUTTE locali (nessun CDN; vedi vendor/README.txt
                           e THIRD_PARTY_NOTICES.md).
assets/                    Icona dell'app (icon.svg/png/ico, usata anche dall'exe).
tests/e2e/               Test automatici (Playwright + Edge): vedi sotto.
LICENSE, CHANGELOG.md, THIRD_PARTY_NOTICES.md
```

## Sviluppo, test e rilascio
```
pip install -r requirements-dev.txt        (solo per i test)
python -m http.server 8743                 (in un terminale, nella cartella del progetto)
python tests/e2e/audit.py                  (feature principali)
python tests/e2e/audit3.py                 (conferme, annulla/ripeti, esportazione con tema scuro)
python tests/e2e/xss.py                    (file ostili)

pip install -r requirements-build.txt      (solo per creare l'exe)
python tools/build_exe.py                  -> dist/BlaBla.exe
```
**Pubblicare su GitHub:** il repository contiene il sorgente (circa 60 MB tra `vendor/` e `fonts/`);
`dist/BlaBla.exe` (~160 MB) NON va nel repository (limite di 100 MB per file) ma come file allegato di una
**Release**. L'exe non è firmato digitalmente: Windows SmartScreen può mostrare l'avviso "editore sconosciuto".

## Licenza
MIT (vedi `LICENSE`). Componenti e font di terze parti: `THIRD_PARTY_NOTICES.md`.

## App desktop (BlaBla.exe)
BlaBla può anche essere impacchettato in un eseguibile standalone che si apre
in una **vera finestra desktop nativa** — niente barra degli indirizzi, niente
schede, nessuna interfaccia da browser — e che **non richiede Python, altre
installazioni né connessione a internet** sul PC di destinazione.

**Per creare l'eseguibile** (serve Python e internet solo per questo passaggio,
una tantum): doppio clic su [`tools/build_exe.bat`](tools/build_exe.bat), oppure
```
python tools/build_exe.py               (bundla anche i modelli OCR offline, più lento)
python tools/build_exe.py --skip-ocr-data  (più veloce; l'OCR scarica i modelli alla prima esecuzione)
```
Il risultato è `dist/BlaBla.exe`: copialo su qualunque PC Windows e avvialo con
un doppio clic, anche senza internet.

**Come funziona:** `tools/launcher.py` (compilato nell'exe da PyInstaller) apre
la pagina `blabla.html` dentro una finestra [pywebview](https://pywebview.flowrl.com/)
appoggiata al motore WebView2 già incluso in Windows 10/11 — un vero programma
desktop, non una scheda di Edge/Chrome. Dietro le quinte gira comunque un
piccolo server web locale (raggiungibile solo da 127.0.0.1, mai da altri PC in
rete), necessario perché alcune funzioni (anteprima PDF, librerie in `vendor/`,
modelli lingua dell'OCR) richiedono una vera origine `http://` per funzionare
in modo affidabile. Se il PC non ha il runtime WebView2 (raro, solo su Windows
molto datati), l'app ricade automaticamente sul browser predefinito.

Il documento viene salvato automaticamente su un file nella cartella stabile
dell'app (`%LOCALAPPDATA%\BlaBla`), scritto direttamente da Python — non nel
localStorage del browser, che nei test si è rivelato inaffidabile nel
persistere su disco alla chiusura della finestra.

## Font: caricamento automatico
Tutti i font (`.ttf .otf .woff .woff2 .ttc`) presenti nella cartella `fonts/`
vengono caricati **automaticamente all'avvio**, con qualsiasi estensione valida,
senza alcuna azione dell'utente — anche aprendo `blabla.html` con un doppio clic
(`file://`), dove il browser normalmente non permette di leggere il contenuto di
una cartella.

Il trucco: `fonts/fonts.js` è un piccolo script che elenca i nomi dei file (non il
loro contenuto) ed è incluso con un normale `<script src="fonts/fonts.js">`,
cosa che funziona anche su `file://` (a differenza di `fetch()`/XHR verso una
cartella, che i browser bloccano per sicurezza).

**Se aggiungi o rimuovi font dalla cartella `fonts/`**, rigenera l'elenco con un
doppio clic su [`tools/update-fonts.bat`](tools/update-fonts.bat) (Windows), poi
ricarica `blabla.html`. Il pannello del menu font si estende automaticamente
fino in fondo alla finestra (non resta più compresso sotto la barra in alto),
per scorrere comodamente l'intero elenco. Ogni voce mostra il nome sempre in un
font leggibile dell'interfaccia più una piccola anteprima "Ag" nel font reale.

La cartella include oltre 370 font di testo pronti all'uso, tra cui un
centinaio di famiglie Google Fonts (licenza OFL, liberamente ridistribuibili)
aggiunte con [`tools/fetch-new-fonts.py`](tools/fetch-new-fonts.py) —
rilancialo (serve internet) per scaricarne altre, modificando l'elenco
`FAMILIES` in cima al file. I font simbolo/icone (Wingdings, Segoe MDL2,
Fluent Icons e simili, che non contengono lettere vere e proprie) non sono
inclusi, per evitare di offrire font che produrrebbero testo incomprensibile.

## Pagine: formato reale e reflow automatico
Ogni pagina ha l'altezza **fissa** del formato scelto (A4/Letter/A5/A3, verticale
od orizzontale) — un foglio digitale corrisponde sempre a un foglio fisico
reale, indipendentemente da quanto testo o quante immagini contiene.

Quando il contenuto supera lo spazio della pagina, l'ultimo blocco (paragrafo,
immagine — mai testo tagliato a metà) passa **automaticamente** alla
pagina successiva, creandola se serve; cancellando testo e liberando spazio, il
contenuto risale dalla pagina dopo, e le pagine rimaste vuote vengono rimosse.
Il blocco su cui si sta scrivendo in quel momento non viene mai spostato, per
non far "saltare" la scrittura da sotto le dita. Risultato: si scrive su più
pagine come in un elaboratore testi vero, il documento resta sempre impaginato
correttamente, ed è già pronto per la stampa (ogni pagina video corrisponde a
un foglio stampato).

## Funzionalità principali
- **Seleziona tutto (Ctrl+A)** vale per l'INTERO documento: Ctrl+C/Ctrl+X copiano/tagliano tutte le pagine,
  Canc/scrittura/Ctrl+V sostituiscono, la formattazione si applica a ogni pagina. **Interruzione di pagina**
  (Inserisci, o Ctrl+Invio) divide il testo al cursore su una pagina nuova subito dopo; Backspace all'inizio
  della pagina la rimuove.
- Documento multi-pagina con **reflow automatico** del testo tra le pagine (vedi sopra).
- **Conferme chiare invece degli alert del browser**: eliminare o svuotare una
  pagina con del contenuto (anche solo poche lettere) chiede sempre conferma con
  un pannello dedicato — bottone verde "Sì" per procedere, rosso "No" per annullare.
- **Navigatore con miniature aggiornate in tempo reale** mentre si scrive, con un
  breve ritardo per non ricalcolare ad ogni carattere (aggiorna solo la pagina
  attiva, non l'intero elenco).
- Formattazione completa: grassetto/corsivo/sottolineato, colori, evidenziazione,
  dimensione font esatta (pt/px), interlinea, spaziatura, stili rapidi, liste,
  allineamenti, blocchi (titoli, citazione, codice).
- **Immagini**: ridimensionabili con il cursore (4 maniglie d'angolo che
  mantengono le proporzioni, 4 sui bordi per un solo asse alla volta) e
  spostabili liberamente per tutta la pagina (floating). Tabelle e
  inserimento link non sono più funzionalità dell'editor.
- **Font locali illimitati**, rilevati automaticamente da `fonts/` con qualsiasi
  estensione valida (vedi sopra). Il pacchetto include solo font con licenza libera
  (vedi THIRD_PARTY_NOTICES.md); aggiungi qui i tuoi, ma non distribuire font proprietari.
- **Trova & Sostituisci** con evidenziazione e navigazione risultati.
- **Zoom**, **navigatore** con miniature reali, **tema chiaro/scuro/automatico**.
- **Salvataggio automatico** locale (localStorage) con indicatore di stato.
- **"Salva come…"** con pannello dedicato: nome file (2-140 caratteri, validato) e
  scelta del formato tra **.blab** (formato nativo di BlaBla: lo stesso JSON usato da
  autosave/undo, scritto su file — riaprirlo riproduce ESATTAMENTE formattazione,
  stile, font, testo e immagini, senza alcuna conversione) e **PDF**. Non esporta più
  in DOCX/TXT/Markdown/HTML.
- **Tabelle**: non più creabili dall'interfaccia (nessun bottone "Inserisci tabella"),
  ma se arrivano da un file importato (DOCX/DOC/RTF) o da un incolla da un'altra app
  restano pienamente modificabili — cliccando in una cella si scrive come in
  qualunque altro testo, e una mini-barra permette di aggiungere/togliere righe e
  colonne o eliminare l'intera tabella. Una tabella nidificata dentro un'altra viene
  comunque appiattita (un paragrafo per riga): niente tabelle annidate.
- **Link**: rimosso del tutto, anche in importazione/incolla — diventa testo semplice.
- **Import universale con rilevamento automatico**: **DOCX** (formato pagina e margini
  letti direttamente dal file sorgente e applicati al documento), **DOC** legacy
  (Word 97-2003: estrazione testo offline, senza dipendenze esterne — solo testo,
  niente formattazione, essendo un formato binario), **RTF** (parser dedicato:
  grassetto/corsivo/sottolineato e caratteri accentati/Unicode preservati), **PDF**
  e **TXT**.
- **Import PDF e OCR (ita+eng) con motore di layout** (`engine/pdfengine.js`): un PDF
  non contiene tabelle né paragrafi, solo glifi e tracciati posizionati; il motore li
  ricostruisce e li rende come contenuto modificabile che **sta sempre dentro la pagina**
  (formato, margini e scala vengono scelti perché ogni pagina sorgente entri nel foglio
  dell'editor — niente più contenuto deformato o tagliato).
  - **Tabelle vere**: righe di griglia da PDF vettoriale (operator list di pdf.js) e,
    per le pagine scansionate/immagine, direttamente dai pixel; celle unite
    (`rowspan`/`colspan`), bordi per lato con il loro spessore, colori di sfondo,
    intestazioni di riga/colonna fuori dalla griglia (es. giorni e orari di un orario
    scolastico). Supporta anche tabelle senza cornice (solo filetti verticali) e tabelle
    "senza bordi" riconosciute dall'allineamento del testo.
  - **Testo**: righe → paragrafi (rientri, a capo forzati, sillabazione), titoli
    (`h1–h3`) dal corpo, grassetto/corsivo, allineamento (sinistra/centro/destra),
    interlinea e spaziature; ordine di lettura a **colonne** (taglio XY) e righe con più
    parti (piè di pagina con "Pag. 1/36" a destra).
  - **Figure**: immagini incorporate e grafica vettoriale (loghi, icone, forme) come
    immagini affiancate al testo; il testo scritto sopra una foto/forma piena resta
    nell'immagine invece di duplicarsi.
  - **OCR (Tesseract ita+eng, offline)** per le pagine senza testo: la scala di
    rasterizzazione si calibra sull'altezza reale dei caratteri; le celle di tabella
    si leggono una per una (in parallelo su più worker) con le righe di griglia
    cancellate; il resto della pagina è segmentato in righe/blocchi (le zone non
    testuali diventano figure). Parole a bassa confidenza o rumore di scansione
    vengono scartate.
  - **Scansioni storte**: pagine inclinate (fino a ±6°) o girate di 90°/180° vengono
    raddrizzate prima dell'analisi; ogni fascia di pagina (es. ogni tabella
    fotocopiata a modo suo) ha la sua inclinazione. Bordi di celle sfalsati tra una
    colonna e l'altra (tabelle "storte") vengono riallineati in un'unica griglia, le righe
    doppie/sottilissime fuse, e se una scansione ha già un livello di testo OCR scadente
    viene rifatta la lettura da zero. Le celle poco leggibili (testo sfocato o in
    grassetto impastato) hanno un secondo tentativo a scala ridotta e contrasto esteso.
  - **Robustezza**: se l'analisi di una pagina fallisce, la pagina viene inserita come
    immagine (nessuna perdita di contenuto); pagine con testo verticale idem.
  - **Tabelle alte più di una pagina** si dividono automaticamente per righe tra le
    pagine dell'editor (senza spezzare celle unite in verticale), e le operazioni
    aggiungi/elimina riga/colonna rispettano le celle unite.
  *Limiti noti*: è comunque ricostruzione euristica (un PDF non dichiara le tabelle);
  l'OCR può sbagliare qualche carattere nei documenti a bassa risoluzione (es. `V`/`W`,
  `.`/`,`) e non distingue grassetto/corsivo; il testo sovrapposto a più livelli
  grafici complessi può finire dentro l'immagine; tabelle con soli filetti orizzontali
  non sono ancora riconosciute come tabelle vere.
  **Sia "Apri" che "OCR PDF" analizzano ogni pagina**: quelle con testo vero sono lette
  senza rasterizzare; l'OCR scatta solo dove manca il testo (o dove il testo è solo
  l'intestazione di una pagina-immagine).
- **Immagini e testo su livelli separati**: allineare un'immagine (sinistra/centro/
  destra) o trascinarla non sposta più il testo circostante — possono sovrapporsi,
  sta a chi scrive deciderlo.
- **Stampa** fedele: formato pagina (`@page`) sincronizzato con quello del documento
  (A4/Letter/A5/A3, verticale/orizzontale), CSS dedicato che rimuove l'interfaccia e
  azzera lo zoom.
- Finestra **"Scorciatoie da tastiera"** richiamabile in ogni momento (icona ⌨
  in alto a destra, o tasto `F1`).

## Scorciatoie
| Tasti | Azione |
|---|---|
| `Ctrl/Cmd + N` | Nuovo documento |
| `Ctrl/Cmd + O` | Apri file |
| `Ctrl/Cmd + S` | Salva ora |
| `Ctrl/Cmd + P` | Stampa |
| `Ctrl/Cmd + Z` / `Y` (o `Shift+Z`) | Annulla / Ripeti |
| `Ctrl/Cmd + F` | Trova & Sostituisci |
| `Ctrl/Cmd + K` | Inserisci link |
| `Ctrl/Cmd + B/I/U` | Grassetto / Corsivo / Sottolineato |
| `Ctrl/Cmd + +/−/0` | Zoom avanti / indietro / reimposta 100% |
| `F1` | Scorciatoie da tastiera |

## Note offline
Le funzioni avanzate (import DOCX/PDF, export PDF, OCR) scaricano le librerie da
CDN alla prima esecuzione. Per il **100% offline** copia i file indicati in
`vendor/README.txt` dentro la cartella `vendor/`. L'import **DOC** e **RTF** non
scarica nulla: sono implementati con codice proprio, sempre disponibili anche
offline dal primo avvio.
