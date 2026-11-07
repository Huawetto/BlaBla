"""Le righe di una tabella non devono MAI restare (in parte) oltre il bordo della pagina:
incolla, righe aggiunte a mano, testo digitato in cella, thead/tfoot e piu' tbody."""
import time
from playwright.sync_api import sync_playwright

URL = "http://localhost:8743/blabla.html"
pc = ".bb-page-content"
MEASURE = """()=>[...document.querySelectorAll('.bb-page-content')].map((p,i)=>{
  const pb=parseFloat(getComputedStyle(p).paddingBottom)||0, lim=p.getBoundingClientRect().bottom-pb;
  return {over:p.scrollHeight>p.clientHeight+1, cut:[...p.querySelectorAll('tr')].filter(tr=>tr.getBoundingClientRect().bottom>lim+1).length,
          rows:p.querySelectorAll('tr').length}; })"""
fails = []

def check(name, m, expect_rows=None):
    ok = all(not x["over"] and x["cut"] == 0 for x in m)
    if expect_rows is not None: ok = ok and sum(x["rows"] for x in m) == expect_rows
    print(("PASS " if ok else "FAIL ") + name, [(x["over"], x["cut"], x["rows"]) for x in m])
    if not ok: fails.append(name)

def reset(pg):
    pg.goto(URL); pg.wait_for_selector(pc)
    pg.evaluate("async()=>{localStorage.clear(); await new Promise(r=>{const q=indexedDB.deleteDatabase('blabla'); q.onsuccess=q.onerror=q.onblocked=()=>r();});}")
    pg.reload(); pg.wait_for_selector(pc); time.sleep(1)
    pg.click(pc); pg.keyboard.press("Control+A"); pg.keyboard.press("Delete")

def paste_html(pg, h):
    pg.evaluate("""(h)=>{const pc=document.querySelector('.bb-page-content'); const dt=new DataTransfer(); dt.setData('text/html',h); dt.setData('text/plain','x'); pc.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));}""", h)

def table(n):
    return "<table><tbody>" + "".join(f"<tr><td>riga {i}</td><td>valore {i}</td></tr>" for i in range(n)) + "</tbody></table>"

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_context(viewport={"width": 1500, "height": 950}).new_page()
    reset(pg); paste_html(pg, table(70)); time.sleep(2); check("incolla di 70 righe", pg.evaluate(MEASURE), 70)
    reset(pg); pg.keyboard.type("Titolo"); pg.keyboard.press("Enter"); paste_html(pg, table(10)); time.sleep(1.2)
    for i in range(30):
        pg.evaluate("()=>{const rows=[...document.querySelectorAll('.bb-page-content table tr')]; rows[rows.length-1].cells[0].dispatchEvent(new MouseEvent('click',{bubbles:true}))}")
        pg.evaluate("()=>{[...document.querySelectorAll('#bb-table-toolbar button')].find(b=>b.textContent.includes('Riga sotto')).click()}"); time.sleep(.2)
    time.sleep(1.5); check("30 righe aggiunte a mano in fondo", pg.evaluate(MEASURE), 40)
    reset(pg); pg.keyboard.type("Titolo"); pg.keyboard.press("Enter"); paste_html(pg, table(20)); time.sleep(1.2)
    pg.evaluate("()=>{const c=[...document.querySelectorAll('.bb-page-content table tr')].pop().cells[0]; const r=document.createRange(); r.selectNodeContents(c); r.collapse(false); const s=getSelection(); s.removeAllRanges(); s.addRange(r); c.closest('.bb-page-content').focus()}")
    pg.keyboard.type("testo molto lungo che va a capo dentro la cella " * 12, delay=2); time.sleep(2)
    check("testo digitato nell'ultima cella", pg.evaluate(MEASURE), 20)
    reset(pg)
    paste_html(pg, '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody>' + "".join(f'<tr><td>r{i} uno<br>due<br>tre</td><td>v{i}</td></tr>' for i in range(15)) + '</tbody><tbody>' + "".join(f'<tr><td>s{i} uno<br>due</td><td>w{i}</td></tr>' for i in range(15)) + '</tbody><tfoot><tr><td>tot</td><td>1</td></tr></tfoot></table>')
    time.sleep(2); m = pg.evaluate(MEASURE); check("thead + 2 tbody + tfoot", m, 32)
    foot_last = pg.evaluate("()=>{const ts=[...document.querySelectorAll('.bb-page-content table')]; return ts.map(t=>!!t.tFoot)}")
    ok = foot_last.count(True) == 1 and foot_last[-1]; print(("PASS " if ok else "FAIL ") + "tfoot solo nell'ultima parte", foot_last)
    if not ok: fails.append("tfoot")
    b.close()
print("FALLITI:", fails)
raise SystemExit(1 if fails else 0)
