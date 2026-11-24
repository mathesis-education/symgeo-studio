import { getAlgeoCAS, stripKhiApprox } from './cas-bridge.mjs';

/**
 * Normalize common LaTeX / Unicode / natural math strings emitted by LLMs into valid Giac exact syntax.
 * Does NOT convert floating-point approximations of irrationals into radicals—preserving exact vs float distinction!
 */
export function latexOrTextToGiac(raw) {
  if (raw === null || raw === undefined) return '';
  let s = String(raw).trim();
  // Strip outer $...$ or \(...\) or \[...\]
  s = s.replace(/^\$+|\$+$/g, '').replace(/^\\\(|\\\)$/g, '').replace(/^\\\[|\\\]$/g, '').trim();
  // Strip trailing period if sentence-like
  s = s.replace(/\.\s*$/, '').trim();
  // If answer contains '=' chain (e.g. "S = 15*pi/2" or "F(1) = -2/8 = -1/4"), extract final RHS cleanly!
  if (s.includes('=') && !/[<>!]/.test(s)) {
    const rhs = s.split('=').pop().trim();
    if (rhs) s = rhs;
  }
  // Check empty-set / none tokens
  if (/^(none|empty|null|no\s+inflection|no\s+real|no\s+solution|emptyset|\\emptyset|\{\}|\[\])$/i.test(s)) {
    return 'none';
  }
  // Reject prose placeholders like "to be determined" or "unknown" early without polluting Giac parser
  if (/\b(unknown|determined|need\s+to|compute|let\s+|solve\s+for)\b/i.test(s)) {
    return '';
  }
  s = s
    .replace(/\\left/g, '')
    .replace(/\\right/g, '')
    .replace(/\\cdot/g, '*')
    .replace(/\\times/g, '*')
    .replace(/−/g, '-')
    .replace(/×/g, '*')
    .replace(/π/g, 'pi')
    .replace(/\\pi\b/g, 'pi')
    .replace(/\\infty\b/g, 'infinity');

  // Iteratively convert \frac{A}{B} and \dfrac{A}{B}
  let prev = '';
  while (prev !== s) {
    prev = s;
    s = s.replace(/\\d?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '(($1)/($2))');
  }
  // Convert \sqrt[n]{A} and \sqrt{A}
  prev = '';
  while (prev !== s) {
    prev = s;
    s = s.replace(/\\sqrt\s*\[([^\[\]]+)\]\s*\{([^{}]+)\}/g, '(($2)^(1/($1)))');
    s = s.replace(/\\sqrt\s*\{([^{}]+)\}/g, 'sqrt($1)');
  }
  // Convert x^{A} -> x^(A)
  prev = '';
  while (prev !== s) {
    prev = s;
    s = s.replace(/\^\s*\{([^{}]+)\}/g, '^($1)');
  }
  // Clean \text{...} or \mathrm{...}
  s = s.replace(/\\(?:text|mathrm|operatorname)\s*\{([^{}]+)\}/g, '$1');
  s = s.replace(/\\(?:ln)\b/g, 'ln').replace(/\\(?:sin|cos|tan|exp)\b/g, (m) => m.slice(1));
  // Convert standalone e^(...) or e^k to exp(...)
  s = s.replace(/(?<![a-zA-Z0-9_])e\s*\^\s*\(([^()]+)\)/g, 'exp($1)');
  s = s.replace(/(?<![a-zA-Z0-9_])e\s*\^\s*([+-]?\d+(?:\/\d+)?)/g, 'exp($1)');
  // Remove remaining backslashes and braces
  s = s.replace(/\{/g, '(').replace(/\}/g, ')').replace(/\\/g, '');
  // Insert implicit multiplication like 15pi -> 15*pi, 2sqrt(3) -> 2*sqrt(3), )pi -> )*pi, )sqrt -> )*sqrt
  s = s.replace(/(\d)\s*(?=(?:pi|sqrt|exp|ln|sin|cos|tan|[a-zA-Z])\b)/g, '$1*');
  s = s.replace(/\)\s*(?=(?:pi|sqrt|exp|ln|sin|cos|tan|\d|[a-zA-Z(]))/g, ')*');
  s = s.replace(/\bpi\s*(?=(?:sqrt|exp|ln|sin|cos|tan|\())/g, 'pi*');
  return s.trim();
}

function splitTopLevelList(str) {
  let s = String(str || '').trim();
  if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
    s = s.slice(1, -1).trim();
  }
  if (!s) return [];
  const items = [];
  let cur = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      if (cur.trim()) items.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) items.push(cur.trim());
  return items;
}

export async function checkScalarSymbolicEqual(candRaw, gtRaw) {
  const { cas } = await getAlgeoCAS();
  const cNorm = latexOrTextToGiac(candRaw);
  const gNorm = latexOrTextToGiac(gtRaw);
  if (!cNorm) return false;
  if (gNorm === 'none') return cNorm === 'none';
  if (cNorm === 'none') return false;

  // Reject unreduced CAS command wrappers like "int(...)" or "solve(...)" or "residue(...)" or "laplace(...)"
  if (/\b(solve|int|integrate|diff|limit|residue|laplace|desolve|jordan|hessian)\s*\(/i.test(cNorm)) {
    return false;
  }

  // If ground truth contains irrational/transcendental symbols (sqrt, pi, exp, ln) and candidate is a pure decimal float,
  // Giac exact(decimal) will naturally NOT equal the irrational, which is exact! Double-check no float approximation slips through:
  const gtIsIrrational = /\b(sqrt|pi|exp|ln|sin|cos|atan)\b|\^\s*\(\s*\d+\s*\/\s*[2-9]/.test(gNorm);
  const candHasDecimal = /\d+\.\d{2,}/.test(cNorm);
  if (gtIsIrrational && candHasDecimal) {
    return false;
  }

  try {
    const diffCmd = `simplify(exact(${cNorm}) - exact(${gNorm}))`;
    const res = stripKhiApprox(cas.giacEvalRaw(diffCmd));
    if (res === '0') return true;
    const radRes = stripKhiApprox(cas.giacEvalRaw(`radnormal(exact(${cNorm}) - exact(${gNorm}))`));
    if (radRes === '0') return true;
    // Fallback check: confirm exact zero via high-precision evalf(exact(...), 30) ONLY when candidate has no decimal float
    if (!/\d+\.\d+/.test(cNorm)) {
      const hp = cas.giacEvalRaw(`evalf(abs((${cNorm}) - (${gNorm})), 25)`);
      const hpVal = Number(stripKhiApprox(hp));
      if (Number.isFinite(hpVal) && hpVal < 1e-20) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function evalGiacNumeric(exprRaw) {
  const { cas } = await getAlgeoCAS();
  const norm = latexOrTextToGiac(exprRaw);
  if (!norm || norm === 'none') return null;
  try {
    const out = stripKhiApprox(cas.giacEvalRaw(`evalf(${norm}, 15)`));
    const v = Number(out);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Grade a single LLM episode deterministically against certified ground truth.
 */
export async function gradeEpisode(item, parsedOutput, tol = 1e-4) {
  if (!parsedOutput || typeof parsedOutput !== 'object') {
    return {
      symCorrect: false,
      numCorrect: false,
      verdictCorrect: false,
      invariantCited: false,
      diagCorrect: false,
      failureCode: 'PARSE_OR_EMPTY_ERROR'
    };
  }

  const candExact = parsedOutput.final_exact_answer;
  const candApprox = parsedOutput.numeric_approx;
  const candVerdict = String(parsedOutput.misconception_verdict || '')
    .trim()
    .toUpperCase();
  const candDiag = String(parsedOutput.student_diagnosis || '').trim();

  let symCorrect = false;
  let numCorrect = false;

  if (item.answer_type === 'none') {
    const cNorm = Array.isArray(candExact)
      ? candExact.length === 0
        ? 'none'
        : String(candExact)
      : latexOrTextToGiac(candExact);
    symCorrect = cNorm === 'none';
    const approxEmpty =
      candApprox === null ||
      candApprox === undefined ||
      candApprox === 'none' ||
      (Array.isArray(candApprox) && candApprox.length === 0) ||
      String(candApprox).toLowerCase() === 'none';
    numCorrect = symCorrect || (cNorm === 'none' && approxEmpty);
  } else if (item.answer_type === 'scalar') {
    symCorrect = await checkScalarSymbolicEqual(candExact, item.ground_truth_exact);
    // Numeric check: either numeric_approx or evaluation of final_exact_answer within 1e-4
    let numVal = typeof candApprox === 'number' ? candApprox : Number(candApprox);
    if (!Number.isFinite(numVal)) {
      numVal = await evalGiacNumeric(candExact);
    }
    if (symCorrect) {
      numCorrect = true;
    } else if (Number.isFinite(numVal) && Number.isFinite(item.ground_truth_numeric)) {
      const scale = Math.max(1, Math.abs(item.ground_truth_numeric));
      numCorrect = Math.abs(numVal - item.ground_truth_numeric) <= tol * scale;
    }
  } else if (item.answer_type === 'list_exact') {
    // Unordered set/multiset of exact values (e.g., intersection x-coordinates or Jordan block sizes)
    const gtItems = item.ground_truth_list.map(String);
    const candItems = Array.isArray(candExact)
      ? candExact.map(String)
      : splitTopLevelList(String(candExact ?? ''));

    if (candItems.length === gtItems.length) {
      const used = new Array(gtItems.length).fill(false);
      let allSym = true;
      for (const ci of candItems) {
        let matched = false;
        for (let j = 0; j < gtItems.length; j++) {
          if (!used[j] && (await checkScalarSymbolicEqual(ci, gtItems[j]))) {
            used[j] = true;
            matched = true;
            break;
          }
        }
        if (!matched) {
          allSym = false;
          break;
        }
      }
      symCorrect = allSym;
    }

    if (symCorrect) {
      numCorrect = true;
    } else {
      let candNums = [];
      if (Array.isArray(candApprox) && candApprox.length === item.ground_truth_numeric_list.length) {
        candNums = candApprox.map(Number);
      } else if (candItems.length === item.ground_truth_numeric_list.length) {
        candNums = [];
        for (const ci of candItems) {
          const v = await evalGiacNumeric(ci);
          candNums.push(v === null ? NaN : v);
        }
      }
      if (candNums.length === item.ground_truth_numeric_list.length && candNums.every(Number.isFinite)) {
        const sC = [...candNums].sort((a, b) => a - b);
        const sG = [...item.ground_truth_numeric_list].sort((a, b) => a - b);
        numCorrect = sC.every((v, idx) => Math.abs(v - sG[idx]) <= tol * Math.max(1, Math.abs(sG[idx])));
      }
    }
  }

  const normalizedVerdict =
    candVerdict.includes('VALID') && !candVerdict.includes('INVALID') && !candVerdict.includes('MISCONCEPTION')
      ? 'VALID'
      : candVerdict.includes('MISCONCEPTION') || candVerdict.includes('INVALID') || candVerdict.includes('INCORRECT')
      ? 'MISCONCEPTION'
      : '';
  const verdictCorrect = normalizedVerdict === item.ground_truth_verdict;

  const diagPatterns = (item.diagnostic_patterns || []).map((p) => new RegExp(p, 'i'));
  const forbiddenPatterns = (item.forbidden_patterns || []).map((p) => new RegExp(p, 'i'));
  const invariantCited =
    candDiag.length >= 25 &&
    (diagPatterns.length === 0 || diagPatterns.some((re) => re.test(candDiag))) &&
    !forbiddenPatterns.some((re) => re.test(candDiag));

  const diagCorrect = symCorrect && verdictCorrect && invariantCited;

  let failureCode = 'NONE';
  if (!symCorrect && numCorrect) {
    failureCode = 'DECIMAL_APPROX_SYMBOLIC_LOSS';
  } else if (!symCorrect && !numCorrect) {
    failureCode = item.primary_trap_code || 'MATHEMATICAL_DERIVATION_OR_DEGENERACY_ERROR';
  } else if (symCorrect && !verdictCorrect) {
    failureCode = 'MISCONCEPTION_VERDICT_FLIP';
  } else if (symCorrect && verdictCorrect && !invariantCited) {
    failureCode = 'SHALLOW_OR_CONTRADICTORY_EXPLANATION';
  }

  return {
    symCorrect,
    numCorrect,
    verdictCorrect,
    invariantCited,
    diagCorrect,
    failureCode
  };
}
