# config.example.py → config.py 로 복사한 뒤 값을 채우세요.

TOKEN = "YOUR_DISCORD_BOT_TOKEN_HERE"
DEFAULT_ADMIN_ID = 1234567890123456789
ALLOWED_USER_IDS = [1234567890123456789]

EMBED_ICON_URL = "https://example.com/icon.png"
SERVICE_DISPLAY_NAME = "코인대행"

DEPOSIT_BANK_NAME = "은행명"
DEPOSIT_ACCOUNT_NO = "계좌번호"
DEPOSIT_ACCOUNT_HOLDER = "예금주명"

CHANNEL_PURCHASE_LOG = 1234567890123456789
CHANNEL_TRANSFER_LOG = 1234567890123456789
CHANNEL_VERIFY_LOG = 1234567890123456789
CHANNEL_CHARGE_LOG = 1234567890123456789
CHANNEL_ADMIN_LOG = 1234567890123456789
CHANNEL_DEPOSIT_LOG = 0

COIN_ADDRESSES = {
    "TRX": "YOUR_TRX_ADDRESS_HERE",
    "LTC": "YOUR_LTC_ADDRESS_HERE",
    "BNB": "YOUR_BNB_ADDRESS_HERE",
}

PURCHASE_LOG_TITLE = "🎉 대행 이용"
PURCHASE_LOG_DESCRIPTION = (
    "익명 고객님 {amount:,}원 대행 감사합니다.\n오늘도 좋은하루 되시길 바랍니다."
)
PURCHASE_LOG_FOOTER = "코인대행"

VERIFY_LOG_TITLE = "✅ PASS 인증 완료"
VERIFY_LOG_DESCRIPTION = (
    "PASS 본인인증 성공\n"
    "- 사용자: {user_mention} ({user_id})\n"
    "- 이름: {name}\n"
    "- 휴대폰: {phone}\n"
    "- 생년월일: {birth}\n"
    "- 통신사: {telecom}"
)

CHARGE_REQUEST_TITLE = "💰 충전 요청"
CHARGE_REQUEST_DESCRIPTION = (
    "충전 요청이 접수되었습니다.\n"
    "- 사용자: {user_mention} ({user_id})\n"
    "- 요청 금액: ₩{amount:,}\n"
    "- 현재 잔액: ₩{balance:,}"
)

CHARGE_APPROVE_TITLE = "✅ 충전 승인"
CHARGE_APPROVE_DESCRIPTION = (
    "충전이 승인되었습니다.\n"
    "- 사용자: {user_mention} ({user_id})\n"
    "- 승인 금액: ₩{amount:,}\n"
    "- 승인자: {approver}"
)

CHARGE_REJECT_TITLE = "❌ 충전 거절"
CHARGE_REJECT_DESCRIPTION = (
    "충전이 거절되었습니다.\n"
    "- 사용자: {user_mention} ({user_id})\n"
    "- 거절 금액: ₩{amount:,}\n"
    "- 거절자: {rejector}"
)

TRANSFER_LOG_TITLE = "💸 송금 완료"
TRANSFER_LOG_DESCRIPTION = (
    "송금 완료\n"
    "- 사용자: {user_mention} ({user_id})\n"
    "- 코인 종류: {coin_name}\n"
    "- 금액: ₩{amount:,}\n"
    "- TXID: `{txid}`\n"
    "- 처리 시간: {timestamp}"
)

LOG_FILE = "bot.log"