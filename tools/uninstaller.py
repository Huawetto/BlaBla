"""
Disinstallatore di BlaBla (per-utente, senza amministratore).

Toglie i file del programma, i collegamenti (Start e Desktop) e la voce in "App installate". Chiede se
eliminare anche i dati dell'utente (documento salvato automaticamente, font creati, versioni).

Parte dalla cartella di installazione: per poterla cancellare si copia in una cartella temporanea e da lì
fa il lavoro (un programma non puo' cancellare il file che sta eseguendo).

Uso:  "Uninstall BlaBla.exe"            (con finestra)
      "Uninstall BlaBla.exe" /S         (silenzioso: tiene i dati dell'utente; /S /PURGE li elimina)
"""
import ctypes
import os
import shutil
import subprocess
import sys
import tempfile
import time

APP = "BlaBla"
REG_KEY = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\BlaBla"


def _flag(name):
    return name.lower() in [a.lower() for a in sys.argv[1:]]


def _arg_value(prefix):
    for a in sys.argv[1:]:
        if a.lower().startswith(prefix.lower()):
            return a[len(prefix):].strip('"')
    return None


def _msgbox(text, title=APP, flags=0x40):
    return ctypes.windll.user32.MessageBoxW(0, text, title, flags)


def _user_data_dir():
    return os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), APP)


def _remove_shortcuts():
    start = os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs", APP + ".lnk")
    desk = os.path.join(os.path.expanduser("~"), "Desktop", APP + ".lnk")
    for p in (start, desk):
        try:
            if os.path.exists(p):
                os.remove(p)
        except OSError:
            pass
    try:                                           # il desktop puo' essere reindirizzato (OneDrive)
        out = subprocess.run(["powershell", "-NoProfile", "-Command", "[Environment]::GetFolderPath('Desktop')"],
                             capture_output=True, text=True, timeout=15, creationflags=0x08000000).stdout.strip()
        p = os.path.join(out, APP + ".lnk")
        if out and os.path.exists(p):
            os.remove(p)
    except Exception:
        pass


def _remove_registry():
    try:
        import winreg
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, REG_KEY)
    except Exception:
        pass


def _stop_running(install_dir):
    """Chiude BlaBla.exe se e' in esecuzione dalla cartella da rimuovere."""
    try:
        subprocess.run(["taskkill", "/F", "/IM", APP + ".exe"], capture_output=True, creationflags=0x08000000)
    except Exception:
        pass
    time.sleep(1.0)


def _do_remove(install_dir, purge, silent):
    _stop_running(install_dir)
    for _ in range(6):                             # i file possono restare bloccati qualche istante
        shutil.rmtree(install_dir, ignore_errors=True)
        if not os.path.exists(install_dir):
            break
        time.sleep(1.0)
    _remove_shortcuts()
    _remove_registry()
    if purge:
        shutil.rmtree(_user_data_dir(), ignore_errors=True)
    if not silent:
        _msgbox(APP + " e' stato rimosso." + ("" if purge else "\n\nI tuoi documenti e font sono rimasti in:\n" + _user_data_dir()))


def main():
    silent = _flag("/S")
    target = _arg_value("--remove=")
    if target:                                     # seconda fase: eseguita dalla copia in %TEMP%
        _do_remove(target, _flag("--purge") or _flag("/PURGE"), silent)
        return
    install_dir = os.path.dirname(os.path.abspath(sys.executable))
    purge = _flag("/PURGE")
    if not silent:
        if _msgbox("Vuoi rimuovere " + APP + " da questo computer?", "Disinstalla " + APP, 0x24) != 6:      # Si/No, icona ?
            return
        if os.path.isdir(_user_data_dir()):
            purge = _msgbox("Eliminare anche i tuoi dati (documento salvato automaticamente, font creati, cronologia versioni)?\n\n"
                            "«No» li conserva: li ritroverai se reinstalli " + APP + ".", "Dati dell'utente", 0x24) == 6
    tmp = os.path.join(tempfile.mkdtemp(prefix="bb_unins_"), "unins.exe")
    shutil.copy2(sys.executable, tmp)
    args = [tmp, "--remove=" + install_dir] + (["--purge"] if purge else []) + (["/S"] if silent else [])
    subprocess.Popen(args, creationflags=0x00000008 | 0x08000000, close_fds=True)


if __name__ == "__main__":
    main()
