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
- [x] M0 프로젝트 세팅 — 빈 씬·PWA, GitHub → Cloudflare Workers 자동 배포 (docs/DEPLOY.md)
- [x] M1 그레이박스 이동 — 성 마당 `src/data/courtyard.json`, 격자 A* `src/systems/navigation/`
- [x] M2 대화·음성 — 플로라 톡 → 말풍선·TTS·어절 강조, 문장별 끊어 읽기·기분(mood) 억양, 대사 `src/data/dialogues.json`
- [x] M3 부탁 시스템 — 토리 "빨간 꽃 세 송이"(`src/data/quests.json`), 수 세기·색 힌트(한글+영어), 선물·별사탕(`src/systems/quests.ts`, `rewards.ts`)
- [x] M4 옷 꾸미기 — 드레스룸(5부위·색 8개, 한글+영어 읽기), 갈아입는 공주 모델 `princess-model.ts`, 옷 데이터 `src/data/wardrobe.json`·`items.json`. 자동 저장(IndexedDB) `src/systems/game-state.ts` — 부탁 진행·주운 꽃·별사탕·옷 유지
- [x] M5 성 꾸미기 — 마당 성 문 톡 → 침실(텅 빈 방). 서랍 카드 위로 끌어 놓기, 가구 톡 → 돌리기·색 8개·치우기, 끌어서 옮기기. 배치 로직 `src/systems/decor.ts`, 방·처음 가구 `src/data/rooms.json`, 가구 `items.json`(kind: furniture). 서랍 그림은 3D 모델에서 자동 생성
- [x] M6 지도·이동 연출 — 지도 버튼 → 왕국 지도(`src/data/world.json`, 바다·눈·하늘은 잠자는 왕국), 열기구 비행 연출 + 느릴 때 별 로딩(`src/scenes/map/`). 꽃 왕국 그레이박스 `src/data/flower-kingdom.json`(집·꽃밭·고고·도치, 갈 때 따로 불러옴). 장소별 색 테마, 부탁 물건은 `quests.json` location에만 나타남
- [ ] M7 아트 교체
  - [x] A단계(코드만): 툰 셰이딩 `src/core/toon.ts`(모든 재질은 `toonMaterial()`), 선택 외곽선 `addOutline()`, 파스텔 테마·하늘 그라데이션·탑 지붕, 치비 비율(머리 1.3배)·큰 눈, 금색 반짝이 `src/core/sparkles.ts`
  - [x] B단계 준비: uv(winget) 설치, 애드온 `blender_mcp.py`(커뮤니티 mcp-for-blender, MIT) → `%APPDATA%\Blender Foundation\Blender\5.3\scripts\addons`, `.mcp.json`(이 PC 전용, git 제외)에 `blender` 서버(텔레메트리 끔). Blender에서 애드온 켜고 N패널 "MCP for Blender" → Start MCP Server(포트 9876) 후 사용. Blender MCP는 Blender 안에서 파이썬을 실행하므로 작업 전 .blend 저장
  - [x] 공주 모델: `scripts/blender/build_princess.py`(다시 만들 수 있는 스크립트) → `art-source/princess.blend` → `src/assets/models/princess.glb`(배포 때 해시 붙음, 약 0.5MB). 물체 이름 = 옷 id, 재질 tint·tint_light·tint_wing만 색 변경. 게임은 `princess-glb.ts`로 불러오고 실패하면 도형 공주
  - [x] 친구 모델: `scripts/blender/build_friends.py`(공주 부위 재사용) → `src/assets/models/friends.glb`(물체 이름 = characters.json id: flora·tori·gogo·dochi, 색 고정). 게임은 `friends-glb.ts`, 모델에 없는 친구는 도형으로
  - [x] 화풍 변경 → 부드러운 입체: `src/core/toon.ts`의 `STYLE`(기본 glossy, `?style=toon` 비교) — `toonMaterial(params, role)`이 물리 재질(skin·hair·cloth·gem·plain, 반짝이 가루·머리 그라데이션 셰이더), 외곽선 끔. `src/core/look.ts` 주변 반사 + 빛번짐(`?bloom=0`으로 끔), 그림 눈 `anime-eyes.ts`(characters.json `eyeColor`), 톤 매핑 Neutral
  - [x] 그래픽 고도화 (`docs/GRAPHICS-PLAN.md`, 브랜치 `graphics-pilot`): 공주·친구 뼈대(SkinnedMesh, 같은 뼈 이름) + 동작 클립 idle·walk·hop·wave(`scripts/blender/anim_princess.py`) → `princess-animator.ts`(속도로 섞기, 고개 돌려 보기, 기울기, 뒷머리·치마·귀·꼬리 스프링, 눈 깜빡임). 친구는 `friend-<id>.glb` 파일 하나씩. 이동 가속·감속(`walker.ts`). 배경: `build_castle_env.py`·`build_flower_env.py` → `env-*.glb`(재질별로 합침, 버텍스 컬러 AO, 물 셰이더, 바람 흔들림), 배치 JSON `env` 칸 — 충돌은 그대로 obstacles. 카메라: 가는 방향 앞쪽 보기, 대화 때 옆에서 두 얼굴 보기. 효과 `ambient-fx.ts`(발걸음·착지 먼지, 꽃잎, 구름). 방: 마루 결·징두리·몰딩. 품질 `quality.ts`(basic/high, `?quality=`)
  - [ ] 남은 B단계: 나무·집·가구는 CC0 에셋(Kenney·Quaternius) + `CREDITS.md`. 모델은 `src/assets/models/`에 (public/assets는 1년 캐시라 갱신 안 됨)
- [x] M8 콘텐츠 채우기 (작은 단계로)
  - [x] M8-1 부탁 늘리기: 친구별 연속 부탁(quests.json 순서·`requires`), 배달 부탁(`goal.type: deliver`, 받는 친구가 선물). 새 부탁: 토리 노란 꽃 4, 플로라 초대장→고고, 도치 딸기 5(블루베리 힌트), 고고 넘어진 화분 3(`onCollect: stand`). 부탁은 `giver`로 찾음(배치의 quest 칸 없음)
  - [x] 친구 돌아다니기: 배치 npcs의 `wander`(집 둘레 반지름 m, 0·없음=제자리). 쉬기↔산책 반복, 공주가 2.2m 안에 오거나 다가오는 중·말하는 중엔 멈춰서 공주를 봄. 돌아다니는 친구는 길찾기 격자에서 막지 않고 1.75m 안에 오면 말 걸기(`src/systems/navigation/wander.ts`)
  - [x] M8-2 삐삐(노란 새, 꽃 왕국, Blender 모델) + "우는 삐삐 위로하기": `goal.type: talk`, `giverMood: sad`(해결 전 눈물). 대사 줄에 `choices`(그림 카드 고르기: 틀리면 힌트 후 다시, `reply` 대사) — 기분 4개(기쁨·슬픔·화남·무서움) → 위로 3개. 대화 중엔 장면을 위로 올려 친구 얼굴이 보이게
  - [x] M8-3 성 방 3개(침실·드레스룸·파티홀, `rooms.json`) — 위 방 고르기 탭, 가구 서랍은 모든 방이 함께 씀(`RoomLayout.share`). 색칠 버튼 → 벽지·바닥·커튼 색(palette를 연하게, 저장 `roomStyles`). 초대 버튼 → 친구 고르기 → 방에 톡 나타나 칭찬(가구 개수별 `praise` → `invite-*` 대사, speaker `guest`·`{room}` 바꿔 넣기) 후 사라짐 (`src/ui/room-ui.ts`). 드레스룸 왼쪽 벽 거울(`rooms.json` mirror) 톡 → 옷 갈아입기, 다 입으면 드레스룸으로. 세로 화면이면 마당 카메라가 조금 뒤로(`follow-camera.ts`)
  - [x] 할 때마다 달라지는 부탁: 친구의 이야기 부탁(quests.json)을 다 끝내면, 말 걸 때마다 `src/data/random-quests.json` 템플릿(꽃 6색·딸기/블루베리·넘어진 화분·편지/선물 상자/쿠키 배달)으로 물건·개수·자리·이유·받는 친구를 무작위로 정함(`src/systems/random-quests.ts`, id `rq:`) + 기분 알아맞히기(`type: talk`, 상황 10개 → `rq-feel-<mood>`, 고르기 대답도 이름 채움 `replyLines`). 이야기 부탁도 `vary`(물건 후보·개수 범위)로 처음 받을 때 색·개수·자리를 굴림(`rollStoryQuest`), 대사는 `{item}`·`{count}`·`{counting}`·`{en}` 빈칸. 바로 전과 다른 물건, 하는 부탁이 있으면 `rq-busy`. speaker giver·receiver, `{item|을}` 조사 자동. 저장 `randomQuests`(굴린 이야기 부탁 포함)
  - [x] M8-4 아이템 30개+ (새 가구·옷) + 별사탕 가게
    - [x] 새 가구 11개(소파·화장대·피아노·꽃병·풍선·케이크·인형의 집·어항·별 조명·쿠션·별 러그, 도형 `furniture-meshes.ts`) → 가구 21 + 옷 20 = 41
    - [x] 별사탕 가게: 꽃 왕국 분홍 집 문(target `shop`, 문 위 큰 별 간판) → `src/ui/shop-panel.ts`. 진열대(값=별 그림 n개, 다섯 개씩 한 줄) → 계산대에서 큰 별사탕 버튼을 하나씩 톡해 "하나! 둘!" 세어서 내기. 모자라면 가진 만큼 연한 별 + "n개 더 있으면" (빨간 표시 없음). 값 `src/data/shop.json`(1~10), 로직 `src/systems/shop.ts`. 지갑은 가구를 여러 개 쌓음(`Wallet.add`, 옷은 하나)
    - [x] 새 옷 6벌(단발머리·포니테일·꽃 화관·리본 드레스·토끼 슬리퍼·하트 가방): `build_princess.py`에 추가 → princess.glb(약 0.8MB), 아이콘 `icons.ts`, 도형 공주 `princess-model.ts`. 처음엔 없고 가게에서 삼(값 4~8). 재질 `leaf`(고정 초록) 추가
  - [x] M8-5 펫 고르기·돌보기: 처음 켜면 유니콘·고양이·강아지 카드(한글+영어) → 이름 카드 3개 중 고르기 (`src/data/pets.json`, 로직 `src/systems/pet.ts`, 저장 `pet`). 펫은 공주 옆에서 졸졸 따라다님(마당·꽃 왕국, 길찾기 격자 사용, 막지 않음). 시간이 지나면 머리 위에 밥그릇(배고픔 3시간)·거품(꼬질꼬질 6시간) 그림 → 펫 톡 → 밥(간식 2~5개를 하나씩 톡, "하나! 둘!")·목욕(얼룩을 문지르면 거품이 퐁) 화면 `src/ui/pet-panel.ts`, 필요할 때 해 주면 별사탕 1. 할 일이 없을 때 톡하면 힌트: 지금 부탁의 물건·친구 쪽으로 앞장서 달려가 기다림(`guidePet`), 다른 장소 일이면 지도 안내. 대사 `pet-*`(speaker `pet` = 아이가 붙인 이름, `registerCharacter`). 모델 `scripts/blender/build_pets.py` → `pet-<id>.glb`(한 마리 약 4천 삼각형, 동작 클립 없이 `pet-animator.ts`가 네 발 걷기·꼬리·귀·폴짝), 고른 펫만 불러옴. 펫 그림은 3D 모델을 찍어 만듦(`pet-thumbs.ts`)

- [x] M9 부모 설정·마감 (작은 단계로) — 첫 버전(MVP) 완성
  - [x] 태블릿 대응: 한국어 음성을 이름으로 지정(`pickVoiceFrom`), 톡 넉넉하게(28px·1.2초), 느리면 자동으로 빛번짐 끄기→해상도 낮추기(`PerfGovernor`, 단계 저장 `perfLevel`), 점검 화면 `?check=1`(fps·음성 목록·목소리 시험), 배포 직후 게임 파일 404면 한 번 다시 불러오기(index.html·sw.js)
  - [x] M9-1 부모 설정: 마당 오른쪽 아래 작은 톱니 → 어른 확인(6~9단 곱셈, 숫자판) → 말 빠르기(느리게·보통·빠르게, `Speaker.rateScale`)·그래픽 품질(자동·가볍게·고품질)·목소리 확인·저장 초기화(두 번 확인, `GameState.reset`). 설정은 localStorage `settings` (`src/core/settings.ts`, `src/ui/parent-panel.ts`)
  - [x] M9-2 플레이 시간: 부모 설정에서 정하지 않음·10·15·20·30분(`settings.playMinutes`, 기본 정하지 않음). 화면이 켜진 동안만 셈(`src/systems/playtime.ts`). 2분 전 펫이 예고(`bedtime-soon-pet`, 예고 뒤 최소 1분), 시간이 되면 하던 대화가 끝나길 기다렸다가 잠자리 장면(`src/ui/bedtime.ts`: 밤하늘·달·침대에서 눈 감은 공주·펫 — 3D 모델을 눈 감겨 찍은 그림, 대사 `bedtime`). 자는 동안 3D는 그리지 않음. 1시간 안에 다시 켜도 자는 화면(`sleepUntil`). 어른만 톱니 → 곱셈 → "10분 더·15분 더·오늘은 그만"
  - [x] M9-3 사운드: 음원 파일 없이 Web Audio 로 직접 만듦(`src/core/sound.ts`, 용량 0). 효과음 `sfx('tap'|'pop'|'sparkle'|'count'|'reward'|'coin'|'whoosh'|'happy'|'nom'|'bubble'|'page'|'dress')` — 밝은 소리만, 셀 때 한 음씩 올라감. 배경 음악: 오르골 소리로 장소마다(성·꽃 왕국·방·가게·자장가) 화음 진행 위 멜로디를 계속 지어 연주(`musicStep`), 대사 읽는 동안 작게. 첫 터치에 켜짐, 화면 내리면 멈춤. 부모 설정에서 효과음·음악 끄기. 나중에 CC0 음원으로 바꿔도 됨
  - [x] M9-4 실기기 테스트 마감: 태블릿 크기 화면 점검(문제 없음), 그림 길게 누르기 메뉴·당겨서 새로고침 막음, 체크리스트 `docs/TABLET-TEST.md`. 실기기 결과 반영: 사람 같은 자연스러운 음성(Natural·Online·Google)을 먼저 고름(`pickVoiceFrom` 점수), 고고는 남자 목소리(`characters.json` voice.gender), 온라인 음성이 실패하면 기기 음성으로, 자연스러운 음성은 높낮이 변화를 절반만. 아이 반응: 부탁 해결을 즐거워함, 그래픽이 아쉬움

- [x] 그래픽 2차 (`docs/GRAPHICS-V2.md`, 무료 방법)
  - [x] G1 색감·빛: 셰이더 표면 무늬(`surface-patterns.ts`, 배경 재질 이름으로), 따뜻한 햇빛·약한 하늘빛, 색 보정(CustomToneMapping), 땅·잎 색 진하게(TINT), 발밑 그림자(`createContactShadow`), 풀 덤불(`grass-tufts.ts`), 화면 가장자리 어둡게, 불러오기 별
  - [x] G2 표정·연출: 그림 눈·입 표정 `face.ts`(대사 mood → 얼굴, 말할 때 입 뻐끔, 볼 발그레, 고개 갸웃·숙임), 몸짓 박수·끄덕·빙글(`playGesture`, 뼈를 코드로), 부탁 완료 때 공주 빙글·친구 폴짝 + 선물 화면 색종이(CSS). 대사 → 얼굴은 `DialogueBox.onSpeak` → `scene.setFace`
  - [x] G3 배경 에셋: Kenney Nature Kit(CC0) 나무·꽃·버섯·그루터기·바위·울타리 → `kenney()`(build_castle_env.py)가 파스텔로 다시 칠하고 잎을 동글게 다듬어 배경 glb 에 합침. 원본 `art-source/kenney/`, 출처 `public/assets/CREDITS.md`. Blender 명령줄(`-b`)로도 다시 만들 수 있음
  - [x] 보기 조절: 돋보기 +/−·두 손가락·휠로 가까이·멀리, 마당 끌기로 둘러보기, 처음 보던 대로 버튼 (`follow-camera.ts`, 마당·꽃 왕국)
  - [x] 대화창 얼굴 사진: 말하는 캐릭터를 기분 표정으로 찍어 말풍선 앞에 (`src/ui/portraits.ts`)
  - [x] G4 캐릭터 다듬기: 머리카락 가닥 `lock()`(앞머리·옆머리·뒷머리 가닥·정수리 한 가닥), 주름 치마 `skirt()`·밑단 프릴 `ruffle()`·퍼프 소매, 펫 매끈하게·유니콘 무지개 갈기 가닥·고양이 볼 털. 명령줄 다시 만들기 `scripts/blender/run_chars.py`·`run_env.py` (`blender -b --factory-startup --python ... -- princess src/assets/models`)

- [ ] M10 놀이 늘리기 (아이 반응: 부탁이 단순해서 금방 질림 → 하는 동작을 다양하게)
  - [x] 미니게임 1차: 놀이 부탁 `goal.type: play`(game cake·garden, 대사 뒤 미니게임 → 끝까지 하면 해결, 닫았다 다시 말 걸면 이어 하기, `QuestBook.finishPlay`). 도치 케이크 꾸미기(과일을 끌거나 톡해서 올리며 세기)·고고 꽃밭 물 주기(물뿌리개를 새싹 위로 끌거나 새싹 톡 → 꽃이 활짝). 이야기 부탁 `dochi-cake`·`gogo-garden` + 무작위 템플릿 cake·garden. 카드 짝 맞추기(마당 HUD 카드 버튼, 부탁과 따로): 짝 4→6, 판마다 친구 얼굴·그림 번갈아, 맞히면 이름 한글·영어, 다 맞히면 별사탕 1. 화면 `src/ui/minigame-panel.ts`, 로직 `src/systems/minigames.ts`, 글 `src/data/minigames.json`
  - [x] 숨바꼭질: 부탁 `goal.type: seek` — 대사 뒤 공주가 눈 가리고 열까지 세는 화면(`src/ui/seek-countdown.ts`), 그동안 친구가 장소의 `hideSpots`(courtyard.json·flower-kingdom.json, 나무·집·분수 뒤) 중 공주에게서 먼 곳에 숨음. 숨은 친구는 가끔 빼꼼(끄덕·빙글 + 웃음소리), 35초 지나면 머리 위 ♥, 2m 안에 오거나 톡하면 "찾았다!" → 폴짝 + 선물. 플로라 이야기 부탁 `flora-seek` + 무작위 템플릿 seek(모든 친구), 펫 힌트도 숨은 친구에게 안내
  - [x] 스티커 앨범(모으는 큰 목표): 스티커 23개 `src/data/stickers.json`(셈 이름 counter가 at 번이 되면 붙음), 로직 `src/systems/stickers.ts`(StickerBook, 저장 `stickers`, 스티커 전 저장이면 해결한 부탁·별사탕·가구·여행만큼 채워 줌). 셈은 부탁·말 걸기·꽃·딸기·화분·배달·기분·케이크·꽃밭·카드·숨바꼭질·밥·목욕·옷·가구·초대·쇼핑·꽃 왕국 여행·별사탕에서 `state.stickers.record()`. HUD 앨범 버튼(새 스티커 점) → 앨범 화면 `src/ui/sticker-album.ts`(붙은 스티커 톡 = 이름 한글·영어, 빈 칸 톡 = 얻는 방법 + 얼마나 남았는지 띠), 새 스티커 알림. 그림 `sticker-icons.ts`
  - [x] 바다 왕국 1차: 스티커 8개를 모으면 깨어남(world.json `wakeStickers`, `isAwake`·`stickersToWake`, 지도 섬에 남은 개수, 깨어나면 공주가 알리고 지도 버튼 점). 배치 `src/data/sea-kingdom.json`(모래사장·바다·부두·바위·야자수·모래성·파라솔, hideSpots), 배경 `scripts/blender/build_sea_env.py` → `env-sea-kingdom.glb`(Kenney 야자수·바위, 물 판·거품·젖은 모래, 화면 약 5.7만 삼각형), 바다 음악. 새 친구 파도(민트 거북이, 복숭아 등껍질·선원 모자, `build_friends.py` build_pado → friend-pado.glb). 조개 줍기 아이템 shell-pink·blue·yellow·purple(모양 shell), 이야기 부탁 `pado-shells`(선물 어항) + 무작위 템플릿 shells, 숨바꼭질에도 파도. 스티커 '조개 모으기'
  - [ ] 다음 후보: 인어 친구·바다 놀이(물고기 세기 등)·나비 잡기

## 나중에 할 일
- **사람 같은 음성 (보류, 기기 TTS가 로봇 같다는 피드백)**: 대사를 미리 음성 파일로 만들어 넣는다.
  `npm run voices` 스크립트가 `dialogues.json`을 읽어 `public/assets/voice/`에 mp3 + 단어 타이밍을 생성(바뀐 줄만).
  엔진 후보: edge-tts(무료·가입 없음, 단어 타이밍 제공, 비공식) / Google Cloud TTS 무료 사용량(공식, 카드 등록 필요).
  **캐릭터마다 다른 목소리**를 `characters.json`에 지정. 음성 파일이 없으면 지금의 기기 TTS로 대체.
  목소리 샘플을 여러 개 만들어 사용자가 직접 듣고 고른다.
- **거울 사진 찍기** (GDD 5.1): 드레스룸에서 사진을 찍어 앨범에 저장 — 앨범 기능과 함께.
