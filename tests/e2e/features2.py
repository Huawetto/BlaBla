"""Stili personalizzati, modelli di documento, lingua/correttore."""
import time
from playwright.sync_api import sync_playwright
URL="http://localhost:8743/blabla.html"; pc=".bb-page-content"; fails=[]
def ok(name,cond,detail=""):
    print(("PASS " if cond else "FAIL ")+name,detail if (not cond or detail) else "")
    if not cond: fails.append(name)
def wipe(pg):
    pg.goto(URL); pg.wait_for_selector(pc)
    pg.evaluate("async()=>{localStorage.clear(); await new Promise(r=>{const q=indexedDB.deleteDatabase('blabla'); q.onsuccess=q.onerror=q.onblocked=()=>r();});}"); pg.reload(); pg.wait_for_selector(pc); time.sleep(1.2)
    pg.click(pc); pg.keyboard.press("Control+A"); pg.keyboard.press("Delete")
with sync_playwright() as p:
    b=p.chromium.launch(channel="msedge",headless=True); pg=b.new_context(viewport={"width":1500,"height":950}).new_page(); errs=[]
    pg.on("pageerror",lambda e:errs.append(str(e)[:300])); pg.on("console",lambda m: errs.append(m.text[:200]) if m.type=="error" and "404" not in m.text and "font" not in m.text.lower() else None)
    wipe(pg)
    # ---------------- stili ----------------
    pg.keyboard.type("Primo paragrafo"); pg.keyboard.press("Enter"); pg.keyboard.type("Secondo paragrafo"); pg.keyboard.press("Enter"); pg.keyboard.type("Terzo paragrafo")
    pg.click('[data-tab="home"]')
    pg.click("#bb-cs-add"); time.sleep(.4)
    pg.fill("#bb-cs-name","Titolo capitolo"); pg.select_option("#bb-cs-block","h1"); pg.fill("#bb-cs-size","24"); pg.check("#bb-cs-b"); pg.fill("#bb-cs-after","12")
    pg.evaluate("()=>{const e=document.getElementById('bb-cs-color'); e.value='#1d4ed8'; e.dispatchEvent(new Event('input',{bubbles:true}))}")
    pg.click("#bb-modal-ok"); time.sleep(.8)
    h=pg.evaluate("()=>document.querySelector('.bb-page-content').innerHTML")
    ok("stile creato e applicato al paragrafo col cursore","<h1" in h and 'data-bb-style' in h and "font-size:24pt" in h and "#1d4ed8" in h,h[:200])
    ok("stile nell'elenco a tendina",pg.evaluate("()=>[...document.querySelectorAll('#bb-cs-sel option')].some(o=>o.textContent==='Titolo capitolo')"))
    # applica ad un altro paragrafo dalla tendina
    pg.evaluate("""()=>{const c=document.querySelector('.bb-page-content'); const p=[...c.querySelectorAll('p')][0]; const r=document.createRange(); r.selectNodeContents(p); r.collapse(false); const s=getSelection(); s.removeAllRanges(); s.addRange(r); c.focus();}""")
    sid=pg.evaluate("()=>[...document.querySelectorAll('#bb-cs-sel option')].find(o=>o.textContent==='Titolo capitolo').value")
    pg.select_option("#bb-cs-sel",sid); time.sleep(.6)
    n=pg.evaluate("()=>document.querySelectorAll('.bb-page-content h[data-bb-style],.bb-page-content h1[data-bb-style]').length")
    ok("stile applicato da tendina a un secondo paragrafo",n==2,n)
    # modifica propaga a tutti
    pg.click("#bb-cs-manage"); time.sleep(.4); pg.evaluate("()=>document.querySelector('[data-act=edit]').click()"); time.sleep(.4)
    pg.fill("#bb-cs-size","30"); pg.click("#bb-modal-ok"); time.sleep(.8)
    sizes=pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content [data-bb-style]')].map(e=>e.style.fontSize)")
    ok("modifica dello stile aggiornata ovunque",sizes==["30pt","30pt"],sizes)
    # selezione di piu' paragrafi + applica
    pg.click(pc); pg.keyboard.press("Control+A"); sid_=sid; pg.select_option("#bb-cs-sel",sid_); time.sleep(.8)
    n=pg.evaluate("()=>document.querySelectorAll('.bb-page-content [data-bb-style]').length")
    ok("applicazione a tutti i paragrafi selezionati",n==3,n)
    # persistenza nel documento
    time.sleep(2); pg.reload(); pg.wait_for_selector(pc); time.sleep(1.5)
    ok("stili salvati con il documento",pg.evaluate("()=>[...document.querySelectorAll('#bb-cs-sel option')].some(o=>o.textContent==='Titolo capitolo')") and pg.evaluate("()=>document.querySelectorAll('.bb-page-content [data-bb-style]').length")==3)
    # ---------------- lingua ----------------
    pg.click('[data-tab="layout"]'); pg.select_option("#bb-lang-sel","en"); pg.uncheck("#bb-spell-chk"); time.sleep(.5)
    ok("lang=en e spellcheck=false sulle pagine",pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content')].every(c=>c.lang==='en'&&c.getAttribute('spellcheck')==='false')"))
    time.sleep(2); pg.reload(); pg.wait_for_selector(pc); time.sleep(1.5)
    ok("lingua ricordata dopo il ricaricamento",pg.evaluate("()=>document.querySelector('.bb-page-content').lang")=="en" and pg.evaluate("()=>document.getElementById('bb-lang-sel').value")=="en")
    # ---------------- modelli ----------------
    pg.click('[data-tab="layout"]'); pg.select_option("#bb-lang-sel","it")
    pg.click("#bb-templates"); time.sleep(.5)
    ok("galleria con 5 modelli",pg.evaluate("()=>document.querySelectorAll('.bb-tpl').length")==5)
    pg.evaluate("()=>document.querySelector('.bb-tpl[data-id=report]').click()"); time.sleep(.8)
    pg.evaluate("()=>[...document.querySelectorAll('button')].find(b=>/Sì, usa il modello/.test(b.textContent))?.click()"); time.sleep(2.5)
    txt=pg.inner_text(pc)
    ok("modello Relazione applicato",("Titolo della relazione" in txt) and pg.evaluate("()=>document.querySelectorAll('.bb-page-content h1').length")>=4,txt[:50])
    ok("sommario popolato dal modello",pg.evaluate("()=>document.querySelectorAll('.bb-page-content .bb-toc-line').length")>=4)
    ok("intestazione/numeri dal modello",pg.evaluate("()=>BB.HeaderFooter.isActive()") and pg.evaluate("()=>document.querySelectorAll('.bb-hf-footer')[0].style.display")=="none" and True)
    ok("titolo documento = nome modello",pg.input_value("#bb-doc-title")=="Relazione")
    for t in ["letter","cv","minutes","notice"]:
        pg.click("#bb-templates"); time.sleep(.3); pg.evaluate("(t)=>document.querySelector('.bb-tpl[data-id='+t+']').click()",t); time.sleep(.5)
        pg.evaluate("()=>[...document.querySelectorAll('button')].find(b=>/Sì, usa il modello/.test(b.textContent))?.click()"); time.sleep(1.5)
        ov=pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content')].filter(p=>p.scrollHeight>p.clientHeight+1).length")
        ok("modello "+t+" senza overflow",ov==0 and len(pg.inner_text(pc))>100,ov)
    # versione di sicurezza prima del modello
    ok("versione di sicurezza creata",pg.evaluate("async()=>(await BB.Versions.list()).some(v=>/modello/.test(v.label))"))
    ok("nessun errore JS",not errs,errs[:3]); b.close()
print("FALLITI:",fails); raise SystemExit(1 if fails else 0)
