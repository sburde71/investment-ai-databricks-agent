# Data Dictionary

## Production seed data

- `companies.csv` - security master for five fictional companies.
- `funds.csv` - three fictional Investment AI funds.
- `holdings.csv` - Q2 2026 fund-level positions, shares, prices and market values.
- `prices.csv` - synthetic historical close prices.
- `benchmarks.csv` - synthetic benchmark definitions.
- `document_manifest.csv` - metadata for all 45 research documents.

## Private evaluation-only data

Files under `evals/private_ground_truth/` are never ingested into the production agent schemas. They exist only to score whether the system independently derives the correct answer from permitted sources.
