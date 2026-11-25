/**
 * SymGeo Studio 2D+3D — Bilingual (English / Korean) Localization Engine
 * Default language: 'en' (supports `?lang=ko` URL parameter, localStorage persistence, and live toggle).
 */

function detectInitialLang() {
  try {
    if (typeof window !== 'undefined' && window.location && typeof window.location.search === 'string') {
      const q = new URLSearchParams(window.location.search).get('lang');
      if (q === 'ko' || q === 'en') return q;
    }
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('symgeo_lang');
      if (saved === 'ko' || saved === 'en') return saved;
    }
  } catch {
    // Headless or sandboxed environment
  }
  return 'en';
}

let currentLang = detectInitialLang();
const listeners = new Set();

export function getLang() {
  return currentLang;
}

export function isKo() {
  return currentLang === 'ko';
}

export function t(enText, koText) {
  return currentLang === 'ko' ? koText : enText;
}

export function setLang(nextLang) {
  const normalized = nextLang === 'ko' ? 'ko' : 'en';
  currentLang = normalized;
  try {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = normalized;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('symgeo_lang', normalized);
    }
  } catch {
    // Ignore storage restrictions
  }
  applyDomI18n();
  for (const fn of listeners) {
    try {
      fn(normalized);
    } catch {
      // Ignore listener error
    }
  }
  return normalized;
}

export function toggleLang() {
  return setLang(currentLang === 'en' ? 'ko' : 'en');
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const DOM_DICT = {
  page_title: ['SymGeo Studio 2D+3D — Giac(WASM) · Three.js · BVH', 'SymGeo Studio 2D+3D — Giac(WASM) · Three.js · BVH'],
  brand_title: ['SymGeo Studio 2D+3D (Ctrl+Click: Instructor & API Console)', 'SymGeo Studio 2D+3D (Ctrl+클릭: 교사용 관제·API 콘솔)'],
  engine_loading: ['Loading Giac CAS...', 'Giac CAS 준비 중...'],
  aria_vmode: ['Switch dimension view', '차원 뷰 전환'],
  vmode_2d: ['2D Plane', '2D 평면'],
  vmode_split: ['2D+3D Split', '2D+3D 연동'],
  vmode_3d: ['3D Space', '3D 공간'],
  aria_scenarios: ['Select mathematical preset', '탐구 주제 선택'],
  prev_scen_title: ['Previous preset', '이전 탐구'],
  next_scen_title: ['Next preset', '다음 탐구'],
  scen_s1: ['① 2D Surd Roots', '① 2D 무리수교점'],
  scen_s2: ['② 2D Extrema & Int', '② 2D 극점·정적분'],
  scen_s3: ['③ 2D Parity Check', '③ 2D 변곡점반례'],
  scen_s4: ['④ 2D Weierstrass', '④ 2D 바이어슈트라스'],
  scen_s5: ['⑤ 3D Sphere Slice', '⑤ 3D 구·평면교원'],
  scen_s6: ['⑥ 3D Conic Slice', '⑥ 3D 원뿔곡선단면'],
  scen_s7: ['⑦ 2D↔3D Revolution', '⑦ 2D↔3D 회전체·구분구적'],
  scen_s8: ['⑧ 3D Saddle & CSG', '⑧ 3D 안장면·CSG·GLB'],
  scen_s9: ['⑨ Frenet & Curvature', '⑨ 미분기하 프레네틀·곡률'],
  scen_s10: ['⑩ 3D Matrix & Jordan', '⑩ 선형대수 3D변환·조르당'],
  scen_s11: ['⑪ Curl/Div & ODE', '⑪ 벡터장(Curl/Div)·미분방정식'],
  lang_btn: ['🌐 한국어', '🌐 English'],
  lang_btn_title: ['Switch interface language to Korean', '인터페이스 언어를 영어로 전환'],
  mute_title: ['Toggle interaction sound (Classroom default: Muted)', '조작 효과음 켜기/끄기 (교실 기본값: 음소거)'],
  pres_btn: ['A+ Zoom', '가+ 확대'],
  pres_title: ['Enlarge equations and labels for classroom display', '전자칠판 발표용 수식·글씨 확대'],
  fs_btn: ['⛶ Fullscreen', '⛶ 전체화면'],
  fs_title: ['Toggle fullscreen (F11)', '전체화면 전환 (F11)'],

  aria_rail: ['Switch workspace pane', '도구 모음 전환'],
  rail_algebra: ['Algebra', '대수'],
  rail_tools: ['Tools', '도구'],
  rail_table: ['Table', '수치표'],
  rail_tutor: ['Guide', '탐구튜터'],
  rail_kbd: ['Keypad', '입력기'],
  rail_kbd_title: ['Toggle bottom virtual math keypad', '하단 수식 입력기 열기/닫기'],

  math_placeholder: [
    'Enter 2D/3D expression (e.g., f(x)=x^2-2, z=x^2-y^2, x^2+y^2+z^2=9)',
    '2D·3D 수식 입력 (예: f(x)=x^2-2, z=x^2-y^2, x^2+y^2+z^2=9)'
  ],
  add_expr_btn: ['Enter', '입력'],
  preview_expr: ['Expr', '수식'],

  tools_cat_2d: ['2D Planar Construction & Calculus Tools', '2D 평면 작도 · 미적분 도구'],
  tool_move_name: ['Move & Inspect', '이동 · 탐색'],
  tool_move_desc: ['Pan viewport & inspect points', '좌표평면 이동 및 점 확인'],
  tool_sketch_name: ['Freehand Sketch', '스케치 작도'],
  tool_sketch_desc: ['Draw circle, line, or parabola', '손으로 원·직선·포물선 그리기'],
  tool_inter_name: ['2D Intersections', '2D 교점 찾기'],
  tool_inter_desc: ['Click two curves → exact surds', '두 곡선 클릭 → 무리수·분수 해'],
  tool_spec_name: ['Extrema & Inflections', '극점 · 변곡점'],
  tool_spec_desc: ['Click curve → roots, extrema, parity', '곡선 클릭 → 극값·변곡점·영점'],
  tool_tan_name: ['Exact Tangent', '접선 작도'],
  tool_tan_desc: ['Click point on curve (magnetic snap)', '곡선 위 점 클릭 (자석 스냅)'],
  tool_int_name: ['Definite Integral', '정적분 넓이'],
  tool_int_desc: ['Click interval [a, b] on curve', '곡선 위 구간 [a, b] 두 번 클릭'],

  tools_cat_slice3d: ['3D Plane Cross-Section (Giac Symbolic + BVH)', '3D 평면 단면 교선 대수 계산 (Giac + BVH)'],
  aria_pl3d: ['Cutting plane', '절단 평면'],
  aria_surf3d: ['Target 3D surface or quadric', '3D 곡면 또는 도형'],
  slice3d_run_btn: ['Compute Exact Section Equation, Radius & Area', '단면 방정식·반지름·넓이 대수 계산'],

  tools_cat_rev: ['2D Curve → 3D Solid of Revolution & Riemann Discs', '2D 함수 → 3D 회전체 · 구분구적법 생성'],
  aria_rev_fn: ['2D function to revolve', '회전시킬 2D 함수'],
  rev_a_ph: ['Start a', '시작 a'],
  rev_b_ph: ['End b', '끝 b'],
  rev_run_btn: ['Revolve 3D Solid', '3D 회전체 생성'],

  tools_cat_csg: ['3D Constructive Solid Geometry (CSG Booleans & GLB)', '3D 입체 합치기 · 빼기 (CSG 부울 연산 & GLB 출력)'],
  csg_sub_btn: ['Sphere − Cylinder', '구 − 원기둥'],
  csg_uni_btn: ['Box ∪ Sphere', '정육면체 ∪ 구'],
  csg_int_btn: ['Sphere ∩ Box', '구 ∩ 정육면체'],
  tool_glb_btn: ['📦 Export .GLB (PBR Color)', '📦 .GLB 내보내기 (색상·재질 포함)'],

  tools_cat_quick2d: ['Quick 2D Symbolic Intersection & Definite Integral', '2D 연립 교점 / 정적분 빠른 실행'],
  aria_qi_a: ['First 2D curve', '첫 번째 곡선'],
  aria_qi_b: ['Second 2D curve', '두 번째 곡선'],
  qi_run_btn: ['Solve Exact 2D Intersections', '2D 대수적 교점 구하기'],
  aria_int_fn: ['Integrand function', '적분 함수'],
  int_run_btn: ['∫ Area', '∫ 넓이'],

  tbl_range_lbl: ['Range:', '구간:'],
  tbl_step_lbl: ['Step:', '간격:'],
  tbl_build_btn: ['Update Table', '표 갱신'],

  tutor_header_html: [
    'Ask a mathematical question or paste a screenshot with <strong>Ctrl+V</strong>. The guide <strong>constructs exact 2D/3D intersections, cross-sections, solids of revolution, and tangent planes</strong> directly in the viewport.',
    '질문을 입력하거나 캡처 이미지를 <strong>Ctrl+V</strong>로 붙여넣으세요. <strong>2D·3D 좌표공간에 교점·단면·회전체·접평면을 직접 작도</strong>하며 탐구를 돕습니다.'
  ],
  tutor_chip_s5: ['3D Sphere–Plane Slice', '3D 구·평면 단면'],
  tutor_chip_s6: ['3D Conic Sections', '3D 원뿔곡선 절단'],
  tutor_chip_s7: ['3D Solid of Revolution', '3D 회전체·구분구적'],
  tutor_chip_s1: ['2D Exact Surd Roots', '2D 무리수 교점'],
  tutor_chip_s3: ['Why x⁴ Is Not an Inflection', 'x⁴ 반례 질문'],
  paste_thumb_alt: ['Attached screenshot', '첨부된 캡처'],
  paste_attached_lbl: ['Screenshot attached', '캡처 이미지 첨부됨'],
  tutor_placeholder: [
    'Ask a 2D/3D inquiry question or construction request (Ctrl+V image supported)',
    '2D·3D 탐구 질문 또는 작도 요청 (Ctrl+V 이미지 가능)'
  ],
  tutor_send_btn: ['Ask', '질문'],

  splitter_title: ['Drag horizontally to resize panels', '좌우로 드래그하여 창 비율을 조절합니다'],
  collapse_title: ['Collapse / expand left panel', '왼쪽 창 접기/펼치기'],

  qtool_move: ['✋ Move', '✋ 이동'],
  qtool_inter: ['✕ Intersect', '✕ 교점'],
  qtool_spec: ['★ Extrema·Inflect', '★ 극점·변곡점'],
  qtool_tan: ['╱ Tangent', '╱ 접선'],
  qtool_int: ['∫ Area', '∫ 넓이'],
  qtool_sketch: ['✍ Sketch', '✍ 스케치'],

  zoom_in_title: ['Zoom in', '확대'],
  zoom_out_title: ['Zoom out', '축소'],
  reset_2d_btn: ['Origin', '원점'],
  reset_2d_title: ['Reset to origin', '원점 복귀'],
  grid_2d_btn: ['Grid', '격자'],
  grid_2d_title: ['Toggle coordinate grid', '격자 표시 전환'],
  dec_2d_btn: ['Approx', '근사'],
  dec_2d_title: ['Toggle decimal approximations alongside exact badges', '근삿값 병기 전환'],

  cutaway_btn: ['✂ Cutaway', '✂ 단면 잘라보기'],
  cutaway_title: ['Clip solid above cutting plane to inspect internal cross-section', '절단 평면 위쪽 입체를 잘라내어 단면 내부를 직접 관찰합니다'],
  rotate3d_btn: ['↻ Orbit', '↻ 회전'],
  rotate3d_title: ['Auto-rotate 3D scene', '3D 공간 자동 회전'],
  xyplane_btn: ['xy Plane', 'xy 평면'],
  xyplane_title: ['Toggle xy reference grid plane', 'xy 기준 평면 격자 표시'],
  reset3d_btn: ['Reset View', '시점 복귀'],
  reset3d_title: ['Reset 3D camera orientation', '3D 기본 카메라 각도로 복귀'],
  glb3d_btn: ['📦 Save .GLB', '📦 .GLB 저장'],
  glb3d_title: ['Export binary .glb with PBR colors and materials', '색상과 재질이 포함된 표준 3D 파일(.glb)로 저장 (파워포인트·로블록스 호환)'],
  stl3d_title: ['Export binary .stl mesh for 3D printing', '3D 프린터 출력용 .stl 저장'],

  vkbd_fab: ['⌨ Math Keypad', '⌨ 수식 입력기'],
  vkbd_fab_title: ['Open virtual symbolic math keypad', '울프람알파·지오지브라 스타일 수식 입력기 열기'],
  vkbd_tab_basic: ['123 · 2D/3D Basic', '123 · 2D/3D 기호'],
  vkbd_tab_funcs: ['f(x) · Calculus', 'f(x) · 초월·미적분'],
  vkbd_tab_cas: ['CAS · Algebra', 'CAS · 대수명령'],
  vkbd_tab_univ: ['Univ. STEM (DiffG·LinAlg·ODE)', '대학수학 (미기·선대·미방)'],
  vkbd_close_title: ['Close keypad', '입력기 닫기'],
  vkbd_frac_title: ['Fraction a/b', '분수'],
  vkbd_slider: ['Slider', '슬라이더'],
  vkbd_surf3d: ['3D Surf', '3D곡면'],
  vkbd_sphere3d: ['3D Sphere', '3D구'],
  vkbd_enter: ['Enter', '입력'],
  vkbd_cas_factor: ['Factor factor( )', '인수분해 factor( )'],
  vkbd_cas_expand: ['Expand expand( )', '식 전개 expand( )'],
  vkbd_cas_canon: ['Canonical Form', '완전제곱 표준형'],
  vkbd_cas_partfrac: ['Partial Frac', '부분분수 분해'],
  vkbd_cas_solve: ['Solve solve( )', '방정식 해 solve( )'],
  vkbd_cas_simplify: ['Simplify simplify( )', '식 간단히 simplify( )'],
  vkbd_cas_extrema: ['Extrema extrema( )', '극값 계산 extrema( )'],
  vkbd_cas_taylor: ['Taylor Series', '테일러 급수 전개'],
  vkbd_u_curve: ['Space Curve · Frenet', '공간곡선·프레네틀'],
  vkbd_u_mat: ['3D Linear Matrix', '3D 선형변환 행렬'],
  vkbd_u_vf: ['3D Vector Field (Curl/Div)', '3D 벡터장(Curl/Div)'],
  vkbd_u_ode: ['Symbolic ODE desolve', '상미분방정식 desolve'],
  vkbd_u_jordan: ['Jordan Form jordan', '조르당 표준형 jordan'],
  vkbd_u_laplace: ['Laplace Transform', '라플라스 변환'],
  vkbd_u_residue: ['Complex Residue', '복소 유수 residue'],
  vkbd_u_gbasis: ['Gröbner Basis', '그뢰브너 기저'],

  adm_title: ['Instructor Live Monitor & Open API Console', '교사용 실시간 관제 & 개방형 API 콘솔'],
  adm_tab_dash: ['Live Classroom', '학급 실시간 현황'],
  adm_tab_log_prefix: ['Open API · LRS Log', 'Open API · LRS 로그'],
  adm_tab_lic: ['GPL-3.0 · 3D Licenses', 'GPL-3.0 · 3D 라이선스 명세'],
  adm_close: ['Close ✕', '닫기 ✕'],
  adm_privacy_html: [
    'Collects only <strong>pseudonymous classroom aliases</strong> with zero student PII. (Access: <code>?mode=admin</code> or <code>Ctrl+Click</code> brand logo)',
    '학교운영위원회 개인정보 보호 기준에 따라 실명 대신 <strong>학급 가상 코드네임</strong>만 수집합니다. (접근법: <code>?mode=admin</code> 또는 로고 <code>Ctrl+클릭</code>)'
  ],
  adm_stream_lbl_html: [
    '<code>window.SymGeoCAS</code> live 2D/3D interaction telemetry stream',
    '<code>window.SymGeoCAS</code> 실시간 2D·3D 조작 이벤트 스트림'
  ],
  adm_copy_btn: ['Copy JSON', 'JSON 복사'],
  adm_clear_btn: ['Clear Log', '로그 비우기'],
  adm_lic_heading: ['Open-Source License Architecture', '오픈소스 라이선스 구성 안내'],
  adm_lic_1_html: [
    '<strong>Giac/Xcas WebAssembly (<code>@basthon/xcas-wasm</code>):</strong> <code>GPL-3.0-or-later</code> (exact symbolic algebra, plane conic reduction, and solid of revolution volume).',
    '<strong>Giac/Xcas WebAssembly (<code>@basthon/xcas-wasm</code>):</strong> <code>GPL-3.0-or-later</code> (대수 연산, 단면 방정식, 회전체 부피 정확해 계산).'
  ],
  adm_lic_2_html: [
    '<strong>Three.js + three-mesh-bvh + three-bvh-csg + KaTeX:</strong> <code>MIT License</code> (cached BVH plane slicing, CSG Booleans, 2-pass translucent rendering, and <code>.glb/.stl</code> export).',
    '<strong>Three.js + three-mesh-bvh + three-bvh-csg + KaTeX:</strong> <code>MIT License</code> (실시간 BVH 단면 절단, CSG 불리언 연산, 2-Pass 반투명 렌더링, <code>.glb/.stl</code> 내보내기).'
  ],
  adm_lic_3_html: [
    '<strong>100% OSI-Approved Open Stack:</strong> The complete UI, math typesetting, 2D/3D spatial kernels, and headless verification SDK are distributed under <code>GPL-3.0-or-later</code> and <code>MIT</code>.',
    '<strong>전체 오픈소스 배포:</strong> UI, 수식 조판, 2D/3D 기하 커널 및 검증 SDK 전체가 OSI 승인 오픈소스 라이선스(<code>GPL-3.0-or-later</code> 및 <code>MIT</code>)로 제공됩니다.'
  ]
};

export function applyDomI18n(root = typeof document !== 'undefined' ? document : null) {
  if (!root || !root.querySelectorAll) return;
  const idx = currentLang === 'ko' ? 1 : 0;

  if (typeof document !== 'undefined') {
    document.documentElement.lang = currentLang;
    document.title = DOM_DICT.page_title[idx];
  }

  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const pair = DOM_DICT[el.dataset.i18n];
    if (pair) el.textContent = pair[idx];
  });

  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const pair = DOM_DICT[el.dataset.i18nHtml];
    if (pair) el.innerHTML = pair[idx];
  });

  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const pair = DOM_DICT[el.dataset.i18nPlaceholder];
    if (pair) el.setAttribute('placeholder', pair[idx]);
  });

  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const pair = DOM_DICT[el.dataset.i18nTitle];
    if (pair) el.setAttribute('title', pair[idx]);
  });

  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const pair = DOM_DICT[el.dataset.i18nAria];
    if (pair) el.setAttribute('aria-label', pair[idx]);
  });
}
