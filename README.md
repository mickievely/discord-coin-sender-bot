# Discord 코인 대행 봇

## 📱 개요

Discord를 통한 암호화폐 대행 서비스 봇입니다. 사용자 본인인증, 코인 매입/송금, 자동충전, 실시간 재고 관리 등의 기능을 제공합니다.

## 🚀 주요 기능

### 사용자 기능
- **PASS 본인인증**: 휴대폰 SMS를 통한 본인인증 시스템
- **코인 매입**: TRX, LTC, BNB 등 다양한 코인 매입 지원
- **코인 송금**: 인증된 사용자의 코인 송금 처리
- **충전 시스템**: 계좌 입금을 통한 잔액 충전
- **거래 내역 조회**: 전체 거래 내역 및 TXID 조회

### 관리자 기능
- **자동충전 승인/거절**: DM으로 받은 입금 영수증 확인 후 처리
- **사용자 관리**: 강제인증, 블랙리스트, 인증해제 등
- **재고 관리**: 실시간 코인 재고 및 김치프리미엄 조회
- **수수료 관리**: 서비스 수수료율 조정
- **외부 코드 실행**: 외부 링크에서 Python 코드 자동 실행

## 📋 시스템 구성

### 1. Discord 봇 (`bot.py`)
- Disnake 기반 Discord 봇
- 사용자 인증 및 거래 처리
- 실시간 임베드 업데이트
- 로그 관리

### 2. API 서버 (`api.py`)
- Flask 기반 RESTful API
- 코인 거래 API 연동
- 수수료 관리

### 3. 코인 모듈 (`coin.py`)
- 코인 잔액 조회
- 코인 가격 조회
- 김치프리미엄 계산

### 4. 본인인증 모듈 (`pass_verify.py`)
- PASS 본인인증 API 연동
- SMS 인증 처리

### 5. 데이터베이스
- SQLite 데이터베이스 사용
- 사용자 정보 및 거래 내역 저장

## 🛠️ 설치 및 설정

### 자동 설치 (권장)

#### Windows
1. `install.bat` 파일을 더블클릭하거나
2. 명령 프롬프트에서 실행:
```bash
install.bat
```

#### Linux/Mac
1. 실행 권한 부여 (최초 1회만):
```bash
chmod +x install.sh start.sh
```

2. 설치 스크립트 실행:
```bash
./install.sh
```

### 수동 설치

#### 1. Python 설치
- Python 3.8 이상 필요
- [Python 공식 사이트](https://www.python.org/downloads/)에서 다운로드

#### 2. 필요한 패키지 설치
```bash
pip install -r requirements.txt
```

#### 3. 데이터베이스 초기화
```bash
python init_db.py
```

#### 4. 설정 파일 수정
`bot.py` 파일에서 다음 설정을 수정하세요:

```python
# Discord 봇 토큰
TOKEN = 'YOUR_BOT_TOKEN'

# 관리자 ID
DEFAULT_ADMIN_ID = YOUR_ADMIN_ID
ALLOWED_USER_IDS = [USER_ID_1, USER_ID_2]

# 채널 ID 설정
CHANNEL_PURCHASE_LOG = YOUR_CHANNEL_ID
CHANNEL_TRANSFER_LOG = YOUR_CHANNEL_ID
CHANNEL_VERIFY_LOG = YOUR_CHANNEL_ID
CHANNEL_CHARGE_LOG = YOUR_CHANNEL_ID
CHANNEL_ADMIN_LOG = YOUR_CHANNEL_ID

# 충전 계좌 정보
DEPOSIT_BANK_NAME = "은행명"
DEPOSIT_ACCOUNT_NO = "계좌번호"
DEPOSIT_ACCOUNT_HOLDER = "예금주명"

# 코인 입금 주소
COIN_ADDRESSES = {
    "TRX": "YOUR_TRX_ADDRESS",
    "LTC": "YOUR_LTC_ADDRESS",
    "BNB": "YOUR_BNB_ADDRESS"
}
```
## 🚀 실행 방법

### Windows
```bash
start.bat
```

또는 직접 실행:
```bash
python bot.py
```

### Linux/Mac
```bash
chmod +x start.sh
./start.sh
```

또는 직접 실행:
```bash
python3 bot.py
```

## 📡 Discord 명령어

### 사용자 명령어
- `/본인인증` - PASS 본인인증 시작
- `/충전` - 계좌 입금을 통한 잔액 충전 요청
- `/거래내역` - 자신의 거래 내역 조회

### 관리자 명령어
- `/직원` - 직원 추가/해제
- `/강제인증` - 사용자 강제 인증
- `/고객블랙` - 사용자 블랙리스트 처리
- `/인증해체` - 사용자 인증 해제
- `/정보조회` - 사용자 정보 조회
- `/고객충전` - 사용자 잔액 충전
- `/충전승인` - 자동충전 요청 승인
- `/충전거절` - 자동충전 요청 거절
- `/txid조회` - 사용자 TXID 내역 조회
- `/대행임베드` - 대행 서비스 임베드 출력
- `/재고새로고침` - 실시간 재고/김프 재조회
- `/수수료변경` - 서비스 수수료율 변경


## 📊 데이터베이스 구조

### `DB/verify_user.db`
- `users` 테이블: 사용자 인증 정보 및 잔액

### `DB/history.db`
- `transaction_history` 테이블: 거래 내역

### `DB/verified_users.json`
- 사용자 인증 정보 JSON 백업

## 🔒 보안 고려사항

1. **봇 토큰 보안**
   - 봇 토큰을 절대 공개하지 마세요
   - 환경 변수 사용 권장

2. **API 키 관리**
   - 코인 거래 API 키 안전하게 보관
   - 정기적으로 키 변경

3. **데이터 보안**
   - 개인정보 암호화
   - 정기적인 데이터베이스 백업
   - 로그 파일 보안 관리

4. **네트워크 보안**
   - HTTPS 사용 권장
   - 방화벽 설정 확인

## 📝 로그 관리

### 로그 파일
- `bot.log`: 봇 실행 로그

### 로그 확인
```bash
# Windows
type bot.log

# Linux/Mac
tail -f bot.log
```

## 🆘 문제 해결

### 자주 발생하는 문제

1. **봇이 응답하지 않음**
   - 봇 토큰 확인
   - 인터넷 연결 확인
   - Discord 서버 상태 확인

2. **명령어가 작동하지 않음**
   - 봇 권한 확인 (메시지 읽기, 보내기, 임베드 링크 등)
   - 채널 ID 확인
   - 사용자 권한 확인

3. **데이터베이스 오류**
   - `init_db.py` 실행하여 DB 초기화
   - DB 파일 권한 확인

### 로그 확인
```bash
# 서버 로그 확인
tail -f bot.log

# 데이터베이스 확인
sqlite3 DB/verify_user.db "SELECT * FROM users;"
sqlite3 DB/history.db "SELECT * FROM transaction_history ORDER BY timestamp DESC LIMIT 10;"
```

## 📦 필요한 패키지

```
Flask==2.3.3
requests==2.31.0
disnake==2.9.1
Pillow==10.0.1
```

## 📞 지원

문제가 발생하면 다음을 확인하세요:

1. 봇 로그 (`bot.log`)
2. 데이터베이스 상태
3. Discord 봇 권한
4. 네트워크 연결

## 📄 라이선스

### v1.0.0 (2024-01-15)
- 초기 버전 릴리스
- PASS 본인인증 기능
- 코인 매입/송금 기능
- 자동충전 시스템
- 관리자 명령어

## 📚 추가 문서

- `bot.py`: 메인 봇 코드
- `api.py`: API 서버 코드
- `coin.py`: 코인 관련 모듈
- `pass_verify.py`: 본인인증 모듈
