==============================================================================
 BlaBla — Editor Documenti — Dipendenze esterne (cartella vendor/)
==============================================================================

L'editor funziona SUBITO con un doppio clic su ../blabla.html, anche offline,
per tutte le funzioni di base (scrittura, formattazione, tabelle, immagini,
salvataggio automatico, stampa).

Alcune funzioni AVANZATE usano librerie esterne caricate "on demand":

  • Importa DOCX ..................... mammoth.js (.DOC e .RTF sono invece
                                        gestiti con codice proprio, sempre
                                        offline, senza librerie esterne)
  • Importa / anteprima / OCR PDF ..... pdf.js (pdfjs-dist)
  • Esporta PDF ....................... html2canvas + jsPDF
  • Lettura del pacchetto DOCX ......... JSZip
  • OCR di PDF scansionati ............ tesseract.js

IMPORTANTE: tutte le librerie vengono SEMPRE caricate da questa cartella (nessun CDN):
la politica di sicurezza della pagina (CSP) vieta di scaricare codice da internet.
I file elencati sotto, più la cartella tesseract/ (worker e core WASM) e tessdata/
(modelli lingua), devono quindi essere presenti. tools/build_exe.py li scarica da solo.

------------------------------------------------------------------------------
FUNZIONAMENTO 100% OFFLINE (opzionale)
------------------------------------------------------------------------------
Per usare anche le funzioni avanzate SENZA rete, scarica i file seguenti e
mettili DENTRO questa cartella vendor/ con ESATTAMENTE questi nomi:

  pdf.min.js               (pdfjs-dist 3.11.174 -> build/pdf.min.js)
  pdf.worker.min.js        (pdfjs-dist 3.11.174 -> build/pdf.worker.min.js)
  mammoth.browser.min.js   (mammoth 1.8.0       -> mammoth.browser.min.js)
  html2canvas.min.js       (html2canvas 1.4.1   -> dist/html2canvas.min.js)
  jspdf.umd.min.js         (jspdf 2.5.2         -> dist/jspdf.umd.min.js)
  jszip.min.js             (jszip 3.10.1        -> dist/jszip.min.js)
  tesseract.min.js         (tesseract.js 5.1.1  -> dist/tesseract.min.js)
  tesseract/worker.min.js  (tesseract.js 5.1.1  -> dist/worker.min.js)
  tesseract/tesseract-core{,-simd}{,-lstm}.wasm.js   (tesseract.js-core 5.1.1)
  tessdata/ita.traineddata.gz, eng.traineddata.gz     (modelli lingua)

URL diretti (apri in un browser connesso e salva con il nome indicato sopra):

  https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js
  https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js
  https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js
  https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js
  https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js
  https://unpkg.com/jszip@3.10.1/dist/jszip.min.js
  https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js

Nota: pdf.min.js e pdf.worker.min.js vanno tenuti in coppia (stessa versione).

------------------------------------------------------------------------------
OCR completamente offline
------------------------------------------------------------------------------
Il motore OCR scarica normalmente i "modelli lingua" (italiano e inglese) da
internet al primo utilizzo. Per renderlo disponibile offline, crea la cartella

  vendor/tessdata/

e mettici dentro questi due file (stesso nome, esattamente):

  https://tessdata.projectnaptha.com/4.0.0/ita.traineddata.gz
  https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz

Se presenti, l'app li usa al posto del download; altrimenti l'OCR scarica i
modelli come sempre (serve connessione solo la prima volta che lo usi). Lo
script tools/build_exe.py scarica questi file automaticamente durante la
creazione del pacchetto .exe, se non sono già presenti.

La cartella vendor/fonts/ è riservata a eventuali font locali aggiuntivi.
==============================================================================
