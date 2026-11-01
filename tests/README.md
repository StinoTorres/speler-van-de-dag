# Testen

De tests draaien de echte site (`public/`) tegen een lokale Postgres met hetzelfde schema als Supabase.
`tests/fake_supabase.js` speelt PostgREST na: elke `POST /rest/v1/rpc/<functie>` wordt uitgevoerd als rol `anon`,
dus rechtenfouten komen net zo naar boven als in productie.

## Eenmalig

```bash
# Postgres 16 en Playwright (Chromium) moeten beschikbaar zijn
initdb -D /tmp/pg/data && pg_ctl -D /tmp/pg/data -o "-p 5544 -k /tmp/pg" -l /tmp/pg/log start
psql -h /tmp/pg -p 5544 -U postgres -c "create role anon nologin; create role authenticated nologin; create role service_role nologin;"
npm i -D playwright && npx playwright install chromium
```

## Elke keer

```bash
psql -h /tmp/pg -p 5544 -U postgres -c "drop database if exists nl" -c "create database nl"
psql -h /tmp/pg -p 5544 -U postgres -d nl -v ON_ERROR_STOP=1 -f supabase/schema.sql
python3 tests/load_local.py | psql -h /tmp/pg -p 5544 -U postgres -d nl -At   # spelersdata + planning
python3 build.py
PGDATABASE=nl node tests/fake_supabase.js 8790 &
node tests/e2e.js          # print GOED/FOUT per controle, exit 1 bij een fout
```

`tests/e2e.js` controleert onder meer: profiel maken, gok, beide hints, de volgorde tegels → pop-up → score,
puntentelling, deeltekst, poule-klassement, dat er géén openbare ranglijst is, dat beheer- en antwoordfuncties
dicht zijn voor de publieke sleutel, en dat er op 320/375/414 px niet horizontaal gescrold hoeft te worden.
