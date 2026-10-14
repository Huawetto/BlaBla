"""
BlaBla — crea un eseguibile standalone (BlaBla.exe su Windows) che include
tutta l'app: HTML/CSS/JS, i font, e — scaricate automaticamente da questo
script se non gia' presenti in vendor/ — le librerie opzionali per le
funzioni avanzate (import DOCX, import/export PDF, OCR).

Il file .exe risultante NON richiede Python ne' alcuna installazione sul PC
di destinazione, e funziona SENZA connessione a internet: apre BlaBla in una
vera finestra desktop nativa (vedi launcher.py, tramite pywebview) — non una
scheda del browser — appoggiandosi a un piccolo server locale invece di
scaricare qualunque cosa da remoto.

USO
    python tools/build_exe.py               (bundla anche i modelli OCR offline)
    python tools/build_exe.py --skip-ocr-data  (exe piu' leggero: l'OCR scarica
                                                 i modelli la prima volta che li usi)

Serve una connessione a internet SOLO durante l'esecuzione di QUESTO script
(per installare PyInstaller/pywebview e scaricare le librerie vendor/
mancanti) — il file .exe prodotto alla fine non ne ha piu' bisogno.

Il risultato e' in dist/BlaBla.exe (dist/BlaBla su macOS/Linux).
"""
import os
import shutil
import subprocess
import sys
import urllib.request

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


def stage_app_files():
    """Prepara in tools/_build/app/ solo cio' che serve dentro l'exe: niente
    file di sviluppo (tools/, README, .git...)."""
    if os.path.exists(STAGE_DIR):
        shutil.rmtree(STAGE_DIR)
    os.makedirs(STAGE_DIR)
    shutil.copy2(os.path.join(ROOT, "blabla.html"), STAGE_DIR)
    for folder in ("fonts", "vendor", "FontCreator", "engine", "assets"):
        src = os.path.join(ROOT, folder)
        if os.path.isdir(src):
            shutil.copytree(src, os.path.join(STAGE_DIR, folder))
    for junk in (os.path.join(STAGE_DIR, "vendor", "README.txt"),):
        if os.path.exists(junk):
            os.remove(junk)


def run_pyinstaller():
    launcher = os.path.join(ROOT, "tools", "launcher.py")
    sep = ";" if os.name == "nt" else ":"
    add_data = STAGE_DIR + sep + "app"
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm", "--clean",
        "--onefile",
        "--windowed",  # niente finestra di console dietro alla finestra dell'app
        "--name", "BlaBla",
        "--icon", os.path.join(ROOT, "assets", "icon.ico"),
        "--version-file", os.path.join(ROOT, "tools", "version_info.txt"),
        "--add-data", add_data,
        "--distpath", os.path.join(ROOT, "dist"),
        "--workpath", os.path.join(BUILD_DIR, "work"),
        "--specpath", BUILD_DIR,
        launcher,
    ]
    log("Eseguo: " + " ".join(cmd))
    subprocess.check_call(cmd)


def main():
    skip_ocr_data = "--skip-ocr-data" in sys.argv
    ensure_build_deps()
    fetch_vendor_assets(offline_ocr=not skip_ocr_data)
    stage_app_files()
    run_pyinstaller()
    exe = os.path.join(ROOT, "dist", "BlaBla.exe" if os.name == "nt" else "BlaBla")
    log("Fatto. Eseguibile: " + exe)
    log("Copialo su qualunque PC (anche senza Python o internet) e avvialo con un doppio clic.")


if __name__ == "__main__":
    main()
