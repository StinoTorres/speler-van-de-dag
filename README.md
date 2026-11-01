# Differentiale NL (werktitel)

**De dagelijkse Eredivisie-puzzel.** Raad elke dag de geheime Eredivisie-speler in zes pogingen. Na elke gok zie je
hoe dichtbij je zit op club, positie, fantasy-prijs, eigendom en punten. Met poules, weekbekers en delen in de
groepsapp.

- **Spelen en bouwen**: zie [`CLAUDE.md`](CLAUDE.md) (ook de instructies voor Claude Code)
- **Plan, verdienmodel en juridische punten**: [`docs/PLAN.md`](docs/PLAN.md)
- **Live zetten**: [`docs/SETUP.md`](docs/SETUP.md)
- **Testen**: [`tests/README.md`](tests/README.md)

```bash
python3 build.py                 # bouw public/index.html
python3 scripts/update_data.py   # nieuwe spelersdata (stand na laatst afgeronde speelronde)
```

Status: eerste opzet (1 november 2026). Het spel werkt, maar is nog niet gekoppeld aan een eigen Supabase-project
en domein. Advertenties staan uit.

Onafhankelijk fanspel; niet gelieerd aan de Eredivisie, ESPN of de clubs.
