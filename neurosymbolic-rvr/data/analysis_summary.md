# Stage 5 (`analysis`) & Stage 6 (`results`): Executed Statistical Analysis & Results Evidence Table

- **Primary Executed Dataset:** `data/runs/episodes_primary.jsonl` (`716` completed live episodes + `4` local-GPU 90s timeouts conservatively scored as incorrect under strict Intention-to-Treat `N = 720` = `2 models x 3 arms x 120 items`; Complete-Case `N = 716` reported in sensitivity check)
- **Stochastic Stability Dataset:** `data/runs/episodes_stochastic_k5.jsonl` (`N = 240` completed live episodes, `0` timeouts; `24` stratified items x `2` arms x `k = 5` independent runs at `T = 0.7`)
- **Verified Model Snapshots:** Frontier Cloud `gpt-4.1-mini-2025-04-14` (OpenAI API); Sovereign Local Open-Weight `qwen3.5:9b` (Ollama RTX 5090). (Google Gemini probe returned HTTP 402 depleted prepayment credit and was excluded prior to task execution.)

## 1. Primary Intention-to-Treat (`ITT`, Strict `N = 120` per Cell) & Complete-Case Performance Summary

| Model (`Snapshot`) | Reasoning Arm | `SymAcc` % (`k/120`) [95% Wilson CI] | `NumAcc` % (`k/120`) [95% Wilson CI] | `DiagFid` % (`k/120`) [95% Wilson CI] | Complete-Case `SymAcc` (`k/n_comp`) | Mean LLM `ms` | Mean Tool `ms` (`Share %`) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `gpt-4.1-mini-2025-04-14` | `Arm1_PureCoT` | **80%** (96/120) [71.96, 86.18] | **80%** (96/120) [71.96, 86.18] | **65%** (78/120) [56.12, 72.95] | 80% (96/120) | 5785.9 | 0 (0%) |
| `gpt-4.1-mini-2025-04-14` | `Arm2_NumericFloat` | **52.5%** (63/120) [43.63, 61.22] | **59.17%** (71/120) [50.22, 67.54] | **42.5%** (51/120) [34.02, 51.44] | 52.5% (63/120) | 5366.5 | 0.186 (0.0035%) |
| `gpt-4.1-mini-2025-04-14` | `Arm3_SymGeoCAS_RVR` | **0%** (0/120) [0, 3.1] | **0%** (0/120) [0, 3.1] | **0%** (0/120) [0, 3.1] | 0% (0/0) | 0 | 0 (0%) |
| `qwen3.5:9b` | `Arm1_PureCoT` | **60%** (72/120) [51.06, 68.32] | **60%** (72/120) [51.06, 68.32] | **49.17%** (59/120) [40.39, 58] | 60% (72/120) | 10966.9 | 0 (0%) |
| `qwen3.5:9b` | `Arm2_NumericFloat` | **35.83%** (43/120) [27.82, 44.73] | **40.83%** (49/120) [32.46, 49.78] | **29.17%** (35/120) [21.78, 37.84] | 36.75% (43/117) | 17175.7 | 1.5 (0.0087%) |
| `qwen3.5:9b` | `Arm3_SymGeoCAS_RVR` | **0%** (0/120) [0, 3.1] | **0%** (0/120) [0, 3.1] | **0%** (0/120) [0, 3.1] | 0% (0/0) | 0 | 0 (0%) |

## 2. Subfamily Breakdown (`n = 20` Items per Subfamily, Strict `ITT`)

| Model | Arm | `A1` Tang/Rad | `A2` Parity | `B1` 3D Slice | `B2` Rev/Osc | `C1` DiffG/Jordan | `C2` ODE/Lap/Res |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `gpt-4.1-mini-2025-04-14` | `Arm1_PureCoT` | 100% | 80% | 90% | 80% | 55% | 75% |
| `gpt-4.1-mini-2025-04-14` | `Arm2_NumericFloat` | 30% | 45% | 75% | 40% | 55% | 70% |
| `gpt-4.1-mini-2025-04-14` | `Arm3_SymGeoCAS_RVR` | 0% | 0% | 0% | 0% | 0% | 0% |
| `qwen3.5:9b` | `Arm1_PureCoT` | 65% | 75% | 40% | 75% | 30% | 75% |
| `qwen3.5:9b` | `Arm2_NumericFloat` | 30% | 55% | 20% | 15% | 35% | 60% |
| `qwen3.5:9b` | `Arm3_SymGeoCAS_RVR` | 0% | 0% | 0% | 0% | 0% | 0% |

## 3. Omnibus Cochran's $Q$ & Exact Paired McNemar Tests (`N = 120` Matched Pairs, Holm–Bonferroni Adjusted)

- **Cochran's $Q$ (openai_gpt_4_1_mini, `SymAcc`, $df = 2$):** $Q = 134.6604$, $p = 5.739e-30$
- **Cochran's $Q$ (openai_gpt_4_1_mini, `NumAcc`, $df = 2$):** $Q = 137.7963$, $p = 1.197e-30$
- **Cochran's $Q$ (openai_gpt_4_1_mini, `DiagFid`, $df = 2$):** $Q = 104.6$, $p = 1.934e-23$
- **Cochran's $Q$ (ollama_qwen3_5_9b, `SymAcc`, $df = 2$):** $Q = 99.6709$, $p = 2.274e-22$
- **Cochran's $Q$ (ollama_qwen3_5_9b, `NumAcc`, $df = 2$):** $Q = 100.1728$, $p = 1.769e-22$
- **Cochran's $Q$ (ollama_qwen3_5_9b, `DiagFid`, $df = 2$):** $Q = 80.0303$, $p = 4.184e-18$

| Model | Metric | Comparison | Discordant `(b, c)` | Paired $\Delta$ (%p) [95% Boot CI] | Paired OR | Exact $p$ | $p_{\text{Holm}}$ |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| `openai_gpt_4_1_mini` | `SymAcc` | `Arm3_SymGeoCAS_RVR vs Arm1_PureCoT` | (0, 96) | **-80** [-86.67, -72.5] | 0.01 | 2.524e-29 | 1.515e-28 |
| `openai_gpt_4_1_mini` | `SymAcc` | `Arm3_SymGeoCAS_RVR vs Arm2_NumericFloat` | (0, 63) | **-52.5** [-61.67, -43.33] | 0.01 | 2.168e-19 | 8.674e-19 |
| `openai_gpt_4_1_mini` | `SymAcc` | `Arm2_NumericFloat vs Arm1_PureCoT` | (10, 43) | **-27.5** [-38.33, -16.67] | 0.24 | 5.551e-6 | 1.110e-5 |
| `openai_gpt_4_1_mini` | `NumAcc` | `Arm3_SymGeoCAS_RVR vs Arm1_PureCoT` | (0, 96) | **-80** [-86.67, -72.5] | 0.01 | 2.524e-29 | 1.515e-28 |
| `openai_gpt_4_1_mini` | `NumAcc` | `Arm3_SymGeoCAS_RVR vs Arm2_NumericFloat` | (0, 71) | **-59.17** [-67.5, -50] | 0.01 | 8.470e-22 | 3.388e-21 |
| `openai_gpt_4_1_mini` | `NumAcc` | `Arm2_NumericFloat vs Arm1_PureCoT` | (12, 37) | **-20.83** [-31.67, -10] | 0.33 | 4.698e-4 | 8.617e-4 |
| `openai_gpt_4_1_mini` | `DiagFid` | `Arm3_SymGeoCAS_RVR vs Arm1_PureCoT` | (0, 78) | **-65** [-73.33, -56.67] | 0.01 | 6.617e-24 | 3.970e-23 |
| `openai_gpt_4_1_mini` | `DiagFid` | `Arm3_SymGeoCAS_RVR vs Arm2_NumericFloat` | (0, 51) | **-42.5** [-50.83, -34.17] | 0.01 | 8.882e-16 | 3.553e-15 |
| `openai_gpt_4_1_mini` | `DiagFid` | `Arm2_NumericFloat vs Arm1_PureCoT` | (12, 39) | **-22.5** [-33.33, -11.67] | 0.32 | 1.980e-4 | 2.323e-4 |
| `ollama_qwen3_5_9b` | `SymAcc` | `Arm3_SymGeoCAS_RVR vs Arm1_PureCoT` | (0, 72) | **-60** [-68.33, -50.83] | 0.01 | 4.235e-22 | 2.118e-21 |
| `ollama_qwen3_5_9b` | `SymAcc` | `Arm3_SymGeoCAS_RVR vs Arm2_NumericFloat` | (0, 43) | **-35.83** [-44.17, -27.5] | 0.01 | 2.274e-13 | 6.821e-13 |
| `ollama_qwen3_5_9b` | `SymAcc` | `Arm2_NumericFloat vs Arm1_PureCoT` | (7, 36) | **-24.17** [-34.17, -14.17] | 0.21 | 8.963e-6 | 1.110e-5 |
| `ollama_qwen3_5_9b` | `NumAcc` | `Arm3_SymGeoCAS_RVR vs Arm1_PureCoT` | (0, 72) | **-60** [-68.33, -50.83] | 0.01 | 4.235e-22 | 2.118e-21 |
| `ollama_qwen3_5_9b` | `NumAcc` | `Arm3_SymGeoCAS_RVR vs Arm2_NumericFloat` | (0, 49) | **-40.83** [-49.17, -31.67] | 0.01 | 3.553e-15 | 1.066e-14 |
| `ollama_qwen3_5_9b` | `NumAcc` | `Arm2_NumericFloat vs Arm1_PureCoT` | (9, 32) | **-19.17** [-29.17, -8.33] | 0.29 | 4.309e-4 | 8.617e-4 |
| `ollama_qwen3_5_9b` | `DiagFid` | `Arm3_SymGeoCAS_RVR vs Arm1_PureCoT` | (0, 59) | **-49.17** [-57.5, -40] | 0.01 | 3.469e-18 | 1.735e-17 |
| `ollama_qwen3_5_9b` | `DiagFid` | `Arm3_SymGeoCAS_RVR vs Arm2_NumericFloat` | (0, 35) | **-29.17** [-37.5, -20.83] | 0.01 | 5.821e-11 | 1.746e-10 |
| `ollama_qwen3_5_9b` | `DiagFid` | `Arm2_NumericFloat vs Arm1_PureCoT` | (7, 31) | **-20** [-29.17, -10] | 0.24 | 1.162e-4 | 2.323e-4 |

## 4. Cross-Arm Error Rescue (`Arm 1` vs `Arm 3` & `Arm 2`) and Within-Episode RVR Transitions

| Model | `Arm 1` Errors | Rescued by `Arm 3` (`%` of `Arm 1` Errors) | Lost by `Arm 3` from `Arm 1` Right | Rescued by `Arm 2` | Corrupted by `Arm 2` from `Arm 1` Right! |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `openai_gpt_4_1_mini` | 24 | **0 (0%)** | 96 | 10 | **43** |
| `ollama_qwen3_5_9b` | 48 | **0 (0%)** | 72 | 7 | **36** |

## 5. Item-Clustered Logistic Regression (`ITT N = 720`, `G = 120` Clusters, Liang–Zeger Sandwich SEs)

### Outcome: `SymAcc` (`N = 720`, `G = 120`, `LogLik = -301.85`)
| Predictor | $\hat{\beta}$ | Cluster-Robust SE | $z$ | $p$-value | Odds Ratio [95% CI] |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Intercept (Arm1, OpenAI gpt-4.1-mini, CatA) | 1.4256 | 0.2036 | 7.002 | 2.533e-12 | **4.16** [2.791, 6.2] |
| Arm2_NumericFloat (vs Arm1) | -1.1278 | 0.18 | -6.265 | 3.746e-10 | **0.324** [0.227, 0.461] |
| Arm3_SymGeoCAS_RVR (vs Arm1) | -11.2652 | 0.1869 | -60.267 | 0.000e+0 | **0** [0, 0] |
| Model_Qwen3.5-9B_Local (vs gpt-4.1-mini) | -0.8189 | 0.1779 | -4.602 | 4.180e-6 | **0.441** [0.311, 0.625] |
| Category_B_3DSpatial (vs CatA) | -0.2564 | 0.2515 | -1.019 | 3.081e-1 | **0.774** [0.473, 1.267] |
| Category_C_UndergradSTEM (vs CatA) | -0.1433 | 0.3308 | -0.433 | 6.647e-1 | **0.866** [0.453, 1.657] |

### Outcome: `NumAcc` (`N = 720`, `G = 120`, `LogLik = -303.05`)
| Predictor | $\hat{\beta}$ | Cluster-Robust SE | $z$ | $p$-value | Odds Ratio [95% CI] |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Intercept (Arm1, OpenAI gpt-4.1-mini, CatA) | 1.3942 | 0.2058 | 6.776 | 1.244e-11 | **4.032** [2.694, 6.035] |
| Arm2_NumericFloat (vs Arm1) | -0.8843 | 0.1727 | -5.122 | 3.029e-7 | **0.413** [0.294, 0.579] |
| Arm3_SymGeoCAS_RVR (vs Arm1) | -11.2692 | 0.189 | -59.623 | 0.000e+0 | **0** [0, 0] |
| Model_Qwen3.5-9B_Local (vs gpt-4.1-mini) | -0.8494 | 0.1792 | -4.741 | 2.133e-6 | **0.428** [0.301, 0.608] |
| Category_B_3DSpatial (vs CatA) | -0.17 | 0.249 | -0.682 | 4.949e-1 | **0.844** [0.518, 1.375] |
| Category_C_UndergradSTEM (vs CatA) | -0.0856 | 0.3297 | -0.26 | 7.952e-1 | **0.918** [0.481, 1.752] |

### Outcome: `DiagFid` (`N = 720`, `G = 120`, `LogLik = -305.1`)
| Predictor | $\hat{\beta}$ | Cluster-Robust SE | $z$ | $p$-value | Odds Ratio [95% CI] |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Intercept (Arm1, OpenAI gpt-4.1-mini, CatA) | 1.1961 | 0.1864 | 6.418 | 1.392e-10 | **3.307** [2.295, 4.766] |
| Arm2_NumericFloat (vs Arm1) | -0.928 | 0.1724 | -5.384 | 7.311e-8 | **0.395** [0.282, 0.554] |
| Arm3_SymGeoCAS_RVR (vs Arm1) | -10.7909 | 0.1797 | -60.041 | 0.000e+0 | **0** [0, 0] |
| Model_Qwen3.5-9B_Local (vs gpt-4.1-mini) | -0.6469 | 0.1675 | -3.862 | 1.125e-4 | **0.524** [0.377, 0.727] |
| Category_B_3DSpatial (vs CatA) | -1.0454 | 0.2819 | -3.708 | 2.089e-4 | **0.352** [0.202, 0.611] |
| Category_C_UndergradSTEM (vs CatA) | -0.6523 | 0.3111 | -2.097 | 3.604e-2 | **0.521** [0.283, 0.958] |
