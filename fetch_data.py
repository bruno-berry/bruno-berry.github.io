#!/usr/bin/env python3
"""
fetch_data.py — pull running & cycling activities from intervals.icu and bake a
static JSON file the (unlinked) map page reads.

The live site never talks to intervals.icu. You run this locally whenever you
want to refresh the data, then commit the regenerated assets/data/activities.json.

    python fetch_data.py            # refresh (uses the stream cache, fast)
    python fetch_data.py --force    # ignore the cache, refetch every stream
    python fetch_data.py --since 2023-01-01

Credentials live in the CONFIG block below (the key is read-only-ish; intervals.icu
keys only grant access to your own data). Override with env vars or flags if you
prefer not to commit them.
"""

import argparse
import base64
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request

# Windows consoles default to cp1252; force UTF-8 so progress output never crashes.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ── CONFIG ──────────────────────────────────────────────────────────────────
API_KEY      = os.environ.get("INTERVALS_API_KEY", "4f34vc1livto04b4v10z59lbp")
ATHLETE_ID   = os.environ.get("INTERVALS_ATHLETE_ID", "i414013")
MAPTILER_KEY = os.environ.get("MAPTILER_KEY", "hDiwDUe2ifjNNofNRaM3")
BASE         = "https://intervals.icu/api/v1"

# Activity types we treat as "running and cycling".
RUN_TYPES     = {"Run", "TrailRun", "VirtualRun"}
RIDE_TYPES    = {"Ride", "VirtualRide", "GravelRide", "MountainBikeRide"}
VIRTUAL_TYPES = {"VirtualRun", "VirtualRide"}     # indoor — GPS is a fake game course
WANTED        = RUN_TYPES | RIDE_TYPES

HERE        = os.path.dirname(os.path.abspath(__file__))
OUT_DIR     = os.path.join(HERE, "assets", "data")
OUT_FILE    = os.path.join(OUT_DIR, "activities.json")
CACHE_DIR   = os.path.join(OUT_DIR, ".cache")          # raw stream cache (git-ignored)
GEO_CACHE   = os.path.join(CACHE_DIR, "geocode.json")  # reverse-geocode cache

# Downsampling targets (keeps the JSON small + the map snappy).
ROUTE_EPS   = 0.00004      # ~4m simplification tolerance (degrees) for map polylines
ROUTE_MAX   = 400          # hard cap on points per route
SERIES_N    = 150          # samples per per-activity chart series


# ── HTTP ──────────────────────────────────────────────────────────────────--
def _auth_header():
    token = base64.b64encode(f"API_KEY:{API_KEY}".encode()).decode()
    return {
        "Authorization": "Basic " + token,
        "User-Agent": "bruno-berry.github.io/fetch_data.py",
        "Accept": "application/json",
    }


def api_get(path, params=None, retries=4):
    url = BASE + path
    if params:
        from urllib.parse import urlencode
        url += "?" + urlencode(params)
    for attempt in range(retries):
        req = urllib.request.Request(url, headers=_auth_header())
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:                          # rate limited — back off
                wait = 2 ** attempt
                print(f"   429 rate-limited, waiting {wait}s…", file=sys.stderr)
                time.sleep(wait)
                continue
            if e.code in (404, 422):                   # no data for this activity
                return None
            raise
        except (urllib.error.URLError, TimeoutError) as e:
            wait = 1.5 ** attempt
            print(f"   network error ({e}), retrying in {wait:.0f}s…", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"Failed after {retries} attempts: {url}")


# ── geometry helpers ─────────────────────────────────────────────────────────
def _rdp(points, eps):
    """Ramer–Douglas–Peucker line simplification on [lng, lat] points."""
    if len(points) < 3:
        return points
    # find the point with the max perpendicular distance from the chord
    start, end = points[0], points[-1]
    dx, dy = end[0] - start[0], end[1] - start[1]
    denom = (dx * dx + dy * dy) ** 0.5 or 1e-12
    dmax, idx = 0.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        # perpendicular distance from point to the start–end line
        dist = abs(dy * px - dx * py + end[0] * start[1] - end[1] * start[0]) / denom
        if dist > dmax:
            dmax, idx = dist, i
    if dmax > eps:
        left = _rdp(points[: idx + 1], eps)
        right = _rdp(points[idx:], eps)
        return left[:-1] + right
    return [start, end]


def simplify_route(coords):
    """coords: list of [lng, lat]. Simplify + cap, always keeping endpoints."""
    if len(coords) <= 2:
        return coords
    simplified = _rdp(coords, ROUTE_EPS)
    if len(simplified) > ROUTE_MAX:                    # uniform thin as a backstop
        step = len(simplified) / ROUTE_MAX
        thinned = [simplified[int(i * step)] for i in range(ROUTE_MAX)]
        thinned[-1] = simplified[-1]
        simplified = thinned
    return [[round(x, 5), round(y, 5)] for x, y in simplified]


def resample(distance, values, n=SERIES_N):
    """Resample `values` (aligned to cumulative `distance` in m) onto n even bins."""
    if not distance or not values:
        return None
    total = distance[-1]
    if total <= 0:
        return None
    out = []
    j = 0
    for k in range(n):
        target = total * k / (n - 1)
        while j < len(distance) - 1 and distance[j] < target:
            j += 1
        v = values[j]
        out.append(round(v, 2) if isinstance(v, (int, float)) else None)
    return out


# ── stream cache ─────────────────────────────────────────────────────────────
def get_streams(activity_id, want, force=False):
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_path = os.path.join(CACHE_DIR, activity_id + ".json")
    if not force and os.path.exists(cache_path):
        with open(cache_path, "r", encoding="utf-8") as f:
            return json.load(f)
    raw = api_get(f"/activity/{activity_id}/streams", {"types": ",".join(want)})
    streams = {}
    if isinstance(raw, dict):
        raw = raw.get("streams", [])
    for st in raw or []:
        t = st.get("type")
        entry = {"data": st.get("data")}
        if st.get("data2") is not None:
            entry["data2"] = st.get("data2")
        streams[t] = entry
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(streams, f)
    time.sleep(0.15)                                   # be polite to the API
    return streams


# ── reverse geocoding (MapTiler) ──────────────────────────────────────────────
_geo_cache = None


def _load_geo_cache():
    global _geo_cache
    if _geo_cache is None:
        try:
            with open(GEO_CACHE, "r", encoding="utf-8") as f:
                _geo_cache = json.load(f)
        except Exception:
            _geo_cache = {}
    return _geo_cache


def save_geo_cache():
    if _geo_cache is not None:
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(GEO_CACHE, "w", encoding="utf-8") as f:
            json.dump(_geo_cache, f)


def reverse_geocode(lng, lat):
    """Resolve a start coordinate to {region, country}. Cached by ~1km cell."""
    cache = _load_geo_cache()
    key = f"{round(lat, 2)},{round(lng, 2)}"
    if key in cache:
        return cache[key]
    out = {"region": None, "country": None}
    url = (f"https://api.maptiler.com/geocoding/{lng},{lat}.json"
           f"?key={MAPTILER_KEY}&types=region,country")
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "bruno-berry.github.io/fetch_data.py",
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)
        for f in data.get("features") or []:
            ptype = (f.get("place_type") or [None])[0]
            if ptype == "region" and not out["region"]:
                out["region"] = f.get("text")
            if ptype == "country" and not out["country"]:
                out["country"] = f.get("text")
            for c in f.get("context", []):
                cid = str(c.get("id", ""))
                if cid.startswith("region") and not out["region"]:
                    out["region"] = c.get("text")
                if cid.startswith("country") and not out["country"]:
                    out["country"] = c.get("text")
        time.sleep(0.12)
    except Exception as e:
        print(f"   geocode failed for {key}: {e}", file=sys.stderr)
    cache[key] = out
    return out


# ── per-activity processing ───────────────────────────────────────────────────
def num(v):
    return v if isinstance(v, (int, float)) else None


def build_activity(a, streams):
    distance = streams.get("distance", {}).get("data") or []
    latlng = streams.get("latlng", {})
    lats = latlng.get("data") or []
    lngs = latlng.get("data2") or []

    is_virtual = a.get("type") in VIRTUAL_TYPES

    route = []
    bounds = None
    region = country = location = None
    # virtual/indoor rides carry a fake game-world track (e.g. Zwift's Watopia in
    # the South Pacific) — never map them or geocode them.
    if not is_virtual and lats and lngs and len(lats) == len(lngs):
        coords = [[lng, lat] for lat, lng in zip(lats, lngs)
                  if lat is not None and lng is not None]
        if coords:
            route = simplify_route(coords)
            xs = [c[0] for c in route]
            ys = [c[1] for c in route]
            bounds = [[min(xs), min(ys)], [max(xs), max(ys)]]
            geo = reverse_geocode(route[0][0], route[0][1])   # start point
            region, country = geo.get("region"), geo.get("country")
            location = ", ".join([p for p in (region, country) if p]) or None

    if location is None and (is_virtual or a.get("trainer")):
        region, location = "Virtual", "Virtual"

    # per-activity chart series along distance
    series = None
    if distance:
        elev = streams.get("altitude", {}).get("data")
        hr = streams.get("heartrate", {}).get("data")
        spd = streams.get("velocity_smooth", {}).get("data")
        watts = streams.get("watts", {}).get("data")
        dist_km = resample(distance, [d / 1000.0 for d in distance])
        series = {"dist_km": dist_km}
        if elev:
            series["elev_m"] = resample(distance, elev)
        if hr:
            series["hr"] = resample(distance, hr)
        if spd:
            series["speed_ms"] = resample(distance, spd)
        if watts:
            series["watts"] = resample(distance, watts)

    is_run = a.get("type") in RUN_TYPES
    dist_m = num(a.get("distance")) or 0
    moving = num(a.get("moving_time")) or 0
    avg_speed = num(a.get("average_speed"))
    pace = None
    if is_run and dist_m > 0 and moving > 0:
        pace = round(moving / (dist_m / 1000.0))       # seconds per km

    return {
        "id": a.get("id"),
        "name": a.get("name") or a.get("type"),
        "type": a.get("type"),
        "category": "run" if is_run else "ride",
        "start": a.get("start_date_local"),
        "date": (a.get("start_date_local") or "")[:10],
        "distance_m": round(dist_m),
        "moving_s": round(moving),
        "elapsed_s": round(num(a.get("elapsed_time")) or 0),
        "elev_gain_m": round(num(a.get("total_elevation_gain")) or 0),
        "avg_speed_ms": avg_speed,
        "max_speed_ms": num(a.get("max_speed")),
        "pace_s_per_km": pace,
        "avg_hr": num(a.get("average_heartrate")),
        "max_hr": num(a.get("max_heartrate")),
        "avg_watts": num(a.get("icu_average_watts")),
        "np_watts": num(a.get("icu_weighted_avg_watts")),
        "avg_cadence": num(a.get("average_cadence")),
        "calories": num(a.get("calories")),
        "load": num(a.get("icu_training_load")),
        "intensity": num(a.get("icu_intensity")),
        "feel": num(a.get("feel")),
        "rpe": num(a.get("perceived_exertion")) or num(a.get("icu_rpe")),
        "avg_temp": num(a.get("average_temp")),
        "trainer": bool(a.get("trainer")),
        "region": region,
        "country": country,
        "location": location,
        "has_route": bool(route),
        "bounds": bounds,
        "route": route,
        "series": series,
    }


# ── main ──────────────────────────────────────────────────────────────────---
def main():
    parser = argparse.ArgumentParser(description="Fetch intervals.icu data for the map page.")
    parser.add_argument("--since", default="2010-01-01", help="oldest date YYYY-MM-DD")
    parser.add_argument("--until", default=None, help="newest date YYYY-MM-DD (default today)")
    parser.add_argument("--force", action="store_true", help="ignore stream cache")
    args = parser.parse_args()

    until = args.until or dt.date.today().isoformat()
    print(f"Fetching activities {args.since} -> {until} for athlete {ATHLETE_ID} ...")

    acts = api_get(f"/athlete/{ATHLETE_ID}/activities",
                   {"oldest": args.since, "newest": until})
    acts = [a for a in acts if a.get("type") in WANTED]
    print(f"  {len(acts)} running/cycling activities found.")

    want_streams = ["latlng", "distance", "altitude", "heartrate", "velocity_smooth", "watts"]
    out = []
    for i, a in enumerate(acts, 1):
        aid = a.get("id")
        label = f"[{i}/{len(acts)}] {a.get('type'):12} {(a.get('name') or '')[:34]:34}"
        try:
            stream_types = a.get("stream_types") or []
            need = [s for s in want_streams if s in stream_types] or ["distance"]
            streams = get_streams(aid, need, force=args.force) if stream_types else {}
            rec = build_activity(a, streams)
            out.append(rec)
            flag = "[map]" if rec["has_route"] else "     "
            print(f"  {label} {flag} {rec['distance_m']/1000:5.1f} km")
        except Exception as e:                          # one bad activity shouldn't kill the run
            print(f"  {label}  !! skipped ({e})", file=sys.stderr)

    save_geo_cache()
    out.sort(key=lambda r: r["start"] or "", reverse=True)

    payload = {
        "generated": dt.datetime.now().isoformat(timespec="seconds"),
        "athlete": ATHLETE_ID,
        "units": "metric",
        "count": len(out),
        "with_route": sum(1 for r in out if r["has_route"]),
        "activities": out,
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))
    size_kb = os.path.getsize(OUT_FILE) / 1024
    print(f"\nWrote {OUT_FILE}")
    print(f"  {len(out)} activities ({payload['with_route']} with routes), {size_kb:.0f} KB")


if __name__ == "__main__":
    main()
