# Plan: dagelijkse Eredivisie-puzzel voor het publiek

*Eerste opzet, 1 november 2026. Naam: **Speler van de Dag** (staat in `site.json`).*

## 1. Het product

Elke dag één geheime Eredivisie-speler. Je raadt in zes pogingen; na elke gok zie je per kolom of je goed (groen),
dichtbij (geel) of mis zit, met pijlen naar het antwoord. Kolommen: club, positie, fantasy-prijs, eigendom,
seizoenspunten, punten in de laatste speelronde. Twee hints (goals + assists, eerste letter achternaam), opgeven
mogelijk ("kleine speler"). Delen als blokjes in de groepsapp, poules met week- en totaalstand en weekbekers.

**Waarom dit kan werken**
- Dagelijkse puzzels hebben een ingebouwde gewoonte (elke dag terugkomen) en verspreiden zich via delen.
- Er is geen Nederlandstalige Eredivisie-variant met fantasy-cijfers gevonden (zie zoekwerk 1 nov 2026).
- ESPN Fantasy Voetbal heeft ruim 67.000 managers: een kern van fans die prijzen en eigendom kent.
- Poules maken het sociaal: je speelt tegen je vriendengroep, niet tegen een anonieme ranglijst.

**Doelgroep**: Eredivisie-volgers 16+, fantasy-spelers, vriendengroepen en sportkantines.

## 2. Wat er al staat (deze repo)

- Werkend spel (web-app, installeerbaar, telefoon-eerst, dag/nacht), kleuren in de stijl van ESPN Fantasy Voetbal.
- Server in Supabase: antwoord, scores en hints alleen op de server; antwoorden worden willekeurig gepland en staan
  nergens in de code; geen openbare ranglijst, alleen poules.
- Automatische data-update elke 3 uur (alleen na een afgeronde speelronde), houdt Supabase ook wakker.
- Advertentieplek + aan/uit-schakelaar in `public/config.js`; privacy- en over-pagina (concept); `ads.txt`, `robots.txt`.
- End-to-end test (18 controles) en `CLAUDE.md` voor verder bouwen in Claude Code.

## 3. Verdienmodel: advertenties

**Hoe**: Google AdSense (makkelijkste start). Later eventueel een advertentienetwerk dat meer per bezoeker betaalt
zodra er genoeg verkeer is.

**Verplicht in de EU**: wie AdSense-advertenties aan bezoekers in de EER, het VK of Zwitserland toont, moet een door
Google gecertificeerde toestemmingsmelding (CMP) gebruiken die met het IAB TCF werkt. De "Privacy & messaging"-melding die in AdSense
zelf zit, is zo'n gecertificeerde optie. Zet die aan vóór `ads.enabled = true`.

**Let op de opbouw van het spel**: het spel is één pagina. Wisselen tussen Spelen, Klassement en Profiel telt niet
als nieuwe paginaweergave. Reken op ongeveer 1 tot 1,5 paginaweergave per speler per dag. Extra pagina's
(archief, uitleg, statistieken) verhogen dat.

### Schatting opbrengst

Aannames:
- **1,3 paginaweergaven per speler per dag**, 30 dagen per maand.
- **Page RPM** (opbrengst per 1.000 paginaweergaven), drie niveaus:
  - **Voorzichtig: € 1,50.** Één advertentieplek, veel mobiel, veel weigering van cookies.
  - **Midden: € 3.** Een tweede plek of een vaste advertentiebalk onderin, redelijke toestemmingsratio.
  - **Gunstig: € 6.** Goede plaatsing, hoge toestemmingsratio, sportadverteerders. Ter vergelijking: een Nederlands
    voorbeeld kwam rond € 8,80, maar dat was een site met veel content per bezoek.
- **Jaar = 12 maanden × 85%**, omdat de Eredivisie in de zomer stilligt en de data dan niet verandert.

| Scenario | Dagelijkse spelers | Paginaweergaven/maand | Per maand (voorzichtig / midden / gunstig) | Per jaar (midden) |
|---|---:|---:|---|---:|
| Vriendengroepen | 500 | ~20.000 | € 30 / € 60 / € 120 | ~€ 600 |
| Groeiend | 5.000 | ~195.000 | € 290 / € 585 / € 1.170 | ~€ 6.000 |
| Succes | 25.000 | ~975.000 | € 1.460 / € 2.925 / € 5.850 | ~€ 30.000 |
| Hit | 100.000 | ~3,9 mln | € 5.850 / € 11.700 / € 23.400 | ~€ 120.000 |

**Hoe lees je dit?**
- Bedragen zijn vóór belasting en kosten. Advertentie-inkomsten zijn ondernemersinkomen: denk aan inschrijven bij
  de KvK, btw en inkomstenbelasting. Vraag een boekhouder.
- 25.000 dagelijkse spelers is al veel voor een Nederlandstalig niche-spel. Het is ruwweg een derde van het aantal
  ESPN Fantasy Voetbal-managers, en het lukt alleen als het spel ook buiten de fantasy-kern viraal gaat.
- De grootste hefboom is het aantal spelers, niet de RPM. Een tweede advertentieplek of een vaste balk onderin
  verhoogt de RPM, maar te veel advertenties kosten spelers.

**Kosten** (bij benadering): domein ~€ 10–15 per jaar. Hosting is gratis tot ver in het "Groeiend"-scenario
(Cloudflare Pages). Supabase is gratis tot de gratis limieten; daarboven is een betaald plan nodig, reken vanaf het
"Succes"-scenario. De CMP-melding zit in AdSense zelf; een losse CMP kost meestal een maandbedrag.

## 4. Juridische punten (vóór live gaan)

*Dit is geen juridisch advies. Laat de punten met ⚠️ checken.*

1. ⚠️ **Databron.** De spelersdata komt uit de openbare maar ongedocumenteerde JSON van ESPN Fantasy Voetbal. Voor een
   commercieel product is onduidelijk of dat mag; de voorwaarden van ESPN/Disney zijn niet gecontroleerd. Opties:
   - toestemming of licentie vragen aan ESPN of Eredivisie CV;
   - overstappen op een betaalde, gelicentieerde voetbaldata-API. Fantasy-prijs en eigendom vallen dan weg;
     vervang ze door bijvoorbeeld leeftijd, rugnummer, goals, assists en minuten;
   - de huidige bron alleen gebruiken zolang het een niet-commercieel fanproject is.
2. ⚠️ **Merken en beeld.** Gebruik geen clublogo's, geen Eredivisie- of ESPN-logo's en geen spelersfoto's. Clubnamen
   gebruiken om een speler te beschrijven is gangbaar; de disclaimer staat in de footer. Eredivisie CV meldt dat de
   rechten op clubnamen, logo's en beeldrechten bij hen of hun leveranciers liggen.
3. ⚠️ **Kleuren.** Het thema gebruikt de kleuren van ESPN Fantasy Voetbal. Kleuren alleen zijn meestal geen
   probleem, maar met dezelfde kleuren, hetzelfde onderwerp en dezelfde data kan het lijken alsof het een product
   van ESPN of de Eredivisie is. Houd daarom de disclaimer zichtbaar, gebruik geen ESPN- of Eredivisie-namen in je
   merk of domein, en overweeg een eigen accentkleur zodra je commercieel live gaat.
4. ⚠️ **Naam.** "Speler van de Dag" is duidelijk maar algemeen: lastig als merk te beschermen en veel concurrentie
   in zoekresultaten. Check het merkenregister (BOIP) en of de domeinnaam vrij is.
5. **Privacy (AVG).** Er zijn geen accounts, e-mails of echte namen. Wel managernaam, uitslagen en een ID in de
   browser. Maak `src/privacy.html` af (TODO's), kies de EU-regio bij Supabase en regel verwijderverzoeken.
6. **Hosting.** Volgens GitHub is GitHub Pages niet bedoeld als gratis webhosting voor een online bedrijf. Gebruik voor
   de versie met advertenties Cloudflare Pages, Netlify of Vercel met een eigen domein.
7. **Kansspelen.** Er wordt niet om geld gespeeld en er zijn geen prijzen, dus dit valt niet onder de kansspelregels.
   Wil je later prijzen weggeven, check dan eerst de regels voor promotionele kansspelen.

## 5. Groei

- **Delen** is de motor: de blokjes-uitslag met link, poule-uitnodigingen en de weekuitslag zitten er al in.
- **Lancering** rond een speelronde, met een paar fantasy-accounts, podcasts en Discord- of WhatsApp-groepen. Vraag
  clubs en kantines om poules.
- **SEO**: vaste pagina's per seizoen of "Speler van gisteren", met een archief. Dat levert ook paginaweergaven op.
- **Retentie**: reeksen, weekbekers en een herinnering. Pushmeldingen kunnen pas met een geïnstalleerde app en
  extra werk.

## 6. Roadmap

| Fase | Wat | Klaar als |
|---|---|---|
| 0. Opzet (nu) | Werkend spel, server, data-update, documentatie | ✅ deze repo |
| 1. Beta (2–4 weken) | Naam + domein, hosting, eigen Supabase, privacy-tekst, besloten test met ~50 mensen | 50 mensen spelen 2 weken zonder grote bugs |
| 2. Launch | AdSense aanvragen, CMP aan, `ads.txt`, statistieken (privacyvriendelijk, bijv. Plausible), lancering | Advertenties live, eerste € binnen |
| 3. Groei | Archief, uitlegpagina's (SEO), deel-plaatjes, profiel-overzetmelding voor iPhone-app | Dagelijkse spelers en paginaweergaven per speler stijgen |
| 4. Uitbreiden | Tweede competitie (Keuken Kampioen Divisie, FPL-variant), eigen app-store-versie, gelicentieerde data | Meer dan één spel op hetzelfde platform |

## 7. Openstaande beslissingen voor de eigenaar

- [ ] Domein (naam: Speler van de Dag).
- [ ] Databron: huidige bron (risico), licentie aanvragen, of andere API.
- [ ] Eenmanszaak of bv voor de inkomsten.
- [ ] Hoeveel advertenties: één plek (rustig) of twee plekken plus een vaste balk onderin (meer opbrengst).

## Bronnen (geraadpleegd 1 november 2026)

- ESPN Fantasy Voetbal (opzet, budget, gratis spelen): https://eredivisie.com/news/this-is-espn-fantasy-voetbal-the-official-game-of-the-vriendenloterij-eredivisie/
- Aantal ESPN Fantasy Voetbal-managers: veld `total_players` in de openbare spelersdata (~67.700 op 1 nov 2026)
- Google, gecertificeerde CMP verplicht in EER/VK/CH: https://support.google.com/adsense/answer/13554116
- AdSense RPM uitgelegd: https://support.google.com/adsense/answer/190515
- RPM-bandbreedte (indicatief): https://toolslight.com/google-adsense-calculator/
- Nederlands RPM-voorbeeld (50.000 weergaven ≈ € 441): https://www.mijnhostingpartner.nl/blog/tips/hoeveel-zijn-50-000-paginaweergaven-waard-in-google-adsense/
- GitHub Pages en commercieel gebruik: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- Eredivisie, gebruiksvoorwaarden: https://eredivisie.com/terms-of-use/
