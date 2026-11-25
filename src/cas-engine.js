/**
 * SymGeo Studio Next-Gen CAS Engine Module (Giac C++ WebAssembly Wrapper)
 *
 * Engine Upstream: Giac/Xcas by Bernard Parisse (Institut Fourier, Université Grenoble Alpes)
 * WASM Distribution: @basthon/xcas-wasm (GPL-3.0-or-later)
 *
 * Architectural Note (GPL-3.0 Modular Encapsulation):
 * This module encapsulates all C++ Giac WebAssembly (`caseval`) calls behind a clean,
 * asynchronous/message-ready interface so the symbolic algebra engine remains cleanly
 * modularized under GPL-3.0.
 */

import { t } from './i18n.js';

let giacModule = null;
let rawCaseval = null;
let initPromise = null;
let evalCounter = 0;

/**
 * Initialize Giac WebAssembly runtime once.
 */
export async function initGiacEngine(wasmModuleUrl = '../node_modules/@basthon/xcas-wasm/src/index.js') {
  if (rawCaseval) return { ready: true };
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const t0 = performance.now();
    if (typeof globalThis.alert !== 'function') {
      globalThis.alert = () => {};
    }
    const imported = await import(wasmModuleUrl);
    giacModule = imported.default || imported;

    if (!giacModule.calledRun) {
      await new Promise((resolve) => {
        const prev = giacModule.onRuntimeInitialized;
        giacModule.onRuntimeInitialized = () => {
          if (typeof prev === 'function') prev();
          resolve();
        };
      });
    }

    rawCaseval = giacModule.cwrap('caseval', 'string', ['string']);

    // Configure Giac for exact symbolic real algebra (real symbolic mode)
    rawCaseval('xcas_mode(0)');
    rawCaseval('approx_mode:=0');
    rawCaseval('complex_mode:=0');
    rawCaseval('angle_radian:=1');

    const initMs = Math.round(performance.now() - t0);
    return { ready: true, initMs };
  })();

  return initPromise;
}

export function isEngineReady() {
  return Boolean(rawCaseval);
}

/**
 * Execute raw Giac command synchronously (once WASM is initialized).
 */
export function giacEvalRaw(cmd) {
  if (!rawCaseval) {
    throw new Error(t('Giac WASM engine is not initialized yet.', 'Giac WASM 엔진이 아직 초기화되지 않았습니다.'));
  }
  const out = rawCaseval(String(cmd));
  return typeof out === 'string' ? out.trim() : String(out ?? '');
}

/**
 * Clean numbers so ".000" or "-0" never appear in UI.
 */
export function formatCleanNumber(val, digits = 4) {
  const num = Number(val);
  if (!Number.isFinite(num)) return String(val);
  if (Math.abs(num) < 1e-12) return '0';
  if (Math.abs(num - Math.round(num)) < 1e-10) return String(Math.round(num));
  return Number(num.toFixed(digits)).toString();
}

/**
 * Normalize student/teacher natural math input into Giac syntax.
 * Supports:
 * - Implicit multiplication: 3x^2 -> 3*x^2, 2(x+1) -> 2*(x+1), (x-1)(x+1) -> (x-1)*(x+1), 2sin(x) -> 2*sin(x)
 * - Unicode symbols: √(x) -> sqrt(x), π -> pi, − -> -, × -> *, ÷ -> /, ² -> ^2, ³ -> ^3
 * - Absolute value: |x - 2| -> abs(x - 2)
 * - Localized Korean CAS command input aliases (factor, expand, diff, integrate, solve, limit)
 */
export function normalizeMathInput(input) {
  if (!input) return '';
  let s = String(input).trim();

  // Replace Korean friendly command names
  const korMap = [
    [/^인수분해\s*\(/i, 'factor('],
    [/^전개\s*\(/i, 'expand('],
    [/^간단히\s*\(/i, 'simplify('],
    [/^부분분수\s*\(/i, 'partfrac('],
    [/^표준형\s*\(/i, 'canonical_form('],
    [/^미분\s*\(/i, 'diff('],
    [/^적분\s*\(/i, 'int('],
    [/^방정식\s*\(/i, 'solve('],
    [/^해\s*\(/i, 'solve('],
    [/^극값\s*\(/i, 'extrema('],
    [/^극한\s*\(/i, 'limit('],
    [/^테일러\s*\(/i, 'taylor(']
  ];
  for (const [re, rep] of korMap) {
    s = s.replace(re, rep);
  }

  // Unicode math normalization
  s = s
    .replace(/−/g, '-')
    .replace(/×/g, '*')
    .replace(/·/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'pi')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/⁴/g, '^4')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*([a-zA-Z0-9_]+)/g, 'sqrt($1)');

  // Simple |expr| -> abs(expr) (non-nested)
  s = s.replace(/\|([^|]+)\|/g, 'abs($1)');

  // Convert standalone e^(...) or e^x into exp(...) so Euler's number is always exact in Giac
  s = s.replace(/\be\s*\^\s*\(([^()]+)\)/g, 'exp($1)');
  s = s.replace(/\be\s*\^\s*([+-]?[a-zA-Z0-9_]+)/g, 'exp($1)');

  // Protect known multi-letter identifiers before inserting implicit '*'
  const funcs = [
    'canonical_form', 'gramschmidt', 'divergence', 'partfrac', 'simplify',
    'ilaplace', 'laplace', 'desolve', 'residue', 'hessian', 'extrema',
    'gbasis', 'jordan', 'factor', 'expand', 'taylor', 'limit', 'solve',
    'zeros', 'cZeros', 'fsolve', 'arcsin', 'arccos', 'arctan',
    'egvl', 'rref', 'curl', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh',
    'sqrt', 'diff', 'egv', 'svd', 'det', 'int', 'abs', 'exp',
    'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'log', 'ln', 'pi'
  ];

  const tokens = [];
  let masked = s;
  for (const fn of funcs) {
    const re = new RegExp(`\\b${fn}\\b`, 'g');
    masked = masked.replace(re, () => {
      const id = `@@FN${tokens.length}@@`;
      tokens.push(fn);
      return id;
    });
  }

  // Implicit multiplication rules:
  // 1) number followed by variable, '(' or protected function token: 3x -> 3*x, 2(x+1) -> 2*(x+1), 2sin(x) -> 2*sin(x)
  masked = masked.replace(/(\d(?:\.\d+)?)\s*(?=[a-zA-Z(]|@@FN)/g, '$1*');
  // 2) ')' followed by number, variable, '(' or function token: (x-1)(x+1) -> (x-1)*(x+1), (x+1)x -> (x+1)*x
  masked = masked.replace(/\)\s*(?=[a-zA-Z0-9(]|@@FN)/g, ')*');
  // 3) single-letter variable (like a, k, x, y) followed by '(' when NOT assignment f(x)=... at start
  // Keep f(x) or g(x) intact if at start before '=' or ':='
  const eqIdx = masked.indexOf('=');
  if (eqIdx > 0) {
    const lhs = masked.slice(0, eqIdx);
    let rhs = masked.slice(eqIdx);
    rhs = rhs.replace(/\b([a-zA-Z])\s*\(/g, '$1*(');
    rhs = rhs.replace(/\b([a-zA-Z])\s*(?=@@FN)/g, '$1*');
    // Adjacent single-letter variables like ax -> a*x, xyz -> x*y*z
    let prevRhs = '';
    while (prevRhs !== rhs) {
      prevRhs = rhs;
      rhs = rhs.replace(/\b([a-zA-Z])([a-zA-Z])\b/g, '$1*$2');
    }
    // Also normalize implicit mult in LHS if LHS is an expression like 2x + 3z (not f(x) or s(x,y))
    let cleanLhs = lhs;
    if (!/^[a-zA-Z][a-zA-Z0-9_]*\s*\(/.test(lhs.trim())) {
      cleanLhs = cleanLhs.replace(/\b([a-zA-Z])\s*\(/g, '$1*(');
      let prevLhs = '';
      while (prevLhs !== cleanLhs) {
        prevLhs = cleanLhs;
        cleanLhs = cleanLhs.replace(/\b([a-zA-Z])([a-zA-Z])\b/g, '$1*$2');
      }
    }
    masked = cleanLhs + rhs;
  } else {
    // Pure expression or CAS command
    masked = masked.replace(/\b([a-zA-Z])\s*(?=@@FN)/g, '$1*');
    let prevM = '';
    while (prevM !== masked) {
      prevM = masked;
      masked = masked.replace(/\b([a-zA-Z])([a-zA-Z])\b/g, '$1*$2');
    }
  }

  // Restore protected tokens
  masked = masked.replace(/@@FN(\d+)@@/g, (_, idx) => tokens[Number(idx)]);
  // Giac uses ln() for natural log
  return masked;
}

/**
 * Prettify Giac's raw `latex(...)` string into clean textbook standard mathematical LaTeX.
 */
export function prettifyGiacLatex(rawTex) {
  if (!rawTex) return '';
  let tex = String(rawTex).trim();

  // Strip surrounding double quotes returned by Giac latex()
  if (tex.startsWith('"') && tex.endsWith('"')) {
    tex = tex.slice(1, -1);
  }

  // Unescape double backslashes if any
  tex = tex
    // Remove \cdot between number/closing-delim and variable/\sqrt/\left/(/\pi/e/\sin/\cos...
    .replace(/\\cdot\s*(?=[a-zA-Z\\(])/g, ' ')
    .replace(/(\)|\}|\d)\s*\\cdot\s*(?=[a-zA-Z\\(])/g, '$1 ')
    // Clean \frac{-a}{b} -> -\frac{a}{b}
    .replace(/\\frac\{-([^{}]+)\}\{([^{}]+)\}/g, '-\\frac{$1}{$2}')
    // Clean redundant outer parens in numerator/denominator: \frac{(x+1)}{2} -> \frac{x+1}{2}
    .replace(/\\frac\{\(([^()]+)\)\}\{([^{}]+)\}/g, '\\frac{$1}{$2}')
    .replace(/\\frac\{([^{}]+)\}\{\(([^()]+)\)\}/g, '\\frac{$1}{$2}')
    // Clean .000000 in approx outputs
    .replace(/(\d+)\.0+\b/g, '$1')
    .trim();

  return tex;
}

/**
 * Substitute slider parameters (e.g., { a: 1.5, k: -2 }) into a Giac expression as exact rationals!
 * Converting decimals like 1.5 -> 3/2 preserves Giac's 100% exact symbolic calculation!
 */
export function decimalToExactRational(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return '0';
  if (Number.isInteger(num)) return String(num);
  const str = num.toFixed(6).replace(/0+$/, '');
  const parts = str.split('.');
  if (parts.length === 1) return parts[0];
  const decLen = parts[1].length;
  const denom = Math.pow(10, decLen);
  const numer = Math.round(num * denom);
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(Math.abs(numer), denom);
  return `(${numer / g}/${denom / g})`;
}

export function applyParamsToExpr(expr, params = {}) {
  let out = expr;
  const entries = Object.entries(params);
  if (!entries.length) return out;
  for (const [name, val] of entries) {
    if (name === 'x' || name === 'y' || name === 'z') continue;
    const rat = decimalToExactRational(val);
    const re = new RegExp(`\\b${name}\\b`, 'g');
    out = out.replace(re, rat);
  }
  return out;
}

/**
 * Safe Giac latex helper for a Giac expression string.
 */
export function giacToLatex(giacExpr) {
  if (!giacExpr || giacExpr === 'undef' || giacExpr.includes('Error')) {
    return giacExpr || '';
  }
  // Handle Giac's KhiCAS dual output like "-1/6=-0.16666667"
  let cleanExpr = giacExpr;
  if (cleanExpr.includes('=') && !cleanExpr.startsWith('list[') && !cleanExpr.startsWith('[')) {
    const parts = cleanExpr.split('=');
    if (parts.length === 2 && /^-?\d+\.\d+/.test(parts[1].trim())) {
      cleanExpr = parts[0].trim();
    }
  }
  const raw = giacEvalRaw(`latex(${cleanExpr})`);
  if (raw.includes('Error') || raw === '""') {
    return prettifyGiacLatex(cleanExpr);
  }
  return prettifyGiacLatex(raw);
}

/**
 * Parse a user input line into one of 4 object types:
 * 1. 'slider'   : e.g. `a = 2` (single letter != x,y assigned to constant)
 * 2. 'explicit' : e.g. `f(x) = x^3 - 3x + 1` or `y = x^2 - 2` or bare `x^3 - 3x`
 * 3. 'implicit' : e.g. `x^2 + y^2 = 8` or `c1: x^2/4 + y^2/9 = 1`
 * 4. 'cas'      : e.g. `factor(x^4 - 5x^2 + 4)`, `solve(...)`, `diff(...)`, `int(...)`, `limit(...)`
 */
export function classifyUserInput(rawInput, existingParams = {}) {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) return null;

  // Optional label prefix like "c1: x^2 + y^2 = 8"
  let explicitLabel = null;
  let body = trimmed;
  const colonMatch = body.match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*(.+)$/);
  if (colonMatch) {
    explicitLabel = colonMatch[1];
    body = colonMatch[2].trim();
  }

  const normalized = normalizeMathInput(body);

  // Check CAS command call at top level without '=' outside parens
  const casHeadMatch = normalized.match(
    /^(factor|expand|simplify|partfrac|canonical_form|diff|int|solve|zeros|extrema|limit|taylor|csolve|fsolve|desolve|laplace|ilaplace|residue|egvl|egv|jordan|svd|rref|det|gramschmidt|curl|divergence|hessian|gbasis)\s*\(/i
  );
  if (casHeadMatch) {
    return {
      kind: 'cas',
      label: explicitLabel,
      rawInput: trimmed,
      giacExpr: normalized
    };
  }

  // Assignment / Equation check (handle single '=' outside brackets/parens)
  const cleanEq = normalized.replace(/:=/g, '=');
  const eqPos = cleanEq.indexOf('=');

  if (eqPos > 0 && cleanEq.indexOf('=', eqPos + 1) === -1) {
    const lhs = cleanEq.slice(0, eqPos).trim();
    const rhs = cleanEq.slice(eqPos + 1).trim();

    // Case U1: University 3D Matrix Linear Transformation e.g. M = [[2,1,0],[1,2,0],[0,0,1]]
    if (/^[A-Z][a-zA-Z0-9_]*$/.test(lhs) && rhs.startsWith('[[')) {
      return {
        kind: 'matrix3d',
        label: explicitLabel || lhs,
        rawInput: trimmed,
        matrixExpr: rhs
      };
    }

    // Case U2: University Differential Geometry Space Curve r(t) = [cos(t), sin(t), t/2]
    const curve3dMatch = lhs.match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*\(\s*t\s*\)$/);
    if (curve3dMatch && rhs.startsWith('[') && rhs.endsWith(']')) {
      return {
        kind: 'spacecurve3d',
        label: explicitLabel || curve3dMatch[1],
        rawInput: trimmed,
        vecExpr: rhs
      };
    }

    // Case U3: University 3D Vector Field F(x, y, z) = [-y, x, z/2]
    const vfMatch = lhs.match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*\(\s*x\s*,\s*y\s*,\s*z\s*\)$/);
    if (vfMatch && rhs.startsWith('[') && rhs.endsWith(']')) {
      return {
        kind: 'vectorfield3d',
        label: explicitLabel || vfMatch[1],
        rawInput: trimmed,
        vecExpr: rhs
      };
    }

    // Case P: Symbolic 2D or 3D Point e.g. A = (1, 2) or P = (1/2, sqrt(2), 3)
    if (/^[A-Z][a-zA-Z0-9_]*$/.test(lhs) && rhs.startsWith('(') && rhs.endsWith(')')) {
      const inner = rhs.slice(1, -1);
      const parts = inner.split(',');
      if (parts.length === 2 || parts.length === 3) {
        return {
          kind: parts.length === 3 ? 'point3d' : 'point',
          label: explicitLabel || lhs,
          rawInput: trimmed,
          coordsExpr: parts.map((p) => p.trim())
        };
      }
    }

    // Case A: Slider parameter e.g. a = 1.5 (single letter other than x, y, z, e, i)
    if (/^[a-df-hj-wA-Z]$/.test(lhs) && /^[-+]?\d+(\.\d+)?(\/\d+)?$/.test(rhs)) {
      const val = Function(`"use strict"; return (${rhs});`)();
      if (Number.isFinite(val)) {
        return {
          kind: 'slider',
          name: lhs,
          value: val,
          min: Math.min(-5, Math.floor(val - 3)),
          max: Math.max(5, Math.ceil(val + 3)),
          step: Number.isInteger(val) ? 0.1 : 0.05,
          rawInput: trimmed
        };
      }
    }

    // Case B1: 3D Explicit Surface s(x, y) = ...
    const fn3dMatch = lhs.match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*\(\s*x\s*,\s*y\s*\)$/);
    if (fn3dMatch && !/\bz\b/.test(rhs)) {
      return {
        kind: 'surface3d',
        label: explicitLabel || fn3dMatch[1],
        rawInput: trimmed,
        rhsExpr: rhs
      };
    }

    // Case B2: Equations containing 'z' -> 3D Plane, 3D Explicit Surface, or 3D Implicit Quadric/Surface
    if (/\bz\b/.test(cleanEq)) {
      const isNonLinear =
        /\^|\b(sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|sqrt|exp|ln|log|abs)\b|[xyz]\s*\*\s*[xyz]|\/\s*\(?[^()]*[xyz]/i.test(
          `${lhs} ${rhs}`
        );

      if (!isNonLinear) {
        return {
          kind: 'plane3d',
          label: explicitLabel || null,
          rawInput: trimmed,
          lhsExpr: lhs,
          rhsExpr: rhs
        };
      }

      if (lhs === 'z' && !/\bz\b/.test(rhs)) {
        return {
          kind: 'surface3d',
          label: explicitLabel || null,
          rawInput: trimmed,
          rhsExpr: rhs
        };
      }

      return {
        kind: 'implicit3d',
        label: explicitLabel || null,
        rawInput: trimmed,
        lhsExpr: lhs,
        rhsExpr: rhs,
        zeroExpr: `(${lhs})-(${rhs})`
      };
    }

    // Case B: Function definition f(x) = ... or y = ...
    const fnMatch = lhs.match(/^([a-zA-Z][a-zA-Z0-9_]*)\s*\(\s*x\s*\)$/);
    if (fnMatch && !/\by\b/.test(rhs)) {
      return {
        kind: 'explicit',
        label: explicitLabel || fnMatch[1],
        rawInput: trimmed,
        rhsExpr: rhs
      };
    }
    if (lhs === 'y' && !/\by\b/.test(rhs)) {
      return {
        kind: 'explicit',
        label: explicitLabel || null,
        rawInput: trimmed,
        rhsExpr: rhs
      };
    }

    // Case C: Implicit curve in x and y (e.g. x^2 + y^2 = 10, y^2 = 4*x, x = 3)
    return {
      kind: 'implicit',
      label: explicitLabel || null,
      rawInput: trimmed,
      lhsExpr: lhs,
      rhsExpr: rhs,
      equationExpr: `${lhs}=(${rhs})`,
      zeroExpr: `(${lhs})-(${rhs})`
    };
  }

  // Bare expression: if it contains 'x', treat as explicit function y = expr; else evaluate as CAS!
  if (/\bx\b/.test(normalized) && !/\by\b/.test(normalized)) {
    return {
      kind: 'explicit',
      label: explicitLabel || null,
      rawInput: trimmed,
      rhsExpr: normalized
    };
  }

  return {
    kind: 'cas',
    label: explicitLabel,
    rawInput: trimmed,
    giacExpr: normalized
  };
}

/**
 * Compile a Giac algebraic expression into a fast native JavaScript evaluator `(x, y, params) => number`
 * for 60fps Canvas rendering & Marching Squares contour extraction.
 */
export function compileFastEvaluator(giacExpr) {
  if (!giacExpr) return () => NaN;
  let js = String(giacExpr)
    .replace(/\^/g, '**')
    .replace(/\bpi\b/g, 'Math.PI')
    .replace(/\bsqrt\s*\(/g, 'Math.sqrt(')
    .replace(/\babs\s*\(/g, 'Math.abs(')
    .replace(/\bexp\s*\(/g, 'Math.exp(')
    .replace(/\bln\s*\(/g, 'Math.log(')
    .replace(/\blog10\s*\(/g, 'Math.log10(')
    .replace(/\blog\s*\(/g, 'Math.log(')
    .replace(/\bsin\s*\(/g, 'Math.sin(')
    .replace(/\bcos\s*\(/g, 'Math.cos(')
    .replace(/\btan\s*\(/g, 'Math.tan(')
    .replace(/\basin\s*\(/g, 'Math.asin(')
    .replace(/\barcsin\s*\(/g, 'Math.asin(')
    .replace(/\bacos\s*\(/g, 'Math.acos(')
    .replace(/\barccos\s*\(/g, 'Math.acos(')
    .replace(/\batan\s*\(/g, 'Math.atan(')
    .replace(/\barctan\s*\(/g, 'Math.atan(')
    .replace(/\bsinh\s*\(/g, 'Math.sinh(')
    .replace(/\bcosh\s*\(/g, 'Math.cosh(')
    .replace(/\btanh\s*\(/g, 'Math.tanh(');

  // In JS, `-x**2` is a SyntaxError unless parenthesized as `-(x**2)`!
  // Let's ask Giac or safely handle unary minus before power:
  // Replacing `([a-zA-Z0-9_.)]+)\*\*([a-zA-Z0-9_.(]+)` with `Math.pow($1, $2)` avoids JS's unary `-x**2` SyntaxError completely!
  let prev = '';
  while (prev !== js && js.includes('**')) {
    prev = js;
    js = js.replace(
      /(\([^()]*\)|Math\.[a-zA-Z0-9_]+\([^()]*\)|[a-zA-Z0-9_.]+)\s*\*\*\s*(\([^()]*\)|[-+]?[a-zA-Z0-9_.]+)/g,
      'Math.pow($1, $2)'
    );
  }

  try {
    const fn = new Function(
      'x',
      'y',
      'params',
      `"use strict";
       const p = params || {};
       with (p) {
         return (${js});
       }`
    );
    // Note: strict mode forbids `with`, so let's destructure dynamic params cleanly without strict mode or via Object keys!
    void fn;
  } catch (_) {
    // Fallback below without `with`!
  }

  return function evaluatePoint(x, y = 0, params = {}) {
    try {
      const paramNames = Object.keys(params).filter((k) => k !== 'x' && k !== 'y');
      const paramVals = paramNames.map((k) => params[k]);
      const runner = new Function('x', 'y', ...paramNames, `return (${js});`);
      const v = runner(x, y, ...paramVals);
      return typeof v === 'number' ? v : Number(v);
    } catch {
      return NaN;
    }
  };
}

/**
 * Compile a cached high-speed evaluator for a fixed set of parameter names (zero `new Function` inside loop!).
 */
export function buildCompiledEvaluator(giacExpr, paramNames = []) {
  if (!giacExpr) return () => NaN;
  let js = String(giacExpr)
    .replace(/\bpi\b/g, 'Math.PI')
    .replace(/\bsqrt\s*\(/g, 'Math.sqrt(')
    .replace(/\babs\s*\(/g, 'Math.abs(')
    .replace(/\bexp\s*\(/g, 'Math.exp(')
    .replace(/\bln\s*\(/g, 'Math.log(')
    .replace(/\blog10\s*\(/g, 'Math.log10(')
    .replace(/\blog\s*\(/g, 'Math.log(')
    .replace(/\bsin\s*\(/g, 'Math.sin(')
    .replace(/\bcos\s*\(/g, 'Math.cos(')
    .replace(/\btan\s*\(/g, 'Math.tan(')
    .replace(/\basin\s*\(/g, 'Math.asin(')
    .replace(/\barcsin\s*\(/g, 'Math.asin(')
    .replace(/\bacos\s*\(/g, 'Math.acos(')
    .replace(/\barccos\s*\(/g, 'Math.acos(')
    .replace(/\batan\s*\(/g, 'Math.atan(')
    .replace(/\barctan\s*\(/g, 'Math.atan(')
    .replace(/\bsinh\s*\(/g, 'Math.sinh(')
    .replace(/\bcosh\s*\(/g, 'Math.cosh(')
    .replace(/\btanh\s*\(/g, 'Math.tanh(')
    .replace(/\^/g, '**');

  let prev = '';
  while (prev !== js && js.includes('**')) {
    prev = js;
    js = js.replace(
      /(\([^()]*\)|Math\.[a-zA-Z0-9_]+\([^()]*\)|[a-zA-Z0-9_.]+)\s*\*\*\s*(\([^()]*\)|[-+]?[a-zA-Z0-9_.]+)/g,
      'Math.pow($1, $2)'
    );
  }

  const cleanParams = paramNames.filter((k) => k !== 'x' && k !== 'y' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k));
  try {
    const fn = new Function('x', 'y', ...cleanParams, `"use strict"; return (${js});`);
    return (x, y = 0, params = {}) => {
      try {
        const args = cleanParams.map((k) => (params[k] !== undefined ? params[k] : 1));
        const res = fn(x, y, ...args);
        return typeof res === 'number' ? res : Number(res);
      } catch {
        return NaN;
      }
    };
  } catch {
    return () => NaN;
  }
}

export function stripKhicasApprox(str) {
  if (!str) return '';
  const s = String(str).trim();
  if (s.startsWith('list[') || s.startsWith('[')) return s;
  const m = s.match(/^([^=]+)=\s*[-+]?\d+\.\d+(?:e[-+]?\d+)?$/i);
  return m ? m[1].trim() : s;
}

/**
 * Helper: Extract elements of a 1D Giac list variable `_tmpL` safely.
 */
function readGiac1DList(varName) {
  const nStr = giacEvalRaw(`size(${varName})`);
  const n = parseInt(nStr, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 30) return [];
  const items = [];
  for (let i = 0; i < n; i++) {
    const exact = stripKhicasApprox(giacEvalRaw(`simplify(${varName}[${i}])`));
    if (!exact || exact.includes('undef') || /\bi\b/.test(exact)) continue;
    const numStr = giacEvalRaw(`evalf(${varName}[${i}], 14)`);
    const num = parseFloat(numStr);
    if (!Number.isFinite(num)) continue;
    const latex = giacToLatex(exact);
    items.push({ exact, latex, num });
  }
  return items;
}

/**
 * Evaluate a general CAS command (factor, diff, int, solve, limit, taylor, etc.).
 */
export function evaluateCASCommand(rawExpr, params = {}) {
  const t0 = performance.now();
  const normalized = normalizeMathInput(rawExpr);
  const substituted = applyParamsToExpr(normalized, params);

  // Handle KhiCAS dual output (e.g. limit returning "-1/6=-0.1666667")
  const varId = `zzcas${++evalCounter}`;
  let rawOut = giacEvalRaw(`${varId} := ${substituted}`);
  if (rawOut.includes('=') && !substituted.startsWith('solve')) {
    const parts = rawOut.split('=');
    if (parts.length === 2 && /^-?\d+\.\d+/.test(parts[1].trim())) {
      rawOut = parts[0].trim();
    }
  }

  const exactLatex = giacToLatex(varId);
  const approxOut = giacEvalRaw(`evalf(${varId}, 8)`);
  giacEvalRaw(`purge(${varId})`);

  const durationMs = Math.max(1, Math.round(performance.now() - t0));
  return {
    normalized,
    exact: rawOut,
    latex: exactLatex,
    approx: approxOut,
    durationMs
  };
}

/**
 * Full Symbolic Analysis of an Explicit Function y = f(x):
 * - Multiple symbolic representations (exact, factored, expanded, canonical/partial-fraction, f', f'', antiderivative, decimal)
 * - Symbolic Roots (solve(f(x)=0, x))
 * - Symbolic Extrema (solve(f'(x)=0, x) + rigorous sign-change classification)
 * - Symbolic Inflection Points (solve(f''(x)=0, x) + rigorous sign-change verification, catching x^4 counterexamples!)
 */
export function analyzeExplicitFunction(rhsExpr, params = {}, computeSpecialPoints = true) {
  const t0 = performance.now();
  const subExpr = applyParamsToExpr(rhsExpr, params);
  const id = `zzfn${++evalCounter}`;

  giacEvalRaw(`${id} := ${subExpr}`);
  const simplified = giacEvalRaw(`simplify(${id})`);
  const expanded = giacEvalRaw(`expand(${id})`);
  const factored = giacEvalRaw(`factor(${id})`);

  // Check if rational or quadratic for canonical / partial-fraction form
  const denom = giacEvalRaw(`denom(simplify(${id}))`);
  let specialFormLabel = t('Canonical', '표준형');
  let specialFormExpr = simplified;
  if (denom !== '1' && /\bx\b/.test(denom)) {
    specialFormLabel = t('Part. Frac', '부분분수');
    specialFormExpr = giacEvalRaw(`partfrac(${id}, x)`);
  } else {
    const degStr = giacEvalRaw(`degree(${expanded}, x)`);
    if (degStr === '2') {
      specialFormLabel = t('Vertex Form', '완전제곱(표준형)');
      specialFormExpr = giacEvalRaw(`canonical_form(${id}, x)`);
    } else {
      specialFormLabel = t('Normal', '정리식');
      specialFormExpr = giacEvalRaw(`normal(${id})`);
    }
  }

  const d1 = giacEvalRaw(`simplify(diff(${id}, x))`);
  const d2 = giacEvalRaw(`simplify(diff(${id}, x, 2))`);
  const integ = giacEvalRaw(`simplify(int(${id}, x))`);
  const approxExpr = giacEvalRaw(`evalf(${simplified}, 6)`);

  const forms = {
    exact: { label: t('Exact', '정확식'), expr: simplified, latex: giacToLatex(simplified) },
    factored: { label: t('Factored', '인수분해'), expr: factored, latex: giacToLatex(factored) },
    expanded: { label: t('Expanded', '전개식'), expr: expanded, latex: giacToLatex(expanded) },
    special: { label: specialFormLabel, expr: specialFormExpr, latex: giacToLatex(specialFormExpr) },
    diff1: { label: t("f'(x)", "도함수 f'(x)"), expr: d1, latex: giacToLatex(d1) },
    diff2: { label: t("f''(x)", "이계도함수 f''(x)"), expr: d2, latex: giacToLatex(d2) },
    integral: { label: t('∫f dx', '부정적분 ∫f dx'), expr: integ, latex: `${giacToLatex(integ)} + C` },
    approx: { label: t('Decimal', '소수 근사'), expr: approxExpr, latex: prettifyGiacLatex(approxExpr) }
  };

  const roots = [];
  const extrema = [];
  const inflections = [];
  const nonInflectionWarnings = [];

  if (computeSpecialPoints) {
    // 1. Symbolic Roots: solve(f(x) = 0, x)
    const rVar = `zzrt${evalCounter}`;
    giacEvalRaw(`${rVar} := simplify(solve(${id} = 0, x))`);
    const rList = readGiac1DList(rVar);
    for (const r of rList) {
      // Verify f(r) is genuinely ~0 (not extraneous pole)
      const checkVal = parseFloat(giacEvalRaw(`evalf(subst(${id}, x=${r.exact}), 12)`));
      if (Number.isFinite(checkVal) && Math.abs(checkVal) < 1e-5) {
        roots.push({
          kind: 'root',
          badge: t('Root', '영점'),
          exactX: r.exact,
          exactY: '0',
          latexCoord: `\\left(${r.latex},\\, 0\\right)`,
          x: r.num,
          y: 0
        });
      }
    }
    giacEvalRaw(`purge(${rVar})`);

    // 2. Symbolic Extrema: solve(f'(x) = 0, x) + first-derivative sign change check!
    const eVar = `zzex${evalCounter}`;
    giacEvalRaw(`${eVar} := simplify(solve((${d1}) = 0, x))`);
    const eCands = readGiac1DList(eVar);
    // Compute safe epsilon smaller than half minimum gap between critical points
    const sortedExNums = eCands.map((c) => c.num).sort((a, b) => a - b);
    let eps1 = 0.02;
    for (let i = 1; i < sortedExNums.length; i++) {
      const gap = sortedExNums[i] - sortedExNums[i - 1];
      if (gap > 1e-7) eps1 = Math.min(eps1, gap * 0.25);
    }

    for (const c of eCands) {
      const yExact = stripKhicasApprox(giacEvalRaw(`simplify(subst(${id}, x=(${c.exact})))`));
      const yNum = parseFloat(giacEvalRaw(`evalf(${yExact}, 14)`));
      if (!Number.isFinite(yNum)) continue;

      const leftSlope = parseFloat(giacEvalRaw(`evalf(subst(${d1}, x=${c.num - eps1}), 10)`));
      const rightSlope = parseFloat(giacEvalRaw(`evalf(subst(${d1}, x=${c.num + eps1}), 10)`));
      if (!Number.isFinite(leftSlope) || !Number.isFinite(rightSlope)) continue;

      if (leftSlope > 1e-9 && rightSlope < -1e-9) {
        const yTex = giacToLatex(yExact);
        extrema.push({
          kind: 'max',
          badge: t('Max', '극대'),
          exactX: c.exact,
          exactY: yExact,
          latexCoord: `\\left(${c.latex},\\, ${yTex}\\right)`,
          x: c.num,
          y: yNum
        });
      } else if (leftSlope < -1e-9 && rightSlope > 1e-9) {
        const yTex = giacToLatex(yExact);
        extrema.push({
          kind: 'min',
          badge: t('Min', '극소'),
          exactX: c.exact,
          exactY: yExact,
          latexCoord: `\\left(${c.latex},\\, ${yTex}\\right)`,
          x: c.num,
          y: yNum
        });
      }
    }
    giacEvalRaw(`purge(${eVar})`);

    // 3. Symbolic Inflection Points: solve(f''(x) = 0, x) + symbolic k-th derivative Taylor parity test!
    const iVar = `zzinf${evalCounter}`;
    giacEvalRaw(`${iVar} := simplify(solve((${d2}) = 0, x))`);
    const iCands = readGiac1DList(iVar);

    for (const c of iCands) {
      const yExact = stripKhicasApprox(giacEvalRaw(`simplify(subst(${id}, x=(${c.exact})))`));
      const yNum = parseFloat(giacEvalRaw(`evalf(${yExact}, 14)`));
      if (!Number.isFinite(yNum)) continue;
      const yTex = giacToLatex(yExact);

      // Successively differentiate exact(f)^(k)(x) for k = 3..12 to find lowest nonzero derivative order k*
      let lowestOrder = null;
      const exactId = `exact(${id})`;
      for (let k = 3; k <= 12; k++) {
        const dkVal = stripKhicasApprox(giacEvalRaw(`simplify(subst(diff(${exactId}, x, ${k}), x=(${c.exact})))`));
        if (!dkVal || /undef|infinity|error/i.test(dkVal)) {
          break;
        }
        if (!/^[-+]?0(\.0*)?$/.test(dkVal)) {
          const diffZero = stripKhicasApprox(giacEvalRaw(`simplify((${dkVal}) - 0)`));
          if (!/^[-+]?0(\.0*)?$/.test(diffZero)) {
            lowestOrder = k;
            break;
          }
        }
      }

      let isTrueInflection = false;
      let isEvenFlatNonInflection = false;
      if (lowestOrder !== null) {
        if (lowestOrder % 2 === 1) {
          isTrueInflection = true;
        } else {
          isEvenFlatNonInflection = true;
        }
      } else {
        // Exact rational offset sign fallback at c.exact ∓ 1/1000 for non-analytic expressions (e.g., x^(7/3))
        const sLeft = parseFloat(giacEvalRaw(`evalf(sign(subst(${d2}, x=(${c.exact})-1/1000)), 8)`));
        const sRight = parseFloat(giacEvalRaw(`evalf(sign(subst(${d2}, x=(${c.exact})+1/1000)), 8)`));
        if (Number.isFinite(sLeft) && Number.isFinite(sRight)) {
          if (sLeft * sRight < 0) isTrueInflection = true;
          else if (sLeft * sRight > 0) isEvenFlatNonInflection = true;
        }
      }

      if (isTrueInflection) {
        inflections.push({
          kind: 'inflection',
          badge: t('Inflect', '변곡점'),
          exactX: c.exact,
          exactY: yExact,
          lowestNonzeroOrder: lowestOrder,
          latexCoord: `\\left(${c.latex},\\, ${yTex}\\right)`,
          x: c.num,
          y: yNum
        });
      } else if (isEvenFlatNonInflection) {
        nonInflectionWarnings.push({
          exactX: c.exact,
          latexX: c.latex,
          lowestNonzeroOrder: lowestOrder,
          latexCoord: `\\left(${c.latex},\\, ${yTex}\\right)`,
          reason: lowestOrder
            ? t(
                `f''(x)=0, but lowest nonzero derivative order k*=${lowestOrder} (even) preserves concavity (not an inflection point)`,
                `f''(x)=0 이나 최초 비영 고계도함수 차수 k*=${lowestOrder}(짝수)로 오목·볼록 부호가 바뀌지 않아 변곡점이 아님`
              )
            : t(
                "f''(x)=0 without concavity sign reversal (not an inflection point)",
                "f''(x)=0 이나 좌우 오목·볼록 부호가 바뀌지 않아 변곡점이 아님"
              )
        });
      }
    }
    giacEvalRaw(`purge(${iVar})`);
  }

  giacEvalRaw(`purge(${id})`);

  const durationMs = Math.max(1, Math.round(performance.now() - t0));
  return {
    simplified,
    forms,
    roots,
    extrema,
    inflections,
    nonInflectionWarnings,
    durationMs
  };
}

/**
 * Analyze an Implicit Equation F(x, y) = G(x, y):
 */
export function analyzeImplicitEquation(lhsExpr, rhsExpr, params = {}) {
  const t0 = performance.now();
  const subL = applyParamsToExpr(lhsExpr, params);
  const subR = applyParamsToExpr(rhsExpr, params);
  const zeroSimplified = giacEvalRaw(`simplify((${subL}) - (${subR}))`);
  const lhsTex = giacToLatex(giacEvalRaw(`simplify(${subL})`));
  const rhsTex = giacToLatex(giacEvalRaw(`simplify(${subR})`));
  const expandedZero = giacEvalRaw(`expand((${subL}) - (${subR}))`);

  return {
    zeroSimplified,
    equationLatex: `${lhsTex} = ${rhsTex}`,
    expandedLatex: `${giacToLatex(expandedZero)} = 0`,
    durationMs: Math.max(1, Math.round(performance.now() - t0))
  };
}

/**
 * Exact Symbolic Curve-Curve Intersection via Giac WASM:
 * Solves [eqA, eqB] symbolically over R, keeping fractions & radicals (sqrt) intact!
 */
export function solveSymbolicIntersections(objA, objB, params = {}) {
  const t0 = performance.now();
  const eqA = objA.kind === 'explicit'
    ? `y=(${applyParamsToExpr(objA.rhsExpr, params)})`
    : `(${applyParamsToExpr(objA.lhsExpr, params)})=(${applyParamsToExpr(objA.rhsExpr, params)})`;
  const eqB = objB.kind === 'explicit'
    ? `y=(${applyParamsToExpr(objB.rhsExpr, params)})`
    : `(${applyParamsToExpr(objB.lhsExpr, params)})=(${applyParamsToExpr(objB.rhsExpr, params)})`;

  const sVar = `zzint${++evalCounter}`;
  giacEvalRaw(`${sVar} := simplify(solve([${eqA}, ${eqB}], [x, y]))`);
  const nStr = giacEvalRaw(`size(${sVar})`);
  const n = parseInt(nStr, 10);

  const points = [];
  if (Number.isFinite(n) && n > 0 && n <= 32) {
    for (let i = 0; i < n; i++) {
      const exactX = stripKhicasApprox(giacEvalRaw(`simplify(${sVar}[${i}][0])`));
      const exactY = stripKhicasApprox(giacEvalRaw(`simplify(${sVar}[${i}][1])`));
      if (!exactX || !exactY || exactX.includes('undef') || exactY.includes('undef')) continue;
      if (/\bi\b/.test(exactX) || /\bi\b/.test(exactY)) continue;

      const xNum = parseFloat(giacEvalRaw(`evalf(${exactX}, 14)`));
      const yNum = parseFloat(giacEvalRaw(`evalf(${exactY}, 14)`));
      if (!Number.isFinite(xNum) || !Number.isFinite(yNum)) continue;

      const texX = giacToLatex(exactX);
      const texY = giacToLatex(exactY);

      points.push({
        kind: 'intersection',
        badge: t('Intersect', '교점'),
        exactX,
        exactY,
        latexX: texX,
        latexY: texY,
        latexCoord: `\\left(${texX},\\, ${texY}\\right)`,
        x: xNum,
        y: yNum,
        hasRadicalOrFraction: /sqrt|\//.test(`${exactX} ${exactY}`)
      });
    }
  }
  giacEvalRaw(`purge(${sVar})`);

  // Sort left-to-right by x, then y
  points.sort((a, b) => (Math.abs(a.x - b.x) > 1e-9 ? a.x - b.x : a.y - b.y));

  // Also run a coarse naive grid sign-change detector (like legacy numerical engines) when both are explicit,
  // to highlight cases where numerical methods miss tangent intersections (e.g., (x-1)^2 = 0) or give rounding error!
  let numericalComparisonNote = null;
  if (objA.kind === 'explicit' && objB.kind === 'explicit' && points.length > 0) {
    const fnA = buildCompiledEvaluator(applyParamsToExpr(objA.rhsExpr, params), []);
    const fnB = buildCompiledEvaluator(applyParamsToExpr(objB.rhsExpr, params), []);
    // Check if any intersection is a tangency (even multiplicity, no sign change!)
    let tangentTouchDetected = false;
    for (const pt of points) {
      const dLeft = fnA(pt.x - 0.05) - fnB(pt.x - 0.05);
      const dRight = fnA(pt.x + 0.05) - fnB(pt.x + 0.05);
      if (dLeft * dRight > 1e-9) {
        tangentTouchDetected = true;
      }
    }
    if (tangentTouchDetected) {
      numericalComparisonNote = t(
        'Tangential touch (no sign reversal): Certified symbolically by Giac where numerical bracketing fails.',
        '접하는 교점(부호 불변): 기존 단순 수치해석(이분법)이 놓치기 쉬운 접점까지 Giac 대수 엔진이 정확히 검출했습니다.'
      );
    } else if (points.some((p) => p.hasRadicalOrFraction)) {
      numericalComparisonNote = t(
        'Exact radical (√) and rational symbolic coordinates preserved without rounding error.',
        '근삿값 오차 없이 무리수(√)·기약분수 대수적 표현을 그대로 보존합니다.'
      );
    }
  }

  return {
    points,
    numericalComparisonNote,
    durationMs: Math.max(1, Math.round(performance.now() - t0))
  };
}

/**
 * Construct Exact Symbolic Tangent Line to explicit y = f(x) at x = x0Exact:
 * y = f'(x0) * (x - x0) + f(x0)
 */
export function constructExactTangentLine(rhsExpr, x0Exact, params = {}) {
  const t0 = performance.now();
  const subExpr = applyParamsToExpr(rhsExpr, params);
  const id = `zztg${++evalCounter}`;
  giacEvalRaw(`${id} := ${subExpr}`);
  const y0Exact = stripKhicasApprox(giacEvalRaw(`simplify(subst(${id}, x=(${x0Exact})))`));
  const slopeExact = stripKhicasApprox(giacEvalRaw(`simplify(subst(diff(${id}, x), x=(${x0Exact})))`));
  const lineRhs = stripKhicasApprox(giacEvalRaw(`simplify((${slopeExact}) * (x - (${x0Exact})) + (${y0Exact}))`));
  const x0Num = parseFloat(giacEvalRaw(`evalf(${x0Exact}, 14)`));
  const y0Num = parseFloat(giacEvalRaw(`evalf(${y0Exact}, 14)`));
  giacEvalRaw(`purge(${id})`);

  const texX0 = giacToLatex(x0Exact);
  const texY0 = giacToLatex(y0Exact);
  const lineTex = giacToLatex(lineRhs);

  return {
    lineRhs,
    lineLatex: `y = ${lineTex}`,
    slopeExact,
    slopeLatex: giacToLatex(slopeExact),
    point: {
      kind: 'tangentPoint',
      badge: t('Tangent', '접점'),
      exactX: String(x0Exact),
      exactY: y0Exact,
      latexCoord: `\\left(${texX0},\\, ${texY0}\\right)`,
      x: x0Num,
      y: y0Num
    },
    durationMs: Math.max(1, Math.round(performance.now() - t0))
  };
}

/**
 * Compute Exact Symbolic Definite Integral ∫_a^b f(x) dx via Giac WASM
 */
export function computeDefiniteIntegral(rhsExpr, aExact, bExact, params = {}) {
  const t0 = performance.now();
  const normA = normalizeMathInput(String(aExact));
  const normB = normalizeMathInput(String(bExact));
  const subExpr = applyParamsToExpr(rhsExpr, params);
  const id = `zzdi${++evalCounter}`;

  giacEvalRaw(`${id} := simplify(int(${subExpr}, x, ${normA}, ${normB}))`);
  const exact = stripKhicasApprox(giacEvalRaw(`${id}`));
  const latex = giacToLatex(exact);
  const numValue = parseFloat(giacEvalRaw(`evalf(${id}, 14)`));
  const aNum = parseFloat(giacEvalRaw(`evalf(${normA}, 14)`));
  const bNum = parseFloat(giacEvalRaw(`evalf(${normB}, 14)`));
  const aLatex = giacToLatex(stripKhicasApprox(giacEvalRaw(`simplify(${normA})`)));
  const bLatex = giacToLatex(stripKhicasApprox(giacEvalRaw(`simplify(${normB})`)));
  giacEvalRaw(`purge(${id})`);

  return {
    exact,
    latex,
    numValue,
    aNum,
    bNum,
    aLatex,
    bLatex,
    durationMs: Math.max(1, Math.round(performance.now() - t0))
  };
}

/**
 * Compute Exact + Numeric Table of Values (Table View)
 */
export function computeTableOfValues(explicitObjs, startX = -2, endX = 3, stepX = 1, params = {}) {
  const rows = [];
  const safeStep = stepX > 0 ? stepX : 1;
  const maxRows = 25;
  let count = 0;

  for (let x = startX; x <= endX + 1e-9 && count < maxRows; x += safeStep, count++) {
    const cleanX = Math.abs(x) < 1e-12 ? 0 : Number(x.toFixed(6));
    const xRat = decimalToExactRational(cleanX);
    const cells = explicitObjs.map((obj) => {
      const subExpr = applyParamsToExpr(obj.rhsExpr, params);
      const valExact = stripKhicasApprox(giacEvalRaw(`simplify(subst(${subExpr}, x=${xRat}))`));
      if (!valExact || valExact.includes('undef') || valExact.includes('infinity')) {
        return {
          exact: t('Undefined', '정의되지 않음'),
          latex: t('\\text{Undefined}', '\\text{정의 안 됨}'),
          approx: ''
        };
      }
      const num = parseFloat(giacEvalRaw(`evalf(${valExact}, 10)`));
      return {
        exact: valExact,
        latex: giacToLatex(valExact),
        approx: Number.isFinite(num) ? formatCleanNumber(num, 4) : ''
      };
    });
    rows.push({
      x: cleanX,
      xLabel: formatCleanNumber(cleanX, 4),
      cells
    });
  }
  return rows;
}

/**
 * Compile a high-speed 3D JavaScript evaluator `(x, y, z, params) => number`
 */
export function buildCompiledEvaluator3D(giacExpr, paramNames = []) {
  if (!giacExpr) return () => NaN;
  let js = String(giacExpr)
    .replace(/\bpi\b/g, 'Math.PI')
    .replace(/\bsqrt\s*\(/g, 'Math.sqrt(')
    .replace(/\babs\s*\(/g, 'Math.abs(')
    .replace(/\bexp\s*\(/g, 'Math.exp(')
    .replace(/\bln\s*\(/g, 'Math.log(')
    .replace(/\blog10\s*\(/g, 'Math.log10(')
    .replace(/\blog\s*\(/g, 'Math.log(')
    .replace(/\bsin\s*\(/g, 'Math.sin(')
    .replace(/\bcos\s*\(/g, 'Math.cos(')
    .replace(/\btan\s*\(/g, 'Math.tan(')
    .replace(/\basin\s*\(/g, 'Math.asin(')
    .replace(/\bacos\s*\(/g, 'Math.acos(')
    .replace(/\batan\s*\(/g, 'Math.atan(')
    .replace(/\bsinh\s*\(/g, 'Math.sinh(')
    .replace(/\bcosh\s*\(/g, 'Math.cosh(')
    .replace(/\btanh\s*\(/g, 'Math.tanh(')
    .replace(/\^/g, '**');

  let prev = '';
  while (prev !== js && js.includes('**')) {
    prev = js;
    js = js.replace(
      /(\([^()]*\)|Math\.[a-zA-Z0-9_]+\([^()]*\)|[a-zA-Z0-9_.]+)\s*\*\*\s*(\([^()]*\)|[-+]?[a-zA-Z0-9_.]+)/g,
      'Math.pow($1, $2)'
    );
  }

  const cleanParams = paramNames.filter(
    (k) => k !== 'x' && k !== 'y' && k !== 'z' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)
  );
  try {
    const fn = new Function('x', 'y', 'z', ...cleanParams, `"use strict"; return (${js});`);
    return (x, y = 0, z = 0, params = {}) => {
      try {
        const args = cleanParams.map((k) => (params[k] !== undefined ? params[k] : 1));
        const res = fn(x, y, z, ...args);
        return typeof res === 'number' ? res : Number(res);
      } catch {
        return NaN;
      }
    };
  } catch {
    return () => NaN;
  }
}

/**
 * Analyze 3D Explicit Surface z = f(x, y):
 * - Partial derivatives ∂f/∂x, ∂f/∂y
 * - 3D Critical & Saddle Points via Hessian D = f_xx * f_yy - (f_xy)^2
 */
export function analyzeSurface3D(rhsExpr, params = {}) {
  const t0 = performance.now();
  const sub = applyParamsToExpr(rhsExpr, params);
  const id = `zzsf${++evalCounter}`;
  giacEvalRaw(`${id} := simplify(${sub})`);

  const exact = stripKhicasApprox(giacEvalRaw(`${id}`));
  const fx = stripKhicasApprox(giacEvalRaw(`simplify(diff(${id}, x))`));
  const fy = stripKhicasApprox(giacEvalRaw(`simplify(diff(${id}, y))`));
  const fxx = stripKhicasApprox(giacEvalRaw(`simplify(diff(${fx}, x))`));
  const fyy = stripKhicasApprox(giacEvalRaw(`simplify(diff(${fy}, y))`));
  const fxy = stripKhicasApprox(giacEvalRaw(`simplify(diff(${fx}, y))`));

  // Differential Geometry: Exact Symbolic Gaussian Curvature K(x,y) & Mean Curvature H(x,y)
  const gaussK = stripKhicasApprox(
    giacEvalRaw(`simplify(((${fxx})*(${fyy}) - (${fxy})^2) / (1 + (${fx})^2 + (${fy})^2)^2)`)
  );
  const meanH = stripKhicasApprox(
    giacEvalRaw(
      `simplify(((1 + (${fy})^2)*(${fxx}) - 2*(${fx})*(${fy})*(${fxy}) + (1 + (${fx})^2)*(${fyy})) / (2 * (1 + (${fx})^2 + (${fy})^2)^(3/2)))`
    )
  );

  // Solve ∇f = (0, 0) for up to 6 critical/saddle points
  const cVar = `zzsc${evalCounter}`;
  giacEvalRaw(`${cVar} := simplify(solve([(${fx})=0, (${fy})=0], [x, y]))`);
  const n = parseInt(giacEvalRaw(`size(${cVar})`), 10);
  const criticalPoints3D = [];

  if (Number.isFinite(n) && n > 0 && n <= 8) {
    for (let i = 0; i < n; i++) {
      const exX = stripKhicasApprox(giacEvalRaw(`simplify(${cVar}[${i}][0])`));
      const exY = stripKhicasApprox(giacEvalRaw(`simplify(${cVar}[${i}][1])`));
      if (!exX || !exY || /\bi\b/.test(exX) || /\bi\b/.test(exY)) continue;

      const xNum = parseFloat(giacEvalRaw(`evalf(${exX}, 12)`));
      const yNum = parseFloat(giacEvalRaw(`evalf(${exY}, 12)`));
      if (!Number.isFinite(xNum) || !Number.isFinite(yNum)) continue;

      const exZ = stripKhicasApprox(giacEvalRaw(`simplify(subst(${id}, [x=(${exX}), y=(${exY})]))`));
      const zNum = parseFloat(giacEvalRaw(`evalf(${exZ}, 12)`));
      if (!Number.isFinite(zNum)) continue;

      const hessVal = parseFloat(
        giacEvalRaw(`evalf(subst((${fxx})*(${fyy}) - (${fxy})^2, [x=(${exX}), y=(${exY})]), 10)`)
      );
      const fxxVal = parseFloat(giacEvalRaw(`evalf(subst(${fxx}, [x=(${exX}), y=(${exY})]), 10)`));

      let badge = t('Critical', '임계점');
      let kind = 'critical3d';
      if (hessVal < -1e-8) {
        badge = t('Saddle', '안장점(Saddle)');
        kind = 'saddle3d';
      } else if (hessVal > 1e-8) {
        badge = fxxVal < 0 ? t('Local Max', '극대점') : t('Local Min', '극소점');
        kind = fxxVal < 0 ? 'max3d' : 'min3d';
      }

      criticalPoints3D.push({
        kind,
        badge,
        exactX: exX,
        exactY: exY,
        exactZ: exZ,
        latexCoord: `\\left(${giacToLatex(exX)},\\, ${giacToLatex(exY)},\\, ${giacToLatex(exZ)}\\right)`,
        x: xNum,
        y: yNum,
        z: zNum
      });
    }
  }

  giacEvalRaw(`purge(${cVar})`);
  giacEvalRaw(`purge(${id})`);

  return {
    exact,
    latex: giacToLatex(exact),
    fx,
    fy,
    fxLatex: giacToLatex(fx),
    fyLatex: giacToLatex(fy),
    gaussK,
    gaussKLatex: giacToLatex(gaussK),
    meanH,
    meanHLatex: giacToLatex(meanH),
    criticalPoints3D,
    durationMs: Math.max(1, Math.round(performance.now() - t0))
  };
}

/**
 * Construct Exact Symbolic 3D Tangent Plane to z = f(x, y) at (x0, y0)
 */
export function constructTangentPlane3D(rhsExpr, x0Exact, y0Exact, params = {}) {
  const t0 = performance.now();
  const sub = applyParamsToExpr(rhsExpr, params);
  const id = `zztp${++evalCounter}`;
  giacEvalRaw(`${id} := simplify(${sub})`);

  const z0Exact = stripKhicasApprox(giacEvalRaw(`simplify(subst(${id}, [x=(${x0Exact}), y=(${y0Exact})]))`));
  const fx0 = stripKhicasApprox(giacEvalRaw(`simplify(subst(diff(${id}, x), [x=(${x0Exact}), y=(${y0Exact})]))`));
  const fy0 = stripKhicasApprox(giacEvalRaw(`simplify(subst(diff(${id}, y), [x=(${x0Exact}), y=(${y0Exact})]))`));
  const planeRhs = stripKhicasApprox(
    giacEvalRaw(`simplify((${z0Exact}) + (${fx0})*(x - (${x0Exact})) + (${fy0})*(y - (${y0Exact})))`)
  );
  giacEvalRaw(`purge(${id})`);

  return {
    planeEqRaw: `z = ${planeRhs}`,
    planeLatex: `z = ${giacToLatex(planeRhs)}`,
    pointLatex: `\\left(${giacToLatex(x0Exact)},\\, ${giacToLatex(y0Exact)},\\, ${giacToLatex(z0Exact)}\\right)`,
    durationMs: Math.max(1, Math.round(performance.now() - t0))
  };
}

/**
 * Analyze 3D Plane a*x + b*y + c*z = d
 */
export function analyzePlane3D(lhsExpr, rhsExpr, params = {}) {
  const t0 = performance.now();
  const subL = applyParamsToExpr(lhsExpr, params);
  const subR = applyParamsToExpr(rhsExpr, params);
  const id = `zzpl${++evalCounter}`;
  giacEvalRaw(`${id} := simplify((${subL}) - (${subR}))`);

  const aExact = stripKhicasApprox(giacEvalRaw(`simplify(diff(${id}, x))`));
  const bExact = stripKhicasApprox(giacEvalRaw(`simplify(diff(${id}, y))`));
  const cExact = stripKhicasApprox(giacEvalRaw(`simplify(diff(${id}, z))`));
  const dExact = stripKhicasApprox(giacEvalRaw(`simplify(-subst(${id}, [x=0, y=0, z=0]))`));

  const aNum = parseFloat(giacEvalRaw(`evalf(${aExact}, 14)`)) || 0;
  const bNum = parseFloat(giacEvalRaw(`evalf(${bExact}, 14)`)) || 0;
  const cNum = parseFloat(giacEvalRaw(`evalf(${cExact}, 14)`)) || 0;
  const dNum = parseFloat(giacEvalRaw(`evalf(${dExact}, 14)`)) || 0;

  const lhsTex = giacToLatex(stripKhicasApprox(giacEvalRaw(`simplify(${subL})`)));
  const rhsTex = giacToLatex(stripKhicasApprox(giacEvalRaw(`simplify(${subR})`)));
  const normalLatex = `\\vec{n} = \\left(${giacToLatex(aExact)},\\, ${giacToLatex(bExact)},\\, ${giacToLatex(cExact)}\\right)`;

  giacEvalRaw(`purge(${id})`);
  return {
    aExact,
    bExact,
    cExact,
    dExact,
    normal: [aNum, bNum, cNum],
    dNum,
    equationLatex: `${lhsTex} = ${rhsTex}`,
    normalLatex,
    durationMs: Math.max(1, Math.round(performance.now() - t0))
  };
}

/**
 * Analyze 3D Implicit Quadric / Surface F(x, y, z) = G(x, y, z)
 * Automatically detects Spheres to extract exact center & exact radical radius!
 */
export function analyzeImplicit3D(lhsExpr, rhsExpr, params = {}) {
  const t0 = performance.now();
  const subL = applyParamsToExpr(lhsExpr, params);
  const subR = applyParamsToExpr(rhsExpr, params);
  const id = `zzim${++evalCounter}`;
  giacEvalRaw(`${id} := expand((${subL}) - (${subR}))`);

  const cxx = stripKhicasApprox(giacEvalRaw(`simplify(diff(${id}, x, 2)/2)`));
  const cyy = stripKhicasApprox(giacEvalRaw(`simplify(diff(${id}, y, 2)/2)`));
  const czz = stripKhicasApprox(giacEvalRaw(`simplify(diff(${id}, z, 2)/2)`));
  const cxy = stripKhicasApprox(giacEvalRaw(`simplify(diff(diff(${id}, x), y))`));
  const cxz = stripKhicasApprox(giacEvalRaw(`simplify(diff(diff(${id}, x), z))`));
  const cyz = stripKhicasApprox(giacEvalRaw(`simplify(diff(diff(${id}, y), z))`));

  let sphereInfo = null;
  const isConstPos = !/[xyz]/.test(`${cxx} ${cyy} ${czz}`) && cxx === cyy && cyy === czz && cxy === '0' && cxz === '0' && cyz === '0';
  if (isConstPos) {
    const aLead = parseFloat(giacEvalRaw(`evalf(${cxx}, 12)`));
    if (Number.isFinite(aLead) && Math.abs(aLead) > 1e-12) {
      // Normalized x^2 + y^2 + z^2 + D*x + E*y + F*z + G = 0
      const normId = `zzsp${evalCounter}`;
      giacEvalRaw(`${normId} := simplify((${id}) / (${cxx}))`);
      const x0 = stripKhicasApprox(giacEvalRaw(`simplify(-coeff(${normId}, x, 1)/2)`));
      const y0 = stripKhicasApprox(giacEvalRaw(`simplify(-coeff(${normId}, y, 1)/2)`));
      const z0 = stripKhicasApprox(giacEvalRaw(`simplify(-coeff(${normId}, z, 1)/2)`));
      const gConst = stripKhicasApprox(giacEvalRaw(`simplify(subst(${normId}, [x=0, y=0, z=0]))`));
      const rSqExact = stripKhicasApprox(giacEvalRaw(`simplify((${x0})^2 + (${y0})^2 + (${z0})^2 - (${gConst}))`));
      const rSqNum = parseFloat(giacEvalRaw(`evalf(${rSqExact}, 14)`));
      if (Number.isFinite(rSqNum) && rSqNum > 0) {
        const rExact = stripKhicasApprox(giacEvalRaw(`simplify(sqrt(${rSqExact}))`));
        sphereInfo = {
          centerExact: [x0, y0, z0],
          centerLatex: `\\left(${giacToLatex(x0)},\\, ${giacToLatex(y0)},\\, ${giacToLatex(z0)}\\right)`,
          rSqExact,
          rExact,
          rLatex: giacToLatex(rExact),
          rNum: Math.sqrt(rSqNum)
        };
      }
      giacEvalRaw(`purge(${normId})`);
    }
  }

  const lhsTex = giacToLatex(stripKhicasApprox(giacEvalRaw(`simplify(${subL})`)));
  const rhsTex = giacToLatex(stripKhicasApprox(giacEvalRaw(`simplify(${subR})`)));
  const zeroSimplified = stripKhicasApprox(giacEvalRaw(`simplify((${subL}) - (${subR}))`));
  giacEvalRaw(`purge(${id})`);

  return {
    zeroSimplified,
    equationLatex: `${lhsTex} = ${rhsTex}`,
    sphereInfo,
    durationMs: Math.max(1, Math.round(performance.now() - t0))
  };
}

/**
 * Exact 3D Plane-Quadric Symbolic Intersection in Giac WASM:
 * Symbolically computes the exact cross-section curve, exact Sphere-Plane circle center/radius/area,
 * Conic Section reduced equation, or Plane-Plane 3D intersection line!
 */
export function solve3DPlaneIntersection(planeObj, targetObj, params = {}) {
  const t0 = performance.now();
  const pl = analyzePlane3D(planeObj.lhsExpr, planeObj.rhsExpr, params);
  const { aExact, bExact, cExact, dExact, normal } = pl;

  // Case 1: Plane ∩ Plane -> Exact 3D Line
  if (targetObj.kind === 'plane3d') {
    const pl2 = analyzePlane3D(targetObj.lhsExpr, targetObj.rhsExpr, params);
    const dirX = stripKhicasApprox(giacEvalRaw(`simplify((${bExact})*(${pl2.cExact}) - (${cExact})*(${pl2.bExact}))`));
    const dirY = stripKhicasApprox(giacEvalRaw(`simplify((${cExact})*(${pl2.aExact}) - (${aExact})*(${pl2.cExact}))`));
    const dirZ = stripKhicasApprox(giacEvalRaw(`simplify((${aExact})*(${pl2.bExact}) - (${bExact})*(${pl2.aExact}))`));
    return {
      type: 'line3d',
      summaryTitle: t('Intersection Line Direction Vector', '두 평면의 교선 방향벡터'),
      latexMain: `\\vec{v} = \\left(${giacToLatex(dirX)},\\, ${giacToLatex(dirY)},\\, ${giacToLatex(dirZ)}\\right)`,
      details: [],
      durationMs: Math.max(1, Math.round(performance.now() - t0))
    };
  }

  // Case 2: Plane ∩ Sphere -> Exact Symbolic Circle Center, Radius (√ preserved!), and Area!
  if (targetObj.kind === 'implicit3d') {
    const impAna = targetObj.analysis || analyzeImplicit3D(targetObj.lhsExpr, targetObj.rhsExpr, params);
    if (impAna.sphereInfo) {
      const [x0, y0, z0] = impAna.sphereInfo.centerExact;
      const rSq = impAna.sphereInfo.rSqExact;
      const normSq = `((${aExact})^2 + (${bExact})^2 + (${cExact})^2)`;
      const signedNum = `((${aExact})*(${x0}) + (${bExact})*(${y0}) + (${cExact})*(${z0}) - (${dExact}))`;
      const hSqExact = stripKhicasApprox(giacEvalRaw(`simplify((${signedNum})^2 / ${normSq})`));
      const cutRSqExact = stripKhicasApprox(giacEvalRaw(`simplify((${rSq}) - (${hSqExact}))`));
      const cutRSqNum = parseFloat(giacEvalRaw(`evalf(${cutRSqExact}, 14)`));

      if (!Number.isFinite(cutRSqNum) || cutRSqNum < -1e-9) {
        return {
          type: 'empty',
          summaryTitle: t('Disjoint (No Real Section)', '만나지 않음 (교원 없음)'),
          latexMain: t('\\text{Center-to-plane distance } d > R', '\\text{구의 중심과 평면 사이 거리 } d > R'),
          details: [],
          durationMs: Math.max(1, Math.round(performance.now() - t0))
        };
      }

      const tFactor = `(${signedNum} / ${normSq})`;
      const cxEx = stripKhicasApprox(giacEvalRaw(`simplify((${x0}) - (${tFactor})*(${aExact}))`));
      const cyEx = stripKhicasApprox(giacEvalRaw(`simplify((${y0}) - (${tFactor})*(${bExact}))`));
      const czEx = stripKhicasApprox(giacEvalRaw(`simplify((${z0}) - (${tFactor})*(${cExact}))`));
      const cutRExact = stripKhicasApprox(giacEvalRaw(`simplify(sqrt(max(0, ${cutRSqExact})))`));
      const areaExact = stripKhicasApprox(giacEvalRaw(`simplify(pi * (${cutRSqExact}))`));

      return {
        type: 'circle3d',
        summaryTitle: Math.abs(cutRSqNum) < 1e-9
          ? t('Tangent at a Single Point', '평면과 구가 한 점에서 접함')
          : t('Exact Circle of Intersection', '구와 평면의 단면 교원 (정확해)'),
        latexMain: `r = ${giacToLatex(cutRExact)}, \\quad S = ${giacToLatex(areaExact)}`,
        details: [
          { label: t('Section Center', '교원 중심'), latex: `C\\left(${giacToLatex(cxEx)},\\, ${giacToLatex(cyEx)},\\, ${giacToLatex(czEx)}\\right)` },
          { label: t('Section Radius', '교원 반지름'), latex: `r = ${giacToLatex(cutRExact)}` },
          { label: t('Section Area', '단면 넓이'), latex: `S = ${giacToLatex(areaExact)}` }
        ],
        durationMs: Math.max(1, Math.round(performance.now() - t0))
      };
    }
  }

  // Case 3: General Plane ∩ Surface/Quadric -> Eliminate z (or y or x) via Giac symbolic substitution!
  const surfZero = targetObj.kind === 'surface3d'
    ? `z - (${applyParamsToExpr(targetObj.rhsExpr, params)})`
    : `(${applyParamsToExpr(targetObj.lhsExpr, params)}) - (${applyParamsToExpr(targetObj.rhsExpr, params)})`;

  let eliminatedEq = '';
  let projLabel = t('Projected Conic Section', 'xy 투영 단면식');
  if (Math.abs(normal[2]) > 1e-9) {
    const zSub = `((${dExact}) - (${aExact})*x - (${bExact})*y) / (${cExact})`;
    eliminatedEq = stripKhicasApprox(giacEvalRaw(`simplify(expand(subst(${surfZero}, z=(${zSub}))))`));
    projLabel = t('z-Eliminated Section Conic', 'z 소거 단면 방정식');
  } else if (Math.abs(normal[1]) > 1e-9) {
    const ySub = `((${dExact}) - (${aExact})*x - (${cExact})*z) / (${bExact})`;
    eliminatedEq = stripKhicasApprox(giacEvalRaw(`simplify(expand(subst(${surfZero}, y=(${ySub}))))`));
    projLabel = t('y-Eliminated Section Conic', 'y 소거 단면 방정식');
  } else if (Math.abs(normal[0]) > 1e-9) {
    const xSub = `((${dExact}) - (${bExact})*y - (${cExact})*z) / (${aExact})`;
    eliminatedEq = stripKhicasApprox(giacEvalRaw(`simplify(expand(subst(${surfZero}, x=(${xSub}))))`));
    projLabel = t('x-Eliminated Section Conic', 'x 소거 단면 방정식');
  }

  return {
    type: 'curve3d',
    summaryTitle: projLabel,
    latexMain: `${giacToLatex(eliminatedEq)} = 0`,
    details: [],
    durationMs: Math.max(1, Math.round(performance.now() - t0))
  };
}

/**
 * Compute Solid of Revolution (x-axis rotation of y = f(x) over [a, b]) + Riemann n-Discs
 * Exact Symbolic Volume: V = π * ∫_a^b (f(x))^2 dx
 */
export function computeSolidOfRevolution(rhsExpr, aExact, bExact, numDiscs = 12, params = {}) {
  const t0 = performance.now();
  const normA = normalizeMathInput(String(aExact));
  const normB = normalizeMathInput(String(bExact));
  const subExpr = applyParamsToExpr(rhsExpr, params);
  const id = `zzrv${++evalCounter}`;

  giacEvalRaw(`${id} := simplify(pi * int((${subExpr})^2, x, ${normA}, ${normB}))`);
  const volExact = stripKhicasApprox(giacEvalRaw(`${id}`));
  const volLatex = giacToLatex(volExact);
  const volNum = parseFloat(giacEvalRaw(`evalf(${id}, 14)`));
  const aNum = parseFloat(giacEvalRaw(`evalf(${normA}, 14)`));
  const bNum = parseFloat(giacEvalRaw(`evalf(${normB}, 14)`));
  const aLatex = giacToLatex(stripKhicasApprox(giacEvalRaw(`simplify(${normA})`)));
  const bLatex = giacToLatex(stripKhicasApprox(giacEvalRaw(`simplify(${normB})`)));
  giacEvalRaw(`purge(${id})`);

  // Numerical Riemann disc sum V_n (midpoint/right discs)
  const fnEval = buildCompiledEvaluator(subExpr, []);
  const n = Math.max(2, Math.min(80, Math.round(numDiscs)));
  const dx = (bNum - aNum) / n;
  let discSum = 0;
  const discs = [];
  for (let k = 0; k < n; k++) {
    const xMid = aNum + (k + 0.5) * dx;
    const r = Math.abs(fnEval(xMid, 0, {}));
    if (Number.isFinite(r)) {
      discSum += Math.PI * r * r * Math.abs(dx);
      discs.push({ xCenter: xMid, radius: r, thickness: Math.abs(dx) });
    }
  }

  return {
    volExact,
    volLatex,
    volNum,
    discSum,
    numDiscs: n,
    discs,
    aNum,
    bNum,
    aLatex,
    bLatex,
    durationMs: Math.max(1, Math.round(performance.now() - t0))
  };
}

/**
 * University Differential Geometry: Space Curve r(t) = [x(t), y(t), z(t)]
 * Computes Exact Symbolic Curvature κ(t), Torsion τ(t), and Frenet-Serret Frame {T, N, B} + Osculating Circle at t = t0
 */
export function analyzeSpaceCurve3D(vecExpr, t0Val = 1.0, params = {}) {
  const tStart = performance.now();
  // Exclude 't' from slider parameter substitution!
  const safeParams = { ...params };
  delete safeParams.t;
  const subVec = applyParamsToExpr(vecExpr, safeParams);

  const id = `zzcv${++evalCounter}`;
  giacEvalRaw(`${id} := ${subVec}`);
  const xEx = stripKhicasApprox(giacEvalRaw(`simplify(${id}[0])`));
  const yEx = stripKhicasApprox(giacEvalRaw(`simplify(${id}[1])`));
  const zEx = stripKhicasApprox(giacEvalRaw(`simplify(${id}[2])`));

  const drId = `zzdr${evalCounter}`;
  const d2rId = `zzddr${evalCounter}`;
  const d3rId = `zzdddr${evalCounter}`;
  const crId = `zzcr${evalCounter}`;

  giacEvalRaw(`${drId} := simplify(diff(${id}, t))`);
  giacEvalRaw(`${d2rId} := simplify(diff(${drId}, t))`);
  giacEvalRaw(`${d3rId} := simplify(diff(${d2rId}, t))`);
  giacEvalRaw(`${crId} := simplify(cross(${drId}, ${d2rId}))`);

  const speedSq = `((${drId}[0])^2 + (${drId}[1])^2 + (${drId}[2])^2)`;
  const crossSq = `((${crId}[0])^2 + (${crId}[1])^2 + (${crId}[2])^2)`;

  const kappaExact = stripKhicasApprox(
    giacEvalRaw(`simplify(sqrt(${crossSq}) / (${speedSq})^(3/2))`)
  );
  const tauNum = `((${crId}[0])*(${d3rId}[0]) + (${crId}[1])*(${d3rId}[1]) + (${crId}[2])*(${d3rId}[2]))`;
  const tauExact = stripKhicasApprox(
    giacEvalRaw(`simplify((${tauNum}) / (${crossSq}))`)
  );

  // Fast JS evaluators for 3D curve sampling t in [-6, 6]
  const cleanParamNames = Object.keys(safeParams);
  const buildT = (e) => {
    const fn = buildCompiledEvaluator3D(e.replace(/\bt\b/g, 'x'), cleanParamNames);
    return (tVal) => fn(tVal, 0, 0, safeParams);
  };
  const evalX = buildT(xEx);
  const evalY = buildT(yEx);
  const evalZ = buildT(zEx);

  // Evaluate Frenet-Serret Frame {T, N, B} at t = t0Val numerically with high precision
  const tRat = decimalToExactRational(t0Val);
  const posAt = [
    parseFloat(giacEvalRaw(`evalf(subst(${id}[0], t=${tRat}), 14)`)),
    parseFloat(giacEvalRaw(`evalf(subst(${id}[1], t=${tRat}), 14)`)),
    parseFloat(giacEvalRaw(`evalf(subst(${id}[2], t=${tRat}), 14)`))
  ];
  const vAt = [
    parseFloat(giacEvalRaw(`evalf(subst(${drId}[0], t=${tRat}), 14)`)),
    parseFloat(giacEvalRaw(`evalf(subst(${drId}[1], t=${tRat}), 14)`)),
    parseFloat(giacEvalRaw(`evalf(subst(${drId}[2], t=${tRat}), 14)`))
  ];
  const cAt = [
    parseFloat(giacEvalRaw(`evalf(subst(${crId}[0], t=${tRat}), 14)`)),
    parseFloat(giacEvalRaw(`evalf(subst(${crId}[1], t=${tRat}), 14)`)),
    parseFloat(giacEvalRaw(`evalf(subst(${crId}[2], t=${tRat}), 14)`))
  ];
  const kappaAt = parseFloat(giacEvalRaw(`evalf(subst(${kappaExact}, t=${tRat}), 14)`));

  const norm3 = (v) => Math.hypot(v[0], v[1], v[2]);
  const vLen = norm3(vAt);
  const cLen = norm3(cAt);

  let frenet = null;
  if (vLen > 1e-10) {
    const T = [vAt[0] / vLen, vAt[1] / vLen, vAt[2] / vLen];
    let B = [0, 0, 1];
    let N = [0, 1, 0];
    if (cLen > 1e-10) {
      B = [cAt[0] / cLen, cAt[1] / cLen, cAt[2] / cLen];
      // N = B x T (right-handed {T, N, B} with T x N = B)
      N = [
        B[1] * T[2] - B[2] * T[1],
        B[2] * T[0] - B[0] * T[2],
        B[0] * T[1] - B[1] * T[0]
      ];
    }
    frenet = {
      pos: posAt,
      T,
      N,
      B,
      kappaAt: Number.isFinite(kappaAt) ? kappaAt : 0,
      oscRadius: Number.isFinite(kappaAt) && kappaAt > 1e-4 ? 1 / kappaAt : null
    };
  }

  const curveLatex = `\\left(${giacToLatex(xEx)},\\, ${giacToLatex(yEx)},\\, ${giacToLatex(zEx)}\\right)`;
  const kappaLatex = giacToLatex(kappaExact);
  const tauLatex = giacToLatex(tauExact);

  giacEvalRaw(`purge(${id})`);
  giacEvalRaw(`purge(${drId})`);
  giacEvalRaw(`purge(${d2rId})`);
  giacEvalRaw(`purge(${d3rId})`);
  giacEvalRaw(`purge(${crId})`);

  return {
    xEx,
    yEx,
    zEx,
    curveLatex,
    kappaExact,
    kappaLatex,
    tauExact,
    tauLatex,
    evalCurve: (tVal) => [evalX(tVal), evalY(tVal), evalZ(tVal)],
    frenet,
    durationMs: Math.max(1, Math.round(performance.now() - tStart))
  };
}

/**
 * University Linear Algebra: 3x3 Matrix Linear Transformation M
 * Computes Exact Determinant, Characteristic Polynomial, Eigenvalues/Eigenvectors, and Jordan Canonical Form!
 */
export function analyzeMatrix3D(matrixExpr, params = {}) {
  const t0 = performance.now();
  const subM = applyParamsToExpr(matrixExpr, params);
  const id = `zzmx${++evalCounter}`;
  giacEvalRaw(`${id} := ${subM}`);

  const matLatex = giacToLatex(id);
  const detExact = stripKhicasApprox(giacEvalRaw(`simplify(det(${id}))`));
  const detLatex = giacToLatex(detExact);
  const detNum = parseFloat(giacEvalRaw(`evalf(${detExact}, 12)`));

  // Characteristic polynomial det(M - x*I_3) factored
  const charPoly = stripKhicasApprox(giacEvalRaw(`factor(det(${id} - x*idn(3)))`));
  const charPolyLatex = giacToLatex(charPoly).replace(/\bx\b/g, '\\lambda');

  // Jordan canonical form [P, J] = jordan(M)
  const jId = `zzjd${evalCounter}`;
  giacEvalRaw(`${jId} := jordan(${id})`);
  const jordanJLatex = giacToLatex(`${jId}[1]`);

  // Numeric 3x3 entries for Three.js deformation
  const entries = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      entries[r][c] = parseFloat(giacEvalRaw(`evalf(${id}[${r}][${c}], 14)`)) || 0;
    }
  }

  // Extract independent real eigenvectors directly from Jordan basis P = jId[0], J = jId[1]
  // Column `col` starts a Jordan block iff col === 0 or superdiagonal J[col-1][col] == 0
  const eigenAxes = [];
  const jSize = parseInt(giacEvalRaw(`size(${jId})`), 10) || 0;
  if (jSize >= 2) {
    for (let col = 0; col < 3; col++) {
      if (col > 0) {
        const supEntry = stripKhicasApprox(giacEvalRaw(`simplify(${jId}[1][${col - 1}][${col}])`));
        if (supEntry !== '0') continue;
      }
      const eigVal = stripKhicasApprox(giacEvalRaw(`simplify(${jId}[1][${col}][${col}])`));
      if (/\bi\b/.test(eigVal)) continue;
      const c0 = stripKhicasApprox(giacEvalRaw(`simplify(${jId}[0][0][${col}])`));
      const c1 = stripKhicasApprox(giacEvalRaw(`simplify(${jId}[0][1][${col}])`));
      const c2 = stripKhicasApprox(giacEvalRaw(`simplify(${jId}[0][2][${col}])`));
      if (/\bi\b/.test(`${c0} ${c1} ${c2}`)) continue;
      const vx = parseFloat(giacEvalRaw(`evalf(${c0}, 12)`)) || 0;
      const vy = parseFloat(giacEvalRaw(`evalf(${c1}, 12)`)) || 0;
      const vz = parseFloat(giacEvalRaw(`evalf(${c2}, 12)`)) || 0;
      const len = Math.hypot(vx, vy, vz);
      if (len > 1e-8) {
        eigenAxes.push([vx / len, vy / len, vz / len]);
      }
    }
  }

  giacEvalRaw(`purge(${id})`);
  giacEvalRaw(`purge(${jId})`);

  return {
    matLatex,
    detExact,
    detLatex,
    detNum,
    charPolyLatex,
    jordanJLatex,
    entries,
    eigenAxes,
    durationMs: Math.max(1, Math.round(performance.now() - t0))
  };
}

/**
 * University Vector Calculus: 3D Vector Field F(x, y, z) = [P, Q, R]
 * Computes Exact Symbolic Divergence (∇·F) and Curl (∇×F)
 */
export function analyzeVectorField3D(vecExpr, params = {}) {
  const t0 = performance.now();
  const subV = applyParamsToExpr(vecExpr, params);
  const id = `zzvf${++evalCounter}`;
  giacEvalRaw(`${id} := ${subV}`);

  const pEx = stripKhicasApprox(giacEvalRaw(`simplify(${id}[0])`));
  const qEx = stripKhicasApprox(giacEvalRaw(`simplify(${id}[1])`));
  const rEx = stripKhicasApprox(giacEvalRaw(`simplify(${id}[2])`));

  const divExact = stripKhicasApprox(giacEvalRaw(`simplify(divergence(${id}, [x, y, z]))`));
  const curlId = `zzcl${evalCounter}`;
  giacEvalRaw(`${curlId} := simplify(curl(${id}, [x, y, z]))`);
  const curlX = stripKhicasApprox(giacEvalRaw(`${curlId}[0]`));
  const curlY = stripKhicasApprox(giacEvalRaw(`${curlId}[1]`));
  const curlZ = stripKhicasApprox(giacEvalRaw(`${curlId}[2]`));

  const fieldLatex = `\\left(${giacToLatex(pEx)},\\, ${giacToLatex(qEx)},\\, ${giacToLatex(rEx)}\\right)`;
  const divLatex = giacToLatex(divExact);
  const curlLatex = `\\left(${giacToLatex(curlX)},\\, ${giacToLatex(curlY)},\\, ${giacToLatex(curlZ)}\\right)`;

  const isIrrotational = curlX === '0' && curlY === '0' && curlZ === '0';
  const isIncompressible = divExact === '0';

  const paramNames = Object.keys(params);
  const evP = buildCompiledEvaluator3D(pEx, paramNames);
  const evQ = buildCompiledEvaluator3D(qEx, paramNames);
  const evR = buildCompiledEvaluator3D(rEx, paramNames);

  giacEvalRaw(`purge(${id})`);
  giacEvalRaw(`purge(${curlId})`);

  return {
    fieldLatex,
    divExact,
    divLatex,
    curlExact: `[${curlX}, ${curlY}, ${curlZ}]`,
    curlLatex,
    isIrrotational,
    isIncompressible,
    evalField: (x, y, z) => [evP(x, y, z, params), evQ(x, y, z, params), evR(x, y, z, params)],
    durationMs: Math.max(1, Math.round(performance.now() - t0))
  };
}



