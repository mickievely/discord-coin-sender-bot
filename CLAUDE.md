# discord-coin-sender-bot 작업 지침

Discord 코인 대행 봇. Node.js 22.5+, discord.js 14 (Components V2), SQLite(`node:sqlite`), MEXC API, NICE PASS 본인인증.
사용자와는 **한국어**로 대화한다.

## 구조

- `src/index.js` — 진입점. 클라이언트 생성, 인텐트, 이벤트 라우팅
- `src/config.js` — 모든 환경 변수는 여기서만 읽는다 (`process.env`를 다른 곳에서 직접 쓰지 말 것)
- `src/commands/register.js` — 슬래시 커맨드 정의·등록 (`GUILD_ID` 있으면 길드, 없으면 전역)
- `src/handlers/` — `slash.js`(슬래시), `components.js`(버튼·셀렉트·모달), `verify.js`(PASS 인증)
- `src/services/` — 외부 API: `mexc.js`, `exchange.js`(시세·김프, URL은 `KIMCHI_*`·`USD_KRW_EXCHANGE_URL` 등 env), `fees.js`, `niceApi.js`/`niceParse.js`
- `src/ui/` — `panel.js`(`CHANNEL_PANEL` 채널 자동 게시·60초 갱신), `v2.js`(Components V2 빌더)
- `src/emojis/` — Bootstrap Icons(cdnjs) → PNG → **애플리케이션 이모지**만. 버튼은 `emojiKey`, 유니코드 이모지 금지. 에셋은 `assets/emojis/`
- `src/db/index.js` — SQLite 스키마/쿼리. DB 파일은 `DB/` (cwd 기준)
- `src/lib/auth.js` — 관리자 권한 체크 (`requireAdmin`, `DEFAULT_ADMIN_ID` + `ALLOWED_USER_IDS`)
- `src/state/` — 메모리 내 임시 상태 (진행 중 거래, 인증 세션)

## 실행 / 테스트

- 운영: `npm start` (루트 `.env`)
- 테스트: `node test/run.js` — `test/.env`를 먼저 읽고, 빠진 값은 루트 `.env`에서 채운다
- 변경 후에는 테스트 봇을 잠깐 띄워서(`timeout 25 node test/run.js`) `준비 완료`와 `슬래시 커맨드 등록 완료`가 찍히는지 확인한다
- 커맨드 정의만 빠르게 검증: `node -e "require('./src/commands/register').buildCommands()"`

## 규칙

- **비밀값**: 토큰·시크릿·API 키·계좌 정보는 `.env` 또는 `test/.env`에만 둔다. 코드, 커밋, README, 로그 출력에 절대 넣지 않는다
- `test/`는 gitignore된 로컬 테스트 공간. 테스트용 스크립트·설정은 여기 만들고, 실제 수정은 `src/`에 한다
- `.env.example` 같은 예시 env 파일은 만들지 않는다. 새 키가 생기면 `src/config.js`에 추가하고 사용자에게 알린다
- `PANEL_MESSAGE_ID`는 패널 새 게시 시 `src/lib/envFile.js`가 `test/.env`(또는 `ENV_FILE`/루트 `.env`)에 자동 기록
- 권한 있는 인텐트(MessageContent, GuildMembers, GuildPresences)는 꼭 필요할 때만 추가한다. 추가하면 개발자 포털에서 켜야 한다고 알린다
- 슬래시 커맨드 옵션은 반드시 `setName` + `setDescription` 둘 다 있어야 한다 (없으면 등록 실패)
- 돈·코인이 움직이는 로직(송금, 충전, 출금, 수수료)은 서버 측에서 금액·권한·잔액을 검증하고, 처리 내역은 `history.db`와 로그 채널에 남긴다
- 상호작용 핸들러는 3초 안에 `deferReply`/`reply`한다. 오래 걸리는 외부 API 호출 전에는 먼저 defer
- 에러는 사용자에게는 짧은 한국어 메시지로, 상세는 `console.error`로

## Git

`.cursor/rules/git-workflow.mdc`를 따른다: Conventional Commits(`feat:`/`fix:`/`refactor:`/`chore:`), 작업 단위마다 커밋, 끝나면 `git push origin HEAD`. git config는 건드리지 않는다.
