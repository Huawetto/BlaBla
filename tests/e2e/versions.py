"""Cronologia versioni: salvataggio manuale, automatico prima di sostituire, ripristino, eliminazione."""
import time
from playwright.sync_api import sync_playwright
URL="http://localhost:8743/blabla.html"; pc=".bb-page-content"; fails=[]
def ok(name,cond,detail=""):
    print(("PASS " if cond else "FAIL ")+name,detail if (not cond or detail) else "")
    if not cond: fails.append(name)
def wipe(pg):
    pg.goto(URL); pg.wait_for_selector(pc)
    pg.evaluate("async()=>{localStorage.clear(); for(const n of ['blabla','blabla-versions']) await new Promise(r=>{const q=indexedDB.deleteDatabase(n); q.onsuccess=q.onerror=q.onblocked=()=>r();});}"); pg.reload(); pg.wait_for_selector(pc); time.sleep(1.2)
def count(pg): return pg.evaluate("async()=>(await BB.Versions.list()).length")
with sync_playwright() as p:
    b=p.chromium.launch(channel="msedge",headless=True); pg=b.new_context(viewport={"width":1500,"height":950}).new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)[:300]))
    wipe(pg)
    ok("versione 'all'apertura' creata",count(pg)>=1,count(pg))
    pg.click(pc); pg.keyboard.press("Control+A"); pg.keyboard.press("Delete"); pg.keyboard.type("Versione uno del documento"); time.sleep(.5)
    pg.click('[data-tab="view"]'); pg.click("#bb-ver-save"); time.sleep(.8)
    n1=count(pg); ok("salvataggio manuale",n1>=2,n1)
    pg.keyboard.press("Control+A"); pg.click(pc); pg.keyboard.press("Control+A"); pg.keyboard.type("Seconda stesura completamente diversa"); time.sleep(.5)
    pg.click("#bb-ver-save"); time.sleep(.8); ok("secondo salvataggio",count(pg)==n1+1,count(pg))
    pg.keyboard.type(" con una modifica non ancora salvata in cronologia"); time.sleep(.5)
    pg.click("#bb-ver-open"); time.sleep(.8)
    items=pg.evaluate("()=>[...document.querySelectorAll('#bb-ver-list .bb-list-item')].map(i=>i.innerText.replace(/\s+/g,' '))")
    ok("elenco con le versioni",len(items)>=3,items)
    ok("anteprima testo nell'elenco",any("Seconda stesura" in i for i in items) and any("Versione uno" in i for i in items),items)
    # ripristina la versione piu' vecchia con 'Versione uno'
    idx=[i for i,t in enumerate(items) if "Versione uno" in t][0]
    pg.evaluate("(i)=>document.querySelectorAll('#bb-ver-list .bb-list-item')[i].querySelector('[data-act=restore]').click()",idx); time.sleep(.6)
    pg.evaluate("()=>[...document.querySelectorAll('#bb-confirm button, .bb-confirm button, button')].find(b=>/Sì, ripristina/.test(b.textContent))?.click()"); time.sleep(1.2)
    txt=pg.inner_text(pc).strip()
    ok("ripristino: testo della versione scelta",txt.startswith("Versione uno"),txt[:40])
    ok("ripristino: versione di sicurezza creata",count(pg)>=n1+2,count(pg))
    # sicurezza prima di aprire un file: la versione corrente e' salvata
    before=count(pg); pg.click(pc); pg.keyboard.press("Control+A"); pg.keyboard.type("Testo da non perdere dopo l'apertura"); time.sleep(.4)
    open("o.txt","w",encoding="utf-8").write("File aperto"); pg.set_input_files("#bb-file-open","o.txt"); time.sleep(2)
    ok("apertura file: versione di sicurezza",count(pg)>before,(before,count(pg)))
    vs=pg.evaluate("async()=>(await BB.Versions.list()).map(v=>v.label+'|'+v.preview)")
    ok("la versione di sicurezza contiene il testo precedente",any("Testo da non perdere" in v for v in vs),vs[:4])
    # eliminazione
    pg.click('[data-tab="view"]'); pg.click("#bb-ver-open"); time.sleep(.6); c0=count(pg)
    pg.evaluate("()=>document.querySelector('#bb-ver-list [data-act=del]').click()"); time.sleep(.8); ok("eliminazione",count(pg)==c0-1,(c0,count(pg)))
    ok("nessun errore JS",not errs,errs[:3]); b.close()
import os; os.remove("o.txt")
print("FALLITI:",fails); raise SystemExit(1 if fails else 0)
