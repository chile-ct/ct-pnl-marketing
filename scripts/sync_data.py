#!/usr/bin/env python3
"""
Chợ Tốt MKT Dashboard — Weekly data sync
Runs in GitHub Actions every Monday 11am Vietnam time

Sources:
  1. BigQuery  → Revenue, MAU, DAU, Leads, Cohort retention (actual)
  2. Google Sheets → MKT cost (FC & Actual), MTM metrics

Output: public/data.json (read by React dashboard)

Setup (one-time):
  GitHub Secrets required:
    GCP_SA_KEY        - GCP Service Account JSON (with BigQuery Data Viewer + Job User)
    SHEETS_CSV_URL    - FC & Actual cost sheet publish URL (CSV)
    MTM_CSV_URL       - MTM metric sheet publish URL (CSV)
"""

import json, os, csv, io, sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ── Try importing optional deps ─────────────────────────────────────
try:
    from google.cloud import bigquery
    from google.oauth2 import service_account
    HAS_BQ = True
except ImportError:
    HAS_BQ = False
    print("⚠ google-cloud-bigquery not installed — BQ queries skipped")

try:
    import requests
    HAS_REQ = True
except ImportError:
    HAS_REQ = False
    print("⚠ requests not installed — Sheets fetch skipped")

# ── Config ─────────────────────────────────────────────────────────
PROJECT_ID  = "chotot-data-platform"      # ← replace with your GCP project ID
DATASET     = "mkt_reporting"             # ← replace with your BQ dataset
OUTPUT      = Path(__file__).parent.parent / "public" / "data.json"
VERTICALS   = ["PTY", "JOB", "VEH", "GDS"]
VERTS       = ["PTY", "JOB", "VEH", "GDS", "PARENT"]
MONTHS      = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

# End of last Sunday (Vietnam UTC+7)
VN_TZ = timezone(timedelta(hours=7))
now_vn = datetime.now(VN_TZ)
# Last Sunday midnight VN
days_since_sunday = (now_vn.weekday() + 1) % 7
last_sunday = (now_vn - timedelta(days=days_since_sunday)).replace(
    hour=23, minute=59, second=59)
CUTOFF_DATE = last_sunday.strftime("%Y-%m-%d")
YEAR = 2026

print(f"Sync cutoff: {CUTOFF_DATE} (end of last Sunday VN time)")

# ── BigQuery client ─────────────────────────────────────────────────
def get_bq_client():
    sa_key = os.environ.get("GCP_SA_KEY", "")
    if not sa_key:
        raise RuntimeError("GCP_SA_KEY env var not set")
    info = json.loads(sa_key)
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/bigquery"])
    return bigquery.Client(project=PROJECT_ID, credentials=creds)

# ── BQ Query helpers ─────────────────────────────────────────────────
def run_query(client, sql: str) -> list[dict]:
    job = client.query(sql)
    return [dict(r) for r in job.result()]

# ─────────────────────────────────────────────────────────────────────
# QUERY 1: Monthly Revenue per vertical (Jan–current month)
# ─────────────────────────────────────────────────────────────────────
REVENUE_SQL = f"""
-- ⚠️ Replace table names with your actual BQ tables
SELECT
  vertical_id                          AS vertical,
  FORMAT_DATE('%b', DATE_TRUNC(date, MONTH)) AS month,
  EXTRACT(MONTH FROM date) - 1         AS month_idx,
  SUM(revenue_vnd) / 1e9               AS revenue_b
FROM `{PROJECT_ID}.{DATASET}.seller_revenue`
WHERE
  EXTRACT(YEAR FROM date) = {YEAR}
  AND date <= '{CUTOFF_DATE}'
GROUP BY 1, 2, 3
ORDER BY 3, 1
"""

# ─────────────────────────────────────────────────────────────────────
# QUERY 2: Monthly MAU, DAU, Leads per vertical
# ─────────────────────────────────────────────────────────────────────
KPI_SQL = f"""
SELECT
  vertical_id                          AS vertical,
  EXTRACT(MONTH FROM month_date) - 1  AS month_idx,
  FORMAT_DATE('%b', month_date)        AS month,
  mau,
  avg_dau                              AS dau,
  total_leads                          AS lead
FROM `{PROJECT_ID}.{DATASET}.vertical_monthly_kpi`
WHERE
  EXTRACT(YEAR FROM month_date) = {YEAR}
  AND month_date <= DATE_TRUNC('{CUTOFF_DATE}', MONTH)
ORDER BY 2, 1
"""

# ─────────────────────────────────────────────────────────────────────
# QUERY 3: Cohort retention M0→M6 per vertical
# ─────────────────────────────────────────────────────────────────────
COHORT_SQL = f"""
SELECT
  vertical_id                                  AS vertical,
  FORMAT_DATE('%b', cohort_month)              AS cohort,
  cohort_size                                  AS M0a,
  ROUND(ret_m1 * 100, 1)                       AS M1,
  ROUND(ret_m1 * cohort_size)                  AS M1a,
  ROUND(ret_m2 * 100, 1)                       AS M2,
  ROUND(ret_m2 * cohort_size)                  AS M2a,
  ROUND(ret_m3 * 100, 1)                       AS M3,
  ROUND(ret_m3 * cohort_size)                  AS M3a,
  ROUND(ret_m4 * 100, 1)                       AS M4,
  ROUND(ret_m4 * cohort_size)                  AS M4a,
  ROUND(ret_m5 * 100, 1)                       AS M5,
  ROUND(ret_m5 * cohort_size)                  AS M5a,
  ROUND(ret_m6 * 100, 1)                       AS M6,
  ROUND(ret_m6 * cohort_size)                  AS M6a
FROM `{PROJECT_ID}.{DATASET}.user_cohort_retention`
WHERE
  EXTRACT(YEAR FROM cohort_month) = {YEAR}
ORDER BY cohort_month, vertical_id
"""

# ─────────────────────────────────────────────────────────────────────
# QUERY 4: Growth + SEO channel metrics
# ─────────────────────────────────────────────────────────────────────
CHANNEL_SQL = f"""
SELECT
  vertical_id        AS vertical,
  channel            AS team,   -- 'Growth' | 'SEO' | 'Brand'
  EXTRACT(MONTH FROM month_date) - 1 AS month_idx,
  SUM(dau)           AS dau,
  SUM(dwl)           AS dwl,
  SUM(leads)         AS lead
FROM `{PROJECT_ID}.{DATASET}.channel_monthly_metrics`
WHERE
  EXTRACT(YEAR FROM month_date) = {YEAR}
  AND month_date <= DATE_TRUNC('{CUTOFF_DATE}', MONTH)
GROUP BY 1, 2, 3
ORDER BY 3, 1, 2
"""

# ─────────────────────────────────────────────────────────────────────
# Google Sheets CSV fetch
# ─────────────────────────────────────────────────────────────────────
def fetch_csv(url: str, label: str) -> list[list[str]]:
    if not HAS_REQ or not url:
        print(f"⚠ Skipping {label} — requests not available or URL empty")
        return []
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        if r.text.strip().startswith("<!"):
            print(f"⚠ {label}: got HTML (not CSV) — check sheet publish URL")
            return []
        rows = list(csv.reader(io.StringIO(r.text)))
        print(f"✓ {label}: {len(rows)} rows")
        return rows
    except Exception as e:
        print(f"⚠ {label} fetch failed: {e}")
        return []

def pn(v):
    if not v: return 0.0
    try: return float(str(v).replace(",","").replace("%","").strip())
    except: return 0.0

def parse_fc_cost(rows: list[list[str]]) -> dict:
    """Parse FC & Actual cost sheet into spend per vertical per month."""
    _VERTS = set(VERTS)
    spend = {v: [0.0]*12 for v in VERTS}
    if not rows: return spend
    # Find month columns (header row has Jan/Feb/... or actual/forecast labels)
    hdr = rows[0]
    col_jan = None
    for j, c in enumerate(hdr):
        if str(c).strip().lower().startswith("jan"):
            col_jan = j; break
    if col_jan is None:
        print("⚠ Could not find Jan column in FC sheet")
        return spend
    for row in rows[1:]:
        if len(row) < col_jan + 12: continue
        vert = str(row[0]).strip().upper()
        if vert not in _VERTS: continue
        for mi in range(12):
            v = pn(row[col_jan + mi])
            m = v / 1_000_000 if v > 100_000 else v
            spend[vert][mi] += m
    return spend

def parse_mtm(rows: list[list[str]]) -> dict:
    """Parse MTM metric sheet into revenue/MAU/DAU/lead per vertical per month."""
    result = {}
    if not rows: return result
    hdr = rows[0]
    col_jan = None
    for j, c in enumerate(hdr):
        if str(c).strip().lower().startswith("jan"):
            col_jan = j; break
    if col_jan is None: return result
    for row in rows[1:]:
        if len(row) < 4: continue
        vert   = str(row[0]).strip().upper()
        metric = str(row[1]).strip()
        vals   = [pn(row[col_jan+i]) if col_jan+i < len(row) else 0.0 for i in range(12)]
        if vert and metric:
            if vert not in result: result[vert] = {}
            result[vert][metric] = vals
    return result

# ─────────────────────────────────────────────────────────────────────
# Build output JSON
# ─────────────────────────────────────────────────────────────────────
def build_output(bq_rev=None, bq_kpi=None, bq_cohort=None, bq_channel=None,
                 fc_spend=None, mtm=None) -> dict:
    data = {
        "timestamp": datetime.now(VN_TZ).isoformat(),
        "cutoff":    CUTOFF_DATE,
        "spend":     {},
        "MTM":       {},
        "OG": {v:{"DAU":[],"DwL":[],"Lead":[]} for v in VERTS},
        "OS": {v:{"DAU":[],"DwL":[],"Lead":[]} for v in VERTS},
        "OB": {v:{"fol":[],"int":[],"reach":[],"bclk":[]} for v in VERTS},
        "OA": {"inst":[],"act":[]},
        "COHORT": {v:[] for v in VERTS},
    }

    # Spend from Sheets (or BQ if available)
    if fc_spend:
        data["spend"] = fc_spend

    # Revenue from BQ
    rev = {v:[0.0]*12 for v in VERTS}
    if bq_rev:
        for row in bq_rev:
            v = row["vertical"].upper()
            mi = int(row["month_idx"])
            if v in rev and 0 <= mi < 12:
                rev[v][mi] = float(row.get("revenue_b", 0))
    elif mtm:
        for v in VERTS:
            r = mtm.get(v, {}).get("Revenue", [])
            if r: rev[v] = [(x/1e9 if x > 1e6 else x) for x in r[:12]]

    # Build MTM data per vertical
    for v in VERTS:
        rev_arr = rev[v]
        data["MTM"][v] = {
            "Revenue": [int(x*1e9) for x in rev_arr],  # raw VND
            "MAU":     [0]*12,
            "DAU":     [0]*12,
            "Lead":    [0]*12,
        }
    # All-vertical MTM
    data["MTM"]["ALL"] = {
        "Revenue": [int(sum(rev[v][i]*1e9 for v in VERTS)) for i in range(12)],
        "MAU":     [0]*12, "DAU": [0]*12, "Lead": [0]*12,
    }

    # KPIs from BQ
    if bq_kpi:
        for row in bq_kpi:
            v  = row["vertical"].upper()
            mi = int(row["month_idx"])
            if v in VERTS and 0 <= mi < 12:
                data["MTM"][v]["MAU"][mi]  = int(row.get("mau",  0))
                data["MTM"][v]["DAU"][mi]  = int(row.get("dau",  0))
                data["MTM"][v]["Lead"][mi] = int(row.get("lead", 0))
    elif mtm:
        for v in VERTS:
            for field, key in [("MAU","MAU"),("DAU","DAUs"),("Lead","Total lead volume")]:
                vals = mtm.get(v,{}).get(key,[])
                if vals: data["MTM"][v][field] = [int(x) for x in vals[:12]]

    # Recompute ALL MAU/DAU/Lead
    for mi in range(12):
        data["MTM"]["ALL"]["MAU"][mi]  = sum(data["MTM"][v]["MAU"][mi]  for v in VERTS)
        data["MTM"]["ALL"]["DAU"][mi]  = sum(data["MTM"][v]["DAU"][mi]  for v in VERTS)
        data["MTM"]["ALL"]["Lead"][mi] = sum(data["MTM"][v]["Lead"][mi] for v in VERTS)

    # Channel metrics from BQ
    if bq_channel:
        for row in bq_channel:
            v    = row["vertical"].upper()
            team = row["team"]
            mi   = int(row["month_idx"])
            if v not in VERTS or mi < 0 or mi >= 12: continue
            if team == "Growth" and v in data["OG"]:
                data["OG"][v]["DAU"].append(int(row.get("dau",0)))
                data["OG"][v]["DwL"].append(int(row.get("dwl",0)))
                data["OG"][v]["Lead"].append(int(row.get("lead",0)))
            elif team == "SEO" and v in data["OS"]:
                data["OS"][v]["DAU"].append(int(row.get("dau",0)))
                data["OS"][v]["DwL"].append(int(row.get("dwl",0)))
                data["OS"][v]["Lead"].append(int(row.get("lead",0)))

    # Cohort from BQ
    if bq_cohort:
        cohort_by_vert = {v:[] for v in VERTS}
        for row in bq_cohort:
            v = row["vertical"].upper()
            if v not in VERTS: continue
            cohort_by_vert[v].append({
                "c":   row["cohort"],
                "M0":  100,
                "M0a": int(row.get("M0a",0)),
                "M1":  row.get("M1"), "M1a": row.get("M1a"),
                "M2":  row.get("M2"), "M2a": row.get("M2a"),
                "M3":  row.get("M3"), "M3a": row.get("M3a"),
                "M4":  row.get("M4"), "M4a": row.get("M4a"),
                "M5":  row.get("M5"), "M5a": row.get("M5a"),
                "M6":  row.get("M6"), "M6a": row.get("M6a"),
            })
        data["COHORT"] = cohort_by_vert

    return data

# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────
def main():
    bq_rev = bq_kpi = bq_cohort = bq_channel = None
    fc_spend = None
    mtm = None

    # 1. BigQuery
    if HAS_BQ and os.environ.get("GCP_SA_KEY"):
        try:
            client = get_bq_client()
            print("✓ BQ client connected")
            bq_rev     = run_query(client, REVENUE_SQL);    print(f"  Revenue: {len(bq_rev)} rows")
            bq_kpi     = run_query(client, KPI_SQL);        print(f"  KPI: {len(bq_kpi)} rows")
            bq_cohort  = run_query(client, COHORT_SQL);     print(f"  Cohort: {len(bq_cohort)} rows")
            bq_channel = run_query(client, CHANNEL_SQL);    print(f"  Channel: {len(bq_channel)} rows")
        except Exception as e:
            print(f"⚠ BQ error: {e}\n  → Falling back to Sheets data")
    else:
        print("ℹ BQ skipped (no GCP_SA_KEY or library)")

    # 2. Google Sheets
    sheets_url = os.environ.get("SHEETS_CSV_URL","")
    mtm_url    = os.environ.get("MTM_CSV_URL","")
    if sheets_url:
        fc_rows  = fetch_csv(sheets_url, "FC & Actual cost")
        fc_spend = parse_fc_cost(fc_rows)
    if mtm_url:
        mtm_rows = fetch_csv(mtm_url, "MTM metric")
        mtm      = parse_mtm(mtm_rows)

    # 3. Build output
    out = build_output(bq_rev, bq_kpi, bq_cohort, bq_channel, fc_spend, mtm)

    # 4. Write
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w") as f:
        json.dump(out, f, indent=2, default=str)
    print(f"✅ Written {OUTPUT.stat().st_size:,} bytes → {OUTPUT}")

if __name__ == "__main__":
    main()
