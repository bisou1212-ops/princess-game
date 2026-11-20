# 배포 가이드 — GitHub → Cloudflare Pages

## 1. 태블릿에서 개발 버전 보기 (같은 와이파이)

```powershell
npm run dev -- --host
```

터미널에 나오는 `Network: http://172.30.x.x:5173/` 주소를 태블릿 브라우저에 입력.
안 열리면: Windows가 처음 물어볼 때 **개인 네트워크 허용**을 눌렀는지 확인
(놓쳤다면 Windows 보안 → 방화벽 → "앱이 방화벽을 통과하도록 허용"에서 Node.js의 "개인" 체크).
PC와 태블릿이 같은 와이파이(게스트 와이파이 X)인지도 확인.

## 2. GitHub 저장소 연결

### 2-1. GitHub 계정 (처음 한 번)
https://github.com/signup 에서 가입하고 이메일 인증까지 마친다. 이미 있으면 로그인만.

### 2-2. 내 이름·이메일을 git에 등록 (이 PC에서 처음 한 번)
커밋마다 "누가 만들었는지"가 기록된다. 등록하지 않으면 커밋할 때 오류가 난다.

```powershell
git config --global user.name "<내 이름 또는 닉네임>"
git config --global user.email "<GitHub 가입 이메일>"
```

이메일을 저장소에 남기기 싫으면 GitHub → Settings → Emails에서
**Keep my email addresses private**를 켜고, 거기 나오는
`숫자+아이디@users.noreply.github.com` 주소를 대신 쓴다.

### 2-3. GitHub에 빈 저장소 만들기
1. https://github.com/new 접속
2. Repository name: `princess-game`
3. **Private** 선택 (아이 이름이 들어간 기획서가 있으므로 권장)
4. "Add a README", ".gitignore", "license"는 모두 **선택하지 않음** — 빈 저장소여야 첫 push가 충돌 없이 된다
5. **Create repository** → 나오는 화면의 HTTPS 주소(`https://github.com/<아이디>/princess-game.git`)를 복사

### 2-4. 첫 커밋 만들기 (프로젝트 폴더에서)
```powershell
git status
git add .
git commit -m "M0: Vite + TS + Three.js 빈 씬, PWA"
```
`git status` 목록에 `node_modules`·`dist`가 없어야 정상(.gitignore가 제외함).

### 2-5. 저장소 연결 후 올리기
```powershell
git remote add origin https://github.com/<아이디>/princess-game.git
git push -u origin main
```
- 처음 push하면 **Git Credential Manager** 창이 뜬다 → **Sign in with your browser** → 브라우저에서
  GitHub 로그인 후 **Authorize** 누르기. 이후에는 다시 묻지 않는다.
- `-u`는 첫 번째에만. 다음부터는 `git push`만 하면 된다.
- 끝나면 GitHub 저장소 페이지를 새로고침해 파일이 보이는지 확인.

### 2-6. 이후 작업 흐름
```powershell
git add .
git commit -m "무엇을 바꿨는지 한 줄"
git push
```

### 자주 나는 오류
| 메시지 | 원인 / 해결 |
| --- | --- |
| `Please tell me who you are` | 2-2를 안 함 → 이름·이메일 등록 |
| `remote origin already exists` | 이미 연결됨 → `git remote set-url origin <주소>`로 주소만 바꾸기 |
| `rejected ... fetch first` | GitHub에서 README 등을 만들어 둠 → 저장소를 지우고 빈 저장소로 다시 만들기가 가장 간단 |
| `Repository not found` | 주소 오타, 또는 다른 계정으로 로그인됨 → Windows "자격 증명 관리자"에서 github 항목 삭제 후 다시 push |
| `src refspec main does not match` | 커밋이 아직 없음 → 2-4 먼저 |

## 3. Cloudflare Pages 연결 (자동 배포)

1. https://dash.cloudflare.com 가입/로그인 (무료 플랜).
2. 왼쪽 메뉴 **Workers & Pages** → **Create** → **Pages** 탭 → **Connect to Git**.
3. GitHub 계정 연결 → `princess-game` 저장소만 선택해 권한 부여.
4. 빌드 설정:

| 항목 | 값 |
| --- | --- |
| Production branch | `main` |
| Framework preset | `Vite` (없으면 None) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| 환경 변수 (Environment variables) | `NODE_VERSION` = `24` |

5. **Save and Deploy** → 1~2분 뒤 `https://princess-game-xxx.pages.dev` 주소가 생김.
6. 이후로는 `git push`만 하면 자동으로 새 버전이 배포됨.
   main이 아닌 브랜치를 push하면 미리보기 주소가 따로 생김(실험용으로 좋음).

## 4. 태블릿 홈 화면에 설치 (PWA)

- **안드로이드 Chrome**: pages.dev 주소 접속 → 메뉴(⋮) → **홈 화면에 추가 / 앱 설치**
- **iPad Safari**: 공유 버튼 → **홈 화면에 추가**

PWA 설치와 오프라인 동작은 https 주소(pages.dev)에서만 됨 — 와이파이 개발 주소(http)에서는 안 됨.
새 버전을 배포했는데 화면이 옛날 그대로면 앱을 완전히 닫았다가 다시 열기.
