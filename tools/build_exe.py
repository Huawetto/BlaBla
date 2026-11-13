"""
BlaBla — crea i pacchetti per Windows:

    dist/BlaBla/                       programma "a cartella" (si avvia in un attimo: niente estrazione a ogni apertura)
    dist/BlaBla-<ver>-portable.zip     la stessa cartella compressa: si scompatta ovunque e si usa
    dist/BlaBla-Setup-<ver>.exe        installatore (per-utente, senza amministratore) con disinstallatore
    dist/SHA256SUMS.txt                impronte dei file da pubblicare, per verificarli

Il programma include tutta l'app (HTML/CSS/JS, font, e — scaricate da questo script se mancano in vendor/ — le
librerie per import DOCX, PDF, OCR) e NON richiede Python ne' internet sul PC di destinazione: apre BlaBla in una
vera finestra nativa (vedi launcher.py, tramite pywebview) appoggiandosi a un piccolo server locale.

USO
    python tools/build_exe.py                  (con i modelli OCR offline)
    python tools/build_exe.py --skip-ocr-data  (piu' leggero: l'OCR li scarica al primo uso)

Serve internet SOLO per questo script (installare PyInstaller/pywebview e scaricare vendor/ mancante).
Se ci sono i certificati di firma (variabile BB_SIGN_PFX + BB_SIGN_PASSWORD) gli .exe vengono firmati con signtool;
la firma "gratuita" con SignPath si fa dal workflow GitHub (vedi .github/workflows/release.yml e docs/SIGNING.md).
"""
import hashlib
import os
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD_DIR = os.path.join(ROOT, "tools", "_build")
STAGE_DIR = os.path.join(BUILD_DIR, "app")

# Librerie opzionali scaricate in vendor/ se mancanti, cosi' l'exe risultante
# funziona offline anche per le funzioni avanzate (vedi vendor/README.txt).
VENDOR_URLS = {
    "pdf.min.js": "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js",
    "pdf.worker.min.js": "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
    "mammoth.browser.min.js": "https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js",
    "html2canvas.min.js": "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js",
    "jspdf.umd.min.js": "https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js",
    "jszip.min.js": "https://unpkg.com/jszip@3.10.1/dist/jszip.min.js",
    "tesseract.min.js": "https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js",
}
# Motore OCR locale (worker + core WASM di Tesseract.js): senza questi file
# tesseract.min.js li scarica da un CDN a ogni uso e l'OCR non e' offline.
TESSERACT_ENGINE_URLS = {
    "worker.min.js": "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
    "tesseract-core.wasm.js": "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core.wasm.js",
    "tesseract-core-simd.wasm.js": "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd.wasm.js",
    "tesseract-core-lstm.wasm.js": "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-lstm.wasm.js",
    "tesseract-core-simd-lstm.wasm.js": "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js",
}
# Modelli lingua per l'OCR completamente offline (vedi vendor/README.txt).
TESSDATA_URLS = {
    "ita.traineddata.gz": "https://tessdata.projectnaptha.com/4.0.0/ita.traineddata.gz",
    "eng.traineddata.gz": "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz",
}


def log(msg):
    print("[build_exe] " + msg)


def ensure_build_deps():
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        log("PyInstaller non trovato: lo installo (serve internet, una tantum)...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])
    try:
        import webview  # noqa: F401
    except ImportError:
        log("pywebview non trovato: lo installo (serve internet, una tantum) — "
            "e' la libreria che da' a BlaBla la sua finestra desktop nativa...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pywebview"])


def download_if_missing(url, dest, label):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        log(label + ": gia' presente, salto il download.")
        return
    log(label + ": scarico da " + url + " ...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as resp, open(dest, "wb") as out:
            shutil.copyfileobj(resp, out)
    except Exception as e:
        log("  ATTENZIONE: download fallito (" + str(e) + "). L'exe usera' il CDN per questo file (serve internet al primo uso).")
        if os.path.exists(dest):
            os.remove(dest)


def fetch_vendor_assets(offline_ocr):
    vendor_dir = os.path.join(ROOT, "vendor")
    os.makedirs(vendor_dir, exist_ok=True)
    for name, url in VENDOR_URLS.items():
        download_if_missing(url, os.path.join(vendor_dir, name), name)
    engine_dir = os.path.join(vendor_dir, "tesseract")
    os.makedirs(engine_dir, exist_ok=True)
    for name, url in TESSERACT_ENGINE_URLS.items():
        download_if_missing(url, os.path.join(engine_dir, name), "tesseract/" + name)
    if offline_ocr:
        tessdata_dir = os.path.join(vendor_dir, "tessdata")
        os.makedirs(tessdata_dir, exist_ok=True)
        for name, url in TESSDATA_URLS.items():
            download_if_missing(url, os.path.join(tessdata_dir, name), name)
    else:
        log("--skip-ocr-data: l'OCR scarichera' i modelli lingua al primo utilizzo (serve internet quella volta).")


def read_version():
    """Versione dell'app: unica fonte e' modules/version.js (la legge anche l'app per il controllo aggiornamenti)."""
    with open(os.path.join(ROOT, "modules", "version.js"), encoding="utf-8") as f:
        m = re.search(r'BB_VERSION\s*=\s*"([^"]+)"', f.read())
    if not m:
        raise SystemExit("modules/version.js: BB_VERSION non trovata")
    return m.group(1)


def write_version_info(version):
    parts = (version.split(".") + ["0", "0", "0"])[:4]
    tup = ", ".join(str(int(p)) for p in parts)
    dotted = ".".join(parts)
    text = (
        "# UTF-8\n# Generato da tools/build_exe.py: non modificare a mano.\nVSVersionInfo(\n"
        "  ffi=FixedFileInfo(filevers=(%s), prodvers=(%s), mask=0x3f, flags=0x0, OS=0x40004, fileType=0x1, subtype=0x0, date=(0, 0)),\n"
        "  kids=[\n    StringFileInfo([StringTable('040904b0', [\n"
        "      StringStruct('CompanyName', 'BlaBla contributors'),\n"
        "      StringStruct('FileDescription', 'BlaBla - Editor Documenti'),\n"
        "      StringStruct('FileVersion', '%s'),\n"
        "      StringStruct('InternalName', 'BlaBla'),\n"
        "      StringStruct('LegalCopyright', 'MIT License'),\n"
        "      StringStruct('OriginalFilename', 'BlaBla.exe'),\n"
        "      StringStruct('ProductName', 'BlaBla'),\n"
        "      StringStruct('ProductVersion', '%s')])]),\n"
        "    VarFileInfo([VarStruct('Translation', [1033, 1200])])\n  ]\n)\n"
    ) % (tup, tup, dotted, dotted)
    path = os.path.join(BUILD_DIR, "version_info.txt")
    os.makedirs(BUILD_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return path


def content_hash(folder):
    h = hashlib.sha256()
    for r, dirs, files in os.walk(folder):
        dirs.sort()
        for n in sorted(files):
            if n == "build.id":
                continue
            p = os.path.join(r, n)
            h.update(os.path.relpath(p, folder).replace("\\", "/").encode())
            with open(p, "rb") as f:
                h.update(f.read())
    return h.hexdigest()[:12]


def stage_app_files(version):
    """Prepara in tools/_build/app/ solo cio' che serve dentro il programma: niente file di sviluppo
    (tools/, README, .git...). Scrive build.id = versione + impronta del contenuto: quando cambia, al prossimo
    avvio l'app riallinea la propria copia dei dati."""
    if os.path.exists(STAGE_DIR):
        shutil.rmtree(STAGE_DIR)
    os.makedirs(STAGE_DIR)
    shutil.copy2(os.path.join(ROOT, "blabla.html"), STAGE_DIR)
    for folder in ("fonts", "vendor", "FontCreator", "engine", "assets", "modules"):
        src = os.path.join(ROOT, folder)
        if os.path.isdir(src):
            shutil.copytree(src, os.path.join(STAGE_DIR, folder))
    for junk in (os.path.join(STAGE_DIR, "vendor", "README.txt"),):
        if os.path.exists(junk):
            os.remove(junk)
    with open(os.path.join(STAGE_DIR, "build.id"), "w", encoding="utf-8") as f:
        f.write(version + "+" + content_hash(STAGE_DIR))


def pyinstaller(args, name, onefile, version_file=None, excludes=()):
    cmd = [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--windowed",
           "--onefile" if onefile else "--onedir", "--name", name,
           "--icon", os.path.join(ROOT, "assets", "icon.ico"),
           "--distpath", os.path.join(BUILD_DIR, "out"),
           "--workpath", os.path.join(BUILD_DIR, "work-" + name.replace(" ", "_")),
           "--specpath", BUILD_DIR]
    if version_file:
        cmd += ["--version-file", version_file]
    for m in excludes:
        cmd += ["--exclude-module", m]
    cmd += args
    log("Eseguo: " + " ".join(cmd))
    subprocess.check_call(cmd)
    out = os.path.join(BUILD_DIR, "out", name)
    return out + (".exe" if onefile and os.name == "nt" else "")


def sign(path):
    """Firma l'exe se sono configurati un certificato e signtool (facoltativo)."""
    pfx, pw = os.environ.get("BB_SIGN_PFX"), os.environ.get("BB_SIGN_PASSWORD", "")
    if not pfx or os.name != "nt":
        return
    signtool = shutil.which("signtool")
    if not signtool:
        log("BB_SIGN_PFX impostato ma signtool non e' nel PATH: non firmo.")
        return
    subprocess.check_call([signtool, "sign", "/f", pfx, "/p", pw, "/fd", "SHA256", "/tr", "http://timestamp.digicert.com",
                           "/td", "SHA256", "/d", "BlaBla", path])
    log("Firmato: " + path)


def zip_folder(folder, zpath, prefix=""):
    if os.path.exists(zpath):
        os.remove(zpath)
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for r, dirs, files in os.walk(folder):
            dirs.sort()
            for n in sorted(files):
                p = os.path.join(r, n)
                z.write(p, (prefix + os.path.relpath(p, folder)).replace("\\", "/"))


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    skip_ocr_data = "--skip-ocr-data" in sys.argv
    version = read_version()
    ensure_build_deps()
    fetch_vendor_assets(offline_ocr=not skip_ocr_data)
    stage_app_files(version)
    vinfo = write_version_info(version)
    dist = os.path.join(ROOT, "dist")
    os.makedirs(dist, exist_ok=True)
    sep = ";" if os.name == "nt" else ":"
    light = ("unittest", "pydoc_data", "xml", "email")
    # il Python di sviluppo puo' avere installate molte altre librerie: PyInstaller le raccoglierebbe se
    # qualche hook le trova. Il programma usa solo pywebview (WinForms/WebView2 via pythonnet).
    stray = ("PyQt5", "PyQt6", "PySide2", "PySide6", "kivy", "pygame", "cv2", "numpy", "scipy", "pandas", "matplotlib", "gevent",
             "docutils", "sphinx", "OpenGL", "selenium", "trio", "PIL", "tkinter", "_tkinter", "IPython", "pytest", "setuptools",
             "pkg_resources", "wx", "gi", "cefpython3", "kivy_deps", "pythoncom", "pywintypes", "win32com")

    # 1) il programma, a cartella
    app = pyinstaller(["--add-data", STAGE_DIR + sep + "app", os.path.join(ROOT, "tools", "launcher.py")], "BlaBla", False,
                      version_file=vinfo, excludes=stray)
    # 2) disinstallatore (un exe piccolo, senza tkinter: usa solo ctypes)
    unins = pyinstaller([os.path.join(ROOT, "tools", "uninstaller.py")], "Uninstall BlaBla", True, version_file=vinfo,
                        excludes=light + ("tkinter", "http"))
    shutil.copy2(unins, os.path.join(app, "Uninstall BlaBla.exe"))
    sign(os.path.join(app, "BlaBla.exe"))
    sign(os.path.join(app, "Uninstall BlaBla.exe"))

    final = os.path.join(dist, "BlaBla")
    if os.path.exists(final):
        shutil.rmtree(final)
    shutil.copytree(app, final)

    # 3) zip portatile e payload dell'installatore
    portable = os.path.join(dist, "BlaBla-%s-portable.zip" % version)
    zip_folder(final, portable, prefix="BlaBla/")
    payload = os.path.join(BUILD_DIR, "payload.zip")
    zip_folder(final, payload)
    meta = os.path.join(BUILD_DIR, "payload.meta")
    with open(meta, "w", encoding="utf-8") as f:
        f.write("version=%s\n" % version)

    # 4) installatore
    setup = pyinstaller(["--add-data", payload + sep + ".", "--add-data", meta + sep + ".",
                         "--add-data", os.path.join(ROOT, "assets", "icon.ico") + sep + ".",
                         os.path.join(ROOT, "tools", "installer.py")], "BlaBla-Setup", True, version_file=vinfo,
                        excludes=light)
    sign(setup)
    setup_final = os.path.join(dist, "BlaBla-Setup-%s.exe" % version)
    shutil.copy2(setup, setup_final)

    # 5) impronte
    lines = ["%s  %s" % (sha256(p), os.path.basename(p)) for p in (setup_final, portable)]
    with open(os.path.join(dist, "SHA256SUMS.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    log("Fatto (versione %s):" % version)
    for p in (final, portable, setup_final):
        log("  " + p)
    log("Per pubblicare: allega alla release di GitHub il Setup, lo zip portatile e SHA256SUMS.txt.")


if __name__ == "__main__":
    main()
