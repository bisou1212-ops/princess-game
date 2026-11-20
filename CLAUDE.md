# CLAUDE.md — 로은이의 공주 왕국

7세 여자아이를 위한 공주 롤플레잉 3D 웹게임. 기획은 `docs/GDD.md`가 기준이다. 기능을 구현하기 전에 GDD의 해당 항목을 먼저 읽는다.

## 기술 스택
- Vite + TypeScript + Three.js (WebGL2 기본, WebGPU는 선택)
- 물리가 꼭 필요할 때만 Rapier, 길찾기는 navmesh 또는 단순 그리드
- 음성: Web Speech API (speechSynthesis), ko-KR / en-US
- 저장: localStorage(설정) + IndexedDB(진행 상황)
- 배포: GitHub → Cloudflare Pages 자동 배포, PWA(manifest + service worker)
- 서버(GCP e2-micro)는 MVP에서 사용하지 않음

## 폴더 구조
```
src/
  main.ts          # 진입점
  core/            # 렌더러, 씬 전환, 입력(톡·끌기), 저장, 오디오/TTS
  scenes/          # castle/, flower-kingdom/, map/
  systems/         # quests(부탁), wardrobe(옷), decor(가구), pet, rewards
  ui/              # HUD, 말풍선, 부모 설정
  data/            # 부탁·대사·아이템 JSON (코드와 분리)
public/assets/     # 압축된 .glb(Draco/Meshopt), KTX2 텍스처, 사운드
art-source/        # .blend 원본 (배포 제외)
docs/GDD.md        # 기획서
```

## 개발 원칙
- **대상은 7세**: 조작은 톡·끌기만, 버튼 최소 64px, 실패·벌점·빨간 경고 없음.
- **모든 대사는 글자 + TTS 음성**: 읽는 단어 강조. 대사·부탁·아이템은 `src/data/*.json`에 두고 코드에 하드코딩하지 않는다.
- **모바일 우선 성능**: 중급 안드로이드 태블릿 30fps 이상, 첫 로딩 10MB 이하, 화면 폴리곤 10만 이하, 픽셀 비율 최대 2, 실시간 그림자 최대 1개.
- **아이 안전**: 광고·결제·외부 링크·채팅·개인정보 수집 금지. 부모 설정은 잠금 뒤에.
- **에셋 라이선스**: CC0만 사용, 출처는 `public/assets/CREDITS.md`에 기록.
- **작은 단위로 작업**: 한 번에 기능 하나, GDD 10.1의 마일스톤 순서를 따른다. 끝나면 `npm run build`가 통과하는지 확인한다.

## 명령어
- `npm run dev -- --host` : 같은 와이파이의 태블릿에서 접속해 테스트
- `npm run build` : 프로덕션 빌드
- `npm run test` : Vitest 단위 테스트 (게임 로직)

## 현재 진행
- [ ] M0 프로젝트 세팅 — 로컬 완료(빈 씬·PWA·--host), GitHub → Cloudflare Pages 연결 남음 (docs/DEPLOY.md)
