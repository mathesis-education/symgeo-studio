/**
 * GeoGebra-Class Interactive 2D High-DPI Graphing & Symbolic Geometry Canvas
 * (100% Clean-Room Implementation — Zero GeoGebra proprietary code/assets)
 *
 * Features:
 * - Explicit y = f(x) curves with discontinuity / vertical asymptote jump suppression
 * - Implicit F(x,y) = G(x,y) curves via Marching Squares
 * - Shaded Definite Integral Regions ∫_a^b f(x) dx
 * - Animated Locus / Trace Point P(t, f(t)) with glowing trail & live tangent vector
 * - Sketch-to-Object Gesture Recognizer (rough hand-drawn line, circle, parabola -> exact dynamic algebraic object)
 * - Smooth cursor-centered Wheel Zoom, Drag Pan, Origin Reset, Magnetic Snap
 */

import { formatCleanNumber } from './cas-engine.js';

const BADGE_COLORS = {
  intersection: { fill: '#dc2626', ring: '#fecaca', labelBg: '#fef2f2', border: '#ef4444' },
  max:          { fill: '#2563eb', ring: '#bfdbfe', labelBg: '#eff6ff', border: '#3b82f6' },
  min:          { fill: '#0891b2', ring: '#a5f3fc', labelBg: '#ecfeff', border: '#06b6d4' },
  inflection:   { fill: '#9333ea', ring: '#e9d5ff', labelBg: '#faf5ff', border: '#a855f7' },
  root:         { fill: '#475569', ring: '#e2e8f0', labelBg: '#f8fafc', border: '#64748b' },
  tangentPoint: { fill: '#d97706', ring: '#fde68a', labelBg: '#fffbeb', border: '#f59e0b' },
  tablePoint:   { fill: '#059669', ring: '#a7f3d0', labelBg: '#ecfdf5', border: '#10b981' }
};

export class DynamicGraphCanvas {
  constructor(canvasEl, labelLayerEl, callbacks = {}) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.labelLayer = labelLayerEl;
    this.callbacks = callbacks;

    this.centerX = 0;
    this.centerY = 0;
    this.scale = 60;

    this.width = 800;
    this.height = 600;
    this.dpr = window.devicePixelRatio || 1;

    this.showGrid = true;
    this.showAxes = true;
    this.showDecimalSub = false;
    // Tool modes: 'move' | 'intersect' | 'special' | 'tangent' | 'integral' | 'sketch'
    this.toolMode = 'move';

    this.objects = [];
    this.params = {};
    this.specialPoints = [];
    this.shadedIntegrals = []; // [{ id, evaluator, a, b, color, latexBadge, visible }]
    this.traceState = null;    // { evaluator, color, t, trail: [{x,y}], slope }

    this.hoveredPoint = null;
    this.hoveredCurveId = null;
    this.selectedFirstCurveId = null;
    this.integralPending = null; // { curveId, aExact, aNum }
    this.tangentPreview = null;

    // Hand-drawn sketch stroke buffer
    this.sketchStroke = [];
    this.isSketching = false;

    this.isDragging = false;
    this.dragMoved = false;
    this.lastPointer = { x: 0, y: 0 };

    this._rafPending = false;
    this._setupResizeObserver();
    this._bindPointerEvents();
  }

  _setupResizeObserver() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const updateSize = () => {
      const rect = parent.getBoundingClientRect();
      const w = Math.max(200, Math.floor(rect.width));
      const h = Math.max(200, Math.floor(rect.height));
      this.dpr = window.devicePixelRatio || 1;
      this.width = w;
      this.height = h;
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
      this.requestRender();
    };
    this.resizeObserver = new ResizeObserver(updateSize);
    this.resizeObserver.observe(parent);
    updateSize();
  }

  worldToScreenX(wx) {
    return this.width / 2 + (wx - this.centerX) * this.scale;
  }

  worldToScreenY(wy) {
    return this.height / 2 - (wy - this.centerY) * this.scale;
  }

  screenToWorldX(sx) {
    return this.centerX + (sx - this.width / 2) / this.scale;
  }

  screenToWorldY(sy) {
    return this.centerY - (sy - this.height / 2) / this.scale;
  }

  setToolMode(mode) {
    this.toolMode = mode;
    this.selectedFirstCurveId = null;
    this.integralPending = null;
    this.tangentPreview = null;
    this.sketchStroke = [];
    this.canvas.style.cursor = mode === 'move' ? 'grab' : 'crosshair';
    this.requestRender();
  }

  resetView() {
    this.centerX = 0;
    this.centerY = 0;
    this.scale = 60;
    this.requestRender();
  }

  zoomBy(factor, anchorSx = this.width / 2, anchorSy = this.height / 2) {
    const wxBefore = this.screenToWorldX(anchorSx);
    const wyBefore = this.screenToWorldY(anchorSy);
    this.scale = Math.min(2500, Math.max(6, this.scale * factor));
    const wxAfter = this.screenToWorldX(anchorSx);
    const wyAfter = this.screenToWorldY(anchorSy);
    this.centerX += wxBefore - wxAfter;
    this.centerY += wyBefore - wyAfter;
    this.requestRender();
  }

  setScene(objects, params, specialPoints, shadedIntegrals = [], traceState = null) {
    this.objects = objects || [];
    this.params = params || {};
    this.specialPoints = specialPoints || [];
    this.shadedIntegrals = shadedIntegrals || [];
    this.traceState = traceState;
    this.requestRender();
  }

  requestRender() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this.render();
    });
  }

  _getPointerPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  _hitTestSpecialPoint(sx, sy) {
    let best = null;
    let bestDist = 17; // Generous tolerance for student/tablet touch (Gate 3.2)
    for (const pt of this.specialPoints) {
      const px = this.worldToScreenX(pt.x);
      const py = this.worldToScreenY(pt.y);
      const d = Math.hypot(px - sx, py - sy);
      if (d < bestDist) {
        bestDist = d;
        best = pt;
      }
    }
    return best;
  }

  _hitTestCurve(sx, sy) {
    const wx = this.screenToWorldX(sx);
    const wy = this.screenToWorldY(sy);
    let bestId = null;
    let bestPxDist = 15;

    for (const obj of this.objects) {
      if (!obj.visible || !obj.evaluator) continue;
      if (obj.kind === 'explicit') {
        const yVal = obj.evaluator(wx, 0, this.params);
        if (Number.isFinite(yVal)) {
          const cy = this.worldToScreenY(yVal);
          const dx = 1 / this.scale;
          const yNext = obj.evaluator(wx + dx, 0, this.params);
          const slope = Number.isFinite(yNext) ? (yNext - yVal) / dx : 0;
          const perpDist = Math.abs(cy - sy) / Math.sqrt(1 + slope * slope);
          if (perpDist < bestPxDist) {
            bestPxDist = perpDist;
            bestId = obj.id;
          }
        }
      } else if (obj.kind === 'implicit') {
        const f0 = obj.evaluator(wx, wy, this.params);
        if (Number.isFinite(f0)) {
          const eps = 1.5 / this.scale;
          const fx = (obj.evaluator(wx + eps, wy, this.params) - f0) / eps;
          const fy = (obj.evaluator(wx, wy + eps, this.params) - f0) / eps;
          const grad = Math.hypot(fx, fy);
          if (grad > 1e-8) {
            const pxDist = (Math.abs(f0) / grad) * this.scale;
            if (pxDist < bestPxDist) {
              bestPxDist = pxDist;
              bestId = obj.id;
            }
          }
        }
      }
    }
    return bestId;
  }

  /**
   * Magnetic Snap X-coordinate (snaps to special points or integer/0.5 grid within 12px)
   */
  _snapWorldX(sx) {
    const rawWx = this.screenToWorldX(sx);

    for (const pt of this.specialPoints) {
      const px = this.worldToScreenX(pt.x);
      if (Math.abs(px - sx) < 14 && pt.exactX) {
        return { xNum: pt.x, exactX: pt.exactX };
      }
    }

    const nearestHalf = Math.round(rawWx * 2) / 2;
    const halfPx = this.worldToScreenX(nearestHalf);
    if (Math.abs(halfPx - sx) < 12) {
      const exactStr = Number.isInteger(nearestHalf)
        ? String(nearestHalf)
        : `${Math.round(nearestHalf * 2)}/2`;
      return { xNum: nearestHalf, exactX: exactStr };
    }

    const rounded = Math.round(rawWx * 10) / 10;
    const exactStr = Number.isInteger(rounded) ? String(rounded) : `(${Math.round(rounded * 10)}/10)`;
    return { xNum: rounded, exactX: exactStr };
  }

  _bindPointerEvents() {
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const pos = this._getPointerPos(e);
        const factor = e.deltaY < 0 ? 1.13 : 1 / 1.13;
        this.zoomBy(factor, pos.x, pos.y);
      },
      { passive: false }
    );

    this.canvas.addEventListener('pointerdown', (e) => {
      const pos = this._getPointerPos(e);
      if (this.toolMode === 'sketch') {
        this.isSketching = true;
        this.sketchStroke = [{ sx: pos.x, sy: pos.y, wx: this.screenToWorldX(pos.x), wy: this.screenToWorldY(pos.y) }];
        this.canvas.setPointerCapture(e.pointerId);
        this.requestRender();
        return;
      }

      this.isDragging = true;
      this.dragMoved = false;
      this.lastPointer = pos;
      if (this.toolMode === 'move') {
        this.canvas.style.cursor = 'grabbing';
      }
      this.canvas.setPointerCapture(e.pointerId);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      const pos = this._getPointerPos(e);

      if (this.isSketching && this.toolMode === 'sketch') {
        this.sketchStroke.push({
          sx: pos.x,
          sy: pos.y,
          wx: this.screenToWorldX(pos.x),
          wy: this.screenToWorldY(pos.y)
        });
        this.requestRender();
        return;
      }

      if (this.isDragging && this.toolMode === 'move') {
        const dx = pos.x - this.lastPointer.x;
        const dy = pos.y - this.lastPointer.y;
        if (Math.hypot(dx, dy) > 2) this.dragMoved = true;
        this.centerX -= dx / this.scale;
        this.centerY += dy / this.scale;
        this.lastPointer = pos;
        this.requestRender();
        return;
      }

      if (this.isDragging && Math.hypot(pos.x - this.lastPointer.x, pos.y - this.lastPointer.y) > 4) {
        this.dragMoved = true;
      }

      const hitPt = this._hitTestSpecialPoint(pos.x, pos.y);
      const hitCurve = hitPt ? null : this._hitTestCurve(pos.x, pos.y);

      let changed = false;
      if (this.hoveredPoint !== hitPt) {
        this.hoveredPoint = hitPt;
        changed = true;
      }
      if (this.hoveredCurveId !== hitCurve) {
        this.hoveredCurveId = hitCurve;
        changed = true;
      }

      if ((this.toolMode === 'tangent' || this.toolMode === 'integral') && (hitCurve || this.integralPending)) {
        const targetId = this.integralPending ? this.integralPending.curveId : hitCurve;
        const targetObj = this.objects.find((o) => o.id === targetId && o.kind === 'explicit');
        if (targetObj) {
          const snap = this._snapWorldX(pos.x);
          const yVal = targetObj.evaluator(snap.xNum, 0, this.params);
          this.tangentPreview = Number.isFinite(yVal)
            ? { objId: targetObj.id, x: snap.xNum, y: yVal, exactX: snap.exactX }
            : null;
          changed = true;
        }
      } else if (this.tangentPreview) {
        this.tangentPreview = null;
        changed = true;
      }

      if (this.toolMode === 'move') {
        this.canvas.style.cursor = hitPt || hitCurve ? 'pointer' : 'grab';
      } else {
        this.canvas.style.cursor = 'crosshair';
      }

      if (changed) this.requestRender();

      if (this.callbacks.onPointerCoords) {
        this.callbacks.onPointerCoords(this.screenToWorldX(pos.x), this.screenToWorldY(pos.y));
      }
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (this.isSketching && this.toolMode === 'sketch') {
        this.isSketching = false;
        this._recognizeSketchStroke();
        this.sketchStroke = [];
        this.requestRender();
        return;
      }

      const pos = this._getPointerPos(e);
      const wasDrag = this.dragMoved;
      this.isDragging = false;
      if (this.toolMode === 'move') {
        this.canvas.style.cursor = 'grab';
      }

      if (!wasDrag) {
        this._handleCanvasClick(pos.x, pos.y);
      }
    });
  }

  /**
   * Sketchometry-style Gesture & Shape Recognizer:
   * Recognizes hand-drawn Circle, Straight Line, or Parabola and converts to clean dynamic equation!
   */
  _recognizeSketchStroke() {
    const pts = this.sketchStroke;
    if (pts.length < 8) return;

    const first = pts[0];
    const last = pts[pts.length - 1];
    let pathLenPx = 0;
    let minWx = Infinity, maxWx = -Infinity, minWy = Infinity, maxWy = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) pathLenPx += Math.hypot(pts[i].sx - pts[i - 1].sx, pts[i].sy - pts[i - 1].sy);
      minWx = Math.min(minWx, pts[i].wx);
      maxWx = Math.max(maxWx, pts[i].wx);
      minWy = Math.min(minWy, pts[i].wy);
      maxWy = Math.max(maxWy, pts[i].wy);
    }
    if (pathLenPx < 35) return;

    const endGapPx = Math.hypot(last.sx - first.sx, last.sy - first.sy);
    const snapHalf = (v) => Math.round(v * 2) / 2;

    // 1. Closed loop -> Circle (x - h)^2 + (y - k)^2 = r^2
    if (endGapPx < Math.max(48, pathLenPx * 0.22)) {
      const cx = snapHalf((minWx + maxWx) / 2);
      const cy = snapHalf((minWy + maxWy) / 2);
      const r = Math.max(0.5, snapHalf(((maxWx - minWx) + (maxWy - minWy)) / 4));
      const xTerm = cx === 0 ? 'x^2' : `(x ${cx > 0 ? '-' : '+'} ${Math.abs(cx)})^2`;
      const yTerm = cy === 0 ? 'y^2' : `(y ${cy > 0 ? '-' : '+'} ${Math.abs(cy)})^2`;
      const rSq = formatCleanNumber(r * r, 2);
      if (this.callbacks.onSketchRecognized) {
        this.callbacks.onSketchRecognized(`${xTerm} + ${yTerm} = ${rSq}`, '원(Circle)');
      }
      return;
    }

    // 2. Check straightness (end-to-end distance / path length > 0.91) -> Line y = m*x + b
    if (endGapPx / pathLenPx > 0.91) {
      if (Math.abs(last.wx - first.wx) < 0.25) {
        const xConst = snapHalf((first.wx + last.wx) / 2);
        if (this.callbacks.onSketchRecognized) {
          this.callbacks.onSketchRecognized(`x = ${xConst}`, '수직선');
        }
        return;
      }
      // Ordinary least squares line fit
      const n = pts.length;
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const p of pts) {
        sx += p.wx; sy += p.wy; sxx += p.wx * p.wx; sxy += p.wx * p.wy;
      }
      const denom = n * sxx - sx * sx;
      const m = Math.abs(denom) > 1e-9 ? snapHalf((n * sxy - sx * sy) / denom) : 0;
      const b = snapHalf((sy - m * sx) / n);
      const mPart = m === 0 ? '' : m === 1 ? 'x' : m === -1 ? '-x' : `${m}*x`;
      const bPart = b === 0 ? (mPart ? '' : '0') : b > 0 ? (mPart ? ` + ${b}` : `${b}`) : ` - ${Math.abs(b)}`;
      if (this.callbacks.onSketchRecognized) {
        this.callbacks.onSketchRecognized(`y = ${mPart}${bPart}`, '일차함수(직선)');
      }
      return;
    }

    // 3. Curved open U-shape / arch -> Parabola y = a*(x - p)^2 + q
    // Find vertex (extremum in y)
    let minPt = pts[0], maxPt = pts[0];
    for (const p of pts) {
      if (p.wy < minPt.wy) minPt = p;
      if (p.wy > maxPt.wy) maxPt = p;
    }
    const endsAvgY = (first.wy + last.wy) / 2;
    const isUpward = endsAvgY > (minPt.wy + maxPt.wy) / 2;
    const vPt = isUpward ? minPt : maxPt;
    const pSnap = snapHalf(vPt.wx);
    const qSnap = snapHalf(vPt.wy);
    const dxEnd = Math.max(0.8, Math.abs(last.wx - vPt.wx));
    let aRaw = (last.wy - vPt.wy) / (dxEnd * dxEnd);
    let aSnap = snapHalf(aRaw);
    if (aSnap === 0) aSnap = isUpward ? 1 : -1;

    const aStr = aSnap === 1 ? '' : aSnap === -1 ? '-' : `${aSnap}*`;
    const baseStr = pSnap === 0 ? 'x^2' : `(x ${pSnap > 0 ? '-' : '+'} ${Math.abs(pSnap)})^2`;
    const qStr = qSnap === 0 ? '' : qSnap > 0 ? ` + ${qSnap}` : ` - ${Math.abs(qSnap)}`;

    if (this.callbacks.onSketchRecognized) {
      this.callbacks.onSketchRecognized(`y = ${aStr}${baseStr}${qStr}`, '이차함수(포물선)');
    }
  }

  _handleCanvasClick(sx, sy) {
    const hitPt = this._hitTestSpecialPoint(sx, sy);
    if (hitPt && this.toolMode === 'move') {
      if (this.callbacks.onSelectPoint) this.callbacks.onSelectPoint(hitPt);
      return;
    }

    if (this.toolMode === 'integral' && this.integralPending) {
      const snap = this._snapWorldX(sx);
      const pending = this.integralPending;
      this.integralPending = null;
      const aNum = Math.min(pending.aNum, snap.xNum);
      const bNum = Math.max(pending.aNum, snap.xNum);
      const aEx = pending.aNum <= snap.xNum ? pending.aExact : snap.exactX;
      const bEx = pending.aNum <= snap.xNum ? snap.exactX : pending.aExact;
      if (this.callbacks.onRequestIntegral) {
        this.callbacks.onRequestIntegral(pending.curveId, aEx, bEx, aNum, bNum);
      }
      this.requestRender();
      return;
    }

    const hitCurveId = this._hitTestCurve(sx, sy);
    if (!hitCurveId) {
      if (this.toolMode === 'intersect') {
        this.selectedFirstCurveId = null;
        this.requestRender();
      }
      return;
    }

    if (this.toolMode === 'intersect') {
      if (!this.selectedFirstCurveId) {
        this.selectedFirstCurveId = hitCurveId;
        if (this.callbacks.onToolHint) {
          const obj1 = this.objects.find((o) => o.id === hitCurveId);
          this.callbacks.onToolHint(`첫 번째 곡선 [${obj1?.label || ''}] 선택됨 → 교점을 구할 두 번째 곡선을 클릭하세요.`);
        }
        this.requestRender();
      } else if (this.selectedFirstCurveId !== hitCurveId) {
        const firstId = this.selectedFirstCurveId;
        this.selectedFirstCurveId = null;
        if (this.callbacks.onRequestIntersect) {
          this.callbacks.onRequestIntersect(firstId, hitCurveId);
        }
        this.requestRender();
      }
    } else if (this.toolMode === 'special') {
      if (this.callbacks.onRequestSpecialPoints) {
        this.callbacks.onRequestSpecialPoints(hitCurveId);
      }
    } else if (this.toolMode === 'tangent') {
      const targetObj = this.objects.find((o) => o.id === hitCurveId && o.kind === 'explicit');
      if (targetObj && this.callbacks.onRequestTangent) {
        const snap = this._snapWorldX(sx);
        this.callbacks.onRequestTangent(targetObj.id, snap.exactX);
      }
    } else if (this.toolMode === 'integral') {
      const targetObj = this.objects.find((o) => o.id === hitCurveId && o.kind === 'explicit');
      if (targetObj) {
        const snap = this._snapWorldX(sx);
        this.integralPending = { curveId: targetObj.id, aExact: snap.exactX, aNum: snap.xNum };
        if (this.callbacks.onToolHint) {
          this.callbacks.onToolHint(`적분 시작점 x = ${snap.exactX} 선택됨 → 적분 끝점(x = b) 위치를 클릭하세요.`);
        }
        this.requestRender();
      }
    } else if (this.toolMode === 'move') {
      if (this.callbacks.onSelectCurve) {
        this.callbacks.onSelectCurve(hitCurveId);
      }
    }
  }

  _computeNiceGridStep() {
    const targetPx = 82;
    const rawStep = targetPx / this.scale;
    const exp = Math.floor(Math.log10(rawStep));
    const base = Math.pow(10, exp);
    const frac = rawStep / base;
    if (frac < 1.5) return 1 * base;
    if (frac < 3.5) return 2 * base;
    if (frac < 7.5) return 5 * base;
    return 10 * base;
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.width, this.height);

    const step = this._computeNiceGridStep();
    const minorStep = step / 5;
    const xMin = this.screenToWorldX(0);
    const xMax = this.screenToWorldX(this.width);
    const yMin = this.screenToWorldY(this.height);
    const yMax = this.screenToWorldY(0);

    // 1. Grid
    if (this.showGrid) {
      ctx.strokeStyle = '#f3f5f8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const mxStart = Math.floor(xMin / minorStep) * minorStep;
      for (let x = mxStart; x <= xMax; x += minorStep) {
        const sx = Math.round(this.worldToScreenX(x)) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, this.height);
      }
      const myStart = Math.floor(yMin / minorStep) * minorStep;
      for (let y = myStart; y <= yMax; y += minorStep) {
        const sy = Math.round(this.worldToScreenY(y)) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(this.width, sy);
      }
      ctx.stroke();

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const gxStart = Math.floor(xMin / step) * step;
      for (let x = gxStart; x <= xMax; x += step) {
        const sx = Math.round(this.worldToScreenX(x)) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, this.height);
      }
      const gyStart = Math.floor(yMin / step) * step;
      for (let y = gyStart; y <= yMax; y += step) {
        const sy = Math.round(this.worldToScreenY(y)) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(this.width, sy);
      }
      ctx.stroke();
    }

    // 2. Shaded Definite Integrals (GeoGebra Integral Area style)
    for (const area of this.shadedIntegrals) {
      if (!area.visible || !area.evaluator) continue;
      this._drawShadedIntegral(ctx, area);
    }

    // 3. Coordinate Axes
    if (this.showAxes) {
      const axisX = this.worldToScreenX(0);
      const axisY = this.worldToScreenY(0);

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (axisY >= 0 && axisY <= this.height) {
        ctx.moveTo(0, axisY);
        ctx.lineTo(this.width, axisY);
      }
      if (axisX >= 0 && axisX <= this.width) {
        ctx.moveTo(axisX, 0);
        ctx.lineTo(axisX, this.height);
      }
      ctx.stroke();

      ctx.fillStyle = '#334155';
      if (axisY >= 0 && axisY <= this.height) {
        ctx.beginPath();
        ctx.moveTo(this.width - 2, axisY);
        ctx.lineTo(this.width - 10, axisY - 4.5);
        ctx.lineTo(this.width - 10, axisY + 4.5);
        ctx.closePath();
        ctx.fill();
      }
      if (axisX >= 0 && axisX <= this.width) {
        ctx.beginPath();
        ctx.moveTo(axisX, 2);
        ctx.lineTo(axisX - 4.5, 10);
        ctx.lineTo(axisX + 4.5, 10);
        ctx.closePath();
        ctx.fill();
      }

      ctx.font = '500 11.5px "Pretendard", "Malgun Gothic", system-ui, sans-serif';
      ctx.fillStyle = '#475569';
      const labelY = Math.min(this.height - 18, Math.max(6, axisY + 6));
      const gxStart = Math.floor(xMin / step) * step;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let x = gxStart; x <= xMax; x += step) {
        if (Math.abs(x) < step * 1e-6) continue;
        const sx = this.worldToScreenX(x);
        if (sx < 18 || sx > this.width - 22) continue;
        ctx.fillText(formatCleanNumber(x, 4), sx, labelY);
      }

      const labelX = Math.min(this.width - 8, Math.max(28, axisX - 7));
      const gyStart = Math.floor(yMin / step) * step;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let y = gyStart; y <= yMax; y += step) {
        if (Math.abs(y) < step * 1e-6) continue;
        const sy = this.worldToScreenY(y);
        if (sy < 16 || sy > this.height - 14) continue;
        ctx.fillText(formatCleanNumber(y, 4), labelX, sy);
      }

      if (axisX > 14 && axisX < this.width - 14 && axisY > 14 && axisY < this.height - 14) {
        ctx.fillText('0', axisX - 6, axisY + 12);
      }
    }

    // 4. Curves
    for (const obj of this.objects) {
      if (!obj.visible || !obj.evaluator) continue;
      const isSelected = obj.id === this.selectedFirstCurveId;
      const isHovered = obj.id === this.hoveredCurveId;

      if (obj.kind === 'explicit') {
        this._drawExplicitCurve(ctx, obj, isHovered || isSelected, isSelected);
      } else if (obj.kind === 'implicit') {
        this._drawImplicitCurve(ctx, obj, isHovered || isSelected, isSelected);
      }
    }

    // 5. Animated Locus / Trace Point Trail (Case #13 오성원)
    if (this.traceState && this.traceState.trail && this.traceState.trail.length > 0) {
      ctx.save();
      ctx.strokeStyle = this.traceState.color || '#ec4899';
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      this.traceState.trail.forEach((pt, idx) => {
        const sx = this.worldToScreenX(pt.x);
        const sy = this.worldToScreenY(pt.y);
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
      ctx.globalAlpha = 1;

      const cur = this.traceState.trail[this.traceState.trail.length - 1];
      const cx = this.worldToScreenX(cur.x);
      const cy = this.worldToScreenY(cur.y);

      // Moving tangent vector arrow
      if (Number.isFinite(this.traceState.slope)) {
        const lenPx = 56;
        const angle = Math.atan(this.traceState.slope);
        const dx = Math.cos(angle) * lenPx;
        const dy = -Math.sin(angle) * lenPx;
        ctx.strokeStyle = '#db2777';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - dx, cy - dy);
        ctx.lineTo(cx + dx, cy + dy);
        ctx.stroke();
      }

      ctx.fillStyle = '#db2777';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 6. Integral / Tangent Preview Line
    if (this.integralPending) {
      const sxA = this.worldToScreenX(this.integralPending.aNum);
      ctx.save();
      ctx.strokeStyle = '#2563eb';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(sxA, 0);
      ctx.lineTo(sxA, this.height);
      ctx.stroke();
      ctx.restore();
    }

    if (this.tangentPreview) {
      const px = this.worldToScreenX(this.tangentPreview.x);
      const py = this.worldToScreenY(this.tangentPreview.y);
      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, this.height);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 7. Hand-Drawn Sketch Stroke Preview
    if (this.sketchStroke.length > 1) {
      ctx.save();
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      this.sketchStroke.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.sx, p.sy);
        else ctx.lineTo(p.sx, p.sy);
      });
      ctx.stroke();
      ctx.restore();
    }

    // 8. Special Symbolic Points
    for (const pt of this.specialPoints) {
      const px = this.worldToScreenX(pt.x);
      const py = this.worldToScreenY(pt.y);
      if (px < -30 || px > this.width + 30 || py < -30 || py > this.height + 30) continue;

      const style = BADGE_COLORS[pt.kind] || BADGE_COLORS.root;
      const isHovered = this.hoveredPoint === pt;
      const r = isHovered ? 7 : 5.2;

      ctx.fillStyle = style.ring;
      ctx.beginPath();
      ctx.arc(px, py, r + 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = style.fill;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
    this._renderOverlayBadges();
  }

  _drawShadedIntegral(ctx, area) {
    const sxA = this.worldToScreenX(area.a);
    const sxB = this.worldToScreenX(area.b);
    const axisY = this.worldToScreenY(0);
    const steps = Math.max(40, Math.min(400, Math.ceil(Math.abs(sxB - sxA) / 2)));

    ctx.save();
    ctx.fillStyle = (area.color || '#2563eb') + '26';
    ctx.strokeStyle = (area.color || '#2563eb') + '88';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(sxA, axisY);
    for (let i = 0; i <= steps; i++) {
      const wx = area.a + ((area.b - area.a) * i) / steps;
      const wy = area.evaluator(wx, 0, this.params);
      if (!Number.isFinite(wy)) continue;
      ctx.lineTo(this.worldToScreenX(wx), this.worldToScreenY(wy));
    }
    ctx.lineTo(sxB, axisY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  _drawExplicitCurve(ctx, obj, highlight, dashedGlow) {
    const samples = Math.min(1400, Math.max(520, Math.floor(this.width * 1.3)));
    ctx.save();

    if (highlight) {
      ctx.strokeStyle = obj.color + '38';
      ctx.lineWidth = 8;
      this._traceExplicitPath(ctx, obj, samples);
      ctx.stroke();
    }

    ctx.strokeStyle = obj.color || '#2563eb';
    ctx.lineWidth = obj.isTangent ? 2.0 : highlight ? 3.1 : 2.5;
    if (obj.isTangent) ctx.setLineDash([7, 5]);
    else if (dashedGlow) ctx.setLineDash([10, 4]);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    this._traceExplicitPath(ctx, obj, samples);
    ctx.stroke();
    ctx.restore();
  }

  _traceExplicitPath(ctx, obj, samples) {
    ctx.beginPath();
    let penDown = false;
    let prevSy = 0;

    for (let i = 0; i <= samples; i++) {
      const sx = (i / samples) * this.width;
      const wx = this.screenToWorldX(sx);
      const wy = obj.evaluator(wx, 0, this.params);

      if (!Number.isFinite(wy)) {
        penDown = false;
        continue;
      }

      const sy = this.worldToScreenY(wy);
      if (sy < -this.height * 2 || sy > this.height * 3) {
        penDown = false;
        continue;
      }

      if (penDown && Math.abs(sy - prevSy) > this.height * 0.85) {
        const midWx = this.screenToWorldX(sx - (0.5 * this.width) / samples);
        const midSy = this.worldToScreenY(obj.evaluator(midWx, 0, this.params));
        if (!Number.isFinite(midSy) || (midSy - prevSy) * (sy - midSy) < 0) {
          penDown = false;
        }
      }

      if (!penDown) {
        ctx.moveTo(sx, sy);
        penDown = true;
      } else {
        ctx.lineTo(sx, sy);
      }
      prevSy = sy;
    }
  }

  _drawImplicitCurve(ctx, obj, highlight, dashedGlow) {
    const cellPx = this.isDragging ? 9 : 6;
    const cols = Math.ceil(this.width / cellPx);
    const rows = Math.ceil(this.height / cellPx);

    const grid = new Float64Array((cols + 1) * (rows + 1));
    for (let r = 0; r <= rows; r++) {
      const wy = this.screenToWorldY(r * cellPx);
      const rowOffset = r * (cols + 1);
      for (let c = 0; c <= cols; c++) {
        const wx = this.screenToWorldX(c * cellPx);
        grid[rowOffset + c] = obj.evaluator(wx, wy, this.params);
      }
    }

    const interp = (v1, v2) => {
      const denom = v1 - v2;
      if (Math.abs(denom) < 1e-15) return 0.5;
      return Math.max(0, Math.min(1, v1 / denom));
    };

    const buildSegments = () => {
      ctx.beginPath();
      const maxJumpVal = 1e6;
      for (let r = 0; r < rows; r++) {
        const y0 = r * cellPx;
        const y1 = (r + 1) * cellPx;
        const ro0 = r * (cols + 1);
        const ro1 = (r + 1) * (cols + 1);

        for (let c = 0; c < cols; c++) {
          const vTL = grid[ro0 + c];
          const vTR = grid[ro0 + c + 1];
          const vBR = grid[ro1 + c + 1];
          const vBL = grid[ro1 + c];

          if (
            !Number.isFinite(vTL) || !Number.isFinite(vTR) ||
            !Number.isFinite(vBR) || !Number.isFinite(vBL) ||
            Math.abs(vTL) > maxJumpVal || Math.abs(vTR) > maxJumpVal ||
            Math.abs(vBR) > maxJumpVal || Math.abs(vBL) > maxJumpVal
          ) {
            continue;
          }

          let mask = 0;
          if (vTL >= 0) mask |= 8;
          if (vTR >= 0) mask |= 4;
          if (vBR >= 0) mask |= 2;
          if (vBL >= 0) mask |= 1;
          if (mask === 0 || mask === 15) continue;

          const x0 = c * cellPx;
          const x1 = (c + 1) * cellPx;

          const top    = [x0 + interp(vTL, vTR) * cellPx, y0];
          const right  = [x1, y0 + interp(vTR, vBR) * cellPx];
          const bottom = [x0 + interp(vBL, vBR) * cellPx, y1];
          const left   = [x0, y0 + interp(vTL, vBL) * cellPx];

          const seg = (pA, pB) => {
            ctx.moveTo(pA[0], pA[1]);
            ctx.lineTo(pB[0], pB[1]);
          };

          switch (mask) {
            case 1:
            case 14: seg(left, bottom); break;
            case 2:
            case 13: seg(bottom, right); break;
            case 3:
            case 12: seg(left, right); break;
            case 4:
            case 11: seg(top, right); break;
            case 5:  seg(left, top); seg(bottom, right); break;
            case 6:
            case 9:  seg(top, bottom); break;
            case 7:
            case 8:  seg(left, top); break;
            case 10: seg(top, right); seg(left, bottom); break;
          }
        }
      }
    };

    ctx.save();
    if (highlight) {
      ctx.strokeStyle = obj.color + '38';
      ctx.lineWidth = 8;
      buildSegments();
      ctx.stroke();
    }
    ctx.strokeStyle = obj.color || '#dc2626';
    ctx.lineWidth = highlight ? 3.1 : 2.5;
    if (dashedGlow) ctx.setLineDash([10, 4]);
    ctx.lineCap = 'round';
    buildSegments();
    ctx.stroke();
    ctx.restore();
  }

  _renderOverlayBadges() {
    if (!this.labelLayer) return;
    this.labelLayer.innerHTML = '';

    const placedBoxes = [];
    const candidates = [...this.specialPoints];

    const priority = { intersection: 1, tangentPoint: 2, max: 3, min: 3, inflection: 4, tablePoint: 5, root: 6 };
    candidates.sort((a, b) => {
      if (a === this.hoveredPoint) return -1;
      if (b === this.hoveredPoint) return 1;
      return (priority[a.kind] || 9) - (priority[b.kind] || 9);
    });

    for (const pt of candidates) {
      const sx = this.worldToScreenX(pt.x);
      const sy = this.worldToScreenY(pt.y);
      if (sx < 16 || sx > this.width - 16 || sy < 16 || sy > this.height - 16) continue;

      const isHovered = pt === this.hoveredPoint;
      if (!pt.pinned && !isHovered && candidates.length > 10 && pt.kind === 'root') continue;

      const boxW = 148;
      const boxH = 38;
      let bx = sx + 10;
      let by = sy - boxH - 8;
      if (bx + boxW > this.width - 10) bx = sx - boxW - 10;
      if (by < 14) by = sy + 12;

      if (!isHovered) {
        const collides = placedBoxes.some(
          (b) => Math.abs(b.x - bx) < boxW * 0.78 && Math.abs(b.y - by) < boxH * 0.85
        );
        if (collides) continue;
      }
      placedBoxes.push({ x: bx, y: by });

      const style = BADGE_COLORS[pt.kind] || BADGE_COLORS.root;
      const el = document.createElement('div');
      el.className = `canvas-pt-badge${isHovered ? ' is-hovered' : ''}`;
      el.style.left = `${Math.round(bx)}px`;
      el.style.top = `${Math.round(by)}px`;
      el.style.borderColor = style.border;
      el.style.backgroundColor = style.labelBg;

      const tag = document.createElement('span');
      tag.className = 'pt-kind-tag';
      tag.style.backgroundColor = style.fill;
      tag.textContent = pt.badge || '점';
      el.appendChild(tag);

      const mathSpan = document.createElement('span');
      mathSpan.className = 'pt-math';
      if (window.katex && pt.latexCoord) {
        try {
          window.katex.render(pt.latexCoord, mathSpan, { throwOnError: false });
        } catch {
          mathSpan.textContent = `(${formatCleanNumber(pt.x)}, ${formatCleanNumber(pt.y)})`;
        }
      } else {
        mathSpan.textContent = `(${formatCleanNumber(pt.x)}, ${formatCleanNumber(pt.y)})`;
      }
      el.appendChild(mathSpan);

      if (this.showDecimalSub || isHovered) {
        const approxSpan = document.createElement('span');
        approxSpan.className = 'pt-approx';
        approxSpan.textContent = `≈ (${formatCleanNumber(pt.x, 4)}, ${formatCleanNumber(pt.y, 4)})`;
        el.appendChild(approxSpan);
      }

      this.labelLayer.appendChild(el);
    }

    // Also render Shaded Integral Badges at midpoint of [a, b]
    for (const area of this.shadedIntegrals) {
      if (!area.visible || !area.latexBadge) continue;
      const midWx = (area.a + area.b) / 2;
      const midWy = (area.evaluator(midWx, 0, this.params) || 0) * 0.45;
      const sx = this.worldToScreenX(midWx);
      const sy = this.worldToScreenY(midWy);
      if (sx < 20 || sx > this.width - 120 || sy < 20 || sy > this.height - 20) continue;

      const el = document.createElement('div');
      el.className = 'canvas-pt-badge';
      el.style.left = `${Math.round(sx - 50)}px`;
      el.style.top = `${Math.round(sy - 16)}px`;
      el.style.borderColor = area.color || '#2563eb';
      el.style.backgroundColor = '#eff6ff';
      if (window.katex) {
        try {
          window.katex.render(area.latexBadge, el, { throwOnError: false });
        } catch {
          el.textContent = area.latexBadge;
        }
      }
      this.labelLayer.appendChild(el);
    }
  }
}
