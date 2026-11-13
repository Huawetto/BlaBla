"""Esporta un documento ricco in .docx e lo verifica: XML valido, python-docx, rilettura con l'importatore."""
import time, os, io, zipfile, base64
from xml.dom import minidom
from playwright.sync_api import sync_playwright
import docx
from PIL import Image

URL = "http://localhost:8743/blabla.html"
pc = ".bb-page-content"
fails = []
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
os.makedirs(OUT, exist_ok=True)


def ok(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name, detail if (not cond or detail) else "")
    if not cond:
        fails.append(name)


img = io.BytesIO()
Image.new("RGB", (300, 200), (30, 120, 200)).save(img, "PNG")
b64 = base64.b64encode(img.getvalue()).decode()
HTML = (
    "<h1>Titolo principale</h1>"
    "<p>Testo normale con <b>grassetto</b>, <i>corsivo</i>, <u>sottolineato</u>, <s>barrato</s>, "
    '<span style="color:#d00">rosso</span>, <span style="background-color:#ffeb3b">evidenziato</span>, '
    'x<sup>2</sup> e H<sub>2</sub>O. Caratteri speciali: &amp; &lt; &gt; "virgolette" àèìòù €.</p>'
    "<h2>Sottotitolo</h2>"
    '<p style="text-align:center">Paragrafo centrato</p>'
    '<p style="text-align:justify">Paragrafo giustificato che deve andare a capo su più righe per verificare '
    "l'allineamento giustificato nel documento Word esportato dal programma.</p>"
    "<ul><li>Punto uno</li><li>Punto due<ul><li>Sotto-punto</li></ul></li></ul>"
    '<ol><li>Primo</li><li>Secondo</li></ol><ol start="5"><li>Cinque</li></ol>'
    "<blockquote>Una citazione importante.</blockquote>"
    '<table><tbody><tr><td rowspan="2" style="background:#dbeafe">A</td><td colspan="2">B-C</td></tr>'
    "<tr><td>D</td><td>E</td></tr><tr><td>F</td><td>G</td><td>H</td></tr></tbody></table>"
    '<p>Dopo la tabella.</p><img src="data:image/png;base64,' + b64 + '" alt="Quadrato blu"><p>Fine.</p>'
)

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1500, "height": 950}, accept_downloads=True)
    ctx.add_init_script("delete window.showSaveFilePicker")
    pg = ctx.new_page()
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
    pg.evaluate("""(h)=>{const pc=document.querySelector('.bb-page-content'); const dt=new DataTransfer(); dt.setData('text/html',h); dt.setData('text/plain','x'); pc.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));}""", HTML)
    time.sleep(1.5)
    # sommario in cima e una nota a piè di pagina
    pg.evaluate("()=>{const c=document.querySelectorAll('.bb-page-content')[0]; const r=document.createRange(); r.setStart(c,0); r.collapse(true); const s=getSelection(); s.removeAllRanges(); s.addRange(r); c.focus();}")
    pg.click('[data-tab="insert"]')
    pg.click("#bb-ins-toc")
    time.sleep(1.2)
    pg.evaluate("""()=>{const c=document.querySelectorAll('.bb-page-content')[0]; const p=[...c.querySelectorAll('p')].find(x=>x.textContent.startsWith('Testo normale')); const r=document.createRange(); r.selectNodeContents(p); r.collapse(false); const s=getSelection(); s.removeAllRanges(); s.addRange(r); c.focus();}""")
    pg.click("#bb-ins-fn")
    pg.fill("#bb-fn-text", "Questa è la nota a piè di pagina.")
    pg.click("#bb-modal-ok")
    time.sleep(1)
    pg.click('[data-tab="insert"]')
    pg.click("#bb-ins-hf")
    pg.fill('[data-z="hl"]', "{titolo}")
    pg.fill('[data-z="fc"]', "Riservato")
    pg.select_option("#bb-hf-numpos", "f-r")
    pg.select_option("#bb-hf-numfmt", "di")
    pg.click("#bb-modal-ok")
    time.sleep(0.8)
    pg.fill("#bb-doc-title", "Prova DOCX")
    pg.click("#bb-saveas")
    time.sleep(0.4)
    ok("formato Word nell'elenco", pg.query_selector('input[name="bb-saveas-fmt"][value="docx"]') is not None)
    pg.check('input[name="bb-saveas-fmt"][value="docx"]')
    with pg.expect_download(timeout=60000) as dl:
        pg.click("#bb-modal-ok")
    path = os.path.join(OUT, "prova.docx")
    dl.value.save_as(path)
    time.sleep(0.5)
    ok("file creato", os.path.getsize(path) > 3000, os.path.getsize(path))

    z = zipfile.ZipFile(path)
    bad = []
    for n in z.namelist():
        if n.endswith((".xml", ".rels")):
            try:
                minidom.parseString(z.read(n))
            except Exception as e:
                bad.append((n, str(e)[:80]))
    ok("tutte le parti XML ben formate", not bad, bad)
    print("   parti:", z.namelist())

    d = docx.Document(path)
    paras = [x.text for x in d.paragraphs]
    styles = [x.style.name for x in d.paragraphs]
    ok("python-docx apre il file", True)
    ok("titolo come Heading 1", "Heading 1" in styles and "Titolo principale" in paras)
    ok("sottotitolo come Heading 2", "Heading 2" in styles)
    full = " ".join(paras)
    ok("caratteri speciali preservati", "& < >" in full and "àèìòù €" in full and '"virgolette"' in full, full[:160])
    runs = [(r.text, r.bold, r.italic, r.underline, r.font.strike, r.font.superscript, r.font.subscript) for x in d.paragraphs for r in x.runs]
    ok("grassetto", any(t == "grassetto" and bo for t, bo, *_ in runs))
    ok("corsivo", any(t == "corsivo" and it for t, _, it, *_ in runs))
    ok("sottolineato", any(t == "sottolineato" and u for t, _, _, u, *_ in runs))
    ok("barrato", any(t == "barrato" and s for t, _, _, _, s, *_ in runs))
    ok("apice e pedice", any(r[5] for r in runs) and any(r[6] for r in runs))
    colors = [r.font.color.rgb for x in d.paragraphs for r in x.runs if r.font.color and r.font.color.type]
    ok("colore rosso", any(str(c) == "DD0000" for c in colors), colors)
    al = [(x.text, x.alignment) for x in d.paragraphs if x.alignment is not None]
    ok("allineamenti centro/giustificato", any("centrato" in t for t, a in al) and any("giustificato" in t for t, a in al), al)
    ok("tabella presente", len(d.tables) == 1)
    t = d.tables[0]
    ok("tabella 3 righe x 3 colonne", len(t.rows) == 3 and len(t.columns) == 3, (len(t.rows), len(t.columns)))
    cells = [[c.text for c in r.cells] for r in t.rows]
    print("   celle:", cells)
    ok("contenuto tabella con celle unite", cells[0][0] == "A" and cells[0][1] == "B-C" and cells[2] == ["F", "G", "H"], cells)
    xml = z.read("word/document.xml").decode()
    ok("rowSpan e colSpan in XML", "w:vMerge" in xml and 'w:gridSpan w:val="2"' in xml)
    ok("elenchi numerati/puntati", "<w:numPr>" in xml and 'w:numId w:val="1"' in xml and 'w:numId w:val="3"' in xml)
    nxml = z.read("word/numbering.xml").decode()
    ok("ol start=5", 'startOverride w:val="5"' in nxml)
    ok("sommario come campo TOC con voci", "TOC " in xml and "TOC1" in xml and "Titolo principale" in xml and "w:leader=\"dot\"" in xml)
    ok("nota a piè di pagina", "w:footnotes" in z.read("word/footnotes.xml").decode() and "Questa è la nota" in z.read("word/footnotes.xml").decode() and "w:footnoteReference" in xml)
    ok("immagine incorporata", any(n.startswith("word/media/") for n in z.namelist()) and "<wp:inline" in xml and 'descr="Quadrato blu"' in xml)
    ok("intestazione e piè di pagina", any(n.startswith("word/header") for n in z.namelist()) and any(n.startswith("word/footer") for n in z.namelist()))
    f = z.read("word/footer1.xml").decode()
    ok("campi PAGE/NUMPAGES nel piè", "PAGE" in f and "NUMPAGES" in f and "Riservato" in f)
    i = xml.find("<w:pgSz")
    ok("formato pagina A4 verticale", 'w:w="11906" w:h="16838"' in xml or 'w:w="11905"' in xml, xml[i:i + 60])
    ok("margini 25 mm", 'w:top="1417"' in xml)

    pg.evaluate("async()=>{localStorage.clear(); await new Promise(r=>{const q=indexedDB.deleteDatabase('blabla'); q.onsuccess=q.onerror=q.onblocked=()=>r();});}")
    pg.reload()
    pg.wait_for_selector(pc)
    time.sleep(1)
    pg.set_input_files("#bb-file-open", path)
    time.sleep(4)
    h = pg.evaluate("()=>[...document.querySelectorAll('.bb-page-content')].map(p=>p.innerHTML).join('')")
    ok("rilettura: titolo, tabella, immagine, elenchi", "Titolo principale" in h and "<table" in h and "<img" in h and "<li" in h and "<h1" in h)
    ok("nessun errore JS", not errs, errs[:3])
    b.close()
print("FALLITI:", fails)
raise SystemExit(1 if fails else 0)
