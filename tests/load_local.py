#!/usr/bin/env python3
"""Print SQL die public/data/players.json in de lokale testdatabase laadt (zelfde als de GitHub Action doet)."""
import json, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
d = json.load(open(os.path.join(ROOT, "public", "data", "players.json")))
rows = [[p[0], p[1], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10]] for p in d["players"]]
print("select dn_admin_load($j$" + json.dumps(rows) + "$j$::jsonb, '{\"round\":%d}'::jsonb);" % d["gw"])
