"""
Installatore di BlaBla (per-utente: nessun permesso di amministratore).

Contiene (come payload.zip) il programma gia' pronto e lo estrae in %LOCALAPPDATA%\\Programs\\BlaBla (o dove
scegli), crea i collegamenti nel menu Start e, a scelta, sul Desktop, e registra la voce in «App installate» per
poter disinstallare. Funziona anche senza interfaccia:

    BlaBla-Setup.exe /S                 installazione silenziosa (collegamento sul Desktop incluso)
    BlaBla-Setup.exe /S /NODESKTOP      senza collegamento sul Desktop
    BlaBla-Setup.exe /S /D=C:\\Cartella   in una cartella a scelta
"""
import ctypes
import os
import subprocess
import sys
import threading
import time
import zipfile

APP = "BlaBla"
REG_KEY = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\BlaBla"


def resource(name):
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, name)


def read_meta():
    meta = {"version": "1.0.0"}
    try:
        with open(resource("payload.meta"), encoding="utf-8") as f:
            for line in f:
                if "=" in line:
                    k, v = line.strip().split("=", 1)
                    meta[k] = v
    except OSError:
        pass
    return meta


def flag(name):
    return name.lower() in [a.lower() for a in sys.argv[1:]]


def arg_value(prefix):
    for a in sys.argv[1:]:
        if a.lower().startswith(prefix.lower()):
            return a[len(prefix):].strip('"')
    return None


def default_dir():
    return os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "Programs", APP)


def running():
    try:
        out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq " + APP + ".exe"], capture_output=True, text=True,
                             creationflags=0x08000000).stdout
        return (APP + ".exe").lower() in out.lower()
    except Exception:
        return False


def make_shortcut(path, target, workdir, icon):
    ps = ("$s=(New-Object -COM WScript.Shell).CreateShortcut('%s');$s.TargetPath='%s';$s.WorkingDirectory='%s';"
          "$s.IconLocation='%s';$s.Description='BlaBla - Editor Documenti';$s.Save()") % (
        path.replace("'", "''"), target.replace("'", "''"), workdir.replace("'", "''"), icon.replace("'", "''"))
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, timeout=60, creationflags=0x08000000)


def desktop_dir():
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-Command", "[Environment]::GetFolderPath('Desktop')"],
                             capture_output=True, text=True, timeout=15, creationflags=0x08000000).stdout.strip()
        if out:
            return out
    except Exception:
        pass
    return os.path.join(os.path.expanduser("~"), "Desktop")


def dir_size_kb(path):
    total = 0
    for r, _d, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(r, f))
            except OSError:
                pass
    return total // 1024


def install(target, desktop, progress=None, meta=None):
    meta = meta or read_meta()
    os.makedirs(target, exist_ok=True)
    with zipfile.ZipFile(resource("payload.zip")) as z:
        names = z.namelist()
        for i, n in enumerate(names):
            z.extract(n, target)
            if progress and (i % 40 == 0 or i == len(names) - 1):
                progress(int(80 * (i + 1) / len(names)), "Copia dei file…")
    exe = os.path.join(target, APP + ".exe")
    unins = os.path.join(target, "Uninstall " + APP + ".exe")
    if progress:
        progress(85, "Creazione dei collegamenti…")
    start = os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs")
    os.makedirs(start, exist_ok=True)
    make_shortcut(os.path.join(start, APP + ".lnk"), exe, target, exe)
    if desktop:
        make_shortcut(os.path.join(desktop_dir(), APP + ".lnk"), exe, target, exe)
    if progress:
        progress(95, "Registrazione in «App installate»…")
    try:
        import winreg
        k = winreg.CreateKey(winreg.HKEY_CURRENT_USER, REG_KEY)
        for name, val in (("DisplayName", APP), ("DisplayVersion", meta.get("version", "")), ("Publisher", "BlaBla contributors"),
                          ("InstallLocation", target), ("DisplayIcon", exe), ("UninstallString", '"%s"' % unins),
                          ("QuietUninstallString", '"%s" /S' % unins)):
            winreg.SetValueEx(k, name, 0, winreg.REG_SZ, val)
        winreg.SetValueEx(k, "NoModify", 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(k, "NoRepair", 0, winreg.REG_DWORD, 1)
        winreg.SetValueEx(k, "EstimatedSize", 0, winreg.REG_DWORD, dir_size_kb(target))
        winreg.CloseKey(k)
    except Exception:
        pass
    if progress:
        progress(100, "Fatto")
    return exe


def run_silent():
    target = arg_value("/D=") or default_dir()
    if running():
        subprocess.run(["taskkill", "/F", "/IM", APP + ".exe"], capture_output=True, creationflags=0x08000000)
        time.sleep(1.0)
    install(target, desktop=not flag("/NODESKTOP"))


def run_gui():
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
    meta = read_meta()
    root = tk.Tk()
    root.title("Installazione di " + APP + " " + meta.get("version", ""))
    root.resizable(False, False)
    try:
        root.iconbitmap(resource("icon.ico"))
    except Exception:
        pass
    pad = {"padx": 18}
    ttk.Label(root, text=APP, font=("Segoe UI", 20, "bold")).pack(anchor="w", pady=(16, 0), **pad)
    ttk.Label(root, text="Editor di documenti • versione " + meta.get("version", ""), foreground="#5b6470").pack(anchor="w", **pad)
    ttk.Label(root, text="Cartella di installazione", font=("Segoe UI", 9, "bold")).pack(anchor="w", pady=(16, 2), **pad)
    row = ttk.Frame(root)
    row.pack(fill="x", **pad)
    var_dir = tk.StringVar(value=default_dir())
    ttk.Entry(row, textvariable=var_dir, width=52).pack(side="left", fill="x", expand=True)

    def browse():
        d = filedialog.askdirectory(initialdir=os.path.dirname(var_dir.get()) or None, title="Scegli la cartella")
        if d:
            var_dir.set(os.path.join(d, APP) if os.path.basename(d).lower() != APP.lower() else d)
    ttk.Button(row, text="Sfoglia…", command=browse).pack(side="left", padx=(6, 0))
    var_desk = tk.BooleanVar(value=True)
    var_run = tk.BooleanVar(value=True)
    ttk.Checkbutton(root, text="Crea un collegamento sul Desktop", variable=var_desk).pack(anchor="w", pady=(14, 0), **pad)
    ttk.Checkbutton(root, text="Avvia " + APP + " al termine", variable=var_run).pack(anchor="w", **pad)
    ttk.Label(root, text="Non servono i permessi di amministratore. Funziona senza internet.", foreground="#5b6470").pack(anchor="w", pady=(10, 0), **pad)
    bar = ttk.Progressbar(root, length=420, maximum=100)
    bar.pack(pady=(16, 2), **pad)
    status = ttk.Label(root, text="Pronto per l'installazione", foreground="#5b6470")
    status.pack(anchor="w", **pad)
    btns = ttk.Frame(root)
    btns.pack(fill="x", pady=16, **pad)
    b_install = ttk.Button(btns, text="Installa")
    b_install.pack(side="right")
    ttk.Button(btns, text="Annulla", command=root.destroy).pack(side="right", padx=8)

    def progress(v, text):
        root.after(0, lambda: (bar.configure(value=v), status.configure(text=text)))

    def work(target, desktop, launch):
        try:
            exe = install(target, desktop, progress, meta)
            root.after(0, lambda: finish(exe, launch))
        except Exception as e:  # noqa: BLE001
            root.after(0, lambda: (messagebox.showerror(APP, "Installazione non riuscita:\n" + str(e)), b_install.configure(state="normal")))

    def finish(exe, launch):
        if launch:
            subprocess.Popen([exe], cwd=os.path.dirname(exe), creationflags=0x00000008)
        root.destroy()

    def go():
        target = var_dir.get().strip()
        if not target:
            return
        if running():
            if not messagebox.askokcancel(APP, APP + " e' aperto: verra' chiuso per l'aggiornamento. Salva il lavoro e poi premi OK."):
                return
            subprocess.run(["taskkill", "/F", "/IM", APP + ".exe"], capture_output=True, creationflags=0x08000000)
            time.sleep(1.0)
        b_install.configure(state="disabled")
        threading.Thread(target=work, args=(target, var_desk.get(), var_run.get()), daemon=True).start()
    b_install.configure(command=go)
    root.update_idletasks()
    w, h = root.winfo_width(), root.winfo_height()
    root.geometry("+%d+%d" % ((root.winfo_screenwidth() - w) // 2, (root.winfo_screenheight() - h) // 3))
    root.mainloop()


def main():
    if flag("/S"):
        run_silent()
    else:
        run_gui()


if __name__ == "__main__":
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass
    main()
