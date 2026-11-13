"""
BlaBla — avvio come applicazione desktop.

Questo script (compilato in BlaBla.exe da tools/build_exe.py) apre BlaBla in
una vera finestra desktop nativa (tramite pywebview, appoggiato al motore
WebView2 gia' incluso in Windows 10/11) — NON in una scheda del browser: niente
barra degli indirizzi, niente schede, nessuna interfaccia da browser. Dietro le
quinte gira comunque un piccolo server web locale, raggiungibile SOLO dal PC su
cui gira (127.0.0.1, mai da altri PC in rete): serve perche' alcune funzioni
(anteprima PDF, librerie caricate da vendor/, modelli lingua dell'OCR) hanno
bisogno di una vera origine http:// per funzionare in modo affidabile — a
differenza di file:// che blocca per sicurezza operazioni come fetch() verso
una cartella o la creazione di web worker locali.

I file dell'app vengono copiati (alla prima esecuzione, o quando cambia
versione) in una cartella STABILE nel profilo utente — cioe' che non cambia
posizione da un avvio all'altro.

Il documento viene salvato automaticamente su un file JSON dentro questa
stessa cartella stabile (vedi classe Api sotto), NON nel localStorage del
motore WebView2: verificato empiricamente che WebView2 puo' non scrivere su
disco in tempo utile il localStorage quando l'app viene chiusa (i dati
restano solo in memoria e si perdono al riavvio) — un file scritto
direttamente da Python con open()/write() e' invece immediatamente e
affidabilmente persistente.

Se pywebview non riesce a partire (PC molto datato senza WebView2 Runtime),
l'app apre comunque il browser predefinito come ripiego, cosi' funziona
davvero su qualsiasi PC anche in quel caso limite.
"""
import base64
import http.server
import json
import os
import posixpath
import shutil
import socket
import socketserver
import sys
import threading
import time
import urllib.parse
import urllib.request
import webbrowser

# In un exe --windowed (niente console) sys.stdout/stderr sono None: qualsiasi
# print() qui sotto altrimenti farebbe crashare l'app al primo avvio.
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

APP_NAME = "BlaBla"


def _read_build_id():
    """Identificativo del contenuto bundlato (scritto da build_exe.py in app/build.id): quando cambia, la copia
    stabile dell'app viene riallineata al prossimo avvio. Eseguendo dal sorgente (senza build.id) cambia ad ogni
    avvio, cosi' si serve sempre il codice aggiornato."""
    try:
        base = os.path.join(sys._MEIPASS, "app") if getattr(sys, "_MEIPASS", None) else None
        if base is None:
            here = os.path.dirname(os.path.abspath(__file__))
            staged = os.path.join(here, "app")
            base = staged if os.path.isdir(staged) else None
        if base:
            with open(os.path.join(base, "build.id"), encoding="utf-8") as f:
                return f.read().strip()
    except OSError:
        pass
    return "dev-%d" % int(time.time())


VERSION = _read_build_id()

VALID_FONT_EXT = {".ttf", ".otf", ".woff", ".woff2", ".ttc"}


def app_dir():
    """Cartella che contiene blabla.html, fonts/, vendor/ da servire:
    nell'exe PyInstaller i dati sono estratti sotto sys._MEIPASS/app (vedi
    --add-data in build_exe.py, diversa ad ogni avvio); in sviluppo, se
    tools/_build/app/ e' gia' stata preparata la si usa, altrimenti si ricade
    direttamente sulla cartella del progetto — utile per lanciare questo
    script da sorgente, senza dover prima compilare."""
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass is not None:
        return os.path.join(meipass, "app")
    here = os.path.dirname(os.path.abspath(__file__))
    staged = os.path.join(here, "app")
    if os.path.isdir(staged):
        return staged
    return os.path.dirname(here)  # cartella del progetto: blabla.html e' li' direttamente


def stable_install_dir():
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    return os.path.join(base, APP_NAME)


def _native_print_pdf(win, path, width_mm, height_mm):
    """Stampa la pagina corrente in `path` con CoreWebView2.PrintToPdfAsync (margini zero, sfondi inclusi,
    senza intestazione/piè di pagina del browser). Va chiamato da un thread diverso da quello dell'interfaccia."""
    from System import Func, Object
    from webview.platforms.winforms import BrowserView
    wv = BrowserView.instances[win.uid].browser.webview
    holder = {}

    def start():
        core = wv.CoreWebView2
        st = core.Environment.CreatePrintSettings()
        st.ShouldPrintBackgrounds = True
        st.ShouldPrintHeaderAndFooter = False
        st.ScaleFactor = 1.0
        st.MarginTop = st.MarginBottom = st.MarginLeft = st.MarginRight = 0.0
        # le dimensioni vanno date "in verticale" e l'orientamento a parte, altrimenti una pagina
        # orizzontale esce comunque verticale
        from Microsoft.Web.WebView2.Core import CoreWebView2PrintOrientation
        landscape = width_mm > height_mm
        st.PageWidth = min(width_mm, height_mm) / 25.4
        st.PageHeight = max(width_mm, height_mm) / 25.4
        st.Orientation = (CoreWebView2PrintOrientation.Landscape if landscape
                          else CoreWebView2PrintOrientation.Portrait)
        holder["task"] = core.PrintToPdfAsync(path, st)
        return None

    wv.Invoke(Func[Object](start))
    task = holder["task"]
    if not task.Wait(120000):
        raise RuntimeError("Tempo scaduto durante la creazione del PDF")
    return bool(task.Result)


class Api:
    """Ponte JS<->Python esposto alla pagina come window.pywebview.api: il
    salvataggio automatico del documento (vedi Autosave in blabla.html)
    scrive qui invece che nel localStorage del browser, per essere certo che
    i dati siano davvero su disco subito dopo ogni salvataggio."""
    DOC_FILE = "document.json"

    def save_document(self, data):
        try:
            path = os.path.join(stable_install_dir(), self.DOC_FILE)
            tmp = path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)  # scrittura atomica: mai un file a metà se l'app viene chiusa nel mezzo
            return True
        except OSError:
            return False

    def load_document(self):
        try:
            path = os.path.join(stable_install_dir(), self.DOC_FILE)
            with open(path, encoding="utf-8") as f:
                return f.read()
        except OSError:
            return None

    # ------------------------------------------------------------------
    # ESPORTAZIONE PDF con testo vero: si usa il motore di stampa di WebView2 (lo stesso di Edge),
    # che produce un PDF vettoriale con i caratteri incorporati, testo selezionabile e ricercabile.
    # Il browser da solo non puo' salvare un PDF senza il dialogo di stampa.
    def open_url(self, url):
        """Apre nel browser predefinito la pagina delle release di BlaBla (solo quell'indirizzo)."""
        if isinstance(url, str) and url.startswith("https://github.com/Huawetto/BlaBla/"):
            webbrowser.open(url)
            return True
        return False

    def print_to_pdf(self, suggested_name, width_mm, height_mm, path=None):
        """Ritorna una stringa JSON: {ok, path} oppure {ok:false, cancelled|error}. `path` serve solo
        ai test automatici: se manca si apre il normale dialogo "Salva con nome"."""
        try:
            import webview
            win = webview.windows[0]
            if not path:
                name = (os.path.basename(str(suggested_name or "documento")) or "documento")
                if not name.lower().endswith(".pdf"):
                    name += ".pdf"
                sel = win.create_file_dialog(webview.SAVE_DIALOG, save_filename=name,
                                             file_types=("PDF (*.pdf)",))
                if not sel:
                    return json.dumps({"ok": False, "cancelled": True})
                path = sel if isinstance(sel, str) else sel[0]
            if not str(path).lower().endswith(".pdf"):
                path = str(path) + ".pdf"
            ok = _native_print_pdf(win, str(path), float(width_mm), float(height_mm))
            return json.dumps({"ok": bool(ok), "path": str(path)})
        except Exception as e:  # noqa: BLE001 - il messaggio torna alla pagina e viene mostrato
            return json.dumps({"ok": False, "error": str(e)})

    # ------------------------------------------------------------------
    # I MIEI FONT (font creati in FontCreator): persistiti come file veri in
    # una cartella dedicata, MAI in localStorage/IndexedDB del browser — un
    # test diretto (scrivere, chiudere l'app con una vera chiusura di
    # finestra, riaprire) ha mostrato che pure IndexedDB, come il
    # localStorage usato in origine per il documento, può non essere
    # scritto su disco in tempo utile da WebView2 alla chiusura: stesso
    # problema, stessa soluzione già affidabile per save_document/
    # load_document sopra. La cartella è SEPARATA da fonts/ (quella
    # scansionata da regenerate_fonts_manifest) apposta: i font "I miei
    # font" hanno un proprio ciclo di vita (attivo/disattivo, eliminabile)
    # che non deve interferire con l'elenco automatico dei font di sistema.
    CUSTOM_FONTS_DIR = "custom_fonts"
    CUSTOM_FONTS_MANIFEST = "manifest.json"

    def _custom_fonts_dir(self):
        d = os.path.join(stable_install_dir(), self.CUSTOM_FONTS_DIR)
        os.makedirs(d, exist_ok=True)
        return d

    def _read_custom_fonts_manifest(self):
        path = os.path.join(self._custom_fonts_dir(), self.CUSTOM_FONTS_MANIFEST)
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return {}

    def _write_custom_fonts_manifest(self, data):
        d = self._custom_fonts_dir()
        path = os.path.join(d, self.CUSTOM_FONTS_MANIFEST)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)

    def list_custom_fonts(self):
        """Ritorna il manifest (dict key -> {familyName, fileName, ext,
        enabled}) come stringa JSON, per popolare il pannello "I miei font"
        e ricaricare i font attivi all'avvio."""
        try:
            return json.dumps(self._read_custom_fonts_manifest())
        except OSError:
            return "{}"

    def save_custom_font(self, key, family_name, file_name, ext, b64data):
        try:
            raw = base64.b64decode(b64data)
            safe_name = os.path.basename(file_name)  # niente path traversal
            if not safe_name:
                return False
            d = self._custom_fonts_dir()
            path = os.path.join(d, safe_name)
            tmp = path + ".tmp"
            with open(tmp, "wb") as f:
                f.write(raw)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)
            manifest = self._read_custom_fonts_manifest()
            manifest[key] = {
                "familyName": family_name, "fileName": safe_name,
                "ext": ext, "enabled": True, "created": time.time() * 1000,  # ms, come Date.now() lato JS
            }
            self._write_custom_fonts_manifest(manifest)
            return True
        except (OSError, ValueError):
            return False

    def save_custom_font_project(self, key, project_json):
        """Progetto editabile (tratti/metriche/pennello) di un font di
        "I miei font": salvato ACCANTO al font compilato (vedi
        save_custom_font sopra), è quello che permette di riaprirlo in
        FontCreator e continuare a modificarlo — un font .otf/.ttf già
        compilato non si può "decompilare" nei tratti originali, quindi senza
        questo il font sarebbe modificabile solo ridisegnandolo da zero."""
        try:
            manifest = self._read_custom_fonts_manifest()
            if key not in manifest:
                return False
            manifest[key]["project"] = json.loads(project_json)
            self._write_custom_fonts_manifest(manifest)
            return True
        except (OSError, ValueError):
            return False

    def delete_custom_font_file(self, file_name):
        """Rimuove un singolo file font ormai orfano SENZA toccare il
        manifest: usata quando un font viene ri-salvato con lo stesso nome
        (stessa key) e genera un nuovo file — il vecchio file sostituito
        andrebbe altrimenti accumulandosi su disco a ogni modifica."""
        try:
            safe_name = os.path.basename(file_name)
            if not safe_name:
                return False
            path = os.path.join(self._custom_fonts_dir(), safe_name)
            if os.path.exists(path):
                os.remove(path)
            return True
        except OSError:
            return False

    def set_custom_font_enabled(self, key, enabled):
        try:
            manifest = self._read_custom_fonts_manifest()
            if key not in manifest:
                return False
            manifest[key]["enabled"] = bool(enabled)
            self._write_custom_fonts_manifest(manifest)
            return True
        except OSError:
            return False

    def delete_custom_font(self, key):
        try:
            manifest = self._read_custom_fonts_manifest()
            rec = manifest.pop(key, None)
            if rec is None:
                return False
            self._write_custom_fonts_manifest(manifest)
            font_path = os.path.join(self._custom_fonts_dir(), rec["fileName"])
            if os.path.exists(font_path):
                os.remove(font_path)
            return True
        except OSError:
            return False


def _merge_dir(src, dst):
    """Copia il contenuto di src dentro dst, aggiungendo/aggiornando i file
    dell'app ma senza mai cancellare quanto trovato in dst e non presente in
    src — cosi' font o librerie vendor aggiunti a mano dall'utente restano."""
    os.makedirs(dst, exist_ok=True)
    for name in os.listdir(src):
        s, d = os.path.join(src, name), os.path.join(dst, name)
        if os.path.isdir(s):
            _merge_dir(s, d)
        else:
            try:                                  # file identico (stessa dimensione e data): non si ricopia
                ss, ds = os.stat(s), os.stat(d)
                if ss.st_size == ds.st_size and int(ss.st_mtime) == int(ds.st_mtime):
                    continue
            except OSError:
                pass
            shutil.copy2(s, d)


def _prune_retired_fonts(src, dst):
    """Toglie dalla cartella stabile i font ritirati dal pacchetto (es. quelli proprietari), elencati
    in fonts/_retired.json. I font aggiunti a mano dall'utente non sono nell'elenco e restano intatti."""
    try:
        with open(os.path.join(src, "fonts", "_retired.json"), encoding="utf-8") as f:
            retired = json.load(f)
    except (OSError, ValueError):
        return
    for name in retired:
        try:
            os.remove(os.path.join(dst, "fonts", os.path.basename(name)))
        except OSError:
            pass


def ensure_installed():
    target = stable_install_dir()
    marker = os.path.join(target, ".bb-version")
    current = open(marker, encoding="utf-8").read().strip() if os.path.exists(marker) else None
    if current != VERSION:
        _prune_retired_fonts(app_dir(), target)
        _merge_dir(app_dir(), target)
        with open(marker, "w", encoding="utf-8") as f:
            f.write(VERSION)
    return target


def regenerate_fonts_manifest(target):
    """Rigenera fonts/fonts.js scansionando la cartella: cosi' anche i font
    aggiunti a mano dall'utente nella cartella stabile vengono rilevati senza
    bisogno di lanciare a parte tools/update-fonts (che qui non c'e')."""
    fonts_dir = os.path.join(target, "fonts")
    if not os.path.isdir(fonts_dir):
        return
    try:
        names = sorted(
            (f for f in os.listdir(fonts_dir) if os.path.splitext(f)[1].lower() in VALID_FONT_EXT),
            key=str.lower,
        )
        lines = ",\n".join('  "%s"' % n.replace("\\", "\\\\").replace('"', '\\"') for n in names)
        content = (
            "/* Generato automaticamente da BlaBla.exe all'avvio: rileva i font\n"
            "   presenti in questa cartella, comprese eventuali aggiunte manuali. */\n"
            "window.BB_FONTS = [\n" + lines + "\n];\n"
        )
        with open(os.path.join(fonts_dir, "fonts.js"), "w", encoding="utf-8") as f:
            f.write(content)
    except OSError:
        pass  # non bloccare l'avvio dell'app per un problema sui font


# Porte candidate per il server locale: FISSE (non casuali). Il salvataggio
# automatico usa il localStorage del browser, legato all'origine (schema+host
# +porta) della pagina: se la porta cambiasse ad ogni avvio, ogni riavvio
# vedrebbe un'origine diversa e il documento salvato sparirebbe, esattamente
# come col problema della cartella instabile spiegato in cima al file. Se la
# prima porta risulta occupata (di solito perche' BlaBla e' gia' aperto) si
# prova la successiva; se sono occupate tutte, come ultima risorsa si usa una
# porta casuale con un avviso: quell'unica volta l'autosalvataggio precedente
# non sara' visibile.
FIXED_PORTS = (51888, 51889, 51890)


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    # File dell'utente che stanno nella stessa cartella servita ma che il browser non deve
    # mai poter leggere via HTTP: l'app li raggiunge solo dal ponte Python (classe Api).
    PRIVATE_NAMES = {"document.json", "manifest.json", ".bb-version"}

    def log_message(self, fmt, *args):
        pass  # niente log delle richieste in console

    def _allowed(self):
        # Host: solo il nome locale. Un sito web qualunque aperto nel browser potrebbe altrimenti
        # farsi risolvere il proprio dominio su 127.0.0.1 ("DNS rebinding") e leggere il
        # documento dell'utente da questo server.
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]").lower()
        if host not in ("127.0.0.1", "localhost"):
            return False
        name = posixpath.basename(urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)).lower()
        return name not in self.PRIVATE_NAMES and not name.endswith(".tmp")

    def do_GET(self):
        if not self._allowed():
            self.send_error(403, "Forbidden")
            return
        super().do_GET()

    def do_HEAD(self):
        if not self._allowed():
            self.send_error(403, "Forbidden")
            return
        super().do_HEAD()


class _Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


def _already_running(port):
    """True se sulla porta risponde gia' un'istanza di BlaBla (avviata in
    precedenza e non chiusa): in tal caso NON va aperto un secondo server su
    un'altra porta, altrimenti l'utente si ritroverebbe un'origine diversa e
    quindi un documento vuoto invece di quello a cui stava lavorando."""
    try:
        with urllib.request.urlopen("http://127.0.0.1:%d/blabla.html" % port, timeout=1) as resp:
            return resp.status == 200
    except OSError:
        return False


def start_server(handler):
    for port in FIXED_PORTS:
        try:
            return port, _Server(("127.0.0.1", port), handler)
        except OSError:
            if _already_running(port):
                return port, None  # BlaBla e' gia' aperto qui: riusa la stessa origine
            continue  # porta occupata da altro programma: prova la successiva
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    print(APP_NAME + ": tutte le porte predefinite sono occupate, ne uso una casuale "
          "(l'autosalvataggio della sessione precedente potrebbe non essere visibile questa volta).")
    return port, _Server(("127.0.0.1", port), handler)


def _open_native_window(url):
    """Apre BlaBla in una finestra desktop nativa (senza interfaccia da
    browser) tramite pywebview. Ritorna True se e' riuscito ad aprirla e ad
    aspettare la sua chiusura, False se pywebview non e' disponibile/utilizzabile
    su questo PC (va allora usato il ripiego sul browser predefinito)."""
    try:
        import webview
    except ImportError:
        return False
    try:
        webview.create_window(
            APP_NAME, url,
            width=1360, height=860, min_size=(900, 600),
            text_select=True,
            js_api=Api(),
        )
        # NB: non passare storage_path a webview.start() — pywebview instrada
        # quel caso su un percorso di creazione dell'ambiente WebView2
        # alternativo che (verificato empiricamente) non salva in modo
        # affidabile i dati del profilo (incluso il localStorage
        # dell'autosalvataggio) da un avvio all'altro. Il percorso di default
        # di pywebview (%APPDATA%/pywebview su Windows) e' invece stabile fra
        # gli avvii e funziona correttamente: e' quello che va usato.
        webview.start()
        return True
    except Exception as e:
        print(APP_NAME + ": finestra nativa non disponibile (" + str(e) + "), uso il browser predefinito.")
        return False


def main():
    target = ensure_installed()
    regenerate_fonts_manifest(target)

    def handler(*args, **kwargs):
        _QuietHandler(*args, directory=target, **kwargs)

    port, httpd = start_server(handler)
    url = "http://127.0.0.1:%d/blabla.html" % port

    if httpd is None:
        print(APP_NAME + " e' gia' in esecuzione: apro una nuova finestra su " + url)
        if not _open_native_window(url):
            webbrowser.open(url)
        return

    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    time.sleep(0.3)

    print(APP_NAME + " e' in esecuzione su " + url)
    try:
        if not _open_native_window(url):
            # Ripiego: nessuna finestra nativa, apri nel browser predefinito e
            # tieni il server vivo finche' l'utente non chiude questa console.
            webbrowser.open(url)
            print("Chiudi questa finestra per uscire da " + APP_NAME + ".")
            while True:
                time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        httpd.shutdown()


if __name__ == "__main__":
    main()
