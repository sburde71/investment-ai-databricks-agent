from pathlib import Path
import csv

ROOT = Path(__file__).resolve().parents[1]

required = [
    "data/seed/companies.csv",
    "data/seed/funds.csv",
    "data/seed/holdings.csv",
    "data/seed/prices.csv",
    "data/seed/benchmarks.csv",
    "data/seed/document_manifest.csv",
    "evals/evaluation_questions.jsonl",
    "config/project.yaml",
]

missing = [p for p in required if not (ROOT / p).exists()]
if missing:
    raise SystemExit(f"Missing required files: {missing}")

docs = [p for p in (ROOT / "data/documents").rglob("*.*") if p.suffix.lower() in {".pdf", ".docx", ".html", ".txt"}]
if len(docs) != 45:
    raise SystemExit(f"Expected 45 research documents, found {len(docs)}")

with (ROOT / "data/seed/holdings.csv").open(newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))
exposure = {}
for row in rows:
    exposure[row["ticker"]] = exposure.get(row["ticker"], 0) + int(row["market_value_usd"])
assert exposure["NOVA"] == 220_000_000
assert exposure["EVRG"] == 85_000_000

print("✅ Repository validation passed")
print(f"✅ Research documents: {len(docs)}")
print("✅ NOVA exposure: $220M")
print("✅ EVRG exposure: $85M")
