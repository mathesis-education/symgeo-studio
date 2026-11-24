/**
 * Clean-Room Crack-Free Isosurface Extractor (Kuhn 6-Tetrahedra Decomposition)
 *
 * Converts any 3D implicit scalar field F(x, y, z) = 0 into smooth, outward-oriented
 * triangle positions & gradient normals ready for THREE.BufferGeometry, BVH plane slicing,
 * and .glb / .stl export.
 */

const CUBE_VERTS = [
  [0, 0, 0], // 0
  [1, 0, 0], // 1
  [1, 1, 0], // 2
  [0, 1, 0], // 3
  [0, 0, 1], // 4
  [1, 0, 1], // 5
  [1, 1, 1], // 6
  [0, 1, 1]  // 7
];

// 6 Kuhn tetrahedra sharing the main diagonal (0 -> 6), guaranteeing crack-free shared faces
const KUHN_TETS = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6]
];

function interpEdge(cornerPos, cornerVal, idxA, idxB) {
  // Canonical vertex index ordering (idxA < idxB) ensures bit-identical IEEE-754
  // coordinates across all adjacent Kuhn tetrahedra sharing an edge.
  const a = idxA < idxB ? idxA : idxB;
  const b = idxA < idxB ? idxB : idxA;
  const pA = cornerPos[a];
  const pB = cornerPos[b];
  const vA = cornerVal[a];
  const vB = cornerVal[b];
  const denom = vA - vB;
  const t = Math.abs(denom) < 1e-12 ? 0.5 : Math.max(0, Math.min(1, vA / denom));
  return [
    pA[0] + t * (pB[0] - pA[0]),
    pA[1] + t * (pB[1] - pA[1]),
    pA[2] + t * (pB[2] - pA[2])
  ];
}

/**
 * Extract triangle soup { positions: Float32Array, normals: Float32Array } for F(x, y, z) = 0
 * over bounding box [minB, maxB]^3 at grid resolution `res` (default 34).
 */
export function extractImplicitSurfaceMesh(evalFn3D, bounds = { min: -4.5, max: 4.5 }, res = 34) {
  const minB = bounds.min;
  const maxB = bounds.max;
  const span = maxB - minB;
  const step = span / res;
  const n1 = res + 1;
  const sliceStride = n1 * n1;

  // Sample 3D scalar grid once
  const grid = new Float32Array(n1 * n1 * n1);
  for (let iz = 0; iz <= res; iz++) {
    const z = minB + iz * step;
    const zOff = iz * sliceStride;
    for (let iy = 0; iy <= res; iy++) {
      const y = minB + iy * step;
      const yOff = zOff + iy * n1;
      for (let ix = 0; ix <= res; ix++) {
        const x = minB + ix * step;
        const val = evalFn3D(x, y, z);
        grid[yOff + ix] = Number.isFinite(val) ? val : NaN;
      }
    }
  }

  const posArr = [];
  const normArr = [];
  const epsGrad = step * 0.25;

  const computeNormal = (p) => {
    const gx = evalFn3D(p[0] + epsGrad, p[1], p[2]) - evalFn3D(p[0] - epsGrad, p[1], p[2]);
    const gy = evalFn3D(p[0], p[1] + epsGrad, p[2]) - evalFn3D(p[0], p[1] - epsGrad, p[2]);
    const gz = evalFn3D(p[0], p[1], p[2] + epsGrad) - evalFn3D(p[0], p[1], p[2] - epsGrad);
    const len = Math.hypot(gx, gy, gz);
    if (!Number.isFinite(len) || len < 1e-12) return [0, 0, 1];
    return [gx / len, gy / len, gz / len];
  };

  const emitTriangle = (a, b, c) => {
    const na = computeNormal(a);
    const nb = computeNormal(b);
    const nc = computeNormal(c);

    // Orient winding consistently with average gradient normal
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    const avgNx = na[0] + nb[0] + nc[0];
    const avgNy = na[1] + nb[1] + nc[1];
    const avgNz = na[2] + nb[2] + nc[2];

    if (cx * avgNx + cy * avgNy + cz * avgNz < 0) {
      // Flip b <-> c for outward winding
      posArr.push(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2]);
      normArr.push(na[0], na[1], na[2], nc[0], nc[1], nc[2], nb[0], nb[1], nb[2]);
    } else {
      posArr.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      normArr.push(na[0], na[1], na[2], nb[0], nb[1], nb[2], nc[0], nc[1], nc[2]);
    }
  };

  const cornerPos = new Array(8);
  const cornerVal = new Float64Array(8);

  for (let iz = 0; iz < res; iz++) {
    const z0 = minB + iz * step;
    for (let iy = 0; iy < res; iy++) {
      const y0 = minB + iy * step;
      for (let ix = 0; ix < res; ix++) {
        const x0 = minB + ix * step;

        let allPos = true;
        let allNeg = true;
        let hasNaN = false;

        for (let k = 0; k < 8; k++) {
          const cv = CUBE_VERTS[k];
          const gx = ix + cv[0];
          const gy = iy + cv[1];
          const gz = iz + cv[2];
          const val = grid[gz * sliceStride + gy * n1 + gx];
          if (!Number.isFinite(val) || Math.abs(val) > 1e5) {
            hasNaN = true;
            break;
          }
          cornerVal[k] = val;
          if (val < 0) allPos = false;
          else allNeg = false;
        }

        if (hasNaN || allPos || allNeg) continue;

        for (let k = 0; k < 8; k++) {
          const cv = CUBE_VERTS[k];
          cornerPos[k] = [x0 + cv[0] * step, y0 + cv[1] * step, z0 + cv[2] * step];
        }

        for (let tIdx = 0; tIdx < 6; tIdx++) {
          const tet = KUHN_TETS[tIdx];
          const neg = [];
          const pos = [];
          for (let m = 0; m < 4; m++) {
            const cIdx = tet[m];
            if (cornerVal[cIdx] < 0) neg.push(cIdx);
            else pos.push(cIdx);
          }

          if (neg.length === 0 || pos.length === 0) continue;

          if (neg.length === 1 || pos.length === 1) {
            const lone = neg.length === 1 ? neg[0] : pos[0];
            const others = neg.length === 1 ? pos : neg;
            const e0 = interpEdge(cornerPos, cornerVal, lone, others[0]);
            const e1 = interpEdge(cornerPos, cornerVal, lone, others[1]);
            const e2 = interpEdge(cornerPos, cornerVal, lone, others[2]);
            emitTriangle(e0, e1, e2);
          } else {
            // 2 negative, 2 positive -> quad split into 2 triangles
            const i0 = neg[0], i1 = neg[1];
            const o0 = pos[0], o1 = pos[1];
            const p00 = interpEdge(cornerPos, cornerVal, i0, o0);
            const p01 = interpEdge(cornerPos, cornerVal, i0, o1);
            const p10 = interpEdge(cornerPos, cornerVal, i1, o0);
            const p11 = interpEdge(cornerPos, cornerVal, i1, o1);
            emitTriangle(p00, p01, p11);
            emitTriangle(p00, p11, p10);
          }
        }
      }
    }
  }

  return {
    positions: new Float32Array(posArr),
    normals: new Float32Array(normArr)
  };
}
