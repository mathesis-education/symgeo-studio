# SymGeo Studio Calculator Suite 2D+3D (v3.0.0) — Giac C++ WASM, Three.js, MeshBVH & CSG

Open-source client-side symbolic-geometric computing studio coupling the **Giac/Xcas C++ Computer Algebra System (`@basthon/xcas-wasm`, `GPL-3.0-or-later`)** with a synchronized **2D High-DPI Canvas** and **3D WebGL2 (`Three.js` + `three-mesh-bvh` + `three-bvh-csg`, `MIT`)** geometry kernel, spanning secondary school mathematics through undergraduate STEM curricula.

---

## Architectural Highlights

1. **Unified Symbolic–Geometric Dependency Graph (`2D`, `2D+3D Coupled`, `3D`)**
   - Single algebra pane driving 2D explicit/implicit curves, real-time parameter sliders, 3D explicit surfaces $z=f(x,y)$, crack-free Kuhn 6-tetrahedra 3D implicit surfaces $F(x,y,z)=0$, space curves $\mathbf{r}(t)$, 3D matrix transformations, and 3D vector fields $\mathbf{F}(x,y,z)$.
   - Eliminates floating-point numerical root-finding pathologies: preserves exact radicals/rationals (e.g., $\frac{1\pm\sqrt{13}}{2}$) and rejects false-positive inflection points (e.g., $f(x)=x^4$ at $x=0$ via higher-order symbolic concavity parity checks).
2. **Dual-Engine 3D Plane Slicing (`Giac` Symbolic Reduction + `MeshBVH` Shapecast)**
   - Intersecting a 3D surface with an arbitrary plane $ax+by+cz=d$ simultaneously invokes Giac symbolic elimination (yielding exact center, radical radius $r=\frac{\sqrt{30}}{2}$, area $S=\frac{15\pi}{2}$, or conic equation) and `MeshBVH.shapecast` (`0.047 ms` per frame, culling `93.05%` of non-intersecting triangles).
3. **2D $\leftrightarrow$ 3D Solids of Revolution & Riemann Disc Convergence**
   - Converts any 2D curve $y=f(x)$ on $[a,b]$ into a 3D lathe solid alongside $n$-disc numerical quadrature converging to Giac's exact symbolic integral $V = \pi \int_a^b \{f(x)\}^2\,dx$.
4. **University Mathematics Modules (`v3.0.0`)**
   - **Differential Geometry:** Space curve curvature $\kappa(t)$, torsion $\tau(t)$, moving Frenet–Serret frame $\{\mathbf{T},\mathbf{N},\mathbf{B}\}$, osculating circle, and surface Gaussian/Mean curvature ($K, H$) vertex-color heatmaps.
   - **Linear Algebra:** Continuous 3D unit-sphere-to-ellipsoid linear deformation $(1-s)I + sM$, real eigenvector axes, characteristic polynomials, and exact **Jordan Canonical Form (`jordan`)** immune to IEEE-754 defective eigenvalue splitting.
   - **Vector Calculus, ODEs, Integral Transforms & Complex Analysis:** Symbolic $\nabla\cdot\mathbf{F}$ (`divergence`), $\nabla\times\mathbf{F}$ (`curl`), exact symbolic ODE solver (`desolve`), Laplace/inverse-Laplace transforms (`laplace`, `ilaplace`), Gröbner bases (`gbasis`), and higher-order pole complex residues (`residue`).
5. **Open Ecosystem Telemetry & Neuro-Symbolic Verification SDK (`window.SymGeoCAS`)**
   - Structured JSON event bus (`SymGeoEventBus`) for Learning Record Stores (LRS) and headless/programmatic CAS verification (`window.SymGeoCAS.evalCAS`, `addExpression`, `exportState`).

---

## Quick Start & Reproducible Benchmarks

```powershell
git clone https://github.com/mathesis-education/symgeo-studio.git
cd symgeo-studio
npm install
npm start          # Starts local HTTP server at http://127.0.0.1:8787
npm test           # Runs 2D + 3D + Giac WASM + BVH + CSG verification suite
npm run benchmark  # Runs 24-task accuracy & N=30 latency/scaling benchmarks
```

---

## License

Released under **GNU General Public License v3.0 or later (`GPL-3.0-or-later`)**. See [`LICENSE`](LICENSE) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

---

## Neuro-Symbolic RVR Replication Benchmark (`SymGeoRVR-120`)

See [`neurosymbolic-rvr/`](neurosymbolic-rvr/README.md) for the complete 120-item open-ended mathematical tutoring & misconception diagnosis benchmark, client-side `giac.wasm` vs. IEEE-754 tool sandboxes, verbatim `N = 720` + `240` episode logs, and statistical verification scripts.
