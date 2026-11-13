"""Controllo aggiornamenti: confronto versioni, finestra, risposta simulata di GitHub, offline, controllo giornaliero."""
import json, time
from playwright.sync_api import sync_playwright

URL = "http://localhost:8743/blabla.html"
pc = ".bb-page-content"
fails = []


def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name, detail if (not cond or detail) else "")
    if not cond:
        fails.append(name)


def release(tag):
    return json.dumps({"tag_name": tag, "name": "BlaBla " + tag, "html_url": "https://github.com/Huawetto/BlaBla/releases/tag/" + tag, "body": "Novità:\n- cose"})


with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1500, "height": 950})
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    state = {"tag": "v9.0.0", "calls": 0, "fail": False}

    def handler(route):
        state["calls"] += 1
        if state["fail"]:
            route.abort()
        else:
            route.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=release(state["tag"]))

    ctx.route("https://api.github.com/**", handler)
    pg.goto(URL)
    pg.wait_for_selector(pc)
    pg.evaluate("()=>localStorage.clear()")
    pg.reload()
    pg.wait_for_selector(pc)
    time.sleep(1)

    ok("versione dichiarata", pg.evaluate("()=>/^\\d+\\.\\d+\\.\\d+$/.test(BB.Update.current())"), pg.evaluate("()=>BB.Update.current()"))
    cmp = pg.evaluate("()=>[BB.Update.newer('v1.2.0','1.1.9'),BB.Update.newer('1.1.0','1.1.0'),BB.Update.newer('1.0.9','1.1.0'),BB.Update.newer('2.0','1.9.9'),BB.Update.newer('1.10.0','1.9.0')]")
    ok("confronto versioni", cmp == [True, False, False, True, True], cmp)

    # versione più recente disponibile
    pg.click("#bb-updates")
    time.sleep(0.5)
    pg.click("#bb-modal-ok")          # «Controlla ora»
    time.sleep(1.5)
    body = pg.inner_text("#bb-modal-body")
    ok("annuncia la nuova versione", "9.0.0" in body and "disponibile" in body, body[:120])
    ok("pulsante «Apri la pagina»", pg.inner_text("#bb-modal-ok") == "Apri la pagina")
    # l'apertura non porta fuori da GitHub/BlaBla
    pg.evaluate("()=>{window.__opened=[]; window.open=(u)=>{window.__opened.push(u)}}")
    pg.click("#bb-modal-ok")
    time.sleep(0.4)
    opened = pg.evaluate("()=>window.__opened")
    ok("apre la pagina della release", opened and opened[0].startswith("https://github.com/Huawetto/BlaBla/"), opened)

    # già aggiornato
    state["tag"] = "v" + pg.evaluate("()=>BB.Update.current()")
    res = pg.evaluate("async()=>(await BB.Update.check()).status")
    ok("stessa versione: nessun avviso", res == "current", res)

    # offline / errore: silenzioso nell'avvio, spiegato nella finestra
    state["fail"] = True
    res = pg.evaluate("async()=>(await BB.Update.check()).status")
    ok("errore di rete gestito", res == "error", res)
    pg.click("#bb-modal-cancel") if pg.evaluate("()=>document.getElementById('bb-modal-back').classList.contains('open')") else None
    pg.click("#bb-updates")
    time.sleep(0.4)
    pg.click("#bb-modal-ok")
    time.sleep(1.5)
    ok("messaggio offline nella finestra", "Non riesco a contattare GitHub" in pg.inner_text("#bb-modal-body"))
    pg.click("#bb-modal-cancel")

    # controllo automatico: una volta al giorno, e spegnibile
    state["fail"] = False
    state["tag"] = "v9.0.0"
    pg.evaluate("()=>localStorage.removeItem('bb-update')")
    state["calls"] = 0
    pg.reload()
    pg.wait_for_selector(pc)
    pg.wait_for_timeout(12000)
    ok("controllo automatico all'avvio", state["calls"] == 1, state["calls"])
    ok("avviso mostrato (una sola volta per versione)", json.loads(pg.evaluate("()=>localStorage.getItem('bb-update')"))["skip"] == "v9.0.0")
    pg.reload()
    pg.wait_for_selector(pc)
    pg.wait_for_timeout(12000)
    ok("non ripete prima di 24 ore", state["calls"] == 1, state["calls"])
    pg.evaluate("()=>localStorage.setItem('bb-update',JSON.stringify({enabled:false,last:0,latest:'',skip:''}))")
    pg.reload()
    pg.wait_for_selector(pc)
    pg.wait_for_timeout(12000)
    ok("spento: nessun controllo", state["calls"] == 1, state["calls"])
    ok("nessun errore JS", not errs, errs[:3])
    b.close()
print("FALLITI:", fails)
raise SystemExit(1 if fails else 0)
