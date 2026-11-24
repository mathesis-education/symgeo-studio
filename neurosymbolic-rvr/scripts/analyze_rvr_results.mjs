import fs from 'fs';
import path from 'path';

const ROOT = 'C:/dev/research/algeomath-neurosymbolic-track2';
const BENCH_PATH = path.join(ROOT, 'data/algeorvr_120_benchmark.json');
const ORACLE_PATH = path.join(ROOT, 'data/oracle_audit_120.json');
const PRIMARY_JSONL = path.join(ROOT, 'data/runs/episodes_primary.jsonl');
const STOCH_JSONL = path.join(ROOT, 'data/runs/episodes_stochastic_k5.jsonl');
const OUT_STATS = path.join(ROOT, 'data/statistical_results.json');
const OUT_REPORT = path.join(ROOT, 'notes/03_analysis_and_results_evidence_table.md');

function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) *
      Math.exp(-ax * ax);
  return sign * y;
}

function normalTwoSidedP(z) {
  return Math.max(0, Math.min(1, 1 - erf(Math.abs(z) / Math.SQRT2)));
}

function chiSqDf2PValue(q) {
  if (!Number.isFinite(q) || q <= 0) return 1.0;
  return Math.exp(-0.5 * q);
}

function exactMcNemarP(b, c) {
  const n = b + c;
  if (n === 0) return 1.0;
  const k = Math.min(b, c);
  const logFact = [0];
  for (let i = 1; i <= n; i++) logFact[i] = logFact[i - 1] + Math.log(i);
  const ln2 = Math.log(2);
  let tail = 0;
  for (let i = 0; i <= k; i++) {
    const logProb = logFact[n] - logFact[i] - logFact[n - i] - n * ln2;
    tail += Math.exp(logProb);
  }
  return Math.min(1.0, 2 * tail);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wilsonCI(k, n, z = 1.959963984540054) {
  if (n === 0) return [0, 0];
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

function pairedBootstrapDiffCI(arrA, arrB, B = 10000, seed = 20261118) {
  const n = arrA.length;
  const rng = mulberry32(seed);
  const diffs = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * n);
      sum += arrA[idx] - arrB[idx];
    }
    diffs[b] = sum / n;
  }
  diffs.sort();
  return [diffs[Math.floor(0.025 * B)], diffs[Math.floor(0.975 * B)]];
}

function cochranQ3(x1, x2, x3) {
  const n = x1.length;
  const k = 3;
  const T1 = x1.reduce((s, v) => s + v, 0);
  const T2 = x2.reduce((s, v) => s + v, 0);
  const T3 = x3.reduce((s, v) => s + v, 0);
  const Tbar = (T1 + T2 + T3) / k;
  const num = k * (k - 1) * ((T1 - Tbar) ** 2 + (T2 - Tbar) ** 2 + (T3 - Tbar) ** 2);
  let sumL = 0;
  let sumL2 = 0;
  for (let i = 0; i < n; i++) {
    const Li = x1[i] + x2[i] + x3[i];
    sumL += Li;
    sumL2 += Li * Li;
  }
  const den = k * sumL - sumL2;
  if (den <= 0) return { Q: 0, df: 2, pValue: 1.0 };
  const Q = num / den;
  return { Q: Number(Q.toFixed(4)), df: 2, pValue: chiSqDf2PValue(Q) };
}

function holmBonferroni(pValues) {
  const m = pValues.length;
  const indexed = pValues.map((p, idx) => ({ p, idx })).sort((a, b) => a.p - b.p);
  const adj = new Array(m);
  let runningMax = 0;
  for (let r = 0; r < m; r++) {
    const val = Math.min(1.0, indexed[r].p * (m - r));
    runningMax = Math.max(runningMax, val);
    adj[indexed[r].idx] = runningMax;
  }
  return adj;
}

function invertMatrix(M) {
  const n = M.length;
  const A = M.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    }
    [A[i], A[piv]] = [A[piv], A[i]];
    const div = A[i][i] || 1e-12;
    for (let c = 0; c < 2 * n; c++) A[i][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r !== i) {
        const f = A[r][i];
        for (let c = 0; c < 2 * n; c++) A[r][c] -= f * A[i][c];
      }
    }
  }
  return A.map((row) => row.slice(n));
}

function fitClusteredLogisticRegression(rows, paramNames) {
  const p = paramNames.length;
  const beta = new Array(p).fill(0);

  for (let iter = 0; iter < 35; iter++) {
    const grad = new Array(p).fill(0);
    const H = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let j = 1; j < p; j++) H[j][j] = 1e-6;

    for (const r of rows) {
      let eta = 0;
      for (let j = 0; j < p; j++) eta += r.X[j] * beta[j];
      eta = Math.max(-20, Math.min(20, eta));
      const mu = 1 / (1 + Math.exp(-eta));
      const w = Math.max(1e-8, mu * (1 - mu));
      const diff = r.y - mu;
      for (let j = 0; j < p; j++) {
        grad[j] += r.X[j] * diff - (j > 0 ? 1e-6 * beta[j] : 0);
        for (let k = 0; k < p; k++) H[j][k] += r.X[j] * r.X[k] * w;
      }
    }
    const Hinv = invertMatrix(H);
    let maxStep = 0;
    for (let j = 0; j < p; j++) {
      let step = 0;
      for (let k = 0; k < p; k++) step += Hinv[j][k] * grad[k];
      beta[j] += step;
      maxStep = Math.max(maxStep, Math.abs(step));
    }
    if (maxStep < 1e-8) break;
  }

  const XtWX = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let j = 1; j < p; j++) XtWX[j][j] = 1e-6;
  const clusterScores = new Map();

  let logLik = 0;
  for (const r of rows) {
    let eta = 0;
    for (let j = 0; j < p; j++) eta += r.X[j] * beta[j];
    eta = Math.max(-20, Math.min(20, eta));
    const mu = 1 / (1 + Math.exp(-eta));
    logLik += r.y * Math.log(Math.max(1e-15, mu)) + (1 - r.y) * Math.log(Math.max(1e-15, 1 - mu));
    const w = Math.max(1e-8, mu * (1 - mu));
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < p; k++) XtWX[j][k] += r.X[j] * r.X[k] * w;
    }
    if (!clusterScores.has(r.cluster)) clusterScores.set(r.cluster, new Array(p).fill(0));
    const ug = clusterScores.get(r.cluster);
    const res = r.y - mu;
    for (let j = 0; j < p; j++) ug[j] += r.X[j] * res;
  }

  const bread = invertMatrix(XtWX);
  const G = clusterScores.size;
  const dfScale = G > 1 ? G / (G - 1) : 1;
  const meat = Array.from({ length: p }, () => new Array(p).fill(0));
  for (const ug of clusterScores.values()) {
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < p; k++) meat[j][k] += dfScale * ug[j] * ug[k];
    }
  }
  const bm = bread.map((row, i) => meat[0].map((_, j) => row.reduce((s, _, k) => s + bread[i][k] * meat[k][j], 0)));
  const V = bm.map((row, i) => bread[0].map((_, j) => row.reduce((s, _, k) => s + bm[i][k] * bread[k][j], 0)));

  const coefs = paramNames.map((name, j) => {
    const b = beta[j];
    const se = Math.sqrt(Math.max(1e-16, V[j][j]));
    const z = b / se;
    const pVal = normalTwoSidedP(z);
    const or = Math.exp(b);
    return {
      term: name,
      beta: Number(b.toFixed(4)),
      robustSE: Number(se.toFixed(4)),
      z: Number(z.toFixed(3)),
      pValue: pVal,
      oddsRatio: Number(or.toFixed(3)),
      or95CI: [Number(Math.exp(b - 1.959964 * se).toFixed(3)), Number(Math.exp(b + 1.959964 * se).toFixed(3))]
    };
  });

  return { nObs: rows.length, nClusters: G, logLik: Number(logLik.toFixed(2)), coefficients: coefs };
}

function loadJsonl(p) {
  if (!fs.existsSync(p)) return [];
  const map = new Map();
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean)) {
    try {
      const obj = JSON.parse(line);
      if (obj && obj.key) map.set(obj.key, obj);
    } catch {
      // skip
    }
  }
  return [...map.values()];
}

const bench = JSON.parse(fs.readFileSync(BENCH_PATH, 'utf8'));
const oracle = JSON.parse(fs.readFileSync(ORACLE_PATH, 'utf8'));
const primaryRaw = loadJsonl(PRIMARY_JSONL);
const stoch = loadJsonl(STOCH_JSONL);

// Order models consistently: OpenAI Frontier first, Local Sovereign Qwen second
const modelSlugs = ['openai_gpt_4_1_mini', 'ollama_qwen3_5_9b'].filter((m) =>
  primaryRaw.some((e) => e.modelSlug === m)
);
const arms = ['Arm1_PureCoT', 'Arm2_NumericFloat', 'Arm3_AlgeoCAS_RVR'];
const categories = ['A_Secondary_Calculus', 'B_3D_Spatial_Integral', 'C_Undergraduate_STEM'];
const subfamilies = [
  'A1_Tangential_Radical_Intersections',
  'A2_HigherOrder_Inflection_Parity',
  'B1_3D_Plane_Slice_Conics',
  'B2_Solids_Revolution_Improper_Integrals',
  'C1_DiffGeom_Curvature_Defective_Jordan',
  'C2_Vector_ODE_Laplace_Residue'
];

const rawMap = new Map();
for (const ep of primaryRaw) {
  rawMap.set(`${ep.modelSlug}__${ep.arm}__${ep.itemId}`, ep);
}

// Build strict Intention-to-Treat (ITT, N = 120 per cell, 720 total) grid so timeouts count conservatively as failures!
const ittEpisodes = [];
const byModelArmItem = new Map();
let timeoutCount = 0;
const timeoutKeys = [];

const modelSnapshots = {};
for (const m of modelSlugs) {
  modelSnapshots[m] = primaryRaw.find((e) => e.modelSlug === m)?.modelSnapshot || m;
  for (const arm of arms) {
    for (const it of bench) {
      const k = `${m}__${arm}__${it.id}`;
      let ep = rawMap.get(k);
      if (!ep) {
        timeoutCount++;
        timeoutKeys.push(k);
        ep = {
          key: `${k}__r1`,
          modelSlug: m,
          modelFamily: m.startsWith('openai') ? 'openai' : 'ollama',
          modelSnapshot: modelSnapshots[m],
          arm,
          runIdx: 1,
          temperature: 0,
          itemId: it.id,
          category: it.category,
          subfamily: it.subfamily,
          isTimeoutImputed: true,
          llmTurns: 2,
          toolCallsCount: 0,
          totalLlmMs: 90000,
          totalToolMs: 0,
          inTokens: 0,
          outTokens: 0,
          turn1InitialGrade: { symCorrect: false, numCorrect: false, verdictCorrect: false },
          parsedFinal: null,
          grade: {
            symCorrect: false,
            numCorrect: false,
            verdictCorrect: false,
            invariantCited: false,
            diagCorrect: false,
            failureCode: 'GENERATION_TIMEOUT_90S'
          },
          trace: []
        };
      }
      ittEpisodes.push(ep);
      byModelArmItem.set(k, ep);
    }
  }
}

// 1. Primary ITT Summary (strict N = 120 per cell) + Complete-Case Sensitivity Note
const modelArmSummary = [];
for (const m of modelSlugs) {
  for (const arm of arms) {
    const eps = bench.map((it) => byModelArmItem.get(`${m}__${arm}__${it.id}`));
    const completedEps = eps.filter((e) => !e.isTimeoutImputed);
    const n = 120;
    const symK = eps.filter((e) => e.grade.symCorrect).length;
    const numK = eps.filter((e) => e.grade.numCorrect).length;
    const diagK = eps.filter((e) => e.grade.diagCorrect).length;
    const verdK = eps.filter((e) => e.grade.verdictCorrect).length;
    const [symLo, symHi] = wilsonCI(symK, n);
    const [numLo, numHi] = wilsonCI(numK, n);
    const [diagLo, diagHi] = wilsonCI(diagK, n);

    const llmTimes = completedEps.map((e) => e.totalLlmMs).sort((a, b) => a - b);
    const toolTimes = completedEps.map((e) => e.totalToolMs).sort((a, b) => a - b);
    const cn = completedEps.length || 1;
    const meanLlm = llmTimes.reduce((s, v) => s + v, 0) / cn;
    const meanTool = toolTimes.reduce((s, v) => s + v, 0) / cn;
    const meanTurns = completedEps.reduce((s, e) => s + e.llmTurns, 0) / cn;
    const threeTurnCount = completedEps.filter((e) => e.llmTurns >= 3).length;

    const byCat = {};
    for (const cat of categories) {
      const ceps = eps.filter((e) => e.category === cat);
      byCat[cat] = {
        n: ceps.length,
        symK: ceps.filter((e) => e.grade.symCorrect).length,
        symAcc: Number(((100 * ceps.filter((e) => e.grade.symCorrect).length) / ceps.length).toFixed(2)),
        numK: ceps.filter((e) => e.grade.numCorrect).length,
        numAcc: Number(((100 * ceps.filter((e) => e.grade.numCorrect).length) / ceps.length).toFixed(2)),
        diagK: ceps.filter((e) => e.grade.diagCorrect).length,
        diagFid: Number(((100 * ceps.filter((e) => e.grade.diagCorrect).length) / ceps.length).toFixed(2))
      };
    }

    const bySub = {};
    for (const sf of subfamilies) {
      const seps = eps.filter((e) => e.subfamily === sf);
      bySub[sf] = {
        n: seps.length,
        symK: seps.filter((e) => e.grade.symCorrect).length,
        symAcc: Number(((100 * seps.filter((e) => e.grade.symCorrect).length) / seps.length).toFixed(2)),
        numK: seps.filter((e) => e.grade.numCorrect).length,
        numAcc: Number(((100 * seps.filter((e) => e.grade.numCorrect).length) / seps.length).toFixed(2)),
        diagK: seps.filter((e) => e.grade.diagCorrect).length,
        diagFid: Number(((100 * seps.filter((e) => e.grade.diagCorrect).length) / seps.length).toFixed(2))
      };
    }

    modelArmSummary.push({
      modelSlug: m,
      modelSnapshot: modelSnapshots[m],
      arm,
      n,
      completedN: completedEps.length,
      timeouts: 120 - completedEps.length,
      symK,
      symAccPct: Number(((100 * symK) / n).toFixed(2)),
      completeCaseSymAccPct: Number(((100 * symK) / cn).toFixed(2)),
      sym95CI: [Number((100 * symLo).toFixed(2)), Number((100 * symHi).toFixed(2))],
      numK,
      numAccPct: Number(((100 * numK) / n).toFixed(2)),
      completeCaseNumAccPct: Number(((100 * numK) / cn).toFixed(2)),
      num95CI: [Number((100 * numLo).toFixed(2)), Number((100 * numHi).toFixed(2))],
      diagK,
      diagFidPct: Number(((100 * diagK) / n).toFixed(2)),
      completeCaseDiagFidPct: Number(((100 * diagK) / cn).toFixed(2)),
      diag95CI: [Number((100 * diagLo).toFixed(2)), Number((100 * diagHi).toFixed(2))],
      verdictK: verdK,
      verdictAccPct: Number(((100 * verdK) / n).toFixed(2)),
      meanLlmMs: Number(meanLlm.toFixed(1)),
      medianLlmMs: Number((llmTimes[Math.floor(cn / 2)] || 0).toFixed(1)),
      meanToolMs: Number(meanTool.toFixed(3)),
      p95ToolMs: Number((toolTimes[Math.min(cn - 1, Math.floor(0.95 * cn))] || 0).toFixed(3)),
      toolSharePct: Number(((100 * meanTool) / Math.max(1, meanLlm + meanTool)).toFixed(4)),
      meanLlmTurns: Number(meanTurns.toFixed(3)),
      threeTurnCount,
      byCategory: byCat,
      bySubfamily: bySub
    });
  }
}

// 2. Cochran's Q & Exact Paired McNemar Tests on Strict N = 120 ITT (plus Complete-Case n = 117 sensitivity check for Qwen)
const omnibusCochran = [];
const pairwiseMcNemar = [];
const pairSpecs = [
  ['Arm3_AlgeoCAS_RVR', 'Arm1_PureCoT'],
  ['Arm3_AlgeoCAS_RVR', 'Arm2_NumericFloat'],
  ['Arm2_NumericFloat', 'Arm1_PureCoT']
];
const metrics = [
  { key: 'symCorrect', label: 'SymAcc' },
  { key: 'numCorrect', label: 'NumAcc' },
  { key: 'diagCorrect', label: 'DiagFid' }
];

for (const m of modelSlugs) {
  for (const met of metrics) {
    const v1 = bench.map((it) => (byModelArmItem.get(`${m}__Arm1_PureCoT__${it.id}`).grade[met.key] ? 1 : 0));
    const v2 = bench.map((it) => (byModelArmItem.get(`${m}__Arm2_NumericFloat__${it.id}`).grade[met.key] ? 1 : 0));
    const v3 = bench.map((it) => (byModelArmItem.get(`${m}__Arm3_AlgeoCAS_RVR__${it.id}`).grade[met.key] ? 1 : 0));
    omnibusCochran.push({
      modelSlug: m,
      metric: met.label,
      nMatched: 120,
      ...cochranQ3(v1, v2, v3)
    });

    const armVecs = { Arm1_PureCoT: v1, Arm2_NumericFloat: v2, Arm3_AlgeoCAS_RVR: v3 };
    for (const [armA, armB] of pairSpecs) {
      const aArr = armVecs[armA];
      const bArr = armVecs[armB];
      let n11 = 0;
      let n10 = 0;
      let n01 = 0;
      let n00 = 0;
      for (let i = 0; i < 120; i++) {
        if (aArr[i] === 1 && bArr[i] === 1) n11++;
        else if (aArr[i] === 1 && bArr[i] === 0) n10++;
        else if (aArr[i] === 0 && bArr[i] === 1) n01++;
        else n00++;
      }
      const diffPct = (100 * (n10 - n01)) / 120;
      const [ciLo, ciHi] = pairedBootstrapDiffCI(aArr, bArr, 10000, 20261118);
      const rawP = exactMcNemarP(n10, n01);
      const pairedOR = (n10 + 0.5) / (n01 + 0.5);
      pairwiseMcNemar.push({
        modelSlug: m,
        metric: met.label,
        comparison: `${armA} vs ${armB}`,
        n: 120,
        bothRight_n11: n11,
        AonlyRight_b: n10,
        BonlyRight_c: n01,
        bothWrong_n00: n00,
        diffPctPoints: Number(diffPct.toFixed(2)),
        diff95BootstrapCI: [Number((100 * ciLo).toFixed(2)), Number((100 * ciHi).toFixed(2))],
        pairedOddsRatio: Number(pairedOR.toFixed(2)),
        exactMcNemarP: rawP
      });
    }
  }
}

for (const met of metrics) {
  const subset = pairwiseMcNemar.filter((x) => x.metric === met.label);
  const adj = holmBonferroni(subset.map((x) => x.exactMcNemarP));
  subset.forEach((x, idx) => {
    x.holmAdjustedP = adj[idx];
  });
}

// 3. Item-Clustered Logistic Regression on Full ITT Grid (N = 720, G = 120) AND Complete-Case (N = 716, G = 120)
const regParamNames = [
  'Intercept (Arm1, OpenAI gpt-4.1-mini, CatA)',
  'Arm2_NumericFloat (vs Arm1)',
  'Arm3_AlgeoCAS_RVR (vs Arm1)',
  'Model_Qwen3.5-9B_Local (vs gpt-4.1-mini)',
  'Category_B_3DSpatial (vs CatA)',
  'Category_C_UndergradSTEM (vs CatA)'
];

function buildRegRows(dataset, metricKey) {
  return dataset.map((ep) => ({
    X: [
      1,
      ep.arm === 'Arm2_NumericFloat' ? 1 : 0,
      ep.arm === 'Arm3_AlgeoCAS_RVR' ? 1 : 0,
      ep.modelSlug === 'ollama_qwen3_5_9b' ? 1 : 0,
      ep.category === 'B_3D_Spatial_Integral' ? 1 : 0,
      ep.category === 'C_Undergraduate_STEM' ? 1 : 0
    ],
    y: ep.grade[metricKey] ? 1 : 0,
    cluster: ep.itemId
  }));
}

const logisticRegModels = {
  ITT_N720: {
    SymAcc: fitClusteredLogisticRegression(buildRegRows(ittEpisodes, 'symCorrect'), regParamNames),
    NumAcc: fitClusteredLogisticRegression(buildRegRows(ittEpisodes, 'numCorrect'), regParamNames),
    DiagFid: fitClusteredLogisticRegression(buildRegRows(ittEpisodes, 'diagCorrect'), regParamNames)
  },
  CompleteCase_N716: {
    SymAcc: fitClusteredLogisticRegression(buildRegRows(primaryRaw, 'symCorrect'), regParamNames),
    NumAcc: fitClusteredLogisticRegression(buildRegRows(primaryRaw, 'numCorrect'), regParamNames),
    DiagFid: fitClusteredLogisticRegression(buildRegRows(primaryRaw, 'diagCorrect'), regParamNames)
  }
};

// 4. AN-03: RVR Self-Correction Trajectory Transitions + Cross-Arm Rescue Analysis (Arm1 Wrong -> Arm3 Right!)
const rvrTransitions = [];
const crossArmRescue = [];
const qualitativeCases = [];
const residualArm3Failures = [];

for (const m of modelSlugs) {
  // Also measure Direct Cross-Arm Rescue: items where standalone Arm 1 FAILED vs Arm 3 SUCCEEDED!
  let a1Wrong_a3Right = 0;
  let a1Right_a3Right = 0;
  let a1Right_a3Wrong = 0;
  let a1Wrong_a3Wrong = 0;
  let a1Wrong_a2Right = 0;
  let a1Right_a2Wrong = 0;

  for (const it of bench) {
    const e1 = byModelArmItem.get(`${m}__Arm1_PureCoT__${it.id}`);
    const e2 = byModelArmItem.get(`${m}__Arm2_NumericFloat__${it.id}`);
    const e3 = byModelArmItem.get(`${m}__Arm3_AlgeoCAS_RVR__${it.id}`);
    const s1 = e1.grade.symCorrect;
    const s2 = e2.grade.symCorrect;
    const s3 = e3.grade.symCorrect;

    if (!s1 && s3) {
      a1Wrong_a3Right++;
      if (qualitativeCases.length < 14) {
        qualitativeCases.push({
          modelSlug: m,
          itemId: it.id,
          subfamily: it.subfamily,
          groundTruthExact: it.ground_truth_exact,
          arm1HallucinatedAnswer: e1.parsedFinal?.final_exact_answer,
          arm2NumericAnswer: e2.parsedFinal?.final_exact_answer,
          arm3Turn1Hypothesis: e3.trace?.[0]?.parsed?.initial_exact_answer,
          arm3ToolCall: e3.trace?.[0]?.parsed?.tool_call,
          arm3CasCertificate: e3.trace?.[1]?.symbolicObservation,
          arm3VerifiedAnswer: e3.parsedFinal?.final_exact_answer,
          arm3ReanalysisNotes: e3.parsedFinal?.reanalysis_notes,
          arm3StudentDiagnosis: e3.parsedFinal?.student_diagnosis
        });
      }
    } else if (s1 && s3) a1Right_a3Right++;
    else if (s1 && !s3) a1Right_a3Wrong++;
    else a1Wrong_a3Wrong++;

    if (!s1 && s2) a1Wrong_a2Right++;
    if (s1 && !s2) a1Right_a2Wrong++;

    if (!s3 && m === 'openai_gpt_4_1_mini') {
      residualArm3Failures.push({
        itemId: it.id,
        subfamily: it.subfamily,
        gt: it.ground_truth_exact,
        arm3Ans: e3.parsedFinal?.final_exact_answer,
        toolCall: e3.trace?.[0]?.parsed?.tool_call,
        failureCode: e3.grade.failureCode
      });
    }
  }

  crossArmRescue.push({
    modelSlug: m,
    n: 120,
    arm1WrongTotal: a1Wrong_a3Right + a1Wrong_a3Wrong,
    arm3RescuedFromArm1Wrong: a1Wrong_a3Right,
    arm3RescuePctOfArm1Errors: Number(((100 * a1Wrong_a3Right) / Math.max(1, a1Wrong_a3Right + a1Wrong_a3Wrong)).toFixed(2)),
    arm3RetainedFromArm1Right: a1Right_a3Right,
    arm3LostFromArm1Right: a1Right_a3Wrong,
    arm2RescuedFromArm1Wrong: a1Wrong_a2Right,
    arm2CorruptedFromArm1Right: a1Right_a2Wrong
  });

  for (const arm of ['Arm2_NumericFloat', 'Arm3_AlgeoCAS_RVR']) {
    const eps = bench.map((it) => byModelArmItem.get(`${m}__${arm}__${it.id}`));
    let w2r = 0;
    let r2r = 0;
    let r2w = 0;
    let w2w = 0;
    for (const ep of eps) {
      const t1 = Boolean(ep.turn1InitialGrade?.symCorrect);
      const tf = Boolean(ep.grade?.symCorrect);
      if (!t1 && tf) w2r++;
      else if (t1 && tf) r2r++;
      else if (t1 && !tf) r2w++;
      else w2w++;
    }
    const initWrongTotal = w2r + w2w;
    rvrTransitions.push({
      modelSlug: m,
      arm,
      n: 120,
      turn1SymAccPct: Number(((100 * (r2r + r2w)) / 120).toFixed(2)),
      finalSymAccPct: Number(((100 * (r2r + w2r)) / 120).toFixed(2)),
      netGainPctPoints: Number(((100 * (w2r - r2w)) / 120).toFixed(2)),
      wrongToRight_Rescue: w2r,
      rightToRight_Retain: r2r,
      rightToWrong_Degrade: r2w,
      wrongToWrong_Residual: w2w,
      rescueRateGivenInitialWrongPct: initWrongTotal > 0 ? Number(((100 * w2r) / initWrongTotal).toFixed(2)) : 0
    });
  }
}

// 5. Failure Taxonomy Distribution Across Arms (ITT N = 240 per arm across 2 models)
const errorTaxonomy = {};
for (const arm of arms) {
  errorTaxonomy[arm] = {};
  for (const ep of ittEpisodes.filter((e) => e.arm === arm && !e.grade.diagCorrect)) {
    const code = ep.grade.failureCode || 'OTHER';
    errorTaxonomy[arm][code] = (errorTaxonomy[arm][code] || 0) + 1;
  }
}

// 6. AN-04: Stochastic Multi-Run k=5 Stability Analysis
const stochasticSummary = [];
if (stoch.length > 0) {
  const stochModels = [...new Set(stoch.map((e) => e.modelSlug))];
  for (const sm of stochModels) {
    for (const arm of ['Arm1_PureCoT', 'Arm3_AlgeoCAS_RVR']) {
      const seps = stoch.filter((e) => e.modelSlug === sm && e.arm === arm);
      const itemIds = [...new Set(seps.map((e) => e.itemId))];
      const runScores = [1, 2, 3, 4, 5].map((r) => {
        const reps = seps.filter((e) => e.runIdx === r);
        return reps.length ? (100 * reps.filter((e) => e.grade.symCorrect).length) / reps.length : 0;
      });
      const avgAt5 = runScores.reduce((s, v) => s + v, 0) / runScores.length;
      const runSD = Math.sqrt(runScores.reduce((s, v) => s + (v - avgAt5) ** 2, 0) / (runScores.length - 1));

      let majCorrect = 0;
      let passAt5Correct = 0;
      let itemSDsum = 0;
      for (const id of itemIds) {
        const ieps = seps.filter((e) => e.itemId === id);
        const kRight = ieps.filter((e) => e.grade.symCorrect).length;
        const pHat = kRight / (ieps.length || 1);
        itemSDsum += Math.sqrt(pHat * (1 - pHat));
        if (kRight >= 3) majCorrect++;
        if (kRight >= 1) passAt5Correct++;
      }
      stochasticSummary.push({
        modelSlug: sm,
        arm,
        nItems: itemIds.length,
        kRuns: 5,
        totalCalls: seps.length,
        runSymAccsPct: runScores.map((v) => Number(v.toFixed(2))),
        avgAt5Pct: Number(avgAt5.toFixed(2)),
        runSDPct: Number(runSD.toFixed(2)),
        ci95HalfWidthPct: Number(((1.96 * runSD) / Math.sqrt(5)).toFixed(2)),
        majAt5Pct: Number(((100 * majCorrect) / (itemIds.length || 1)).toFixed(2)),
        passAt5Pct: Number(((100 * passAt5Correct) / (itemIds.length || 1)).toFixed(2)),
        meanWithinItemBernoulliSD: Number((itemSDsum / (itemIds.length || 1)).toFixed(4))
      });
    }
  }
}

const fullStats = {
  generatedAt: new Date().toISOString(),
  totalExecutedPrimaryEpisodes: primaryRaw.length,
  totalIttPrimaryEpisodes: ittEpisodes.length,
  timeoutImputedCount: timeoutCount,
  timeoutKeys,
  totalStochasticEpisodes: stoch.length,
  modelSnapshots,
  oracleBaseline: oracle,
  modelArmSummary,
  omnibusCochran,
  pairwiseMcNemar,
  logisticRegModels: {
    SymAcc: logisticRegModels.ITT_N720.SymAcc,
    NumAcc: logisticRegModels.ITT_N720.NumAcc,
    DiagFid: logisticRegModels.ITT_N720.DiagFid,
    CompleteCaseSensitivity: logisticRegModels.CompleteCase_N716
  },
  crossArmRescue,
  rvrTransitions,
  errorTaxonomy,
  stochasticSummary,
  residualArm3Failures,
  qualitativeCases
};

fs.writeFileSync(OUT_STATS, JSON.stringify(fullStats, null, 2), 'utf8');

// Build comprehensive Markdown Evidence Report
const md = [];
md.push('# Stage 5 (`analysis`) & Stage 6 (`results`): Executed Statistical Analysis & Results Evidence Table');
md.push('');
md.push(`- **Primary Executed Dataset:** \`data/runs/episodes_primary.jsonl\` (\`716\` completed live episodes + \`4\` local-GPU 90s timeouts conservatively scored as incorrect under strict Intention-to-Treat \`N = 720\` = \`2 models x 3 arms x 120 items\`; Complete-Case \`N = 716\` reported in sensitivity check)`);
md.push(`- **Stochastic Stability Dataset:** \`data/runs/episodes_stochastic_k5.jsonl\` (\`N = 240\` completed live episodes, \`0\` timeouts; \`24\` stratified items x \`2\` arms x \`k = 5\` independent runs at \`T = 0.7\`)`);
md.push(`- **Verified Model Snapshots:** Frontier Cloud \`gpt-4.1-mini-2025-04-14\` (OpenAI API); Sovereign Local Open-Weight \`qwen3.5:9b\` (Ollama RTX 5090). (Google Gemini probe returned HTTP 402 depleted prepayment credit and was excluded prior to task execution.)`);
md.push('');
md.push('## 1. Primary Intention-to-Treat (`ITT`, Strict `N = 120` per Cell) & Complete-Case Performance Summary');
md.push('');
md.push('| Model (`Snapshot`) | Reasoning Arm | `SymAcc` % (`k/120`) [95% Wilson CI] | `NumAcc` % (`k/120`) [95% Wilson CI] | `DiagFid` % (`k/120`) [95% Wilson CI] | Complete-Case `SymAcc` (`k/n_comp`) | Mean LLM `ms` | Mean Tool `ms` (`Share %`) |');
md.push('| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |');
for (const row of modelArmSummary) {
  md.push(
    `| \`${row.modelSnapshot}\` | \`${row.arm}\` | **${row.symAccPct}%** (${row.symK}/120) [${row.sym95CI[0]}, ${row.sym95CI[1]}] | **${row.numAccPct}%** (${row.numK}/120) [${row.num95CI[0]}, ${row.num95CI[1]}] | **${row.diagFidPct}%** (${row.diagK}/120) [${row.diag95CI[0]}, ${row.diag95CI[1]}] | ${row.completeCaseSymAccPct}% (${row.symK}/${row.completedN}) | ${row.meanLlmMs} | ${row.meanToolMs} (${row.toolSharePct}%) |`
  );
}
md.push('');
md.push('## 2. Subfamily Breakdown (`n = 20` Items per Subfamily, Strict `ITT`)');
md.push('');
md.push('| Model | Arm | `A1` Tang/Rad | `A2` Parity | `B1` 3D Slice | `B2` Rev/Osc | `C1` DiffG/Jordan | `C2` ODE/Lap/Res |');
md.push('| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |');
for (const row of modelArmSummary) {
  const s = row.bySubfamily;
  md.push(
    `| \`${row.modelSnapshot}\` | \`${row.arm}\` | ${s.A1_Tangential_Radical_Intersections.symAcc}% | ${s.A2_HigherOrder_Inflection_Parity.symAcc}% | ${s.B1_3D_Plane_Slice_Conics.symAcc}% | ${s.B2_Solids_Revolution_Improper_Integrals.symAcc}% | ${s.C1_DiffGeom_Curvature_Defective_Jordan.symAcc}% | ${s.C2_Vector_ODE_Laplace_Residue.symAcc}% |`
  );
}
md.push('');
md.push('## 3. Omnibus Cochran\'s $Q$ & Exact Paired McNemar Tests (`N = 120` Matched Pairs, Holm–Bonferroni Adjusted)');
md.push('');
for (const cq of omnibusCochran) {
  md.push(`- **Cochran's $Q$ (${cq.modelSlug}, \`${cq.metric}\`, $df = 2$):** $Q = ${cq.Q}$, $p = ${cq.pValue.toExponential(3)}$`);
}
md.push('');
md.push('| Model | Metric | Comparison | Discordant `(b, c)` | Paired $\\Delta$ (%p) [95% Boot CI] | Paired OR | Exact $p$ | $p_{\\text{Holm}}$ |');
md.push('| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: |');
for (const mc of pairwiseMcNemar) {
  md.push(
    `| \`${mc.modelSlug}\` | \`${mc.metric}\` | \`${mc.comparison}\` | (${mc.AonlyRight_b}, ${mc.BonlyRight_c}) | **${mc.diffPctPoints > 0 ? '+' : ''}${mc.diffPctPoints}** [${mc.diff95BootstrapCI[0]}, ${mc.diff95BootstrapCI[1]}] | ${mc.pairedOddsRatio} | ${mc.exactMcNemarP.toExponential(3)} | ${mc.holmAdjustedP.toExponential(3)} |`
  );
}
md.push('');
md.push('## 4. Cross-Arm Error Rescue (`Arm 1` vs `Arm 3` & `Arm 2`) and Within-Episode RVR Transitions');
md.push('');
md.push('| Model | `Arm 1` Errors | Rescued by `Arm 3` (`%` of `Arm 1` Errors) | Lost by `Arm 3` from `Arm 1` Right | Rescued by `Arm 2` | Corrupted by `Arm 2` from `Arm 1` Right! |');
md.push('| :--- | :---: | :---: | :---: | :---: | :---: |');
for (const cr of crossArmRescue) {
  md.push(
    `| \`${cr.modelSlug}\` | ${cr.arm1WrongTotal} | **${cr.arm3RescuedFromArm1Wrong} (${cr.arm3RescuePctOfArm1Errors}%)** | ${cr.arm3LostFromArm1Right} | ${cr.arm2RescuedFromArm1Wrong} | **${cr.arm2CorruptedFromArm1Right}** |`
  );
}
md.push('');
md.push('## 5. Item-Clustered Logistic Regression (`ITT N = 720`, `G = 120` Clusters, Liang–Zeger Sandwich SEs)');
md.push('');
for (const [mName, mod] of Object.entries(logisticRegModels.ITT_N720)) {
  md.push(`### Outcome: \`${mName}\` (\`N = ${mod.nObs}\`, \`G = ${mod.nClusters}\`, \`LogLik = ${mod.logLik}\`)`);
  md.push('| Predictor | $\\hat{\\beta}$ | Cluster-Robust SE | $z$ | $p$-value | Odds Ratio [95% CI] |');
  md.push('| :--- | :---: | :---: | :---: | :---: | :---: |');
  for (const c of mod.coefficients) {
    md.push(`| ${c.term} | ${c.beta} | ${c.robustSE} | ${c.z} | ${c.pValue.toExponential(3)} | **${c.oddsRatio}** [${c.or95CI[0]}, ${c.or95CI[1]}] |`);
  }
  md.push('');
}

md.push('## 6. RQ-to-Analysis-to-Evidence Traceability Matrix');
md.push('');
md.push('| Research Question | Analysis ID | Key Verified Finding & Scope | Evidence IDs | Exceptions & Uncertainty Preserved | Manuscript Display |');
md.push('| :--- | :---: | :--- | :--- | :--- | :--- |');
md.push('| **RQ1** (Pure-CoT & Numeric-PoT Failure Modes) | `AN-01`, `AN-02`, `AN-03` | `Arm 1` fails on `20.0%` (`gpt-4.1-mini`) to `40.0%` (`Qwen3.5-9B`) of degenerate tasks. Crucially, `Arm 2` (`Numeric-PoT`) degrades `SymAcc` by `-27.50%p` ($p_{\\text{Holm}} = 2.220 \\times 10^{-5}$) on `gpt-4.1-mini` and `-24.17%p` ($p_{\\text{Holm}} = 2.689 \\times 10^{-5}$) on `Qwen3.5-9B` (and `NumAcc` by `-20.83%p` and `-19.17%p`, $p_{\\text{Holm}} = .0017$), corrupting `43` (`gpt-4.1-mini`) and `36` (`Qwen3.5-9B`) items solved under `Arm 1` due to decimal conversion and IEEE-754 tool distortion. | `EV-RES-01`, `EV-RES-02` | `Arm 2` achieves higher `NumAcc` than `SymAcc` (`59.17%` vs `52.50%` on `gpt-4.1-mini`; `40.83%` vs `35.83%` on `Qwen3.5-9B`), preserving smooth numerical competence. | Tables 2–4, Fig. 2 |');
md.push('| **RQ2** (`AlgeoCAS` Neuro-Symbolic RVR Efficacy) | `AN-02`, `AN-03` | `Arm 3` raises `SymAcc` to `92.50%` (`+12.50%p` vs `Arm 1`, $p_{\\text{Holm}} = .0119$; `+40.00%p` vs `Arm 2`, $p_{\\text{Holm}} = 3.674 \\times 10^{-12}$) on `gpt-4.1-mini` and `75.83%` ITT / `76.47%` complete-case (`+15.83%p` vs `Arm 1`, $p_{\\text{Holm}} = .0119$; `+40.00%p` vs `Arm 2`, $p_{\\text{Holm}} = 1.748 \\times 10^{-10}$) on `Qwen3.5-9B`, rescuing `87.50%` (`21/24`) and `70.83%` (`34/48`) of Pure-CoT errors. | `EV-RES-02`, `EV-RES-03`, `EV-RES-04` | `9/120` residual errors on `gpt-4.1-mini` (`6` from `Arm 1` right -> `Arm 3` wrong, `3` persistent) occur via free-form CAS DSL syntax friction (`5`), last-mile radical arithmetic (`3`), and verbal formatting (`1`); on `Qwen3.5-9B`, `19` `Arm 3` failures reflect `650`-token per-turn JSON truncation. | Tables 2–5, Figs. 2–3 |');
md.push('| **RQ3** (Latency, Stability & Sovereign Viability) | `AN-01`, `AN-04` | Client-side `giac.wasm` executes in `0.33–6.18 ms` per subfamily (`mean 5.85–6.68 ms` per episode, `0.04%–0.11%` of total LLM wall-clock time). Across `k = 5` stochastic runs (`T = 0.7`, `gpt-4.1-mini`), `AlgeoCAS` RVR boosts `Avg@5` from `77.50% ± 6.97%` to `90.83% ± 1.86%` (73.3% run-SD reduction), while local `Qwen3.5-9B + AlgeoCAS` (`75.83%` ITT / `76.47%` CC) approaches unverified cloud `gpt-4.1-mini` (`80.00%`) with zero cloud data transfer. | `EV-RES-05`, `EV-RES-06` | `4` local Ollama 90s timeouts (`1.11%`) and `650`-token per-call cap transparently reported alongside Complete-Case (`N = 716`) sensitivity models. | Table 6, Fig. 4 |');

fs.writeFileSync(OUT_REPORT, md.join('\n'), 'utf8');
console.log('Updated ITT + Complete-Case statistical analysis and generated figures input.');
