# SymGeoRVR-120: Executed Statistical Analysis & Results Summary

- **Primary Executed Dataset:** `data/runs/episodes_primary.jsonl` (`716` completed live episodes + `4` local-GPU 90s timeouts conservatively scored as incorrect under strict Intention-to-Treat `N = 720` = `2 models x 3 arms x 120 items`; Complete-Case `N = 716` reported in sensitivity check)
- **Stochastic Stability Dataset:** `data/runs/episodes_stochastic_k5.jsonl` (`N = 240` completed live episodes, `0` timeouts; `24` stratified items x `2` arms x `k = 5` independent runs at `T = 0.7`)
- **Verified Model Snapshots:** Frontier Cloud `gpt-4.1-mini-2025-04-14` (OpenAI API); Sovereign Local Open-Weight `qwen3.5:9b` (Ollama RTX 5090). (Google Gemini probe returned HTTP 402 depleted prepayment credit and was excluded prior to task execution.)

## 1. Primary Intention-to-Treat (`ITT`, Strict `N = 120` per Cell) & Complete-Case Performance Summary

| Model (`Snapshot`) | Reasoning Arm | `SymAcc` % (`k/120`) [95% Wilson CI] | `NumAcc` % (`k/120`) [95% Wilson CI] | `DiagFid` % (`k/120`) [95% Wilson CI] | Complete-Case `SymAcc` (`k/n_comp`) | Mean LLM `ms` | Mean Tool `ms` (`Share %`) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `gpt-4.1-mini-2025-04-14` | `Arm1_PureCoT` | **80%** (96/120) [71.96, 86.18] | **80%** (96/120) [71.96, 86.18] | **65%** (78/120) [56.12, 72.95] | 80% (96/120) | 5785.9 | 0 (0%) |
| `gpt-4.1-mini-2025-04-14` | `Arm2_NumericFloat` | **52.5%** (63/120) [43.63, 61.22] | **59.17%** (71/120) [50.22, 67.54] | **42.5%** (51/120) [34.02, 51.44] | 52.5% (63/120) | 5366.5 | 0.186 (0.0035%) |
| `gpt-4.1-mini-2025-04-14` | `Arm3_SymGeoCAS_RVR` | **92.5%** (111/120) [86.36, 96] | **92.5%** (111/120) [86.36, 96] | **77.5%** (93/120) [69.24, 84.05] | 92.5% (111/120) | 6012 | 6.679 (0.111%) |
| `qwen3.5:9b` | `Arm1_PureCoT` | **60%** (72/120) [51.06, 68.32] | **60%** (72/120) [51.06, 68.32] | **49.17%** (59/120) [40.39, 58] | 60% (72/120) | 10966.9 | 0 (0%) |
| `qwen3.5:9b` | `Arm2_NumericFloat` | **35.83%** (43/120) [27.82, 44.73] | **40.83%** (49/120) [32.46, 49.78] | **29.17%** (35/120) [21.78, 37.84] | 36.75% (43/117) | 17175.7 | 1.5 (0.0087%) |
| `qwen3.5:9b` | `Arm3_SymGeoCAS_RVR` | **75.83%** (91/120) [67.45, 82.61] | **75.83%** (91/120) [67.45, 82.61] | **63.33%** (76/120) [54.42, 71.42] | 76.47% (91/119) | 15447.1 | 5.845 (0.0378%) |

## 2. Subfamily Breakdown (`n = 20` Items per Subfamily, Strict `ITT`)

| Model | Arm | `A1` Tang/Rad | `A2` Parity | `B1` 3D Slice | `B2` Rev/Osc | `C1` DiffG/Jordan | `C2` ODE/Lap/Res |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `gpt-4.1-mini-2025-04-14` | `Arm1_PureCoT` | 100% | 80% | 90% | 80% | 55% | 75% |
| `gpt-4.1-mini-2025-04-14` | `Arm2_NumericFloat` | 30% | 45% | 75% | 40% | 55% | 70% |
| `gpt-4.1-mini-2025-04-14` | `Arm3_SymGeoCAS_RVR` | 85% | 100% | 95% | 100% | 100% | 75% |
| `qwen3.5:9b` | `Arm1_PureCoT` | 65% | 75% | 40% | 75% | 30% | 75% |
| `qwen3.5:9b` | `Arm2_NumericFloat` | 30% | 55% | 20% | 15% | 35% | 60% |
| `qwen3.5:9b` | `Arm3_SymGeoCAS_RVR` | 95% | 95% | 45% | 60% | 95% | 65% |

## 3. Omnibus Cochran's $Q$ & Exact Paired McNemar Tests (`N = 120` Matched Pairs, Holm–Bonferroni Adjusted)

- **Cochran's $Q$ (openai_gpt_4_1_mini, `SymAcc`, $df = 2$):** $Q = 54.8182$, $p = 1.248e-12$
- **Cochran's $Q$ (openai_gpt_4_1_mini, `NumAcc`, $df = 2$):** $Q = 40.1639$, $p = 1.899e-9$
- **Cochran's $Q$ (openai_gpt_4_1_mini, `DiagFid`, $df = 2$):** $Q = 38.8286$, $p = 3.702e-9$
- **Cochran's $Q$ (ollama_qwen3_5_9b, `SymAcc`, $df = 2$):** $Q = 46.7467$, $p = 7.065e-11$
- **Cochran's $Q$ (ollama_qwen3_5_9b, `NumAcc`, $df = 2$):** $Q = 36.3562$, $p = 1.275e-8$
- **Cochran's $Q$ (ollama_qwen3_5_9b, `DiagFid`, $df = 2$):** $Q = 35.8592$, $p = 1.634e-8$

| Model | Metric | Comparison | Discordant `(b, c)` | Paired $\Delta$ (%p) [95% Boot CI] | Paired OR | Exact $p$ | $p_{\text{Holm}}$ |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| `openai_gpt_4_1_mini` | `SymAcc` | `Arm3_SymGeoCAS_RVR vs Arm1_PureCoT` | (21, 6) | **+12.5** [4.17, 20.83] | 3.31 | 5.925e-3 | 1.185e-2 |
| `openai_gpt_4_1_mini` | `SymAcc` | `Arm3_SymGeoCAS_RVR vs Arm2_NumericFloat` | (50, 2) | **+40** [30.83, 49.17] | 20.2 | 6.124e-13 | 3.674e-12 |
| `openai_gpt_4_1_mini` | `SymAcc` | `Arm2_NumericFloat vs Arm1_PureCoT` | (10, 43) | **-27.5** [-38.33, -16.67] | 0.24 | 5.551e-6 | 2.220e-5 |
| `openai_gpt_4_1_mini` | `NumAcc` | `Arm3_SymGeoCAS_RVR vs Arm1_PureCoT` | (21, 6) | **+12.5** [4.17, 20.83] | 3.31 | 5.925e-3 | 1.185e-2 |
| `openai_gpt_4_1_mini` | `NumAcc` | `Arm3_SymGeoCAS_RVR vs Arm2_NumericFloat` | (43, 3) | **+33.33** [24.17, 42.5] | 12.43 | 4.622e-10 | 2.773e-9 |
| `openai_gpt_4_1_mini` | `NumAcc` | `Arm2_NumericFloat vs Arm1_PureCoT` | (12, 37) | **-20.83** [-31.67, -10] | 0.33 | 4.698e-4 | 1.723e-3 |
| `openai_gpt_4_1_mini` | `DiagFid` | `Arm3_SymGeoCAS_RVR vs Arm1_PureCoT` | (26, 11) | **+12.5** [3.33, 22.5] | 2.3 | 2.007e-2 | 4.015e-2 |
| `openai_gpt_4_1_mini` | `DiagFid` | `Arm3_SymGeoCAS_RVR vs Arm2_NumericFloat` | (47, 5) | **+35** [25, 45] | 8.64 | 1.285e-9 | 7.709e-9 |
| `openai_gpt_4_1_mini` | `DiagFid` | `Arm2_NumericFloat vs Arm1_PureCoT` | (12, 39) | **-22.5** [-33.33, -11.67] | 0.32 | 1.980e-4 | 5.941e-4 |
| `ollama_qwen3_5_9b` | `SymAcc` | `Arm3_SymGeoCAS_RVR vs Arm1_PureCoT` | (34, 15) | **+15.83** [5, 27.5] | 2.23 | 9.399e-3 | 1.185e-2 |
| `ollama_qwen3_5_9b` | `SymAcc` | `Arm3_SymGeoCAS_RVR vs Arm2_NumericFloat` | (53, 5) | **+40** [29.17, 50] | 9.73 | 3.496e-11 | 1.748e-10 |
| `ollama_qwen3_5_9b` | `SymAcc` | `Arm2_NumericFloat vs Arm1_PureCoT` | (7, 36) | **-24.17** [-34.17, -14.17] | 0.21 | 8.963e-6 | 2.689e-5 |
| `ollama_qwen3_5_9b` | `NumAcc` | `Arm3_SymGeoCAS_RVR vs Arm1_PureCoT` | (34, 15) | **+15.83** [5, 27.5] | 2.23 | 9.399e-3 | 1.185e-2 |
| `ollama_qwen3_5_9b` | `NumAcc` | `Arm3_SymGeoCAS_RVR vs Arm2_NumericFloat` | (49, 7) | **+35** [24.17, 45] | 6.6 | 7.455e-9 | 3.728e-8 |
| `ollama_qwen3_5_9b` | `NumAcc` | `Arm2_NumericFloat vs Arm1_PureCoT` | (9, 32) | **-19.17** [-29.17, -8.33] | 0.29 | 4.309e-4 | 1.723e-3 |
| `ollama_qwen3_5_9b` | `DiagFid` | `Arm3_SymGeoCAS_RVR vs Arm1_PureCoT` | (34, 17) | **+14.17** [2.5, 25.83] | 1.97 | 2.409e-2 | 4.015e-2 |
| `ollama_qwen3_5_9b` | `DiagFid` | `Arm3_SymGeoCAS_RVR vs Arm2_NumericFloat` | (47, 6) | **+34.17** [24.17, 44.17] | 7.31 | 5.805e-9 | 2.903e-8 |
| `ollama_qwen3_5_9b` | `DiagFid` | `Arm2_NumericFloat vs Arm1_PureCoT` | (7, 31) | **-20** [-29.17, -10] | 0.24 | 1.162e-4 | 4.647e-4 |

## 4. Cross-Arm Error Rescue (`Arm 1` vs `Arm 3` & `Arm 2`) and Within-Episode RVR Transitions

| Model | `Arm 1` Errors | Rescued by `Arm 3` (`%` of `Arm 1` Errors) | Lost by `Arm 3` from `Arm 1` Right | Rescued by `Arm 2` | Corrupted by `Arm 2` from `Arm 1` Right! |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `openai_gpt_4_1_mini` | 24 | **21 (87.5%)** | 6 | 10 | **43** |
| `ollama_qwen3_5_9b` | 48 | **34 (70.83%)** | 15 | 7 | **36** |

## 5. Item-Clustered Logistic Regression (`ITT N = 720`, `G = 120` Clusters, Liang–Zeger Sandwich SEs)

### Outcome: `SymAcc` (`N = 720`, `G = 120`, `LogLik = -398.31`)
| Predictor | $\hat{\beta}$ | Cluster-Robust SE | $z$ | $p$-value | Odds Ratio [95% CI] |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Intercept (Arm1, OpenAI gpt-4.1-mini, CatA) | 1.6476 | 0.2189 | 7.528 | 5.185e-14 | **5.195** [3.383, 7.977] |
| Arm2_NumericFloat (vs Arm1) | -1.1503 | 0.184 | -6.25 | 4.121e-10 | **0.317** [0.221, 0.454] |
| Arm3_SymGeoCAS_RVR (vs Arm1) | 0.8602 | 0.232 | 3.708 | 2.089e-4 | **2.364** [1.5, 3.724] |
| Model_Qwen3.5-9B_Local (vs gpt-4.1-mini) | -0.9376 | 0.1707 | -5.494 | 3.933e-8 | **0.392** [0.28, 0.547] |
| Category_B_3DSpatial (vs CatA) | -0.5363 | 0.2413 | -2.223 | 2.623e-2 | **0.585** [0.365, 0.939] |
| Category_C_UndergradSTEM (vs CatA) | -0.2988 | 0.293 | -1.02 | 3.077e-1 | **0.742** [0.418, 1.317] |

### Outcome: `NumAcc` (`N = 720`, `G = 120`, `LogLik = -399.87`)
| Predictor | $\hat{\beta}$ | Cluster-Robust SE | $z$ | $p$-value | Odds Ratio [95% CI] |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Intercept (Arm1, OpenAI gpt-4.1-mini, CatA) | 1.62 | 0.2157 | 7.51 | 5.951e-14 | **5.053** [3.311, 7.712] |
| Arm2_NumericFloat (vs Arm1) | -0.9004 | 0.1762 | -5.111 | 3.208e-7 | **0.406** [0.288, 0.574] |
| Arm3_SymGeoCAS_RVR (vs Arm1) | 0.86 | 0.232 | 3.707 | 2.097e-4 | **2.363** [1.5, 3.724] |
| Model_Qwen3.5-9B_Local (vs gpt-4.1-mini) | -0.9602 | 0.1729 | -5.553 | 2.812e-8 | **0.383** [0.273, 0.537] |
| Category_B_3DSpatial (vs CatA) | -0.4667 | 0.2365 | -1.973 | 4.850e-2 | **0.627** [0.394, 0.997] |
| Category_C_UndergradSTEM (vs CatA) | -0.2519 | 0.2863 | -0.88 | 3.790e-1 | **0.777** [0.443, 1.362] |

### Outcome: `DiagFid` (`N = 720`, `G = 120`, `LogLik = -433.3`)
| Predictor | $\hat{\beta}$ | Cluster-Robust SE | $z$ | $p$-value | Odds Ratio [95% CI] |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Intercept (Arm1, OpenAI gpt-4.1-mini, CatA) | 1.424 | 0.1923 | 7.404 | 1.331e-13 | **4.154** [2.849, 6.055] |
| Arm2_NumericFloat (vs Arm1) | -0.9607 | 0.1793 | -5.358 | 8.438e-8 | **0.383** [0.269, 0.544] |
| Arm3_SymGeoCAS_RVR (vs Arm1) | 0.6378 | 0.2 | 3.189 | 1.428e-3 | **1.892** [1.279, 2.8] |
| Model_Qwen3.5-9B_Local (vs gpt-4.1-mini) | -0.6881 | 0.1541 | -4.466 | 7.975e-6 | **0.503** [0.372, 0.68] |
| Category_B_3DSpatial (vs CatA) | -1.3961 | 0.263 | -5.308 | 1.109e-7 | **0.248** [0.148, 0.415] |
| Category_C_UndergradSTEM (vs CatA) | -0.8831 | 0.2647 | -3.336 | 8.507e-4 | **0.413** [0.246, 0.695] |
