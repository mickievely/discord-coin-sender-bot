# Discord 코인 대행 봇 (Node.js)

**Node.js 22.5+**, **discord.js 14.19+**, **Components V2**, **SQLite** (`node:sqlite`).

## 설정

환경 변수는 **프로젝트 루트 `.env` 한 파일만** 사용합니다.  
`.env.example` 등 예시 파일은 두지 않습니다. (`.env`는 Git에 올리지 마세요.)

루트 `.env`에 들어 있는 키를 채운 뒤 실행합니다.

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
- SQLite: `DB/verify_user.db`, `admin.db`, `history.db`

## PASS 테스트 (캡차 수집)

```bash
npm run test:nice -- SK
```