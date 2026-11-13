"""Revisione PDF: parole dubbie dell'OCR, confronto con l'originale, apertura di più PDF insieme."""
import time, os
import fitz
from playwright.sync_api import sync_playwright

URL = "http://localhost:8743/blabla.html"
pc = ".bb-page-content"
fails = []
HERE = os.path.dirname(os.path.abspath(__file__))


def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name, detail if (not cond or detail) else "")
    if not cond:
        fails.append(name)


def make_pdf(path, texts, scan=False):
    doc = fitz.open()
    for t in texts:
        pg = doc.new_page(width=595, height=842)
        pg.insert_textbox(fitz.Rect(60, 80, 535, 700), t, fontsize=(11 if scan else 12), fontname="helv")
    if scan:
        out = fitz.open()
        for pg in doc:
            from PIL import Image, ImageFilter
            import io, random
            pix = pg.get_pixmap(dpi=64)
            im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples).filter(ImageFilter.GaussianBlur(0.9))
            random.seed(3)
            px = im.load()
            for _ in range(int(pix.width * pix.height * 0.004)):        # rumore da scansione
                x, y = random.randrange(pix.width), random.randrange(pix.height)
                v = random.randrange(60, 200)
                px[x, y] = (v, v, v)
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=40)
            sp = out.new_page(width=595, height=842)
            sp.insert_image(sp.rect, stream=buf.getvalue())
        out.save(path)
    else:
        doc.save(path)


TEXT = "Il presente documento descrive la procedura di acquisto delle attrezzature informatiche per i laboratori. " * 4
make_pdf(os.path.join(HERE, "a.pdf"), ["Alfa uno " + TEXT, "Alfa due " + TEXT])
make_pdf(os.path.join(HERE, "b.pdf"), ["Beta uno " + TEXT])
make_pdf(os.path.join(HERE, "scan.pdf"), ["Scansione " + TEXT, "Seconda pagina scansionata " + TEXT], scan=True)

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_context(viewport={"width": 1600, "height": 950}).new_page()
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

    def wait_idle(t=240):
        t0 = time.time()
        time.sleep(1.5)
        while time.time() - t0 < t:
            if not pg.evaluate("()=>document.querySelector('#bb-loading').classList.contains('open')"):
                break
            time.sleep(0.5)
        time.sleep(1)

    # ---- apertura di più PDF insieme
    fresh()
    pg.set_input_files("#bb-file-open", [os.path.join(HERE, "b.pdf"), os.path.join(HERE, "a.pdf")])
    wait_idle()
    txt = pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content')].map(p=>p.innerText)")
    ok("tre pagine da due PDF, in ordine alfabetico (a poi b)", len(txt) == 3 and txt[0].startswith("Alfa uno") and txt[1].startswith("Alfa due") and txt[2].startswith("Beta uno"), [t[:12] for t in txt])
    ok("titolo con il numero di file", pg.input_value("#bb-doc-title") == "a (+1)", pg.input_value("#bb-doc-title"))
    ok("sorgente per il confronto disponibile", pg.evaluate("()=>BB.PdfReview.source()&&BB.PdfReview.source().pageRefs.length") == 3)
    open(os.path.join(HERE, "x.txt"), "w").write("x")
    pg.set_input_files("#bb-file-open", [os.path.join(HERE, "a.pdf"), os.path.join(HERE, "x.txt")])
    time.sleep(1)
    ok("tipi misti rifiutati con messaggio", "devono essere tutti PDF" in pg.inner_text("#bb-toasts"))

    # ---- confronto: pannello con la pagina originale
    pg.click('[data-tab="view"]')
    pg.click("#bb-rev-compare")
    time.sleep(1.5)
    ok("pannello originale aperto", pg.evaluate("()=>document.getElementById('bb-compare').classList.contains('open')"))
    info = pg.evaluate("()=>({page:document.getElementById('bb-cmp-page').textContent, canvas:!!document.querySelector('#bb-compare canvas')})")
    ok("pagina originale disegnata", info["canvas"] and "a.pdf" in info["page"] and "Pagina 1 di 2" in info["page"], info)
    pg.evaluate("()=>document.querySelectorAll('.bb-page')[2].scrollIntoView({block:'center'})")
    time.sleep(1.4)
    info2 = pg.evaluate("()=>document.getElementById('bb-cmp-page').textContent")
    ok("l'originale segue la pagina visibile", "b.pdf" in info2, info2)
    geo = pg.evaluate("()=>{const a=document.getElementById('bb-compare').getBoundingClientRect(), e=document.getElementById('bb-editor-area').getBoundingClientRect(); return {aR:a.right, eL:e.left, eW:e.width}}")
    ok("pannello e editor affiancati", geo["aR"] <= geo["eL"] + 1 and geo["eW"] > 400, geo)
    pg.click("#bb-cmp-close")

    # ---- OCR: parole dubbie
    fresh()
    pg.set_input_files("#bb-file-open", os.path.join(HERE, "scan.pdf"))
    wait_idle(360)
    n = pg.evaluate("()=>document.querySelectorAll('.bb-page-content .bb-lowconf').length")
    print("   parole dubbie trovate:", n)
    ok("scansione importata via OCR (testo letto)", pg.evaluate("()=>document.querySelector('.bb-page-content').innerText.includes('documento')"))
    ok("ci sono parole dubbie evidenziate", n > 0, n)
    if n:
        ok("pannello aperto automaticamente con le parole dubbie", pg.evaluate("()=>document.getElementById('bb-compare').classList.contains('open')"))
        ok("contatore nel pannello", str(n) in pg.inner_text("#bb-cmp-count"), pg.inner_text("#bb-cmp-count"))
        pg.keyboard.press("F8")
        time.sleep(0.8)
        sel = pg.evaluate("()=>{const s=getSelection(); const e=s.anchorNode&&(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement); return !!(e&&e.closest('.bb-lowconf'))}")
        ok("F8 seleziona la prima parola dubbia", sel)
        before = pg.evaluate("()=>document.querySelectorAll('.bb-page-content .bb-lowconf').length")
        pg.click("#bb-cmp-ok")
        time.sleep(0.5)
        after = pg.evaluate("()=>document.querySelectorAll('.bb-page-content .bb-lowconf').length")
        ok("«Conferma» toglie l'evidenziazione", after == before - 1, (before, after))
        ok("testo invariato dopo la conferma", pg.evaluate("()=>document.querySelector('.bb-page-content').innerText.includes('documento')"))
        pg.emulate_media(media="print")
        bg = pg.evaluate("()=>{const m=document.querySelector('.bb-page-content .bb-lowconf'); return m?getComputedStyle(m).backgroundColor:'none'}")
        ok("niente evidenziazione in stampa", bg in ("none", "rgba(0, 0, 0, 0)"), bg)
        pg.emulate_media(media="screen")
        pg.click("#bb-cmp-all")
        time.sleep(0.5)
        pg.evaluate("()=>[...document.querySelectorAll('button')].find(b=>/Sì, conferma tutte/.test(b.textContent))?.click()")
        time.sleep(0.6)
        ok("«Conferma tutte» le toglie tutte", pg.evaluate("()=>document.querySelectorAll('.bb-page-content .bb-lowconf').length") == 0)
    ok("nessun errore JS", not errs, errs[:3])
    b.close()
for f in ("a.pdf", "b.pdf", "scan.pdf", "x.txt"):
    os.remove(os.path.join(HERE, f))
print("FALLITI:", fails)
raise SystemExit(1 if fails else 0)
