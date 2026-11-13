import time, os, fitz
from playwright.sync_api import sync_playwright
pc=".bb-page-content"
def reset(pg):
    pg.goto("http://localhost:8743/blabla.html"); pg.wait_for_selector(pc)
    pg.evaluate("async()=>{localStorage.clear(); await new Promise(r=>{const q=indexedDB.deleteDatabase('blabla'); q.onsuccess=q.onerror=q.onblocked=()=>r();});}")
    pg.reload(); pg.wait_for_selector(pc); time.sleep(1)
with sync_playwright() as p:
    b=p.chromium.launch(channel="msedge",headless=True); ctx=b.new_context(viewport={"width":1500,"height":950},accept_downloads=True); ctx.add_init_script("delete window.showSaveFilePicker")
    pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
    reset(pg)
    # new doc confirm
    pg.click(pc); pg.keyboard.press("Control+A"); pg.keyboard.press("Delete"); pg.keyboard.type("testo da perdere"); time.sleep(.5)
    pg.click("#bb-new"); time.sleep(.5)
    modal=pg.evaluate("()=>document.querySelector('#bb-modal-back').classList.contains('open')")
    print("Nuovo asks confirmation when doc has content:",modal, "|", pg.evaluate("()=>document.querySelector('#bb-modal-body').innerText.slice(0,80)") if modal else "")
    if modal: pg.click("#bb-modal-cancel"); time.sleep(.3)
    print("  text kept after cancel:", "testo da perdere" in pg.inner_text(pc))
    # preset heading
    pg.click(pc); pg.keyboard.press("Control+A")
    pg.evaluate("()=>[...document.querySelectorAll('.bb-btn,button')].find(b=>b.textContent.trim()==='Titolo')?.click()"); time.sleep(.4)
    print("preset Titolo applied:", pg.evaluate("()=>/<h1|font-size/.test(document.querySelector('.bb-page-content').innerHTML)"))
    # undo steps granularity
    reset(pg); pg.click(pc); pg.keyboard.press("Control+A"); pg.keyboard.press("Delete")
    for w in ["uno ","due ","tre "]: pg.keyboard.type(w); time.sleep(.9)
    pg.keyboard.press("Control+Z"); time.sleep(.5); t1=pg.inner_text(pc).strip()
    pg.keyboard.press("Control+Z"); time.sleep(.5); t2=pg.inner_text(pc).strip()
    pg.keyboard.press("Control+Y"); time.sleep(.5); t3=pg.inner_text(pc).strip()
    print("undo/redo via keyboard:",repr(t1),repr(t2),repr(t3))
    # dark theme export
    pg.click("#bb-theme-toggle"); time.sleep(.3)
    print("theme:",pg.evaluate("()=>document.documentElement.getAttribute('data-theme')"))
    pg.click("#bb-saveas"); time.sleep(.4); pg.check('input[name="bb-saveas-fmt"][value="pdfimg"]')
    with pg.expect_download(timeout=90000) as dl: pg.click("#bb-modal-ok")
    path="out/dark.pdf"; dl.value.save_as(path); d=fitz.open(path); pm=d[0].get_pixmap(dpi=30); import statistics
    print("dark-theme PDF page mean brightness (255=white):",round(statistics.mean(pm.samples[::3]),1))
    # delete page with content confirm
    reset(pg); pg.click(pc); pg.keyboard.type("contenuto"); pg.click("#bb-add-page"); time.sleep(.5)
    pg.hover(".bb-page:nth-of-type(1)"); pg.evaluate("()=>document.querySelector('.bb-page .bb-page-del').click()"); time.sleep(.5)
    print("delete page w/ content asks confirm:",pg.evaluate("()=>document.querySelector('#bb-modal-back').classList.contains('open')"))
    print("errors:",errs[:3]); b.close()
