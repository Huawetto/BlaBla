# Firma digitale di BlaBla

Gli `.exe` di BlaBla non sono firmati finché non si completa la procedura qui sotto, perciò Windows SmartScreen può
mostrare «Editore sconosciuto» (**Ulteriori informazioni → Esegui comunque**). Con una firma l'avviso scompare
gradualmente man mano che il programma guadagna reputazione.

## Opzione consigliata: SignPath Foundation (gratuita per progetti open source)

1. Chiedi l'accesso su <https://signpath.org/> (programma «SignPath Foundation» per software open source: serve il
   repository pubblico con licenza OSI — BlaBla è MIT — e una descrizione del progetto).
2. Ad approvazione avvenuta crea in SignPath un **progetto** collegato al repository e una **signing policy**
   (es. `release-signing`) che accetta gli artefatti del workflow `Release`.
3. In GitHub, *Settings → Secrets and variables → Actions*:
   - segreto `SIGNPATH_API_TOKEN` (token API di un utente SignPath con permesso di invio);
   - variabili `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG`.
4. Pubblica un tag (`git tag v1.1.0 && git push --tags`): il workflow `.github/workflows/release.yml` costruisce
   l'installatore, lo invia a SignPath, scarica quello firmato, ricalcola `SHA256SUMS.txt` e allega tutto alla release.
   Se `SIGNPATH_ORGANIZATION_ID` non è impostata il passaggio di firma viene semplicemente saltato.

> Nota: con SignPath il certificato appartiene alla Foundation, non al progetto. La firma copre l'installatore
> (`BlaBla-Setup-*.exe`); il programma dentro lo zip portatile e l'installato restano quelli compilati dal workflow.
> Per firmare anche `BlaBla.exe` e `Uninstall BlaBla.exe` si possono inviare a SignPath in un secondo passaggio prima
> della creazione del pacchetto.

## Alternativa: certificato proprio

Con un certificato di firma del codice in un file `.pfx` (e `signtool` dal Windows SDK nel `PATH`):

```powershell
$env:BB_SIGN_PFX = "C:\percorso\certificato.pfx"
$env:BB_SIGN_PASSWORD = "…"
python tools/build_exe.py
```

`tools/build_exe.py` firma `BlaBla.exe`, `Uninstall BlaBla.exe` e l'installatore (con marca temporale).

## Verifica

```powershell
Get-AuthenticodeSignature .\BlaBla-Setup-1.1.0.exe | Format-List
Get-FileHash .\BlaBla-Setup-1.1.0.exe -Algorithm SHA256     # confronta con SHA256SUMS.txt
```
