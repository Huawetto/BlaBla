"""Interfaccia in inglese: nessun testo italiano residuo nelle schede, finestre e avvisi; ritorno all'italiano; contenuto intatto."""
import re, time
from playwright.sync_api import sync_playwright

URL = "http://localhost:8743/blabla.html"
pc = ".bb-page-content"
fails = []

# parole tipicamente italiane (e lettere accentate): se compaiono in inglese, manca una traduzione
IT = re.compile(r"[àèéìòù]|\b(il|lo|la|le|gli|di|del|della|dei|delle|con|non|che|una|uno|sono|è|nel|nella|sul|sulla|alla|dal|dalla|stato|pagina|pagine|documento|apri|salva|testo|riga|righe|colonna|colonne|nuovo|nuova|elimina|modifica|aggiungi|inserisci|scegli|vuoi|puoi|mostra|tutti|tutte|della|questo|questa|sopra|sotto|dopo|prima|ogni|anche|solo|fatto|nessun|nessuna)\b", re.I)
# nomi di font e simili non vanno controllati
FONTISH = re.compile(r"^[A-Z][A-Za-z0-9 ]+$|^Català$|^Résumé / CV$")

JS = """()=>{
 const out=new Set(); const skip=e=>e.closest('.bb-page-content,.bb-thumb-mini,script,style,#bb-doc-title,.bb-fontlist-name,.bb-fonts,#bb-font-list,[data-font]');
 const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); let n;
 while(n=w.nextNode()){ const p=n.parentElement; if(!p||skip(p)) continue; const t=n.nodeValue.replace(/\\s+/g,' ').trim(); if(t.length>1) out.add(t); }
 document.querySelectorAll('[title],[placeholder],[aria-label]').forEach(e=>{ if(skip(e)) return; for(const a of ['title','placeholder','aria-label']){ const v=e.getAttribute(a); if(v) out.add(v.replace(/\\s+/g,' ').trim()); } });
 return [...out];
}"""


def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name, detail if (not cond or detail) else "")
    if not cond:
        fails.append(name)


with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1600, "height": 950})
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    pg.goto(URL)
    pg.wait_for_selector(pc)
    pg.evaluate("async()=>{localStorage.clear(); await new Promise(r=>{const q=indexedDB.deleteDatabase('blabla'); q.onsuccess=q.onerror=q.onblocked=()=>r();});}")
    pg.reload()
    pg.wait_for_selector(pc)
    time.sleep(1)
    before = pg.evaluate("()=>document.querySelector('.bb-page-content').innerHTML")
    title_it = pg.input_value("#bb-doc-title")
    seen = {}

    def collect(tag):
        for t in pg.evaluate(JS):
            if t in ("Català", "Résumé / CV") or "Benvenuto in BlaBla" in t:
                continue
            if IT.search(t) and not (FONTISH.match(t) and len(t.split()) <= 3 and not re.search(r"[àèéìòù]", t)):
                seen.setdefault(t, tag)

    pg.click("#bb-uilang")
    time.sleep(0.8)
    ok("pulsante passa a IT", pg.inner_text("#bb-uilang") == "IT")
    ok("lingua salvata", pg.evaluate("()=>localStorage.getItem('bb-ui-lang')") == "en" and pg.evaluate("()=>BB.uiLang()") == "en")
    ok("titolo predefinito tradotto", pg.input_value("#bb-doc-title") == "Untitled document", pg.input_value("#bb-doc-title"))
    ok("contenuto del documento intatto", pg.evaluate("()=>document.querySelector('.bb-page-content').innerHTML") == before)
    ok("alcune etichette in inglese", pg.evaluate("()=>document.body.innerText.includes('Templates')") and pg.evaluate("()=>document.body.innerText.includes('Save as')"))

    for t in pg.query_selector_all("[data-tab]"):
        t.click()
        time.sleep(0.3)
        collect("tab " + (t.inner_text() or ""))

    def modal(name, js, wait=0.6, close="#bb-modal-cancel"):
        pg.evaluate(js)
        time.sleep(wait)
        collect(name)
        pg.evaluate("()=>{const c=document.querySelector('#bb-modal-back.open #bb-modal-cancel:not(.bb-hidden)')||document.querySelector('#bb-modal-back.open #bb-modal-ok'); if(c) c.click(); document.getElementById('bb-modal-back').classList.remove('open');}")
        time.sleep(0.3)

    pg.click(pc)
    pg.keyboard.press("F1")
    time.sleep(0.6)
    collect("scorciatoie")
    pg.evaluate("()=>document.getElementById('bb-modal-back').classList.remove('open')")
    modal("modelli", "()=>BB.Templates.openGallery()")
    modal("salva come", "()=>BB.SaveAs.open()")
    modal("intest/piè", "()=>document.getElementById('bb-ins-hf').click()")
    modal("numeri pagina", "()=>document.getElementById('bb-ins-pn').click()")
    modal("nota", "()=>document.getElementById('bb-ins-fn').click()")
    modal("stili", "()=>document.getElementById('bb-cs-manage').click()")
    modal("nuovo stile", "()=>document.getElementById('bb-cs-add').click()")
    modal("cronologia", "()=>document.getElementById('bb-ver-open').click()")
    modal("aggiornamenti", "()=>BB.Update.show(null)")
    modal("conferma", "()=>{BB.Confirm.ask('Le modifiche non salvate andranno perse. Vuoi comunque creare un nuovo documento?',{title:'Creare un nuovo documento?',yesLabel:'Sì, crea nuovo'});}")
    # trova & sostituisci
    pg.keyboard.press("Control+F")
    time.sleep(0.5)
    collect("trova")
    pg.keyboard.press("Escape")
    # avvisi
    pg.evaluate("()=>{BB.toast('Seleziona del testo');BB.toast('Massimo 200 righe per tabella','err');BB.toast('3 sostituzioni','ok');}")
    time.sleep(0.4)
    collect("avvisi")

    print("--- testi italiani residui:", len(seen))
    for t, w in sorted(seen.items(), key=lambda kv: kv[1]):
        print("   [%s] %s" % (w, t[:160]))
    ok("nessun testo italiano residuo", not seen, len(seen))

    # ritorno all'italiano
    pg.click("#bb-uilang")
    time.sleep(0.8)
    ok("ritorno all'italiano: etichette originali", pg.evaluate("()=>document.body.innerText.includes('Modelli')") and not pg.evaluate("()=>document.body.innerText.includes('Templates')"))
    ok("titolo ripristinato", pg.input_value("#bb-doc-title") == title_it, pg.input_value("#bb-doc-title"))
    ok("tooltip originali", pg.evaluate("()=>document.getElementById('bb-new').title") == "Nuovo documento (Ctrl+N)", pg.evaluate("()=>document.getElementById('bb-new').title"))
    # la lingua resta dopo il ricaricamento
    pg.click("#bb-uilang")
    time.sleep(0.5)
    pg.reload()
    pg.wait_for_selector(pc)
    time.sleep(1.5)
    ok("la lingua inglese resta dopo il ricaricamento", pg.evaluate("()=>document.body.innerText.includes('Templates')"))
    # scrivere nel documento non viene tradotto
    pg.click(pc)
    pg.keyboard.type("Nuovo documento di prova")
    time.sleep(0.5)
    ok("il testo scritto nel documento resta com'è", "Nuovo documento di prova" in pg.evaluate("()=>document.querySelector('.bb-page-content').innerText"))
    ok("nessun errore JS", not errs, errs[:3])
    b.close()
print("FALLITI:", fails)
raise SystemExit(1 if fails else 0)
