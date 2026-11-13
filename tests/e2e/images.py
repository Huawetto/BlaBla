"""Immagini: disposizione, testo alternativo, didascalia numerata, ritaglio."""
import time, io
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

URL = "http://localhost:8743/blabla.html"
pc = ".bb-page-content"
fails = []


def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name, detail if (not cond or detail) else "")
    if not cond:
        fails.append(name)


def mkimg(path):
    im = Image.new("RGB", (400, 300), (240, 240, 240))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 199, 149], fill=(220, 40, 40))       # quarto in alto a sinistra rosso
    d.rectangle([200, 150, 399, 299], fill=(40, 40, 220))   # quarto in basso a destra blu
    im.save(path)


mkimg("im.png")
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_context(viewport={"width": 1500, "height": 950}).new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" and "404" not in m.text and "font" not in m.text.lower() else None)
    pg.goto(URL)
    pg.wait_for_selector(pc)
    pg.evaluate("async()=>{localStorage.clear(); await new Promise(r=>{const q=indexedDB.deleteDatabase('blabla'); q.onsuccess=q.onerror=q.onblocked=()=>r();});}")
    pg.reload()
    pg.wait_for_selector(pc)
    time.sleep(1)
    pg.click(pc)
    pg.keyboard.press("Control+A")
    pg.keyboard.press("Delete")
    pg.keyboard.type("Testo prima dell'immagine. ")
    pg.set_input_files("#bb-file-img", "im.png")
    time.sleep(1.5)
    pg.keyboard.type("Testo che segue l'immagine e che deve scorrere accanto quando si sceglie la disposizione a fianco. " * 3)
    time.sleep(0.5)

    def click_img():
        pg.eval_on_selector(pc + " img", "e=>e.scrollIntoView({block:'center'})")
        time.sleep(0.2)
        bx = pg.eval_on_selector(pc + " img", "e=>{const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}")
        pg.mouse.click(bx[0], bx[1])
        time.sleep(0.4)

    click_img()
    labels = pg.evaluate("()=>[...document.querySelectorAll('#bb-img-toolbar button')].map(b=>b.textContent)")
    ok("pulsanti nuovi nella barra", any("Disposizione" in l for l in labels) and any("Didascalia" in l for l in labels) and any("Ritaglia" in l for l in labels), labels)

    # ---- disposizione: testo a fianco
    pg.evaluate("()=>[...document.querySelectorAll('#bb-img-toolbar button')].find(b=>/Disposizione/.test(b.textContent)).click()")
    time.sleep(0.4)
    pg.check('input[name="bb-wrap"][value="left"]')
    pg.fill("#bb-img-alt", "Quadrato rosso e blu")
    pg.click("#bb-modal-ok")
    time.sleep(1)
    st = pg.evaluate("()=>{const i=document.querySelector('.bb-page-content img'); return {f:getComputedStyle(i).float, alt:i.alt}}")
    ok("float a sinistra e alt impostati", st["f"] == "left" and st["alt"] == "Quadrato rosso e blu", st)
    geo = pg.evaluate("""()=>{const i=document.querySelector('.bb-page-content img').getBoundingClientRect(); const p=[...document.querySelectorAll('.bb-page-content p')].find(x=>x.textContent.includes('Testo che segue')); const r=document.createRange(); r.selectNodeContents(p); const rects=[...r.getClientRects()]; return {imgRight:i.right, imgTop:i.top, imgBottom:i.bottom, firstTextLeft:rects[0]&&rects[0].left, textTop:rects[0]&&rects[0].top}}""")
    ok("il testo scorre accanto all'immagine", geo["firstTextLeft"] is not None and geo["firstTextLeft"] >= geo["imgRight"] - 1 and geo["textTop"] < geo["imgBottom"], geo)
    ok("nessun overflow", pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content')].every(p=>p.scrollHeight<=p.clientHeight+1)"))

    # ---- sopra e sotto
    click_img()
    pg.evaluate("()=>[...document.querySelectorAll('#bb-img-toolbar button')].find(b=>/Disposizione/.test(b.textContent)).click()")
    time.sleep(0.3)
    pg.check('input[name="bb-wrap"][value="block"]')
    pg.click("#bb-modal-ok")
    time.sleep(1)
    ok("disposizione sopra/sotto", pg.evaluate("()=>{const s=document.querySelector('.bb-page-content img').style; return s.display==='block'&&s.float===''}"))

    # ---- didascalia
    click_img()
    pg.evaluate("()=>[...document.querySelectorAll('#bb-img-toolbar button')].find(b=>/Didascalia/.test(b.textContent)).click()")
    time.sleep(0.8)
    pg.keyboard.type("Prova di didascalia")
    time.sleep(0.4)
    cap = pg.evaluate("()=>{const c=document.querySelector('.bb-page-content p.bb-caption'); return c?c.textContent:null}")
    ok("didascalia numerata", cap == "Figura 1: Prova di didascalia", cap)
    ok("didascalia subito dopo l'immagine", pg.evaluate("()=>{const i=document.querySelector('.bb-page-content img'); let n=i; while(n.parentNode&&!n.parentNode.classList.contains('bb-page-content')) n=n.parentNode; return n.nextElementSibling&&n.nextElementSibling.classList.contains('bb-caption')}"))
    click_img()
    pg.evaluate("()=>[...document.querySelectorAll('#bb-img-toolbar button')].find(b=>/Didascalia/.test(b.textContent)).click()")
    time.sleep(0.5)
    ok("seconda richiesta non duplica la didascalia", pg.evaluate("()=>document.querySelectorAll('.bb-page-content p.bb-caption').length") == 1)

    # ---- ritaglio: tiene solo il quarto in alto a sinistra (rosso)
    click_img()
    w0 = pg.evaluate("()=>document.querySelector('.bb-page-content img').offsetWidth")
    pg.evaluate("()=>[...document.querySelectorAll('#bb-img-toolbar button')].find(b=>/Ritaglia/.test(b.textContent)).click()")
    time.sleep(0.8)
    box = pg.evaluate("()=>{const r=document.getElementById('bb-crop-img').getBoundingClientRect(); return [r.x,r.y,r.width,r.height]}")
    ok("finestra di ritaglio con l'immagine", box[2] > 100)
    # trascina il bordo SE del riquadro verso il centro dell'immagine
    se = pg.evaluate("()=>{const r=document.querySelector('#bb-crop-box i[data-h=se]').getBoundingClientRect(); return [r.x+r.width/2,r.y+r.height/2]}")
    pg.mouse.move(se[0], se[1])
    pg.mouse.down()
    pg.mouse.move(box[0] + box[2] / 2, box[1] + box[3] / 2, steps=8)
    pg.mouse.up()
    time.sleep(0.3)
    pg.click("#bb-modal-ok")
    time.sleep(1)
    res = pg.evaluate("""async()=>{const i=document.querySelector('.bb-page-content img'); await i.decode(); const c=document.createElement('canvas'); c.width=i.naturalWidth; c.height=i.naturalHeight; const x=c.getContext('2d'); x.drawImage(i,0,0); const d=x.getImageData(5,5,1,1).data; const e=x.getImageData(i.naturalWidth-6,i.naturalHeight-6,1,1).data; return {nw:i.naturalWidth,nh:i.naturalHeight,tl:[d[0],d[1],d[2]],br:[e[0],e[1],e[2]],w:i.offsetWidth}}""")
    ok("ritaglio: dimensioni ridotte a ~metà", 190 <= res["nw"] <= 215 and 140 <= res["nh"] <= 160, res)
    ok("ritaglio: resta solo la parte rossa", res["tl"][0] > 200 and res["tl"][2] < 80 and res["br"][0] > 200 and res["br"][2] < 80, res)
    ok("ritaglio: dimensione a schermo proporzionata", abs(res["w"] - w0 / 2) < 12, (res["w"], w0))
    # annulla ripristina l'originale
    pg.keyboard.press("Control+Z")
    time.sleep(0.8)
    nat = pg.evaluate("async()=>{const i=document.querySelector('.bb-page-content img'); await i.decode(); return i.naturalWidth}")
    ok("annulla ripristina l'immagine intera", nat == 400, nat)

    # ---- salvataggio/rilettura
    time.sleep(2)
    pg.reload()
    pg.wait_for_selector(pc)
    time.sleep(1.5)
    ok("didascalia e disposizione dopo il ricaricamento", pg.evaluate("()=>!!document.querySelector('.bb-page-content p.bb-caption')&&document.querySelector('.bb-page-content img').alt==='Quadrato rosso e blu'"))
    ok("nessun errore JS", not errs, errs[:3])
    b.close()
import os

os.remove("im.png")
print("FALLITI:", fails)
raise SystemExit(1 if fails else 0)
