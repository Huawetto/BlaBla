# Firma digitale di BlaBla

Gli `.exe` di BlaBla non sono firmati, perciò Windows SmartScreen può mostrare «Editore sconosciuto»
(**Ulteriori informazioni → Esegui comunque**). Con una firma l'avviso scompare gradualmente man mano che il
programma guadagna reputazione.

## Con un certificato proprio

Serve un certificato di firma del codice in un file `.pfx` e `signtool` (Windows SDK) nel `PATH`:

```powershell
$env:BB_SIGN_PFX = "C:\percorso\certificato.pfx"
$env:BB_SIGN_PASSWORD = "…"
python tools/build_exe.py
```

`tools/build_exe.py` firma `BlaBla.exe` (con marca temporale) prima di creare lo zip.

## Gratis per progetti open source

[SignPath Foundation](https://signpath.org/) firma gratuitamente i progetti open source con licenza OSI (BlaBla è
MIT): serve la richiesta di accesso, che solo il proprietario del repository può fare. Una volta approvata, `BlaBla.exe`
va inviato a SignPath nel workflow (`signpath/github-action-submit-signing-request`) prima del passaggio che crea lo zip.

## Verifica

```powershell
Get-AuthenticodeSignature .\BlaBla\BlaBla.exe | Format-List
Get-FileHash .\BlaBla-1.1.1-portable.zip -Algorithm SHA256     # confronta con SHA256SUMS.txt
```
