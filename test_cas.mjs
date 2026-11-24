import assert from 'assert';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import path from 'path';
import { extractImplicitSurfaceMesh } from './src/marching-cubes.js';
const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url));

// 1. Static DOM ID & ImportMap File Existence Audit
const html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(REPO_ROOT, 'src/app.js'), 'utf8');
const idsInJs = [...appJs.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
const missingIds = [...new Set(idsInJs)].filter((id) => !html.includes(`id="${id}"`));
console.log('Checked DOM IDs:', new Set(idsInJs).size, 'Missing:', missingIds);
assert.strictEqual(missingIds.length, 0, `Missing DOM IDs: ${missingIds.join(', ')}`);

const requiredAssets = [
  path.join(REPO_ROOT, 'node_modules/three/build/three.module.js'),
  path.join(REPO_ROOT, 'node_modules/three/examples/jsm/controls/OrbitControls.js'),
  path.join(REPO_ROOT, 'node_modules/three/examples/jsm/exporters/GLTFExporter.js'),
  path.join(REPO_ROOT, 'node_modules/three/examples/jsm/exporters/STLExporter.js'),
  path.join(REPO_ROOT, 'node_modules/three-mesh-bvh/build/index.module.js'),
  path.join(REPO_ROOT, 'node_modules/three-bvh-csg/build/index.module.js')
];
for (const p of requiredAssets) {
  assert.ok(fs.existsSync(p), `Missing asset: ${p}`);
}

// 2. Test Three.js + Marching Tetrahedra + MeshBVH Plane Slicing + three-bvh-csg CSG Boolean!
const { positions, normals } = extractImplicitSurfaceMesh(
  (x, y, z) => x * x + y * y + z * z - 9,
  { min: -4.5, max: 4.5 },
  26
);
const sphereGeo = new THREE.BufferGeometry();
sphereGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
sphereGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
const bvh = new MeshBVH(sphereGeo);

const cutPlane = new THREE.Plane(new THREE.Vector3(1, 1, 2).normalize(), -3 / Math.sqrt(6));
let cutSegments = 0;
bvh.shapecast({
  intersectsBounds: (box) => box.intersectsPlane(cutPlane),
  intersectsTriangle: (tri) => {
    const dA = cutPlane.distanceToPoint(tri.a);
    const dB = cutPlane.distanceToPoint(tri.b);
    const dC = cutPlane.distanceToPoint(tri.c);
    if ((dA <= 0 || dB <= 0 || dC <= 0) && (dA >= 0 || dB >= 0 || dC >= 0)) {
      cutSegments++;
    }
    return false;
  }
});
console.log('BVH Sphere-Plane Cross-Section intersected triangles:', cutSegments);
assert.ok(cutSegments > 40, 'BVH plane slice should intersect sphere triangles');

// Test CSG Boolean (Sphere minus Cylinder)
const csgEval = new Evaluator();
csgEval.useGroups = false;
const bSph = new Brush(new THREE.SphereGeometry(2.6, 24, 18));
bSph.updateMatrixWorld();
const cylG = new THREE.CylinderGeometry(1.2, 1.2, 6, 24);
cylG.rotateX(Math.PI / 2);
const bCyl = new Brush(cylG);
bCyl.updateMatrixWorld();
const csgRes = csgEval.evaluate(bSph, bCyl, SUBTRACTION);
console.log('CSG Sphere - Cylinder vertex count:', csgRes.geometry.attributes.position.count);
assert.ok(csgRes.geometry.attributes.position.count > 100);

// 3. Test Giac WASM 2D + 3D Symbolic Scenarios
globalThis.require = createRequire(import.meta.url);
globalThis.self = globalThis;
globalThis.window = {
  innerWidth: 1080,
  navigator: { userAgent: 'Mozilla/5.0 NodeTest' },
  location: { pathname: '/' },
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

const cas = await import('./src/cas-engine.js');
await cas.initGiacEngine('../node_modules/@basthon/xcas-wasm/src/index.js');

// Scenario 5: Slider k=3 on Plane x + y + 2z = k cutting Sphere x^2+y^2+z^2=9
const s5Sph = cas.classifyUserInput('s1: x^2 + y^2 + z^2 = 9');
const s5Pl = cas.classifyUserInput('p1: x + y + 2z = k');
assert.strictEqual(s5Pl.kind, 'plane3d');
const s5Res = cas.solve3DPlaneIntersection(s5Pl, s5Sph, { k: 3 });
console.log('S5 Parameterized Plane k=3 ∩ Sphere:', s5Res.latexMain);
assert.ok(s5Res.latexMain.includes('\\sqrt{30}'));

// Scenario 6: Cone x^2 + y^2 = z^2 cut by Plane z = m*x + 1.5 with m = 1 (Parabola) and m = 0 (Circle)
const s6Cone = cas.classifyUserInput('c1: x^2 + y^2 = z^2');
const s6Pl = cas.classifyUserInput('p1: z = m*x + 1.5');
const s6Circle = cas.solve3DPlaneIntersection(s6Pl, s6Cone, { m: 0 });
const s6Parab = cas.solve3DPlaneIntersection(s6Pl, s6Cone, { m: 1 });
console.log('S6 Cone Cut m=0 (Circle):', s6Circle.latexMain);
console.log('S6 Cone Cut m=1 (Parabola):', s6Parab.latexMain);

// Scenario 7: Solid of Revolution f(x) = sqrt(x) on [0, 4] -> V = 8*pi
const s7Rev = cas.computeSolidOfRevolution('sqrt(x)', '0', '4', 16, {});
console.log('S7 Revolution Volume:', s7Rev.volExact, 'Discs(16):', s7Rev.discSum);
assert.strictEqual(s7Rev.volExact, '8*pi');

// 4. Regression Tests for Adversarial Review Items (ISS-01, ISS-02, ISS-03, ISS-08, ISS-09)
// ISS-01: Symbolic k-th derivative parity on 0.01*x^7, x^9, x^(7/3), and x^4
const infOdd7 = cas.analyzeExplicitFunction('0.01*x^7', {}, true);
assert.strictEqual(infOdd7.inflections.length, 1, '0.01*x^7 must detect true inflection at x=0');
assert.strictEqual(infOdd7.inflections[0].lowestNonzeroOrder, 7);
assert.strictEqual(infOdd7.nonInflectionWarnings.length, 0);

const infOdd9 = cas.analyzeExplicitFunction('x^9', {}, true);
assert.strictEqual(infOdd9.inflections.length, 1, 'x^9 must detect true inflection at x=0');
assert.strictEqual(infOdd9.inflections[0].lowestNonzeroOrder, 9);

const infFrac = cas.analyzeExplicitFunction('surd(x, 3)^7', {}, true);
assert.strictEqual(infFrac.inflections.length, 1, 'surd(x,3)^7 non-smooth inflection fallback');

const infEven4 = cas.analyzeExplicitFunction('x^4', {}, true);
assert.strictEqual(infEven4.inflections.length, 0);
assert.strictEqual(infEven4.nonInflectionWarnings.length, 1);
assert.strictEqual(infEven4.nonInflectionWarnings[0].lowestNonzeroOrder, 4);

// ISS-03: Defective 3x3 matrix [[2,1,0],[0,2,0],[0,0,3]] must not fail or alert, and must return 2 real eigenAxes
const defMat3 = cas.analyzeMatrix3D('[[2,1,0],[0,2,0],[0,0,3]]', {});
console.log('Defective 3x3 Matrix det:', defMat3.detExact, 'eigenAxes:', defMat3.eigenAxes.length);
assert.strictEqual(defMat3.detExact, '12');
assert.strictEqual(defMat3.eigenAxes.length, 2, 'Defective 3x3 matrix J_2(2)⊕[3] has 2 independent eigenvectors');

// ISS-08: Symbolic 2D and 3D Point classification
assert.strictEqual(cas.classifyUserInput('A = (1, 2)').kind, 'point');
assert.strictEqual(cas.classifyUserInput('P = (1/2, sqrt(2), 3)').kind, 'point3d');

// ISS-02: Exact Manuscript Section 2.3 window.SymGeoCAS SDK snippet verification
const { SymGeoEventBus, createSymGeoSDK } = await import('./src/open-api.js');
const bus = new SymGeoEventBus();
const sdkState = { mode: '2d', exprs: [] };
globalThis.window.SymGeoCAS = createSymGeoSDK({
  eventBus: bus,
  setViewMode: (m) => { sdkState.mode = m; bus.emit('mode:switch', { mode: m }); },
  evalCAS: (cmd) => cas.evaluateCASCommand(cmd, {}),
  addExpression: (raw) => { sdkState.exprs.push(raw); bus.emit('expression:add', { rawInput: raw }); return raw; },
  getStateSnapshot: () => ({ version: '3.0.0', viewMode: sdkState.mode, objects: sdkState.exprs })
});
const capturedEvents = [];
globalThis.window.SymGeoCAS.on('*', (evt) => capturedEvents.push(evt.type));
globalThis.window.SymGeoCAS.setMode('both');
globalThis.window.SymGeoCAS.addExpression('s1: x^2 + y^2 + z^2 = 9');
globalThis.window.SymGeoCAS.addExpression('p1: x + y + 2*z = 3');
const ode = globalThis.window.SymGeoCAS.evalCAS("desolve(y'' + 4*y = sin(x), x, y)");
assert.strictEqual(globalThis.window.SymGeoCAS.version, '3.0.0');
assert.strictEqual(sdkState.mode, 'split');
assert.ok(ode.exact.includes('sin(x)/3'));
assert.strictEqual(capturedEvents.length, 3);
assert.strictEqual(globalThis.window.SymGeoCAS.exportState().objects.length, 2);

console.log('FULL 2D + 3D + GIAC CAS + BVH + CSG + SDK INTEGRATION SUITE PASSED 100%!');
