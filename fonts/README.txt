============================================================================
 BlaBla — Cartella FONT del documento
============================================================================

Tutti i font validi messi in questa cartella vengono caricati AUTOMATICAMENTE
all'avvio di blabla.html, con qualsiasi estensione supportata:

    .ttf  .otf  .woff  .woff2  .ttc

Il nome del font nell'elenco e' il nome del file senza estensione.
Esempio:  Roboto-Regular.ttf  ->  font "Roboto-Regular"

------------------------------------------------------------------------------
COME FUNZIONA IL CARICAMENTO AUTOMATICO
------------------------------------------------------------------------------
Aprendo blabla.html con un DOPPIO CLIC (indirizzo file://), il browser per
sicurezza non permette di leggere da solo il contenuto di una cartella.
Per questo l'elenco dei font vive nel file "fonts.js" (window.BB_FONTS = [...]),
che viene incluso come un normale <script> — funziona anche su file://.

Il file fonts.js e' GIA' COMPILATO con tutti i font attualmente presenti in
questa cartella: non devi fare nulla per usarli, basta aprire blabla.html.

------------------------------------------------------------------------------
QUANDO AGGIUNGI O RIMUOVI FONT
------------------------------------------------------------------------------
Dopo aver copiato nuovi file in questa cartella (o rimossi), rigenera l'elenco
con un doppio clic su:

    tools\update-fonts.bat   (nella cartella principale del progetto)

poi ricarica blabla.html.

Per aggiungere in blocco altri font open source (Google Fonts, licenza OFL,
liberamente ridistribuibili), vedi tools\fetch-new-fonts.py: scarica le
famiglie elencate al suo interno saltando quelle gia' presenti, poi basta
rigenerare fonts.js come sopra.

------------------------------------------------------------------------------
NOTE
------------------------------------------------------------------------------
- Se fonts.js e' vuoto o mancante, resta disponibile solo il set di font di
  sistema predefinito (Calibri, Arial, ecc.): nessun errore.
- Font con tabelle interne corrotte (capita con alcuni vecchi .ttf di sistema)
  possono essere rifiutati dal browser: non e' un problema di BlaBla, il file
  va sostituito con una copia valida del font.
- I font aggiunti tramite tools\fetch-new-fonts.py provengono da Google Fonts
  e sono rilasciati con licenza open source (perlopiu' SIL Open Font License):
  liberi da usare, modificare e ridistribuire anche con il documento finale.
============================================================================


LICENZE: il pacchetto distribuito contiene solo font con licenza libera (OFL/Apache/MIT). Puoi aggiungere i tuoi
font in questa cartella per uso personale, ma NON ridistribuire font proprietari (es. quelli di Windows/Office).
Elenco e classificazione: tools/fonts_license_report.csv.
