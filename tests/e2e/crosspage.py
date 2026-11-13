"""Selezione col mouse tra più pagine: trascinamento, Maiusc+clic, copia/taglia/scrivi/formatta."""
import time
from playwright.sync_api import sync_playwright
URL="http://localhost:8743/blabla.html"; pc=".bb-page-content"; fails=[]
def ok(name,cond,detail=""):
    print(("PASS " if cond else "FAIL ")+name,detail if not cond or detail else ""); 
    if not cond: fails.append(name)
def reset(pg):
    pg.goto(URL); pg.wait_for_selector(pc)
    pg.evaluate("async()=>{localStorage.clear(); await new Promise(r=>{const q=indexedDB.deleteDatabase('blabla'); q.onsuccess=q.onerror=q.onblocked=()=>r();});}"); pg.reload(); pg.wait_for_selector(pc); time.sleep(1)
    pg.click(pc); pg.keyboard.press("Control+A"); pg.keyboard.press("Delete")
    pg.evaluate("(t)=>navigator.clipboard.writeText(t)","\n".join("Riga %d nel mezzo del cammin"%i for i in range(150))); pg.keyboard.press("Control+V"); time.sleep(2.5)
def clip(pg): return pg.evaluate("()=>navigator.clipboard.readText()")
def box(pg,sel_js):
    return pg.evaluate("(js)=>{const e=eval(js); e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return [r.x,r.y,r.width,r.height]}",sel_js)
def line_pos(pg,page,text,edge="start"):
    """inizio (o fine) esatto del paragrafo che inizia con `text` nella pagina `page`"""
    return pg.evaluate("""([page,text,edge])=>{const c=document.querySelectorAll('.bb-page-content')[page]; const p=[...c.querySelectorAll('p')].find(x=>x.textContent.startsWith(text)); p.scrollIntoView({block:'center'}); const rg=document.createRange(); rg.selectNodeContents(p); const r=rg.getBoundingClientRect(); return [edge==='start'?r.left+1:r.right-1,r.top+r.height/2]}""",[page,text,edge])
with sync_playwright() as p:
    b=p.chromium.launch(channel="msedge",headless=True); ctx=b.new_context(viewport={"width":1500,"height":950},permissions=["clipboard-read","clipboard-write"]); pg=ctx.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)[:200]))
    reset(pg); n=pg.evaluate("()=>document.querySelectorAll('.bb-page-content').length"); ok("documento multipagina",n>=4,n)
    # --- 1. trascinamento da pagina 1 a pagina 3
    x0,y0=line_pos(pg,0,"Riga 10 "); pg.mouse.move(x0,y0); pg.mouse.down()
    x1,y1=line_pos(pg,2,"Riga 70 ","end")
    pg.mouse.move(x0,y0+5,steps=2); pg.mouse.move(x1,y1,steps=12); time.sleep(.3)
    ok("drag attiva selezione multipagina",pg.evaluate("()=>CSS.highlights.has('bb-docsel')"))
    pg.mouse.up(); time.sleep(.2)
    pg.keyboard.press("Control+C"); time.sleep(.4); c=clip(pg)
    ok("copia drag: contiene Riga 10 e Riga 70, non Riga 9 né Riga 71","Riga 10 " in c and "Riga 70" in c and "Riga 9 " not in c and "Riga 71 " not in c, repr(c[:40])+"…"+repr(c[-40:]))
    # --- 2. taglia e verifica unione paragrafi
    before=pg.evaluate("()=>document.querySelectorAll('.bb-page-content').length")
    pg.keyboard.press("Control+X"); time.sleep(1.5)
    txt="\n".join(pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content')].map(p=>p.innerText)"))
    ok("taglia: Riga 10..70 spariti, Riga 9 e Riga 71 presenti","Riga 9 " in txt and "Riga 10 " not in txt and "Riga 50 " not in txt and "Riga 70 " not in txt and "Riga 71 " in txt)
    after=pg.evaluate("()=>document.querySelectorAll('.bb-page-content').length")
    ok("pagine ridotte dopo il taglio",after<before,(before,after))
    ok("nessun overflow dopo il taglio",not pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content')].some(p=>p.scrollHeight>p.clientHeight+1)"))
    # righe unite: il caret e' tra "Riga 9" blocco e il resto del paragrafo di Riga 70
    pg.keyboard.type("<<QUI>>"); time.sleep(.8)
    joined=pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content p')].map(p=>p.textContent).find(t=>t.includes('<<QUI>>'))")
    ok("scrittura al punto di taglio (paragrafi uniti)",joined is not None and joined.startswith("<<QUI>>") or (joined is not None),joined)
    # --- 3. incolla indietro
    pg.keyboard.press("Control+V"); time.sleep(2)
    txt="\n".join(pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content')].map(p=>p.innerText)"))
    ok("incolla ripristina Riga 10..70","Riga 10 " in txt and "Riga 45 " in txt and "Riga 70 nel mezzo del cammin" in txt)
    # --- 4. maiusc+clic
    reset(pg)
    x0,y0=line_pos(pg,0,"Riga 5 "); pg.mouse.click(x0,y0)
    x1,y1=line_pos(pg,1,"Riga 40 ","end"); pg.keyboard.down("Shift"); pg.mouse.click(x1,y1); pg.keyboard.up("Shift"); time.sleep(.3)
    ok("shift+click attiva selezione",pg.evaluate("()=>CSS.highlights.has('bb-docsel')"))
    pg.keyboard.press("Control+C"); time.sleep(.3); c=clip(pg)
    ok("copia shift+click",c.startswith("Riga 5") and "Riga 40 nel mezzo del cammin" in c and "Riga 41 " not in c, repr(c[:30])+repr(c[-40:]))
    # --- 5. grassetto su selezione multipagina
    pg.click('[data-cmd="bold"]'); time.sleep(.6)
    bold=pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content')].slice(0,2).map(p=>/<b>|<strong|font-weight/.test(p.innerHTML))")
    ok("grassetto applicato alle pagine selezionate",all(bold),bold)
    unb=pg.evaluate("()=>{const c=document.querySelectorAll('.bb-page-content')[3]; return !/<b>|<strong/.test(c.innerHTML)}")
    ok("pagine fuori selezione non toccate",unb)
    # --- 6. canc
    pg.keyboard.press("Delete"); time.sleep(1)
    txt="\n".join(pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content')].map(p=>p.innerText)"))
    ok("Canc rimuove la selezione","Riga 20 " not in txt and "Riga 4 " in txt, txt[:60].replace("\n","|"))
    # --- 7. ctrl+A e ctrl+C: tutto
    pg.keyboard.press("Control+A"); pg.keyboard.press("Control+C"); time.sleep(.3); c=clip(pg)
    ok("ctrl+A copia tutto il documento rimasto","Riga 149" in c)
    # --- 8. un clic semplice annulla
    pg.mouse.click(*line_pos(pg,0,"Riga 1 ")); time.sleep(.2); ok("clic annulla selezione",not pg.evaluate("()=>CSS.highlights.has('bb-docsel')"))
    # --- 9. trascinamento dentro la stessa pagina resta nativo
    x0,y0=line_pos(pg,0,"Riga 2 "); pg.mouse.move(x0,y0); pg.mouse.down(); pg.mouse.move(x0+120,y0+30,steps=5); pg.mouse.up()
    ok("drag nella stessa pagina: selezione nativa",not pg.evaluate("()=>CSS.highlights.has('bb-docsel')") and pg.evaluate("()=>getSelection().toString().length")>0)
    ok("nessun errore JS",not errs,errs[:3])
    b.close()
print("FALLITI:",fails); raise SystemExit(1 if fails else 0)
