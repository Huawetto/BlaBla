# Changelog

## 1.1.1 — 2026-11-26
Prestazioni sui PC deboli o vecchi, e finestra a schermo intero.
- **Scrittura molto piu' fluida nei documenti lunghi** (circa 20 volte meno lavoro per tasto in un documento di 56 pagine
  su un PC lento): le miniature del navigatore si creano solo quando sono visibili, le pagine sono isolate fra loro per
  il motore di impaginazione, il conteggio di parole/righe e la posizione del cursore si aggiornano a gruppi.
- **Molta meno memoria**: la cronologia annulla/ripeti tiene le immagini una volta sola (con foto grandi si passava da
  centinaia di MB a pochi), conserva meno passi nei documenti pesanti; il salvataggio automatico non duplica piu' il
  documento nell'archivio del browser quando lo scrive gia' su file; l'OCR usa meno processi con poca RAM.
- **Avvio senza copia dei file**: l'app non copia piu' ~200 MB in `%LOCALAPPDATA%\BlaBla` (serviva spazio libero sul disco
  e tempo ad ogni aggiornamento): resta li' solo cio' che e' dell'utente (documento, font creati o aggiunti). La copia
  vecchia viene tolta automaticamente.
- **Modalita' a basso consumo** di WebView2 sui PC con 8 GB di RAM o meno (disattivabile con la variabile
  `BLABLA_FULL_POWER=1`).
- **Schermo intero**: la pagina si adatta alla larghezza della finestra (fino al 150%, e si riduce su schermi piccoli);
  nuovo pulsante **Adatta** in Visualizza. Se scegli uno zoom a mano resta quello.
- Tolti l'installatore e il disinstallatore: resta lo zip portatile (si aggiorna sostituendo la cartella).

## 1.1.0 — 2026-11-13
**Documenti**
- Intestazioni, piè di pagina e numeri di pagina; sommario automatico; note a piè di pagina.
- Esportazione **DOCX** modificabile (titoli, elenchi, tabelle, immagini con didascalie, intestazioni, sommario, note).
- Esportazione **PDF con testo vero** nell'app desktop (motore di stampa di WebView2); il PDF-immagine resta per il browser.
- Selezione col mouse (e Maiusc+clic) attraverso più pagine; Ctrl+A/copia/taglia/incolla tra pagine più affidabili.
- Stili di paragrafo personalizzati; modelli (lettera, relazione, CV, verbale, avviso), in italiano e inglese.
- Immagini: testo che scorre a fianco, sopra/sotto o libero; testo alternativo; didascalie numerate; ritaglio.
- Cronologia versioni con ripristino (ogni 10 minuti, prima di aprire un file o creare un documento, e a richiesta).
- Lingua del documento e correttore ortografico a scelta.

**PDF e OCR**
- Pannello con la pagina originale accanto al testo ricostruito.
- Parole lette con poca sicurezza dall'OCR evidenziate; F8 / Maiusc+F8 per scorrerle, «Conferma» e «Conferma tutte».
- Apertura di più PDF insieme in un solo documento.

**App**
- Interfaccia in **inglese** (pulsante IT/EN).
- Controllo aggiornamenti (una volta al giorno, solo avviso, si può spegnere).
- Distribuzione: programma «a cartella» che parte in 2-3 secondi, **installatore** per utente con disinstallatore
  (silenzioso con `/S`), zip portatile e `SHA256SUMS.txt`; workflow GitHub per costruire e pubblicare le release,
  con firma SignPath predisposta (vedi `docs/SIGNING.md`).
- Le funzioni nuove stanno in `modules/` e usano solo l'API pubblica `window.BB`.

## 1.0.1 — 2026-11-07
- **Tabelle**: le righe che arrivano a fine pagina vanno a capo sulla pagina successiva (prima restavano a metà o
  oltre il foglio, soprattutto aggiungendo righe a mano o scrivendo nelle celle). Funziona anche con `thead`,
  più `tbody` e `tfoot`.

## 1.0.0 — 2026-10-14
Prima versione pubblica.

- Editor multi-pagina con reflow automatico, formattazione, immagini, tabelle modificabili, Trova & Sostituisci,
  tema chiaro/scuro, salvataggio automatico, formato nativo `.blab`, esportazione PDF, stampa.
- Importazione DOCX, DOC, RTF, TXT e PDF; **motore di layout PDF** (tabelle con celle unite, colonne, figure,
  scansioni inclinate, OCR italiano/inglese offline).
- Ctrl+A seleziona l'intero documento (copia/taglia/incolla/formatta su tutte le pagine); interruzione di pagina
  vera al cursore (Ctrl+Invio).
- FontCreator: disegna un font e usalo nel documento ("I miei font").
- Sicurezza: sanificazione di ogni HTML in ingresso, Content-Security-Policy, nessun CDN, server locale che
  risponde solo a localhost.
- App desktop per Windows (`BlaBla.exe`), senza installazione e senza internet.
- Pacchetto con soli font a licenza libera (vedi `THIRD_PARTY_NOTICES.md`).
