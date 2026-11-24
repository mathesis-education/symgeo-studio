import fs from 'fs';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

let casModule = null;
let initStats = null;

export async function getSymGeoCAS() {
  if (casModule) return { cas: casModule, initStats };

  globalThis.require = createRequire(import.meta.url);
  globalThis.self = globalThis;
  globalThis.alert = () => {};
  globalThis.window = {
    innerWidth: 1080,
    navigator: { userAgent: 'Mozilla/5.0 SymGeoCASNeuroSymbolicVerifier/3.0' },
    location: { pathname: '/', protocol: 'file:' },
    addEventListener() {}
  };
  globalThis.document = {
    currentScript: null,
    addEventListener() {},
    getElementById() {
      return null;
    }
  };
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const urlStr = String(url);
    if (urlStr.startsWith('file:')) {
      return new Response(fs.readFileSync(fileURLToPath(urlStr)), {
        status: 200,
        headers: { 'Content-Type': 'application/wasm' }
      });
    }
    return origFetch(url, opts);
  };

  const t0 = performance.now();
  casModule = await import('file:///C:/dev/apps/symgeo-studio/src/cas-engine.js');
  await casModule.initGiacEngine(
    'file:///C:/dev/apps/symgeo-studio/node_modules/@basthon/xcas-wasm/src/index.js'
  );
  const coldInitMs = Number((performance.now() - t0).toFixed(3));
  initStats = { coldInitMs };
  return { cas: casModule, initStats };
}

export const getAlgeoCAS = getSymGeoCAS;

/**
 * Sanitize identifier underscores in Giac commands (Giac treats '_' as MKSA unit operator, except c_0, c_1).
 */
export function sanitizeGiacCommand(cmd) {
  if (!cmd) return '';
  let s = String(cmd).trim();
  s = s.replace(/\bc_(\d+)\b/g, 'zzodeconst$1');
  s = s.replace(/([a-zA-Z0-9])_([a-zA-Z0-9])/g, '$1$2');
  s = s.replace(/zzodeconst(\d+)/g, 'c_$1');
  return s;
}

/**
 * Strip KhiCAS hybrid 'exact=approx' suffix if present.
 */
export function stripKhiApprox(raw) {
  let s = String(raw ?? '').trim();
  if (s.includes('=') && !s.startsWith('list[') && !s.startsWith('[')) {
    const parts = s.split('=');
    if (parts.length === 2 && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(parts[1].trim())) {
      s = parts[0].trim();
    }
  }
  return s;
}

let bridgeCounter = 0;

/**
 * Execute an AlgeoCAS Neuro-Symbolic Tool Call (Arm 3 MCP / Browser SDK Bridge).
 */
export async function executeSymbolicTool(toolCall) {
  const { cas } = await getAlgeoCAS();
  const t0 = performance.now();
  const name = String(toolCall?.tool || toolCall?.name || 'eval_cas').trim();
  const args = toolCall?.args || toolCall?.arguments || {};

  try {
    let result = null;
    if (name === 'analyze_function') {
      const expr = sanitizeGiacCommand(args.expr || args.rhs || '');
      const out = cas.analyzeExplicitFunction(expr, {}, true);
      result = {
        simplified: out.simplified,
        derivative1: out.forms?.derivative1,
        derivative2: out.forms?.derivative2,
        roots: (out.roots || []).map((r) => ({ xExact: r.exactX || r.exact, xApprox: r.x })),
        extrema: (out.extrema || []).map((e) => ({ kind: e.kind, xExact: e.exactX, yExact: e.exactY })),
        inflections: (out.inflections || []).map((i) => ({
          xExact: i.exactX,
          yExact: i.exactY,
          lowestNonzeroOrder: i.lowestNonzeroOrder
        })),
        nonInflectionWarnings: (out.nonInflectionWarnings || []).map((w) => ({
          xExact: w.exactX,
          lowestNonzeroOrder: w.lowestNonzeroOrder,
          reason: w.reason
        }))
      };
    } else if (name === 'solve_intersections') {
      const exprA = sanitizeGiacCommand(args.exprA || '');
      const exprB = sanitizeGiacCommand(args.exprB || '');
      const objA = cas.classifyUserInput(exprA.includes('=') ? exprA : `y = ${exprA}`);
      const objB = cas.classifyUserInput(exprB.includes('=') ? exprB : `y = ${exprB}`);
      const out = cas.solveSymbolicIntersections(objA, objB, {});
      const pts = out.points || [];
      result = {
        count: pts.length,
        intersections: pts.map((p) => ({
          xExact: p.exactX,
          yExact: p.exactY,
          xApprox: p.x,
          yApprox: p.y
        })),
        note: out.numericalComparisonNote
      };
    } else if (name === 'slice_3d') {
      const surfaceStr = sanitizeGiacCommand(args.surface || '');
      const planeStr = sanitizeGiacCommand(args.plane || '');
      const surfObj = cas.classifyUserInput(surfaceStr);
      const planeObj = cas.classifyUserInput(planeStr);
      result = cas.solve3DPlaneIntersection(planeObj, surfObj, {});
    } else if (name === 'solid_revolution') {
      const expr = sanitizeGiacCommand(args.expr || '');
      const a = String(args.a ?? '0');
      const b = String(args.b ?? '1');
      const n = Number(args.numDiscs || 8);
      const rev = cas.computeSolidOfRevolution(expr, a, b, n, {});
      result = {
        volExact: rev.volExact,
        volApprox: rev.volNum,
        discSum: rev.discSum,
        numDiscs: rev.numDiscs
      };
    } else if (name === 'space_curve_3d') {
      const vecExpr = sanitizeGiacCommand(args.vecExpr || '');
      const tVal = args.t0 !== undefined ? String(args.t0) : '1';
      const sc = cas.analyzeSpaceCurve3D(vecExpr, Number(tVal) || 0, {});
      const kappaAtT0 = stripKhiApprox(cas.giacEvalRaw(`simplify(subst(${sc.kappaExact}, t=(${tVal})))`));
      const tauAtT0 = stripKhiApprox(cas.giacEvalRaw(`simplify(subst(${sc.tauExact}, t=(${tVal})))`));
      result = {
        curvatureExact: sc.kappaExact,
        torsionExact: sc.tauExact,
        kappaAtT0,
        tauAtT0,
        frenet: sc.frenet
      };
    } else if (name === 'surface_3d') {
      const rhsExpr = sanitizeGiacCommand(args.rhsExpr || '');
      const sf = cas.analyzeSurface3D(rhsExpr, {});
      const x0 = args.x0 !== undefined ? String(args.x0) : null;
      const y0 = args.y0 !== undefined ? String(args.y0) : null;
      const gaussAtPt =
        x0 !== null && y0 !== null
          ? stripKhiApprox(cas.giacEvalRaw(`simplify(subst(${sf.gaussK}, [x=(${x0}), y=(${y0})]))`))
          : null;
      result = {
        gaussianCurvature: sf.gaussK,
        meanCurvature: sf.meanH,
        gaussAtPoint: gaussAtPt,
        criticalPoints3D: sf.criticalPoints3D
      };
    } else if (name === 'jordan_matrix') {
      const matrixExpr = sanitizeGiacCommand(args.matrixExpr || '');
      const mId = `zzbjm${++bridgeCounter}`;
      const jId = `zzbjj${bridgeCounter}`;
      cas.giacEvalRaw(`${mId} := ${matrixExpr}`);
      const nDim = parseInt(cas.giacEvalRaw(`nrows(${mId})`), 10) || 3;
      const detExact = stripKhiApprox(cas.giacEvalRaw(`simplify(det(${mId}))`));
      const charPoly = stripKhiApprox(cas.giacEvalRaw(`factor(det(${mId} - x*idn(${nDim})))`));
      cas.giacEvalRaw(`${jId} := jordan(${mId})`);
      const Jmat = stripKhiApprox(cas.giacEvalRaw(`${jId}[1]`));
      const blocks = [];
      let curLen = 0;
      for (let col = 0; col < nDim; col++) {
        if (col === 0) {
          curLen = 1;
        } else {
          const sup = stripKhiApprox(cas.giacEvalRaw(`simplify(${jId}[1][${col - 1}][${col}])`));
          if (sup === '0') {
            blocks.push(curLen);
            curLen = 1;
          } else {
            curLen++;
          }
        }
      }
      if (curLen > 0) blocks.push(curLen);
      blocks.sort((a, b) => a - b);
      cas.giacEvalRaw(`purge(${mId})`);
      cas.giacEvalRaw(`purge(${jId})`);
      result = {
        dim: nDim,
        detExact,
        charPoly,
        jordanJ: Jmat,
        jordanBlockSizes: blocks.map(String),
        geometricMultiplicityTotal: blocks.length,
        isDefective: blocks.some((b) => b > 1)
      };
    } else if (name === 'vector_field_3d') {
      const vecExpr = sanitizeGiacCommand(args.vecExpr || '');
      const vf = cas.analyzeVectorField3D(vecExpr, {});
      result = {
        divExact: vf.divExact,
        curlExact: vf.curlExact,
        isIrrotational: vf.isIrrotational,
        isIncompressible: vf.isIncompressible
      };
    } else {
      const cmd = sanitizeGiacCommand(args.command || args.expr || '');
      const ev = cas.evaluateCASCommand(cmd, {});
      const rawExact = stripKhiApprox(ev.exact);
      result = {
        command: cmd,
        exact: rawExact,
        approx: ev.approx,
        latex: ev.latex
      };
    }
    const wasmMs = Number((performance.now() - t0).toFixed(3));
    return { ok: true, tool: name, wasmMs, result };
  } catch (err) {
    const wasmMs = Number((performance.now() - t0).toFixed(3));
    return { ok: false, tool: name, wasmMs, error: String(err?.message || err) };
  }
}
