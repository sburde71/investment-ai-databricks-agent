# ADR 0002 - Keep evaluation ground truth private

**Decision:** Guidance labels and expected business answers live under `evals/private_ground_truth/` and are not loaded into the production agent schemas.

**Why:** The POC must prove that Research Agent conclusions come from the research corpus rather than a hidden answer table.
