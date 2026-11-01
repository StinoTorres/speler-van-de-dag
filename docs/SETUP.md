# Live zetten: stappenplan

Volg de stappen op volgorde. Bij elke stap staat wie het doet: **jij** (in je browser) of **Claude Code** (in deze repo).

## 1. Repository op GitHub — jij
1. Maak een nieuwe repository, bijvoorbeeld `differentiale-nl`. Openbaar mag, want er staan geen antwoorden of
   geheimen in.
2. Upload deze map, of laat Claude Code pushen.
3. Open de map in Claude Code (`claude` in de projectmap). `CLAUDE.md` wordt dan automatisch gelezen.

## 2. Supabase — jij
1. Maak een **nieuw** Supabase-project in regio **EU (Frankfurt of Amsterdam)**. Gebruik niet het project van
   Transferroute of Differentiale; houd het publieke spel gescheiden.
2. Ga naar SQL Editor → New query, plak `supabase/schema.sql` en klik Run.
3. Ga naar Project Settings → API keys en noteer:
   - de **Project URL** en de **publishable key** (die gaan in `public/config.js`);
   - de **secret key** (`sb_secret_…`). Die gaat alleen naar GitHub-secrets, nooit in een bestand of chat.

## 3. GitHub-secrets — jij
Ga in de repo naar Settings → Secrets and variables → Actions → New repository secret:
- `SUPABASE_URL`: de Project URL
- `SUPABASE_SERVICE_ROLE_KEY`: de secret key

Ga daarna naar Actions → "Spelersdata bijwerken" → Run workflow (vink *force* aan). Die vult de spelers in
Supabase en plant de antwoorden voor de komende 60 dagen. In de log moet staan:
`Supabase: stats=… planned=61 …`.

## 4. Instellingen — Claude Code of jij
- `site.json`: naam, tagline, `url` (je domein met `/` op het eind), `contact`, en `startDate` (de eerste speeldag).
- `supabase/schema.sql`: zet dezelfde datum bij `START_DATE` (2 plekken), en draai het schema opnieuw in Supabase.
- `public/config.js`: `supabaseUrl` en `supabaseAnonKey` (de publishable key).
- `python3 build.py && node scripts/make_images.js`, daarna committen.

## 5. Hosting met eigen domein — jij
1. Koop een domein (bijvoorbeeld via TransIP, Cloudflare of Hostnet).
2. Ga naar Cloudflare → Workers & Pages → Create → Pages → koppel de GitHub-repo.
   - Build command: *(leeg laten)*. De site is al gebouwd in `public/`.
   - Build output directory: `public`
3. Koppel je domein onder Custom domains.
4. Elke push naar `main` (ook de automatische data-updates) zet de site vanzelf live.

## 6. Testen voor de lancering — Claude Code
Zie `tests/README.md`. Alle controles moeten "geslaagd" zijn. Speel daarna zelf een paar dagen mee op je telefoon,
en laat ook iemand met een iPhone en iemand met Android meespelen.

## 7. Advertenties — jij, daarna Claude Code
1. Maak `src/privacy.html` af (alle TODO's) en draai `python3 build.py`.
2. Vraag AdSense aan voor je domein. Plaats de verificatiecode als AdSense daarom vraagt; Claude Code kan helpen.
3. Zet in AdSense onder **Privacy & messaging** de melding voor Europese regelgeving aan (dit is de gecertificeerde
   CMP).
4. Na goedkeuring:
   - zet je `pub-…`-regel in `public/ads.txt`;
   - maak een advertentieblok aan en vul in `public/config.js` in: `client`, `slots.bottom`, `enabled: true`.
5. Controleer dat de toestemmingsmelding verschijnt en dat er pas daarna gepersonaliseerde advertenties komen.

## 8. Na de lancering
- Houd Actions in de gaten. Faalt de data-update, dan staat dat in de log; het spel blijft dan draaien met de
  oude data.
- In de zomerstop verandert de data niet; het spel blijft gewoon werken.
- Bij een nieuw seizoen veranderen de clubs: controleer `COLORS`/`KITS` in `src/app.js` (Claude Code kan dat doen).
