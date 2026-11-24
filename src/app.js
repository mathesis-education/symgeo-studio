import {
  initGiacEngine,
  classifyUserInput,
  normalizeMathInput,
  formatCleanNumber,
  analyzeExplicitFunction,
  analyzeImplicitEquation,
  solveSymbolicIntersections,
  constructExactTangentLine,
  computeDefiniteIntegral,
  computeTableOfValues,
  evaluateCASCommand,
  buildCompiledEvaluator,
  buildCompiledEvaluator3D,
  analyzeSurface3D,
  constructTangentPlane3D,
  analyzePlane3D,
  analyzeImplicit3D,
  solve3DPlaneIntersection,
  computeSolidOfRevolution,
  analyzeSpaceCurve3D,
  analyzeMatrix3D,
  analyzeVectorField3D
} from './cas-engine.js';
import { DynamicGraphCanvas } from './canvas-grapher.js';
import { SpatialGraph3D } from './canvas-3d.js';
import { SymGeoEventBus, createSymGeoSDK } from './open-api.js';

const CURVE_PALETTE = [
  '#4f46e5',
  '#059669',
  '#dc2626',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#db2777'
];

const SCENARIO_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11'];

const SCENARIOS = {
  s1: {
    title: '① 2D 무리수 교점 · 이차곡선',
    viewMode: '2d',
    view: { cx: 0.4, cy: 0.5, scale: 60 },
    inputs: [
      { raw: 'f(x) = x^2 - 2', showSpecial: false },
      { raw: 'g(x) = x + 1', showSpecial: false },
      { raw: 'c1: x^2 + y^2 = 10', showSpecial: false }
    ],
    autoIntersections: [[0, 1], [1, 2]]
  },
  s2: {
    title: '② 2D 삼차함수 극점·변곡점·정적분',
    viewMode: '2d',
    view: { cx: 0.9, cy: 0.3, scale: 66 },
    inputs: [
      { raw: 'f(x) = x^3 - 3x^2 - x + 3', showSpecial: true, activeForm: 'factored' }
    ],
    autoIntegrals: [{ idx: 0, a: '-1', b: '1' }]
  },
  s3: {
    title: '③ 2D 변곡점 판정 반례 (x⁴ vs x⁴-4x³)',
    viewMode: '2d',
    view: { cx: 1.0, cy: -5.0, scale: 26 },
    inputs: [
      { raw: 'f(x) = x^4 - 4x^3', showSpecial: true },
      { raw: 'g(x) = x^4', showSpecial: true }
    ]
  },
  s4: {
    title: '④ 2D 바이어슈트라스 & 첨점 미분불가능',
    viewMode: '2d',
    view: { cx: 0, cy: 0.3, scale: 95 },
    inputs: [
      { raw: 'w(x) = cos(x) + 0.5*cos(5x) + 0.25*cos(25x) + 0.125*cos(125x)', showSpecial: false },
      { raw: 'g(x) = |x^2 - 1|', showSpecial: false }
    ]
  },
  s5: {
    title: '⑤ 3D 구와 평면의 단면 교원 (Giac + BVH)',
    viewMode: '3d',
    cutaway: false,
    inputs: [
      { raw: 'k = 3', min: -5, max: 5 },
      { raw: 's1: x^2 + y^2 + z^2 = 9', color: '#059669' },
      { raw: 'p1: x + y + 2z = k', color: '#0284c7' }
    ],
    autoSlices3D: [[2, 1]] // plane p1 ∩ sphere s1
  },
  s6: {
    title: '⑥ 3D 원뿔곡선 단면 유도 (원·타원·포물선·쌍곡선)',
    viewMode: '3d',
    cutaway: false,
    inputs: [
      { raw: 'm = 1', min: 0, max: 2, step: 0.1 },
      { raw: 'c1: x^2 + y^2 = z^2', color: '#4f46e5' },
      { raw: 'p1: z = m*x + 3/2', color: '#d97706' }
    ],
    autoSlices3D: [[2, 1]]
  },
  s7: {
    title: '⑦ 2D↔3D 회전체 & 구분구적법 (미적분 II)',
    viewMode: 'split',
    view: { cx: 2.0, cy: 0.6, scale: 58 },
    cutaway: false,
    inputs: [
      { raw: 'f(x) = sqrt(x)', showSpecial: false, color: '#4f46e5' }
    ],
    autoRevolutions: [{ idx: 0, a: '0', b: '4', numDiscs: 12, showDiscs: true }]
  },
  s8: {
    title: '⑧ 3D 이변수 안장면 · CSG 입체 빼기 · GLB',
    viewMode: '3d',
    cutaway: false,
    inputs: [
      { raw: 's1(x, y) = (x^2 - y^2)/3', showSpecial: true, color: '#4f46e5' }
    ],
    autoCSG: ['sphere_minus_cyl']
  },
  s9: {
    title: '⑨ 대학 미분기하: 공간나선 프레네-세레 틀(T,N,B) & 가우스 곡률 K',
    viewMode: '3d',
    cutaway: false,
    inputs: [
      { raw: 'r(t) = [2*cos(t), 2*sin(t), t/2]', color: '#4f46e5' },
      { raw: 's1(x, y) = (x^2 - y^2)/4', showCurvatureMap: true, color: '#059669' }
    ]
  },
  s10: {
    title: '⑩ 대학 선형대수: 3D 선형변환 · 고유공간 · 조르당 표준형',
    viewMode: '3d',
    cutaway: false,
    inputs: [
      { raw: 'M = [[2, 1, 0], [1, 2, 0], [0, 0, 1/2]]', color: '#4f46e5' }
    ],
    casCommands: [
      'jordan([[5,4,2,1],[0,1,-1,-1],[-1,-1,3,0],[1,1,-1,2]])'
    ]
  },
  s11: {
    title: '⑪ 대학 벡터해석(Curl·Div) & 상미분방정식·라플라스',
    viewMode: '3d',
    cutaway: false,
    inputs: [
      { raw: 'F(x, y, z) = [-y, x, z/2]' }
    ],
    casCommands: [
      "desolve(y'' + 4*y = sin(x), x, y)",
      'laplace(t^2*exp(-3*t), t, s)',
      'residue(exp(z)/(z-1)^3, z, 1)'
    ]
  }
};

const state = {
  objects: [],
  nextId: 1,
  fnIndex: 0,
  selectedCardId: null,
  activeScenario: 's1',
  activePane: 'algebra',
  viewMode: '2d', // '2d' | 'split' | '3d'
  isMuted: true,
  recomputeTimer: null,
  sliderTimer: null,
  playingSliderId: null,
  traceAnim: null,
  tablePoints: [],
  pastedImageDataUrl: null,
  anonymizeStudents: true
};

const eventBus = new SymGeoEventBus();
let graphCanvas = null;
let graph3D = null;
let audioCtx = null;

function playSnapTone(freq = 660) {
  if (state.isMuted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.075);
  } catch {
    // Ignore audio context restriction
  }
}

function renderLatex(tex, container, displayMode = false) {
  if (!container) return;
  if (window.katex && tex) {
    try {
      window.katex.render(tex, container, { throwOnError: false, displayMode });
      return;
    } catch {
      // Fallback
    }
  }
  container.textContent = tex || '';
}

function getSliderParams() {
  const params = {};
  for (const obj of state.objects) {
    if (obj.kind === 'slider') params[obj.name] = obj.value;
  }
  return params;
}

function nextAutoLabel(kind) {
  const used = new Set(state.objects.map((o) => o.label).filter(Boolean));
  if (kind === 'explicit') {
    for (const n of ['f', 'g', 'h', 'p', 'q', 'r', 'u', 'v']) {
      if (!used.has(n)) return n;
    }
    return `f${++state.fnIndex}`;
  }
  if (kind === 'surface3d') {
    let i = 1;
    while (used.has(`s${i}`)) i++;
    return `s${i}`;
  }
  if (kind === 'plane3d') {
    let i = 1;
    while (used.has(`p${i}`)) i++;
    return `p${i}`;
  }
  if (kind === 'implicit' || kind === 'implicit3d') {
    let i = 1;
    while (used.has(`c${i}`)) i++;
    return `c${i}`;
  }
  return `obj${state.nextId}`;
}

function pickCurveColor() {
  const count = state.objects.filter((o) => o.kind !== 'slider' && o.kind !== 'cas').length;
  return CURVE_PALETTE[count % CURVE_PALETTE.length];
}

function updateEngineBadge(ms) {
  const el = document.getElementById('engineStatus');
  if (!el) return;
  el.classList.remove('is-loading');
  el.textContent = ms > 0 ? `Giac CAS (${ms}ms)` : 'Giac CAS 준비됨';
}

function showCanvasHint(msg, timeout = 3200) {
  const banner = document.getElementById('canvasHint');
  if (!banner) return;
  banner.textContent = msg;
  banner.classList.remove('is-hidden');
  clearTimeout(banner._timer);
  if (timeout > 0) {
    banner._timer = setTimeout(() => banner.classList.add('is-hidden'), timeout);
  }
}

export function setViewMode(mode) {
  const normalized = mode === 'both' ? 'split' : mode;
  state.viewMode = normalized;
  document.querySelectorAll('.vmode-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.vmode === normalized);
  });

  const pane2D = document.getElementById('pane2D');
  const pane3D = document.getElementById('pane3D');
  if (pane2D) pane2D.classList.toggle('is-hidden', normalized === '3d');
  if (pane3D) pane3D.classList.toggle('is-hidden', normalized === '2d');

  eventBus.emit('mode:switch', { mode: normalized });
  syncAllViewports();
}

/**
 * Single Unified DAG Dependency Refresh (2D + 3D + Giac Symbolic CAS)
 */
function refreshSymbolicScene(fullSpecialRecompute = true) {
  const params = getSliderParams();
  const paramNames = Object.keys(params);
  let totalMs = 0;

  for (const obj of state.objects) {
    if (obj.kind === 'explicit') {
      const isHeavyTrigSum = obj.rhsExpr.includes('125*x') || obj.rhsExpr.includes('125x');
      if (isHeavyTrigSum && !obj.showSpecial) {
        obj.evaluator = buildCompiledEvaluator(obj.rhsExpr, paramNames);
        obj.analysis = {
          simplified: obj.rhsExpr,
          forms: {
            exact: {
              label: '급수식',
              expr: obj.rhsExpr,
              latex: '\\cos x + \\frac{1}{2}\\cos(5x) + \\frac{1}{4}\\cos(25x) + \\frac{1}{8}\\cos(125x)'
            }
          },
          roots: [],
          extrema: [],
          inflections: [],
          nonInflectionWarnings: []
        };
        continue;
      }

      const ana = analyzeExplicitFunction(obj.rhsExpr, params, obj.showSpecial && fullSpecialRecompute);
      obj.analysis = fullSpecialRecompute || !obj.analysis
        ? ana
        : { ...obj.analysis, simplified: ana.simplified, forms: ana.forms };
      obj.evaluator = buildCompiledEvaluator(obj.rhsExpr, paramNames);
      if (fullSpecialRecompute && ana.nonInflectionWarnings?.length) {
        eventBus.emit('cas:warning_triggered', {
          label: obj.label,
          expr: obj.rhsExpr,
          warnings: ana.nonInflectionWarnings
        });
      }
      totalMs += ana.durationMs;
    } else if (obj.kind === 'implicit') {
      const ana = analyzeImplicitEquation(obj.lhsExpr, obj.rhsExpr, params);
      obj.analysis = ana;
      obj.evaluator = buildCompiledEvaluator(`(${obj.lhsExpr}) - (${obj.rhsExpr})`, paramNames);
      totalMs += ana.durationMs;
    } else if (obj.kind === 'surface3d') {
      const ana = analyzeSurface3D(obj.rhsExpr, params);
      obj.analysis = ana;
      obj.evaluator3D = buildCompiledEvaluator3D(obj.rhsExpr, paramNames);
      obj.gaussEvaluator3D = buildCompiledEvaluator3D(ana.gaussK || '0', paramNames);
      totalMs += ana.durationMs;
    } else if (obj.kind === 'spacecurve3d') {
      const ana = analyzeSpaceCurve3D(obj.vecExpr, obj.t0 ?? 1.0, params);
      obj.analysis = ana;
      totalMs += ana.durationMs;
    } else if (obj.kind === 'matrix3d') {
      const ana = analyzeMatrix3D(obj.matrixExpr, params);
      obj.analysis = ana;
      totalMs += ana.durationMs;
    } else if (obj.kind === 'vectorfield3d') {
      const ana = analyzeVectorField3D(obj.vecExpr, params);
      obj.analysis = ana;
      totalMs += ana.durationMs;
    } else if (obj.kind === 'plane3d') {
      const ana = analyzePlane3D(obj.lhsExpr, obj.rhsExpr, params);
      obj.analysis = ana;
      totalMs += ana.durationMs;
    } else if (obj.kind === 'implicit3d') {
      const ana = analyzeImplicit3D(obj.lhsExpr, obj.rhsExpr, params);
      obj.analysis = ana;
      obj.evaluator3D = buildCompiledEvaluator3D(`(${obj.lhsExpr}) - (${obj.rhsExpr})`, paramNames);
      totalMs += ana.durationMs;
    } else if (obj.kind === 'intersection' && fullSpecialRecompute) {
      const objA = state.objects.find((o) => o.id === obj.curveAId);
      const objB = state.objects.find((o) => o.id === obj.curveBId);
      if (objA && objB) {
        const res = solveSymbolicIntersections(objA, objB, params);
        obj.points = res.points.map((p) => ({ ...p, pinned: true }));
        obj.note = res.numericalComparisonNote;
        totalMs += res.durationMs;
      }
    } else if (obj.kind === 'integral' && fullSpecialRecompute) {
      const fnObj = state.objects.find((o) => o.id === obj.curveId && o.kind === 'explicit');
      if (fnObj) {
        obj.result = computeDefiniteIntegral(fnObj.rhsExpr, obj.aExact, obj.bExact, params);
        totalMs += obj.result.durationMs;
      }
    } else if (obj.kind === 'slice3d' && fullSpecialRecompute) {
      const plObj = state.objects.find((o) => o.id === obj.planeId && o.kind === 'plane3d');
      const tgObj = state.objects.find((o) => o.id === obj.targetId);
      if (plObj && tgObj) {
        obj.result = solve3DPlaneIntersection(plObj, tgObj, params);
        totalMs += obj.result.durationMs;
      }
    } else if (obj.kind === 'revolution3d') {
      const fnObj = state.objects.find((o) => o.id === obj.sourceFnId && o.kind === 'explicit');
      if (fnObj) {
        obj.result = computeSolidOfRevolution(fnObj.rhsExpr, obj.aExact, obj.bExact, obj.numDiscs, params);
        totalMs += obj.result.durationMs;
      }
    }
  }

  updateEngineBadge(totalMs);
  syncAllViewports();
  renderAlgebraPanel();
  if (state.activePane === 'table') buildValuesTable();
}

function syncAllViewports() {
  const params = getSliderParams();

  // 1. Sync 2D Canvas
  if (graphCanvas && state.viewMode !== '3d') {
    const curves2D = state.objects.filter((o) => o.kind === 'explicit' || o.kind === 'implicit');
    const specialPoints = [...state.tablePoints];
    const shadedIntegrals = [];

    for (const obj of state.objects) {
      if (obj.kind === 'explicit' && obj.visible && obj.showSpecial && obj.analysis) {
        for (const pt of obj.analysis.extrema || []) specialPoints.push({ ...pt, pinned: true });
        for (const pt of obj.analysis.inflections || []) specialPoints.push({ ...pt, pinned: true });
        for (const pt of obj.analysis.roots || []) specialPoints.push({ ...pt, pinned: false });
      } else if (obj.kind === 'intersection' && obj.visible) {
        for (const pt of obj.points || []) specialPoints.push(pt);
      } else if (obj.kind === 'integral' && obj.visible && obj.result) {
        const fnObj = state.objects.find((o) => o.id === obj.curveId && o.kind === 'explicit');
        if (fnObj && fnObj.evaluator) {
          shadedIntegrals.push({
            id: obj.id,
            evaluator: fnObj.evaluator,
            a: obj.result.aNum,
            b: obj.result.bNum,
            color: fnObj.color,
            visible: true,
            latexBadge: `\\int_{${obj.result.aLatex}}^{${obj.result.bLatex}} ${fnObj.label}(x)\\,dx = ${obj.result.latex}`
          });
        }
      } else if (obj.kind === 'revolution3d' && obj.visible && obj.result) {
        // Also shade the revolved profile region on 2D canvas in split mode!
        const fnObj = state.objects.find((o) => o.id === obj.sourceFnId && o.kind === 'explicit');
        if (fnObj && fnObj.evaluator) {
          shadedIntegrals.push({
            id: obj.id,
            evaluator: fnObj.evaluator,
            a: obj.result.aNum,
            b: obj.result.bNum,
            color: obj.color || fnObj.color,
            visible: true,
            latexBadge: `V = ${obj.result.volLatex}`
          });
        }
      }
      if (obj.tangentPoint && obj.visible) {
        specialPoints.push({ ...obj.tangentPoint, pinned: true });
      }
    }

    let traceRenderState = null;
    if (state.traceAnim) {
      const fnObj = state.objects.find((o) => o.id === state.traceAnim.objId && o.kind === 'explicit');
      if (fnObj && fnObj.evaluator) {
        traceRenderState = {
          color: fnObj.color,
          trail: state.traceAnim.trail,
          slope: state.traceAnim.slope
        };
      }
    }

    graphCanvas.setScene(curves2D, params, specialPoints, shadedIntegrals, traceRenderState);
  }

  // 2. Sync 3D WebGL Viewport
  if (graph3D && state.viewMode !== '2d') {
    graph3D.setScene3D(state.objects, params);
  }
}

/**
 * Add an Expression (2D or 3D or Slider or CAS)
 */
export function addInputExpression(rawText, options = {}) {
  const params = getSliderParams();
  const classified = classifyUserInput(rawText, params);
  if (!classified) return null;

  playSnapTone(620);
  eventBus.emit('expression:add', { kind: classified.kind, rawInput: classified.rawInput });

  if (classified.kind === 'point' || classified.kind === 'point3d') {
    const coords = classified.coordsExpr.map((c) => evaluateCASCommand(c, params));
    const ptObj = {
      id: state.nextId++,
      kind: classified.kind,
      label: classified.label || 'P',
      rawInput: classified.rawInput,
      coordsExpr: classified.coordsExpr,
      coords,
      color: options.color || '#dc2626',
      visible: true
    };
    state.objects.push(ptObj);
    if (!options.silentRefresh) refreshSymbolicScene(false);
    return ptObj;
  }

  if (classified.kind === 'slider') {
    const existing = state.objects.find((o) => o.kind === 'slider' && o.name === classified.name);
    if (existing) {
      existing.value = classified.value;
      if (!options.silentRefresh) refreshSymbolicScene(true);
      return existing;
    }
    const sliderObj = {
      id: state.nextId++,
      kind: 'slider',
      name: classified.name,
      label: classified.name,
      value: classified.value,
      min: options.min !== undefined ? options.min : classified.min,
      max: options.max !== undefined ? options.max : classified.max,
      step: options.step !== undefined ? options.step : classified.step,
      integerSnap: false,
      speed: 1,
      visible: true
    };
    state.objects.unshift(sliderObj);
    if (!options.silentRefresh) refreshSymbolicScene(true);
    eventBus.emit('SLIDER_CREATED', { name: sliderObj.name, value: sliderObj.value });
    return sliderObj;
  }

  if (classified.kind === 'surface3d') {
    const label = classified.label || nextAutoLabel('surface3d');
    const obj = {
      id: state.nextId++,
      kind: 'surface3d',
      label,
      rawInput: classified.rawInput,
      rhsExpr: classified.rhsExpr,
      color: options.color || pickCurveColor(),
      visible: true,
      showSpecial: Boolean(options.showSpecial),
      showCurvatureMap: Boolean(options.showCurvatureMap),
      showPartials: false,
      analysis: null,
      evaluator3D: null,
      gaussEvaluator3D: null
    };
    state.objects.push(obj);
    if (!options.silentRefresh) {
      if (state.viewMode === '2d') setViewMode('3d');
      refreshSymbolicScene(true);
    }
    eventBus.emit('SURFACE3D_ADDED', { label: obj.label, expr: obj.rhsExpr });
    return obj;
  }

  if (classified.kind === 'spacecurve3d') {
    const obj = {
      id: state.nextId++,
      kind: 'spacecurve3d',
      label: classified.label || 'r',
      rawInput: classified.rawInput,
      vecExpr: classified.vecExpr,
      t0: 1.0,
      tMin: -6.28,
      tMax: 6.28,
      color: options.color || '#4f46e5',
      visible: true,
      analysis: null
    };
    state.objects.push(obj);
    if (!options.silentRefresh) {
      if (state.viewMode === '2d') setViewMode('3d');
      refreshSymbolicScene(true);
    }
    eventBus.emit('SPACECURVE3D_ADDED', { label: obj.label, expr: obj.vecExpr });
    return obj;
  }

  if (classified.kind === 'matrix3d') {
    const obj = {
      id: state.nextId++,
      kind: 'matrix3d',
      label: classified.label || 'M',
      rawInput: classified.rawInput,
      matrixExpr: classified.matrixExpr,
      interp: 1.0,
      color: options.color || '#4f46e5',
      visible: true,
      analysis: null
    };
    state.objects.push(obj);
    if (!options.silentRefresh) {
      if (state.viewMode === '2d') setViewMode('3d');
      refreshSymbolicScene(true);
    }
    eventBus.emit('MATRIX3D_ADDED', { label: obj.label, matrix: obj.matrixExpr });
    return obj;
  }

  if (classified.kind === 'vectorfield3d') {
    const obj = {
      id: state.nextId++,
      kind: 'vectorfield3d',
      label: classified.label || 'F',
      rawInput: classified.rawInput,
      vecExpr: classified.vecExpr,
      visible: true,
      analysis: null
    };
    state.objects.push(obj);
    if (!options.silentRefresh) {
      if (state.viewMode === '2d') setViewMode('3d');
      refreshSymbolicScene(true);
    }
    eventBus.emit('VECTORFIELD3D_ADDED', { label: obj.label, field: obj.vecExpr });
    return obj;
  }

  if (classified.kind === 'plane3d') {
    const label = classified.label || nextAutoLabel('plane3d');
    const obj = {
      id: state.nextId++,
      kind: 'plane3d',
      label,
      rawInput: classified.rawInput,
      lhsExpr: classified.lhsExpr,
      rhsExpr: classified.rhsExpr,
      color: options.color || '#0284c7',
      visible: true,
      analysis: null
    };
    state.objects.push(obj);
    if (!options.silentRefresh) {
      if (state.viewMode === '2d') setViewMode('3d');
      refreshSymbolicScene(true);
    }
    eventBus.emit('PLANE3D_ADDED', { label: obj.label, eq: `${obj.lhsExpr}=${obj.rhsExpr}` });
    return obj;
  }

  if (classified.kind === 'implicit3d') {
    const label = classified.label || nextAutoLabel('implicit3d');
    const obj = {
      id: state.nextId++,
      kind: 'implicit3d',
      label,
      rawInput: classified.rawInput,
      lhsExpr: classified.lhsExpr,
      rhsExpr: classified.rhsExpr,
      color: options.color || pickCurveColor(),
      visible: true,
      analysis: null,
      evaluator3D: null
    };
    state.objects.push(obj);
    if (!options.silentRefresh) {
      if (state.viewMode === '2d') setViewMode('3d');
      refreshSymbolicScene(true);
    }
    eventBus.emit('QUADRIC3D_ADDED', { label: obj.label, eq: `${obj.lhsExpr}=${obj.rhsExpr}` });
    return obj;
  }

  if (classified.kind === 'explicit') {
    const label = classified.label || nextAutoLabel('explicit');
    const fnObj = {
      id: state.nextId++,
      kind: 'explicit',
      label,
      rawInput: classified.rawInput,
      rhsExpr: classified.rhsExpr,
      color: options.color || pickCurveColor(),
      visible: true,
      isTangent: Boolean(options.isTangent),
      tangentPoint: options.tangentPoint || null,
      showSpecial: Boolean(options.showSpecial),
      activeForm: options.activeForm || 'exact',
      analysis: null,
      evaluator: null
    };
    state.objects.push(fnObj);
    if (!options.silentRefresh) refreshSymbolicScene(true);
    eventBus.emit('FUNCTION_ADDED', { label: fnObj.label, expr: fnObj.rhsExpr });
    return fnObj;
  }

  if (classified.kind === 'implicit') {
    const label = classified.label || nextAutoLabel('implicit');
    const impObj = {
      id: state.nextId++,
      kind: 'implicit',
      label,
      rawInput: classified.rawInput,
      lhsExpr: classified.lhsExpr,
      rhsExpr: classified.rhsExpr,
      color: options.color || pickCurveColor(),
      visible: true,
      analysis: null,
      evaluator: null
    };
    state.objects.push(impObj);
    if (!options.silentRefresh) refreshSymbolicScene(true);
    eventBus.emit('IMPLICIT_CURVE_ADDED', { label: impObj.label });
    return impObj;
  }

  if (classified.kind === 'cas') {
    const res = evaluateCASCommand(classified.giacExpr, params);
    const casObj = {
      id: state.nextId++,
      kind: 'cas',
      label: classified.label || 'CAS',
      rawInput: classified.rawInput,
      giacExpr: classified.giacExpr,
      result: res,
      showApprox: false
    };
    state.objects.push(casObj);
    updateEngineBadge(res.durationMs);
    if (!options.silentRefresh) renderAlgebraPanel();
    eventBus.emit('CAS_EVALUATED', { command: classified.giacExpr, exact: res.exact });
    return casObj;
  }

  return null;
}

/**
 * Create 3D Symbolic Plane-Surface Intersection Card (Giac + BVH)
 */
export function create3DSliceCard(planeId, targetId, silent = false) {
  const plObj = state.objects.find((o) => o.id === Number(planeId) && o.kind === 'plane3d');
  const tgObj = state.objects.find((o) => o.id === Number(targetId));
  if (!plObj || !tgObj || plObj.id === tgObj.id) return null;

  const res = solve3DPlaneIntersection(plObj, tgObj, getSliderParams());
  const sliceObj = {
    id: state.nextId++,
    kind: 'slice3d',
    label: `단면(${plObj.label} ∩ ${tgObj.label})`,
    planeId: plObj.id,
    targetId: tgObj.id,
    result: res,
    visible: true
  };
  state.objects.push(sliceObj);
  state.selectedCardId = sliceObj.id;

  if (!silent) {
    if (state.viewMode === '2d') setViewMode('3d');
    syncAllViewports();
    renderAlgebraPanel();
    showCanvasHint(`[${plObj.label} ∩ ${tgObj.label}] 3D 단면 대수 방정식 및 BVH 절단선 생성 완료`);
  }

  eventBus.emit('SLICE3D_COMPUTED', { pair: sliceObj.label, type: res.type });
  return sliceObj;
}

/**
 * Create 2D -> 3D Solid of Revolution + 구분구적법 Discs Card
 */
export function createRevolution3D(fnId, aExact = '0', bExact = '3', numDiscs = 12, showDiscs = true, silent = false) {
  const fnObj = state.objects.find((o) => o.id === Number(fnId) && o.kind === 'explicit');
  if (!fnObj) return null;

  const res = computeSolidOfRevolution(fnObj.rhsExpr, aExact, bExact, numDiscs, getSliderParams());
  const revObj = {
    id: state.nextId++,
    kind: 'revolution3d',
    label: `회전체(${fnObj.label})`,
    sourceFnId: fnObj.id,
    fnLabel: fnObj.label,
    color: fnObj.color,
    aExact: String(aExact),
    bExact: String(bExact),
    numDiscs,
    showDiscs,
    result: res,
    visible: true
  };
  state.objects.push(revObj);
  state.selectedCardId = revObj.id;

  if (!silent) {
    if (state.viewMode === '2d') setViewMode('split');
    syncAllViewports();
    renderAlgebraPanel();
    showCanvasHint(`[${fnObj.label}] x축 회전체 생성 완료! 정확 부피 V = ${res.volExact}`);
  }

  eventBus.emit('REVOLUTION3D_CREATED', { fn: fnObj.label, volumeExact: res.volExact });
  return revObj;
}

/**
 * Create CSG Boolean Solid (`three-bvh-csg`)
 */
export function addCSGSolid(preset = 'sphere_minus_cyl', silent = false) {
  const names = {
    sphere_minus_cyl: 'CSG 입체: 구 − 원기둥 (차집합)',
    box_union_sphere: 'CSG 입체: 정육면체 ∪ 구 (합집합)',
    sphere_intersect_box: 'CSG 입체: 구 ∩ 정육면체 (교집합)'
  };
  // Replace existing CSG object if present for clean switching
  state.objects = state.objects.filter((o) => o.kind !== 'csg3d');

  const csgObj = {
    id: state.nextId++,
    kind: 'csg3d',
    preset,
    label: names[preset] || 'CSG 입체',
    color: '#7c3aed',
    visible: true
  };
  state.objects.push(csgObj);

  if (!silent) {
    if (state.viewMode === '2d') setViewMode('3d');
    syncAllViewports();
    renderAlgebraPanel();
    showCanvasHint(`${csgObj.label} 생성 완료! [.GLB 저장]으로 파워포인트·로블록스에 바로 넣을 수 있습니다.`);
  }

  eventBus.emit('CSG_SOLID_CREATED', { preset });
  return csgObj;
}

export function createSymbolicIntersection(idA, idB, silent = false) {
  const objA = state.objects.find((o) => o.id === Number(idA));
  const objB = state.objects.find((o) => o.id === Number(idB));
  if (!objA || !objB || objA.id === objB.id) return null;

  playSnapTone(780);
  const res = solveSymbolicIntersections(objA, objB, getSliderParams());

  const existing = state.objects.find(
    (o) =>
      o.kind === 'intersection' &&
      ((o.curveAId === objA.id && o.curveBId === objB.id) ||
        (o.curveAId === objB.id && o.curveBId === objA.id))
  );
  if (existing) {
    existing.points = res.points.map((p) => ({ ...p, pinned: true }));
    existing.note = res.numericalComparisonNote;
    existing.visible = true;
    syncAllViewports();
    renderAlgebraPanel();
    return existing;
  }

  const interObj = {
    id: state.nextId++,
    kind: 'intersection',
    label: `${objA.label} ∩ ${objB.label}`,
    curveAId: objA.id,
    curveBId: objB.id,
    visible: true,
    points: res.points.map((p) => ({ ...p, pinned: true })),
    note: res.numericalComparisonNote
  };
  state.objects.push(interObj);

  if (!silent) {
    syncAllViewports();
    renderAlgebraPanel();
    showCanvasHint(`[${interObj.label}] 대수적 교점 ${res.points.length}개 계산 완료`);
  }
  eventBus.emit('INTERSECTION_SOLVED', { pair: interObj.label, count: res.points.length });
  return interObj;
}

export function createSymbolicTangent(curveId, x0Exact) {
  const obj = state.objects.find((o) => o.id === Number(curveId) && o.kind === 'explicit');
  if (!obj) return null;

  playSnapTone(720);
  const tg = constructExactTangentLine(obj.rhsExpr, x0Exact, getSliderParams());
  const created = addInputExpression(`t_${obj.label}(x) = ${tg.lineRhs}`, {
    color: '#d97706',
    isTangent: true,
    tangentPoint: tg.point,
    showSpecial: false
  });
  showCanvasHint(`[${obj.label}] x = ${x0Exact} 접선 작도 완료`);
  return created;
}

export function createSymbolicIntegral(curveId, aExact, bExact, silent = false) {
  const fnObj = state.objects.find((o) => o.id === Number(curveId) && o.kind === 'explicit');
  if (!fnObj) return null;

  playSnapTone(840);
  const res = computeDefiniteIntegral(fnObj.rhsExpr, aExact, bExact, getSliderParams());
  const intObj = {
    id: state.nextId++,
    kind: 'integral',
    curveId: fnObj.id,
    fnLabel: fnObj.label,
    color: fnObj.color,
    aExact: String(aExact),
    bExact: String(bExact),
    result: res,
    visible: true
  };
  state.objects.push(intObj);

  if (!silent) {
    syncAllViewports();
    renderAlgebraPanel();
    showCanvasHint(`[${fnObj.label}] 정적분 = ${res.exact}`);
  }
  return intObj;
}

function togglePointTrace(objId) {
  if (state.traceAnim && state.traceAnim.objId === objId) {
    cancelAnimationFrame(state.traceAnim.raf);
    state.traceAnim = null;
    syncAllViewports();
    renderAlgebraPanel();
    return;
  }
  if (state.traceAnim) cancelAnimationFrame(state.traceAnim.raf);

  const fnObj = state.objects.find((o) => o.id === objId && o.kind === 'explicit');
  if (!fnObj || !fnObj.evaluator) return;

  const xStart = Math.max(-4, graphCanvas.screenToWorldX(40));
  const xEnd = Math.min(4, graphCanvas.screenToWorldX(graphCanvas.width - 40));

  const anim = { objId, t: xStart, trail: [], slope: 0, raf: 0 };
  state.traceAnim = anim;

  const stepFrame = () => {
    if (state.traceAnim !== anim) return;
    const params = getSliderParams();
    const y = fnObj.evaluator(anim.t, 0, params);
    const yNext = fnObj.evaluator(anim.t + 0.005, 0, params);
    if (Number.isFinite(y)) {
      anim.trail.push({ x: anim.t, y });
      if (anim.trail.length > 260) anim.trail.shift();
      anim.slope = Number.isFinite(yNext) ? (yNext - y) / 0.005 : 0;
    }
    anim.t += 0.035;
    if (anim.t > xEnd) {
      anim.t = xStart;
      anim.trail = [];
    }
    syncAllViewports();
    anim.raf = requestAnimationFrame(stepFrame);
  };
  anim.raf = requestAnimationFrame(stepFrame);
  renderAlgebraPanel();
}

function removeObject(id) {
  if (state.traceAnim && state.traceAnim.objId === id) {
    cancelAnimationFrame(state.traceAnim.raf);
    state.traceAnim = null;
  }
  if (state.playingSliderId === id) {
    clearInterval(state.sliderTimer);
    state.playingSliderId = null;
  }
  state.objects = state.objects.filter(
    (o) =>
      o.id !== id &&
      !(o.kind === 'intersection' && (o.curveAId === id || o.curveBId === id)) &&
      !(o.kind === 'integral' && o.curveId === id) &&
      !(o.kind === 'slice3d' && (o.planeId === id || o.targetId === id)) &&
      !(o.kind === 'revolution3d' && o.sourceFnId === id)
  );
  eventBus.emit('expression:remove', { id });
  refreshSymbolicScene(true);
}

/**
 * Render Unified 2D + 3D Algebra Stream
 */
function renderAlgebraPanel() {
  updateToolSelectors();

  const listEl = document.getElementById('algebraList');
  if (!listEl) return;
  listEl.innerHTML = '';

  for (const obj of state.objects) {
    const row = document.createElement('div');
    row.className = `alg-row${state.selectedCardId === obj.id ? ' is-selected' : ''}`;

    if (obj.kind === 'slider') renderSliderRow(row, obj);
    else if (obj.kind === 'explicit') renderExplicitRow(row, obj);
    else if (obj.kind === 'implicit') renderImplicitRow(row, obj);
    else if (obj.kind === 'surface3d') renderSurface3DRow(row, obj);
    else if (obj.kind === 'plane3d') renderPlane3DRow(row, obj);
    else if (obj.kind === 'implicit3d') renderImplicit3DRow(row, obj);
    else if (obj.kind === 'slice3d') renderSlice3DRow(row, obj);
    else if (obj.kind === 'revolution3d') renderRevolution3DRow(row, obj);
    else if (obj.kind === 'csg3d') renderCSG3DRow(row, obj);
    else if (obj.kind === 'spacecurve3d') renderSpaceCurve3DRow(row, obj);
    else if (obj.kind === 'matrix3d') renderMatrix3DRow(row, obj);
    else if (obj.kind === 'vectorfield3d') renderVectorField3DRow(row, obj);
    else if (obj.kind === 'intersection') renderIntersectionRow(row, obj);
    else if (obj.kind === 'integral') renderIntegralRow(row, obj);
    else if (obj.kind === 'cas') renderCasRow(row, obj);

    listEl.appendChild(row);
  }
}

function updateToolSelectors() {
  const selA = document.getElementById('qiSelectA');
  const selB = document.getElementById('qiSelectB');
  const intSel = document.getElementById('intFnSelect');
  const revSel = document.getElementById('revFnSelect');
  const plSel = document.getElementById('pl3dSelect');
  const sfSel = document.getElementById('surf3dSelect');
  if (!selA || !selB || !intSel || !revSel || !plSel || !sfSel) return;

  const curves2D = state.objects.filter((o) => o.kind === 'explicit' || o.kind === 'implicit');
  const explicit2D = curves2D.filter((o) => o.kind === 'explicit' && !o.isTangent);
  const planes3D = state.objects.filter((o) => o.kind === 'plane3d');
  const targets3D = state.objects.filter((o) =>
    ['surface3d', 'implicit3d', 'plane3d', 'revolution3d'].includes(o.kind)
  );

  selA.innerHTML = ''; selB.innerHTML = ''; intSel.innerHTML = ''; revSel.innerHTML = '';
  plSel.innerHTML = ''; sfSel.innerHTML = '';

  curves2D.forEach((c, i) => {
    const opt = document.createElement('option');
    opt.value = String(c.id);
    opt.textContent = `${c.label}: ${c.kind === 'explicit' ? `y=${c.rhsExpr}` : `${c.lhsExpr}=${c.rhsExpr}`}`;
    selA.appendChild(opt);
    selB.appendChild(opt.cloneNode(true));
    if (i === 0) selA.value = String(c.id);
    if (i === 1) selB.value = String(c.id);
  });

  explicit2D.forEach((c) => {
    const o = document.createElement('option');
    o.value = String(c.id);
    o.textContent = `${c.label}(x) = ${c.rhsExpr}`;
    intSel.appendChild(o);
    revSel.appendChild(o.cloneNode(true));
  });

  planes3D.forEach((p) => {
    const o = document.createElement('option');
    o.value = String(p.id);
    o.textContent = `${p.label}: ${p.lhsExpr} = ${p.rhsExpr}`;
    plSel.appendChild(o);
  });

  targets3D.forEach((t) => {
    const o = document.createElement('option');
    o.value = String(t.id);
    o.textContent = `${t.label}`;
    sfSel.appendChild(o);
  });
}

function renderSliderRow(row, obj) {
  const head = document.createElement('div');
  head.className = 'alg-row-head';

  const left = document.createElement('div');
  left.className = 'alg-left';

  const marble = document.createElement('span');
  marble.className = 'ggb-marble is-on';
  marble.style.color = '#4f46e5';
  left.appendChild(marble);

  const mathDiv = document.createElement('div');
  mathDiv.className = 'alg-math';
  renderLatex(`${obj.name} = ${formatCleanNumber(obj.value, 3)}`, mathDiv);
  left.appendChild(mathDiv);
  head.appendChild(left);

  const actions = document.createElement('div');
  actions.className = 'alg-actions';

  const snapBtn = document.createElement('button');
  snapBtn.className = `cas-chip${obj.integerSnap ? ' is-active' : ''}`;
  snapBtn.textContent = '정수 스냅';
  snapBtn.onclick = () => {
    obj.integerSnap = !obj.integerSnap;
    if (obj.integerSnap) obj.value = Math.round(obj.value);
    refreshSymbolicScene(true);
  };
  actions.appendChild(snapBtn);

  const delBtn = document.createElement('button');
  delBtn.className = 'row-icon-btn danger';
  delBtn.textContent = '✕';
  delBtn.onclick = () => removeObject(obj.id);
  actions.appendChild(delBtn);

  head.appendChild(actions);
  row.appendChild(head);

  const ctrl = document.createElement('div');
  ctrl.className = 'ggb-slider-controls';

  const playBtn = document.createElement('button');
  const isPlaying = state.playingSliderId === obj.id;
  playBtn.className = `play-slider-btn${isPlaying ? ' is-playing' : ''}`;
  playBtn.textContent = isPlaying ? '⏸' : '▶';
  playBtn.onclick = () => {
    if (state.playingSliderId === obj.id) {
      clearInterval(state.sliderTimer);
      state.playingSliderId = null;
      renderAlgebraPanel();
      return;
    }
    clearInterval(state.sliderTimer);
    state.playingSliderId = obj.id;
    let dir = 1;
    state.sliderTimer = setInterval(() => {
      let nextVal = obj.value + dir * 0.1;
      if (nextVal >= obj.max) { nextVal = obj.max; dir = -1; }
      if (nextVal <= obj.min) { nextVal = obj.min; dir = 1; }
      obj.value = Number(nextVal.toFixed(2));
      renderLatex(`${obj.name} = ${formatCleanNumber(obj.value, 3)}`, mathDiv);
      range.value = String(obj.value);
      refreshSymbolicScene(false);
    }, 65);
    renderAlgebraPanel();
  };

  const minS = document.createElement('span');
  minS.className = 'slider-minmax';
  minS.textContent = String(obj.min);

  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'ggb-range';
  range.min = String(obj.min);
  range.max = String(obj.max);
  range.step = obj.integerSnap ? '1' : String(obj.step);
  range.value = String(obj.value);
  range.addEventListener('input', () => {
    obj.value = obj.integerSnap ? Math.round(Number(range.value)) : Number(range.value);
    renderLatex(`${obj.name} = ${formatCleanNumber(obj.value, 3)}`, mathDiv);
    clearTimeout(state.recomputeTimer);
    state.recomputeTimer = setTimeout(() => {
      eventBus.emit('slider:change', { name: obj.name, value: obj.value });
      refreshSymbolicScene(true);
    }, 75);
  });

  const maxS = document.createElement('span');
  maxS.className = 'slider-minmax';
  maxS.textContent = String(obj.max);

  ctrl.append(playBtn, minS, range, maxS);
  row.appendChild(ctrl);
}

function renderExplicitRow(row, obj) {
  const head = document.createElement('div');
  head.className = 'alg-row-head';

  const left = document.createElement('div');
  left.className = 'alg-left';

  const marble = document.createElement('span');
  marble.className = `ggb-marble${obj.visible ? ' is-on' : ''}`;
  marble.style.color = obj.color;
  marble.onclick = () => {
    obj.visible = !obj.visible;
    syncAllViewports();
    renderAlgebraPanel();
  };
  left.appendChild(marble);

  const mathDiv = document.createElement('div');
  mathDiv.className = 'alg-math';
  const mainTex = obj.analysis?.forms?.exact?.latex || obj.rhsExpr;
  renderLatex(`${obj.label}(x) = ${mainTex}`, mathDiv);
  left.appendChild(mathDiv);
  head.appendChild(left);

  const actions = document.createElement('div');
  actions.className = 'alg-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'row-icon-btn';
  editBtn.textContent = '수정';
  editBtn.onclick = () => {
    const inp = document.getElementById('mathInput');
    if (inp) {
      inp.value = `${obj.label}(x) = ${obj.rhsExpr}`;
      inp.focus();
      removeObject(obj.id);
    }
  };
  actions.appendChild(editBtn);

  const delBtn = document.createElement('button');
  delBtn.className = 'row-icon-btn danger';
  delBtn.textContent = '✕';
  delBtn.onclick = () => removeObject(obj.id);
  actions.appendChild(delBtn);

  head.appendChild(actions);
  row.appendChild(head);

  if (obj.analysis && obj.analysis.forms) {
    const chips = document.createElement('div');
    chips.className = 'cas-chips';

    const formKeys = ['exact', 'factored', 'expanded', 'special', 'diff1', 'diff2', 'integral', 'approx'];
    for (const key of formKeys) {
      const fInfo = obj.analysis.forms[key];
      if (!fInfo) continue;
      const chip = document.createElement('button');
      chip.className = `cas-chip${obj.activeForm === key ? ' is-active' : ''}`;
      chip.textContent = fInfo.label;
      chip.onclick = () => {
        obj.activeForm = key;
        renderAlgebraPanel();
      };
      chips.appendChild(chip);
    }

    if (!obj.isTangent) {
      if (Object.keys(obj.analysis.forms).length > 1) {
        const spBtn = document.createElement('button');
        spBtn.className = `cas-chip accent-purple${obj.showSpecial ? ' is-on' : ''}`;
        spBtn.textContent = obj.showSpecial ? '★ 극점·변곡점 ON' : '☆ 극점·변곡점';
        spBtn.onclick = () => {
          obj.showSpecial = !obj.showSpecial;
          refreshSymbolicScene(true);
        };
        chips.appendChild(spBtn);
      }

      const isTracing = state.traceAnim && state.traceAnim.objId === obj.id;
      const traceBtn = document.createElement('button');
      traceBtn.className = `cas-chip accent-pink${isTracing ? ' is-on' : ''}`;
      traceBtn.textContent = isTracing ? '⏹ 자취' : '▶ 자취';
      traceBtn.onclick = () => togglePointTrace(obj.id);
      chips.appendChild(traceBtn);

      // 1-Click 2D -> 3D Solid of Revolution Link!
      const revBtn = document.createElement('button');
      revBtn.className = 'cas-chip';
      revBtn.style.borderColor = '#93c5fd';
      revBtn.style.color = '#1d4ed8';
      revBtn.textContent = '🔄 3D 회전체';
      revBtn.onclick = () => createRevolution3D(obj.id, '0', '3', 12, true);
      chips.appendChild(revBtn);
    }

    row.appendChild(chips);

    if (obj.activeForm && obj.activeForm !== 'exact' && obj.analysis.forms[obj.activeForm]) {
      const info = obj.analysis.forms[obj.activeForm];
      const box = document.createElement('div');
      box.className = 'cas-output-card';
      const m = document.createElement('div');
      let prefix = `${obj.label}(x) = `;
      if (obj.activeForm === 'diff1') prefix = `${obj.label}'(x) = `;
      else if (obj.activeForm === 'diff2') prefix = `${obj.label}''(x) = `;
      else if (obj.activeForm === 'integral') prefix = `\\int ${obj.label}(x)\\,dx = `;
      else if (obj.activeForm === 'approx') prefix = `${obj.label}(x) \\approx `;
      renderLatex(`${prefix}${info.latex}`, m);
      box.appendChild(m);
      row.appendChild(box);
    }

    if (obj.showSpecial) {
      const sub = document.createElement('div');
      sub.className = 'sp-sublist';
      const pts = [
        ...(obj.analysis.extrema || []),
        ...(obj.analysis.inflections || []),
        ...(obj.analysis.roots || [])
      ];
      const colors = { max: '#2563eb', min: '#0891b2', inflection: '#9333ea', root: '#475569' };

      for (const pt of pts) {
        const r = document.createElement('div');
        r.className = 'sp-row';
        r.onclick = () => {
          graphCanvas.centerX = pt.x;
          graphCanvas.centerY = pt.y;
          graphCanvas.requestRender();
        };
        const lw = document.createElement('div');
        lw.style.display = 'flex'; lw.style.alignItems = 'center'; lw.style.gap = '6px';
        const t = document.createElement('span');
        t.className = 'sp-tag';
        t.style.background = colors[pt.kind] || '#475569';
        t.textContent = pt.badge;
        const m = document.createElement('span');
        renderLatex(pt.latexCoord, m);
        lw.append(t, m);

        const approx = document.createElement('span');
        approx.style.fontSize = '11px'; approx.style.color = '#64748b';
        approx.textContent = `≈ (${formatCleanNumber(pt.x, 3)}, ${formatCleanNumber(pt.y, 3)})`;
        r.append(lw, approx);
        sub.appendChild(r);
      }

      for (const w of obj.analysis.nonInflectionWarnings || []) {
        const wb = document.createElement('div');
        wb.className = 'sp-warn-box';
        wb.textContent = `반례 주의 (x = ${w.exactX}): ${w.reason}`;
        sub.appendChild(wb);
      }
      row.appendChild(sub);
    }
  }
}

function renderSurface3DRow(row, obj) {
  const head = document.createElement('div');
  head.className = 'alg-row-head';

  const left = document.createElement('div');
  left.className = 'alg-left';

  const marble = document.createElement('span');
  marble.className = `ggb-marble${obj.visible ? ' is-on' : ''}`;
  marble.style.color = obj.color;
  marble.onclick = () => {
    obj.visible = !obj.visible;
    syncAllViewports();
    renderAlgebraPanel();
  };
  left.appendChild(marble);

  const mathDiv = document.createElement('div');
  mathDiv.className = 'alg-math';
  renderLatex(`z = ${obj.analysis?.latex || obj.rhsExpr}`, mathDiv);
  left.appendChild(mathDiv);
  head.appendChild(left);

  const delBtn = document.createElement('button');
  delBtn.className = 'row-icon-btn danger';
  delBtn.textContent = '✕';
  delBtn.onclick = () => removeObject(obj.id);
  head.appendChild(delBtn);
  row.appendChild(head);

  if (obj.analysis) {
    const chips = document.createElement('div');
    chips.className = 'cas-chips';

    const pBtn = document.createElement('button');
    pBtn.className = `cas-chip${obj.showPartials ? ' is-active' : ''}`;
    pBtn.textContent = '편도함수 ∂z/∂x, ∂z/∂y';
    pBtn.onclick = () => {
      obj.showPartials = !obj.showPartials;
      renderAlgebraPanel();
    };
    chips.appendChild(pBtn);

    const spBtn = document.createElement('button');
    spBtn.className = `cas-chip accent-purple${obj.showSpecial ? ' is-on' : ''}`;
    spBtn.textContent = obj.showSpecial ? '★ 안장점·극점 ON' : '☆ 안장점·극점';
    spBtn.onclick = () => {
      obj.showSpecial = !obj.showSpecial;
      syncAllViewports();
      renderAlgebraPanel();
    };
    chips.appendChild(spBtn);

    const tpBtn = document.createElement('button');
    tpBtn.className = 'cas-chip';
    tpBtn.textContent = '╱ (1, 1) 접평면 작도';
    tpBtn.onclick = () => {
      const tp = constructTangentPlane3D(obj.rhsExpr, '1', '1', getSliderParams());
      addInputExpression(`tp_${obj.label}: ${tp.planeEqRaw}`, { color: '#d97706' });
      showCanvasHint(`점 ${tp.pointLatex} 에서의 3D 대수 접평면 생성 완료`);
    };
    chips.appendChild(tpBtn);

    const kBtn = document.createElement('button');
    kBtn.className = `cas-chip accent-pink${obj.showCurvatureMap ? ' is-on' : ''}`;
    kBtn.textContent = obj.showCurvatureMap ? '🌈 가우스곡률 K ON' : '🌈 가우스곡률 K';
    kBtn.onclick = () => {
      obj.showCurvatureMap = !obj.showCurvatureMap;
      syncAllViewports();
      renderAlgebraPanel();
    };
    chips.appendChild(kBtn);

    row.appendChild(chips);

    if (obj.showCurvatureMap && obj.analysis.gaussKLatex) {
      const kBox = document.createElement('div');
      kBox.className = 'cas-output-card';
      kBox.style.borderLeftColor = '#db2777';
      const km = document.createElement('div');
      renderLatex(`K(x,y) = ${obj.analysis.gaussKLatex}, \\quad H(x,y) = ${obj.analysis.meanHLatex}`, km);
      kBox.appendChild(km);
      row.appendChild(kBox);
    }

    if (obj.showPartials) {
      const box = document.createElement('div');
      box.className = 'cas-output-card';
      const m = document.createElement('div');
      renderLatex(
        `\\frac{\\partial z}{\\partial x} = ${obj.analysis.fxLatex}, \\quad \\frac{\\partial z}{\\partial y} = ${obj.analysis.fyLatex}`,
        m
      );
      box.appendChild(m);
      row.appendChild(box);
    }

    if (obj.showSpecial && obj.analysis.criticalPoints3D?.length) {
      const sub = document.createElement('div');
      sub.className = 'sp-sublist';
      for (const pt of obj.analysis.criticalPoints3D) {
        const r = document.createElement('div');
        r.className = 'sp-row';
        const lw = document.createElement('div');
        lw.style.display = 'flex'; lw.style.alignItems = 'center'; lw.style.gap = '6px';
        const t = document.createElement('span');
        t.className = 'sp-tag';
        t.style.background = '#9333ea';
        t.textContent = pt.badge;
        const m = document.createElement('span');
        renderLatex(pt.latexCoord, m);
        lw.append(t, m);
        r.appendChild(lw);
        sub.appendChild(r);
      }
      row.appendChild(sub);
    }
  }
}

function renderPlane3DRow(row, obj) {
  const head = document.createElement('div');
  head.className = 'alg-row-head';

  const left = document.createElement('div');
  left.className = 'alg-left';

  const marble = document.createElement('span');
  marble.className = `ggb-marble${obj.visible ? ' is-on' : ''}`;
  marble.style.color = obj.color;
  marble.onclick = () => {
    obj.visible = !obj.visible;
    syncAllViewports();
    renderAlgebraPanel();
  };
  left.appendChild(marble);

  const mathDiv = document.createElement('div');
  mathDiv.className = 'alg-math';
  renderLatex(`${obj.label}:\\; ${obj.analysis?.equationLatex || `${obj.lhsExpr}=${obj.rhsExpr}`}`, mathDiv);
  left.appendChild(mathDiv);
  head.appendChild(left);

  const delBtn = document.createElement('button');
  delBtn.className = 'row-icon-btn danger';
  delBtn.textContent = '✕';
  delBtn.onclick = () => removeObject(obj.id);
  head.appendChild(delBtn);
  row.appendChild(head);

  if (obj.analysis?.normalLatex) {
    const sub = document.createElement('div');
    sub.className = 'cas-output-card';
    sub.style.borderLeftColor = obj.color;
    const m = document.createElement('div');
    renderLatex(`\\text{법선벡터 } ${obj.analysis.normalLatex}`, m);
    sub.appendChild(m);
    row.appendChild(sub);
  }
}

function renderImplicit3DRow(row, obj) {
  const head = document.createElement('div');
  head.className = 'alg-row-head';

  const left = document.createElement('div');
  left.className = 'alg-left';

  const marble = document.createElement('span');
  marble.className = `ggb-marble${obj.visible ? ' is-on' : ''}`;
  marble.style.color = obj.color;
  marble.onclick = () => {
    obj.visible = !obj.visible;
    syncAllViewports();
    renderAlgebraPanel();
  };
  left.appendChild(marble);

  const mathDiv = document.createElement('div');
  mathDiv.className = 'alg-math';
  renderLatex(`${obj.label}:\\; ${obj.analysis?.equationLatex || `${obj.lhsExpr}=${obj.rhsExpr}`}`, mathDiv);
  left.appendChild(mathDiv);
  head.appendChild(left);

  const delBtn = document.createElement('button');
  delBtn.className = 'row-icon-btn danger';
  delBtn.textContent = '✕';
  delBtn.onclick = () => removeObject(obj.id);
  head.appendChild(delBtn);
  row.appendChild(head);

  if (obj.analysis?.sphereInfo) {
    const si = obj.analysis.sphereInfo;
    const box = document.createElement('div');
    box.className = 'cas-output-card';
    box.style.borderLeftColor = obj.color;
    const m = document.createElement('div');
    renderLatex(`\\text{구 중심 } ${si.centerLatex}, \\quad R = ${si.rLatex}`, m);
    box.appendChild(m);
    row.appendChild(box);
  }
}

function renderSlice3DRow(row, obj) {
  const head = document.createElement('div');
  head.className = 'alg-row-head';

  const left = document.createElement('div');
  left.className = 'alg-left';

  const marble = document.createElement('span');
  marble.className = 'ggb-marble is-on';
  marble.style.color = '#dc2626';
  left.appendChild(marble);

  const title = document.createElement('div');
  title.className = 'alg-math';
  title.style.fontWeight = '700';
  title.textContent = `${obj.label} — ${obj.result?.summaryTitle || '단면 교선'}`;
  left.appendChild(title);
  head.appendChild(left);

  const delBtn = document.createElement('button');
  delBtn.className = 'row-icon-btn danger';
  delBtn.textContent = '✕';
  delBtn.onclick = () => removeObject(obj.id);
  head.appendChild(delBtn);
  row.appendChild(head);

  if (obj.result) {
    const sub = document.createElement('div');
    sub.className = 'sp-sublist';

    if (obj.result.details && obj.result.details.length > 0) {
      for (const det of obj.result.details) {
        const r = document.createElement('div');
        r.className = 'sp-row';
        const lw = document.createElement('div');
        lw.style.display = 'flex'; lw.style.alignItems = 'center'; lw.style.gap = '6px';
        const t = document.createElement('span');
        t.className = 'sp-tag';
        t.style.background = '#dc2626';
        t.textContent = det.label;
        const m = document.createElement('span');
        renderLatex(det.latex, m);
        lw.append(t, m);
        r.appendChild(lw);
        sub.appendChild(r);
      }
    } else if (obj.result.latexMain) {
      const box = document.createElement('div');
      box.className = 'cas-output-card';
      box.style.marginLeft = '0';
      box.style.borderLeftColor = '#dc2626';
      const m = document.createElement('div');
      renderLatex(obj.result.latexMain, m);
      box.appendChild(m);
      sub.appendChild(box);
    }

    row.appendChild(sub);
  }
}

function renderRevolution3DRow(row, obj) {
  const head = document.createElement('div');
  head.className = 'alg-row-head';

  const left = document.createElement('div');
  left.className = 'alg-left';

  const marble = document.createElement('span');
  marble.className = `ggb-marble${obj.visible ? ' is-on' : ''}`;
  marble.style.color = obj.color || '#4f46e5';
  marble.onclick = () => {
    obj.visible = !obj.visible;
    syncAllViewports();
    renderAlgebraPanel();
  };
  left.appendChild(marble);

  const mathDiv = document.createElement('div');
  mathDiv.className = 'alg-math';
  if (obj.result) {
    renderLatex(
      `V_{\\text{회전체}} = \\pi \\int_{${obj.result.aLatex}}^{${obj.result.bLatex}} \\{${obj.fnLabel}(x)\\}^2 dx = ${obj.result.volLatex}`,
      mathDiv
    );
  }
  left.appendChild(mathDiv);
  head.appendChild(left);

  const delBtn = document.createElement('button');
  delBtn.className = 'row-icon-btn danger';
  delBtn.textContent = '✕';
  delBtn.onclick = () => removeObject(obj.id);
  head.appendChild(delBtn);
  row.appendChild(head);

  if (obj.result) {
    const chips = document.createElement('div');
    chips.className = 'cas-chips';

    const discToggle = document.createElement('button');
    discToggle.className = `cas-chip${obj.showDiscs ? ' is-active' : ''}`;
    discToggle.textContent = obj.showDiscs ? `구분구적 원판 ON (n=${obj.numDiscs})` : '구분구적 원판 보기';
    discToggle.onclick = () => {
      obj.showDiscs = !obj.showDiscs;
      syncAllViewports();
      renderAlgebraPanel();
    };
    chips.appendChild(discToggle);
    row.appendChild(chips);

    if (obj.showDiscs) {
      const ctrl = document.createElement('div');
      ctrl.className = 'ggb-slider-controls';
      const lbl = document.createElement('span');
      lbl.className = 'slider-minmax';
      lbl.textContent = `n=${obj.numDiscs}`;

      const range = document.createElement('input');
      range.type = 'range';
      range.className = 'ggb-range';
      range.min = '4';
      range.max = '48';
      range.step = '2';
      range.value = String(obj.numDiscs);
      range.addEventListener('input', () => {
        obj.numDiscs = Number(range.value);
        lbl.textContent = `n=${obj.numDiscs}`;
        refreshSymbolicScene(false);
      });

      const sumNote = document.createElement('span');
      sumNote.className = 'slider-minmax';
      sumNote.textContent = `Vₙ ≈ ${formatCleanNumber(obj.result.discSum, 3)} (정확값 ≈ ${formatCleanNumber(obj.result.volNum, 3)})`;

      ctrl.append(lbl, range, sumNote);
      row.appendChild(ctrl);
    }
  }
}

function renderCSG3DRow(row, obj) {
  const head = document.createElement('div');
  head.className = 'alg-row-head';
  const left = document.createElement('div');
  left.className = 'alg-left';

  const marble = document.createElement('span');
  marble.className = `ggb-marble${obj.visible ? ' is-on' : ''}`;
  marble.style.color = obj.color;
  marble.onclick = () => {
    obj.visible = !obj.visible;
    syncAllViewports();
    renderAlgebraPanel();
  };
  left.appendChild(marble);

  const title = document.createElement('div');
  title.className = 'alg-math';
  title.style.fontWeight = '700';
  title.textContent = obj.label;
  left.appendChild(title);
  head.appendChild(left);

  const delBtn = document.createElement('button');
  delBtn.className = 'row-icon-btn danger';
  delBtn.textContent = '✕';
  delBtn.onclick = () => removeObject(obj.id);
  head.appendChild(delBtn);
  row.appendChild(head);
}

function renderSpaceCurve3DRow(row, obj) {
  const head = document.createElement('div');
  head.className = 'alg-row-head';
  const left = document.createElement('div');
  left.className = 'alg-left';
  const marble = document.createElement('span');
  marble.className = `ggb-marble${obj.visible ? ' is-on' : ''}`;
  marble.style.color = obj.color;
  marble.onclick = () => {
    obj.visible = !obj.visible;
    syncAllViewports();
    renderAlgebraPanel();
  };
  left.appendChild(marble);
  const mathDiv = document.createElement('div');
  mathDiv.className = 'alg-math';
  renderLatex(`\\mathbf{${obj.label}}(t) = ${obj.analysis?.curveLatex || obj.vecExpr}`, mathDiv);
  left.appendChild(mathDiv);
  head.appendChild(left);
  const delBtn = document.createElement('button');
  delBtn.className = 'row-icon-btn danger';
  delBtn.textContent = '✕';
  delBtn.onclick = () => removeObject(obj.id);
  head.appendChild(delBtn);
  row.appendChild(head);

  if (obj.analysis) {
    const box = document.createElement('div');
    box.className = 'cas-output-card';
    const m = document.createElement('div');
    renderLatex(
      `\\text{곡률 } \\kappa(t) = ${obj.analysis.kappaLatex}, \\quad \\text{열률 } \\tau(t) = ${obj.analysis.tauLatex}`,
      m
    );
    box.appendChild(m);
    row.appendChild(box);

    // Slider for t0 moving Frenet-Serret Frame {T, N, B} + Osculating Circle!
    const ctrl = document.createElement('div');
    ctrl.className = 'ggb-slider-controls';
    const lbl = document.createElement('span');
    lbl.className = 'slider-minmax';
    lbl.textContent = `t₀=${formatCleanNumber(obj.t0, 2)}`;
    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'ggb-range';
    range.min = '-5';
    range.max = '5';
    range.step = '0.1';
    range.value = String(obj.t0);
    range.addEventListener('input', () => {
      obj.t0 = Number(range.value);
      lbl.textContent = `t₀=${formatCleanNumber(obj.t0, 2)}`;
      obj.analysis = analyzeSpaceCurve3D(obj.vecExpr, obj.t0, getSliderParams());
      syncAllViewports();
    });
    const note = document.createElement('span');
    note.className = 'slider-minmax';
    note.textContent = '프레네 틀(T·N·B) & 접촉원 이동';
    ctrl.append(lbl, range, note);
    row.appendChild(ctrl);
  }
}

function renderMatrix3DRow(row, obj) {
  const head = document.createElement('div');
  head.className = 'alg-row-head';
  const left = document.createElement('div');
  left.className = 'alg-left';
  const marble = document.createElement('span');
  marble.className = `ggb-marble${obj.visible ? ' is-on' : ''}`;
  marble.style.color = obj.color;
  marble.onclick = () => {
    obj.visible = !obj.visible;
    syncAllViewports();
    renderAlgebraPanel();
  };
  left.appendChild(marble);
  const mathDiv = document.createElement('div');
  mathDiv.className = 'alg-math';
  renderLatex(`${obj.label} = ${obj.analysis?.matLatex || obj.matrixExpr}`, mathDiv);
  left.appendChild(mathDiv);
  head.appendChild(left);
  const delBtn = document.createElement('button');
  delBtn.className = 'row-icon-btn danger';
  delBtn.textContent = '✕';
  delBtn.onclick = () => removeObject(obj.id);
  head.appendChild(delBtn);
  row.appendChild(head);

  if (obj.analysis) {
    const sub = document.createElement('div');
    sub.className = 'sp-sublist';

    const b1 = document.createElement('div');
    b1.className = 'cas-output-card';
    b1.style.marginLeft = '0';
    const m1 = document.createElement('div');
    renderLatex(
      `\\det(${obj.label}) = ${obj.analysis.detLatex}, \\quad p(\\lambda) = ${obj.analysis.charPolyLatex}`,
      m1
    );
    b1.appendChild(m1);
    sub.appendChild(b1);

    const b2 = document.createElement('div');
    b2.className = 'cas-output-card';
    b2.style.marginLeft = '0';
    b2.style.borderLeftColor = '#059669';
    const m2 = document.createElement('div');
    renderLatex(`\\text{조르당 표준형 } J = ${obj.analysis.jordanJLatex}`, m2);
    b2.appendChild(m2);
    sub.appendChild(b2);
    row.appendChild(sub);

    const ctrl = document.createElement('div');
    ctrl.className = 'ggb-slider-controls';
    const lbl = document.createElement('span');
    lbl.className = 'slider-minmax';
    lbl.textContent = `변환율 s=${formatCleanNumber(obj.interp, 2)}`;
    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'ggb-range';
    range.min = '0';
    range.max = '1';
    range.step = '0.02';
    range.value = String(obj.interp);
    range.addEventListener('input', () => {
      obj.interp = Number(range.value);
      lbl.textContent = `변환율 s=${formatCleanNumber(obj.interp, 2)}`;
      syncAllViewports();
    });
    const note = document.createElement('span');
    note.className = 'slider-minmax';
    note.textContent = '(1−s)I + sM 연속변형';
    ctrl.append(lbl, range, note);
    row.appendChild(ctrl);
  }
}

function renderVectorField3DRow(row, obj) {
  const head = document.createElement('div');
  head.className = 'alg-row-head';
  const left = document.createElement('div');
  left.className = 'alg-left';
  const marble = document.createElement('span');
  marble.className = `ggb-marble${obj.visible ? ' is-on' : ''}`;
  marble.style.color = '#0891b2';
  marble.onclick = () => {
    obj.visible = !obj.visible;
    syncAllViewports();
    renderAlgebraPanel();
  };
  left.appendChild(marble);
  const mathDiv = document.createElement('div');
  mathDiv.className = 'alg-math';
  renderLatex(`\\mathbf{${obj.label}}(x,y,z) = ${obj.analysis?.fieldLatex || obj.vecExpr}`, mathDiv);
  left.appendChild(mathDiv);
  head.appendChild(left);
  const delBtn = document.createElement('button');
  delBtn.className = 'row-icon-btn danger';
  delBtn.textContent = '✕';
  delBtn.onclick = () => removeObject(obj.id);
  head.appendChild(delBtn);
  row.appendChild(head);

  if (obj.analysis) {
    const box = document.createElement('div');
    box.className = 'cas-output-card';
    box.style.borderLeftColor = '#0891b2';
    const m = document.createElement('div');
    renderLatex(
      `\\nabla\\cdot\\mathbf{${obj.label}} = ${obj.analysis.divLatex}, \\quad \\nabla\\times\\mathbf{${obj.label}} = ${obj.analysis.curlLatex}`,
      m
    );
    box.appendChild(m);
    row.appendChild(box);
  }
}

function renderImplicitRow(row, obj) {
  const head = document.createElement('div');
  head.className = 'alg-row-head';
  const left = document.createElement('div');
  left.className = 'alg-left';
  const marble = document.createElement('span');
  marble.className = `ggb-marble${obj.visible ? ' is-on' : ''}`;
  marble.style.color = obj.color;
  marble.onclick = () => {
    obj.visible = !obj.visible;
    syncAllViewports();
    renderAlgebraPanel();
  };
  left.appendChild(marble);
  const mathDiv = document.createElement('div');
  mathDiv.className = 'alg-math';
  renderLatex(`${obj.label}:\\; ${obj.analysis?.equationLatex || `${obj.lhsExpr}=${obj.rhsExpr}`}`, mathDiv);
  left.appendChild(mathDiv);
  head.appendChild(left);
  const delBtn = document.createElement('button');
  delBtn.className = 'row-icon-btn danger';
  delBtn.textContent = '✕';
  delBtn.onclick = () => removeObject(obj.id);
  head.appendChild(delBtn);
  row.appendChild(head);
}

function renderIntersectionRow(row, obj) {
  const head = document.createElement('div');
  head.className = 'alg-row-head';
  const left = document.createElement('div');
  left.className = 'alg-left';
  const marble = document.createElement('span');
  marble.className = `ggb-marble${obj.visible ? ' is-on' : ''}`;
  marble.style.color = '#dc2626';
  marble.onclick = () => {
    obj.visible = !obj.visible;
    syncAllViewports();
    renderAlgebraPanel();
  };
  left.appendChild(marble);
  const title = document.createElement('div');
  title.className = 'alg-math';
  title.style.fontWeight = '700';
  title.textContent = `교점(${obj.label}) — ${obj.points.length}개`;
  left.appendChild(title);
  head.appendChild(left);
  const delBtn = document.createElement('button');
  delBtn.className = 'row-icon-btn danger';
  delBtn.textContent = '✕';
  delBtn.onclick = () => removeObject(obj.id);
  head.appendChild(delBtn);
  row.appendChild(head);

  const sub = document.createElement('div');
  sub.className = 'sp-sublist';
  obj.points.forEach((pt, idx) => {
    const r = document.createElement('div');
    r.className = 'sp-row';
    r.onclick = () => {
      graphCanvas.centerX = pt.x;
      graphCanvas.centerY = pt.y;
      graphCanvas.requestRender();
    };
    const lw = document.createElement('div');
    lw.style.display = 'flex'; lw.style.alignItems = 'center'; lw.style.gap = '6px';
    const t = document.createElement('span');
    t.className = 'sp-tag';
    t.style.background = '#dc2626';
    t.textContent = `A${idx + 1}`;
    const m = document.createElement('span');
    renderLatex(pt.latexCoord, m);
    lw.append(t, m);
    const approx = document.createElement('span');
    approx.style.fontSize = '11px'; approx.style.color = '#64748b';
    approx.textContent = `≈ (${formatCleanNumber(pt.x, 4)}, ${formatCleanNumber(pt.y, 4)})`;
    r.append(lw, approx);
    sub.appendChild(r);
  });
  if (obj.note) {
    const info = document.createElement('div');
    info.className = 'sp-info-box';
    info.textContent = `✓ ${obj.note}`;
    sub.appendChild(info);
  }
  row.appendChild(sub);
}

function renderIntegralRow(row, obj) {
  const head = document.createElement('div');
  head.className = 'alg-row-head';
  const left = document.createElement('div');
  left.className = 'alg-left';
  const marble = document.createElement('span');
  marble.className = `ggb-marble${obj.visible ? ' is-on' : ''}`;
  marble.style.color = obj.color || '#4f46e5';
  marble.onclick = () => {
    obj.visible = !obj.visible;
    syncAllViewports();
    renderAlgebraPanel();
  };
  left.appendChild(marble);
  const mathDiv = document.createElement('div');
  mathDiv.className = 'alg-math';
  if (obj.result) {
    renderLatex(
      `\\int_{${obj.result.aLatex}}^{${obj.result.bLatex}} ${obj.fnLabel}(x)\\,dx = ${obj.result.latex}`,
      mathDiv
    );
  }
  left.appendChild(mathDiv);
  head.appendChild(left);
  const delBtn = document.createElement('button');
  delBtn.className = 'row-icon-btn danger';
  delBtn.textContent = '✕';
  delBtn.onclick = () => removeObject(obj.id);
  head.appendChild(delBtn);
  row.appendChild(head);
}

function renderCasRow(row, obj) {
  const head = document.createElement('div');
  head.className = 'alg-row-head';
  const left = document.createElement('div');
  left.className = 'alg-left';
  const marble = document.createElement('span');
  marble.className = 'ggb-marble is-on';
  marble.style.color = '#059669';
  left.appendChild(marble);
  const cmdText = document.createElement('div');
  cmdText.style.fontFamily = 'Consolas, monospace';
  cmdText.style.fontSize = '12.5px';
  cmdText.style.color = '#475569';
  cmdText.textContent = obj.rawInput;
  left.appendChild(cmdText);
  head.appendChild(left);

  const actions = document.createElement('div');
  actions.className = 'alg-actions';
  const approxBtn = document.createElement('button');
  approxBtn.className = 'cas-chip';
  approxBtn.textContent = obj.showApprox ? '정확해' : '근사';
  approxBtn.onclick = () => {
    obj.showApprox = !obj.showApprox;
    renderAlgebraPanel();
  };
  actions.appendChild(approxBtn);
  const delBtn = document.createElement('button');
  delBtn.className = 'row-icon-btn danger';
  delBtn.textContent = '✕';
  delBtn.onclick = () => removeObject(obj.id);
  actions.appendChild(delBtn);
  head.appendChild(actions);
  row.appendChild(head);

  const out = document.createElement('div');
  out.className = 'cas-output-card';
  out.style.borderLeftColor = '#059669';
  const m = document.createElement('div');
  renderLatex(obj.showApprox ? `\\approx ${obj.result.approx}` : `= ${obj.result.latex}`, m);
  out.appendChild(m);
  row.appendChild(out);
}

function buildValuesTable() {
  const wrap = document.getElementById('valuesTableWrap');
  if (!wrap) return;
  const startX = parseFloat(document.getElementById('tblStart').value) || -2;
  const endX = parseFloat(document.getElementById('tblEnd').value) || 3;
  const stepX = Math.max(0.25, parseFloat(document.getElementById('tblStep').value) || 1);

  const explicitObjs = state.objects.filter((o) => o.kind === 'explicit' && o.visible && !o.isTangent);
  if (explicitObjs.length === 0) {
    wrap.innerHTML = '<p style="color:#64748b; font-size:13px;">표시할 2D 양함수 그래프가 없습니다.</p>';
    state.tablePoints = [];
    syncAllViewports();
    return;
  }

  const rows = computeTableOfValues(explicitObjs, startX, endX, stepX, getSliderParams());
  const tbl = document.createElement('table');
  tbl.className = 'ggb-table';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  const thX = document.createElement('th');
  renderLatex('x', thX);
  hr.appendChild(thX);
  for (const fn of explicitObjs) {
    const th = document.createElement('th');
    renderLatex(`${fn.label}(x)`, th);
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  tbl.appendChild(thead);

  const tbody = document.createElement('tbody');
  const pts = [];
  for (const r of rows) {
    const tr = document.createElement('tr');
    const tdX = document.createElement('td');
    renderLatex(r.xLabel, tdX);
    tr.appendChild(tdX);

    r.cells.forEach((c, idx) => {
      const td = document.createElement('td');
      const mainSpan = document.createElement('span');
      renderLatex(c.latex, mainSpan);
      td.appendChild(mainSpan);
      if (c.approx && c.approx !== c.exact) {
        const sub = document.createElement('span');
        sub.className = 'tbl-approx-sub';
        sub.textContent = `≈ ${c.approx}`;
        td.appendChild(sub);
      }
      tr.appendChild(td);

      const yNum = Number(c.approx);
      if (Number.isFinite(yNum)) {
        pts.push({
          kind: 'tablePoint',
          badge: `${explicitObjs[idx].label}(${r.xLabel})`,
          exactX: r.xLabel,
          exactY: c.exact,
          latexCoord: `\\left(${r.xLabel},\\, ${c.latex}\\right)`,
          x: r.x,
          y: yNum,
          pinned: false
        });
      }
    });
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
  wrap.innerHTML = '';
  wrap.appendChild(tbl);
  state.tablePoints = pts;
  syncAllViewports();
}

function appendTutorBubble(role, text, latexBlock = null, actionLabel = null, imageUrl = null) {
  const wrap = document.getElementById('tutorMessages');
  if (!wrap) return;
  const div = document.createElement('div');
  div.className = `chat-bubble ${role}`;

  if (actionLabel) {
    const tag = document.createElement('div');
    tag.className = 'tutor-action-tag';
    tag.textContent = `⚡ 자동 작도: ${actionLabel}`;
    div.appendChild(tag);
  }
  const p = document.createElement('div');
  p.textContent = text;
  div.appendChild(p);

  if (latexBlock) {
    const m = document.createElement('div');
    m.style.marginTop = '6px';
    m.style.padding = '6px 8px';
    m.style.background = '#ffffff';
    m.style.borderRadius = '6px';
    renderLatex(latexBlock, m, true);
    div.appendChild(m);
  }
  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.className = 'pasted-snap';
    div.appendChild(img);
  }
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function handleTutorQuestion(questionText) {
  const q = String(questionText || '').trim();
  if (!q && !state.pastedImageDataUrl) return;

  appendTutorBubble('student', q || '(화면 캡처 질문)', null, null, state.pastedImageDataUrl);
  state.pastedImageDataUrl = null;
  document.getElementById('pastePreview').classList.add('is-hidden');

  if (/구와\s*평면|3D\s*구|교원/.test(q)) {
    loadScenario('s5');
    appendTutorBubble(
      'tutor',
      '3D 공간에 구 x²+y²+z²=9 와 절단 평면 x+y+2z=k 를 작도하고 단면 교원을 붉은 선으로 표시했습니다! 대수창의 슬라이더 k 값을 움직일 때 구의 중심에서 평면까지의 거리 d 와 단면 반지름 r 사이에 어떤 피타고라스 관계식이 성립할까요?',
      'r = \\sqrt{R^2 - d^2} = \\frac{\\sqrt{30}}{2}, \\quad S = \\frac{15\\pi}{2}',
      '3D 구·평면 단면 교원 작도'
    );
    return;
  }

  if (/원뿔곡선|원뿔/.test(q)) {
    loadScenario('s6');
    appendTutorBubble(
      'tutor',
      '원뿔 x²+y²=z² 과 기울기 슬라이더 평면 z = mx + 1.5 를 3D로 구성했습니다! 대수창에서 기울기 m 을 0(원) → 0.5(타원) → 1(포물선) → 1.5(쌍곡선)로 바꿔보며 모선의 기울기와 평면 기울기의 관계를 관찰해 보세요.',
      'm = 1 \\implies -3x + y^2 - \\frac{9}{4} = 0 \\;(\\text{포물선})',
      '3D 원뿔곡선 단면 실험실'
    );
    return;
  }

  if (/회전체|구분구적|부피/.test(q)) {
    loadScenario('s7');
    appendTutorBubble(
      'tutor',
      '2D+3D 동시 연동 화면으로 전환하여 f(x)=√x 의 x축 회전체와 구분구적법 원기둥 원판(n=12)을 생성했습니다! 원판 개수 슬라이더 n 을 점점 키우면 원판 부피 합 Vₙ 이 어떤 대수적 극한값에 가까워지나요?',
      'V = \\pi \\int_0^4 (\\sqrt{x})^2 dx = 8\\pi',
      '2D↔3D 회전체 및 구분구적 원판 작도'
    );
    return;
  }

  if (/x\^4|x⁴|반례/.test(q)) {
    loadScenario('s3');
    appendTutorBubble(
      'tutor',
      '2D 변곡점 반례 화면을 열었습니다. g(x)=x⁴ 은 g\'\'(0)=0 이지만 x=0 좌우에서 이계도함수 12x² 의 부호가 모두 양수(+)이므로 오목·볼록이 바뀌지 않습니다. 따라서 변곡점이 아닌 극소점이 됩니다!',
      'g(x) = x^4 \\implies g\'\'(x) = 12x^2 \\ge 0',
      '2D 변곡점 반례 비교'
    );
    return;
  }

  const curves = state.objects.filter((o) => o.kind === 'explicit' || o.kind === 'implicit');
  if (/교점|연립/.test(q) && curves.length >= 2) {
    setViewMode('2d');
    const inter = createSymbolicIntersection(curves[0].id, curves[1].id);
    const texList = inter?.points?.map((p) => p.latexCoord).join(',\\; ') || '\\text{실수 교점 없음}';
    appendTutorBubble(
      'tutor',
      `두 곡선의 연립방정식을 Giac 대수 엔진으로 풀어 근호(√)·분수가 살아 있는 정확한 교점을 찍었습니다!`,
      texList,
      `${curves[0].label} ∩ ${curves[1].label} 교점 표시`
    );
    return;
  }

  appendTutorBubble(
    'tutor',
    '상단 빠른 버튼을 누르거나 "구와 평면의 3D 단면 보여줘", "원뿔곡선 절단 보여줘", "회전체와 구분구적법 보여줘", "2D 무리수 교점 작도해줘"처럼 요청해 보세요!'
  );
}

export function loadScenario(key) {
  const sc = SCENARIOS[key];
  if (!sc) return;

  if (state.traceAnim) {
    cancelAnimationFrame(state.traceAnim.raf);
    state.traceAnim = null;
  }
  clearInterval(state.sliderTimer);
  state.playingSliderId = null;
  state.tablePoints = [];

  state.activeScenario = key;
  state.objects = [];
  state.nextId = 1;
  state.fnIndex = 0;

  document.querySelectorAll('.scen-chip').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.scenario === key);
  });

  if (graph3D) {
    graph3D.cutawayEnabled = Boolean(sc.cutaway);
    document.getElementById('cutaway3dBtn')?.classList.toggle('is-active', graph3D.cutawayEnabled);
  }

  const refs = [];
  for (const item of sc.inputs) {
    refs.push(
      addInputExpression(item.raw, {
        showSpecial: item.showSpecial,
        showCurvatureMap: item.showCurvatureMap,
        activeForm: item.activeForm,
        color: item.color,
        min: item.min,
        max: item.max,
        step: item.step,
        silentRefresh: true
      })
    );
  }

  refreshSymbolicScene(true);

  for (const [iA, iB] of sc.autoIntersections || []) {
    if (refs[iA] && refs[iB]) createSymbolicIntersection(refs[iA].id, refs[iB].id, true);
  }
  for (const item of sc.autoIntegrals || []) {
    if (refs[item.idx]) createSymbolicIntegral(refs[item.idx].id, item.a, item.b, true);
  }
  for (const [iPl, iTg] of sc.autoSlices3D || []) {
    if (refs[iPl] && refs[iTg]) create3DSliceCard(refs[iPl].id, refs[iTg].id, true);
  }
  for (const rev of sc.autoRevolutions || []) {
    if (refs[rev.idx]) createRevolution3D(refs[rev.idx].id, rev.a, rev.b, rev.numDiscs, rev.showDiscs, true);
  }
  for (const preset of sc.autoCSG || []) {
    addCSGSolid(preset, true);
  }
  for (const cmd of sc.casCommands || []) {
    addInputExpression(cmd, { silentRefresh: true });
  }

  if (sc.view && graphCanvas) {
    graphCanvas.centerX = sc.view.cx;
    graphCanvas.centerY = sc.view.cy;
    graphCanvas.scale = sc.view.scale;
  }

  setViewMode(sc.viewMode || '2d');
  renderAlgebraPanel();
  if (state.activePane === 'table') buildValuesTable();

  eventBus.emit('SCENARIO_LOADED', { scenario: key, title: sc.title });
}

function renderTeacherDashboard() {
  const grid = document.getElementById('studentGrid');
  if (!grid) return;
  const mockStudents = [
    { code: '1반-03번', alias: '푸른포물선', step: '⑤ 3D 구·평면교원', expr: 'x+y+2z=3 단면 반지름 √30/2 확인', status: '탐구 완료' },
    { code: '1반-07번', alias: '은빛쌍곡선', step: '⑥ 3D 원뿔곡선단면', expr: 'z = 1.2x + 1.5 (쌍곡선 관찰)', status: '슬라이더 조작 중' },
    { code: '1반-12번', alias: '초록미분계수', step: '⑦ 회전체·구분구적', expr: 'n=36 원판 부피 수렴 확인', status: '피드백 대기' },
    { code: '1반-19번', alias: '보라정적분', step: '⑧ 3D CSG·GLB', expr: '구-원기둥 GLB 내보내기 완료', status: '완료' }
  ];
  grid.innerHTML = '';
  for (const st of mockStudents) {
    const c = document.createElement('div');
    c.className = 'stu-card';
    c.innerHTML = `
      <div class="stu-top">
        <span>${state.anonymizeStudents ? st.alias : st.code}</span>
        <span class="stu-status">${st.status}</span>
      </div>
      <div style="font-size:11.5px; color:#475569;">단계: ${st.step}</div>
      <div style="font-size:11.5px; font-family:Consolas,monospace; background:#fff; padding:4px 6px; border-radius:5px; border:1px solid #e2e8f0;">${st.expr}</div>
    `;
    grid.appendChild(c);
  }
}

function renderEventStream() {
  const el = document.getElementById('eventStream');
  if (!el) return;
  el.innerHTML = '';
  for (const evt of eventBus.getHistory().slice().reverse()) {
    const d = document.createElement('div');
    d.className = 'evt-item';
    d.textContent = `[${evt.timeLabel}] #${evt.id} ${evt.type} → ${JSON.stringify(evt.payload)}`;
    el.appendChild(d);
  }
}

function setToolEverywhere(mode) {
  graphCanvas.setToolMode(mode);
  document.querySelectorAll('[data-tool]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.tool === mode);
  });
  const hints = {
    move: '드래그하여 이동하고 마우스 휠로 확대·축소합니다.',
    intersect: '2D 교점을 구할 두 곡선을 차례로 클릭하세요.',
    special: '극점·변곡점·영점을 표시할 2D 함수 곡선을 클릭하세요.',
    tangent: '접선을 그을 2D 곡선 위의 점을 클릭하세요.',
    integral: '정적분 넓이를 색칠할 곡선의 시작점(a)과 끝점(b)을 클릭하세요.',
    sketch: '2D 평면 위에 원, 직선, 포물선을 자유롭게 그리면 대수 객체로 변환됩니다!'
  };
  showCanvasHint(hints[mode] || '');
}

function bindUI() {
  // View Mode Switcher (2D | 2D+3D | 3D)
  document.querySelectorAll('.vmode-btn').forEach((btn) => {
    btn.onclick = () => setViewMode(btn.dataset.vmode);
  });

  // Left Rail Switcher
  document.querySelectorAll('.rail-btn[data-pane]').forEach((btn) => {
    btn.onclick = () => {
      const target = btn.dataset.pane;
      state.activePane = target;
      const sidePanel = document.getElementById('sidePanel');
      if (sidePanel.classList.contains('is-collapsed')) {
        sidePanel.classList.remove('is-collapsed');
        document.getElementById('collapsePaneBtn').textContent = '◀';
      }
      document.querySelectorAll('.rail-btn[data-pane]').forEach((b) => b.classList.toggle('is-active', b === btn));
      document.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('is-active', p.id === `pane-${target}`));
      if (target === 'table') buildValuesTable();
      else {
        state.tablePoints = [];
        syncAllViewports();
      }
    };
  });

  // Algebra Input
  const mathInput = document.getElementById('mathInput');
  const addBtn = document.getElementById('addExprBtn');
  const previewBar = document.getElementById('livePreviewBar');
  const previewMath = document.getElementById('livePreviewMath');
  const previewKind = document.getElementById('livePreviewKind');

  const updatePreview = () => {
    const raw = mathInput.value.trim();
    if (!raw) {
      previewBar.classList.add('is-empty');
      return;
    }
    previewBar.classList.remove('is-empty');
    const norm = normalizeMathInput(raw);
    const cls = classifyUserInput(raw, getSliderParams());
    const map = {
      slider: '슬라이더',
      explicit: '2D 함수',
      implicit: '2D 음함수·도형',
      surface3d: '3D 이변수곡면',
      plane3d: '3D 평면 (BVH 절단)',
      implicit3d: '3D 이차곡면·구',
      cas: 'CAS 대수연산'
    };
    previewKind.textContent = map[cls?.kind] || '수식';
    const tex = norm
      .replace(/\*/g, ' \\cdot ')
      .replace(/sqrt\(([^()]+)\)/g, '\\sqrt{$1}')
      .replace(/\bpi\b/g, '\\pi');
    renderLatex(tex, previewMath);
  };

  const submitExpr = () => {
    const raw = mathInput.value.trim();
    if (!raw) return;
    addInputExpression(raw);
    mathInput.value = '';
    updatePreview();
  };

  mathInput.addEventListener('input', updatePreview);
  mathInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitExpr();
    }
  });
  addBtn.onclick = submitExpr;

  // Virtual Keyboard
  const vkbdDock = document.getElementById('virtualKbdDock');
  const openFab = document.getElementById('openVkbdFab');
  const railKbdBtn = document.getElementById('railKbdBtn');
  const toggleVkbd = (force) => {
    const willOpen = force !== undefined ? force : vkbdDock.classList.contains('is-hidden');
    vkbdDock.classList.toggle('is-hidden', !willOpen);
    openFab.style.display = willOpen ? 'none' : 'inline-flex';
    railKbdBtn.classList.toggle('is-active', willOpen);
  };
  openFab.onclick = () => toggleVkbd(true);
  railKbdBtn.onclick = () => toggleVkbd();
  document.getElementById('closeVkbdBtn').onclick = () => toggleVkbd(false);

  document.querySelectorAll('.vkbd-tab').forEach((tab) => {
    tab.onclick = () => {
      const page = tab.dataset.kpage;
      document.querySelectorAll('.vkbd-tab').forEach((t) => t.classList.toggle('is-active', t === tab));
      document.querySelectorAll('.vkbd-page').forEach((p) => p.classList.toggle('is-active', p.id === `kpage-${page}`));
    };
  });

  document.querySelectorAll('.vkbd-key[data-insert]').forEach((keyBtn) => {
    keyBtn.onclick = () => {
      const tpl = keyBtn.dataset.insert || '';
      const offset = Number(keyBtn.dataset.cursor || 0);
      const start = mathInput.selectionStart ?? mathInput.value.length;
      const end = mathInput.selectionEnd ?? mathInput.value.length;
      mathInput.value = mathInput.value.slice(0, start) + tpl + mathInput.value.slice(end);
      const pos = start + tpl.length + offset;
      mathInput.focus();
      mathInput.setSelectionRange(pos, pos);
      updatePreview();
    };
  });

  document.getElementById('vkbdBackspace').onclick = () => {
    const start = mathInput.selectionStart ?? mathInput.value.length;
    const end = mathInput.selectionEnd ?? mathInput.value.length;
    if (start !== end) {
      mathInput.value = mathInput.value.slice(0, start) + mathInput.value.slice(end);
      mathInput.setSelectionRange(start, start);
    } else if (start > 0) {
      mathInput.value = mathInput.value.slice(0, start - 1) + mathInput.value.slice(start);
      mathInput.setSelectionRange(start - 1, start - 1);
    }
    mathInput.focus();
    updatePreview();
  };
  document.getElementById('vkbdEnter').onclick = submitExpr;

  // Scenarios
  document.querySelectorAll('.scen-chip').forEach((chip) => {
    chip.onclick = () => loadScenario(chip.dataset.scenario);
  });
  document.getElementById('prevScenBtn').onclick = () => {
    const idx = SCENARIO_KEYS.indexOf(state.activeScenario);
    loadScenario(SCENARIO_KEYS[(idx - 1 + SCENARIO_KEYS.length) % SCENARIO_KEYS.length]);
  };
  document.getElementById('nextScenBtn').onclick = () => {
    const idx = SCENARIO_KEYS.indexOf(state.activeScenario);
    loadScenario(SCENARIO_KEYS[(idx + 1) % SCENARIO_KEYS.length]);
  };

  // 2D & 3D Tools
  document.querySelectorAll('[data-tool]').forEach((btn) => {
    btn.onclick = () => setToolEverywhere(btn.dataset.tool);
  });

  document.getElementById('slice3dRunBtn').onclick = () => {
    const pId = document.getElementById('pl3dSelect').value;
    const sId = document.getElementById('surf3dSelect').value;
    if (!pId || !sId || pId === sId) {
      showCanvasHint('절단 평면과 대상 3D 곡면을 각각 선택해 주세요.');
      return;
    }
    create3DSliceCard(Number(pId), Number(sId));
  };

  document.getElementById('revRunBtn').onclick = () => {
    const fnId = document.getElementById('revFnSelect').value;
    const a = document.getElementById('revAInput').value.trim() || '0';
    const b = document.getElementById('revBInput').value.trim() || '4';
    if (!fnId) return;
    createRevolution3D(Number(fnId), a, b, 12, true);
  };

  document.querySelectorAll('[data-csg]').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('[data-csg]').forEach((b) => b.classList.toggle('is-active', b === btn));
      addCSGSolid(btn.dataset.csg);
    };
  });

  // 3D Viewport Top Controls & GLB/STL Export
  document.getElementById('cutaway3dBtn').onclick = (e) => {
    graph3D.cutawayEnabled = !graph3D.cutawayEnabled;
    e.currentTarget.classList.toggle('is-active', graph3D.cutawayEnabled);
    eventBus.emit('3d:clip_toggle', { enabled: graph3D.cutawayEnabled });
    syncAllViewports();
    showCanvasHint(
      graph3D.cutawayEnabled
        ? '✂ 단면 잘라보기 ON: 절단 평면 위쪽 입체를 잘라내어 내부 단면을 보여줍니다.'
        : '단면 잘라보기 OFF: 전체 입체와 절단 평면을 함께 표시합니다.'
    );
  };

  document.getElementById('rotate3dBtn').onclick = (e) => {
    graph3D.autoRotate = !graph3D.autoRotate;
    e.currentTarget.classList.toggle('is-active', graph3D.autoRotate);
  };

  document.getElementById('xyPlane3dBtn').onclick = (e) => {
    const next = !graph3D.showXYPlane;
    graph3D.setXYPlaneVisible(next);
    e.currentTarget.classList.toggle('is-active', next);
  };

  document.getElementById('reset3dCamBtn').onclick = () => graph3D.resetCamera();
  document.getElementById('exportGlbBtn').onclick = () => graph3D.exportGLB();
  document.getElementById('exportStlBtn').onclick = () => graph3D.exportSTL();
  document.getElementById('toolExportGlbBtn').onclick = () => graph3D.exportGLB();
  document.getElementById('toolExportStlBtn').onclick = () => graph3D.exportSTL();

  // 2D Quick Calculators
  document.getElementById('qiRunBtn').onclick = () => {
    const idA = document.getElementById('qiSelectA').value;
    const idB = document.getElementById('qiSelectB').value;
    if (idA && idB && idA !== idB) createSymbolicIntersection(Number(idA), Number(idB));
  };
  document.getElementById('intRunBtn').onclick = () => {
    const fnId = document.getElementById('intFnSelect').value;
    const a = document.getElementById('intAInput').value.trim() || '-1';
    const b = document.getElementById('intBInput').value.trim() || '1';
    if (fnId) createSymbolicIntegral(Number(fnId), a, b);
  };
  document.getElementById('tblBuildBtn').onclick = buildValuesTable;

  // Tutor
  const tutorInput = document.getElementById('tutorInput');
  document.getElementById('tutorSendBtn').onclick = () => {
    handleTutorQuestion(tutorInput.value);
    tutorInput.value = '';
  };
  tutorInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTutorQuestion(tutorInput.value);
      tutorInput.value = '';
    }
  });
  document.querySelectorAll('.tutor-prompt-chip').forEach((chip) => {
    chip.onclick = () => handleTutorQuestion(chip.dataset.ask);
  });

  window.addEventListener('paste', (e) => {
    if (state.activePane !== 'tutor') return;
    for (const item of e.clipboardData?.items || []) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          state.pastedImageDataUrl = String(reader.result);
          document.getElementById('pasteThumb').src = state.pastedImageDataUrl;
          document.getElementById('pastePreview').classList.remove('is-hidden');
        };
        reader.readAsDataURL(file);
      }
    }
  });
  document.getElementById('clearPasteBtn').onclick = () => {
    state.pastedImageDataUrl = null;
    document.getElementById('pastePreview').classList.add('is-hidden');
  };

  // Splitter
  const splitter = document.getElementById('paneSplitter');
  const sidePanel = document.getElementById('sidePanel');
  const collapseBtn = document.getElementById('collapsePaneBtn');
  let splitDrag = false;
  splitter.addEventListener('pointerdown', (e) => {
    if (e.target === collapseBtn) return;
    splitDrag = true;
    splitter.classList.add('is-dragging');
    splitter.setPointerCapture(e.pointerId);
  });
  splitter.addEventListener('pointermove', (e) => {
    if (!splitDrag) return;
    const w = Math.min(window.innerWidth * 0.58, Math.max(290, e.clientX - 66));
    sidePanel.style.width = `${Math.round(w)}px`;
  });
  splitter.addEventListener('pointerup', () => {
    splitDrag = false;
    splitter.classList.remove('is-dragging');
  });
  collapseBtn.onclick = () => {
    const collapsed = sidePanel.classList.toggle('is-collapsed');
    collapseBtn.textContent = collapsed ? '▶' : '◀';
  };

  // Classroom Header Utilities
  const muteBtn = document.getElementById('muteBtn');
  muteBtn.onclick = () => {
    state.isMuted = !state.isMuted;
    muteBtn.textContent = state.isMuted ? '🔇 음소거' : '🔊 효과음';
    muteBtn.classList.toggle('is-active', !state.isMuted);
    if (!state.isMuted) playSnapTone(660);
  };
  const presBtn = document.getElementById('presModeBtn');
  presBtn.onclick = () => {
    const on = document.body.classList.toggle('presentation-mode');
    presBtn.classList.toggle('is-active', on);
    graphCanvas.requestRender();
  };
  document.getElementById('fullscreenBtn').onclick = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  // 2D Zoom
  document.getElementById('zoomInBtn').onclick = () => graphCanvas.zoomBy(1.25);
  document.getElementById('zoomOutBtn').onclick = () => graphCanvas.zoomBy(1 / 1.25);
  document.getElementById('resetViewBtn').onclick = () => graphCanvas.resetView();
  document.getElementById('toggleGridBtn').onclick = (e) => {
    graphCanvas.showGrid = !graphCanvas.showGrid;
    e.currentTarget.classList.toggle('is-on', graphCanvas.showGrid);
    graphCanvas.requestRender();
  };
  document.getElementById('toggleDecBtn').onclick = (e) => {
    graphCanvas.showDecimalSub = !graphCanvas.showDecimalSub;
    e.currentTarget.classList.toggle('is-on', graphCanvas.showDecimalSub);
    graphCanvas.requestRender();
  };

  // Hidden Teacher Admin Console (?mode=admin or Ctrl+Click Brand)
  const adminBackdrop = document.getElementById('adminBackdrop');
  const openAdmin = () => {
    renderTeacherDashboard();
    renderEventStream();
    adminBackdrop.classList.remove('is-hidden');
  };
  document.getElementById('brandTrigger').addEventListener('click', (e) => {
    if (e.ctrlKey || e.metaKey) openAdmin();
  });
  document.getElementById('closeAdminBtn').onclick = () => adminBackdrop.classList.add('is-hidden');
  document.querySelectorAll('.adm-tab[data-atab]').forEach((tab) => {
    tab.onclick = () => {
      const key = tab.dataset.atab;
      document.querySelectorAll('.adm-tab[data-atab]').forEach((t) => t.classList.toggle('is-active', t === tab));
      document.querySelectorAll('.adm-section').forEach((sec) => sec.classList.toggle('is-active', sec.id === `atab-${key}`));
    };
  });
  document.getElementById('anonToggleBtn').onclick = (e) => {
    state.anonymizeStudents = !state.anonymizeStudents;
    e.currentTarget.textContent = state.anonymizeStudents ? '익명화 ON' : '코드네임 보기';
    renderTeacherDashboard();
  };
  document.getElementById('pauseClassBtn').onclick = (e) => {
    const paused = e.currentTarget.classList.toggle('is-active');
    e.currentTarget.textContent = paused ? '▶ 일시정지 해제' : '⏸ 화면 일시정지';
  };
  document.getElementById('approveFeedbackBtn').onclick = (e) => {
    e.currentTarget.textContent = '✓ 전송 완료!';
    setTimeout(() => { e.currentTarget.textContent = '✓ AI 피드백 일괄 검토·전송'; }, 1400);
  };
  document.getElementById('copyLogBtn').onclick = (e) => {
    navigator.clipboard?.writeText(JSON.stringify(eventBus.getHistory(), null, 2));
    e.currentTarget.textContent = '복사됨!';
    setTimeout(() => { e.currentTarget.textContent = 'JSON 복사'; }, 1200);
  };
  document.getElementById('clearLogBtn').onclick = () => {
    eventBus.clear();
    renderEventStream();
  };
  eventBus.subscribe(() => {
    const b = document.getElementById('eventCountBadge');
    if (b) b.textContent = String(eventBus.history.length);
    renderEventStream();
  });

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mode') === 'admin' || urlParams.get('page') === 'admin') openAdmin();
}

function exposeSDK() {
  window.SymGeoCAS = createSymGeoSDK({
    eventBus,
    setViewMode,
    evalCAS: (cmd) => evaluateCASCommand(cmd, getSliderParams()),
    addExpression: (expr, opts) => addInputExpression(expr, opts),
    intersect2D: (idA, idB) => createSymbolicIntersection(idA, idB),
    slice3D: (planeId, surfId) => create3DSliceCard(planeId, surfId),
    revolve: (fnId, a, b, n) => createRevolution3D(fnId, a, b, n),
    addCSG: (preset) => addCSGSolid(preset),
    exportGLB: (name) => graph3D?.exportGLB(name),
    exportSTL: (name) => graph3D?.exportSTL(name),
    loadScenario: (key) => loadScenario(key),
    getStateSnapshot: () => ({
      version: '3.0.0',
      viewMode: state.viewMode,
      params: getSliderParams(),
      objects: state.objects.map((o) => ({
        id: o.id,
        kind: o.kind,
        label: o.label,
        rawInput: o.rawInput,
        visible: o.visible
      }))
    })
  });
}

async function boot() {
  graphCanvas = new DynamicGraphCanvas(
    document.getElementById('graphCanvas'),
    document.getElementById('canvasLabelLayer'),
    {
      onPointerCoords: (wx, wy) => {
        const el = document.getElementById('coordReadout');
        if (el) el.textContent = `(x, y) = (${formatCleanNumber(wx, 2)}, ${formatCleanNumber(wy, 2)})`;
      },
      onRequestIntersect: (idA, idB) => createSymbolicIntersection(idA, idB),
      onRequestSpecialPoints: (id) => {
        const obj = state.objects.find((o) => o.id === id && o.kind === 'explicit');
        if (obj) {
          obj.showSpecial = !obj.showSpecial;
          refreshSymbolicScene(true);
        }
      },
      onRequestTangent: (id, exactX) => createSymbolicTangent(id, exactX),
      onRequestIntegral: (id, aEx, bEx) => createSymbolicIntegral(id, aEx, bEx),
      onSketchRecognized: (eqStr, shapeName) => {
        addInputExpression(eqStr);
        showCanvasHint(`✍ 손글씨 ${shapeName} 인식 완료 → [${eqStr}] 생성!`);
      },
      onSelectCurve: (id) => {
        state.selectedCardId = id;
        renderAlgebraPanel();
      },
      onToolHint: (msg) => showCanvasHint(msg)
    }
  );

  graph3D = new SpatialGraph3D(
    document.getElementById('viewport3D'),
    document.getElementById('labelLayer3D'),
    {
      onHint: (msg) => showCanvasHint(msg)
    }
  );

  bindUI();
  exposeSDK();

  appendTutorBubble(
    'tutor',
    '2D 평면과 3D 공간기하 대수 엔진이 모두 연결되었습니다! 상단 빠른 질문 버튼을 눌러 3D 구·평면 교원, 원뿔곡선 단면, 회전체·구분구적법 부피를 바로 작도해 보세요.'
  );

  try {
    const res = await initGiacEngine('../node_modules/@basthon/xcas-wasm/src/index.js');
    eventBus.emit('ENGINE_INITIALIZED', { engine: 'Giac C++ WASM + Three.js BVH', initMs: res.initMs });
    // Boot directly into Scenario 5 (3D Sphere ∩ Plane Cross-Section) so the user immediately sees the new 3D + Giac CAS integration in action!
    loadScenario('s5');
  } catch (err) {
    console.error('Giac WASM load error:', err);
    const st = document.getElementById('engineStatus');
    if (st) st.textContent = 'WASM 로드 오류 (서버 실행 필요)';
  }
}

boot();
