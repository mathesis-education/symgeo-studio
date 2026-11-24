/**
 * SymGeo Studio 3D Spatial Geometry & Symbolic Algebra Viewport (`src/canvas-3d.js`)
 *
 * Hybrid Architecture (Proposal 1):
 * - Three.js WebGL2 Z-Up Mathematical Coordinate System (matching GeoGebra 3D & Korean Textbooks)
 * - Two-Pass Back/Front Culling Transparency for artifact-free overlapping planes & surfaces
 * - Real-time `three-mesh-bvh` Plane Cross-Section Slicing (`shapecast` contour + cutaway clipping)
 * - `three-bvh-csg` Tinkercad-style Solid Booleans (Union, Subtract, Intersect)
 * - Marching Tetrahedra 3D Implicit Quadric/Surface Meshing
 * - 2D-to-3D Solid of Revolution & n-Disc 구분구적법 Visualizer
 * - 1-Click Color/Material `.glb` (glTF 2.0) & `.stl` Export
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { MeshBVH } from 'three-mesh-bvh';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { extractImplicitSurfaceMesh } from './marching-cubes.js';
import { formatCleanNumber } from './cas-engine.js';

export class SpatialGraph3D {
  constructor(containerEl, labelLayerEl, callbacks = {}) {
    this.container = containerEl;
    this.labelLayer = labelLayerEl;
    this.callbacks = callbacks;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf8fafc);

    // Z-Up Mathematical Camera (X: Red right-front, Y: Green right-back, Z: Blue vertical UP)
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(8.8, -9.6, 6.8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.localClippingEnabled = true;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);

    // Groups
    this.axesGroup = new THREE.Group();
    this.contentGroup = new THREE.Group();    // Visual display group (includes two-pass & helpers)
    this.exportMeshGroup = new THREE.Group(); // Clean single-mesh clones for .glb / .stl export!
    this.sliceGroup = new THREE.Group();      // Highlighted BVH cross-section curves & caps
    this.scene.add(this.axesGroup, this.contentGroup, this.sliceGroup);

    this.cutawayEnabled = false;
    this.autoRotate = false;
    this.showXYPlane = true;
    this.bounds = { min: -4.5, max: 4.5 };

    this.points3D = []; // Symbolic 3D points (saddle, extrema, sphere center, etc.) for HTML KaTeX labels
    this.meshRegistry = new Map(); // objId -> { geo, bvh, color, kind }
    this.surfaceBVHCache = new Map(); // exprCacheKey -> { geo, bvh }

    this._setupLights();
    this._buildMathAxes();
    this._setupResize();
    this._startLoop();
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 0.95);
    hemi.position.set(0, 0, 15);
    this.scene.add(hemi);

    const dir1 = new THREE.DirectionalLight(0xffffff, 0.85);
    dir1.position.set(10, -12, 14);
    this.scene.add(dir1);

    const dir2 = new THREE.DirectionalLight(0xe0e7ff, 0.45);
    dir2.position.set(-10, 10, -6);
    this.scene.add(dir2);
  }

  _makeTextSprite(text, color = '#334155', fontSize = 44) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = `700 ${fontSize}px "Pretendard", system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 32);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(0.9, 0.45, 1);
    sp.renderOrder = 20;
    return sp;
  }

  _buildMathAxes() {
    this.axesGroup.clear();
    const L = 5.0;

    // Subtle GeoGebra-style XY Gray Grid on z = 0
    const grid = new THREE.GridHelper(10, 10, 0x94a3b8, 0xe2e8f0);
    grid.rotation.x = Math.PI / 2; // Rotate from XZ to XY plane!
    grid.material.transparent = true;
    grid.material.opacity = 0.65;
    this.xyGridHelper = grid;
    this.axesGroup.add(grid);

    const makeAxis = (dirVec, hex, labelText) => {
      const origin = new THREE.Vector3().copy(dirVec).multiplyScalar(-L);
      const end = new THREE.Vector3().copy(dirVec).multiplyScalar(L);
      const pts = [origin, end];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: hex, linewidth: 2 });
      this.axesGroup.add(new THREE.Line(geo, mat));

      const coneGeo = new THREE.ConeGeometry(0.11, 0.34, 16);
      const coneMat = new THREE.MeshBasicMaterial({ color: hex });
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.copy(end);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirVec);
      this.axesGroup.add(cone);

      const sp = this._makeTextSprite(labelText, '#' + hex.toString(16).padStart(6, '0'), 46);
      sp.position.copy(dirVec).multiplyScalar(L + 0.45);
      this.axesGroup.add(sp);
    };

    makeAxis(new THREE.Vector3(1, 0, 0), 0xdc2626, 'x');
    makeAxis(new THREE.Vector3(0, 1, 0), 0x059669, 'y');
    makeAxis(new THREE.Vector3(0, 0, 1), 0x2563eb, 'z');

    for (const tick of [-4, -2, 2, 4]) {
      const sx = this._makeTextSprite(String(tick), '#64748b', 32);
      sx.position.set(tick, -0.35, -0.15);
      sx.scale.set(0.65, 0.32, 1);

      const sy = this._makeTextSprite(String(tick), '#64748b', 32);
      sy.position.set(-0.35, tick, -0.15);
      sy.scale.set(0.65, 0.32, 1);

      const sz = this._makeTextSprite(String(tick), '#64748b', 32);
      sz.position.set(-0.35, -0.25, tick);
      sz.scale.set(0.65, 0.32, 1);

      this.axesGroup.add(sx, sy, sz);
    }
  }

  _setupResize() {
    const update = () => {
      const rect = this.container.getBoundingClientRect();
      const w = Math.max(100, Math.floor(rect.width));
      const h = Math.max(100, Math.floor(rect.height));
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    this.resizeObserver = new ResizeObserver(update);
    this.resizeObserver.observe(this.container);
    update();
  }

  _startLoop() {
    const animate = () => {
      this._raf = requestAnimationFrame(animate);
      if (this.container.offsetParent === null) return; // Paused when hidden in pure 2D mode
      this.controls.autoRotate = this.autoRotate;
      this.controls.autoRotateSpeed = 1.6;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this._updateOverlayLabels();
    };
    animate();
  }

  resetCamera() {
    this.camera.position.set(8.8, -9.6, 6.8);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  setXYPlaneVisible(vis) {
    this.showXYPlane = vis;
    if (this.xyGridHelper) this.xyGridHelper.visible = vis;
  }

  _disposeGroup(grp) {
    while (grp.children.length > 0) {
      const child = grp.children.pop();
      if (child.children && child.children.length > 0) {
        this._disposeGroup(child);
      }
      if (child.geometry && !child.geometry.userData?.cachedBVH) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }
  }

  /**
   * GeoGebra-style Two-Pass Translucent Mesh (BackSide then FrontSide) to prevent alpha sorting glitches
   */
  _createTwoPassTranslucentMesh(geometry, colorHex, opacity = 0.72, clipPlanes = []) {
    const group = new THREE.Group();
    const baseColor = new THREE.Color(colorHex || '#4f46e5');

    const backMat = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      roughness: 0.35,
      metalness: 0.05,
      transparent: opacity < 0.99,
      opacity: opacity * 0.85,
      side: THREE.BackSide,
      depthWrite: opacity >= 0.99,
      clippingPlanes: clipPlanes
    });

    const frontMat = new THREE.MeshPhysicalMaterial({
      color: baseColor,
      roughness: 0.28,
      metalness: 0.05,
      transparent: opacity < 0.99,
      opacity,
      side: THREE.FrontSide,
      depthWrite: opacity >= 0.99,
      clippingPlanes: clipPlanes
    });

    const mBack = new THREE.Mesh(geometry, backMat);
    const mFront = new THREE.Mesh(geometry, frontMat);
    mBack.renderOrder = 2;
    mFront.renderOrder = 3;
    group.add(mBack, mFront);
    return group;
  }

  /**
   * Build BufferGeometry for Explicit Surface z = f(x, y)
   */
  _buildExplicitSurfaceGeometry(evalFn3D, params, segs = 56) {
    const minB = this.bounds.min;
    const maxB = this.bounds.max;
    const span = maxB - minB;

    const positions = [];
    const uvs = [];
    const indices = [];
    const validGrid = new Uint8Array((segs + 1) * (segs + 1));

    for (let j = 0; j <= segs; j++) {
      const y = minB + (j / segs) * span;
      for (let i = 0; i <= segs; i++) {
        const x = minB + (i / segs) * span;
        const z = evalFn3D(x, y, 0, params);
        const idx = j * (segs + 1) + i;
        if (Number.isFinite(z) && Math.abs(z) <= 8.5) {
          positions.push(x, y, z);
          validGrid[idx] = 1;
        } else {
          positions.push(x, y, 0);
          validGrid[idx] = 0;
        }
        uvs.push(i / segs, j / segs);
      }
    }

    for (let j = 0; j < segs; j++) {
      for (let i = 0; i < segs; i++) {
        const a = j * (segs + 1) + i;
        const b = a + 1;
        const c = (j + 1) * (segs + 1) + i;
        const d = c + 1;
        if (validGrid[a] && validGrid[b] && validGrid[c]) indices.push(a, b, c);
        if (validGrid[b] && validGrid[d] && validGrid[c]) indices.push(b, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Build Bounded Polygon Geometry for Plane a*x + b*y + c*z = d inside [-4.5, 4.5]^3
   */
  _buildPlaneMeshGeometry(normalArr, dNum) {
    const [a, b, c] = normalArr;
    const len = Math.hypot(a, b, c);
    if (len < 1e-10) return null;

    const nUnit = new THREE.Vector3(a / len, b / len, c / len);
    const p0 = nUnit.clone().multiplyScalar(dNum / len);

    // Construct orthonormal basis (u, v) on the plane
    const helper = Math.abs(nUnit.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(helper, nUnit).normalize();
    const v = new THREE.Vector3().crossVectors(nUnit, u).normalize();

    const half = 4.6;
    const corners = [
      p0.clone().addScaledVector(u, -half).addScaledVector(v, -half),
      p0.clone().addScaledVector(u, half).addScaledVector(v, -half),
      p0.clone().addScaledVector(u, half).addScaledVector(v, half),
      p0.clone().addScaledVector(u, -half).addScaledVector(v, half)
    ];

    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array([
      corners[0].x, corners[0].y, corners[0].z,
      corners[1].x, corners[1].y, corners[1].z,
      corners[2].x, corners[2].y, corners[2].z,
      corners[3].x, corners[3].y, corners[3].z
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    return { geo, corners, threePlane: new THREE.Plane(nUnit, -dNum / len) };
  }

  /**
   * Build Solid of Revolution Geometry around x-axis for y = f(x) over [a, b]
   */
  _buildRevolutionGeometry(eval2DFn, aNum, bNum, params, xSegs = 50, radialSegs = 48) {
    const positions = [];
    const indices = [];

    for (let i = 0; i <= xSegs; i++) {
      const x = aNum + ((bNum - aNum) * i) / xSegs;
      const rRaw = eval2DFn(x, 0, params);
      const r = Number.isFinite(rRaw) ? Math.min(6, Math.abs(rRaw)) : 0;
      for (let j = 0; j <= radialSegs; j++) {
        const theta = (j / radialSegs) * Math.PI * 2;
        positions.push(x, r * Math.cos(theta), r * Math.sin(theta));
      }
    }

    const rowStride = radialSegs + 1;
    for (let i = 0; i < xSegs; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const p1 = i * rowStride + j;
        const p2 = p1 + 1;
        const p3 = (i + 1) * rowStride + j;
        const p4 = p3 + 1;
        indices.push(p1, p3, p2);
        indices.push(p2, p3, p4);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Build Tinkercad-style CSG Solid Mesh (`three-bvh-csg`)
   * Supports presets: 'sphere_minus_cyl', 'box_union_sphere', 'sphere_intersect_box', 'hollow_box'
   */
  _buildCSGGeometry(csgPreset = 'sphere_minus_cyl') {
    const evaluator = new Evaluator();
    evaluator.useGroups = false;

    const bSphere = new Brush(new THREE.SphereGeometry(2.6, 42, 32));
    bSphere.updateMatrixWorld();

    if (csgPreset === 'box_union_sphere') {
      const bBox = new Brush(new THREE.BoxGeometry(3.6, 3.6, 3.6));
      bBox.position.set(1.0, 0, 0);
      bBox.updateMatrixWorld();
      const res = evaluator.evaluate(bSphere, bBox, ADDITION);
      return res.geometry;
    }

    if (csgPreset === 'sphere_intersect_box') {
      const bBox = new Brush(new THREE.BoxGeometry(3.8, 3.8, 3.8));
      bBox.updateMatrixWorld();
      const res = evaluator.evaluate(bSphere, bBox, INTERSECTION);
      return res.geometry;
    }

    // Default: Sphere minus vertical Z-Cylinder ('구에서 원기둥 빼기' — 고교 기하·적분 고전 부피 문제!)
    const cylGeo = new THREE.CylinderGeometry(1.35, 1.35, 7.0, 40);
    cylGeo.rotateX(Math.PI / 2); // Align cylinder along Z-axis!
    const bCyl = new Brush(cylGeo);
    bCyl.updateMatrixWorld();
    const res = evaluator.evaluate(bSphere, bCyl, SUBTRACTION);
    return res.geometry;
  }

  /**
   * Real-time BVH Plane-Mesh Cross-Section Slicing (`three-mesh-bvh` shapecast)
   */
  _extractAndDrawBVHSlice(targetGeo, bvh, threePlane, sliceColor = '#dc2626', targetKind = 'implicit3d') {
    const linePositions = [];
    const tempA = new THREE.Vector3();
    const tempB = new THREE.Vector3();
    const tempC = new THREE.Vector3();

    bvh.shapecast({
      intersectsBounds: (box) => box.intersectsPlane(threePlane),
      intersectsTriangle: (tri) => {
        const dA = threePlane.distanceToPoint(tri.a);
        const dB = threePlane.distanceToPoint(tri.b);
        const dC = threePlane.distanceToPoint(tri.c);

        const pts = [];
        const checkEdge = (p1, p2, v1, v2) => {
          if ((v1 <= 0 && v2 >= 0) || (v1 >= 0 && v2 <= 0)) {
            const denom = v1 - v2;
            if (Math.abs(denom) > 1e-12) {
              const t = v1 / denom;
              pts.push(new THREE.Vector3().lerpVectors(p1, p2, t));
            }
          }
        };

        checkEdge(tri.a, tri.b, dA, dB);
        checkEdge(tri.b, tri.c, dB, dC);
        checkEdge(tri.c, tri.a, dC, dA);

        if (pts.length >= 2) {
          tempA.copy(pts[0]);
          tempB.copy(pts[1]);
          if (tempA.distanceToSquared(tempB) > 1e-10) {
            linePositions.push(tempA.x, tempA.y, tempA.z, tempB.x, tempB.y, tempB.z);
          }
        }
        void tempC;
        return false;
      }
    });

    if (linePositions.length < 6) return;

    // 1. Glowing Cross-Section Contour Line
    const segGeo = new THREE.BufferGeometry();
    segGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));

    const solidLineMat = new THREE.LineBasicMaterial({
      color: sliceColor,
      linewidth: 3
    });
    const xrayLineMat = new THREE.LineBasicMaterial({
      color: sliceColor,
      transparent: true,
      opacity: 0.45,
      depthTest: false
    });

    const lineMesh = new THREE.LineSegments(segGeo, solidLineMat);
    const xrayMesh = new THREE.LineSegments(segGeo, xrayLineMat);
    lineMesh.renderOrder = 12;
    xrayMesh.renderOrder = 11;
    this.sliceGroup.add(lineMesh, xrayMesh);

    // 2. Translucent cross-section cap fan for star-shaped/convex quadric & surface slices
    // (Skipped for non-convex CSG Boolean solids so hollow bores are never bridged)
    if (targetKind === 'csg3d') return;
    const numVerts = linePositions.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < linePositions.length; i += 3) {
      cx += linePositions[i];
      cy += linePositions[i + 1];
      cz += linePositions[i + 2];
    }
    cx /= numVerts; cy /= numVerts; cz /= numVerts;

    // Fill cap fan from segments
    const capPos = [];
    for (let i = 0; i < linePositions.length; i += 6) {
      capPos.push(
        cx, cy, cz,
        linePositions[i], linePositions[i + 1], linePositions[i + 2],
        linePositions[i + 3], linePositions[i + 4], linePositions[i + 5]
      );
    }
    const capGeo = new THREE.BufferGeometry();
    capGeo.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3));
    capGeo.computeVertexNormals();
    const capMat = new THREE.MeshBasicMaterial({
      color: sliceColor,
      transparent: true,
      opacity: 0.26,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const capMesh = new THREE.Mesh(capGeo, capMat);
    capMesh.renderOrder = 9;
    this.sliceGroup.add(capMesh);
  }

  /**
   * Rebuild the entire 3D scene from synchronized Algebra State!
   */
  setScene3D(objects, params) {
    this._disposeGroup(this.contentGroup);
    this._disposeGroup(this.exportMeshGroup);
    this._disposeGroup(this.sliceGroup);
    this.meshRegistry.clear();
    this.points3D = [];

    // Collect active cutting planes if cutaway mode is ON
    const activePlanes = [];
    for (const obj of objects) {
      if (obj.kind === 'plane3d' && obj.visible && obj.analysis) {
        const plData = this._buildPlaneMeshGeometry(obj.analysis.normal, obj.analysis.dNum);
        if (plData) {
          activePlanes.push({ obj, ...plData });
        }
      }
    }

    // Clipping planes when Cutaway mode is active (clips half-space in direction of -normal)
    const clipList = this.cutawayEnabled
      ? activePlanes.map((p) => p.threePlane.clone().negate())
      : [];

    // 1. Render 3D Explicit Surfaces z = f(x, y)
    for (const obj of objects) {
      if (!obj.visible) continue;

      if (obj.kind === 'surface3d' && obj.evaluator3D) {
        const usedP = Object.entries(params)
          .filter(([k]) => new RegExp(`\\b${k}\\b`).test(obj.rhsExpr))
          .map(([k, v]) => `${k}=${v}`)
          .join(',');
        const cacheKey = `surface3d|${obj.rhsExpr}|56|${usedP}`;
        let cached = this.surfaceBVHCache.get(cacheKey);
        if (!cached) {
          const geoNew = this._buildExplicitSurfaceGeometry(obj.evaluator3D, params, 56);
          geoNew.userData.cachedBVH = true;
          cached = { geo: geoNew, bvh: new MeshBVH(geoNew) };
          if (this.surfaceBVHCache.size > 32) this.surfaceBVHCache.clear();
          this.surfaceBVHCache.set(cacheKey, cached);
        }
        const { geo, bvh } = cached;
        this.meshRegistry.set(obj.id, { geo, bvh, color: obj.color, kind: obj.kind });

        if (obj.showCurvatureMap && obj.gaussEvaluator3D) {
          // Differential Geometry Gaussian Curvature Heatmap (K>0 Red, K=0 Emerald/White, K<0 Blue)
          const posAttr = geo.attributes.position;
          const colors = new Float32Array(posAttr.count * 3);
          const col = new THREE.Color();
          for (let v = 0; v < posAttr.count; v++) {
            const vx = posAttr.getX(v);
            const vy = posAttr.getY(v);
            const kVal = obj.gaussEvaluator3D(vx, vy, 0, params);
            const t = Number.isFinite(kVal) ? Math.tanh(kVal * 1.4) : 0;
            if (t >= 0) {
              col.setRGB(0.95, 0.96 - 0.65 * t, 0.92 - 0.72 * t);
            } else {
              const s = -t;
              col.setRGB(0.92 - 0.75 * s, 0.96 - 0.52 * s, 0.98);
            }
            colors[v * 3] = col.r;
            colors[v * 3 + 1] = col.g;
            colors[v * 3 + 2] = col.b;
          }
          geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
          const heatMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.3,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.88,
            clippingPlanes: clipList
          });
          this.contentGroup.add(new THREE.Mesh(geo, heatMat));
        } else {
          const meshGrp = this._createTwoPassTranslucentMesh(geo, obj.color, 0.78, clipList);
          const wireMat = new THREE.MeshBasicMaterial({
            color: obj.color,
            wireframe: true,
            transparent: true,
            opacity: 0.14,
            clippingPlanes: clipList
          });
          meshGrp.add(new THREE.Mesh(geo, wireMat));
          this.contentGroup.add(meshGrp);
        }

        // Exportable clean mesh (flatten non-clipped geometry)
        const expGeo = geo.clone();
        const expMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(obj.color || '#4f46e5'),
          roughness: 0.35,
          metalness: 0.05,
          side: THREE.DoubleSide
        });
        this.exportMeshGroup.add(new THREE.Mesh(expGeo, expMat));

        // 3D Critical / Saddle points
        if (obj.showSpecial && obj.analysis?.criticalPoints3D) {
          for (const pt of obj.analysis.criticalPoints3D) {
            this._add3DSpecialPointMarker(pt);
          }
        }
      }

      // 2. Render 3D Implicit Quadrics / Surfaces F(x, y, z) = 0 via Kuhn 6-Tetrahedra + Cached MeshBVH
      if (obj.kind === 'implicit3d' && obj.evaluator3D) {
        const exprSrc = `${obj.lhsExpr}=${obj.rhsExpr}`;
        const usedP = Object.entries(params)
          .filter(([k]) => new RegExp(`\\b${k}\\b`).test(exprSrc))
          .map(([k, v]) => `${k}=${v}`)
          .join(',');
        const cacheKey = `implicit3d|${exprSrc}|32|${usedP}`;
        let cached = this.surfaceBVHCache.get(cacheKey);
        if (!cached) {
          const { positions, normals } = extractImplicitSurfaceMesh(
            (x, y, z) => obj.evaluator3D(x, y, z, params),
            this.bounds,
            32
          );
          if (positions.length >= 9) {
            const geoNew = new THREE.BufferGeometry();
            geoNew.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            geoNew.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
            geoNew.userData.cachedBVH = true;
            cached = { geo: geoNew, bvh: new MeshBVH(geoNew) };
            if (this.surfaceBVHCache.size > 32) this.surfaceBVHCache.clear();
            this.surfaceBVHCache.set(cacheKey, cached);
          }
        }
        if (cached) {
          const { geo, bvh } = cached;
          this.meshRegistry.set(obj.id, { geo, bvh, color: obj.color, kind: obj.kind });

          const meshGrp = this._createTwoPassTranslucentMesh(geo, obj.color, 0.74, clipList);
          this.contentGroup.add(meshGrp);

          const expMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(obj.color || '#059669'),
            roughness: 0.32,
            metalness: 0.05,
            side: THREE.DoubleSide
          });
          this.exportMeshGroup.add(new THREE.Mesh(geo.clone(), expMat));
        }

        if (obj.analysis?.sphereInfo) {
          const [cx, cy, cz] = obj.analysis.sphereInfo.centerExact.map((s) => Number(s) || 0);
          if (Number.isFinite(cx)) {
            this._add3DSpecialPointMarker({
              badge: '중심',
              latexCoord: obj.analysis.sphereInfo.centerLatex,
              x: cx,
              y: cy,
              z: cz,
              color: '#059669'
            });
          }
        }
      }

      // 3. Render 2D-to-3D Solid of Revolution + n-Disc 구분구적법!
      if (obj.kind === 'revolution3d') {
        const srcFn = objects.find((o) => o.id === obj.sourceFnId && o.kind === 'explicit');
        if (srcFn && srcFn.evaluator && obj.result) {
          const revGeo = this._buildRevolutionGeometry(
            srcFn.evaluator,
            obj.result.aNum,
            obj.result.bNum,
            params
          );
          const bvh = new MeshBVH(revGeo);
          this.meshRegistry.set(obj.id, { geo: revGeo, bvh, color: obj.color });

          const revGrp = this._createTwoPassTranslucentMesh(revGeo, obj.color, obj.showDiscs ? 0.36 : 0.76, clipList);
          this.contentGroup.add(revGrp);

          const expMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(obj.color || '#4f46e5'),
            roughness: 0.3,
            side: THREE.DoubleSide
          });
          this.exportMeshGroup.add(new THREE.Mesh(revGeo.clone(), expMat));

          // Render n-Disc 구분구적법 cylinders along x-axis!
          if (obj.showDiscs && obj.result.discs) {
            for (const d of obj.result.discs) {
              if (d.radius < 1e-4) continue;
              const cylGeo = new THREE.CylinderGeometry(d.radius, d.radius, d.thickness * 0.94, 32);
              cylGeo.rotateZ(Math.PI / 2); // Align cylinder axis along X-axis!
              cylGeo.translate(d.xCenter, 0, 0);

              const cylMat = new THREE.MeshPhysicalMaterial({
                color: new THREE.Color('#f59e0b'),
                roughness: 0.35,
                transparent: true,
                opacity: 0.62,
                clippingPlanes: clipList
              });
              const edgeGeo = new THREE.EdgesGeometry(cylGeo, 25);
              const edgeMat = new THREE.LineBasicMaterial({ color: 0xb45309 });
              this.contentGroup.add(new THREE.Mesh(cylGeo, cylMat), new THREE.LineSegments(edgeGeo, edgeMat));
              this.exportMeshGroup.add(
                new THREE.Mesh(
                  cylGeo.clone(),
                  new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 })
                )
              );
            }
          }
        }
      }

      // 4. Render CSG Boolean Solids (`three-bvh-csg`) with cached BVH
      if (obj.kind === 'csg3d') {
        const cacheKey = `csg3d|${obj.preset}`;
        let cached = this.surfaceBVHCache.get(cacheKey);
        if (!cached) {
          const rawGeo = this._buildCSGGeometry(obj.preset);
          const cleanGeo = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo.clone();
          cleanGeo.clearGroups();
          cleanGeo.setDrawRange(0, Infinity);
          cleanGeo.computeVertexNormals();
          cleanGeo.userData.cachedBVH = true;
          cached = { geo: cleanGeo, bvh: new MeshBVH(cleanGeo) };
          this.surfaceBVHCache.set(cacheKey, cached);
        }
        const { geo: cleanGeo, bvh } = cached;
        this.meshRegistry.set(obj.id, { geo: cleanGeo, bvh, color: obj.color, kind: 'csg3d' });

        const csgMesh = this._createTwoPassTranslucentMesh(cleanGeo, obj.color || '#7c3aed', 0.88, clipList);
        this.contentGroup.add(csgMesh);

        this.exportMeshGroup.add(
          new THREE.Mesh(
            cleanGeo.clone(),
            new THREE.MeshStandardMaterial({
              color: new THREE.Color(obj.color || '#7c3aed'),
              roughness: 0.28,
              metalness: 0.12
            })
          )
        );
      }

      // 5. University Differential Geometry: Space Curve r(t) + Frenet-Serret Frame {T, N, B} + Osculating Circle
      if (obj.kind === 'spacecurve3d' && obj.analysis?.evalCurve) {
        const curvePts = [];
        const tMin = obj.tMin ?? -6.28;
        const tMax = obj.tMax ?? 6.28;
        const samples = 240;
        for (let i = 0; i <= samples; i++) {
          const tVal = tMin + ((tMax - tMin) * i) / samples;
          const [cx, cy, cz] = obj.analysis.evalCurve(tVal);
          if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(cz) && Math.hypot(cx, cy, cz) < 25) {
            curvePts.push(new THREE.Vector3(cx, cy, cz));
          }
        }
        if (curvePts.length >= 4) {
          const catCurve = new THREE.CatmullRomCurve3(curvePts);
          const tubeGeo = new THREE.TubeGeometry(catCurve, 200, 0.065, 12, false);
          const tubeMat = new THREE.MeshStandardMaterial({ color: obj.color || '#4f46e5', roughness: 0.3 });
          const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
          this.contentGroup.add(tubeMesh);
          this.exportMeshGroup.add(tubeMesh.clone());
        }

        const fr = obj.analysis.frenet;
        if (fr && fr.pos.every(Number.isFinite)) {
          const origin = new THREE.Vector3(...fr.pos);
          const arrowLen = 1.45;
          // T: Red, N: Emerald, B: Cobalt Blue
          this.contentGroup.add(
            new THREE.ArrowHelper(new THREE.Vector3(...fr.T), origin, arrowLen, 0xdc2626, 0.28, 0.16),
            new THREE.ArrowHelper(new THREE.Vector3(...fr.N), origin, arrowLen, 0x059669, 0.28, 0.16),
            new THREE.ArrowHelper(new THREE.Vector3(...fr.B), origin, arrowLen, 0x2563eb, 0.28, 0.16)
          );
          this._add3DSpecialPointMarker({
            badge: 'r(t₀)',
            latexCoord: `\\mathbf{T},\\mathbf{N},\\mathbf{B}`,
            x: origin.x,
            y: origin.y,
            z: origin.z,
            color: '#0f172a'
          });

          // Osculating Circle in span(T, N) centered at r(t0) + rho * N
          if (fr.oscRadius && fr.oscRadius < 12) {
            const rho = fr.oscRadius;
            const tVec = new THREE.Vector3(...fr.T);
            const nVec = new THREE.Vector3(...fr.N);
            const center = origin.clone().addScaledVector(nVec, rho);
            const ringPts = [];
            for (let k = 0; k <= 64; k++) {
              const ang = (k / 64) * Math.PI * 2;
              const p = center
                .clone()
                .addScaledVector(tVec, rho * Math.cos(ang))
                .addScaledVector(nVec, rho * Math.sin(ang));
              ringPts.push(p);
            }
            const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
            const ringMat = new THREE.LineBasicMaterial({ color: 0xd97706 });
            this.contentGroup.add(new THREE.Line(ringGeo, ringMat));
          }
        }
      }

      // 6. University Linear Algebra: 3D Matrix Linear Transformation (Unit Sphere -> Ellipsoid + Eigenvectors)
      if (obj.kind === 'matrix3d' && obj.analysis?.entries) {
        const m = obj.analysis.entries;
        const alpha = obj.interp ?? 1.0; // Interpolation s in [0, 1]: (1-s)I + s*M

        // Reference dashed wireframe unit sphere
        const refGeo = new THREE.SphereGeometry(1.5, 24, 18);
        const refMat = new THREE.MeshBasicMaterial({
          color: 0x94a3b8,
          wireframe: true,
          transparent: true,
          opacity: 0.25
        });
        this.contentGroup.add(new THREE.Mesh(refGeo, refMat));

        // Deformed sphere
        const defGeo = new THREE.SphereGeometry(1.5, 36, 28);
        const mat4 = new THREE.Matrix4().set(
          (1 - alpha) + alpha * m[0][0], alpha * m[0][1], alpha * m[0][2], 0,
          alpha * m[1][0], (1 - alpha) + alpha * m[1][1], alpha * m[1][2], 0,
          alpha * m[2][0], alpha * m[2][1], (1 - alpha) + alpha * m[2][2], 0,
          0, 0, 0, 1
        );
        defGeo.applyMatrix4(mat4);
        defGeo.computeVertexNormals();

        const defGrp = this._createTwoPassTranslucentMesh(defGeo, obj.color || '#4f46e5', 0.65, clipList);
        this.contentGroup.add(defGrp);
        this.exportMeshGroup.add(
          new THREE.Mesh(defGeo.clone(), new THREE.MeshStandardMaterial({ color: 0x4f46e5, roughness: 0.3 }))
        );

        // Real Eigenvector Invariant Axes!
        for (const axis of obj.analysis.eigenAxes || []) {
          const dir = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
          const lineG = new THREE.BufferGeometry().setFromPoints([
            dir.clone().multiplyScalar(-4.4),
            dir.clone().multiplyScalar(4.4)
          ]);
          const lineM = new THREE.LineBasicMaterial({ color: 0xdc2626 });
          this.contentGroup.add(new THREE.Line(lineG, lineM));
          this.contentGroup.add(new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), 2.8, 0xdc2626, 0.3, 0.16));
        }
      }

      // 7. University Vector Calculus: 3D Vector Field Lattice F(x, y, z)
      if (obj.kind === 'vectorfield3d' && obj.analysis?.evalField) {
        const coords = [-3, -1.5, 0, 1.5, 3];
        const col = new THREE.Color();
        for (const x of coords) {
          for (const y of coords) {
            for (const z of [-2, 0, 2]) {
              const [vx, vy, vz] = obj.analysis.evalField(x, y, z);
              if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) continue;
              const mag = Math.hypot(vx, vy, vz);
              if (mag < 1e-5) continue;
              const dir = new THREE.Vector3(vx / mag, vy / mag, vz / mag);
              const len = Math.min(1.05, 0.28 + 0.18 * Math.log1p(mag));
              const t = Math.min(1, mag / 4.5);
              col.setHSL(0.62 - 0.52 * t, 0.85, 0.46);
              this.contentGroup.add(
                new THREE.ArrowHelper(dir, new THREE.Vector3(x, y, z), len, col.getHex(), len * 0.28, len * 0.16)
              );
            }
          }
        }
      }
    }

    // 5. Render 3D Planes & Automatically Slice Intersected 3D Meshes via BVH!
    for (const plItem of activePlanes) {
      const { obj, geo, corners, threePlane } = plItem;

      // Translucent plane sheet (hidden or ultra-faint when cutaway is ON so interior cross-section shines!)
      const planeOpacity = this.cutawayEnabled ? 0.14 : 0.34;
      const plGrp = this._createTwoPassTranslucentMesh(geo, obj.color || '#0ea5e9', planeOpacity, []);
      this.contentGroup.add(plGrp);

      // Border frame of plane
      const borderPts = [...corners, corners[0]];
      const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
      const borderMat = new THREE.LineBasicMaterial({ color: obj.color || '#0284c7' });
      this.contentGroup.add(new THREE.Line(borderGeo, borderMat));

      // Run real-time BVH cross-section extraction against every registered 3D surface/solid!
      for (const [, entry] of this.meshRegistry.entries()) {
        this._extractAndDrawBVHSlice(entry.geo, entry.bvh, threePlane, '#dc2626', entry.kind || 'implicit3d');
      }
    }
  }

  _add3DSpecialPointMarker(pt) {
    const sphGeo = new THREE.SphereGeometry(0.14, 20, 16);
    const sphMat = new THREE.MeshBasicMaterial({ color: pt.color || '#dc2626' });
    const m = new THREE.Mesh(sphGeo, sphMat);
    m.position.set(pt.x, pt.y, pt.z);
    m.renderOrder = 15;
    this.contentGroup.add(m);
    this.points3D.push(pt);
  }

  _updateOverlayLabels() {
    if (!this.labelLayer) return;
    this.labelLayer.innerHTML = '';
    if (this.points3D.length === 0) return;

    const rect = this.container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const proj = new THREE.Vector3();

    for (const pt of this.points3D) {
      proj.set(pt.x, pt.y, pt.z).project(this.camera);
      if (proj.z > 1) continue; // Behind camera
      const sx = (proj.x * 0.5 + 0.5) * w;
      const sy = (-proj.y * 0.5 + 0.5) * h;
      if (sx < 20 || sx > w - 120 || sy < 20 || sy > h - 20) continue;

      const el = document.createElement('div');
      el.className = 'canvas-pt-badge';
      el.style.left = `${Math.round(sx + 10)}px`;
      el.style.top = `${Math.round(sy - 18)}px`;
      el.style.borderColor = pt.color || '#dc2626';

      const tag = document.createElement('span');
      tag.className = 'pt-kind-tag';
      tag.style.backgroundColor = pt.color || '#dc2626';
      tag.textContent = pt.badge || '점';
      el.appendChild(tag);

      const mathSpan = document.createElement('span');
      if (window.katex && pt.latexCoord) {
        try {
          window.katex.render(pt.latexCoord, mathSpan, { throwOnError: false });
        } catch {
          mathSpan.textContent = `(${formatCleanNumber(pt.x)}, ${formatCleanNumber(pt.y)}, ${formatCleanNumber(pt.z)})`;
        }
      }
      el.appendChild(mathSpan);
      this.labelLayer.appendChild(el);
    }
  }

  /**
   * Export 3D Scene to Binary `.glb` (preserving Colors & PBR Materials for PowerPoint / Roblox!)
   */
  exportGLB(filename = 'symgeo-3d-model.glb') {
    if (this.exportMeshGroup.children.length === 0) {
      if (this.callbacks.onHint) this.callbacks.onHint('내보낼 3D 곡면이나 입체 객체가 없습니다.');
      return;
    }

    // Rotate from Math Z-up to glTF standard Y-up so PowerPoint / Roblox opens upright!
    const exportRoot = this.exportMeshGroup.clone(true);
    exportRoot.rotation.x = -Math.PI / 2;
    exportRoot.updateMatrixWorld(true);

    const exporter = new GLTFExporter();
    exporter.parse(
      exportRoot,
      (glbBuffer) => {
        const blob = new Blob([glbBuffer], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        if (this.callbacks.onHint) {
          this.callbacks.onHint(`색상·재질이 포함된 3D 모델 [${filename}] 저장이 완료되었습니다!`);
        }
      },
      (err) => {
        console.error('GLB Export Error:', err);
      },
      { binary: true }
    );
  }

  /**
   * Export 3D Scene to Binary `.stl` (for 3D Printing!)
   */
  exportSTL(filename = 'symgeo-3d-print.stl') {
    if (this.exportMeshGroup.children.length === 0) {
      if (this.callbacks.onHint) this.callbacks.onHint('내보낼 3D 입체 객체가 없습니다.');
      return;
    }
    const exporter = new STLExporter();
    const stlBuffer = exporter.parse(this.exportMeshGroup, { binary: true });
    const blob = new Blob([stlBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    if (this.callbacks.onHint) {
      this.callbacks.onHint(`3D 프린팅용 [${filename}] 저장이 완료되었습니다!`);
    }
  }
}
