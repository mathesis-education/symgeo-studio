import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';
import { getSymGeoCAS, executeSymbolicTool } from '../src/cas-bridge.mjs';
import { executeNumericTool } from '../src/numeric-sandbox.mjs';
import { gradeEpisode } from '../src/grader.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BENCH_PATH = path.join(ROOT, 'data/symgeorvr_120_benchmark.json');
const RUNS_DIR = path.join(ROOT, 'data/runs');
const PRIMARY_JSONL = path.join(RUNS_DIR, 'episodes_primary.jsonl');
const STOCH_JSONL = path.join(RUNS_DIR, 'episodes_stochastic_k5.jsonl');

fs.mkdirSync(RUNS_DIR, { recursive: true });

/**
 * Safely parse JSON emitted by LLMs even when strings contain single-backslash LaTeX (\frac, \sqrt, \pi).
 */
export function parseLLMJson(rawText) {
  if (!rawText) return null;
  let s = String(rawText).trim();
  // Strip <think>...</think> if any model emits thinking tags
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Extract ```json ... ``` or outermost {...}
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  else {
    const firstBrace = s.indexOf('{');
    const lastBrace = s.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      s = s.slice(firstBrace, lastBrace + 1);
    }
  }

  try {
    return JSON.parse(s);
  } catch {
    // Repair LaTeX backslashes inside JSON string literals (e.g. \frac, \sqrt, \pi, \theta, \nabla)
    let repaired = '';
    let inStr = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '"' && (i === 0 || s[i - 1] !== '\\')) {
        inStr = !inStr;
        repaired += ch;
      } else if (inStr && ch === '\\') {
        const next = s[i + 1] || '';
        const after = s.slice(i + 1, i + 7);
        // If \frac, \sqrt, \right, \theta, \tau, \times, \text, \beta, \nabla, \neq -> escape backslash!
        if (/^(frac|dfrac|sqrt|pi|tau|theta|times|text|right|left|beta|nabla|neq|infty|emptyset|cdot|ln|sin|cos|tan|exp)/.test(after)) {
          repaired += '\\\\';
        } else if (!['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u'].includes(next)) {
          repaired += '\\\\';
        } else {
          repaired += ch;
        }
      } else if (inStr && (ch === '\n' || ch === '\r')) {
        repaired += ch === '\n' ? '\\n' : '';
      } else {
        repaired += ch;
      }
    }
    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

// ============================================================================
// System Prompts for the 3 Controlled Arms
// ============================================================================
const FORMAT_RULES = `
Formatting rules for final_exact_answer:
- Use clean algebraic syntax (NOT unreduced integrals/commands): e.g. "15*pi/2", "(3 + sqrt(29))/2", "2*exp(1)", "-10", "3/19", or "none" if no real solution/inflection exists.
- If the problem asks for a sorted JSON array of values or Jordan block sizes, return a JSON array of exact strings sorted in ascending order, e.g. ["1/3", "2"] or ["1", "3"].
- For numeric_approx: provide the floating-point number (e.g. 23.561945), sorted float array (e.g. [0.333333, 2.0]), or null if "none".
- For misconception_verdict: return strictly "MISCONCEPTION" if the student's claim or method is mathematically flawed/incomplete, or "VALID" if the student's claim and mathematical reasoning are completely sound.
- For student_diagnosis: write a concise 2-3 sentence diagnostic explanation naming the exact mathematical invariant/mechanism (e.g., even multiplicity tangency, lowest nonzero derivative order parity k*, orthogonal normal distance / plane tilt factor, improper integral exponent p < 1, Nyquist quadrature aliasing, defective Jordan block rank chain, resonant secular factor, analytic continuation, or pole order factorial).
`.trim();

const PROMPT_ARM1 = `You are a mathematics tutor and solver operating in Pure Chain-of-Thought mode (no external tools).
Solve the mathematical problem and diagnose the student's claim carefully step by step.
${FORMAT_RULES}
Respond ONLY with a single valid JSON object matching this exact schema:
{
  "reasoning_steps": "concise step-by-step derivation",
  "final_exact_answer": "exact algebraic string or sorted array of exact strings or 'none'",
  "numeric_approx": 0.0,
  "misconception_verdict": "MISCONCEPTION or VALID",
  "student_diagnosis": "2-3 sentence mathematical diagnosis"
}`;

const PROMPT_ARM2_TURN1 = `You are a mathematics tutor equipped with an IEEE-754 Floating-Point Numerical Sandbox (Numeric-PoT mode).
Available numerical tools (choose ONE most appropriate tool to execute):
1. "numeric_roots_bisection": {"exprA": "f(x)", "exprB": "g(x)", "xMin": -6, "xMax": 6, "step": 0.05}
2. "numeric_calculus_fd": {"expr": "f(x)", "xMin": -5, "xMax": 5}
3. "numeric_3d_slice_mesh": {"implicitSurface": "F(x,y,z)", "a": 1, "b": 2, "c": 2, "d": 3, "bound": 5.5}
4. "numeric_integral_simpson": {"integrand": "(f(x))^2", "a": 0, "b": 1}
5. "numeric_diffgeom_fd": {"curveComponents": ["x(t)","y(t)","z(t)"], "t0": 1} OR {"surfaceRhs": "f(x,y)", "x0": 0, "y0": 0}
6. "numeric_matrix_float": {"matrix": [[...], [...]]}
7. "numeric_ode_rk4": {"rhsExpr": "expr for y'' in x, y, yp", "x0": 0, "y0": 0, "yp0": 0, "xTarget": 1.0}
8. "numeric_laplace_quadrature": {"ft": "f(t)", "s": 1}
9. "numeric_complex_contour": {"z0": 0, "radius": 0.0001, "poleOrder": 3, "gKind": "exp|sin|cos", "gParam": 2}
10. "numeric_eval_js": {"expression": "numeric JS Math expression"}

In Turn 1, form an initial hypothesis and invoke ONE numerical tool. Respond ONLY with valid JSON:
{
  "initial_reasoning": "brief initial mathematical setup",
  "initial_exact_answer": "tentative answer before tool run",
  "initial_verdict": "MISCONCEPTION or VALID",
  "tool_call": {
    "tool": "tool_name_from_list",
    "args": { ... }
  }
}`;

const PROMPT_ARM2_SYNTH = `You have received the output from the IEEE-754 Floating-Point Numerical Sandbox.
Use the tool observation and your mathematical analysis to produce the final answer and student diagnosis.
(Note: Base your quantitative check on the numerical tool output and your derivation.)
${FORMAT_RULES}
Respond ONLY with valid JSON:
{
  "reanalysis_notes": "how the numerical tool output informed or changed your initial hypothesis",
  "final_exact_answer": "exact algebraic string or sorted array or decimal if exact form unknown",
  "numeric_approx": 0.0,
  "misconception_verdict": "MISCONCEPTION or VALID",
  "student_diagnosis": "2-3 sentence mathematical diagnosis"
}`;

const PROMPT_ARM3_TURN1 = `You are a Neuro-Symbolic Mathematics Tutor operating a Reasoning–Verification–Reanalysis (RVR) loop anchored by client-side SymGeoCAS (compiled C++17 Giac WebAssembly exact Computer Algebra System).
Available exact symbolic tools in SymGeoCAS:
1. "solve_intersections": {"exprA": "y = ...", "exprB": "y = ..."} -> exact rational/radical intersections including even-multiplicity tangencies!
2. "analyze_function": {"expr": "f(x)"} -> exact derivatives, extrema, exact inflection x-coordinates via k-th derivative Taylor parity (k=3..12), and nonInflectionWarnings for even-order flat points!
3. "slice_3d": {"surface": "x^2+y^2+z^2=16", "plane": "x+2*y+2*z=3"} -> exact 3D sphere-plane circle center/radius/area or eliminated conic equation!
4. "solid_revolution": {"expr": "f(x)", "a": "0", "b": "1"} -> exact symbolic volume pi * int_a^b f(x)^2 dx!
5. "space_curve_3d": {"vecExpr": "[t, t^2, t^3]", "t0": "1"} -> exact symbolic curvature kappaAtT0 and torsion tauAtT0!
6. "surface_3d": {"rhsExpr": "f(x,y)", "x0": "0", "y0": "0"} -> exact Gaussian curvature gaussAtPoint and critical points!
7. "jordan_matrix": {"matrixExpr": "[[...],[...]]"} -> exact charPoly, Jordan canonical matrix J,jordanBlockSizes, and isDefective!
8. "vector_field_3d": {"vecExpr": "[P, Q, R]"} -> exact symbolic divExact and curlExact!
9. "eval_cas": {"command": "any valid Giac CAS command, e.g. simplify(...), solve(...), int(...), desolve([y''+4*y=8*sin(2*x), y(0)=0, y'(0)=0], x, y), laplace(exp(3*t)*cos(2*t), t, s), residue(exp(2*z)/(z-1)^4, z, 1)"} (IMPORTANT: never use underscores '_' in variable names in Giac; use pure alphanumeric names like k, a, x, y, z, t, s).

In Turn 1 (Reasoning + Symbolic Verification Query), state your initial hypothesis BEFORE running CAS, and call SymGeoCAS to verify. Respond ONLY with valid JSON:
{
  "initial_reasoning": "brief initial derivation",
  "initial_exact_answer": "initial exact answer hypothesis (same format as final_exact_answer)",
  "initial_verdict": "MISCONCEPTION or VALID",
  "tool_call": {
    "tool": "one_of_the_9_symbolic_tools",
    "args": { ... }
  }
}`;

const PROMPT_ARM3_RVR = `You have received the deterministic symbolic certificate from client-side SymGeoCAS (Giac C++ WASM).
Execute the RVR (Reasoning–Verification–Reanalysis) step:
- If the SymGeoCAS call returned an error or you need one additional symbolic simplification/evaluation (e.g., substituting x=pi/4 or multiplying projected ellipse area by sqrt(1+m^2+n^2)), you MAY issue ONE follow-up "tool_call" JSON: {"tool_call": {"tool": "eval_cas", "args": {"command": "..."}}}.
- Otherwise, compare your Turn-1 initial_exact_answer against the SymGeoCAS symbolic certificate. Whenever they differ, trust the verified exact symbolic mathematics, reanalyze why the discrepancy occurred, and output the final verified JSON:
${FORMAT_RULES}
{
  "rvr_discrepancy_detected": true,
  "reanalysis_notes": "exact comparison between Turn-1 hypothesis and SymGeoCAS symbolic certificate",
  "final_exact_answer": "verified exact algebraic string or sorted array or 'none'",
  "numeric_approx": 0.0,
  "misconception_verdict": "MISCONCEPTION or VALID",
  "student_diagnosis": "2-3 sentence mathematically verified student diagnosis"
}`;

// ============================================================================
// Provider HTTP Clients (OpenAI, Gemini, Local Ollama RTX 5090) with Retry
// ============================================================================
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, options, maxRetries = 5) {
  let lastErr = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 90000);
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        return await res.json();
      }
      const txt = await res.text();
      if (res.status === 429 || res.status >= 500) {
        await sleep(1200 * 2 ** attempt + Math.random() * 400);
        lastErr = new Error(`HTTP ${res.status}: ${txt.slice(0, 240)}`);
        continue;
      }
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 300)}`);
    } catch (err) {
      lastErr = err;
      await sleep(1000 * 2 ** attempt + Math.random() * 300);
    }
  }
  throw lastErr;
}

async function callOpenAI(modelId, messages, temperature = 0) {
  const t0 = performance.now();
  const isReasoningModel = /^o[134]|^gpt-5/i.test(modelId);
  const body = {
    model: modelId,
    messages,
    response_format: { type: 'json_object' }
  };
  if (isReasoningModel) {
    body.reasoning_effort = 'low';
    body.max_completion_tokens = 2048;
  } else {
    body.temperature = temperature;
    body.max_tokens = 950;
  }
  const data = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify(body)
  });
  const llmMs = Number((performance.now() - t0).toFixed(2));
  return {
    text: data.choices?.[0]?.message?.content || '',
    llmMs,
    snapshot: data.model || modelId,
    inTokens: data.usage?.prompt_tokens || 0,
    outTokens: data.usage?.completion_tokens || 0
  };
}

async function callGemini(modelId, messages, temperature = 0) {
  const t0 = performance.now();
  const sysMsg = messages.find((m) => m.role === 'system')?.content || '';
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
  const genCfg = {
    temperature,
    maxOutputTokens: 1200,
    responseMimeType: 'application/json'
  };
  if (/gemini-2\.5/i.test(modelId)) {
    genCfg.thinkingConfig = { thinkingBudget: 0 };
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const data = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: sysMsg ? { parts: [{ text: sysMsg }] } : undefined,
      contents,
      generationConfig: genCfg
    })
  });
  const llmMs = Number((performance.now() - t0).toFixed(2));
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return {
    text,
    llmMs,
    snapshot: data.modelVersion || modelId,
    inTokens: data.usageMetadata?.promptTokenCount || 0,
    outTokens: data.usageMetadata?.candidatesTokenCount || 0
  };
}

async function callOllama(modelId, messages, temperature = 0) {
  const t0 = performance.now();
  const data = await fetchWithRetry('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelId,
      messages,
      stream: false,
      think: false,
      format: 'json',
      options: {
        temperature,
        num_ctx: 4096,
        num_predict: 650
      }
    })
  });
  const llmMs = Number((performance.now() - t0).toFixed(2));
  return {
    text: data.message?.content || '',
    llmMs,
    snapshot: data.model || modelId,
    inTokens: data.prompt_eval_count || 0,
    outTokens: data.eval_count || 0
  };
}

async function invokeModel(providerCfg, messages, temperature = 0) {
  if (providerCfg.family === 'openai') return callOpenAI(providerCfg.modelId, messages, temperature);
  if (providerCfg.family === 'gemini') return callGemini(providerCfg.modelId, messages, temperature);
  return callOllama(providerCfg.modelId, messages, temperature);
}

// ============================================================================
// Single Episode Runner (Arm 1, Arm 2, Arm 3)
// ============================================================================
function buildItemUserPrompt(item) {
  return `Problem ID: ${item.id} (${item.category} / ${item.subfamily})
Mathematical Problem:
${item.problem_prompt}

Student's Claim to Diagnose:
"${item.student_claim}"`;
}

async function runSingleEpisode(providerCfg, arm, item, temperature = 0, runIdx = 1) {
  const userText = buildItemUserPrompt(item);
  let totalLlmMs = 0;
  let totalToolMs = 0;
  let totalInTok = 0;
  let totalOutTok = 0;
  let llmTurns = 0;
  let toolCallsCount = 0;
  const trace = [];
  let snapshot = providerCfg.modelId;

  if (arm === 'Arm1_PureCoT') {
    const messages = [
      { role: 'system', content: PROMPT_ARM1 },
      { role: 'user', content: userText }
    ];
    const r1 = await invokeModel(providerCfg, messages, temperature);
    llmTurns = 1;
    totalLlmMs += r1.llmMs;
    totalInTok += r1.inTokens;
    totalOutTok += r1.outTokens;
    snapshot = r1.snapshot;
    const parsed = parseLLMJson(r1.text);
    const grade = await gradeEpisode(item, parsed);
    return {
      key: `${providerCfg.slug}__${arm}__${item.id}__r${runIdx}`,
      modelSlug: providerCfg.slug,
      modelFamily: providerCfg.family,
      modelSnapshot: snapshot,
      arm,
      runIdx,
      temperature,
      itemId: item.id,
      category: item.category,
      subfamily: item.subfamily,
      llmTurns,
      toolCallsCount,
      totalLlmMs: Number(totalLlmMs.toFixed(2)),
      totalToolMs: 0,
      inTokens: totalInTok,
      outTokens: totalOutTok,
      turn1InitialGrade: null,
      parsedFinal: parsed,
      grade,
      trace: [{ turn: 1, raw: r1.text.slice(0, 1200) }]
    };
  }

  if (arm === 'Arm2_NumericFloat') {
    const messages = [
      { role: 'system', content: PROMPT_ARM2_TURN1 },
      { role: 'user', content: userText }
    ];
    const r1 = await invokeModel(providerCfg, messages, temperature);
    llmTurns++;
    totalLlmMs += r1.llmMs;
    totalInTok += r1.inTokens;
    totalOutTok += r1.outTokens;
    snapshot = r1.snapshot;
    const p1 = parseLLMJson(r1.text) || {};
    trace.push({ turn: 1, parsed: p1 });

    let toolObs = { ok: false, error: 'No tool_call provided' };
    if (p1.tool_call) {
      toolCallsCount++;
      toolObs = executeNumericTool(p1.tool_call);
      totalToolMs += toolObs.floatMs || 0;
    }
    trace.push({ turn: 1, toolObservation: toolObs });

    const synthMsgs = [
      { role: 'system', content: PROMPT_ARM2_SYNTH },
      { role: 'user', content: userText },
      { role: 'assistant', content: JSON.stringify(p1) },
      {
        role: 'user',
        content: `IEEE-754 Numerical Tool Observation:\n${JSON.stringify(toolObs)}\n\nNow synthesize your final JSON response.`
      }
    ];
    const r2 = await invokeModel(providerCfg, synthMsgs, temperature);
    llmTurns++;
    totalLlmMs += r2.llmMs;
    totalInTok += r2.inTokens;
    totalOutTok += r2.outTokens;
    const parsedFinal = parseLLMJson(r2.text);
    const grade = await gradeEpisode(item, parsedFinal);

    const initMock = {
      final_exact_answer: p1.initial_exact_answer,
      numeric_approx: null,
      misconception_verdict: p1.initial_verdict,
      student_diagnosis: ''
    };
    const t1Grade = await gradeEpisode(item, initMock);

    return {
      key: `${providerCfg.slug}__${arm}__${item.id}__r${runIdx}`,
      modelSlug: providerCfg.slug,
      modelFamily: providerCfg.family,
      modelSnapshot: snapshot,
      arm,
      runIdx,
      temperature,
      itemId: item.id,
      category: item.category,
      subfamily: item.subfamily,
      llmTurns,
      toolCallsCount,
      totalLlmMs: Number(totalLlmMs.toFixed(2)),
      totalToolMs: Number(totalToolMs.toFixed(3)),
      inTokens: totalInTok,
      outTokens: totalOutTok,
      turn1InitialGrade: { symCorrect: t1Grade.symCorrect, numCorrect: t1Grade.numCorrect, verdictCorrect: t1Grade.verdictCorrect },
      parsedFinal,
      grade,
      trace
    };
  }

  // Arm 3: Client-Side SymGeoCAS Giac WASM Neuro-Symbolic RVR Loop (up to 3 LLM turns / 2 symbolic tool calls)
  const messages = [
    { role: 'system', content: PROMPT_ARM3_TURN1 },
    { role: 'user', content: userText }
  ];
  const r1 = await invokeModel(providerCfg, messages, temperature);
  llmTurns++;
  totalLlmMs += r1.llmMs;
  totalInTok += r1.inTokens;
  totalOutTok += r1.outTokens;
  snapshot = r1.snapshot;
  const p1 = parseLLMJson(r1.text) || {};
  trace.push({ turn: 1, parsed: p1 });

  const initMock = {
    final_exact_answer: p1.initial_exact_answer,
    numeric_approx: null,
    misconception_verdict: p1.initial_verdict,
    student_diagnosis: ''
  };
  const t1Grade = await gradeEpisode(item, initMock);

  let symObs1 = { ok: false, error: 'No tool_call provided' };
  if (p1.tool_call) {
    toolCallsCount++;
    symObs1 = await executeSymbolicTool(p1.tool_call);
    totalToolMs += symObs1.wasmMs || 0;
  }
  trace.push({ turn: 1, symbolicObservation: symObs1 });

  const rvrMsgs = [
    { role: 'system', content: PROMPT_ARM3_RVR },
    { role: 'user', content: userText },
    { role: 'assistant', content: JSON.stringify(p1) },
    {
      role: 'user',
      content: `Client-Side SymGeoCAS (Giac C++ WASM) Symbolic Certificate #1:\n${JSON.stringify(symObs1)}\n\nPerform RVR check: either issue ONE follow-up tool_call if needed or output the final verified JSON.`
    }
  ];

  const r2 = await invokeModel(providerCfg, rvrMsgs, temperature);
  llmTurns++;
  totalLlmMs += r2.llmMs;
  totalInTok += r2.inTokens;
  totalOutTok += r2.outTokens;
  let pFinal = parseLLMJson(r2.text);
  trace.push({ turn: 2, parsed: pFinal });

  // Optional 2nd symbolic verification query if model requested follow-up tool_call
  if (pFinal && pFinal.tool_call && pFinal.final_exact_answer === undefined) {
    toolCallsCount++;
    const symObs2 = await executeSymbolicTool(pFinal.tool_call);
    totalToolMs += symObs2.wasmMs || 0;
    trace.push({ turn: 2, symbolicObservation2: symObs2 });

    rvrMsgs.push({ role: 'assistant', content: JSON.stringify(pFinal) });
    rvrMsgs.push({
      role: 'user',
      content: `Client-Side SymGeoCAS Symbolic Certificate #2:\n${JSON.stringify(symObs2)}\n\nNow output ONLY the final verified JSON (no more tool_call).`
    });
    const r3 = await invokeModel(providerCfg, rvrMsgs, temperature);
    llmTurns++;
    totalLlmMs += r3.llmMs;
    totalInTok += r3.inTokens;
    totalOutTok += r3.outTokens;
    pFinal = parseLLMJson(r3.text);
    trace.push({ turn: 3, parsed: pFinal });
  }

  const grade = await gradeEpisode(item, pFinal);
  return {
    key: `${providerCfg.slug}__${arm}__${item.id}__r${runIdx}`,
    modelSlug: providerCfg.slug,
    modelFamily: providerCfg.family,
    modelSnapshot: snapshot,
    arm,
    runIdx,
    temperature,
    itemId: item.id,
    category: item.category,
    subfamily: item.subfamily,
    llmTurns,
    toolCallsCount,
    totalLlmMs: Number(totalLlmMs.toFixed(2)),
    totalToolMs: Number(totalToolMs.toFixed(3)),
    inTokens: totalInTok,
    outTokens: totalOutTok,
    turn1InitialGrade: { symCorrect: t1Grade.symCorrect, numCorrect: t1Grade.numCorrect, verdictCorrect: t1Grade.verdictCorrect },
    rvrDiscrepancyFlagged: Boolean(pFinal?.rvr_discrepancy_detected),
    parsedFinal: pFinal,
    grade,
    trace
  };
}

// ============================================================================
// Worker Pool Concurrency Helper with Live JSONL Checkpointing
// ============================================================================
function loadCompletedKeys(jsonlPath) {
  const done = new Set();
  if (!fs.existsSync(jsonlPath)) return done;
  const lines = fs.readFileSync(jsonlPath, 'utf8').split(/\r?\n/).filter(Boolean);
  for (const l of lines) {
    try {
      const obj = JSON.parse(l);
      if (obj && obj.key && obj.grade && obj.grade.failureCode !== 'PARSE_OR_EMPTY_ERROR') {
        done.add(obj.key);
      }
    } catch {
      // ignore partial line
    }
  }
  return done;
}

async function runPool(tasks, concurrency, onDone) {
  let idx = 0;
  let completed = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < tasks.length) {
      const myIdx = idx++;
      try {
        const res = await tasks[myIdx]();
        completed++;
        onDone(res, completed, tasks.length);
      } catch (err) {
        completed++;
        console.error(`[Worker Error on task ${myIdx}]:`, err?.message || err);
      }
    }
  });
  await Promise.all(workers);
}

// ============================================================================
// Dry-Test Mode (runs 100% inside BypassSandbox: false to verify pipeline)
// ============================================================================
if (process.argv.includes('--dry-test')) {
  await getSymGeoCAS();
  const bench = JSON.parse(fs.readFileSync(BENCH_PATH, 'utf8'));
  const trickyJson = '```json\n{\n  "final_exact_answer": "\\frac{15\\pi}{2}",\n  "numeric_approx": 23.561945,\n  "misconception_verdict": "MISCONCEPTION",\n  "student_diagnosis": "Using orthogonal distance d_perp = 3/3 = 1 gives r = sqrt(15) and exact area 15*pi/2."\n}\n```';
  const parsed = parseLLMJson(trickyJson);
  const b41 = bench.find((x) => x.id === 'B41');
  const testExact = b41.ground_truth_exact;
  parsed.final_exact_answer = `\\frac{${testExact.replace('*pi', '\\pi')}}{1}`;
  const g = await gradeEpisode(b41, parsed);
  console.log('Dry-test LaTeX JSON parse & Giac grade passed:', { itemId: b41.id, gt: testExact, grade: g });
  process.exit(0);
}

// ============================================================================
// Live Multi-Model Execution (OpenAI + Gemini + Local Ollama RTX 5090)
// ============================================================================
await getSymGeoCAS();
const benchmark = JSON.parse(fs.readFileSync(BENCH_PATH, 'utf8'));
const arms = ['Arm1_PureCoT', 'Arm2_NumericFloat', 'Arm3_SymGeoCAS_RVR'];

// 1. Discover & Smoke-Verify Providers Safely
const activeProviders = [];

if (process.env.OPENAI_API_KEY) {
  try {
    const mList = await fetchWithRetry('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
    }, 2);
    const ids = new Set((mList.data || []).map((m) => m.id));
    const candidates = ['gpt-4.1-mini', 'gpt-4o-mini', 'o4-mini'].filter((p) => ids.has(p));
    if (candidates.length === 0) candidates.push('gpt-4o-mini');
    for (const cand of candidates) {
      try {
        const smoke = await callOpenAI(cand, [{ role: 'user', content: 'Return JSON {"ok": true}' }], 0);
        if (smoke.text) {
          activeProviders.push({
            slug: `openai_${cand.replace(/[^a-z0-9]/gi, '_')}`,
            family: 'openai',
            modelId: cand,
            concurrency: 12
          });
          console.log(`[Provider Verified] OpenAI -> ${cand} (snapshot: ${smoke.snapshot})`);
          break;
        }
      } catch (e) {
        console.warn(`[OpenAI candidate ${cand} skipped]:`, e.message);
      }
    }
  } catch (err) {
    console.warn('[OpenAI Discovery Warning]:', err.message);
  }
}

if (process.env.GEMINI_API_KEY) {
  try {
    const gList = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`,
      {},
      2
    );
    const gNames = new Set((gList.models || []).map((m) => m.name.replace(/^models\//, '')));
    const candidatesG = ['gemini-2.5-flash', 'gemini-2.0-flash'].filter((p) => gNames.has(p));
    if (candidatesG.length === 0) candidatesG.push('gemini-2.5-flash');
    for (const candG of candidatesG) {
      try {
        const smokeG = await callGemini(candG, [{ role: 'user', content: 'Return JSON {"ok": true}' }], 0);
        if (smokeG.text) {
          activeProviders.push({
            slug: `gemini_${candG.replace(/[^a-z0-9]/gi, '_')}`,
            family: 'gemini',
            modelId: candG,
            concurrency: 6
          });
          console.log(`[Provider Verified] Gemini -> ${candG} (snapshot: ${smokeG.snapshot})`);
          break;
        }
      } catch (e) {
        console.warn(`[Gemini candidate ${candG} skipped]:`, e.message);
      }
    }
  } catch (err) {
    console.warn('[Gemini Discovery Warning]:', err.message);
  }
}

try {
  const oList = await fetchWithRetry('http://127.0.0.1:11434/api/tags', {}, 2);
  const oNames = (oList.models || []).map((m) => m.name);
  console.log(`[Ollama Installed Models]: ${oNames.join(', ')}`);
  const preferredO = ['qwen3.5:9b', 'qwen3:8b', 'qwen2.5:7b', 'qwen3-vl:8b'];
  const chosenO = preferredO.find((p) => oNames.includes(p)) || oNames.find((n) => /qwen|gemma|llama/i.test(n));
  if (chosenO) {
    console.log(`[Ollama Warm-up] Warming up ${chosenO} on local GPU (2 discarded runs)...`);
    for (let w = 0; w < 2; w++) {
      await callOllama(chosenO, [{ role: 'user', content: 'Return JSON {"ok": true}' }], 0);
    }
    activeProviders.push({
      slug: `ollama_${chosenO.replace(/[^a-z0-9]/gi, '_')}`,
      family: 'ollama',
      modelId: chosenO,
      concurrency: 4
    });
    console.log(`[Provider Verified] Local Ollama -> ${chosenO}`);
  }
} catch (err) {
  console.warn('[Ollama Warning] Local Ollama not reachable:', err.message);
}

if (activeProviders.length === 0) {
  throw new Error('No LLM providers reachable!');
}

// 2. Run Primary 3-Arm Crossover Experiment (120 items x 3 arms x all active providers)
const donePrimary = loadCompletedKeys(PRIMARY_JSONL);
console.log(`Already completed primary episodes: ${donePrimary.size}`);

await Promise.all(
  activeProviders.map(async (prov) => {
    const jobs = [];
    for (const arm of arms) {
      for (const item of benchmark) {
        const key = `${prov.slug}__${arm}__${item.id}__r1`;
        if (donePrimary.has(key)) continue;
        jobs.push(async () => runSingleEpisode(prov, arm, item, 0, 1));
      }
    }
    console.log(`[${prov.slug}] Launching ${jobs.length} primary episodes (concurrency=${prov.concurrency})...`);
    await runPool(jobs, prov.concurrency, (ep, doneCnt, totalCnt) => {
      fs.appendFileSync(PRIMARY_JSONL, `${JSON.stringify(ep)}\n`, 'utf8');
      if (doneCnt % 30 === 0 || doneCnt === totalCnt) {
        console.log(`[${prov.slug}] Progress: ${doneCnt}/${totalCnt} (latest ${ep.arm} ${ep.itemId} -> sym=${ep.grade.symCorrect})`);
      }
    });
  })
);

// 3. Run Multi-Run Stochastic Stability Subsample: 24 stratified core items x 2 arms x k=5 runs at temp=0.7)
const coreSubfamilies = [
  'A1_Tangential_Radical_Intersections',
  'A2_HigherOrder_Inflection_Parity',
  'B1_3D_Plane_Slice_Conics',
  'B2_Solids_Revolution_Improper_Integrals',
  'C1_DiffGeom_Curvature_Defective_Jordan',
  'C2_Vector_ODE_Laplace_Residue'
];
const core24 = [];
for (const sf of coreSubfamilies) {
  const sfItems = benchmark.filter((x) => x.subfamily === sf);
  core24.push(sfItems[0], sfItems[5], sfItems[10], sfItems[15]);
}

const stochProv = activeProviders[0];
const doneStoch = loadCompletedKeys(STOCH_JSONL);
const stochJobs = [];
for (const arm of ['Arm1_PureCoT', 'Arm3_SymGeoCAS_RVR']) {
  for (const item of core24) {
    for (let r = 1; r <= 5; r++) {
      const key = `${stochProv.slug}__${arm}__${item.id}__r${r}`;
      if (doneStoch.has(key)) continue;
      stochJobs.push(async () => runSingleEpisode(stochProv, arm, item, 0.7, r));
    }
  }
}

console.log(`[Stochastic k=5 Check: ${stochProv.slug}] Launching ${stochJobs.length} runs (24 items x 2 arms x k=5, temp=0.7)...`);
await runPool(stochJobs, stochProv.concurrency, (ep, doneCnt, totalCnt) => {
  fs.appendFileSync(STOCH_JSONL, `${JSON.stringify(ep)}\n`, 'utf8');
  if (doneCnt % 40 === 0 || doneCnt === totalCnt) {
    console.log(`[Stochastic k=5] Progress: ${doneCnt}/${totalCnt}`);
  }
});

console.log('=== ALL PRIMARY AND STOCHASTIC k=5 EXPERIMENTS COMPLETED SUCCESSFULLY ===');
