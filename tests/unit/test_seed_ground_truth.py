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
        ticker = row["ticker"]
        exposure[ticker] = exposure.get(ticker, 0) + int(row["market_value_usd"])
        shares[ticker] = shares.get(ticker, 0) + int(row["shares"])

    assert exposure["NOVA"] == 220_000_000
    assert shares["NOVA"] == 2_000_000
    assert exposure["EVRG"] == 85_000_000
    assert shares["EVRG"] == 1_062_500
    assert exposure["NOVA"] + exposure["EVRG"] == 305_000_000
