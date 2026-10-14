# BlaBla — rigenera fonts/fonts.js scansionando la cartella fonts/
# Uso: doppio clic su questo file (o "powershell -File tools\update-fonts.ps1").
# Serve solo quando apri blabla.html con doppio clic (file://): il browser non
# puo leggere da solo il contenuto di una cartella, quindi l'elenco dei font
# viene tenuto in fonts/fonts.js e va rigenerato dopo aver aggiunto/rimosso file.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $PSScriptRoot }
$fontsDir = Join-Path (Split-Path -Parent $PSScriptRoot) "fonts"
if (-not (Test-Path $fontsDir)) { $fontsDir = Join-Path $PSScriptRoot "..\fonts" }

$validExt = @(".ttf", ".otf", ".woff", ".woff2", ".ttc")
$files = Get-ChildItem -Path $fontsDir -File |
  Where-Object { $validExt -contains $_.Extension.ToLowerInvariant() } |
  Sort-Object Name |
  ForEach-Object { $_.Name }

$jsonLines = ($files | ForEach-Object { '  "' + ($_ -replace '"','\"') + '"' }) -join ",`n"

$content = @"
/* ============================================================================
   BlaBla — elenco dei font locali della cartella "fonts/".

   Generato automaticamente da tools\update-fonts.ps1. Contiene TUTTI i file
   font validi trovati (.ttf .otf .woff .woff2 .ttc).

   QUANDO SERVE QUESTO FILE
   Aprendo "blabla.html" con un DOPPIO CLIC (indirizzo file://), il browser
   per sicurezza non permette di leggere il contenuto di una cartella:
   questo elenco permette comunque il caricamento automatico dei font,
   senza alcuna azione dell'utente.

   Se aggiungi o rimuovi font dalla cartella "fonts/", rilancia questo script
   (doppio clic) per rigenerare il file.
   ============================================================================ */
window.BB_FONTS = [
$jsonLines
];
"@

Set-Content -Path (Join-Path $fontsDir "fonts.js") -Value $content -Encoding UTF8
Write-Host ("Trovati e salvati " + $files.Count + " font in fonts\fonts.js") -ForegroundColor Green
Write-Host "Ricarica blabla.html per vederli nell'editor."
Read-Host "Premi INVIO per chiudere"
