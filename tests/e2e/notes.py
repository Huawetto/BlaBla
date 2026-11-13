"""Sommario automatico e note a piè di pagina: inserimento, numerazione, spazio riservato, aggiornamento, stampa."""
import time
from playwright.sync_api import sync_playwright
import fitz

URL = "http://localhost:8743/blabla.html"
pc = ".bb-page-content"
fails = []


def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name, detail if (not cond or detail) else "")
    if not cond:
        fails.append(name)


def reset(pg):
    pg.goto(URL)
    pg.wait_for_selector(pc)
    pg.evaluate("async()=>{localStorage.clear(); await new Promise(r=>{const q=indexedDB.deleteDatabase('blabla'); q.onsuccess=q.onerror=q.onblocked=()=>r();});}")
    pg.reload()
    pg.wait_for_selector(pc)
    time.sleep(1)
    pg.click(pc)
    pg.keyboard.press("Control+A")
    pg.keyboard.press("Delete")


def paste_html(pg, h):
    pg.evaluate("""(h)=>{const pc=document.querySelector('.bb-page-content'); const dt=new DataTransfer(); dt.setData('text/html',h); dt.setData('text/plain','x'); pc.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));}""", h)


def overflow(pg):
    return pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content')].filter(p=>p.scrollHeight>p.clientHeight+1).length")


with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_context(viewport={"width": 1500, "height": 950}).new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    reset(pg)
    body = "".join(
        f"<h1>Capitolo {c}</h1>" + "".join(f"<p>Paragrafo {c}.{i} lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor.</p>" for i in range(14)) + f"<h2>Sezione {c}.1</h2><p>Testo della sezione {c}.1.</p>"
        for c in range(1, 5)
    )
    paste_html(pg, body)
    time.sleep(2)
    n = pg.evaluate("()=>document.querySelectorAll('.bb-page-content').length")
    ok("documento multipagina", n >= 3, n)

    # ---- sommario in cima
    pg.click(pc + " >> nth=0")
    pg.keyboard.press("Control+Home")
    pg.click('[data-tab="insert"]')
    pg.click("#bb-ins-toc")
    time.sleep(1.5)
    lines = pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content .bb-toc-line')].map(l=>[l.querySelector('.t').textContent,l.querySelector('.n').textContent])")
    print("   voci:", lines)
    ok("sommario con 8 voci (4 H1 + 4 H2)", len(lines) == 8, len(lines))
    # numeri di pagina corretti: la pagina del titolo nel DOM
    real = pg.evaluate("""()=>{const hs=[...document.querySelectorAll('.bb-page-content h1,.bb-page-content h2')].filter(h=>!h.closest('.bb-toc')); const pgs=[...document.querySelectorAll('.bb-page-content')]; return hs.map(h=>[h.textContent, pgs.findIndex(p=>p.contains(h))+1]);}""")
    ok("numeri di pagina del sommario = pagina reale", [[a, int(b_)] for a, b_ in lines] == real, (lines, real))
    ok("nessun overflow dopo il sommario", overflow(pg) == 0)
    # clic su una voce porta al titolo
    pg.evaluate("()=>document.querySelectorAll('.bb-page-content .bb-toc-line')[4].click()")
    time.sleep(.6)
    ok("clic voce: cursore nel titolo", pg.evaluate("()=>{const s=getSelection(); const e=s.anchorNode&&(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement); return !!(e&&e.closest('h1,h2'))}"))
    # aggiungere un capitolo sposta i numeri: l'aggiornamento automatico li corregge
    pg.evaluate("()=>{const h=[...document.querySelectorAll('.bb-page-content h1')].filter(x=>!x.closest('.bb-toc'))[0]; const ps=[...document.querySelectorAll('.bb-page-content')]; }")
    pg.click(pc + " >> nth=1")
    pg.keyboard.press("Control+Home")
    paste_html(pg, "<h1>Capitolo extra</h1>" + "".join(f"<p>Extra {i} testo di riempimento per spostare le pagine in avanti nel documento.</p>" for i in range(60)))
    time.sleep(4.5)       # attesa dell'aggiornamento a riposo
    lines = pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content .bb-toc-line')].map(l=>[l.querySelector('.t').textContent,+l.querySelector('.n').textContent])")
    real = pg.evaluate("""()=>{const hs=[...document.querySelectorAll('.bb-page-content h1,.bb-page-content h2')].filter(h=>!h.closest('.bb-toc')); const pgs=[...document.querySelectorAll('.bb-page-content')]; return hs.map(h=>[h.textContent, pgs.findIndex(p=>p.contains(h))+1]);}""")
    ok("aggiornamento automatico del sommario", lines == real and any("extra" in t for t, _ in lines), (lines[:4], real[:4]))

    # ---- note a piè di pagina
    reset(pg)
    paste_html(pg, "".join(f"<p>Paragrafo {i} lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt.</p>" for i in range(60)))
    time.sleep(2)
    # cursore a fine del paragrafo 2 (pagina 1)
    pg.evaluate("""()=>{const c=document.querySelectorAll('.bb-page-content')[0]; const p=c.children[2]; const r=document.createRange(); r.selectNodeContents(p); r.collapse(false); const s=getSelection(); s.removeAllRanges(); s.addRange(r); c.focus();}""")
    pg.click('[data-tab="insert"]')
    pg.click("#bb-ins-fn")
    pg.fill("#bb-fn-text", "Prima nota: spiegazione del concetto.")
    pg.click("#bb-modal-ok")
    time.sleep(1.2)
    ok("richiamo di nota inserito", pg.evaluate("()=>document.querySelectorAll('.bb-page-content sup.bb-fnref').length") == 1)
    ok("area note in fondo alla pagina 1", pg.evaluate("()=>{const a=document.querySelector('.bb-page .bb-fn-area'); return !!a && a.innerText.includes('Prima nota')}"))
    pad = pg.evaluate("()=>parseFloat(document.querySelectorAll('.bb-page-content')[0].style.paddingBottom)")
    ok("margine inferiore aumentato per le note", pad > 25 * 96 / 25.4 + 15, pad)
    ok("nessun overflow con una nota", overflow(pg) == 0)
    # seconda nota nella pagina 2 e terza nella pagina 1
    pg.evaluate("""()=>{const c=document.querySelectorAll('.bb-page-content')[1]; const p=c.children[1]; const r=document.createRange(); r.selectNodeContents(p); r.collapse(false); const s=getSelection(); s.removeAllRanges(); s.addRange(r); c.focus();}""")
    pg.click("#bb-ins-fn")
    pg.fill("#bb-fn-text", "Seconda nota, pagina successiva.")
    pg.click("#bb-modal-ok")
    time.sleep(1.2)
    nums = pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content sup.bb-fnref')].map(s=>s.textContent)")
    ok("numerazione progressiva 1,2", nums == ["1", "2"], nums)
    areas = pg.evaluate("()=>[...document.querySelectorAll('.bb-page')].map(p=>{const a=p.querySelector('.bb-fn-area'); return a?a.innerText.replace(/\\s+/g,' '):''})")
    ok("ogni nota sulla propria pagina", "Prima nota" in areas[0] and "Seconda nota" in areas[1] and "Seconda" not in areas[0], areas[:3])
    # area dentro la pagina e sotto il testo
    geo = pg.evaluate("""()=>{const pg=document.querySelector('.bb-page'); const c=pg.querySelector('.bb-page-content'); const a=pg.querySelector('.bb-fn-area'); const kids=[...c.children]; const last=kids[kids.length-1].getBoundingClientRect(); const ar=a.getBoundingClientRect(); const pr=pg.getBoundingClientRect(); return {textBottom:last.bottom, areaTop:ar.top, areaBottom:ar.bottom, pageBottom:pr.bottom}}""")
    ok("le note stanno sotto il testo e dentro la pagina", geo["textBottom"] <= geo["areaTop"] + 1 and geo["areaBottom"] <= geo["pageBottom"], geo)
    # modifica di una nota e sua eliminazione
    pg.evaluate("()=>document.querySelectorAll('.bb-page-content sup.bb-fnref')[0].click()")
    pg.fill("#bb-fn-text", "Nota modificata")
    pg.click("#bb-modal-ok")
    time.sleep(.8)
    ok("modifica del testo della nota", "Nota modificata" in pg.evaluate("()=>document.querySelector('.bb-fn-area').innerText"))
    pg.evaluate("()=>document.querySelectorAll('.bb-page-content sup.bb-fnref')[0].click()")
    pg.click("#bb-fn-del")
    time.sleep(1)
    ok("eliminazione: resta una sola nota, rinumerata 1", pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content sup.bb-fnref')].map(s=>s.textContent)") == ["1"])
    ok("eliminazione: area della pagina 1 sparita", pg.evaluate("()=>!document.querySelectorAll('.bb-page')[0].querySelector('.bb-fn-area')"))
    # persistenza
    time.sleep(2)
    pg.reload()
    pg.wait_for_selector(pc)
    time.sleep(1.5)
    ok("note e area dopo il ricaricamento", pg.evaluate("()=>document.querySelectorAll('.bb-page-content sup.bb-fnref').length")==1 and pg.evaluate("()=>!!document.querySelector('.bb-fn-area')"))
    # stampa: la nota compare nel PDF in fondo alla pagina
    pg.emulate_media(media="print")
    pg.pdf(path="notes.pdf", prefer_css_page_size=True, print_background=True)
    d = fitz.open("notes.pdf")
    pdf_pages = [i for i in range(len(d)) if "Seconda nota" in d[i].get_text()]
    ok("nota stampata", len(pdf_pages) == 1, pdf_pages)
    if pdf_pages:
        blocks = [bl for bl in d[pdf_pages[0]].get_text("blocks") if "Seconda nota" in bl[4]]
        ok("nota nella parte bassa del foglio", blocks and blocks[0][1] > 600, blocks[0][:4] if blocks else None)
    ok("nessun errore JS", not errs, errs[:3])
    b.close()
print("FALLITI:", fails)
raise SystemExit(1 if fails else 0)
