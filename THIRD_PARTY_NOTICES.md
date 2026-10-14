# Componenti di terze parti

BlaBla include le librerie seguenti (cartella `vendor/` e `FontCreator/`). Ciascuna resta soggetta alla propria
licenza; i testi completi vanno distribuiti insieme al programma.

| Componente | Versione | Licenza | Uso |
|---|---|---|---|
| PDF.js (Mozilla) | 3.11.174 | Apache-2.0 | lettura/analisi PDF |
| mammoth.js | 1.8.0 | BSD-2-Clause | importazione DOCX |
| html2canvas | 1.4.1 | MIT | esportazione PDF (rasterizzazione pagine) |
| jsPDF | 2.5.2 | MIT | esportazione PDF |
| JSZip | 3.10.1 | MIT *oppure* GPL-3.0 (doppia licenza: si adotta MIT) | lettura DOCX |
| Tesseract.js / Tesseract.js-core | 5.1.1 | Apache-2.0 | OCR (worker e core WASM in `vendor/tesseract/`) |
| Modelli lingua Tesseract `ita`, `eng` | 4.0.0 | Apache-2.0 | OCR (`vendor/tessdata/`) |
| opentype.js | — | MIT | FontCreator |
| pywebview (solo exe) | — | BSD-3-Clause | finestra desktop |
| PyInstaller (solo exe) | 6.8.0 | GPL-2.0 con eccezione per il bootloader | creazione dell'exe |

## Font (cartella `fonts/`)

I 132 font inclusi hanno licenza libera (SIL OFL 1.1, Apache-2.0, MIT/Bitstream Vera o equivalenti: Google Fonts,
Noto, Source, Fira, JetBrains Mono, Hack, Cascadia, ecc.); l'avviso di copyright e di licenza di ciascuno è
incorporato nel file del font. I font proprietari (Microsoft/Monotype/HP/Intel/…) sono stati rimossi dal progetto
(non reintrodurli nel repository né nei pacchetti). L'elenco con la classificazione
è in `tools/fonts_license_report.csv`.
