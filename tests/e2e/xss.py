import time, json, zipfile
from playwright.sync_api import sync_playwright
payload='<img src=x onerror="window.__pwned=(window.__pwned||[]).concat([\'IMG\'])"><p onmouseover="1" style="x">ok</p><svg onload="window.__pwned=(window.__pwned||[]).concat([\'SVG\'])"></svg><iframe srcdoc="<script>parent.__pwned=(parent.__pwned||[]).concat([\'IFRAME\'])</script>"></iframe><a href="javascript:window.__pwned=1">x</a>'
open("evil.blab","w",encoding="utf-8").write(json.dumps({"meta":{"pageSize":"A4","orient":"portrait","margins":{"top":25,"bottom":25,"left":25,"right":25},"title":"<img src=x onerror=window.__pwned=['TITLE']>"},"pages":[payload]}))
# docx with html-ish text
with zipfile.ZipFile("evil.docx","w") as z:
    z.writestr("[Content_Types].xml",'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    z.writestr("_rels/.rels",'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    z.writestr("word/document.xml",'<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>&lt;img src=x onerror=window.__pwned=[1]&gt; testo</w:t></w:r></w:p></w:body></w:document>')
open("evil.rtf","w").write(r"{\rtf1\ansi <img src=x onerror=window.__pwned=['RTF']> ciao}")
open("evil.txt","w").write("<img src=x onerror=window.__pwned=['TXT']> ciao")
with sync_playwright() as p:
    b=p.chromium.launch(channel="msedge",headless=True); ctx=b.new_context(); pg=ctx.new_page()
    pg.on("dialog",lambda d:d.dismiss())
    for f in ["evil.blab","evil.docx","evil.rtf","evil.txt"]:
        pg.goto("http://localhost:8743/blabla.html"); pg.wait_for_selector(".bb-page-content"); pg.evaluate("()=>{window.__pwned=null;localStorage.clear()}")
        pg.set_input_files("#bb-file-open",f); time.sleep(2.5)
        print(f, "->", pg.evaluate("()=>window.__pwned"), "| html has onerror attr:", pg.evaluate("()=>/onerror|onload|srcdoc|javascript:/i.test(document.querySelector('.bb-page-content').innerHTML)"))
    # paste
    pg.goto("http://localhost:8743/blabla.html"); pg.wait_for_selector(".bb-page-content"); pg.evaluate("()=>{window.__pwned=null;localStorage.clear()}")
    pg.click(".bb-page-content")
    pg.evaluate("""(h)=>{const pc=document.querySelector('.bb-page-content');const dt=new DataTransfer();dt.setData('text/html',h);dt.setData('text/plain','x');pc.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))}""",payload)
    time.sleep(1.5)
    print("paste ->", pg.evaluate("()=>window.__pwned"), "| html has handler:", pg.evaluate("()=>/onerror|onload|srcdoc|javascript:/i.test(document.querySelector('.bb-page-content').innerHTML)"))
    # autosave tamper: poison localStorage then reload
    b.close()
