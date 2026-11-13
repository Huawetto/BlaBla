"""Genera gli screenshot e la GIF del README (docs/*.png, docs/demo.gif) con Playwright + Edge.
Serve il server locale:  python -m http.server 8743   (nella cartella del progetto)
Uso:  python tools/make_screenshots.py
"""
import io
import os
import time

import fitz
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs")
URL = "http://localhost:8743/blabla.html"
pc = ".bb-page-content"
os.makedirs(OUT, exist_ok=True)


def make_pdf(path):
    doc = fitz.open()
    txt = ("Il presente documento descrive la procedura di acquisto delle attrezzature informatiche per i laboratori. "
           "Ogni richiesta deve essere approvata dal responsabile e registrata nel sistema entro cinque giorni lavorativi. ") * 3
    for title in ("Procedura di acquisto", "Approvazioni e tempi"):
        pg = doc.new_page(width=595, height=842)
        pg.insert_textbox(fitz.Rect(60, 60, 535, 100), title, fontsize=20, fontname="hebo")
        pg.insert_textbox(fitz.Rect(60, 110, 535, 700), txt, fontsize=11, fontname="helv")
    doc.save(path)


def fresh(pg):
    pg.goto(URL)
    pg.wait_for_selector(pc)
    pg.evaluate("async()=>{localStorage.clear(); await new Promise(r=>{const q=indexedDB.deleteDatabase('blabla'); q.onsuccess=q.onerror=q.onblocked=()=>r();});}")
    pg.reload()
    pg.wait_for_selector(pc)
    time.sleep(1.2)


def settle(pg, s=1.0):
    pg.evaluate("()=>document.querySelectorAll('.bb-toast').forEach(t=>t.remove())")
    time.sleep(s)


def shot(pg, name, frames=None):
    settle(pg, 0.6)
    png = pg.screenshot(path=os.path.join(OUT, name))
    if frames is not None:
        frames.append(Image.open(io.BytesIO(png)).convert("RGB"))
    print("  ", name)


def main():
    pdf = os.path.join(OUT, "_demo.pdf")
    make_pdf(pdf)
    frames = []
    with sync_playwright() as p:
        b = p.chromium.launch(channel="msedge", headless=True)
        pg = b.new_context(viewport={"width": 1440, "height": 860}, device_scale_factor=1, locale="it-IT").new_page()
        fresh(pg)
        shot(pg, "01-benvenuto.png", frames)

        # galleria modelli -> relazione
        pg.click("#bb-templates")
        time.sleep(0.6)
        shot(pg, "02-modelli.png", frames)
        pg.evaluate("()=>document.querySelector('.bb-tpl[data-id=report]').click()")
        time.sleep(0.8)
        if pg.evaluate("()=>document.getElementById('bb-modal-back').classList.contains('open')"):
            pg.click("#bb-modal-ok")             # conferma «sostituisci il documento»
        time.sleep(1.8)
        pg.evaluate("()=>document.querySelectorAll('.bb-toast').forEach(t=>t.remove())")
        pg.click('[data-tab="home"]')
        shot(pg, "03-relazione.png", frames)

        # lo stesso con l'interfaccia in inglese (e il modello in inglese)
        fresh(pg)
        pg.click("#bb-uilang")
        time.sleep(0.8)
        pg.click("#bb-templates")
        time.sleep(0.5)
        pg.evaluate("()=>document.querySelector('.bb-tpl[data-id=report]').click()")
        time.sleep(0.8)
        if pg.evaluate("()=>document.getElementById('bb-modal-back').classList.contains('open')"):
            pg.click("#bb-modal-ok")
        time.sleep(1.8)
        pg.click('[data-tab="insert"]')
        shot(pg, "04-english.png", frames)
        pg.click("#bb-uilang")
        time.sleep(0.8)

        # PDF con originale accanto
        fresh(pg)
        pg.set_input_files("#bb-file-open", pdf)
        t0 = time.time()
        time.sleep(2)
        while time.time() - t0 < 120 and pg.evaluate("()=>document.querySelector('#bb-loading').classList.contains('open')"):
            time.sleep(0.5)
        time.sleep(1)
        pg.click('[data-tab="view"]')
        pg.click("#bb-rev-compare")
        time.sleep(2)
        shot(pg, "05-confronto-pdf.png", frames)

        # cronologia versioni
        pg.click("#bb-ver-save")
        time.sleep(0.8)
        pg.click("#bb-ver-open")
        time.sleep(0.8)
        shot(pg, "06-versioni.png")
        b.close()
    os.remove(pdf)

    # GIF: i fotogrammi principali, ridimensionati
    w = 960
    small = [f.resize((w, int(f.height * w / f.width)), Image.LANCZOS) for f in frames]
    pal = [f.quantize(colors=128, method=Image.Quantize.MEDIANCUT) for f in small]
    pal[0].save(os.path.join(OUT, "demo.gif"), save_all=True, append_images=pal[1:], duration=1800, loop=0, optimize=True)
    print("  demo.gif", os.path.getsize(os.path.join(OUT, "demo.gif")) // 1024, "KB")


if __name__ == "__main__":
    main()
