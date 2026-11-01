#!/usr/bin/env python3
"""Haalt de Eredivisie-spelersdata op en zet die klaar voor het spel.

Bron: de openbare JSON van ESPN Fantasy Voetbal (zelfde opbouw als de FPL-API).
Let op: dit is een ongedocumenteerde bron. Zie docs/PLAN.md (Data en rechten) voordat je
commercieel live gaat.

- schrijft public/data/players.json (zoeklijst en oefenronde in de browser)
- stuurt dezelfde gegevens naar Supabase (dn_admin_load), waar het echte spel mee rekent
- het spel rekent altijd met de stand na de laatst AFGERONDE speelronde (finished + data_checked);
  punten, goals en assists van een lopende speelronde worden eraf gehaald

Gebruik:
  python3 scripts/update_data.py                 # normaal (GitHub Action)
  FORCE=1 python3 scripts/update_data.py         # ook bijwerken als de speelronde niet veranderd is
  python3 scripts/update_data.py --from-raw raw  # offline: gebruik raw/bootstrap.json en raw/live<N>.json

Omgevingsvariabelen voor Supabase: SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY (alleen als GitHub-secret).
"""
import json, os, sys, time, urllib.request
from datetime import datetime, timezone

API = os.environ.get("DATA_API", "https://fantasy.espngoal.nl/api").rstrip("/")
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
UA = {"User-Agent": "Mozilla/5.0 (dagelijkse puzzel; data-updater)"}
RAW = None  # map met lokale JSON-bestanden (--from-raw)


def get(path):
    if RAW:
        name = "bootstrap.json" if path.startswith("/bootstrap-static") else "live%s.json" % path.split("/")[2]
        return json.load(open(os.path.join(RAW, name)))
    for attempt in range(4):
        try:
            req = urllib.request.Request(API + path, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception:
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))


def write(name, obj):
    path = os.path.join(ROOT, "public", "data", name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    new = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    old = open(path).read() if os.path.exists(path) else None
    if old is not None:
        a, b = json.loads(old), json.loads(new)
        a.pop("updated", None); b.pop("updated", None)
        if a == b:
            print(name, "ongewijzigd"); return
    open(path, "w").write(new); print(name, "bijgewerkt")


def supabase_rpc(fn, payload):
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        print("Geen SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY: Supabase overgeslagen"); return None
    headers = {"Content-Type": "application/json", "apikey": key}
    if key.startswith("eyJ"):  # oude service_role-JWT; de nieuwe sb_secret_-sleutel alleen als apikey
        headers["Authorization"] = "Bearer " + key
    req = urllib.request.Request(f"{url}/rest/v1/rpc/{fn}", data=json.dumps(payload).encode(), method="POST", headers=headers)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def live(gw):
    """Statistieken per element in speelronde gw."""
    return {el["id"]: el["stats"] for el in get(f"/event/{gw}/live/")["elements"]}


def main():
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M")
    # Supabase wakker houden: een gratis project wordt na een week zonder verkeer gepauzeerd
    if not RAW:
        try:
            if supabase_rpc("dn_ping", {}) is not None:
                print("Supabase ping ok")
        except Exception as e:
            print("Supabase ping mislukt:", e)

    boot = get("/bootstrap-static/")
    events = boot["events"]
    done = [e for e in events if e.get("finished") and e.get("data_checked")]
    if not done:
        print("Nog geen afgeronde speelronde"); return
    lgw = max(e["id"] for e in done)
    old_path = os.path.join(ROOT, "public", "data", "players.json")
    old_gw = json.load(open(old_path)).get("gw", 0) if os.path.exists(old_path) else 0
    force = RAW or os.environ.get("FORCE", "") in ("1", "true", "yes")
    if lgw <= old_gw and not force:
        print(f"Laatst afgeronde speelronde is {lgw}, data staat al op {old_gw}: niets te doen"); return
    print(f"Bijwerken naar de stand na speelronde {lgw} (was {old_gw})")

    cur = next((e for e in events if e.get("is_current")), None)
    last = live(lgw)
    later = {}  # alles uit speelrondes na lgw die al lopen
    if cur and cur["id"] > lgw:
        for g in range(lgw + 1, cur["id"] + 1):
            for k, st in live(g).items():
                acc = later.setdefault(k, {"total_points": 0, "goals_scored": 0, "assists": 0, "clean_sheets": 0, "minutes": 0})
                for f in acc:
                    acc[f] += st.get(f, 0)
        print(f"Speelronde {lgw + 1}-{cur['id']} (nog bezig) afgetrokken")

    def minus(e, field):
        return e[field] - later.get(e["id"], {}).get(field, 0)

    keep = [e for e in boot["elements"] if not e.get("removed")]
    players = [[e["code"], e["web_name"], (e["first_name"] + " " + e["second_name"]).strip(), e["team"], e["element_type"],
                e["now_cost"], float(e["selected_by_percent"]), minus(e, "total_points"),
                last.get(e["id"], {}).get("total_points", 0),
                minus(e, "goals_scored"), minus(e, "assists"), minus(e, "clean_sheets"), minus(e, "minutes"),
                e.get("squad_number")] for e in keep]
    nxt = next((e for e in events if e["id"] == lgw + 1), None)
    write("players.json", {
        "gw": lgw,
        "next": {"gw": nxt["id"], "deadline": nxt["deadline_time"]} if nxt else None,
        "updated": stamp,
        "teams": [[t["id"], t["short_name"], t["name"]] for t in boot["teams"]],
        "players": players,
    })
    if RAW:
        return
    # code, web, team, pos, price, own, pts, gw, goals, assists
    rows = [[p[0], p[1], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10]] for p in players]
    res = supabase_rpc("dn_admin_load", {"p_rows": rows, "p_meta": {"round": lgw, "updated": stamp}})
    if res is not None:
        print("Supabase:", res)


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--from-raw":
        RAW = sys.argv[2]
    main()
