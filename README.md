# Discord 코인 대행 봇

디스코드 채널에 패널을 띄우고, 인증된 고객이 원화 잔액으로 코인을 보내거나 매입·충전하는 봇입니다.

Node 22.5 이상, discord.js 14.19 이상(Components V2), SQLite(`node:sqlite`)가 필요합니다.

## 기능

패널은 `CHANNEL_PANEL` 채널에 올라갑니다.

- 재고(원화), 김치프리미엄, 수수료를 보여 주고 약 60초마다 갱신합니다.
- **구매** — USDT, TRX, LTC, BNB를 송금합니다. USDT는 BEP20·TRC20, TRX는 TRC20, LTC는 LTC, BNB는 BEP20입니다.
- **충전** — 금액을 입력하면 계좌를 안내합니다. 최소 500원이며, 입금 확인 후 관리자가 잔액을 넣어 줍니다.
- **정보** — 보유 잔액, 누적 금액, 최근 거래내역을 봅니다.
- **최소** — 코인별 최소 송금 원화를 안내합니다.
- **매입** — `.env`의 `COIN_ADDRESSES`에 적어 둔 입금 주소를 보여 줍니다.

구매, 충전, 정보, 매입은 NICE PASS 본인인증을 마친 뒤에 이용할 수 있습니다. 송금 수량은 환율, 김치프리미엄, 서비스 수수료를 반영하고, USDT가 아닌 코인은 Cwallet에서 스왑한 뒤 보냅니다.

관리자 명령은 `GUILD_ID`에 적은 서버에만 등록됩니다.

| 명령 | 하는 일 |
|------|---------|
| `/강제인증` | 고객을 강제로 인증합니다 |
| `/정보조회` | 인증 정보를 조회합니다 |
| `/인증해체` | 인증을 해제합니다 |
| `/잔액관리` | 원화 잔액을 추가하거나 차감합니다 |

`DEFAULT_ADMIN_ID`와 `ALLOWED_USER_IDS`에 있는 계정만 사용할 수 있습니다.

## 세팅

1. Node 22.5 이상을 설치한 뒤, 이 폴더에서 `npm install`을 실행해 주세요.
2. 같은 폴더에 `.env` 파일을 만들고, 아래 환경 변수를 채워 주세요. 봇은 이 파일의 값으로 동작합니다.
3. 디스코드 개발자 포털에서 봇을 만든 뒤 서버에 초대해 주세요. 필요한 인텐트는 서버(Guilds)입니다.
4. Cwallet 로그인 세션을 저장해 주세요. 처음 한 번은 Playwright가 필요합니다.

```bash
npm install -D playwright
npx playwright install chromium
npm run cwallet:save-session
```

브라우저가 열리면 [my.cwallet.com](https://my.cwallet.com)에 로그인해 주세요. 끝나면 `secrets/cwallet-storage-state.json`이 생성됩니다. 결제 PIN은 `.env`의 `CWALLET_PASSWORD`에 적어 주세요. 2차 인증을 쓰시면 `CWALLET_TOTP`에 6자리 코드를 넣거나, 시크릿은 `CWALLET_2FA_SECRET`에 넣어 주세요.

5. 이모지와 데이터베이스를 준비한 다음 봇을 실행해 주세요.

```bash
npm run emojis:sync
npm run emojis:register
npm run init-db
npm start
```

윈도우에서는 `start.bat`을 실행하시면 설치와 데이터베이스 생성 후 봇이 켜집니다. `CHANNEL_PANEL`을 적어 두셨다면 그 채널에 패널이 올라가고, 메시지 ID는 `.env`의 `PANEL_MESSAGE_ID`에 저장됩니다.

## 환경 변수

프로젝트 루트의 `.env`에 아래처럼 적어 주세요. 값에 공백이 있으면 따옴표로 감싸 주시면 됩니다.

```env
DISCORD_TOKEN=봇토큰
GUILD_ID=서버ID
DEFAULT_ADMIN_ID=관리자사용자ID
ALLOWED_USER_IDS=추가관리자ID,추가관리자ID

CHANNEL_PANEL=패널채널ID
CHANNEL_PURCHASE_LOG=매입로그채널ID
CHANNEL_TRANSFER_LOG=송금로그채널ID
CHANNEL_VERIFY_LOG=인증로그채널ID
CHANNEL_CHARGE_LOG=충전로그채널ID
CHANNEL_ADMIN_LOG=관리자로그채널ID

DEPOSIT_BANK_NAME=은행이름
DEPOSIT_ACCOUNT_NO=계좌번호
DEPOSIT_ACCOUNT_HOLDER=예금주
SERVICE_FEE_RATE=5
COIN_ADDRESSES={"USDT":"주소","TRX":"주소","LTC":"주소","BNB":"주소"}

CWALLET_PASSWORD=결제PIN
CWALLET_STORAGE_STATE=secrets/cwallet-storage-state.json
```

| 이름 | 설명 |
|------|------|
| `DISCORD_TOKEN` | 봇 토큰 |
| `GUILD_ID` | 명령을 등록할 서버 ID |
| `DEFAULT_ADMIN_ID` | 관리자 사용자 ID |
| `ALLOWED_USER_IDS` | 관리자를 더 둘 때 사용자 ID. 쉼표로 구분하며, 비우면 따로 제한하지 않습니다 |
| `CHANNEL_PANEL` | 패널을 올릴 채널 |
| `CHANNEL_PURCHASE_LOG` | 매입 로그 채널 |
| `CHANNEL_TRANSFER_LOG` | 송금 로그 채널 |
| `CHANNEL_VERIFY_LOG` | 인증 로그 채널 |
| `CHANNEL_CHARGE_LOG` | 충전 로그 채널 |
| `CHANNEL_ADMIN_LOG` | 관리자 로그 채널 |
| `DEPOSIT_BANK_NAME` | 충전 안내에 보여줄 은행 |
| `DEPOSIT_ACCOUNT_NO` | 계좌번호 |
| `DEPOSIT_ACCOUNT_HOLDER` | 예금주 |
| `SERVICE_FEE_RATE` | 수수료. `5`이면 5%입니다 |
| `COIN_ADDRESSES` | 매입 입금 주소. 위 예시처럼 JSON 한 줄로 적어 주세요 |
| `CWALLET_PASSWORD` | Cwallet 결제 PIN |
| `CWALLET_STORAGE_STATE` | 세션 파일 경로. 비우시면 `secrets/cwallet-storage-state.json`을 사용합니다 |

환율과 김치프리미엄 주소는 비워 두셔도 됩니다. 비우면 업비트와 야후 시세를 사용합니다. 직접 지정하시려면 `USD_KRW_RATE_URL`, `KIMCHI_PREMIUM_URL`을 넣어 주세요. `KIMCHI_SYMBOL`을 비우면 USDT로 계산합니다.

패널 이미지를 직접 쓰시려면 `PANEL_IMAGE_URL`과 `EMBED_ICON_URL`에 주소를 넣어 주세요. 비우시면 실행 시 `assets/generated/`에 만들어 둡니다. 잔액 데이터는 `DB/data.db`에 저장되며, 파일 이름만 바꾸시려면 `DATABASE_FILE`을 적어 주세요.

## 라이선스

라이선스는 `LICENSE` 파일을 봐 주세요. 저작권은 XDAYOUNGX에 있습니다. 본인 서버에서 설치하고 수정해서 사용하실 수 있습니다. 판매, 재배포, 미러, 재라이선스는 허용되지 않습니다.
