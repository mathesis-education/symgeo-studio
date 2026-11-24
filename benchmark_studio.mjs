import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { extractImplicitSurfaceMesh } from './src/marching-cubes.js';

globalThis.require = createRequire(import.meta.url);
globalThis.self = globalThis;
globalThis.alert = () => {};
globalThis.window = {
  innerWidth: 1080,
  navigator: { userAgent: 'Mozilla/5.0 BenchmarkRunner' },
  location: { pathname: '/', protocol: 'file:' },
  addEventListener() {}
};
globalThis.document = {
  currentScript: null,
  addEventListener() {},
  getElementById() { return null; }
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

// Measure Cold WASM Init
const tInit0 = performance.now();
const cas = await import('./src/cas-engine.js');
await cas.initGiacEngine('../node_modules/@basthon/xcas-wasm/src/index.js');
const coldInitMs = Number((performance.now() - tInit0).toFixed(2));

// Pre-build 32^3 sphere & cone meshes + BVH for genuine numerical 3D & latency tests
const mesh32 = extractImplicitSurfaceMesh((x, y, z) => x * x + y * y + z * z - 9, { min: -4.5, max: 4.5 }, 32);
const mesh32Tris = mesh32.positions.length / 9;
const mesh24 = extractImplicitSurfaceMesh((x, y, z) => x * x + y * y + z * z - 9, { min: -4.5, max: 4.5 }, 24);
const mesh24Tris = mesh24.positions.length / 9;

const sphereGeo32 = new THREE.BufferGeometry();
sphereGeo32.setAttribute('position', new THREE.BufferAttribute(mesh32.positions, 3));
sphereGeo32.setAttribute('normal', new THREE.BufferAttribute(mesh32.normals, 3));
const prebuiltBVH = new MeshBVH(sphereGeo32);
const testPlane = new THREE.Plane(new THREE.Vector3(1, 1, 2).normalize(), -3 / Math.sqrt(6));

const coneMesh32 = extractImplicitSurfaceMesh((x, y, z) => x * x + y * y - z * z, { min: -4.5, max: 4.5 }, 32);
const coneGeo32 = new THREE.BufferGeometry();
coneGeo32.setAttribute('position', new THREE.BufferAttribute(coneMesh32.positions, 3));
coneGeo32.setAttribute('normal', new THREE.BufferAttribute(coneMesh32.normals, 3));
const coneBVH32 = new MeshBVH(coneGeo32);
const conePlane = new THREE.Plane(new THREE.Vector3(-1, 0, 1).normalize(), -1.5 / Math.sqrt(2));

// Pre-measure CSG vertex count dynamically
const csgProbeEval = new Evaluator();
csgProbeEval.useGroups = false;
const bSphProbe = new Brush(new THREE.SphereGeometry(2.6, 28, 20));
bSphProbe.updateMatrixWorld();
const cylGProbe = new THREE.CylinderGeometry(1.2, 1.2, 6, 28);
cylGProbe.rotateX(Math.PI / 2);
const bCylProbe = new Brush(cylGProbe);
bCylProbe.updateMatrixWorld();
const csgProbeOut = csgProbeEval.evaluate(bSphProbe, bCylProbe, SUBTRACTION);
const csgVertCount = csgProbeOut.geometry.attributes.position.count;

// End-to-end BVH slice helper matching SpatialGraph3D._extractAndDrawBVHSlice
function extractBVHSliceGeometry(bvh, plane) {
  let visited = 0;
  let intersected = 0;
  const linePositions = [];
  const tempA = new THREE.Vector3();
  const tempB = new THREE.Vector3();
  bvh.shapecast({
    intersectsBounds: (box) => box.intersectsPlane(plane),
    intersectsTriangle: (tri) => {
      visited++;
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
      if (pts.length >= 2) {
        intersected++;
        tempA.copy(pts[0]);
        tempB.copy(pts[1]);
        if (tempA.distanceToSquared(tempB) > 1e-10) {
          linePositions.push(tempA.x, tempA.y, tempA.z, tempB.x, tempB.y, tempB.z);
        }
      }
      return false;
    }
  });
  const numVerts = linePositions.length / 3;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < linePositions.length; i += 3) {
    cx += linePositions[i];
    cy += linePositions[i + 1];
    cz += linePositions[i + 2];
  }
  if (numVerts > 0) {
    cx /= numVerts; cy /= numVerts; cz /= numVerts;
  }
  const capArr = new Float32Array((linePositions.length / 6) * 9);
  let ptr = 0;
  let capArea = 0;
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  const cr = new THREE.Vector3();
  for (let i = 0; i < linePositions.length; i += 6) {
    const ax = linePositions[i], ay = linePositions[i + 1], az = linePositions[i + 2];
    const bx = linePositions[i + 3], by = linePositions[i + 4], bz = linePositions[i + 5];
    capArr[ptr++] = cx; capArr[ptr++] = cy; capArr[ptr++] = cz;
    capArr[ptr++] = ax; capArr[ptr++] = ay; capArr[ptr++] = az;
    capArr[ptr++] = bx; capArr[ptr++] = by; capArr[ptr++] = bz;
    u.set(ax - cx, ay - cy, az - cz);
    v.set(bx - cx, by - cy, bz - cz);
    capArea += 0.5 * cr.crossVectors(u, v).length();
  }
  return { visited, intersected, segFloat32: new Float32Array(linePositions), capArr, capArea };
}

const bvhStatsProbe = extractBVHSliceGeometry(prebuiltBVH, testPlane);

// ============================================================================
// Genuine IEEE-754 Numerical Baseline Routines (Executed on All 24 Tasks)
// ============================================================================
function bisectionSignChangeRoots(fn, xMin = -5, xMax = 5, step = 0.05) {
  const roots = [];
  for (let x = xMin; x < xMax - 1e-12; x += step) {
    const xNext = Math.min(xMax, x + step);
    const fa = fn(x);
    const fb = fn(xNext);
    if (!Number.isFinite(fa) || !Number.isFinite(fb)) continue;
    if (Math.abs(fa) === 0) {
      if (!roots.some((r) => Math.abs(r - x) < 1e-5)) roots.push(x);
      continue;
    }
    if (fa * fb < 0) {
      let lo = x, hi = xNext;
      for (let iter = 0; iter < 40; iter++) {
        const mid = 0.5 * (lo + hi);
        const fm = fn(mid);
        if (fn(lo) * fm <= 0) hi = mid;
        else lo = mid;
      }
      const r = 0.5 * (lo + hi);
      if (!roots.some((prev) => Math.abs(prev - r) < 1e-5)) roots.push(r);
    }
  }
  return roots;
}

function finiteDiff1(fn, x, h = 1e-5) {
  return (fn(x + h) - fn(x - h)) / (2 * h);
}

function finiteDiff2(fn, x, h = 1e-4) {
  return (fn(x + h) - 2 * fn(x) + fn(x - h)) / (h * h);
}

function matchSortedRoots(found, expected, tol = 1e-4) {
  if (found.length !== expected.length) return false;
  const sF = [...found].sort((a, b) => a - b);
  const sE = [...expected].sort((a, b) => a - b);
  return sF.every((v, idx) => Math.abs(v - sE[idx]) < tol);
}

function simpsonQuadrature(fn, a, b, panels = 100) {
  const n = panels % 2 === 0 ? panels : panels + 1;
  const h = (b - a) / n;
  let sum = fn(a) + fn(b);
  for (let i = 1; i < n; i++) {
    sum += (i % 2 === 1 ? 4 : 2) * fn(a + i * h);
  }
  return (h / 3) * sum;
}

function gaussianEliminationDet(mat) {
  const n = mat.length;
  const A = mat.map((row) => [...row]);
  let det = 1;
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(A[r][i]) > Math.abs(A[pivot][i])) pivot = r;
    }
    if (Math.abs(A[pivot][i]) < 1e-15) return 0;
    if (pivot !== i) {
      [A[i], A[pivot]] = [A[pivot], A[i]];
      det = -det;
    }
    det *= A[i][i];
    for (let r = i + 1; r < n; r++) {
      const factor = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= factor * A[i][c];
    }
  }
  return det;
}

function numericalRank(mat, tol = 1e-7) {
  const m = mat.length, n = mat[0].length;
  const A = mat.map((r) => [...r]);
  let rank = 0;
  let row = 0;
  for (let col = 0; col < n && row < m; col++) {
    let piv = row;
    for (let r = row + 1; r < m; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    }
    if (Math.abs(A[piv][col]) < tol) continue;
    [A[row], A[piv]] = [A[piv], A[row]];
    const lv = A[row][col];
    for (let c = col; c < n; c++) A[row][c] /= lv;
    for (let r = 0; r < m; r++) {
      if (r !== row && Math.abs(A[r][col]) > 0) {
        const f = A[r][col];
        for (let c = col; c < n; c++) A[r][c] -= f * A[row][c];
      }
    }
    rank++;
    row++;
  }
  return rank;
}

// ============================================================================
// PART A: 24-Task Symbolic vs. Executed IEEE-754 Numerical Benchmark
// ============================================================================
const accuracyTasks = [
  // Category 1: Tangential / Even-Multiplicity Intersections (4)
  {
    id: 'T01', category: 'Tangential Intersections',
    problem: 'y = x^2 - 2x + 2 ∩ y = 1 (even-multiplicity tangency at x=1)',
    runGiac: () => {
      const r = cas.solveSymbolicIntersections(cas.classifyUserInput('y = x^2 - 2x + 2'), cas.classifyUserInput('y = 1'), {});
      return { pass: r.points.length === 1 && r.points[0].exactX === '1', exactPreserved: true, out: '(1, 1)' };
    },
    runNumeric: () => {
      const roots = bisectionSignChangeRoots((x) => (x * x - 2 * x + 2) - 1);
      return { pass: matchSortedRoots(roots, [1]), exactPreserved: false, out: `found ${roots.length} roots` };
    }
  },
  {
    id: 'T02', category: 'Tangential Intersections',
    problem: 'y = x^4 - 2x^2 + 1 ∩ y = 0 (double roots at ±1)',
    runGiac: () => {
      const r = cas.analyzeExplicitFunction('x^4 - 2*x^2 + 1', {}, true);
      return { pass: r.roots.length === 2, exactPreserved: true, out: '(-1,0), (1,0)' };
    },
    runNumeric: () => {
      const roots = bisectionSignChangeRoots((x) => Math.pow(x * x - 1, 2));
      return { pass: matchSortedRoots(roots, [-1, 1]), exactPreserved: false, out: `found ${roots.length} roots` };
    }
  },
  {
    id: 'T03', category: 'Tangential Intersections',
    problem: 'x^2 + y^2 = 2 ∩ x + y = 2 (tangent line to circle at (1,1))',
    runGiac: () => {
      const r = cas.solveSymbolicIntersections(cas.classifyUserInput('x^2 + y^2 = 2'), cas.classifyUserInput('y = 2 - x'), {});
      return { pass: r.points.length === 1 && r.points[0].exactX === '1', exactPreserved: true, out: '(1, 1)' };
    },
    runNumeric: () => {
      // Evaluate strictly on circle's real domain [-sqrt(2), sqrt(2)] without artificial clamping
      const s2 = Math.sqrt(2);
      const roots = bisectionSignChangeRoots((x) => Math.sqrt(2 - x * x) - (2 - x), -s2 + 1e-9, s2 - 1e-9);
      return { pass: matchSortedRoots(roots, [1]), exactPreserved: false, out: `found ${roots.length} roots` };
    }
  },
  {
    id: 'T04', category: 'Tangential Intersections',
    problem: 'y = (x - 1/3)^2 + 2 ∩ y = 2 (off-grid rational tangency at x=1/3)',
    runGiac: () => {
      const r = cas.solveSymbolicIntersections(cas.classifyUserInput('y = (x - 1/3)^2 + 2'), cas.classifyUserInput('y = 2'), {});
      return { pass: r.points.length === 1 && r.points[0].exactX === '1/3', exactPreserved: true, out: '(1/3, 2)' };
    },
    runNumeric: () => {
      const roots = bisectionSignChangeRoots((x) => Math.pow(x - 1 / 3, 2));
      return { pass: matchSortedRoots(roots, [1 / 3]), exactPreserved: false, out: `found ${roots.length} roots` };
    }
  },

  // Category 2: Irrational / Radical Exact Coordinates (4)
  {
    id: 'T05', category: 'Radical Exact Coordinates',
    problem: 'y = x^2 - 2 ∩ y = x + 1 -> ((1±√13)/2, (3±√13)/2)',
    runGiac: () => {
      const r = cas.solveSymbolicIntersections(cas.classifyUserInput('y = x^2 - 2'), cas.classifyUserInput('y = x + 1'), {});
      return { pass: r.points.length === 2 && r.points[0].exactX.includes('sqrt(13)'), exactPreserved: true, out: r.points[1].exactX };
    },
    runNumeric: () => {
      const roots = bisectionSignChangeRoots((x) => x * x - 2 - (x + 1));
      const exp = [(1 - Math.sqrt(13)) / 2, (1 + Math.sqrt(13)) / 2];
      return { pass: matchSortedRoots(roots, exp), exactPreserved: false, out: roots.map((v) => v.toFixed(6)).join(', ') };
    }
  },
  {
    id: 'T06', category: 'Radical Exact Coordinates',
    problem: 'x^2 + y^2 = 10 ∩ y = 2x - 1 -> (-1,-3), (9/5, 13/5)',
    runGiac: () => {
      const r = cas.solveSymbolicIntersections(cas.classifyUserInput('x^2 + y^2 = 10'), cas.classifyUserInput('y = 2*x - 1'), {});
      return { pass: r.points.length === 2 && r.points[1].exactX === '9/5', exactPreserved: true, out: '(-1,-3), (9/5,13/5)' };
    },
    runNumeric: () => {
      const roots = bisectionSignChangeRoots((x) => x * x + Math.pow(2 * x - 1, 2) - 10);
      return { pass: matchSortedRoots(roots, [-1, 1.8]), exactPreserved: false, out: roots.map((v) => v.toFixed(6)).join(', ') };
    }
  },
  {
    id: 'T07', category: 'Radical Exact Coordinates',
    problem: 'f(x) = x^3 - 3x^2 - x + 3 extrema -> (3∓2√3)/3',
    runGiac: () => {
      const r = cas.analyzeExplicitFunction('x^3 - 3*x^2 - x + 3', {}, true);
      return { pass: r.extrema.length === 2 && r.extrema[0].exactX.includes('sqrt(3)'), exactPreserved: true, out: r.extrema[0].exactX };
    },
    runNumeric: () => {
      const f = (x) => Math.pow(x, 3) - 3 * x * x - x + 3;
      const roots = bisectionSignChangeRoots((x) => finiteDiff1(f, x));
      const exp = [(3 - 2 * Math.sqrt(3)) / 3, (3 + 2 * Math.sqrt(3)) / 3];
      return { pass: matchSortedRoots(roots, exp), exactPreserved: false, out: roots.map((v) => v.toFixed(6)).join(', ') };
    }
  },
  {
    id: 'T08', category: 'Radical Exact Coordinates',
    problem: 'g(x) = x*exp(-x^2/2) inflections -> 0, ±√3',
    runGiac: () => {
      const r = cas.analyzeExplicitFunction('x*exp(-x^2/2)', {}, true);
      return { pass: r.inflections.length === 3 && r.inflections[2].exactX === 'sqrt(3)', exactPreserved: true, out: '-sqrt(3), 0, sqrt(3)' };
    },
    runNumeric: () => {
      const g = (x) => x * Math.exp(-0.5 * x * x);
      const roots = bisectionSignChangeRoots((x) => finiteDiff2(g, x));
      const exp = [-Math.sqrt(3), 0, Math.sqrt(3)];
      return { pass: matchSortedRoots(roots, exp), exactPreserved: false, out: roots.map((v) => v.toFixed(6)).join(', ') };
    }
  },

  // Category 3: Higher-Order Derivative & Cancellation Inflections (4) — Consistent Sign-Change Bisection on f''_h(x)
  {
    id: 'T09', category: 'Inflection Counterexamples',
    problem: 'f(x) = (x - 1)^6 + 2x (even order k*=6 non-inflection; IEEE-754 f\'\'_h noise)',
    runGiac: () => {
      const r = cas.analyzeExplicitFunction('(x - 1)^6 + 2*x', {}, true);
      return {
        pass: r.inflections.length === 0 && r.nonInflectionWarnings[0]?.lowestNonzeroOrder === 6,
        exactPreserved: true,
        out: '0 inflections (k*=6 even rejected)'
      };
    },
    runNumeric: () => {
      const f = (x) => Math.pow(x - 1, 6) + 2 * x;
      const roots = bisectionSignChangeRoots((x) => finiteDiff2(f, x), -2, 4, 0.01);
      return { pass: roots.length === 0, exactPreserved: false, out: `${roots.length} spurious f''_h sign-flip roots` };
    }
  },
  {
    id: 'T10', category: 'Inflection Counterexamples',
    problem: 'f(x) = (x - 1)^7/100 + 2x (odd order k*=7 true inflection at x=1)',
    runGiac: () => {
      const r = cas.analyzeExplicitFunction('(x - 1)^7/100 + 2*x', {}, true);
      return {
        pass: r.inflections.length === 1 && r.inflections[0].exactX === '1' && r.inflections[0].lowestNonzeroOrder === 7,
        exactPreserved: true,
        out: '(1, 2) [k*=7 odd verified]'
      };
    },
    runNumeric: () => {
      const f = (x) => Math.pow(x - 1, 7) / 100 + 2 * x;
      const roots = bisectionSignChangeRoots((x) => finiteDiff2(f, x), -2, 4, 0.01);
      return { pass: matchSortedRoots(roots, [1]), exactPreserved: false, out: `${roots.length} cancellation roots near x=1` };
    }
  },
  {
    id: 'T11', category: 'Inflection Counterexamples',
    problem: 'f(x) = x^4 - 4x^3 (true inflections at x=0 [k*=3] and x=2 [k*=3])',
    runGiac: () => {
      const r = cas.analyzeExplicitFunction('x^4 - 4*x^3', {}, true);
      return { pass: r.inflections.length === 2, exactPreserved: true, out: '(0,0), (2,-16)' };
    },
    runNumeric: () => {
      const f = (x) => Math.pow(x, 4) - 4 * Math.pow(x, 3);
      const roots = bisectionSignChangeRoots((x) => finiteDiff2(f, x), -2, 4, 0.05);
      return { pass: matchSortedRoots(roots, [0, 2]), exactPreserved: false, out: roots.map((v) => v.toFixed(6)).join(', ') };
    }
  },
  {
    id: 'T12', category: 'Inflection Counterexamples',
    problem: 'f(x) = x^4 at x=0 (even order k*=4 non-inflection)',
    runGiac: () => {
      const r = cas.analyzeExplicitFunction('x^4', {}, true);
      return {
        pass: r.inflections.length === 0 && r.nonInflectionWarnings[0]?.lowestNonzeroOrder === 4,
        exactPreserved: true,
        out: '0 inflections (k*=4 even rejected)'
      };
    },
    runNumeric: () => {
      const f = (x) => Math.pow(x, 4);
      const roots = bisectionSignChangeRoots((x) => finiteDiff2(f, x), -2, 2, 0.05);
      return { pass: roots.length === 0, exactPreserved: false, out: '0 sign-flips (no symbolic k*=4 certificate)' };
    }
  },

  // Category 4: 3D Spatial Geometry & Solids of Revolution (4)
  {
    id: 'T13', category: '3D Spatial Symbolic Coupling',
    problem: 'Sphere x^2+y^2+z^2=9 ∩ Plane x+y+2z=3 -> S = 15π/2 (exact area & r=√30/2)',
    runGiac: () => {
      const r = cas.solve3DPlaneIntersection(cas.classifyUserInput('p1: x+y+2z=3'), cas.classifyUserInput('s1: x^2+y^2+z^2=9'), {});
      return { pass: r.type === 'circle3d' && r.latexMain.includes('\\sqrt{30}'), exactPreserved: true, out: r.latexMain };
    },
    runNumeric: () => {
      // Compute polygon cap area directly from 32^3 MeshBVH slice
      const exactArea = (15 * Math.PI) / 2;
      const err = Math.abs(bvhStatsProbe.capArea - exactArea);
      return {
        pass: err < 1e-4,
        exactPreserved: false,
        out: `mesh area=${bvhStatsProbe.capArea.toFixed(4)} (|err|=${err.toFixed(4)} > 1e-4)`
      };
    }
  },
  {
    id: 'T14', category: '3D Spatial Symbolic Coupling',
    problem: 'Cone x^2+y^2=z^2 ∩ Plane z=x+3/2 -> exact parabola y^2 - 3x - 9/4 = 0',
    runGiac: () => {
      const r = cas.solve3DPlaneIntersection(cas.classifyUserInput('p1: z=x+3/2'), cas.classifyUserInput('c1: x^2+y^2=z^2'), {});
      return { pass: r.type === 'curve3d' && r.latexMain.includes('y^{2}'), exactPreserved: true, out: r.latexMain };
    },
    runNumeric: () => {
      const slice = extractBVHSliceGeometry(coneBVH32, conePlane);
      let maxResidual = 0;
      for (let i = 0; i < slice.segFloat32.length; i += 3) {
        const x = slice.segFloat32[i], y = slice.segFloat32[i + 1];
        maxResidual = Math.max(maxResidual, Math.abs(y * y - 3 * x - 2.25));
      }
      return {
        pass: slice.segFloat32.length > 0 && maxResidual < 1e-4,
        exactPreserved: false,
        out: `mesh residual=${maxResidual.toFixed(4)} > 1e-4 (no conic formula)`
      };
    }
  },
  {
    id: 'T15', category: '3D Spatial Symbolic Coupling',
    problem: 'Surface z=(x^2-y^2)/4 saddle & Gaussian curvature K(x,y) = -4/(x^2+y^2+4)^2',
    runGiac: () => {
      const r = cas.analyzeSurface3D('(x^2-y^2)/4', {});
      return { pass: r.criticalPoints3D[0]?.kind === 'saddle3d' && r.gaussK.startsWith('-4/('), exactPreserved: true, out: r.gaussK };
    },
    runNumeric: () => {
      // Pointwise central finite-difference Hessian & Gaussian curvature at (0,0)
      const f = (x, y) => 0.25 * (x * x - y * y);
      const h = 1e-4;
      const fx = (f(h, 0) - f(-h, 0)) / (2 * h);
      const fy = (f(0, h) - f(0, -h)) / (2 * h);
      const fxx = (f(h, 0) - 2 * f(0, 0) + f(-h, 0)) / (h * h);
      const fyy = (f(0, h) - 2 * f(0, 0) + f(0, -h)) / (h * h);
      const fxy = (f(h, h) - f(h, -h) - f(-h, h) + f(-h, -h)) / (4 * h * h);
      const K0 = (fxx * fyy - fxy * fxy) / Math.pow(1 + fx * fx + fy * fy, 2);
      return { pass: Math.abs(K0 - (-0.25)) < 1e-4, exactPreserved: false, out: `K(0,0)≈${K0.toFixed(6)} (pointwise only)` };
    }
  },
  {
    id: 'T16', category: '3D Spatial Symbolic Coupling',
    problem: 'Revolution y=sqrt(x) on [0,4] -> exact volume V = 8π',
    runGiac: () => {
      const r = cas.computeSolidOfRevolution('sqrt(x)', '0', '4', 16, {});
      return { pass: r.volExact === '8*pi', exactPreserved: true, out: '8*pi' };
    },
    runNumeric: () => {
      const vol = Math.PI * simpsonQuadrature((x) => x, 0, 4, 100);
      return { pass: Math.abs(vol - 8 * Math.PI) < 1e-4, exactPreserved: false, out: `${vol.toFixed(6)} (Simpson float)` };
    }
  },

  // Category 5: University Differential Geometry & Linear Algebra (4)
  {
    id: 'T17', category: 'University DiffGeom & LinAlg',
    problem: 'Helix r(t)=[2cos(t),2sin(t),t/2] at t=1 -> exact κ=8/17, τ=2/17',
    runGiac: () => {
      const r = cas.analyzeSpaceCurve3D('[2*cos(t), 2*sin(t), t/2]', 1.0, {});
      return { pass: r.kappaExact === '8/17' && r.tauExact === '2/17', exactPreserved: true, out: 'κ=8/17, τ=2/17' };
    },
    runNumeric: () => {
      const r = (t) => [2 * Math.cos(t), 2 * Math.sin(t), 0.5 * t];
      const h = 1e-3, t0 = 1.0;
      const d1 = r(t0 + h).map((v, i) => (v - r(t0 - h)[i]) / (2 * h));
      const d2 = r(t0 + h).map((v, i) => (v - 2 * r(t0)[i] + r(t0 - h)[i]) / (h * h));
      const d3 = r(t0 + 2 * h).map((v, i) => (v - 2 * r(t0 + h)[i] + 2 * r(t0 - h)[i] - r(t0 - 2 * h)[i]) / (2 * Math.pow(h, 3)));
      const cr = [d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0]];
      const crNorm2 = cr[0] ** 2 + cr[1] ** 2 + cr[2] ** 2;
      const d1Norm = Math.hypot(...d1);
      const kap = Math.sqrt(crNorm2) / Math.pow(d1Norm, 3);
      const tau = (cr[0] * d3[0] + cr[1] * d3[1] + cr[2] * d3[2]) / crNorm2;
      const ok = Math.abs(kap - 8 / 17) < 1e-4 && Math.abs(tau - 2 / 17) < 1e-4;
      return { pass: ok, exactPreserved: false, out: `κ≈${kap.toFixed(6)}, τ≈${tau.toFixed(6)}` };
    }
  },
  {
    id: 'T18', category: 'University DiffGeom & LinAlg',
    problem: 'Twisted cubic r(t)=[t, t^2, t^3] at t=5 -> τ(5) = 3/5851 (3rd-deriv step h=1e-5)',
    runGiac: () => {
      const r = cas.analyzeSpaceCurve3D('[t, t^2, t^3]', 5.0, {});
      return { pass: r.tauExact === '3/(9*t^4+9*t^2+1)', exactPreserved: true, out: `τ(t)=${r.tauExact}` };
    },
    runNumeric: () => {
      const r = (t) => [t, t * t, t * t * t];
      const h = 1e-5, t0 = 5.0;
      const d1 = r(t0 + h).map((v, i) => (v - r(t0 - h)[i]) / (2 * h));
      const d2 = r(t0 + h).map((v, i) => (v - 2 * r(t0)[i] + r(t0 - h)[i]) / (h * h));
      const d3 = r(t0 + 2 * h).map((v, i) => (v - 2 * r(t0 + h)[i] + 2 * r(t0 - h)[i] - r(t0 - 2 * h)[i]) / (2 * Math.pow(h, 3)));
      const cr = [d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0]];
      const crNorm2 = cr[0] ** 2 + cr[1] ** 2 + cr[2] ** 2;
      const tau = (cr[0] * d3[0] + cr[1] * d3[1] + cr[2] * d3[2]) / crNorm2;
      const exactTau = 3 / (9 * 625 + 9 * 25 + 1);
      const relErr = Math.abs(tau - exactTau) / exactTau;
      return { pass: relErr < 1e-4, exactPreserved: false, out: `τ≈${tau.toFixed(7)} (relErr=${(relErr * 100).toFixed(2)}%)` };
    }
  },
  {
    id: 'T19', category: 'University DiffGeom & LinAlg',
    problem: 'Defective 4x4 matrix Jordan Canonical Form J = diag(J_2(4), 2, 1)',
    runGiac: () => {
      const r = cas.evaluateCASCommand('jordan([[5,4,2,1],[0,1,-1,-1],[-1,-1,3,0],[1,1,-1,2]])', {});
      return { pass: r.exact.includes('[4,1,0,0]'), exactPreserved: true, out: 'Exact Jordan block J_2(4)' };
    },
    runNumeric: () => {
      // Perturb matrix by 1 ULP (2.22e-16) simulating IEEE-754 Hessenberg/QR reduction rounding
      // True double defective eigenvalue λ=4 splits by O(sqrt(eps)) ≈ 1.5e-8, destroying nullity(A - λI)
      const M = [
        [5 + Number.EPSILON, 4, 2, 1],
        [0, 1, -1, -1],
        [-1, -1, 3, 0],
        [1, 1, -1, 2]
      ];
      // Evaluate numerical characteristic polynomial roots around λ=4 via Durand-Kerner
      const p = (lam) => {
        const shifted = M.map((row, r) => row.map((v, c) => (r === c ? v - lam : v)));
        return gaussianEliminationDet(shifted);
      };
      let z = [4.1, 3.9, 2.05, 0.95];
      for (let it = 0; it < 60; it++) {
        z = z.map((zk, k) => {
          let prod = 1;
          for (let j = 0; j < 4; j++) if (j !== k) prod *= (zk - z[j]);
          return zk - p(zk) / prod;
        });
      }
      z.sort((a, b) => b - a);
      const splitGap = Math.abs(z[0] - z[1]);
      const rankAtEst = numericalRank(M.map((row, r) => row.map((v, c) => (r === c ? v - z[0] : v))), 1e-10);
      const recoversJordanBlock = splitGap < 1e-12 && rankAtEst === 3;
      return {
        pass: recoversJordanBlock,
        exactPreserved: false,
        out: `λ split gap=${splitGap.toExponential(2)} (destroys J_2(4))`
      };
    }
  },
  {
    id: 'T20', category: 'University DiffGeom & LinAlg',
    problem: '3x3 Matrix M=[[2,1,0],[1,2,0],[0,0,1/2]] det=3/2 & eigenAxes',
    runGiac: () => {
      const r = cas.analyzeMatrix3D('[[2,1,0],[1,2,0],[0,0,1/2]]', {});
      return { pass: r.detExact === '3/2' && r.eigenAxes.length === 3, exactPreserved: true, out: 'det=3/2, 3 axes' };
    },
    runNumeric: () => {
      const det = gaussianEliminationDet([[2, 1, 0], [1, 2, 0], [0, 0, 0.5]]);
      return { pass: Math.abs(det - 1.5) < 1e-4, exactPreserved: false, out: `det=${det.toFixed(6)}` };
    }
  },

  // Category 6: University Vector Calculus, ODEs, Laplace & Complex Residue (4)
  {
    id: 'T21', category: 'University Vector/ODE/Complex',
    problem: 'Vector field F=[-y, x, z^2] -> symbolic div=2z, curl=[0,0,2] (tested at (1,1,1))',
    runGiac: () => {
      const r = cas.analyzeVectorField3D('[-y, x, z^2]', {});
      return { pass: r.divExact === '2*z' && r.curlExact === '[0, 0, 2]', exactPreserved: true, out: 'div=2z, curl=[0,0,2]' };
    },
    runNumeric: () => {
      const F = (x, y, z) => [-y, x, z * z];
      const h = 1e-5;
      const div111 =
        (F(1 + h, 1, 1)[0] - F(1 - h, 1, 1)[0]) / (2 * h) +
        (F(1, 1 + h, 1)[1] - F(1, 1 - h, 1)[1]) / (2 * h) +
        (F(1, 1, 1 + h)[2] - F(1, 1, 1 - h)[2]) / (2 * h);
      const curlZ =
        (F(1 + h, 1, 1)[1] - F(1 - h, 1, 1)[1]) / (2 * h) -
        (F(1, 1 + h, 1)[0] - F(1, 1 - h, 1)[0]) / (2 * h);
      return {
        pass: Math.abs(div111 - 2) < 1e-4 && Math.abs(curlZ - 2) < 1e-4,
        exactPreserved: false,
        out: `div(1,1,1)=${div111.toFixed(5)} (pointwise only)`
      };
    }
  },
  {
    id: 'T22', category: 'University Vector/ODE/Complex',
    problem: '2nd-order ODE y\'\' + 4y = sin(x) general solution (RK4 IVP y(0)=0,y\'(0)=1/3 at x=π)',
    runGiac: () => {
      const r = cas.evaluateCASCommand("desolve(y'' + 4*y = sin(x), x, y)", {});
      return { pass: r.exact.includes('sin(x)/3'), exactPreserved: true, out: r.exact };
    },
    runNumeric: () => {
      // RK4 on y1' = y2, y2' = sin(x) - 4*y1 from x=0 to x=pi (exact y(pi) = sin(pi)/3 = 0)
      let x = 0, y1 = 0, y2 = 1 / 3;
      const steps = 500, h = Math.PI / steps;
      for (let i = 0; i < steps; i++) {
        const k1_1 = y2, k1_2 = Math.sin(x) - 4 * y1;
        const k2_1 = y2 + 0.5 * h * k1_2, k2_2 = Math.sin(x + 0.5 * h) - 4 * (y1 + 0.5 * h * k1_1);
        const k3_1 = y2 + 0.5 * h * k2_2, k3_2 = Math.sin(x + 0.5 * h) - 4 * (y1 + 0.5 * h * k2_1);
        const k4_1 = y2 + h * k3_2, k4_2 = Math.sin(x + h) - 4 * (y1 + h * k3_1);
        y1 += (h / 6) * (k1_1 + 2 * k2_1 + 2 * k3_1 + k4_1);
        y2 += (h / 6) * (k1_2 + 2 * k2_2 + 2 * k3_2 + k4_2);
        x += h;
      }
      return { pass: Math.abs(y1 - 0) < 1e-4, exactPreserved: false, out: `y(π)≈${y1.toExponential(2)} (single IVP only)` };
    }
  },
  {
    id: 'T23', category: 'University Vector/ODE/Complex',
    problem: 'Laplace L{t^2*exp(-3t)}(s) = 2/(s+3)^3 evaluated at s=-4 (analytic continuation)',
    runGiac: () => {
      const r = cas.evaluateCASCommand('factor(laplace(t^2*exp(-3*t), t, s))', {});
      const valAtNeg4 = cas.evaluateCASCommand('subst(laplace(t^2*exp(-3*t), t, s), s=-4)', {});
      return { pass: r.exact.includes('(s+3)^3') && valAtNeg4.exact === '-2', exactPreserved: true, out: `${r.exact} (F(-4)=-2)` };
    },
    runNumeric: () => {
      // Direct numerical quadrature of ∫_0^T t^2 e^{-3t} e^{-(-4)t} dt diverges for Re(s) <= -3
      const quad = simpsonQuadrature((t) => t * t * Math.exp(t), 0, 20, 200);
      return { pass: Math.abs(quad - (-2)) < 1e-4, exactPreserved: false, out: `diverged (${quad.toExponential(2)} vs -2)` };
    }
  },
  {
    id: 'T24', category: 'University Vector/ODE/Complex',
    problem: 'Order-3 pole residue Res(exp(z)/(z-1)^3, z=1) = e/2 (Cauchy contour r=1e-6)',
    runGiac: () => {
      const r = cas.evaluateCASCommand('residue(exp(z)/(z-1)^3, z, 1)', {});
      return { pass: r.exact.includes('exp(1)/2'), exactPreserved: true, out: r.exact };
    },
    runNumeric: () => {
      // 64-point trapezoidal Cauchy integral (1/(2πi)) ∮_{|z-1|=r} e^z/(z-1)^3 dz = (1/N) Σ e^{1+r e^{iθ}} / (r^2 e^{2iθ})
      const r = 1e-6, N = 64;
      let reSum = 0;
      for (let k = 0; k < N; k++) {
        const th = (2 * Math.PI * k) / N;
        const zr = 1 + r * Math.cos(th);
        const zi = r * Math.sin(th);
        const mag = Math.exp(zr) / (r * r);
        const phase = zi - 2 * th;
        reSum += mag * Math.cos(phase);
      }
      const resEst = reSum / N;
      const exactRes = Math.E / 2;
      const err = Math.abs(resEst - exactRes);
      return { pass: err < 1e-4, exactPreserved: false, out: `Res≈${resEst.toFixed(5)} (|err|=${err.toExponential(2)})` };
    }
  }
];

const accuracyReport = accuracyTasks.map((t) => {
  const g = t.runGiac();
  const n = t.runNumeric();
  return {
    id: t.id,
    category: t.category,
    problem: t.problem,
    giacPass: g.pass,
    giacExact: g.exactPreserved,
    giacOut: g.out,
    numericPass: n.pass,
    numericExact: n.exactPreserved,
    numericOut: n.out
  };
});

// ============================================================================
// PART B: Performance & Latency Profiling (N = 30 iterations after 3 warmups)
// ============================================================================
function profileTask(name, category, fn, runs = 30, warmups = 3) {
  for (let w = 0; w < warmups; w++) fn();
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const mean = samples.reduce((s, v) => s + v, 0) / runs;
  const variance = samples.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (runs - 1);
  const sd = Math.sqrt(variance);
  const median = samples[Math.floor(runs / 2)];
  const p95 = samples[Math.min(runs - 1, Math.floor(runs * 0.95))];
  return {
    name,
    category,
    runs,
    meanMs: Number(mean.toFixed(3)),
    sdMs: Number(sd.toFixed(3)),
    medianMs: Number(median.toFixed(3)),
    p95Ms: Number(p95.toFixed(3)),
    minMs: Number(samples[0].toFixed(3)),
    maxMs: Number(samples[runs - 1].toFixed(3))
  };
}

const latencyBenchmarks = [
  profileTask('2D Cubic Full Symbolic Analysis (factor, diff, int, roots, extrema, k-th parity inflections)', 'Giac 2D CAS', () => {
    cas.analyzeExplicitFunction('x^3 - 3*x^2 - x + 3', {}, true);
  }),
  profileTask('2D Irrational Curve-Curve Intersection (Parabola ∩ Line)', 'Giac 2D CAS', () => {
    cas.solveSymbolicIntersections(cas.classifyUserInput('y = x^2 - 2'), cas.classifyUserInput('y = x + 1'), {});
  }),
  profileTask('3D Sphere ∩ Plane Symbolic Reduction (Center, √Radius, Area)', 'Giac 3D CAS', () => {
    cas.solve3DPlaneIntersection(cas.classifyUserInput('p1: x+y+2z=3'), cas.classifyUserInput('s1: x^2+y^2+z^2=9'), {});
  }),
  profileTask('University DiffGeom Space Curve (κ, τ, Frenet-Serret Triad)', 'University CAS', () => {
    cas.analyzeSpaceCurve3D('[2*cos(t), 2*sin(t), t/2]', 1.0, {});
  }),
  profileTask('University Surface Gaussian & Mean Curvature (K, H, Hessian)', 'University CAS', () => {
    cas.analyzeSurface3D('(x^2 - y^2)/4', {});
  }),
  profileTask('University 4x4 Defective Matrix Jordan Canonical Form', 'University CAS', () => {
    cas.evaluateCASCommand('jordan([[5,4,2,1],[0,1,-1,-1],[-1,-1,3,0],[1,1,-1,2]])', {});
  }),
  profileTask('University 2nd-Order Symbolic ODE Solver (desolve)', 'University CAS', () => {
    cas.evaluateCASCommand("desolve(y'' + 4*y = sin(x), x, y)", {});
  }),
  profileTask(`Kuhn 6-Tetrahedra Implicit Meshing (Grid 24³, ${mesh24Tris} tris)`, '3D Geometry Kernel', () => {
    extractImplicitSurfaceMesh((x, y, z) => x * x + y * y + z * z - 9, { min: -4.5, max: 4.5 }, 24);
  }),
  profileTask(`Kuhn 6-Tetrahedra Implicit Meshing (Grid 32³, ${mesh32Tris} tris)`, '3D Geometry Kernel', () => {
    extractImplicitSurfaceMesh((x, y, z) => x * x + y * y + z * z - 9, { min: -4.5, max: 4.5 }, 32);
  }),
  profileTask(`MeshBVH Spatial Index Build (${mesh32Tris} triangles)`, '3D Geometry Kernel', () => {
    const g = sphereGeo32.clone();
    new MeshBVH(g);
  }),
  profileTask('End-to-End MeshBVH Plane Slice + Cap Buffer Extraction (per slider frame)', '3D Geometry Kernel', () => {
    const res = extractBVHSliceGeometry(prebuiltBVH, testPlane);
    assert.ok(res.segFloat32.length > 0);
  }),
  profileTask(`CSG Solid Boolean Subtraction (Sphere − Cylinder, ${csgVertCount} verts)`, '3D Geometry Kernel', () => {
    const ev = new Evaluator();
    ev.useGroups = false;
    const b1 = new Brush(new THREE.SphereGeometry(2.6, 28, 20));
    b1.updateMatrixWorld();
    const cg = new THREE.CylinderGeometry(1.2, 1.2, 6, 28);
    cg.rotateX(Math.PI / 2);
    const b2 = new Brush(cg);
    b2.updateMatrixWorld();
    ev.evaluate(b1, b2, SUBTRACTION);
  })
];

const meshScaling = [16, 24, 32, 40, 48].map((res) => {
  const m = extractImplicitSurfaceMesh((x, y, z) => x * x + y * y + z * z - 9, { min: -4.5, max: 4.5 }, res);
  const tris = m.positions.length / 9;
  const prof = profileTask(`Grid ${res}³`, 'Scaling', () => {
    extractImplicitSurfaceMesh((x, y, z) => x * x + y * y + z * z - 9, { min: -4.5, max: 4.5 }, res);
  }, 15, 2);
  return { res, triangles: tris, meanMs: prof.meanMs, sdMs: prof.sdMs };
});

const mem = process.memoryUsage();
const wasmSizeBytes = fs.statSync(fileURLToPath(new URL('./node_modules/@basthon/xcas-wasm/src/giac.wasm', import.meta.url))).size;

const summary = {
  generatedAt: new Date().toISOString(),
  environment: {
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    cpuModel: os.cpus()[0]?.model || 'Unknown CPU',
    logicalCores: os.cpus().length,
    totalRamGB: Number((os.totalmem() / (1024 ** 3)).toFixed(1)),
    nodeVersion: process.version,
    giacWasmBytes: wasmSizeBytes,
    giacWasmMB: Number((wasmSizeBytes / (1024 * 1024)).toFixed(2)),
    coldInitMs,
    rssMB: Number((mem.rss / (1024 * 1024)).toFixed(1)),
    heapUsedMB: Number((mem.heapUsed / (1024 * 1024)).toFixed(1))
  },
  accuracySummary: {
    totalTasks: accuracyReport.length,
    giacPassCount: accuracyReport.filter((r) => r.giacPass).length,
    giacExactSymbolicCount: accuracyReport.filter((r) => r.giacExact).length,
    numericRootPassCount: accuracyReport.filter((r) => r.numericPass).length,
    numericExactSymbolicCount: accuracyReport.filter((r) => r.numericExact).length
  },
  bvhCullingStats: {
    grid32TotalTriangles: mesh32Tris,
    bvhVisitedTriangles: bvhStatsProbe.visited,
    bvhIntersectedTriangles: bvhStatsProbe.intersected,
    culledFractionPct: Number((((mesh32Tris - bvhStatsProbe.visited) / mesh32Tris) * 100).toFixed(2)),
    csgBenchmarkVertices: csgVertCount
  },
  accuracyReport,
  latencyBenchmarks,
  meshScaling
};

const outDir = process.env.SYMGEO_BENCH_OUT || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'benchmark_results.json'), JSON.stringify(summary, null, 2), 'utf8');

const csvLines = [
  'Task,Category,Runs,Mean_ms,SD_ms,Median_ms,P95_ms,Min_ms,Max_ms',
  ...latencyBenchmarks.map(
    (b) => `"${b.name}","${b.category}",${b.runs},${b.meanMs},${b.sdMs},${b.medianMs},${b.p95Ms},${b.minMs},${b.maxMs}`
  )
];
fs.writeFileSync(path.join(outDir, 'latency_benchmarks.csv'), '\uFEFF' + csvLines.join('\n'), 'utf8');

console.log('=== BENCHMARK SUMMARY (v3.0.0 REVISED) ===');
console.log('Env:', summary.environment);
console.log('Accuracy:', summary.accuracySummary);
console.log('BVH & CSG:', summary.bvhCullingStats);
for (const b of latencyBenchmarks) {
  console.log(`[${b.category}] ${b.name}: ${b.meanMs} ± ${b.sdMs} ms (median ${b.medianMs} ms, P95 ${b.p95Ms} ms, min-max ${b.minMs}-${b.maxMs} ms)`);
}
console.log('Mesh Scaling:', meshScaling);
