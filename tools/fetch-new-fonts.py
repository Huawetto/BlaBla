"""Scarica nuovi font (Google Fonts, licenza OFL, liberamente ridistribuibili)
dentro fonts/, evitando famiglie gia' presenti. Script una tantum di supporto,
non fa parte dell'app: puo' essere rilanciato in sicurezza in futuro per
aggiungere altri font (aggiornare FAMILIES sotto)."""
import os
import re
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS_DIR = os.path.join(ROOT, "fonts")

FAMILIES = [
    # Sans-serif
    "Montserrat","Raleway","Nunito","Nunito Sans","Work Sans","Rubik","Karla",
    "Mulish","Manrope","Barlow","Heebo","DM Sans","Sora","Jost","Urbanist",
    "Plus Jakarta Sans","Space Grotesk","Public Sans","IBM Plex Sans","Noto Sans",
    "Source Sans 3","Titillium Web","Cabin","Quicksand","Josefin Sans","Comfortaa",
    "Varela Round","Assistant","Hind","Archivo","Epilogue","Red Hat Display",
    "Figtree","Exo 2","Prompt","Kanit","Maven Pro","Overpass","Saira",
    # Serif
    "Playfair Display","Merriweather","Lora","PT Serif","Noto Serif",
    "Source Serif 4","Crimson Pro","Libre Baskerville","EB Garamond",
    "Cormorant Garamond","Bitter","Domine","Spectral","Vollkorn",
    "Frank Ruhl Libre","Zilla Slab","Cardo","Alegreya",
    # Monospace / slab
    "JetBrains Mono","Fira Code","Space Mono","IBM Plex Mono","Source Code Pro",
    "Inconsolata","Overpass Mono","Ubuntu Mono","Courier Prime","Roboto Slab",
    # Display / handwriting / decorative
    "Pacifico","Dancing Script","Great Vibes","Sacramento","Satisfy","Caveat",
    "Kalam","Shadows Into Light","Indie Flower","Permanent Marker","Lobster",
    "Bungee","Righteous","Anton","Bebas Neue","Passion One","Fredoka","Baloo 2",
    "Patrick Hand","Architects Daughter","Gochi Hand","Kaushan Script",
    "Yellowtail","Tangerine","Cinzel","Cinzel Decorative","Orbitron",
    "Press Start 2P","VT323","Alfa Slab One","Abel","Staatliches",
]

CSS_URL = "https://fonts.googleapis.com/css2?family={}:wght@400"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"


def log(msg):
    print("[fetch_new_fonts] " + msg)


def already_present(family):
    target = re.sub(r"[^a-z0-9]", "", family.lower())
    for name in os.listdir(FONTS_DIR):
        stem = os.path.splitext(name)[0]
        norm = re.sub(r"[^a-z0-9]", "", stem.lower())
        if norm == target or norm.startswith(target) or target in norm:
            return True
    return False


def fetch_family(family):
    css_url = CSS_URL.format(urllib.request.quote(family))
    req = urllib.request.Request(css_url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        css = resp.read().decode("utf-8", "ignore")
    m = re.search(r"src:\s*url\((https://fonts\.gstatic\.com/[^)]+\.(?:ttf|otf))\)", css)
    if not m:
        raise ValueError("nessun URL font trovato nella risposta CSS")
    font_url = m.group(1)
    ext = os.path.splitext(font_url)[1]
    dest = os.path.join(FONTS_DIR, family + ext)
    req2 = urllib.request.Request(font_url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req2, timeout=30) as resp2:
        data = resp2.read()
    with open(dest, "wb") as f:
        f.write(data)
    return dest, len(data)


def main():
    ok, skipped, failed = [], [], []
    for family in FAMILIES:
        if already_present(family):
            skipped.append(family)
            log(family + ": gia' presente (o simile), salto.")
            continue
        try:
            dest, size = fetch_family(family)
            ok.append(family)
            log(family + ": OK (" + os.path.basename(dest) + ", " + str(size) + " bytes)")
        except Exception as e:
            failed.append(family)
            log(family + ": FALLITO (" + str(e) + ")")
        time.sleep(0.2)
    log("Riepilogo: " + str(len(ok)) + " scaricati, " + str(len(skipped)) + " gia' presenti, " + str(len(failed)) + " falliti.")
    if failed:
        log("Falliti: " + ", ".join(failed))


if __name__ == "__main__":
    main()
