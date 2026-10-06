from pathlib import Path
import csv

ROOT = Path(__file__).resolve().parents[2]

def _rows(name):
    with (ROOT / "data" / "seed" / name).open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

def test_expected_company_exposure():
    rows = _rows("holdings.csv")
    exposure = {}
    shares = {}
    for row in rows:
        security_id = row["security_id"]
        exposure[security_id] = exposure.get(security_id, 0) + int(row["market_value_usd"])
        shares[security_id] = shares.get(security_id, 0) + int(row["shares"])

    assert exposure["IA-SYN-01"] == 220_000_000
    assert shares["IA-SYN-01"] == 2_000_000
    assert exposure["IA-SYN-02"] == 85_000_000
    assert shares["IA-SYN-02"] == 1_062_500
    assert exposure["IA-SYN-01"] + exposure["IA-SYN-02"] == 305_000_000
