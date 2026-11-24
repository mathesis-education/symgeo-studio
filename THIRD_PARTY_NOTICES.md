# 오픈소스 라이선스 및 클린룸(Clean-Room) 고지 (`THIRD_PARTY_NOTICES.md`)

본 프로젝트(**SymGeo Studio CAS Studio 2D+3D**)는 아래 오픈소스 소프트웨어의 라이선스 규정을 철저히 준수하며, 외부 상용/비영리 제한 소프트웨어(GeoGebra®, Spirulae CC-NC 셰이더 등)의 독점 소스코드·아이콘·상표를 일절 복제하지 않고 **100% 자체 클린룸(Clean-Room) 설계**로 구현되었습니다.

---

## 1. 포함된 서드파티 오픈소스 구성요소

### ① Giac / Xcas WebAssembly (`@basthon/xcas-wasm`)
* **원저작자**: Bernard Parisse (Institut Fourier, Université Grenoble Alpes) & Romain Casati (Basthon Project)
* **라이선스**: **GNU General Public License v3.0 or later (`GPL-3.0-or-later`)**
* **원본 저장소**: https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac.html / https://forge.apps.education.fr/basthon/xcas-wasm

### ② KaTeX (`katex`)
* **저작권자**: Khan Academy and other contributors
* **라이선스**: **MIT License**
* **원본 저장소**: https://github.com/KaTeX/KaTeX

### ③ Three.js (`three`)
* **저작권자**: Ricardo Cabello (mrdoob) and Three.js authors
* **라이선스**: **MIT License**
* **원본 저장소**: https://github.com/mrdoob/three.js

### ④ three-mesh-bvh & three-bvh-csg
* **저작권자**: Garrett Johnson (gkjohnson)
* **라이선스**: **MIT License**
* **원본 저장소**: https://github.com/gkjohnson/three-mesh-bvh / https://github.com/gkjohnson/three-bvh-csg

---

## 2. 인터페이스 및 3D 메셔 클린룸(Clean-Room) 설계 확인

* 좌측 수식·대수 입력 스트림, 2D/3D 동시 연동 뷰포트, 기하·미적분·단면·CSG 도구 탭, 수치표, 가상 수식 키보드 및 Kuhn 6-사면체 등치면 추출기(`src/marching-cubes.js`)는 전량 자체 작성한 코드 및 자체 제작 벡터(SVG) 아이콘으로 구현되었습니다.
* GeoGebra®의 소스코드(`deployggb.js`, GWT 산출물), 공식 아이콘/이미지 리소스, 비영리(`CC BY-NC-SA`) 문서는 단 1바이트도 포함하지 않습니다.
