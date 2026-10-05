from pathlib import Path
import csv

ROOT = Path(__file__).resolve().parents[2]

def test_dataset_contract():
    docs = list((ROOT / "data" / "documents").rglob("*.*"))
    docs = [p for p in docs if p.suffix.lower() in {".pdf", ".docx", ".html", ".txt"}]
    assert len(docs) == 45

    with (ROOT / "data" / "seed" / "companies.csv").open(newline="", encoding="utf-8") as f:
        assert len(list(csv.DictReader(f))) == 5

    with (ROOT / "data" / "seed" / "funds.csv").open(newline="", encoding="utf-8") as f:
        assert len(list(csv.DictReader(f))) == 3
