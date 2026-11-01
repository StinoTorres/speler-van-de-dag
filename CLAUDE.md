# CLAUDE.md — Speler van de Dag

Dagelijkse Eredivisie-puzzel voor het algemene publiek: raad elke dag de geheime speler in zes pogingen
(club, positie, fantasy-prijs, eigendom, seizoenspunten, punten laatste speelronde). Doel: groeien en
verdienen met advertenties. Naam: "Speler van de Dag" (gekozen 1 nov 2026, staat in `site.json`). Afgeleid van "Differentiale", een FPL-versie
voor een vriendengroep.

Taal: alles wat spelers zien is Nederlands. Code-commentaar ook Nederlands. De eigenaar is geen ontwikkelaar:
leg keuzes kort en in gewone taal uit.

## Snel aan de slag

```bash
python3 build.py                       # src/ + site.json + public/data/players.json → public/index.html
python3 scripts/update_data.py         # nieuwe spelersdata (stand na laatst afgeronde speelronde)
node scripts/make_images.js            # iconen + og.jpg opnieuw (uit src/logo.svg en site.json)
# testen: zie tests/README.md (lokale Postgres + tests/fake_supabase.js + node tests/e2e.js)
```

`public/` is de map die online komt (Cloudflare Pages of vergelijkbaar). Bewerk nooit `public/index.html`
direct: die wordt gebouwd. Bewerk `src/index.html` (opmaak, CSS, markup) en `src/app.js` (logica).

## Opbouw

| Pad | Wat |
|---|---|
| `site.json` | Merknaam, tagline, url, contact, `startDate` (dag 0). Hier verander je de naam. |
| `src/index.html` | Template met CSS en markup; `{{BRAND}}`, `{{URL}}` enz. vult build.py in. |
| `src/app.js` | Alle spellogica (vanilla JS, geen framework). `DATA0`/`SITE` worden bij het bouwen ingevuld. |
| `src/privacy.html`, `src/over.html` | Losse pagina's (privacy bevat nog TODO's). |
| `public/config.js` | Runtime-instellingen: Supabase-URL + publishable key, advertenties aan/uit. Niet gebouwd. |
| `public/data/players.json` | Spelersdata voor zoeken en de oefenronde (geen antwoorden!). |
| `supabase/schema.sql` | Volledig databaseschema + alle `dn_`-functies. Idempotent: opnieuw draaien mag. |
| `scripts/update_data.py` | Haalt data op, schrijft players.json, roept `dn_admin_load` aan. |
| `.github/workflows/update-data.yml` | Elke 3 uur: ping + update als er een nieuwe speelronde is, dan build + commit. |
| `tests/` | Lokale testserver en end-to-end test. |
| `docs/PLAN.md` | Product, verdienmodel, juridische punten, roadmap. Lees dit vóór grote keuzes. |
| `docs/SETUP.md` | Stappenplan om live te gaan (GitHub, Supabase, hosting, AdSense). |

## Hoe het spel werkt (server)

- De browser praat alleen met Supabase-functies (`rpc/dn_*`) met de publishable key. Alle tabellen hebben RLS aan
  en geen rechten voor `anon`/`authenticated`. Spelers worden herkend aan `player_id` + `secret` in localStorage
  (`dnl:id`); een herstelcode zet een profiel over naar een ander toestel.
- **Het antwoord zit alleen op de server** (`dn_answers`), gepland met `random()` door `dn_plan` (zonder herhaling
  binnen 180 dagen, uit de ~250 spelers met het hoogste eigendom). `dn_admin_load` plant steeds 60 dagen vooruit.
- De server rekent vergelijking (`dn_cmp`), hints, score en reeks uit. Score: 70 − 10 × gokken − 5 × hints bij goed, anders 0.
- Hints: 1 = goals + assists dit seizoen, 2 = eerste letter achternaam (`dn_initial`, gelijk aan `initialOf` in app.js).
- Klassement bestaat alleen per poule (`dn_board` weigert alles behalve een poulecode waar je lid van bent).
- Data = stand na de laatst afgeronde speelronde (`finished` + `data_checked`); lopende rondes worden afgetrokken.

## Regels die je niet mag breken

1. **Zet nooit antwoorden (of hun volgorde) in de repository**, ook niet in seed-bestanden of tests. De repo is
   (waarschijnlijk) openbaar; antwoorden in git = valsspelen voor iedereen. Plannen gebeurt alleen in de database.
2. **Zet nooit de Supabase service-sleutel** in code, config.js of chat. Alleen als GitHub-secret `SUPABASE_SERVICE_ROLE_KEY`.
3. Houd `START_DATE` in `supabase/schema.sql` (`dn_today`, `dn_week`) gelijk aan `startDate` in `site.json`.
4. Houd de marges gelijk: `TOL` in app.js ↔ `dn_cmp` in schema.sql.
5. Nieuwe publieke functie? Altijd `security definer`, `set search_path = public`, eerst `dn_check(...)`, en expliciet
   `grant execute ... to anon, authenticated` (zie onderaan schema.sql). Interne functies: `revoke ... from public, anon, authenticated`.
6. Geen clublogo's, geen spelersfoto's, geen officiële Eredivisie/ESPN-branding. Clubkleuren op het shirt is oké.
7. Advertenties alleen in de vaste plekken buiten `#view` (anders herladen ze bij elke klik). Pas aanzetten met
   een door Google gecertificeerde toestemmingsmelding (CMP) — zie docs/PLAN.md.
8. Na wijzigingen: `python3 build.py` en de e2e-test draaien. Telefoon eerst: niets mag horizontaal scrollen op 320 px.

## Stijl

- Vanilla JS, één `el()`-helper voor DOM, state in object `S`, alles opnieuw tekenen via `render()`.
- Kleuren via CSS-variabelen in `src/index.html` (`:root` en `[data-theme=dark]`). Palet afgeleid van ESPN Fantasy
  Voetbal (paars #610f8a, groen #00ff87, lichtblauw #a7f6ff, geel #ffd600, zwarte knoppen #191516), op verzoek van de
  eigenaar. Geen mascotte; logo = vier tegeltjes (`src/logo.svg`), ook gebruikt voor favicon, iconen en og.jpg.
  Lettertype: Inter/systeemletter (geen externe fonts laden, i.v.m. privacy).
- Korte, concrete Nederlandse teksten; geen jargon richting spelers.

## Open taken (zie ook docs/PLAN.md → Roadmap)

- [ ] Domein kiezen en in `site.json` zetten (naam is "Speler van de Dag"); merkenregister checken.
- [ ] Juridische check databron (ESPN Fantasy Voetbal) of overstappen op gelicentieerde data.
- [ ] Privacy-tekst afmaken (TODO's in `src/privacy.html`), CMP + AdSense aanvragen, `public/ads.txt` invullen.
- [ ] Hosting naar Cloudflare Pages met eigen domein; Supabase-project in EU-regio.
- [ ] Rugnummers: databron levert ze niet (`squad_number` is leeg); shirt toont nu alleen de naam.
- [ ] Archief van eerdere dagen (zonder punten) — goed voor retentie en extra paginaweergaven.
- [ ] Profiel-overzetmelding bij eerste keer openen als geïnstalleerde app (iOS deelt geen opslag met Safari).
