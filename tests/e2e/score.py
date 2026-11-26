"""Spartiti: pentagrammi riconosciuti, ogni sistema musicale diventa un'immagine, il testo fuori resta testo.
Genera da sé due PDF di prova (uno vettoriale, uno 'scansionato' storto e rumoroso)."""
import io, os, random, time
import fitz
from PIL import Image, ImageFilter
from playwright.sync_api import sync_playwright

URL = "http://localhost:8743/blabla.html"
pc = ".bb-page-content"
HERE = os.path.dirname(os.path.abspath(__file__))
fails = []


def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name, detail if (not cond or detail) else "")
    if not cond:
        fails.append(name)


def draw_system(pg, y, n_staves=2):
    """Un sistema: n pentagrammi collegati da una stanghetta a sinistra, con note, accordi e testo cantato."""
    tops = [y + i * 62 for i in range(n_staves)]
    for t in tops:
        for k in range(5):
            pg.draw_line((60, t + 4 * k), (540, t + 4 * k), color=(0, 0, 0), width=0.5)
    pg.draw_line((60, tops[0]), (60, tops[-1] + 16), color=(0, 0, 0), width=0.9)       # stanghetta di sistema
    pg.draw_line((540, tops[0]), (540, tops[-1] + 16), color=(0, 0, 0), width=0.9)
    for t in tops:
        for i in range(10):                                                            # note: teste piene con gambo
            cx, cy = 90 + i * 44, t + 2 + (i * 7) % 12
            pg.draw_oval(fitz.Rect(cx - 3.2, cy - 2.2, cx + 3.2, cy + 2.2), fill=(0, 0, 0), color=(0, 0, 0))
            pg.draw_line((cx + 3, cy), (cx + 3, cy - 14), color=(0, 0, 0), width=0.7)
        pg.draw_line((250, t), (250, t + 16), color=(0, 0, 0), width=0.7)              # stanghetta di battuta
    pg.insert_text((66, tops[0] - 10), "Swing brightly", fontsize=9, fontname="hebo")
    pg.insert_text((120, tops[0] - 8), "C", fontsize=8, fontname="helv")
    pg.insert_text((300, tops[0] - 8), "G7", fontsize=8, fontname="helv")
    pg.insert_text((90, tops[0] + 30), "Rockin around the tree", fontsize=8, fontname="helv")           # testo cantato
    pg.insert_text((18, tops[0] + 10), "SOPRANO", fontsize=6, fontname="helv")
    pg.insert_text((30, tops[0] + 14), "∞ œ Σ", fontsize=14, fontname="symb")         # "glifi musicali" senza senso come testo
    return tops[-1] + 16


def make_vector(path):
    doc = fitz.open()
    for pageno in range(2):
        pg = doc.new_page(width=595, height=842)
        pg.insert_text((120, 60), "ROCKIN AROUND THE TREE" if pageno == 0 else "SECOND PAGE", fontsize=20, fontname="hebo")
        pg.insert_text((200, 82), "Arranged by Test Person", fontsize=10, fontname="helv")
        end = draw_system(pg, 150)
        draw_system(pg, end + 70)
        pg.insert_text((120, 800), "Copyright footer line - permission required", fontsize=8, fontname="helv")
    doc.save(path)


def make_scan(vec_path, path):
    src = fitz.open(vec_path)
    out = fitz.open()
    random.seed(5)
    for pg in src:
        pix = pg.get_pixmap(dpi=150)
        im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples).rotate(0.5, resample=Image.BICUBIC, fillcolor=(255, 255, 255))
        im = im.filter(ImageFilter.GaussianBlur(0.7))
        px = im.load()
        for _ in range(int(pix.width * pix.height * 0.0004)):
            x, y = random.randrange(pix.width), random.randrange(pix.height)
            v = random.randrange(70, 200)
            px[x, y] = (v, v, v)
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=55)
        sp = out.new_page(width=595, height=842)
        sp.insert_image(sp.rect, stream=buf.getvalue())
    out.save(path)


vec = os.path.join(HERE, "score_vec.pdf")
scan = os.path.join(HERE, "score_scan.pdf")
make_vector(vec)
make_scan(vec, scan)

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_context(viewport={"width": 1500, "height": 950}).new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" and "404" not in m.text and "font" not in m.text.lower() else None)

    def fresh():
        pg.goto(URL)
        pg.wait_for_selector(pc)
        pg.evaluate("async()=>{localStorage.clear(); await new Promise(r=>{const q=indexedDB.deleteDatabase('blabla'); q.onsuccess=q.onerror=q.onblocked=()=>r();});}")
        pg.reload()
        pg.wait_for_selector(pc)
        time.sleep(1)

    def wait_idle(t=300):
        t0 = time.time()
        time.sleep(1.5)
        while time.time() - t0 < t and pg.evaluate("()=>document.querySelector('#bb-loading').classList.contains('open')"):
            time.sleep(0.5)
        time.sleep(1.2)

    def state():
        return pg.evaluate("""()=>({pages:BB.State.pages.length,
          imgs:BB.State.pages.map(p=>p.content.querySelectorAll('img').length),
          text:BB.State.pages.map(p=>p.content.innerText),
          alts:[...document.querySelectorAll('.bb-page-content img')].map(i=>i.alt),
          widths:[...document.querySelectorAll('.bb-page-content img')].map(i=>i.naturalWidth)})""")

    # ---------------- PDF vettoriale
    fresh()
    pg.set_input_files("#bb-file-open", vec)
    wait_idle()
    s = state()
    ok("due pagine", s["pages"] == 2, s["pages"])
    ok("due sistemi musicali per pagina come immagini", s["imgs"][:2] == [2, 2], s["imgs"])
    ok("testo alternativo dei sistemi", all(a.startswith("Spartito: sistema") for a in s["alts"]), s["alts"][:2])
    ok("immagini nitide (larghe)", min(s["widths"]) >= 900, s["widths"][:3])
    t0 = s["text"][0]
    ok("titolo e autore restano testo", "ROCKIN AROUND THE TREE" in t0 and "Arranged by Test Person" in t0, t0[:80])
    ok("nota a fondo pagina resta testo", "Copyright footer line" in t0)
    ok("niente testo cantato/accordi/glifi nel flusso", "Rockin around" not in t0 and "Swing" not in t0 and "∞" not in t0 and "SOPRANO" not in t0, t0[:200])
    ok("il toast parla di sistemi musicali", "sistemi musicali" in pg.evaluate("()=>document.body.innerText"))
    ok("nessuna pagina in piu' per il testo che avanza", s["pages"] == 2)

    # ---------------- scansione storta e rumorosa (OCR)
    fresh()
    pg.set_input_files("#bb-file-open", scan)
    wait_idle(420)
    s2 = state()
    print("   scansione:", s2["pages"], s2["imgs"], [t[:70].replace("\n", " | ") for t in s2["text"]])
    ok("scansione: due pagine, due sistemi come immagini ciascuna", s2["pages"] == 2 and s2["imgs"] == [2, 2], (s2["pages"], s2["imgs"]))
    ok("scansione: titolo letto con l'OCR", "ROCKIN AROUND THE TREE" in " ".join(s2["text"][0].upper().split()), s2["text"][0][:100])
    ok("scansione: nota a fondo pagina letta", any("Copyright" in t for t in s2["text"]))
    junk = sum(1 for c in s2["text"][0] if not (c.isalnum() or c.isspace() or c in ".,'-:;()/©"))
    ok("scansione: poco testo spazzatura dalle note", junk < 12, junk)
    ok("nessun errore JS", not errs, errs[:3])
    b.close()

if not os.environ.get('KEEP'):
    for f in (vec, scan):
        os.remove(f)
print("FALLITI:", fails)
raise SystemExit(1 if fails else 0)
