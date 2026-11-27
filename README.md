# Discord 코인 대행 봇 (Node.js)

Disnake/Python 스택을 **Node.js 18+**, **discord.js 14.19+**, **Components V2**, **SQLite**(Node 내장 `node:sqlite`)로 재구성했습니다.

## 기능

- Components V2 패널 (재고·김프·수수료, 이미지·푸터 포함)
- 코인 송금·매입·충전·거래내역
- MEXC API 연동 (출금·잔액)
- SQLite: `DB/verify_user.db`, `admin.db`, `history.db`
- 관리자 슬래시 커맨드 (직원, 충전, 인증, TXID 등)

## 설정

프로젝트 루트에 **`.env`** 파일을 만들고 아래를 채웁니다 (커밋 금지).

| 변수 | 설명 |
|------|------|
| `DISCORD_TOKEN` | 봇 토큰 |
| `GUILD_ID` | (권장) 테스트 길드 ID — 슬래시 즉시 반영 |
| `DEFAULT_ADMIN_ID` | 최고 관리자 Discord ID |
| `ALLOWED_USER_IDS` | 콤마 구분 관리 명령 허용 ID |
| `SERVICE_DISPLAY_NAME` | 서비스명 (푸터·패널) |
| `PANEL_IMAGE_URL` | 패널·UI 필수 이미지 URL |
| `SERVICE_FEE_RATE` | 기본 `0.05` |
| `MEXC_API_KEY` / `MEXC_SECRET_KEY` | MEXC |
| `CHANNEL_*_LOG` | 로그 채널 ID (선택) |
| `DEPOSIT_*` | 충전 계좌 안내 |
| `COIN_ADDRESSES` | JSON 예: `{"TRX":"...","LTC":"...","BNB":"..."}` |

## 실행

```bash
npm install
npm run init-db
npm start
```

Windows: `start.bat`

## PASS 본인인증 (NICE CheckPlus)

`src/services/niceApi.js` — 대법원 BSB 경유 NICE SMS 본인인증.

패널 **본인인증** → 통신사 → 캡차 이미지 → 정보 모달 → SMS 코드.

연동 테스트 (캡차만 수집):

```bash
npm run test:nice -- SK
```

실패 시 `captcha/test-SK.png` 생성 여부와 콘솔 로그를 확인하세요.

## 레거시

Python 파일(`bot.py`, `api.py` 등)은 제거되었습니다. 데이터는 기존 `DB/` SQLite를 그대로 사용할 수 있습니다.