# SymGeoCAS Neuro-Symbolic RVR Replication Package (`SymGeoRVR-120`)

Companion diagnostic task suite, client-side WebAssembly Giac CAS and IEEE-754 tool sandboxes, verbatim multi-turn episode logs, and non-parametric statistical analysis scripts for:

> **Anchoring Mathematical Reasoning and Misconception Diagnosis in Large Language Models via a Client-Side WebAssembly Computer Algebra System**

## Directory Contents

- `data/symgeorvr_120_benchmark.json` — Stratified 120-item open-ended mathematical tutoring and student misconception diagnosis suite (`A1`, `A2`, `B1`, `B2`, `C1`, `C2`; `n = 20` per subfamily; 96 `MISCONCEPTION`, 24 `VALID`).
- `data/oracle_audit_120.json` — Direct tool-oracle verification audit across all 120 items.
- `data/runs/episodes_primary.jsonl` — Verbatim 720-episode primary three-arm crossover logs (`Pure-CoT`, `Numeric-PoT`, `SymGeoCAS-RVR`).
- `data/runs/episodes_stochastic_k5.jsonl` — Verbatim 240-episode multi-run stability logs (`k = 5`, `T = 0.7`).
- `data/statistical_results.json` — Cochran's Q, exact paired McNemar, Holm–Bonferroni, Wilson 95% CI, paired bootstrap, item-clustered logistic regression, and kernel latency outputs.
- `src/cas-bridge.mjs` — Client-side `@basthon/xcas-wasm` (`giac.wasm`) symbolic verification bridge.
- `src/numeric-sandbox.mjs` — Controlled IEEE-754 double-precision numerical tool sandbox.
- `src/grader.mjs` — Deterministic CAS-backed evaluation grader (`SymAcc`, `NumAcc`, `DiagFid`).
- `scripts/run_rvr_experiment.mjs` & `scripts/analyze_rvr_results.mjs` — Experiment runner and statistical verification scripts.

## Reproducing Statistical Analyses

```bash
npm install
node neurosymbolic-rvr/scripts/analyze_rvr_results.mjs
```
