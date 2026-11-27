# Discord 코인 대행 봇 (Node.js)

**Node.js 22.5+**, **discord.js 14.19+**, **Components V2**, **SQLite** (`node:sqlite`).

## 설정

환경 변수: **루트 `.env`** + **`test/.env`(우선, gitignore)**.  
예시 파일(`.env.example`)은 쓰지 않습니다.

- 공통/비밀: 루트 `.env`
- 테스트 서버 ID·채널: `test/.env`

## 실행

```bash
npm install
npm run init-db
npm start
```

Windows: `start.bat`

## 기능

- Components V2 패널 (재고·김프·수수료, 이미지·푸터)
- NICE PASS SMS 본인인증
- 코인 송금·매입·충전·거래내역
- MEXC 출금·잔액
- SQLite: `DB/verify_user.db`, `history.db`

## PASS 테스트 (캡차 수집)

```bash
npm run test:nice -- SK
```