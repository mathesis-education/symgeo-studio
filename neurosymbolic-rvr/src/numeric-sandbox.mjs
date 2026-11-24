import { performance } from 'perf_hooks';
import { createRequire } from 'module';
import { extractImplicitSurfaceMesh } from 'file:///C:/dev/apps/algeomath-giac-cas/src/marching-cubes.js';

const requireFromApp = createRequire('file:///C:/dev/apps/algeomath-giac-cas/package.json');
const THREE = requireFromApp('three');
const { MeshBVH } = requireFromApp('three-mesh-bvh');

/**
 * Convert math expression string into safe IEEE-754 JS floating-point function.
 */
function convertCaretToPow(input) {
  let s = input;
  let guard = 0;
  while (s.includes('^') && guard++ < 50) {
    const idx = s.indexOf('^');
    // Find base ending at idx - 1
    let lEnd = idx - 1;
    while (lEnd >= 0 && /\s/.test(s[lEnd])) lEnd--;
    let lStart = lEnd;
    if (s[lEnd] === ')') {
      let depth = 0;
      for (let i = lEnd; i >= 0; i--) {
        if (s[i] === ')') depth++;
        else if (s[i] === '(') {
          depth--;
          if (depth === 0) {
            lStart = i;
            // Include preceding function name like Math.sin(...)
            while (lStart > 0 && /[a-zA-Z0-9_.]/.test(s[lStart - 1])) lStart--;
            break;
          }
        }
      }
    } else {
      while (lStart > 0 && /[a-zA-Z0-9_.]/.test(s[lStart - 1])) lStart--;
    }

    // Find exponent starting at idx + 1
    let rStart = idx + 1;
    while (rStart < s.length && /\s/.test(s[rStart])) rStart++;
    let rEnd = rStart;
    if (s[rStart] === '+' || s[rStart] === '-') rEnd++;
    if (s[rEnd] === '(') {
      let depth = 0;
      for (let i = rEnd; i < s.length; i++) {
        if (s[i] === '(') depth++;
        else if (s[i] === ')') {
          depth--;
          if (depth === 0) {
            rEnd = i;
            break;
          }
        }
      }
    } else {
      while (rEnd + 1 < s.length && /[a-zA-Z0-9_.]/.test(s[rEnd + 1])) rEnd++;
    }

    const base = s.slice(lStart, lEnd + 1);
    const exp = s.slice(rStart, rEnd + 1);
    s = `${s.slice(0, lStart)}Math.pow(${base}, ${exp})${s.slice(rEnd + 1)}`;
  }
  return s;
}

export function compileFloatExpr(expr, vars = ['x']) {
  let s = String(expr || '').trim();
  s = s
    .replace(/(?<!Math\.)\bpi\b/gi, 'Math.PI')
    .replace(/(?<!Math\.)\bsqrt\s*\(/g, 'Math.sqrt(')
    .replace(/(?<!Math\.)\bcbrt\s*\(/g, 'Math.cbrt(')
    .replace(/(?<!Math\.)\basin\s*\(/g, 'Math.asin(')
    .replace(/(?<!Math\.)\bacos\s*\(/g, 'Math.acos(')
    .replace(/(?<!Math\.)\batan\s*\(/g, 'Math.atan(')
    .replace(/(?<!Math\.)\bsinh\s*\(/g, 'Math.sinh(')
    .replace(/(?<!Math\.)\bcosh\s*\(/g, 'Math.cosh(')
    .replace(/(?<!Math\.)\btanh\s*\(/g, 'Math.tanh(')
    .replace(/(?<!Math\.)\bsin\s*\(/g, 'Math.sin(')
    .replace(/(?<!Math\.)\bcos\s*\(/g, 'Math.cos(')
    .replace(/(?<!Math\.)\btan\s*\(/g, 'Math.tan(')
    .replace(/(?<!Math\.)\bexp\s*\(/g, 'Math.exp(')
    .replace(/(?<!Math\.)\b(?:ln|log)\s*\(/g, 'Math.log(')
    .replace(/(?<!Math\.)\babs\s*\(/g, 'Math.abs(')
    .replace(/(?<![a-zA-Z0-9_.])e(?![a-zA-Z0-9_])/g, 'Math.E');

  s = convertCaretToPow(s);

  // eslint-disable-next-line no-new-func
  return new Function(...vars, `"use strict"; return Number(${s});`);
}

export function bisectionSignChangeRoots(fn, xMin = -6, xMax = 6, step = 0.05) {
  const roots = [];
  for (let x = xMin; x < xMax - 1e-12; x += step) {
    const xNext = Math.min(xMax, x + step);
    const fa = fn(x);
    const fb = fn(xNext);
    if (!Number.isFinite(fa) || !Number.isFinite(fb)) continue;
    if (Math.abs(fa) === 0) {
      if (!roots.some((r) => Math.abs(r - x) < 1e-5)) roots.push(Number(x.toFixed(10)));
      continue;
    }
    if (fa * fb < 0) {
      let lo = x;
      let hi = xNext;
      let flo = fa;
      for (let iter = 0; iter < 45; iter++) {
        const mid = 0.5 * (lo + hi);
        const fm = fn(mid);
        if (flo * fm <= 0) hi = mid;
        else {
          lo = mid;
          flo = fm;
        }
      }
      const r = 0.5 * (lo + hi);
      if (!roots.some((prev) => Math.abs(prev - r) < 1e-5)) roots.push(Number(r.toFixed(10)));
    }
  }
  return roots;
}

export function finiteDiff1(fn, x, h = 1e-5) {
  return (fn(x + h) - fn(x - h)) / (2 * h);
}

export function finiteDiff2(fn, x, h = 1e-4) {
  return (fn(x + h) - 2 * fn(x) + fn(x - h)) / (h * h);
}

export function finiteDiff3(fn, x, h = 1e-4) {
  return (fn(x + 2 * h) - 2 * fn(x + h) + 2 * fn(x - h) - fn(x - 2 * h)) / (2 * h * h * h);
}

export function simpsonQuadrature(fn, a, b, panels = 100) {
  const n = panels % 2 === 0 ? panels : panels + 1;
  let lo = a;
  let hi = b;
  if (!Number.isFinite(fn(lo))) lo += 1e-9;
  if (!Number.isFinite(fn(hi))) hi -= 1e-9;
  const h = (hi - lo) / n;
  let sum = fn(lo) + fn(hi);
  for (let i = 1; i < n; i++) {
    const v = fn(lo + i * h);
    if (!Number.isFinite(v)) return NaN;
    sum += (i % 2 === 1 ? 4 : 2) * v;
  }
  return (h / 3) * sum;
}

export function meshSliceArea32(implicitExpr, a, b, c, d, bound = 5.0, gridRes = 32) {
  const fn3 = compileFloatExpr(implicitExpr, ['x', 'y', 'z']);
  const mesh = extractImplicitSurfaceMesh(fn3, { min: -bound, max: bound }, gridRes);
  if (!mesh.positions || mesh.positions.length === 0) {
    return { intersectedSegments: 0, capAreaApprox: 0, centroidApprox: null, meanRadiusApprox: 0 };
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  const bvh = new MeshBVH(geo);
  const norm = Math.hypot(a, b, c);
  const plane = new THREE.Plane(new THREE.Vector3(a / norm, b / norm, c / norm), -d / norm);

  const linePositions = [];
  bvh.shapecast({
    intersectsBounds: (box) => box.intersectsPlane(plane),
    intersectsTriangle: (tri) => {
      const dA = plane.distanceToPoint(tri.a);
      const dB = plane.distanceToPoint(tri.b);
      const dC = plane.distanceToPoint(tri.c);
      const pts = [];
      const checkEdge = (p1, p2, v1, v2) => {
        if ((v1 <= 0 && v2 >= 0) || (v1 >= 0 && v2 <= 0)) {
          const denom = v1 - v2;
          if (Math.abs(denom) > 1e-12) {
            pts.push(new THREE.Vector3().lerpVectors(p1, p2, v1 / denom));
          }
        }
      };
      checkEdge(tri.a, tri.b, dA, dB);
      checkEdge(tri.b, tri.c, dB, dC);
      checkEdge(tri.c, tri.a, dC, dA);
      if (pts.length >= 2 && pts[0].distanceToSquared(pts[1]) > 1e-10) {
        linePositions.push(pts[0].x, pts[0].y, pts[0].z, pts[1].x, pts[1].y, pts[1].z);
      }
      return false;
    }
  });

  const numVerts = linePositions.length / 3;
  if (numVerts === 0) {
    return { intersectedSegments: 0, capAreaApprox: 0, centroidApprox: null, meanRadiusApprox: 0 };
  }
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < linePositions.length; i += 3) {
    cx += linePositions[i];
    cy += linePositions[i + 1];
    cz += linePositions[i + 2];
  }
  cx /= numVerts;
  cy /= numVerts;
  cz /= numVerts;

  let capArea = 0;
  let rSum = 0;
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  const cr = new THREE.Vector3();
  for (let i = 0; i < linePositions.length; i += 6) {
    const ax = linePositions[i];
    const ay = linePositions[i + 1];
    const az = linePositions[i + 2];
    const bx = linePositions[i + 3];
    const by = linePositions[i + 4];
    const bz = linePositions[i + 5];
    u.set(ax - cx, ay - cy, az - cz);
    v.set(bx - cx, by - cy, bz - cz);
    capArea += 0.5 * cr.crossVectors(u, v).length();
    rSum += 0.5 * (u.length() + v.length());
  }
  const segs = linePositions.length / 6;
  return {
    intersectedSegments: segs,
    capAreaApprox: Number(capArea.toFixed(6)),
    centroidApprox: [Number(cx.toFixed(6)), Number(cy.toFixed(6)), Number(cz.toFixed(6))],
    meanRadiusApprox: Number((rSum / segs).toFixed(6))
  };
}

/**
 * Genuine IEEE-754 characteristic polynomial + Durand-Kerner eigenvalue finder under 1-ULP floating-point rounding.
 */
export function numericalMatrixEigenAnalysis(mat) {
  const n = mat.length;
  // Faddeev-LeVerrier characteristic polynomial with 1-ULP float rounding noise
  const M = mat.map((row, r) => row.map((v, c) => v + (r === n - 1 && c === 0 ? 2.220446049250313e-16 : 0)));
  const matMul = (A, B) =>
    A.map((row, i) => B[0].map((_, j) => row.reduce((s, _, k) => s + A[i][k] * B[k][j], 0)));
  const trace = (A) => A.reduce((s, row, i) => s + row[i], 0);

  const coeffs = [1]; // c_0 * lambda^n + c_1 * lambda^(n-1) + ... + c_n
  let Bk = M.map((r) => [...r]);
  for (let k = 1; k <= n; k++) {
    if (k > 1) {
      const prevC = coeffs[k - 1];
      const Bprev = Bk.map((row, r) => row.map((v, c) => (r === c ? v + prevC : v)));
      Bk = matMul(M, Bprev);
    }
    const ck = -trace(Bk) / k;
    coeffs.push(ck);
  }

  // Durand-Kerner complex root iteration
  const roots = Array.from({ length: n }, (_, k) => {
    const ang = (2 * Math.PI * k) / n + 0.37;
    return { re: 0.9 * Math.cos(ang), im: 0.9 * Math.sin(ang) };
  });
  const evalPoly = (z) => {
    let re = coeffs[0];
    let im = 0;
    for (let i = 1; i <= n; i++) {
      const nre = re * z.re - im * z.im + coeffs[i];
      const nim = re * z.im + im * z.re;
      re = nre;
      im = nim;
    }
    return { re, im };
  };
  const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
  const cMul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
  const cDiv = (a, b) => {
    const den = b.re * b.re + b.im * b.im || 1e-30;
    return { re: (a.re * b.re + a.im * b.im) / den, im: (a.im * b.re - a.re * b.im) / den };
  };

  for (let iter = 0; iter < 120; iter++) {
    for (let i = 0; i < n; i++) {
      let denom = { re: 1, im: 0 };
      for (let j = 0; j < n; j++) {
        if (i !== j) denom = cMul(denom, cSub(roots[i], roots[j]));
      }
      const delta = cDiv(evalPoly(roots[i]), denom);
      roots[i] = cSub(roots[i], delta);
    }
  }

  // Cluster eigenvalues at strict IEEE-754 tolerance 1e-9 (note: 1-ULP splits size-2/3/4 Jordan blocks by ~1e-8..1e-4!)
  const distinctTol = 1e-9;
  const clusters = [];
  for (const r of roots) {
    const hit = clusters.find((c) => Math.hypot(c.re - r.re, c.im - r.im) < distinctTol);
    if (hit) hit.count++;
    else clusters.push({ re: r.re, im: r.im, count: 1 });
  }
  const det = (n % 2 === 0 ? 1 : -1) * coeffs[n];
  return {
    detApprox: Number(det.toFixed(8)),
    perturbedRoots: roots.map((r) => ({
      re: Number(r.re.toFixed(9)),
      im: Number(r.im.toFixed(9))
    })),
    numericalDistinctRootCountAt1e9: clusters.length,
    apparentDiagonalizableFloat: clusters.length === n
  };
}

export function rk4SecondOrderIVP(rhsFn, x0, y0, yp0, xTarget, steps = 500) {
  const h = (xTarget - x0) / steps;
  let x = x0;
  let y = y0;
  let yp = yp0;
  for (let i = 0; i < steps; i++) {
    const k1y = yp;
    const k1v = rhsFn(x, y, yp);
    const k2y = yp + 0.5 * h * k1v;
    const k2v = rhsFn(x + 0.5 * h, y + 0.5 * h * k1y, yp + 0.5 * h * k1v);
    const k3y = yp + 0.5 * h * k2v;
    const k3v = rhsFn(x + 0.5 * h, y + 0.5 * h * k2y, yp + 0.5 * h * k2v);
    const k4y = yp + h * k3v;
    const k4v = rhsFn(x + h, y + h * k3y, yp + h * k3v);
    y += (h / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
    yp += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    x += h;
  }
  return { xTarget, yApprox: Number(y.toFixed(8)), ypApprox: Number(yp.toFixed(8)) };
}

/**
 * Execute an IEEE-754 Numeric Float Tool Call (Arm 2 Controlled Baseline).
 */
export function executeNumericTool(toolCall) {
  const t0 = performance.now();
  const name = String(toolCall?.tool || toolCall?.name || 'numeric_eval_js').trim();
  const args = toolCall?.args || toolCall?.arguments || {};

  try {
    let result = null;
    if (name === 'numeric_roots_bisection') {
      const f = compileFloatExpr(args.exprA || '0', ['x']);
      const g = compileFloatExpr(args.exprB || '0', ['x']);
      const xMin = Number(args.xMin ?? -6);
      const xMax = Number(args.xMax ?? 6);
      const step = Number(args.step ?? 0.05);
      const roots = bisectionSignChangeRoots((x) => f(x) - g(x), xMin, xMax, step);
      result = {
        method: 'IEEE-754 sign-change bisection (step=0.05, 45 iters)',
        rootsApprox: roots,
        pointsApprox: roots.map((rx) => [rx, Number(f(rx).toFixed(8))])
      };
    } else if (name === 'numeric_calculus_fd') {
      const f = compileFloatExpr(args.expr || '0', ['x']);
      const xMin = Number(args.xMin ?? -5);
      const xMax = Number(args.xMax ?? 5);
      const critApprox = bisectionSignChangeRoots((x) => finiteDiff1(f, x, 1e-5), xMin, xMax, 0.05);
      const inflSignFlipApprox = bisectionSignChangeRoots((x) => finiteDiff2(f, x, 1e-4), xMin, xMax, 0.05);
      result = {
        method: 'Central finite differences (h1=1e-5, h2=1e-4) + sign-change bisection',
        criticalPointsApprox: critApprox,
        inflectionSignFlipRootsApprox: inflSignFlipApprox
      };
    } else if (name === 'numeric_3d_slice_mesh') {
      result = meshSliceArea32(
        args.implicitSurface || 'x^2+y^2+z^2-9',
        Number(args.a ?? 0),
        Number(args.b ?? 0),
        Number(args.c ?? 1),
        Number(args.d ?? 0),
        Number(args.bound ?? 5.0),
        32
      );
    } else if (name === 'numeric_integral_simpson') {
      const fn = compileFloatExpr(args.integrand || '0', ['x']);
      const a = Number(args.a ?? 0);
      const b = Number(args.b ?? 1);
      const val = simpsonQuadrature(fn, a, b, 100);
      result = {
        method: '100-panel composite Simpson quadrature (IEEE-754 float)',
        integralApprox: Number.isFinite(val) ? Number(val.toFixed(8)) : String(val),
        timesPiApprox: Number.isFinite(val) ? Number((Math.PI * val).toFixed(8)) : String(val)
      };
    } else if (name === 'numeric_diffgeom_fd') {
      if (args.curveComponents && Array.isArray(args.curveComponents)) {
        const [fx, fy, fz] = args.curveComponents.map((c) => compileFloatExpr(c, ['t']));
        const t0Val = Number(args.t0 ?? 1);
        const h = 1e-4;
        const r1 = [finiteDiff1(fx, t0Val, 1e-5), finiteDiff1(fy, t0Val, 1e-5), finiteDiff1(fz, t0Val, 1e-5)];
        const r2 = [finiteDiff2(fx, t0Val, h), finiteDiff2(fy, t0Val, h), finiteDiff2(fz, t0Val, h)];
        const r3 = [finiteDiff3(fx, t0Val, h), finiteDiff3(fy, t0Val, h), finiteDiff3(fz, t0Val, h)];
        const cross = [
          r1[1] * r2[2] - r1[2] * r2[1],
          r1[2] * r2[0] - r1[0] * r2[2],
          r1[0] * r2[1] - r1[1] * r2[0]
        ];
        const crossNormSq = cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2;
        const r1Norm = Math.hypot(...r1);
        const triple = cross[0] * r3[0] + cross[1] * r3[1] + cross[2] * r3[2];
        result = {
          kappaApprox: Number((Math.sqrt(crossNormSq) / r1Norm ** 3).toFixed(8)),
          tauApprox: Number((triple / (crossNormSq || 1e-30)).toFixed(8))
        };
      } else {
        const fxy = compileFloatExpr(args.surfaceRhs || '0', ['x', 'y']);
        const x0 = Number(args.x0 ?? 0);
        const y0 = Number(args.y0 ?? 0);
        const h = 1e-4;
        const fx = (fxy(x0 + h, y0) - fxy(x0 - h, y0)) / (2 * h);
        const fy = (fxy(x0, y0 + h) - fxy(x0, y0 - h)) / (2 * h);
        const fxx = (fxy(x0 + h, y0) - 2 * fxy(x0, y0) + fxy(x0 - h, y0)) / (h * h);
        const fyy = (fxy(x0, y0 + h) - 2 * fxy(x0, y0) + fxy(x0, y0 - h)) / (h * h);
        const fxy2 =
          (fxy(x0 + h, y0 + h) - fxy(x0 + h, y0 - h) - fxy(x0 - h, y0 + h) + fxy(x0 - h, y0 - h)) /
          (4 * h * h);
        const detH = fxx * fyy - fxy2 * fxy2;
        const K = detH / (1 + fx * fx + fy * fy) ** 2;
        result = {
          hessianDetApprox: Number(detH.toFixed(8)),
          gaussianCurvatureApprox: Number(K.toFixed(8))
        };
      }
    } else if (name === 'numeric_matrix_float') {
      result = numericalMatrixEigenAnalysis(args.matrix || [[1, 0], [0, 1]]);
    } else if (name === 'numeric_laplace_quadrature') {
      const ft = compileFloatExpr(args.ft || '1', ['t']);
      const sVal = Number(args.s ?? 1);
      const val = simpsonQuadrature((t) => Math.exp(-sVal * t) * ft(t), 0, 30, 400);
      result = {
        method: 'Improper numerical quadrature on [0, 30] (400 Simpson panels)',
        laplaceApprox: Number.isFinite(val) && Math.abs(val) < 1e8 ? Number(val.toFixed(8)) : `DIVERGED (${val})`
      };
    } else if (name === 'numeric_ode_rk4') {
      // rhsExpr in terms of x, y, yp for y'' = rhsExpr
      const rhs = compileFloatExpr(args.rhsExpr || '0', ['x', 'y', 'yp']);
      result = rk4SecondOrderIVP(
        rhs,
        Number(args.x0 ?? 0),
        Number(args.y0 ?? 0),
        Number(args.yp0 ?? 0),
        Number(args.xTarget ?? 1),
        500
      );
    } else if (name === 'numeric_complex_contour') {
      // 64-point circular Cauchy contour integral at r = 1e-4 around z0 (real) for f(z) given as JS real/imag or rational
      const z0 = Number(args.z0 ?? 0);
      const r = Number(args.radius ?? 1e-4);
      const numCoeffs = args.numeratorPolyCoeffs || [1]; // ascending or eval via complex expression
      const poleOrder = Number(args.poleOrder ?? 1);
      const N = 64;
      let sumRe = 0;
      let sumIm = 0;
      // Evaluate g(z) / (z - z0)^poleOrder where g(z) = exp(a*z), sin(a*z), cos(a*z), or polynomial
      const gKind = String(args.gKind || 'exp');
      const gParam = Number(args.gParam ?? 1);
      const evalG = (zr, zi) => {
        if (gKind === 'exp') {
          const ex = Math.exp(gParam * zr);
          return { re: ex * Math.cos(gParam * zi), im: ex * Math.sin(gParam * zi) };
        }
        if (gKind === 'sin') {
          return {
            re: Math.sin(gParam * zr) * Math.cosh(gParam * zi),
            im: Math.cos(gParam * zr) * Math.sinh(gParam * zi)
          };
        }
        if (gKind === 'cos') {
          return {
            re: Math.cos(gParam * zr) * Math.cosh(gParam * zi),
            im: -Math.sin(gParam * zr) * Math.sinh(gParam * zi)
          };
        }
        // polynomial in z with ascending coeffs numCoeffs
        let re = 0;
        let im = 0;
        let pr = 1;
        let pi = 0;
        for (const c of numCoeffs) {
          re += c * pr;
          im += c * pi;
          const npr = pr * zr - pi * zi;
          const npi = pr * zi + pi * zr;
          pr = npr;
          pi = npi;
        }
        return { re, im };
      };
      for (let k = 0; k < N; k++) {
        const th = (2 * Math.PI * k) / N;
        const dzRe = -r * Math.sin(th); // d(z)/dtheta = i r e^(i th) = r(-sin th + i cos th)
        const dzIm = r * Math.cos(th);
        // 1/(2*pi*i) * f(z) * (i * r * e^(i th)) dtheta = (1/2pi) * g(z) / (r^(m-1) * e^(i*(m-1)*th))
        const zr = z0 + r * Math.cos(th);
        const zi = r * Math.sin(th);
        const gv = evalG(zr, zi);
        const denomMag = r ** (poleOrder - 1);
        const ang = -(poleOrder - 1) * th;
        const cRe = Math.cos(ang) / denomMag;
        const cIm = Math.sin(ang) / denomMag;
        sumRe += gv.re * cRe - gv.im * cIm;
        sumIm += gv.re * cIm + gv.im * cRe;
        void dzRe;
        void dzIm;
      }
      result = {
        method: `64-point Cauchy contour quadrature (r=${r})`,
        residueReApprox: Number((sumRe / N).toFixed(6)),
        residueImApprox: Number((sumIm / N).toFixed(6))
      };
    } else {
      // General IEEE-754 floating-point JS Math expression evaluator
      const expr = String(args.expression || args.expr || '0');
      const fn = compileFloatExpr(expr, []);
      const val = fn();
      result = { floatValue: Number.isFinite(val) ? Number(val.toFixed(10)) : String(val) };
    }
    const floatMs = Number((performance.now() - t0).toFixed(3));
    return { ok: true, tool: name, floatMs, result };
  } catch (err) {
    const floatMs = Number((performance.now() - t0).toFixed(3));
    return { ok: false, tool: name, floatMs, error: String(err?.message || err) };
  }
}
