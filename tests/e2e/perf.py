"""Prestazioni su PC deboli: misure con CPU rallentata (CDP) su documento lungo, apertura menu font, avvio, memoria.
Non fa fallire nulla di per sé: stampa i tempi; con --budget controlla le soglie (per i controlli automatici)."""
import json, sys, time
from playwright.sync_api import sync_playwright

URL = "http://localhost:8743/blabla.html"
pc = ".bb-page-content"
THROTTLE = 4          # 4x piu' lenta: circa un portatile di dieci anni fa
LINES = 1500          # circa 30 pagine
res = {}


def timed(name, fn):
    t = time.time()
    r = fn()
    res[name] = round((time.time() - t) * 1000)
    return r


with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1366, "height": 768})
    pg = ctx.new_page()
    cdp = ctx.new_cdp_session(pg)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": THROTTLE})
    fonts_loaded = []
    pg.on("requestfinished", lambda r: fonts_loaded.append(r.url) if "/fonts/" in r.url and not r.url.endswith(".js") else None)

    t0 = time.time()
    pg.goto(URL)
    pg.wait_for_selector(pc)
    pg.evaluate("async()=>{localStorage.clear(); await new Promise(r=>{const q=indexedDB.deleteDatabase('blabla'); q.onsuccess=q.onerror=q.onblocked=()=>r();});}")
    pg.reload()
    while not pg.evaluate("()=>!!(window.BB&&BB.State&&BB.State.pages&&BB.State.pages.length)"):
        time.sleep(0.1)
    res["avvio_ms"] = round((time.time() - t0) * 1000)
    time.sleep(2)
    res["font_scaricati_all_avvio"] = len(fonts_loaded)

    # documento lungo
    text = "\n".join("Riga %d del documento di prova: il presente testo serve a misurare le prestazioni dell'editor." % i for i in range(LINES))
    pg.click(pc)
    pg.keyboard.press("Control+A")
    pg.keyboard.press("Delete")
    pg.evaluate("t=>navigator.clipboard&&0", text)
    timed("incolla_1500_righe_ms", lambda: pg.evaluate("""t=>{const c=document.querySelector('.bb-page-content'); c.focus(); const dt=new DataTransfer(); dt.setData('text/plain',t); c.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));}""", text))
    time.sleep(3)
    res["pagine"] = pg.evaluate("()=>BB.State.pages.length")

    # digitazione a meta' documento: latenza per carattere
    pg.evaluate("()=>{const p=BB.State.pages[Math.floor(BB.State.pages.length/2)]; p.content.focus(); const r=document.createRange(); r.selectNodeContents(p.content.firstElementChild); r.collapse(false); const s=getSelection(); s.removeAllRanges(); s.addRange(r); }")
    lat = []
    for ch in "abcdefghij":
        t = time.time()
        pg.keyboard.type(ch)
        pg.evaluate("()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))")
        lat.append((time.time() - t) * 1000)
    res["digitazione_ms_per_carattere"] = round(sum(lat) / len(lat))
    time.sleep(2)

    # scorrimento
    timed("scorrimento_ms", lambda: pg.evaluate("""async()=>{const a=document.getElementById('bb-editor-area'); for(let i=0;i<20;i++){ a.scrollTop+=900; await new Promise(r=>requestAnimationFrame(r)); } }"""))

    # menu font: quanti file di font si caricano aprendolo
    before = len(fonts_loaded)
    pg.click('[data-tab="home"]')
    timed("apri_menu_font_ms", lambda: (pg.click("#bb-font-trigger"), time.sleep(1.5)))
    res["font_scaricati_menu"] = len(fonts_loaded) - before

    # memoria
    m = pg.evaluate("()=>performance.memory?{heap_mb:Math.round(performance.memory.usedJSHeapSize/1048576),total_mb:Math.round(performance.memory.totalJSHeapSize/1048576)}:{}")
    res.update(m)
    res["nodi_dom"] = pg.evaluate("()=>document.getElementsByTagName('*').length")
    res["undo_stack_mb"] = pg.evaluate("()=>Math.round(BB.History.stack.reduce((a,s)=>a+s.pages.reduce((b,h)=>b+h.length,0),0)/1048576*10)/10")
    b.close()

print(json.dumps(res, indent=1, ensure_ascii=False))
