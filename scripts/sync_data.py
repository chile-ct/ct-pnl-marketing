#!/usr/bin/env python3
"""
Chợ Tốt MKT Dashboard — Daily data sync
Sources:
  1. BigQuery (chotot-dwh)  → MAU, DAU, Leads, App Growth, Cohort
  2. Google Sheets (public CSV) → Revenue, Budget/Spend

Output: public/data.json
Secrets needed: GCP_SA_KEY (BigQuery service account JSON)
Sheet must be "Anyone with link can view" for direct CSV fetch.
"""
import json, os, csv, io
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from google.cloud import bigquery
    from google.oauth2 import service_account
    HAS_BQ = True
except ImportError:
    HAS_BQ = False
    print("⚠ google-cloud-bigquery not installed")

try:
    import requests
    HAS_REQ = True
except ImportError:
    HAS_REQ = False

# ── Config ────────────────────────────────────────────────────────────
BQ_PROJECT = "chotot-dwh"
OUTPUT     = Path(__file__).parent.parent / "public" / "data.json"
VN_TZ      = timezone(timedelta(hours=7))
YEAR       = datetime.now(VN_TZ).year
MONTHS     = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

# Google Sheets (must be "Anyone with link can view")
SHEET_FC_ID  = "1D-2eQcfDMzy42wHUF4bpwCY4cWtrJNvp-kdv9R_iFUI"
SHEET_FC_GID = "2034915922"
SHEET_MTM_ID  = "1VkmHBo_1RtzCyo24yhoJbYmZqrgjSl9KGY3w9XWDUqQ"
SHEET_MTM_TAB = "Data for Claude"

def sheet_csv_url(sheet_id, gid=None, tab=None):
    base = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
    if gid:  return base + f"&gid={gid}"
    if tab:  return base + f"&sheet={requests.utils.quote(tab)}"
    return base

# ── BigQuery ──────────────────────────────────────────────────────────
def get_bq_client():
    sa_json = os.environ.get("GCP_SA_KEY","")
    if not sa_json: raise RuntimeError("GCP_SA_KEY not set")
    info  = json.loads(sa_json)
    creds = service_account.Credentials.from_service_account_info(
        info, scopes=["https://www.googleapis.com/auth/bigquery"])
    return bigquery.Client(project=BQ_PROJECT, credentials=creds)

def run_query(client, sql):
    return [dict(r) for r in client.query(sql).result()]

# ── BQ Queries (verified tables) ─────────────────────────────────────

# Vertical MAU/DAU/Lead — use last day of each month for complete monthly data
MAU_SQL = f"""
SELECT
  LOWER(vertical) AS vertical,
  EXTRACT(MONTH FROM date) - 1 AS mi,
  SUM(mau) AS mau,
  SUM(dau) AS dau,
  COALESCE(SUM(lead_mth), 0) AS lead
FROM `chotot-dwh.ct_digital.mtm_chotot_vertical_dau_mau`
WHERE EXTRACT(YEAR FROM date) = {YEAR}
  AND DATE_TRUNC(date, MONTH) = date   -- first-of-month snapshot
  AND platform IS NOT NULL
  AND vertical IN ('pty', 'job', 'veh', 'gds', 'Chotot')
GROUP BY 1, 2
ORDER BY 2, 1
"""

# App MAU + New App MAU — Android + iOS only, from non-channel table (no duplication)
APP_MAU_SQL = f"""
SELECT
  EXTRACT(MONTH FROM date) - 1 AS mi,
  SUM(mau) AS app_mau,
  SUM(new_dau) AS new_app_mau_day1   -- new users on first day; monthly total via channel table
FROM `chotot-dwh.ct_digital.mtm_chotot_vertical_dau_mau`
WHERE EXTRACT(YEAR FROM date) = {YEAR}
  AND DATE_TRUNC(date, MONTH) = date
  AND vertical = 'Chotot'
  AND platform IN ('Android', 'iOS')
GROUP BY 1 ORDER BY 1
"""

# New App MAU monthly total — sum new_dau across all days in month (app only)
NEW_APP_MAU_SQL = f"""
SELECT
  EXTRACT(MONTH FROM date) - 1 AS mi,
  SUM(new_dau) AS new_app_mau
FROM `chotot-dwh.ct_digital.mtm_chotot_vertical_channel_dau_mau`
WHERE EXTRACT(YEAR FROM date) = {YEAR}
  AND vertical = 'Chotot'
  AND platform IN ('Android', 'iOS')
GROUP BY 1 ORDER BY 1
"""

# Cohort retention by vertical — MKT-attributed new users
COHORT_SQL = f"""
SELECT
  vertical_user                        AS vertical,
  FORMAT_DATE('%b', DATE_TRUNC(visit_date, MONTH)) AS cohort,
  EXTRACT(MONTH FROM visit_date) - 1   AS mi,
  COUNT(*)                             AS M0a,
  ROUND(COUNTIF(m1 > 0) * 100.0 / COUNT(*), 1) AS M1,
  COUNTIF(m1 > 0)                      AS M1a,
  ROUND(COUNTIF(m2 > 0) * 100.0 / COUNT(*), 1) AS M2,
  COUNTIF(m2 > 0)                      AS M2a,
  ROUND(COUNTIF(m3 > 0) * 100.0 / COUNT(*), 1) AS M3,
  COUNTIF(m3 > 0)                      AS M3a
FROM `chotot-dwh.ct_digital.dashboard__retention_mapping_activation_by_source_campaign`
WHERE return_status = 'new'
  AND EXTRACT(YEAR FROM visit_date) = {YEAR}
  AND vertical_user IN ('pty', 'job', 'veh', 'gds', 'all')
GROUP BY 1, 2, 3
ORDER BY 3, 1
"""

# ── Google Sheets fetch ───────────────────────────────────────────────
def fetch_csv(url, label):
    if not HAS_REQ: return []
    try:
        r = requests.get(url, timeout=30, allow_redirects=True)
        r.raise_for_status()
        if r.text.strip().startswith("<"):
            print(f"⚠ {label}: got HTML — sheet may not be public")
            return []
        rows = list(csv.reader(io.StringIO(r.text)))
        print(f"✓ {label}: {len(rows)} rows")
        return rows
    except Exception as e:
        print(f"⚠ {label}: {e}")
        return []

def pn(v):
    try: return float(str(v).replace(",","").replace("%","").replace("₫","").strip() or "0")
    except: return 0.0

def parse_fc_sheet(rows):
    """FC & Actual cost sheet → spend[vert][month_idx] in B VND."""
    spend = {v: [0.0]*12 for v in ["PTY","JOB","VEH","GDS","PARENT"]}
    if not rows: return spend
    # Find month header row (first row with "Jan" somewhere)
    hdr_idx, col_jan = 0, None
    for ri, row in enumerate(rows[:5]):
        for ci, c in enumerate(row):
            if str(c).strip().lower().startswith("jan"):
                hdr_idx, col_jan = ri, ci
                break
        if col_jan is not None: break
    if col_jan is None:
        print("⚠ FC sheet: can't find Jan column")
        return spend
    VERT_MAP = {"PTY":"PTY","JOB":"JOB","VEH":"VEH","GDS":"GDS","PARENT":"PARENT",
                "NHÀ TỐT":"PTY","VIỆC LÀM":"JOB","XE":"VEH","HÀNG":"GDS"}
    for row in rows[hdr_idx+1:]:
        if len(row) <= col_jan: continue
        vert_raw = str(row[0]).strip().upper()
        vert = VERT_MAP.get(vert_raw)
        if not vert: continue
        for mi in range(12):
            ci = col_jan + mi
            if ci >= len(row): break
            v = pn(row[ci])
            # Convert VND → B VND if needed
            m = v / 1e9 if v > 1e6 else v
            spend[vert][mi] += m
    return spend

def parse_mtm_sheet(rows):
    """Data for Claude sheet (useSheetData.ts format) → revenue, leads, etc."""
    # Header row 0 = labels, row 1+ = data
    # Columns: label, Jan, Feb, ..., Dec, (then other metrics at col 20+)
    result = {"rev":{}, "lead":{}, "mau":{}, "dau":{}}
    if len(rows) < 2: return result
    VERT_MAP = {
        "PTY":{"PTY","NHÀ TỐT","PROPERTY"},
        "JOB":{"JOB","VIỆC LÀM","JOBS"},
        "VEH":{"VEH","XE","VEHICLE"},
        "GDS":{"GDS","HÀNG"},
    }
    def detect_vert(lbl):
        u = str(lbl).upper()
        for v, aliases in VERT_MAP.items():
            if any(a in u for a in aliases) or u.startswith(v):
                return v
        return None
    def detect_metric(lbl):
        l = str(lbl).lower()
        if "revenue" in l or "doanh thu" in l: return "rev"
        if "lead" in l: return "lead"
        if "mau" in l: return "mau"
        if "dau" in l and "dws" not in l and "dwl" not in l: return "dau"
        return None
    for row in rows[1:]:
        lbl = str(row[0]).strip() if row else ""
        if not lbl: continue
        vert   = detect_vert(lbl)
        metric = detect_metric(lbl)
        if not vert or not metric: continue
        vals = [pn(row[j]) if j < len(row) else 0.0 for j in range(1, 13)]
        if vert not in result[metric]:
            result[metric][vert] = vals
        else:
            result[metric][vert] = [result[metric][vert][i] + vals[i] for i in range(12)]
    return result

# ── Hardcoded fallback (verified from app-growth.html + current Dashboard.tsx) ─
FALLBACK = {
    "revenue": {   # B VND actual Jan-May 2026
        "PTY": [9.553,6.160,15.440,10.551,10.679,0,0,0,0,0,0,0],
        "JOB": [4.204,4.187,7.843,6.852,7.613,0,0,0,0,0,0,0],
        "VEH": [4.805,3.705,5.024,3.922,3.868,0,0,0,0,0,0,0],
        "GDS": [4.153,3.475,4.679,3.839,3.788,0,0,0,0,0,0,0],
    },
    "spend": {     # B VND FC1 budget Jan-Dec 2026
        "PTY":    [0.410,0.307,0.671,0.723,0.832,0.875,1.644,1.914,2.194,3.984,2.404,2.109],
        "JOB":    [0.178,0.736,0.969,0.611,0.692,0.871,0.943,1.143,0.933,1.883,1.383,0.763],
        "VEH":    [0.014,0.032,0.212,0.256,0.225,0.336,0.436,0.476,0.526,0.481,0.471,0.396],
        "GDS":    [0.073,0.059,0.188,0.162,0.162,0.306,0.351,0.386,0.386,0.304,0.304,0.264],
        "PARENT": [0.634,0.462,0.325,0.343,0.342,0.521,0.521,0.921,0.921,0.621,0.571,0.571],
    },
    "vmau": {    # thousands — vertical MAU
        "PTY": [1377,850,1855,1566,1566,0,0,0,0,0,0,0],
        "JOB": [816,746,995,756,880,0,0,0,0,0,0,0],
        "VEH": [1490,1463,1905,1839,1918,0,0,0,0,0,0,0],
        "GDS": [1914,1733,2518,2277,2350,0,0,0,0,0,0,0],
    },
    "leads": {   # thousands
        "PTY": [1249,946,2414,1580,1656,0,0,0,0,0,0,0],
        "JOB": [1265,1081,1752,1103,1349,0,0,0,0,0,0,0],
        "VEH": [811,726,1117,1085,1134,0,0,0,0,0,0,0],
        "GDS": [1847,1736,2302,2144,2428,0,0,0,0,0,0,0],
    },
    # App growth — from app-growth.html (verified BQ)
    "app_mau":     [1394597,1296533,1551037,1472750,1489715,0,0,0,0,0,0,0],
    "new_app_mau": [261241,234333,344562,293506,295688,0,0,0,0,0,0,0],
    "nurr_d1": [36.1,36.1,37.9,37.1,36.1,0,0,0,0,0,0,0],
    "nurr_d7": [14.5,14.8,15.7,14.9,11.7,0,0,0,0,0,0,0],
    "nurr_m1": [6.8,7.0,7.3,7.0,None,None,None,None,None,None,None,None],
    # Cohort retention (MKT-attributed) — from BQ
    "cohort": {
        "PTY": [
            {"c":"Jan","M0a":10320,"M1":55.4,"M1a":5718,"M2":51.6,"M2a":5330,"M3":43.3,"M3a":4471},
            {"c":"Feb","M0a":8760, "M1":58.7,"M1a":5143,"M2":49.1,"M2a":4298,"M3":None,"M3a":None},
            {"c":"Mar","M0a":12636,"M1":55.4,"M1a":7002,"M2":None,"M2a":None,"M3":None,"M3a":None},
            {"c":"Apr","M0a":11590,"M1":None,"M1a":None,"M2":None,"M2a":None,"M3":None,"M3a":None},
            {"c":"May","M0a":13053,"M1":None,"M1a":None,"M2":None,"M2a":None,"M3":None,"M3a":None},
        ],
        "JOB": [
            {"c":"Jan","M0a":5836,"M1":52.0,"M1a":3035,"M2":45.2,"M2a":2638,"M3":38.9,"M3a":2270},
            {"c":"Feb","M0a":5040,"M1":55.1,"M1a":2777,"M2":44.8,"M2a":2258,"M3":None,"M3a":None},
            {"c":"Mar","M0a":7234,"M1":51.8,"M1a":3747,"M2":None,"M2a":None,"M3":None,"M3a":None},
            {"c":"Apr","M0a":6398,"M1":None,"M1a":None,"M2":None,"M2a":None,"M3":None,"M3a":None},
            {"c":"May","M0a":8125,"M1":None,"M1a":None,"M2":None,"M2a":None,"M3":None,"M3a":None},
        ],
        "VEH": [
            {"c":"Jan","M0a":9826,"M1":64.1,"M1a":6298,"M2":59.2,"M2a":5817,"M3":49.8,"M3a":4893},
            {"c":"Feb","M0a":8532,"M1":66.3,"M1a":5656,"M2":57.8,"M2a":4932,"M3":None,"M3a":None},
            {"c":"Mar","M0a":12041,"M1":63.7,"M1a":7670,"M2":None,"M2a":None,"M3":None,"M3a":None},
            {"c":"Apr","M0a":10856,"M1":None,"M1a":None,"M2":None,"M2a":None,"M3":None,"M3a":None},
            {"c":"May","M0a":11907,"M1":None,"M1a":None,"M2":None,"M2a":None,"M3":None,"M3a":None},
        ],
        "GDS": [
            {"c":"Jan","M0a":14582,"M1":54.1,"M1a":7889,"M2":47.6,"M2a":6941,"M3":40.2,"M3a":5862},
            {"c":"Feb","M0a":12853,"M1":56.8,"M1a":7300,"M2":48.3,"M2a":6208,"M3":None,"M3a":None},
            {"c":"Mar","M0a":17834,"M1":54.2,"M1a":9666,"M2":None,"M2a":None,"M3":None,"M3a":None},
            {"c":"Apr","M0a":16121,"M1":None,"M1a":None,"M2":None,"M2a":None,"M3":None,"M3a":None},
            {"c":"May","M0a":18013,"M1":None,"M1a":None,"M2":None,"M2a":None,"M3":None,"M3a":None},
        ],
        "ALL": [
            {"c":"Jan","M0a":24291,"M1":56.6,"M1a":13741,"M2":50.7,"M2a":12304,"M3":43.7,"M3a":10622},
            {"c":"Feb","M0a":21238,"M1":59.1,"M1a":12552,"M2":49.8,"M2a":10576,"M3":None,"M3a":None},
            {"c":"Mar","M0a":29847,"M1":56.0,"M1a":16714,"M2":None,"M2a":None,"M3":None,"M3a":None},
            {"c":"Apr","M0a":26872,"M1":None,"M1a":None,"M2":None,"M2a":None,"M3":None,"M3a":None},
            {"c":"May","M0a":32145,"M1":None,"M1a":None,"M2":None,"M2a":None,"M3":None,"M3a":None},
        ],
    },
}

# ── Build JSON ────────────────────────────────────────────────────────
def build(bq=None, sheets_spend=None, sheets_mtm=None):
    now = datetime.now(VN_TZ)
    out = {
        "meta": {
            "last_updated": now.isoformat(),
            "last_updated_display": now.strftime("%d %b %Y, %H:%M ICT"),
            "source": "BigQuery + Google Sheets via GitHub Actions",
        },
        "months": MONTHS,
        "revenue": FALLBACK["revenue"],
        "spend":   FALLBACK["spend"],
        "vmau":    FALLBACK["vmau"],
        "leads":   FALLBACK["leads"],
        "app_mau":     FALLBACK["app_mau"],
        "new_app_mau": FALLBACK["new_app_mau"],
        "nurr_d1": FALLBACK["nurr_d1"],
        "nurr_d7": FALLBACK["nurr_d7"],
        "nurr_m1": FALLBACK["nurr_m1"],
        "cohort":  FALLBACK["cohort"],
    }

    # Override spend from Sheets FC sheet
    if sheets_spend:
        for vert, vals in sheets_spend.items():
            if any(v != 0 for v in vals):
                out["spend"][vert] = vals
                print(f"  ✓ spend[{vert}] from Sheets")

    # Override revenue/vmau/leads from Sheets MTM
    if sheets_mtm:
        for vert, vals in sheets_mtm.get("rev",{}).items():
            if any(v > 0 for v in vals): out["revenue"][vert] = vals
        for vert, vals in sheets_mtm.get("mau",{}).items():
            if any(v > 0 for v in vals): out["vmau"][vert] = [int(v/1000) if v > 1000 else v for v in vals]
        for vert, vals in sheets_mtm.get("lead",{}).items():
            if any(v > 0 for v in vals): out["leads"][vert] = [int(v/1000) if v > 1000 else v for v in vals]

    # Override from BQ
    if bq:
        # MAU/DAU from BQ
        VERT_MAP = {"pty":"PTY","job":"JOB","veh":"VEH","gds":"GDS","chotot":"ALL"}
        for row in bq.get("mau", []):
            v = VERT_MAP.get(str(row.get("vertical","")).lower())
            mi = int(row.get("mi", -1))
            if v and 0 <= mi < 12:
                mau = int(row.get("mau", 0) or 0)
                if mau > 0:
                    if v not in out["vmau"]: out["vmau"][v] = [0]*12
                    out["vmau"][v][mi] = round(mau/1000, 1)
                lead = int(row.get("lead", 0) or 0)
                if lead > 0:
                    if v not in out["leads"]: out["leads"][v] = [0]*12
                    out["leads"][v][mi] = round(lead/1000, 1)
        # App MAU from BQ
        for row in bq.get("app_mau", []):
            mi = int(row.get("mi", -1))
            if 0 <= mi < 12:
                v = int(row.get("app_mau", 0) or 0)
                if v > 0: out["app_mau"][mi] = v
        for row in bq.get("new_app_mau", []):
            mi = int(row.get("mi", -1))
            if 0 <= mi < 12:
                v = int(row.get("new_app_mau", 0) or 0)
                if v > 0: out["new_app_mau"][mi] = v
        # Cohort from BQ
        COHORT_MAP = {"pty":"PTY","job":"JOB","veh":"VEH","gds":"GDS","all":"ALL"}
        cohort_rows = {}
        for row in bq.get("cohort", []):
            v = COHORT_MAP.get(str(row.get("vertical","")).lower())
            if not v: continue
            if v not in cohort_rows: cohort_rows[v] = {}
            mi = int(row.get("mi",-1))
            cohort_rows[v][mi] = {
                "c":   row["cohort"],
                "M0a": int(row.get("M0a",0)),
                "M1":  row.get("M1"), "M1a": row.get("M1a") and int(row.get("M1a")),
                "M2":  row.get("M2"), "M2a": row.get("M2a") and int(row.get("M2a")),
                "M3":  row.get("M3"), "M3a": row.get("M3a") and int(row.get("M3a")),
            }
        for v, months_dict in cohort_rows.items():
            if months_dict:
                out["cohort"][v] = [months_dict[i] for i in sorted(months_dict)]
                print(f"  ✓ cohort[{v}] from BQ ({len(out['cohort'][v])} months)")

    return out

# ── Main ──────────────────────────────────────────────────────────────
def main():
    now = datetime.now(VN_TZ)
    print(f"\n=== MKT Dashboard sync — {now.strftime('%Y-%m-%d %H:%M ICT')} ===\n")

    bq_data = {}
    sheets_spend = None
    sheets_mtm   = None

    # 1. BigQuery
    if HAS_BQ and os.environ.get("GCP_SA_KEY"):
        try:
            client = get_bq_client()
            print("✓ BQ connected")
            bq_data["mau"]         = run_query(client, MAU_SQL)
            bq_data["app_mau"]     = run_query(client, APP_MAU_SQL)
            bq_data["new_app_mau"] = run_query(client, NEW_APP_MAU_SQL)
            bq_data["cohort"]      = run_query(client, COHORT_SQL)
            print(f"  MAU: {len(bq_data['mau'])} rows | App MAU: {len(bq_data['app_mau'])} | Cohort: {len(bq_data['cohort'])}")
        except Exception as e:
            print(f"⚠ BQ error: {e}\n  → Using fallback data")

    # 2. Google Sheets — FC & Actual cost (requires sheet to be public)
    if HAS_REQ:
        fc_url = (os.environ.get("SHEETS_CSV_URL") or
                  sheet_csv_url(SHEET_FC_ID, gid=SHEET_FC_GID))
        fc_rows = fetch_csv(fc_url, "FC & Actual cost")
        if fc_rows:
            sheets_spend = parse_fc_sheet(fc_rows)

        mtm_url = (os.environ.get("MTM_CSV_URL") or
                   sheet_csv_url(SHEET_MTM_ID, tab=SHEET_MTM_TAB))
        mtm_rows = fetch_csv(mtm_url, "MTM metrics")
        if mtm_rows:
            sheets_mtm = parse_mtm_sheet(mtm_rows)

    # 3. Build + write
    out = build(bq_data or None, sheets_spend, sheets_mtm)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w") as f:
        json.dump(out, f, indent=2, default=str)
    print(f"\n✅ {OUTPUT} — {OUTPUT.stat().st_size:,} bytes")
    print(f"   last_updated: {out['meta']['last_updated_display']}")

if __name__ == "__main__":
    main()
