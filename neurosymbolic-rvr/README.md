# SymGeoCAS Neuro-Symbolic RVR Replication Package (`SymGeoRVR-120`)

Companion replication benchmark, client-side WebAssembly Giac CAS & IEEE-754 tool sandboxes, verbatim multi-turn episode transcripts, and exact non-parametric statistical analysis scripts for:

> **When Numerical Tools Mislead Mathematical Reasoning: Client-Side WebAssembly Computer Algebra Verification for Automated Tutoring and Misconception Diagnosis**

## Contents

- `data/symgeorvr_120_benchmark.json` — Complete 120-item open-ended mathematical reasoning and student misconception diagnosis benchmark (`A1`, `A2`, `B1`, `B2`, `C1`, `C2`; `n = 20` per subcategory; 96 `MISCONCEPTION`, 24 `VALID`).
- `data/oracle_audit_120.json` — Pre-LLM tool-capability oracle audit across all 120 items.
- `data/runs/episodes_primary.jsonl` — Verbatim 720-episode primary 3-arm crossover logs (`Pure-CoT`, `Numeric-PoT`, `SymGeoCAS-RVR`).
- `data/runs/episodes_stochastic_k5.jsonl` — Verbatim 240-episode stochastic sensitivity logs (`k = 5`, `T = 0.7`).
- `data/statistical_results.json` — Exact McNemar, Holm-Bonferroni, Wilson 95% CI, paired bootstrap, and latency outputs.
- `src/cas-bridge.mjs` — Client-side `@basthon/xcas-wasm` (`giac.wasm`) symbolic verification bridge.
- `src/numeric-sandbox.mjs` — Controlled IEEE-754 double-precision numerical tool sandbox.
- `src/grader.mjs` — Deterministic CAS-backed grader (`SymAcc`, `NumAcc`, `DiagFid`).
- `scripts/run_rvr_experiment.mjs` & `scripts/analyze_rvr_results.mjs` — End-to-end experiment runner and statistical verification scripts.

## Reproducing Statistical Analyses

```bash
# From the repository root (after npm install)
node neurosymbolic-rvr/scripts/analyze_rvr_results.mjs
```
