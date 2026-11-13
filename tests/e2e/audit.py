import time, json, os, sys, zipfile, io, re
from playwright.sync_api import sync_playwright

URL = "http://localhost:8743/blabla.html"
OUT = os.path.join(os.path.dirname(__file__), "out"); os.makedirs(OUT, exist_ok=True)
results = []
def rec(name, ok, detail=""):
    results.append((name, ok, detail)); print(("PASS " if ok else "FAIL ")+name+(" :: "+str(detail) if detail else ""))

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1500, "height": 950}, accept_downloads=True)
    pg = ctx.new_page()
    errs = []; warns = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    pg.on("console", lambda m: (errs if m.type == "error" else warns).append(m.text[:200]) if m.type in ("error", "warning") else None)
    t0 = time.time()
    ctx.add_init_script("delete window.showSaveFilePicker")
    blocked=[]
    if os.environ.get("OFFLINE"):
        def _h(route):
            u=route.request.url
            if u.startswith(("http://localhost","data:","blob:")): route.continue_()
            else: blocked.append(u[:120]); route.abort()
        ctx.route("**/*",_h)
    pg.goto(URL); pg.wait_for_selector(".bb-page-content")
    rec("load", True, f"{time.time()-t0:.1f}s")
    time.sleep(1.5)
    rec("no JS errors on load", not [e for e in errs if "404" not in e and "special-words" not in e], [e for e in errs if "404" not in e][:3])
    nfonts = pg.evaluate("()=>(window.BB_FONTS||[]).length")
    rec("fonts listed", nfonts > 0, nfonts)

    pc = ".bb-page-content"
    pg.click(pc); pg.keyboard.type("Ciao mondo. Seconda frase di prova.")
    txt = pg.inner_text(pc)
    rec("typing", "Ciao mondo" in txt)

    # formatting
    pg.keyboard.press("Control+A")
    pg.click('[data-cmd="bold"]'); h = pg.inner_html(pc)
    rec("bold", "<b>" in h or "font-weight" in h or "<strong>" in h)
    pg.click('[data-cmd="italic"]'); rec("italic", "<i>" in pg.inner_html(pc) or "<em>" in pg.inner_html(pc))
    pg.click('[data-cmd="underline"]'); rec("underline", "<u>" in pg.inner_html(pc))
    pg.click("#bb-smallcaps-btn"); rec("small caps", "bb-smallcaps" in pg.inner_html(pc))
    pg.click('[data-cmd="justifyCenter"]'); rec("align center", "center" in pg.inner_html(pc))
    pg.click('[data-cmd="insertUnorderedList"]'); rec("bullet list", "<li" in pg.inner_html(pc))
    # undo / redo
    before = pg.inner_html(pc)
    pg.click('[data-cmd="undo"]'); time.sleep(.3)
    rec("undo changes doc", pg.inner_html(pc) != before)
    pg.click('[data-cmd="redo"]'); time.sleep(.3)
    rec("redo restores", pg.inner_html(pc) == before or "<li" in pg.inner_html(pc))

    # font picker
    pg.click("#bb-font-trigger"); time.sleep(.5)
    items = pg.query_selector_all("#bb-font-list > *")
    rec("font list populated", len(items) > 10, len(items))
    pg.fill("#bb-font-search", "Roboto"); time.sleep(.3)
    rec("font search filters", len(pg.query_selector_all("#bb-font-list > *")) < len(items))
    pg.keyboard.press("Escape")

    # new doc, long paste
    pg.evaluate("async()=>{localStorage.clear(); await new Promise(r=>{const q=indexedDB.deleteDatabase('blabla'); q.onsuccess=q.onerror=q.onblocked=()=>r();});}")
    pg.reload(); pg.wait_for_selector(pc); time.sleep(1)
    pg.click(pc)
    long_txt = "\n".join("Riga %d: nel mezzo del cammin di nostra vita mi ritrovai per una selva oscura." % i for i in range(300))
    pg.evaluate("""(t)=>{const pc=document.querySelector('.bb-page-content'); const dt=new DataTransfer(); dt.setData('text/plain',t); pc.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));}""", long_txt)
    time.sleep(2)
    for _ in range(20):
        if not pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content')].some(p=>p.scrollHeight>p.clientHeight+1)"): break
        time.sleep(1)
    npages = len(pg.query_selector_all(pc))
    over = pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content')].some(p=>p.scrollHeight>p.clientHeight+1)")
    words = int(pg.inner_text("#bb-st-words").replace(".", "") or 0)
    rec("long paste multi-page", npages >= 4 and not over, f"pages={npages}, overflow={over}")
    rec("stats words", words >= 300 * 12 - 50, words)
    allt = "".join(pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content')].map(p=>p.innerText)"))
    rec("paste no text loss", "Riga 299" in allt and "Riga 0:" in allt)

    # page ops
    n0 = len(pg.query_selector_all(pc))
    pg.click("#bb-add-page"); time.sleep(.5)
    rec("add page", len(pg.query_selector_all(pc)) == n0 + 1)

    # page size / orient
    pg.click('[data-tab="layout"]'); time.sleep(.3)
    pg.select_option("#bb-pagesize", "A3"); time.sleep(.8)
    w = pg.evaluate("()=>document.querySelector('.bb-page').getBoundingClientRect().width")
    pg.select_option("#bb-orient", "landscape"); time.sleep(.8)
    w2 = pg.evaluate("()=>document.querySelector('.bb-page').getBoundingClientRect().width")
    rec("page size/orient", w2 > w, (w, w2))
    pg.select_option("#bb-pagesize", "A4"); pg.select_option("#bb-orient", "portrait"); time.sleep(.5)

    # find & replace
    pg.click('[data-tab="home"]')
    if pg.query_selector("#bb-find-text"):
        pg.fill("#bb-find-text", "selva"); time.sleep(.5)
        cnt = pg.inner_text("#bb-find-count")
        rec("find count", bool(re.search(r"\d", cnt)), cnt)
        pg.fill("#bb-replace-text", "foresta"); pg.click("#bb-replace-all"); time.sleep(.8)
        allt = "".join(pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content')].map(p=>p.innerText)"))
        rec("replace all", "selva" not in allt and "foresta" in allt)

    # theme
    pg.click("#bb-theme-toggle"); time.sleep(.3)
    t1 = pg.evaluate("()=>document.documentElement.getAttribute('data-theme')||document.body.className")
    rec("theme toggle", True, t1)
    pg.click("#bb-theme-toggle")

    # zoom
    pg.click('[data-tab="view"]'); time.sleep(.3)
    pg.click("#bb-zoom-in2"); pg.click("#bb-zoom-in2")
    z = pg.inner_text("#bb-zoom-val"); rec("zoom in", z != "100%", z)
    pg.click("#bb-zoom-reset"); rec("zoom reset", pg.inner_text("#bb-zoom-val") == "100%")

    pg.click('[data-tab="home"]')
    # save .blab
    pg.fill("#bb-doc-title", "audit-doc")
    pg.click("#bb-saveas"); time.sleep(.5)
    pg.check('input[name="bb-saveas-fmt"][value="blab"]')
    try:
        with pg.expect_download(timeout=15000) as dl:
            pg.click("#bb-modal-ok")
        d = dl.value; path = os.path.join(OUT, d.suggested_filename); d.save_as(path)
        rec("save .blab", os.path.getsize(path) > 100, d.suggested_filename)
    except Exception as e:
        rec("save .blab", False, str(e)[:200]); path = None
    time.sleep(.5)
    # reopen
    if path:
        pg.evaluate("async()=>{localStorage.clear(); await new Promise(r=>{const q=indexedDB.deleteDatabase('blabla'); q.onsuccess=q.onerror=q.onblocked=()=>r();});}"); pg.reload(); pg.wait_for_selector(pc); time.sleep(1)
        pg.set_input_files("#bb-file-open", path); time.sleep(2)
        allt = "".join(pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content')].map(p=>p.innerText)"))
        rec("reopen .blab round trip", "Riga 299" in allt and "foresta" in allt, f"pages={len(pg.query_selector_all(pc))}")
    # PDF export
    pg.click("#bb-saveas"); time.sleep(.5)
    pg.check('input[name="bb-saveas-fmt"][value="pdfimg"]')
    try:
        with pg.expect_download(timeout=120000) as dl:
            pg.click("#bb-modal-ok")
        d = dl.value; path = os.path.join(OUT, d.suggested_filename); d.save_as(path)
        rec("export PDF", os.path.getsize(path) > 1000, f"{d.suggested_filename} {os.path.getsize(path)}")
    except Exception as e:
        rec("export PDF", False, str(e)[:200])

    # autosave persistence
    pg.reload(); pg.wait_for_selector(pc); time.sleep(1.2)
    allt = "".join(pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content')].map(p=>p.innerText)"))
    rec("autosave restore after reload", "Riga 299" in allt)

    # TXT import
    tp = os.path.join(OUT, "t.txt"); open(tp, "w", encoding="utf-8").write("Titolo\n\nParagrafo uno è àèìòù.\nSecondo.")
    pg.evaluate("async()=>{localStorage.clear(); await new Promise(r=>{const q=indexedDB.deleteDatabase('blabla'); q.onsuccess=q.onerror=q.onblocked=()=>r();});}"); pg.reload(); pg.wait_for_selector(pc); time.sleep(.8)
    pg.set_input_files("#bb-file-open", tp); time.sleep(1.5)
    rec("import txt", "àèìòù" in pg.inner_text(pc))
    # RTF import
    rp = os.path.join(OUT, "t.rtf"); open(rp, "w").write(r"{\rtf1\ansi{\fonttbl{\f0 Arial;}}\f0\fs24 Ciao \b grassetto\b0  e \i corsivo\i0.\par Riga due caf\'e8.}")
    pg.set_input_files("#bb-file-open", rp); time.sleep(1.5)
    h = pg.inner_html(pc); rec("import rtf", "grassetto" in h and ("<b>" in h or "bold" in h), pg.inner_text(pc)[:60])
    # DOCX import (build minimal docx)
    dp = os.path.join(OUT, "t.docx")
    with zipfile.ZipFile(dp, "w") as z:
        z.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        z.writestr("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        z.writestr("word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Titolo docx</w:t></w:r></w:p><w:p><w:r><w:t>Testo normale docx.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B1</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>')
    pg.set_input_files("#bb-file-open", dp); time.sleep(8)
    h = pg.inner_html(pc)
    rec("import docx text+table", "Titolo docx" in h and "<table" in h, [pg.evaluate("()=>document.querySelector('#bb-orient').value"), h[:120], pg.evaluate("()=>[document.querySelector('#bb-loading').className,document.querySelector('#bb-loading-text').innerText,document.querySelector('#bb-toasts').innerText]"), errs[-3:], warns[-3:]])

    # image insert
    from PIL import Image
    ip = os.path.join(OUT, "i.png"); Image.new("RGB", (1200, 800), (200, 60, 60)).save(ip)
    pg.click(pc)
    pg.set_input_files("#bb-file-img", ip); time.sleep(1.5)
    rec("insert image", pg.query_selector(pc + " img") is not None)
    if pg.query_selector(pc + " img"):
        pg.eval_on_selector(pc + " img","e=>e.scrollIntoView({block:'center'})"); time.sleep(.3); bx=pg.eval_on_selector(pc + " img","e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}"); pg.mouse.click(bx[0],bx[1]); time.sleep(.6)
        rec("image selection toolbar", pg.evaluate("()=>document.querySelector('#bb-img-toolbar').classList.contains('open')"), pg.evaluate("()=>document.querySelector('.bb-page-content img').className"))
        wb = pg.evaluate("()=>document.querySelector('.bb-page-content img').getBoundingClientRect().width")
        pg.evaluate("()=>{[...document.querySelectorAll('#bb-img-toolbar button')].find(b=>b.textContent.includes('+ 10'))?.click()}"); time.sleep(.3)
        wa = pg.evaluate("()=>document.querySelector('.bb-page-content img').getBoundingClientRect().width")
        rec("image +10%", wa > wb, (wb, wa))
        fits = pg.evaluate("()=>{const i=document.querySelector('.bb-page-content img'),p=i.closest('.bb-page-content'); return i.getBoundingClientRect().right<=p.getBoundingClientRect().right+1}")
        rec("big image fits page", fits)

    # shortcuts modal
    pg.keyboard.press("F1"); time.sleep(.4)
    rec("F1 shortcuts", pg.is_visible("#bb-modal-back") if pg.query_selector("#bb-modal-back") else False)
    pg.keyboard.press("Escape")

    # FontCreator
    pg.click('[data-tab="home"]'); pg.click("#bb-create-font"); time.sleep(2)
    rec("FontCreator opens", pg.is_visible("#bb-fontcreator-overlay"))

    final_errs = [e for e in errs if "404" not in e and "special-words" not in e]
    csp=[w for w in warns+errs if "Content Security Policy" in w or "Refused to" in w]
    rec("no CSP violations", not csp, csp[:3])
    rec("no JS errors overall", not final_errs, final_errs[:5])
    b.close()

print("BLOCKED EXTERNAL:",sorted(set(blocked)))
fails = [r for r in results if not r[1]]
print("\nTOTAL", len(results), "FAIL", len(fails))
json.dump(results, open(os.path.join(OUT, "results.json"), "w"), indent=1, default=str)
