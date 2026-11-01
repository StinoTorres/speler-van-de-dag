#!/usr/bin/env python3
"""Bouwt public/index.html uit src/index.html + src/app.js.

- vult {{BRAND}}, {{TAGLINE}}, {{URL}} enz. in vanuit site.json
- voegt public/data/players.json in (zodat zoeken meteen werkt, ook offline)
- schrijft public/favicon.svg (de leeuw uit de kop)
- zet in public/sw.js een nieuwe cacheversie, zodat spelers de nieuwe versie krijgen

Gebruik: python3 build.py
"""
import hashlib, json, os, re

ROOT = os.path.dirname(os.path.abspath(__file__))
P = lambda *a: os.path.join(ROOT, *a)

site = json.load(open(P("site.json")))
data = open(P("public", "data", "players.json")).read()
head = open(P("src", "index.html")).read()
js = open(P("src", "app.js")).read()

js = js.replace("/*DATA*/null", data).replace("/*SITE*/null", json.dumps(site, ensure_ascii=False))
a, b = site["brandSplit"]
repl = {"BRAND": site["brand"], "BRAND_A": a, "BRAND_B": b, "TAGLINE": site["tagline"],
        "TAGLINE_CAP": site["tagline"][:1].upper() + site["tagline"][1:], "DESCRIPTION": site["description"],
        "URL": site["url"], "CONTACT": site["contact"]}
page = head + "<script>\n" + js + "</script>\n</body>\n</html>\n"
page = re.sub(r"\{\{([A-Z_]+)\}\}", lambda m: repl[m.group(1)], page)
open(P("public", "index.html"), "w").write(page)

svg = re.search(r'<svg class="day".*?</svg>', page, re.S).group(0)
svg = svg.replace(' class="day"', "").replace(' aria-hidden="true"', ' xmlns="http://www.w3.org/2000/svg"')
open(P("public", "favicon.svg"), "w").write(svg)

# nieuwe cacheversie voor de service worker
ver = hashlib.sha1(page.encode()).hexdigest()[:8]
sw = open(P("public", "sw.js")).read()
sw = re.sub(r'const CACHE = "[^"]*";', 'const CACHE = "dnl-%s";' % ver, sw)
open(P("public", "sw.js"), "w").write(sw)

# manifest en andere pagina's krijgen dezelfde naam
man = json.load(open(P("public", "manifest.webmanifest")))
man.update(name=site["brand"], short_name=site["brand"], description=site["description"])
json.dump(man, open(P("public", "manifest.webmanifest"), "w"), ensure_ascii=False, indent=2)
for name in ("privacy.html", "over.html"):
    src = P("src", name)
    if os.path.exists(src):
        t = re.sub(r"\{\{([A-Z_]+)\}\}", lambda m: repl[m.group(1)], open(src).read())
        open(P("public", name), "w").write(t)
print("ok", len(page), "bytes, cache dnl-" + ver)
