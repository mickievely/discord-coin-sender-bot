# Discord 코인 대행 봇 (Node.js)

**Node.js 22.5+**, **discord.js 14.19+**, **Components V2**, **SQLite** (`node:sqlite`).

## 설정

환경 변수: **루트 `.env`** + **`test/.env`(우선, gitignore)**.  
예시 파일(`.env.example`)은 쓰지 않습니다.

- 공통/비밀: 루트 `.env`
- 테스트 서버 ID·채널: `test/.env`
- `CHANNEL_PANEL`: 패널 채널 ID (`PANEL_MESSAGE_ID`는 패널 최초 게시 시 `.env`에 자동 저장)
- 환율(재고): `USD_KRW_RATE_URL`(업비트 USDT) · 김프: `KIMCHI_SYMBOL`(기본 USDT), `KIMCHI_FX_URL`(USD/KRW, 기본 Yahoo), BTC일 때만 `KIMCHI_PREMIUM_URL`
- 패널·아이콘: `PANEL_IMAGE_URL` / `EMBED_ICON_URL` 비우면 기동 시 `assets/generated/`에 PNG 생성 후 **.env에 경로 자동 저장** (원격 URL도 가능)

## 실행

```bash
npm install
npm run init-db
npm run emojis:sync
npm run emojis:register   # 애플리케이션 이모지 (assets/emojis/registry.local.json)
npm start
```

Windows: `start.bat`

## 기능

- Components V2 패널 (재고·김프·수수료, 이미지·푸터)
- NICE PASS SMS 본인인증
- 코인 송금·매입·충전·거래내역
- MEXC 출금·잔액
- SQLite: `DB/data.db` (users · transaction_history, `DATABASE_FILE`로 변경 가능)

## PASS 테스트 (캡차 수집)

```bash
npm run test:nice -- SK
```