# Changelog

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
