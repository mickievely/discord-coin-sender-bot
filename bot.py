import disnake
from disnake.ext import commands, tasks
import sqlite3
from datetime import datetime, timedelta
import random
import json
import os
import logging
from PIL import Image
from io import BytesIO
import math
import requests
from pass_verify import make_passapi, send_passapi, verify_passapi

import coin
from api import set_service_fee_rate, get_service_fee_rate, get_user_tier_and_fee
from persistence import (
    add_admin,
    add_balance,
    add_transaction,
    add_verified_user,
    check_admin,
    get_transaction_history,
    remove_admin,
    remove_verified_user,
    subtract_balance,
)
from settings import (
    ALLOWED_USER_IDS,
    CHANNEL_ADMIN_LOG,
    CHANNEL_CHARGE_LOG,
    CHANNEL_PURCHASE_LOG,
    CHANNEL_TRANSFER_LOG,
    CHANNEL_VERIFY_LOG,
    CHARGE_APPROVE_DESCRIPTION,
    CHARGE_APPROVE_TITLE,
    CHARGE_REJECT_DESCRIPTION,
    CHARGE_REJECT_TITLE,
    CHARGE_REQUEST_DESCRIPTION,
    CHARGE_REQUEST_TITLE,
    COIN_ADDRESSES,
    DEPOSIT_ACCOUNT_HOLDER,
    DEPOSIT_ACCOUNT_NO,
    DEPOSIT_BANK_NAME,
    LOG_FILE,
    PURCHASE_LOG_FOOTER,
    SERVICE_DISPLAY_NAME,
    TOKEN,
    TRANSFER_LOG_DESCRIPTION,
    TRANSFER_LOG_TITLE,
    VERIFY_LOG_DESCRIPTION,
    VERIFY_LOG_TITLE,
)
from stock_embed import build_service_embed

LOG_LEVEL = logging.INFO

# ===== 로그 설정 =====
logging.basicConfig(
    level=LOG_LEVEL,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# ===== 명령어 권한 설정 =====
# 슬래시 명령어를 특정 사용자에게만 보이게 하는 함수
def is_allowed_user(user_id):
    return user_id in ALLOWED_USER_IDS

intents = disnake.Intents.all()
bot = commands.Bot(command_prefix='/', intents=intents)

user_sessions = {}
embed_updating = False
pending_charge_requests = {}

class InfoModal(disnake.ui.Modal):
    def __init__(self, serial_code):
        components = [
            disnake.ui.TextInput(
                label="캡챠 (이미지 숫자 6자리)",
                placeholder="캡챠를 입력해주세요.",
                custom_id="captcha",
                style=disnake.TextInputStyle.short,
                min_length=1,
                max_length=40,
            ),
            disnake.ui.TextInput(
                label="이름",
                placeholder="성함을 입력해 주세요.",
                custom_id="name",
                style=disnake.TextInputStyle.short,
                min_length=1,
                max_length=99,
            ),
            disnake.ui.TextInput(
                label="생년월일/성별",
                placeholder="[주민등록7자리]ex) 0601013",
                custom_id="birth",
                style=disnake.TextInputStyle.short,
                min_length=7,
                max_length=7,
            ),
            disnake.ui.TextInput(
                label="휴대폰번호",
                placeholder="숫자만 입력해주세요.",
                custom_id="phone",
                style=disnake.TextInputStyle.short,
                min_length=11,
                max_length=11,
            )
        ]
        super().__init__(
            title="문자(SMS) 휴대폰본인확인",
            custom_id=f"info_modal_{serial_code}",
            components=components,
        )

class VerifyCodeModal(disnake.ui.Modal):
    def __init__(self, serial_code):
        components = [
            disnake.ui.TextInput(
                label="인증번호",
                placeholder="문자로온 숫자 6자리를 입력해 주세요.",
                custom_id="verify_code",
                style=disnake.TextInputStyle.short,
                min_length=6,
                max_length=6,
            )
        ]
        super().__init__(
            title="문자(SMS) 휴대폰본인확인",
            custom_id=f"verify_modal_{serial_code}",
            components=components,
        )

class PurchaseCoinDropdown(disnake.ui.Select):
    def __init__(self):
        options = [
            disnake.SelectOption(
                label="TRX (Tron)",
                description="TRX 코인 매입하기",
                value="TRX",
                emoji="🔴"
            ),
            disnake.SelectOption(
                label="LTC (Litecoin)",
                description="LTC 코인 매입하기",
                value="LTC",
                emoji="🟡"
            ),
            disnake.SelectOption(
                label="BNB (Binance Coin)",
                description="BNB 코인 매입하기",
                value="BNB",
                emoji="🟠"
            )
        ]
        super().__init__(placeholder="매입할 코인을 선택하세요...", options=options, custom_id="purchase_coin_select")

    async def callback(self, interaction):
        try:
            coin_name = self.values[0]
            
            address = COIN_ADDRESSES.get(coin_name, "주소 없음")
            
            embed = disnake.Embed(
                title=f"**{coin_name} 코인 매입하기**",
                description=f"아래 주소로 돈을 보내세요!",
                color=0x00ff00
            )
            embed.add_field(
                name="**입금 주소**",
                value=f"```{address}```",
                inline=False
            )
            embed.add_field(
                name="**주의사항**",
                value="• 정확한 주소로만 입금해주세요\n• 입금 후 관리자에게 문의해주세요",
                inline=False
            )
            embed.set_footer(text="입금 확인 후 코인이 지급됩니다")
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            
        except Exception as e:
            logger.error(f"코인 매입 선택 오류: {e}")
            embed = disnake.Embed(
                title="**오류**",
                description="코인 선택 중 오류가 발생했습니다.",
                color=0xff0000
            )
            await interaction.response.send_message(embed=embed, ephemeral=True)

class CoinView(disnake.ui.View):
    def __init__(self):
        super().__init__(timeout=None)
    @disnake.ui.button(label='대행이용', style=disnake.ButtonStyle.grey, emoji='💰')
    async def use_service(self, button, interaction):
        try:
            conn = sqlite3.connect('DB/verify_user.db')
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM users WHERE user_id = ?', (interaction.author.id,))
            user = cursor.fetchone()
            conn.close()
            if not user:
                await self.show_verification_needed(interaction)
                return
            embed = disnake.Embed(
                title="**대행 이용**",
                description="아래 메뉴에서 원하는 코인을 선택해주세요!",
                color=0xffff00
            )
            view = disnake.ui.View()
            view.add_item(coin.CoinDropdown())
            await interaction.response.send_message(embed=embed, view=view, ephemeral=True)
        except Exception as e:
            logger.error(f"대행사용 버튼 오류: {e}")
            embed = disnake.Embed(
                title="**오류**",
                description="서비스 이용 중 오류가 발생했습니다.",
                color=0xff0000
            )
            await interaction.response.send_message(embed=embed, ephemeral=True)
    @disnake.ui.button(label='매입하기', style=disnake.ButtonStyle.green, emoji='💵')
    async def purchase_coins(self, button, interaction):
        try:
            conn = sqlite3.connect('DB/verify_user.db')
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM users WHERE user_id = ?', (interaction.author.id,))
            user = cursor.fetchone()
            conn.close()
            if not user:
                await self.show_verification_needed(interaction)
                return
            embed = disnake.Embed(
                title="**코인 매입하기**",
                description="매입할 코인을 선택해주세요!",
                color=0x00ff00
            )
            view = disnake.ui.View()
            view.add_item(PurchaseCoinDropdown())
            await interaction.response.send_message(embed=embed, view=view, ephemeral=True)
        except Exception as e:
            logger.error(f"매입하기 버튼 오류: {e}")
            embed = disnake.Embed(
                title="**오류**",
                description="매입 서비스 이용 중 오류가 발생했습니다.",
                color=0xff0000
            )
            await interaction.response.send_message(embed=embed, ephemeral=True)
    @disnake.ui.button(label='내 정보', style=disnake.ButtonStyle.grey, emoji='👤')
    async def my_info(self, button, interaction):
        try:
            conn = sqlite3.connect('DB/verify_user.db')
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM users WHERE user_id = ?', (interaction.author.id,))
            user = cursor.fetchone()
            conn.close()
            if not user:
                await self.show_verification_needed(interaction)
                return
            embed = disnake.Embed(
                title=f"**{interaction.author.display_name} / {user[3]} 고객님의 대행정보**",
                color=0xffff00
            )
            embed.add_field(name="보유 금액", value=f"{user[6]:,}원", inline=True)
            embed.add_field(name="누적금액", value=f"{user[5]:,}원", inline=True)
            embed.set_thumbnail(url=interaction.author.display_avatar.url)
            view = disnake.ui.View()
            history_btn = disnake.ui.Button(label="거래내역 조회", style=disnake.ButtonStyle.primary, custom_id="view_history", emoji='📋')
            view.add_item(history_btn)
            await interaction.response.send_message(embed=embed, view=view, ephemeral=True)
        except Exception as e:
            logger.error(f"내 정보 버튼 오류: {e}")
            embed = disnake.Embed(
                title="**오류**",
                description="정보 조회 중 오류가 발생했습니다.",
                color=0xff0000
            )
            await interaction.response.send_message(embed=embed, ephemeral=True)
    @disnake.ui.button(label='충전하기', style=disnake.ButtonStyle.grey, emoji='💳')
    async def charge(self, button, interaction):
        try:
            conn = sqlite3.connect('DB/verify_user.db')
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM users WHERE user_id = ?', (interaction.author.id,))
            user = cursor.fetchone()
            conn.close()
            if not user:
                await self.show_verification_needed(interaction)
                return
            modal = coin.ChargeModal()
            await interaction.response.send_modal(modal)
        except Exception as e:
            logger.error(f"충전하기 버튼 오류: {e}")
            embed = disnake.Embed(
                title="**오류**",
                description="충전 서비스 이용 중 오류가 발생했습니다.",
                color=0xff0000
            )
            await interaction.response.send_message(embed=embed, ephemeral=True)
    @disnake.ui.button(label='최소송금', style=disnake.ButtonStyle.grey, emoji='📊')
    async def minimum_amount(self, button, interaction):
        try:
            min_amounts_krw = coin.get_minimum_amounts_krw()
            prices = coin.get_all_coin_prices()
            krw_rate = coin.get_exchange_rate()
            kimchi_premium = coin.get_kimchi_premium()
            actual_krw_rate = krw_rate * (1 + kimchi_premium / 100)
            try:
                tier, service_rate, purchase_bonus = get_user_tier_and_fee(interaction.author.id)
            except Exception:
                tier, service_rate, purchase_bonus = ('BUYER', 0.05, 0.0)
            fee_rate = service_rate + (kimchi_premium / 100)  # 서비스 + 김프
            embed = disnake.Embed(
                title="**📊 최소송금 안내**",
                description="각 코인별 최소 송금 금액입니다 (실시간 환율 적용)\n수수료 포함 권장 최소 입금액도 함께 안내합니다.",
                color=0x00ff00
            )
            supported_coins = ['USDT', 'BNB', 'TRX', 'LTC']
            # 코인별 기본 네트워크(수수료 계산용)
            default_network = {
                'USDT': 'BSC',
                'BNB': 'BSC',
                'TRX': 'TRX',
                'LTC': 'LTC',
            }
            for coin_symbol in supported_coins:
                min_krw = min_amounts_krw.get(coin_symbol, 0)
                if min_krw > 0:
                    # 거래소 송금 수수료(원화)
                    try:
                        network_code = default_network.get(coin_symbol, 'BSC')
                        chain_fee_coin = coin.get_transaction_fee(coin_symbol, network_code)
                        coin_price = prices.get(coin_symbol, 0) or 0
                        exchange_fee_krw = int(chain_fee_coin * coin_price * actual_krw_rate)
                    except Exception:
                        exchange_fee_krw = 0
                    # 수수료 포함 권장 최소 입금액: (최소KRW + 체인수수료) / (1 - (서비스+김프))
                    try:
                        denom = max(0.0001, 1 - fee_rate)
                        required_input = (min_krw + exchange_fee_krw) / denom
                        required_input_krw = int(math.ceil(required_input))
                    except Exception:
                        required_input_krw = min_krw
                    embed.add_field(
                        name=f"**{coin_symbol}**",
                        value=(
                            f"```최소: ₩{min_krw:,}\n권장(수수료:{service_rate*100:.1f}%+김프): ₩{required_input_krw:,}```"
                        ),
                        inline=True
                    )
            embed.add_field(
                name="**💡 안내**",
                value=(
                    "```• 실시간 환율과 김치프리미엄이 반영됩니다\n"
                    "• 최소 금액은 체인 수수료 미포함 기준입니다\n"
                    "• 권장 최소는 서비스수수료(5%)+김프, 체인수수료 포함 추정치\n"
                    "• 실제 네트워크/상황에 따라 달라질 수 있습니다```"
                ),
                inline=False
            )
            embed.set_footer(text="정확한 최소송금 금액으로 안전한 거래를!")
            await interaction.response.send_message(embed=embed, ephemeral=True)
        except Exception as e:
            logger.error(f"최소송금 버튼 오류: {e}")
            embed = disnake.Embed(
                title="**오류**",
                description="최소송금 정보 조회 중 오류가 발생했습니다.",
                color=0xff0000
            )
            await interaction.response.send_message(embed=embed, ephemeral=True)
    async def show_verification_needed(self, interaction):
        try:
            embed = disnake.Embed(
                title="**본인인증이 필요합니다**",
                description="아래 버튼을 클릭하여 본인인증을 해주세요.",
                color=0xff0000
            )
            verify_button = disnake.ui.Button(
                label="🔐 본인인증",
                style=disnake.ButtonStyle.red,
                custom_id="start_verify"
            )
            view = disnake.ui.View()
            view.add_item(verify_button)
            await interaction.response.send_message(embed=embed, view=view, ephemeral=True)
        except Exception as e:
            logger.error(f"인증 필요 메시지 오류: {e}")

last_update_time = datetime.now()
current_stock = "0"
current_rate = 1350
service_fee_rate = 0.05
update_counter = 0
api_update_counter = 0

def get_stock_amount():
    try:
        return coin.get_balance()
    except Exception as e:
        logger.error(f"재고 조회 오류: {e}")
        return "0"

def get_exchange_rate():
    try:
        return coin.get_exchange_rate()
    except Exception as e:
        logger.error(f"환율 조회 오류: {e}")
        return 1350

def get_update_counter():
    global update_counter
    update_counter += 1
    if update_counter > 60:
        update_counter = 1
    return update_counter

@bot.slash_command(name="직원", description="직원 추가/해제")
async def staff_cmd(inter, 옵션: str = commands.Param(choices=["추가", "해제"]), 유저: disnake.Member = None):
    try:
        if inter.author.id not in ALLOWED_USER_IDS:
            embed = disnake.Embed(
                title="**접근 거부**",
                description="이 명령어는 허용된 사용자만 사용할 수 있습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        if not check_admin(inter.author.id):
            embed = disnake.Embed(
                title="**오류**",
                description="권한이 없습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        
        if 유저 is None:
            embed = disnake.Embed(
                title="**오류**",
                description="유저를 선택해주세요.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        
        if 옵션 == "추가":
            add_admin(유저.id, str(유저))
            embed = disnake.Embed(color=0xffff00)
            embed.add_field(name="**직원 추가**", value=f"유저명: {유저.mention} / {유저.id}", inline=False)
        else:
            remove_admin(유저.id)
            embed = disnake.Embed(color=0xffff00)
            embed.add_field(name="**직원 해제**", value=f"유저명: {유저.mention} / {유저.id}", inline=False)
        
        await inter.response.send_message(embed=embed)
    except Exception as e:
        logger.error(f"직원 명령 오류: {e}")
        embed = disnake.Embed(
            title="**오류**",
            description="처리 중 오류가 발생했습니다.",
            color=0xff0000
        )
        await inter.response.send_message(embed=embed, ephemeral=True)

@bot.slash_command(name="강제인증", description="고객님 강제인증")
async def force_verify(inter, 유저: disnake.Member):
    try:
        if inter.author.id not in ALLOWED_USER_IDS:
            embed = disnake.Embed(
                title="**접근 거부**",
                description="이 명령어는 허용된 사용자만 사용할 수 있습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        if not check_admin(inter.author.id):
            embed = disnake.Embed(
                title="**오류**",
                description="권한이 없습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        
        add_verified_user(유저.id, "", "", "", "")
        embed = disnake.Embed(
            title="**강제인증 완료**",
            description=f"{유저.mention} 고객님이 강제인증되었습니다.",
            color=0xffff00
        )
        await inter.response.send_message(embed=embed, ephemeral=True)
    except Exception as e:
        logger.error(f"강제인증 오류: {e}")
        embed = disnake.Embed(
            title="**오류**",
            description="처리 중 오류가 발생했습니다.",
            color=0xff0000
        )
        await inter.response.send_message(embed=embed, ephemeral=True)

@bot.slash_command(name="고객블랙", description="인증고객님 블랙처리")
async def blk_user(inter, 유저: disnake.Member):
    try:
        if inter.author.id not in ALLOWED_USER_IDS:
            embed = disnake.Embed(
                title="**접근 거부**",
                description="이 명령어는 허용된 사용자만 사용할 수 있습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        if not check_admin(inter.author.id):
            embed = disnake.Embed(
                title="**오류**",
                description="권한이 없습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        
        user_data = coin.get_verified_user(유저.id)
        if user_data:
            remove_verified_user(유저.id)
            embed = disnake.Embed(color=0xffff00)
            embed.add_field(name="**인증고객님 블랙**", 
                           value=f"{유저.mention} / {user_data[3]} 고객님이 블랙되셨어요!", inline=False)
        else:
            embed = disnake.Embed(color=0xffff00)
            embed.add_field(name="**인증고객님 블랙**", 
                           value=f"{유저.mention} 고객님은 존재하지 않아요!", inline=False)
        
        await inter.response.send_message(embed=embed)
    except Exception as e:
        logger.error(f"고객블랙 오류: {e}")
        embed = disnake.Embed(
            title="**오류**",
            description="처리 중 오류가 발생했습니다.",
            color=0xff0000
        )
        await inter.response.send_message(embed=embed, ephemeral=True)

@bot.slash_command(name="충전거절", description="자동충전 요청 거절")
async def reject_charge(inter, 유저: disnake.Member, 금액: int, 사유: str = "사유 없음"):
    try:
        if inter.author.id not in ALLOWED_USER_IDS:
            embed = disnake.Embed(
                title="**접근 거부**",
                description="이 명령어는 허용된 사용자만 사용할 수 있습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        if not check_admin(inter.author.id):
            embed = disnake.Embed(
                title="**오류**",
                description="권한이 없습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        
        user_data = coin.get_verified_user(유저.id)
        if not user_data:
            embed = disnake.Embed(
                title="**오류**",
                description="해당 고객님은 인증되지 않았습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        
        # 사용자에게 거절 알림 전송
        try:
            reject_embed = disnake.Embed(
                title="❌ 충전 요청 거절",
                description=f"안녕하세요, {유저.display_name}님.\n\n충전 요청이 거절되었습니다.",
                color=0xff0000
            )
            reject_embed.add_field(
                name="**거절된 금액**",
                value=f"₩{금액:,}원",
                inline=True
            )
            reject_embed.add_field(
                name="**거절 사유**",
                value=f"{사유}",
                inline=True
            )
            reject_embed.add_field(
                name="**문의사항**",
                value="추가 문의사항이 있으시면 직원에게 연락해주세요.",
                inline=False
            )
            reject_embed.set_footer(text="안전한 거래를 위해 검토 후 거절되었습니다.")
            
            await 유저.send(embed=reject_embed)
            
            admin_embed = disnake.Embed(
                title="✅ 거절 알림 전송 완료",
                description=f"**{유저.display_name}님**에게 거절 알림을 전송했습니다.",
                color=0x00ff00
            )
            await inter.response.send_message(embed=admin_embed)
            
        except Exception as e:
            logger.error(f"사용자 DM 전송 오류: {e}")
            embed = disnake.Embed(
                title="⚠️ 알림 전송 실패",
                description=f"사용자에게 DM을 전송할 수 없습니다.\n직접 연락해주세요.",
                color=0xffa500
            )
            await inter.response.send_message(embed=embed)
        
        # 로그 채널에 알림
        channel = bot.get_channel(CHANNEL_CHARGE_LOG)
        if channel is not None:
            log_embed = disnake.Embed(
                title="❌ 자동충전 거절",
                description=f"**{유저.display_name} / {user_data[3]} 고객님**\n금액: **₩{금액:,}**\n사유: **{사유}**",
                color=0xff0000
            )
            log_embed.set_footer(text=f"거절자: {inter.author.display_name}")
            await channel.send(embed=log_embed)
        else:
            logger.error(f"충전 로그 채널({CHANNEL_CHARGE_LOG})을 찾을 수 없습니다.")
            
    except Exception as e:
        logger.error(f"충전거절 오류: {e}")
        embed = disnake.Embed(
            title="**오류**",
            description="처리 중 오류가 발생했습니다.",
            color=0xff0000
        )
        await inter.response.send_message(embed=embed, ephemeral=True)

@bot.slash_command(name="충전승인", description="자동충전 요청 승인")
async def approve_charge(inter, 유저: disnake.Member, 금액: int):
    try:
        if inter.author.id not in ALLOWED_USER_IDS:
            embed = disnake.Embed(
                title="**접근 거부**",
                description="이 명령어는 허용된 사용자만 사용할 수 있습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        if not check_admin(inter.author.id):
            embed = disnake.Embed(
                title="**오류**",
                description="권한이 없습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        
        user_data = coin.get_verified_user(유저.id)
        if not user_data:
            embed = disnake.Embed(
                title="**오류**",
                description="해당 고객님은 인증되지 않았습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        
        add_balance(유저.id, 금액)
        embed = disnake.Embed(
            title="💳 충전 승인 완료",
            description=f"**{유저.display_name} / {user_data[3]} 고객님**\n충전금액: **₩{금액:,}**\n자동충전 요청이 승인되었습니다!",
            color=0x00ff00
        )
        embed.set_thumbnail(url=유저.display_avatar.url)
        embed.set_footer(text="자동충전 시스템을 통한 승인 처리")
        await inter.response.send_message(embed=embed)
        
        # 로그 채널에 알림
        channel = bot.get_channel(CHANNEL_CHARGE_LOG)
        if channel is not None:
            log_embed = disnake.Embed(
                title="🤖 자동충전 승인",
                description=f"**{유저.display_name} / {user_data[3]} 고객님**\n금액: **₩{금액:,}**",
                color=0x00ff00
            )
            log_embed.set_footer(text=f"승인자: {inter.author.display_name}")
            await channel.send(embed=log_embed)
        else:
            logger.error(f"충전 로그 채널({CHANNEL_CHARGE_LOG})을 찾을 수 없습니다.")
    except Exception as e:
        logger.error(f"충전승인 오류: {e}")
        embed = disnake.Embed(
            title="**오류**",
            description="처리 중 오류가 발생했습니다.",
            color=0xff0000
        )
        await inter.response.send_message(embed=embed, ephemeral=True)

@bot.slash_command(name="고객충전", description="인증고객님 충전")
async def chrg_user(inter, 유저: disnake.Member, 금액: int):
    try:
        if inter.author.id not in ALLOWED_USER_IDS:
            embed = disnake.Embed(
                title="**접근 거부**",
                description="이 명령어는 허용된 사용자만 사용할 수 있습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        if not check_admin(inter.author.id):
            embed = disnake.Embed(
                title="**오류**",
                description="권한이 없습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        
        user_data = coin.get_verified_user(유저.id)
        if not user_data:
            embed = disnake.Embed(
                title="**오류**",
                description="해당 고객님은 인증되지 않았습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        
        add_balance(유저.id, 금액)
        embed = disnake.Embed(
            title="💳 충전 완료",
            description=f"**{유저.display_name} / {user_data[3]} 고객님**\n충전금액: **₩{금액:,}**\n이제 대행을 이용해주세요!",
            color=0x00ff00
        )
        embed.set_thumbnail(url=유저.display_avatar.url)
        embed.set_footer(text="충전이 즉시 반영되었습니다.")
        await inter.response.send_message(embed=embed)
        # 로그 채널에 알림
        channel = bot.get_channel(CHANNEL_CHARGE_LOG)
        if channel is not None:
            log_embed = disnake.Embed(
                title="💳 충전 로그",
                description=f"**{유저.display_name} / {user_data[3]} 고객님**\n금액: **₩{금액:,}**",
                color=0x00ff00
            )
            log_embed.set_footer(text=f"처리자: {inter.author.display_name}")
            await channel.send(embed=log_embed)
        else:
            logger.error(f"충전 로그 채널({CHANNEL_CHARGE_LOG})을 찾을 수 없습니다.")
    except Exception as e:
        logger.error(f"고객충전 오류: {e}")
        embed = disnake.Embed(
            title="**오류**",
            description="처리 중 오류가 발생했습니다.",
            color=0xff0000
        )
        await inter.response.send_message(embed=embed, ephemeral=True)

@bot.slash_command(name="정보조회", description="인증 정보 조회")
async def info_lookup(inter, 유저: disnake.Member):
    try:
        if inter.author.id not in ALLOWED_USER_IDS:
            embed = disnake.Embed(
                title="**접근 거부**",
                description="이 명령어는 허용된 사용자만 사용할 수 있습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        if not check_admin(inter.author.id):
            embed = disnake.Embed(
                title="**오류**",
                description="권한이 없습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return

        conn = sqlite3.connect('DB/verify_user.db')
        cursor = conn.cursor()
        cursor.execute('SELECT user_id, phone, DOB, name, telecom, Total_amount, now_amount FROM users WHERE user_id = ?', (유저.id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            embed = disnake.Embed(
                title="🔎 인증 정보",
                description=f"{유저.mention} 고객님의 인증 정보가 없습니다.",
                color=0xffa500
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return

        _, phone, dob, name, telecom, total_amount, now_amount = row

        embed = disnake.Embed(
            title="🧾 인증 정보 조회",
            description=f"대상: {유저.mention} ({유저.id})",
            color=0x00c3ff
        )
        try:
            embed.set_thumbnail(url=유저.display_avatar.url)
        except Exception:
            pass
        embed.add_field(name="👤 이름", value=name or "-", inline=True)
        embed.add_field(name="📱 휴대폰", value=phone or "-", inline=True)
        embed.add_field(name="🎂 생년월일", value=dob or "-", inline=True)
        embed.add_field(name="🏢 통신사", value=telecom or "-", inline=True)
        embed.add_field(name="💵 누적금액", value=f"₩{(total_amount or 0):,}", inline=True)
        embed.add_field(name="💰 현재잔액", value=f"₩{(now_amount or 0):,}", inline=True)

        # 최근 거래 5건 요약
        try:
            txs = get_transaction_history(유저.id, 5)
            if txs:
                lines = []
                for tx in txs:
                    emoji = "✅" if tx.get('type') == '송금' else "💳"
                    lines.append(f"{emoji} {tx.get('type','')} ₩{tx.get('amount',0):,} ({tx.get('coin_type','KRW')})")
                embed.add_field(name="📋 최근 거래", value="\n".join(lines), inline=False)
        except Exception:
            pass

        await inter.response.send_message(embed=embed, ephemeral=True)
    except Exception as e:
        logger.error(f"정보조회 오류: {e}")
        embed = disnake.Embed(
            title="**오류**",
            description="처리 중 오류가 발생했습니다.",
            color=0xff0000
        )
        await inter.response.send_message(embed=embed, ephemeral=True)

@bot.slash_command(name="인증해체", description="인증 해제")
async def unverify_user(inter, 유저: disnake.Member):
    try:
        if inter.author.id not in ALLOWED_USER_IDS:
            embed = disnake.Embed(
                title="**접근 거부**",
                description="이 명령어는 허용된 사용자만 사용할 수 있습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        if not check_admin(inter.author.id):
            embed = disnake.Embed(
                title="**오류**",
                description="권한이 없습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return

        # DB 삭제
        removed = False
        try:
            conn = sqlite3.connect('DB/verify_user.db')
            cursor = conn.cursor()
            cursor.execute('DELETE FROM users WHERE user_id = ?', (유저.id,))
            removed = cursor.rowcount > 0
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"인증해체 DB 오류: {e}")

        # JSON 삭제 (best-effort)
        try:
            json_file = 'DB/verified_users.json'
            if os.path.exists(json_file):
                with open(json_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                if str(유저.id) in data:
                    del data[str(유저.id)]
                    temp_file = json_file + '.tmp'
                    with open(temp_file, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    os.replace(temp_file, json_file)
        except Exception as e:
            logger.error(f"인증해체 JSON 오류: {e}")

        if removed:
            embed = disnake.Embed(
                title="🗑️ 인증 해제 완료",
                description=f"{유저.mention} 고객님의 인증이 해제되었습니다.",
                color=0x00c3ff
            )
        else:
            embed = disnake.Embed(
                title="ℹ️ 인증 정보 없음",
                description=f"{유저.mention} 고객님은 인증 이력이 없습니다.",
                color=0xffa500
            )

        await inter.response.send_message(embed=embed, ephemeral=True)
    except Exception as e:
        logger.error(f"인증해체 오류: {e}")
        embed = disnake.Embed(
            title="**오류**",
            description="처리 중 오류가 발생했습니다.",
            color=0xff0000
        )
        await inter.response.send_message(embed=embed, ephemeral=True)

@bot.slash_command(name="txid조회", description="사용자의 TXID 내역 조회")
async def txid_lookup(inter, 유저: disnake.Member):
    try:
        if inter.author.id not in ALLOWED_USER_IDS:
            embed = disnake.Embed(
                title="**접근 거부**",
                description="이 명령어는 허용된 사용자만 사용할 수 있습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return
        if not check_admin(inter.author.id):
            embed = disnake.Embed(
                title="**오류**",
                description="권한이 없습니다.",
                color=0xff0000
            )
            await inter.response.send_message(embed=embed, ephemeral=True)
            return

        transactions = get_transaction_history(유저.id, 100)
        embed = disnake.Embed(
            title=f"🔗 {유저.display_name}님의 TXID 전체 조회",
            description="거래 TXID와 API TXID를 모두 확인하세요",
            color=0x00ff00
        )
        try:
            embed.set_thumbnail(url=유저.display_avatar.url)
        except Exception:
            pass
        txid_text = ""
        count = 0
        for i, tx in enumerate(transactions, 1):
            if tx.get('txid') or tx.get('api_txid'):
                time_str = tx.get('timestamp', '')
                txid_text += f"**{i}.** {tx.get('type','')} - ₩{tx.get('amount',0):,}\n"
                txid_text += f"　🪙 {tx.get('coin_type','')} | 🕐 {time_str}\n"
                if tx.get('txid'):
                    txid_text += f"　🔗 TXID: `{tx.get('txid','')}`\n"
                if tx.get('api_txid'):
                    txid_text += f"　🔗 API TXID: `{tx.get('api_txid','')}`\n"
                txid_text += "\n"
                count += 1
                if len(txid_text) > 3500:
                    break
        if count == 0:
            embed.add_field(name="TXID 목록", value="TXID가 있는 거래가 없습니다.", inline=False)
        else:
            embed.add_field(name="TXID 목록", value=txid_text, inline=False)
        await inter.response.send_message(embed=embed, ephemeral=True)
    except Exception as e:
        logger.error(f"txid조회 오류: {e}")
        embed = disnake.Embed(
            title="**오류**",
            description="처리 중 오류가 발생했습니다.",
            color=0xff0000
        )
        await inter.response.send_message(embed=embed, ephemeral=True)

embed_message = None

@bot.slash_command(name="대행임베드", description="대행 임베드 출력")
async def service_embed(inter):
    try:
        # Defer early to avoid 3s timeout
        await inter.response.defer(ephemeral=True)
        if inter.author.id not in ALLOWED_USER_IDS:
            embed = disnake.Embed(
                title="**접근 거부**",
                description="이 명령어는 허용된 사용자만 사용할 수 있습니다.",
                color=0xff0000
            )
            await inter.edit_original_response(embed=embed)
            return
        if not check_admin(inter.author.id):
            embed = disnake.Embed(
                title="**오류**",
                description="권한이 없습니다.",
                color=0xff0000
            )
            await inter.edit_original_response(embed=embed)
            return
        
        global embed_message, current_stock, current_rate, last_update_time

        embed = build_service_embed(
            current_rate=current_rate,
            refresh_label=f"{get_update_counter()}초전",
        )
        view = CoinView()
        embed_message = await inter.channel.send(embed=embed, view=view)
        
        admin_embed = disnake.Embed(color=0xffff00)
        admin_embed.add_field(name="알림", value=f"{inter.author.display_name} 직원이 대행임베드를 사용함", inline=False)
        await inter.edit_original_response(embed=admin_embed)
    except Exception as e:
        logger.error(f"대행임베드 오류: {e}")
        embed = disnake.Embed(
            title="**오류**",
            description="처리 중 오류가 발생했습니다.",
            color=0xff0000
        )
        try:
            await inter.edit_original_response(embed=embed)
        except:
            pass

@bot.event
async def on_button_click(interaction):
    try:
        # 이미 응답된 상호작용인지 확인
        if interaction.response.is_done():
            logger.warning(f"이미 응답된 상호작용: {interaction.component.custom_id}")
            return
            
        # 각 분기에서 필요한 경우에만 defer 호출
        cid = interaction.component.custom_id
        
        if interaction.component.custom_id == "start_verify":
            # 이미 인증된 사용자면 안내만 하고 종료
            try:
                verified = coin.get_verified_user(interaction.author.id)
            except Exception:
                verified = None
            if verified:
                if not interaction.response.is_done():
                    await interaction.response.defer(ephemeral=True)
                done_embed = disnake.Embed(
                    title="✅ 이미 본인인증이 완료되었습니다",
                    description="다시 인증하실 필요가 없습니다.",
                    color=0x00c3ff
                )
                await interaction.edit_original_response(embed=done_embed)
                return
            if not interaction.response.is_done():
                await interaction.response.defer(ephemeral=True)
            embed = disnake.Embed(
                title="이용중이신 통신사를 선택해주세요.",
                color=0xff0000
            )
            
            components = [
                disnake.ui.Button(label="📱 SK TELECOM", style=disnake.ButtonStyle.red, custom_id="SKT"),
                disnake.ui.Button(label="📱 KT", style=disnake.ButtonStyle.red, custom_id="KT"),
                disnake.ui.Button(label="📱 LG U+", style=disnake.ButtonStyle.red, custom_id="LG"),
                disnake.ui.Button(label="📱 알뜰폰", style=disnake.ButtonStyle.red, custom_id="MVNO")
            ]
            
            view = disnake.ui.View()
            for component in components:
                view.add_item(component)
            
            await interaction.edit_original_response(embed=embed, view=view)
            
        elif interaction.component.custom_id in ["SKT", "KT", "LG", "MVNO"]:
            if not interaction.response.is_done():
                await interaction.response.defer(ephemeral=True)
            if interaction.component.custom_id == "SKT":
                telecom = "SK"
            elif interaction.component.custom_id == "KT":
                telecom = "KT"
            elif interaction.component.custom_id == "LG":
                telecom = "LG"
            else:
                embed = disnake.Embed(
                    title="알뜰폰 통신사를 선택해주세요.",
                    color=0xff0000
                )
                
                components = [
                    disnake.ui.Button(label="📱 SK TELECOM", style=disnake.ButtonStyle.red, custom_id="SKM"),
                    disnake.ui.Button(label="📱 KT", style=disnake.ButtonStyle.red, custom_id="KTM"),
                    disnake.ui.Button(label="📱 LG U+", style=disnake.ButtonStyle.red, custom_id="LGM")
                ]
                
                view = disnake.ui.View()
                for component in components:
                    view.add_item(component)
                
                await interaction.edit_original_response(embed=embed, view=view)
                return
            
            user_sessions[interaction.author.id] = {"telecom": telecom}
            await start_captcha(interaction, telecom)
            
        elif interaction.component.custom_id in ["SKM", "KTM", "LGM"]:
            if not interaction.response.is_done():
                await interaction.response.defer(ephemeral=True)
            if interaction.component.custom_id == "SKM":
                telecom = "SM"
            elif interaction.component.custom_id == "KTM":
                telecom = "KM"
            elif interaction.component.custom_id == "LGM":
                telecom = "LM"
            
            user_sessions[interaction.author.id] = {"telecom": telecom}
            await start_captcha(interaction, telecom)
            
        elif interaction.component.custom_id == "본인인증":
            # 이미 인증 완료되었는지 재확인
            try:
                verified = coin.get_verified_user(interaction.author.id)
            except Exception:
                verified = None
            if verified:
                if not interaction.response.is_done():
                    await interaction.response.defer(ephemeral=True)
                done_embed = disnake.Embed(
                    title="✅ 이미 본인인증이 완료되었습니다",
                    color=0x00c3ff
                )
                await interaction.edit_original_response(embed=done_embed)
                return
            serial_code = random.randint(100000, 999999)
            # defer를 취소하고 모달을 직접 보냄
            await interaction.response.send_modal(InfoModal(serial_code))
            
        elif interaction.component.custom_id == "입력하기":
            # 세션 확인
            if interaction.author.id not in user_sessions:
                if not interaction.response.is_done():
                    await interaction.response.defer(ephemeral=True)
                warn = disnake.Embed(title="세션이 없습니다", description="처음부터 다시 시도해주세요.", color=0xffa500)
                await interaction.edit_original_response(embed=warn)
                return
            serial_code = random.randint(100000, 999999)
            # defer를 취소하고 모달을 직접 보냄
            await interaction.response.send_modal(VerifyCodeModal(serial_code))
            
        elif interaction.component.custom_id == "다시입력":
            # 세션 확인
            if interaction.author.id not in user_sessions:
                if not interaction.response.is_done():
                    await interaction.response.defer(ephemeral=True)
                warn = disnake.Embed(title="세션이 없습니다", description="처음부터 다시 시도해주세요.", color=0xffa500)
                await interaction.edit_original_response(embed=warn)
                return
            serial_code = random.randint(100000, 999999)
            # defer를 취소하고 모달을 직접 보냄
            await interaction.response.send_modal(VerifyCodeModal(serial_code))
            
        elif interaction.component.custom_id == "송금하기":
            await coin.handle_send_button(interaction)
            
        elif interaction.component.custom_id == "view_history":
            if not interaction.response.is_done():
                await interaction.response.defer(ephemeral=True)
            try:
                transactions = get_transaction_history(interaction.author.id, 100)
                if not transactions:
                    embed = disnake.Embed(
                        title="📋 거래내역",
                        description="거래내역이 없습니다.",
                        color=0xffff00
                    )
                    await interaction.edit_original_response(embed=embed)
                    return
                embed = disnake.Embed(
                    title=f"{interaction.author.display_name}님의 전체 거래내역",
                    color=0x00ff00
                )
                for i, tx in enumerate(transactions, 1):
                    status_emoji = "✅" if tx.get('type') == "송금" else "💰"
                    time_str = tx.get('timestamp', '')
                    addr = str(tx.get('address',''))
                    addr_disp = f"`{addr[:10]}...{addr[-6:]}`" if addr else "-"
                    txid_line = f"TXID: `{str(tx.get('txid',''))}`\n" if tx.get('txid') else ""
                    api_txid_line = f"API TXID: `{str(tx.get('api_txid',''))}`" if tx.get('api_txid') else ""
                    value = (
                        f"{status_emoji} **{tx.get('type','')}**\n"
                        f"금액: ₩{tx.get('amount',0):,}\n"
                        f"코인: {tx.get('coin_type','')}\n"
                        f"주소: {addr_disp}\n"
                        f"수수료: ₩{tx.get('fee',0):,}\n"
                        f"시간: {time_str}\n"
                        f"{txid_line}{api_txid_line}"
                    )
                    embed.add_field(name=f"{i}번 거래", value=value, inline=False)
                view = disnake.ui.View()
                txid_btn = disnake.ui.Button(
                    label="🔗 TXID 조회",
                    style=disnake.ButtonStyle.success,
                    custom_id="view_txid"
                )
                view.add_item(txid_btn)
                await interaction.edit_original_response(embed=embed, view=view)
            except Exception as e:
                logger.error(f"거래내역 조회 오류: {e}")
                embed = disnake.Embed(
                    title="오류",
                    description="거래내역 조회 중 오류가 발생했습니다.",
                    color=0xff0000
                )
                try:
                    await interaction.edit_original_response(embed=embed)
                except Exception:
                    pass

        elif interaction.component.custom_id == "view_txid":
            if not interaction.response.is_done():
                await interaction.response.defer(ephemeral=True)
            try:
                transactions = get_transaction_history(interaction.author.id, 100)
                if not transactions:
                    embed = disnake.Embed(
                        title="🔗 TXID 조회",
                        description="거래내역이 없습니다.",
                        color=0xffff00
                    )
                    await interaction.edit_original_response(embed=embed)
                    return
                embed = disnake.Embed(
                    title="🔗 TXID 전체 조회",
                    description="거래 TXID와 API TXID를 모두 확인하세요",
                    color=0x00ff00
                )
                txid_text = ""
                for i, tx in enumerate(transactions, 1):
                    if tx.get('txid') or tx.get('api_txid'):
                        time_str = tx.get('timestamp', '')
                        txid_text += f"**{i}.** {tx.get('type','')} - ₩{tx.get('amount',0):,}\n"
                        txid_text += f"　🪙 {tx.get('coin_type','')} | 🕐 {time_str}\n"
                        if tx.get('txid'):
                            txid_text += f"　🔗 TXID: `{tx.get('txid','')}`\n"
                        if tx.get('api_txid'):
                            txid_text += f"　🔗 API TXID: `{tx.get('api_txid','')}`\n"
                        txid_text += "\n"
                if txid_text:
                    embed.add_field(
                        name="TXID 목록",
                        value=txid_text,
                        inline=False
                    )
                else:
                    embed.add_field(
                        name="TXID 목록",
                        value="TXID가 있는 거래가 없습니다.",
                        inline=False
                    )
                await interaction.edit_original_response(embed=embed)
            except Exception as e:
                logger.error(f"TXID 조회 오류: {e}")
                embed = disnake.Embed(
                    title="오류",
                    description="TXID 조회 중 오류가 발생했습니다.",
                    color=0xff0000
                )
                try:
                    await interaction.edit_original_response(embed=embed)
                except Exception:
                    pass

    except Exception as e:
        logger.error(f"버튼 클릭 오류: {e}")
        embed = disnake.Embed(
            title="**오류**",
            description="처리 중 오류가 발생했습니다.",
            color=0xff0000
        )
        try:
            if interaction.response.is_done():
                await interaction.edit_original_response(embed=embed)
            else:
                await interaction.response.send_message(embed=embed, ephemeral=True)
        except Exception:
            pass

async def start_captcha(interaction, telecom):
    try:
        embed = disnake.Embed(
            title=f"{interaction.author.name}",
            description="보안코드를 요청하는중입니다.\n╰ 너무 오래걸릴시 다시 시도해주세요.",
            color=0xff0000
        )
        embed.set_thumbnail(interaction.author.display_avatar)
        
        await interaction.edit_original_response(embed=embed)
        
        data = make_passapi(telecom)
        image = Image.open(BytesIO(data["image"]))
        image.save(f"captcha/captcha-{interaction.author.id}.png")
        
        user_sessions[interaction.author.id].update({
            "data": data,
            "telecom": telecom
        })
        
        new_embed = disnake.Embed(
            title=f"{interaction.author.name}",
            description="휴대폰 본인확인 ㅣ 문자(SMS)\n╰ 고객 정보를 2분내에 입력해 주세요",
            color=0xff0000
        )
        new_embed.set_thumbnail(interaction.author.display_avatar)
        new_embed.set_footer(text="아래 \"🔐 본인인증\" 버튼을 다시 눌러 인증을 진행해주세요!")
        
        with open(f"captcha/captcha-{interaction.author.id}.png", "rb") as file:
            image_file = disnake.File(file)
        
        button = disnake.ui.Button(
            label="🔐 본인인증",
            style=disnake.ButtonStyle.red,
            custom_id="본인인증"
        )
        
        view = disnake.ui.View()
        view.add_item(button)
        
        await interaction.edit_original_message(embed=new_embed, file=image_file, view=view)
        
    except Exception as e:
        logger.error(f"캡챠 오류: {e}")
        try:
            embed = disnake.Embed(
                title="**오류**",
                description="오류가 발생했습니다. 다시 시도해주세요.",
                color=0xff0000
            )
            await interaction.edit_original_message(embed=embed)
        except:
            pass

@bot.event
async def on_modal_submit(interaction):
    try:
        if interaction.custom_id == "charge_modal":
            # 충전 모달 처리
            try:
                # 응답 지연 (3초 제한 해결)
                await interaction.response.defer(ephemeral=True)
                
                charge_amount = int(interaction.text_values["charge_amount"].replace(",", "").replace("원", "").replace("₩", ""))
                
                if charge_amount < 500:
                    embed = disnake.Embed(
                        title="**오류**",
                        description="최소 충전 금액은 500원입니다.",
                        color=0xff0000
                    )
                    await interaction.edit_original_response(embed=embed)
                    return
                
                embed = disnake.Embed(
                    title="**💳 충전 안내**",
                    description=f"충전 요청 금액: **₩{charge_amount:,}**",
                    color=0x00ff00
                )
                embed.add_field(
                    name="**🏦 입금 계좌**",
                    value=f"```{DEPOSIT_BANK_NAME} {DEPOSIT_ACCOUNT_NO}\n예금주: {DEPOSIT_ACCOUNT_HOLDER}```",
                    inline=False
                )
                embed.add_field(
                    name="**💰 입금 금액**",
                    value=f"```₩{charge_amount:,}```",
                    inline=False
                )
                embed.add_field(
                    name="**⏰ 충전 시간**",
                    value="```입금 후 5분 이내로 자동 충전됩니다```",
                    inline=False
                )
                embed.add_field(
                    name="**📝 주의사항**",
                    value="```• 입금자명과 인증된 이름이 일치해야 합니다\n• 정확한 금액으로 입금해주세요\n• 입금 후 잠시만 기다려주세요\n• 문의사항은 직원에게 연락해주세요```",
                    inline=False
                )
                embed.set_footer(text="안전하고 빠른 충전 서비스를 제공합니다!")
                
                # 최초 defer 후에는 원본 응답을 수정
                await interaction.edit_original_response(embed=embed)

                # 채널 전송은 DM 영수증 접수 후 진행되며, 여기서는 대기 상태만 기록
                pending_charge_requests[interaction.author.id] = charge_amount
                try:
                    dm_embed = disnake.Embed(
                        title="💳 충전 신청 접수",
                        description=(
                            f"신청 금액: **₩{charge_amount:,}**\n\n"
                            "이 DM으로 입금 내역(문자 캡처/이체 스샷)을 보내주세요.\n"
                            "- 무조건 이미지모두 가능\n"
                        ),
                        color=0x5865F2
                    )
                    dm_embed.set_footer(text="영수증 확인 후 관리자에게 승인/거절 안내가 전송됩니다")
                    await interaction.author.send(embed=dm_embed)
                except Exception as e:
                    logger.error(f"충전 DM 안내 전송 실패: {e}")
            except ValueError:
                embed = disnake.Embed(
                    title="**오류**",
                    description="올바른 금액을 입력해주세요.",
                    color=0xff0000
                )
                await interaction.edit_original_response(embed=embed)
            return
        
        if interaction.custom_id.startswith("info_modal_"):
            user_data = user_sessions.get(interaction.author.id)
            if not user_data:
                await interaction.response.defer(ephemeral=True)
                embed = disnake.Embed(
                    title="**오류**",
                    description="세션이 만료되었습니다. 다시 시도해주세요.",
                    color=0xff0000
                )
                await interaction.edit_original_response(embed=embed)
                return
            
            name = interaction.text_values["name"]
            birth_1 = interaction.text_values["birth"][:-1]
            birth_2 = interaction.text_values["birth"][-1]
            phone = interaction.text_values["phone"]
            captcha = interaction.text_values["captcha"]
            
            await interaction.response.defer(ephemeral=True)
            embed = disnake.Embed(
                title=f"{interaction.author.name}",
                description="휴대폰 본인확인 ㅣ 문자(SMS)\n╰ 고객 정보를 확인중입니다.",
                color=0xff0000
            )
            embed.set_thumbnail(interaction.author.display_avatar)
            
            await interaction.edit_original_response(embed=embed)
            
            try:
                data = user_data["data"]
                telecom = user_data["telecom"]
                
                r = send_passapi(
                    data["session"],
                    data["service_info"],
                    data["encodeData"],
                    name,
                    telecom,
                    birth_1,
                    birth_2,
                    phone,
                    captcha
                )
                
                datarrr = json.loads(r)
                
                if datarrr["code"] == "RETRY":
                    error_embed = disnake.Embed(
                        title=f"{interaction.author.name}",
                        description=f"본인 확인 실패\n╰ {datarrr['message']}",
                        color=0xff0000
                    )
                    error_embed.set_thumbnail(interaction.author.display_avatar)
                    await interaction.edit_original_response(embed=error_embed)
                    return
                    
                elif datarrr["code"] == "SUCCESS":
                    user_sessions[interaction.author.id].update({
                        "name": name,
                        "birth_1": birth_1,
                        "birth_2": birth_2,
                        "phone": phone,
                        "attempts": 0
                    })
                    
                    success_embed = disnake.Embed(
                        title="**좋아요! 문자로 온 인증번호 6자리를 입력해주세요!**",
                        color=0xff0000
                    )
                    
                    button = disnake.ui.Button(
                        label="📱 입력하기",
                        style=disnake.ButtonStyle.red,
                        custom_id="입력하기"
                    )
                    
                    view = disnake.ui.View()
                    view.add_item(button)
                    
                    await interaction.edit_original_response(embed=success_embed, view=view)
                    
            except Exception as e:
                logger.error(f"정보 모달 처리 오류: {e}")
                try:
                    embed = disnake.Embed(
                        title="**오류**",
                        description="오류가 발생했습니다.",
                        color=0xff0000
                    )
                    await interaction.edit_original_response(embed=embed)
                except:
                    pass
        
        elif interaction.custom_id.startswith("verify_modal_"):
            try:
                user_data = user_sessions.get(interaction.author.id)
                if not user_data:
                    await interaction.response.defer(ephemeral=True)
                    embed = disnake.Embed(
                        title="**오류**",
                        description="세션이 만료되었습니다.",
                        color=0xff0000
                    )
                    await interaction.edit_original_response(embed=embed)
                    return
                
                verify_code = interaction.text_values["verify_code"]
                
                await interaction.response.defer(ephemeral=True)
                embed = disnake.Embed(
                    title="인증코드 확인중입니다.",
                    color=0xff0000
                )
                await interaction.edit_original_response(embed=embed)
                
                try:
                    data = user_data["data"]
                    telecom = user_data["telecom"]
                    
                    r = verify_passapi(data["session"], data["service_info"], telecom, verify_code)
                    
                    if r["code"] == "SUCCESS":
                        add_verified_user(
                            interaction.author.id,
                            user_data["phone"],
                            user_data["birth_1"],
                            user_data["name"],
                            telecom
                        )
                        
                        success_embed = disnake.Embed(
                            title=f"**안녕하세요! {user_data['name']} 고객님 대행이용 준비가 완료되었어요!**",
                            description="지금 바로 이용해보세요!",
                            color=0xff0000
                        )
                        
                        await interaction.edit_original_response(embed=success_embed, view=None)
                        
                        captcha_path = f"captcha/captcha-{interaction.author.id}.png"
                        try:
                            if os.path.exists(captcha_path):
                                os.remove(captcha_path)
                        except Exception:
                            pass
                        
                        if interaction.author.id in user_sessions:
                            del user_sessions[interaction.author.id]
                        
                    else:
                        attempts = user_data.get("attempts", 0) + 1
                        user_sessions[interaction.author.id]["attempts"] = attempts
                        
                        if attempts >= 3:
                            try:
                                await interaction.response.send_message("인증 시도가 여러 번 실패했습니다. 처음부터 다시 시도해주세요.", ephemeral=True)
                            except Exception:
                                pass
                            
                            if interaction.author.id in user_sessions:
                                del user_sessions[interaction.author.id]
                        else:
                            try:
                                await interaction.response.send_message("인증번호가 올바르지 않습니다. 다시 입력해주세요.", ephemeral=True)
                            except Exception:
                                pass
                            
                except Exception as e:
                    logger.error(f"인증코드 처리 오류: {e}")
                    try:
                        embed = disnake.Embed(
                            title="**오류**",
                            description="인증 중 오류가 발생했습니다.",
                            color=0xff0000
                        )
                        await interaction.edit_original_response(embed=embed)
                    except:
                        pass
            
            except Exception as e:
                logger.error(f"인증 모달 전체 오류: {e}")
        
        elif interaction.custom_id.startswith("amount_modal_"):
            await coin.handle_amount_modal(interaction)
    
    except Exception as e:
        logger.error(f"모달 처리 전체 오류: {e}")

@tasks.loop(seconds=300)
async def update_embed_task():
    global embed_message, current_stock, current_rate, last_update_time, embed_updating, api_update_counter
    
    try:
        if embed_message is None:
            return
        
        embed_updating = True
        
        api_update_counter += 1
        if api_update_counter >= 1:
            new_stock = get_stock_amount()
            new_rate = get_exchange_rate()
            
            if new_stock != current_stock or new_rate != current_rate:
                current_stock = new_stock
                current_rate = new_rate
            
            api_update_counter = 0
            
        last_update_time = datetime.now()

        embed = build_service_embed(
            current_rate=current_rate,
            refresh_label=f"{get_update_counter()}초전",
        )
        view = CoinView()
        await embed_message.edit(embed=embed, view=view)
        embed_updating = False
        
    except disnake.HTTPException as e:
        logger.error(f"업데이트 도중 에러: {e}")
        embed_message = None
        embed_updating = False
    except Exception as e:
        logger.error(f"업데이트 도중 에러: {e}")
        embed_message = None
        embed_updating = False

@bot.event
async def on_ready():
    logger.info(f'{bot.user}이 준비완료!')
    global current_stock, current_rate
    current_stock = get_stock_amount()
    current_rate = get_exchange_rate()
    update_embed_task.start()

@bot.slash_command(name="재고새로고침", description="실시간 재고/김프 재조회 및 임베드 갱신")
async def manual_refresh(inter):
    try:
        if inter.author.id not in ALLOWED_USER_IDS or not check_admin(inter.author.id):
            await inter.response.send_message("권한이 없습니다.", ephemeral=True)
            return
        global current_stock, current_rate
        current_stock = get_stock_amount()
        current_rate = get_exchange_rate()
        # 즉시 한 번 임베드 갱신
        await inter.response.send_message("임베드를 새로고침했습니다.", ephemeral=True)
        # 안전하게 현재 임베드를 갱신
        await update_embed_task_function_once()
    except Exception as e:
        logger.error(f"수동 새로고침 오류: {e}")
        try:
            await inter.response.send_message("오류", ephemeral=True)
        except Exception:
            pass

async def update_embed_task_function_once():
    global embed_message
    if embed_message is None:
        return
    try:
        embed = build_service_embed(current_rate=current_rate, refresh_label="수동")
        view = CoinView()
        await embed_message.edit(embed=embed, view=view)
    except Exception as e:
        logger.error(f"수동 갱신 내 에러: {e}")

@bot.slash_command(name="수수료변경", description="서비스 수수료율 변경 (예: 5 -> 5%)")
async def change_fee(inter, 퍼센트: float):
    try:
        if inter.author.id not in ALLOWED_USER_IDS or not check_admin(inter.author.id):
            await inter.response.send_message("권한이 없습니다.", ephemeral=True)
            return
        rate = 퍼센트 / 100.0
        ok = set_service_fee_rate(rate)
        if not ok:
            await inter.response.send_message("허용 범위를 벗어났습니다 (0~50%).", ephemeral=True)
            return
        await inter.response.send_message(f"수수료율이 {퍼센트:.2f}%로 변경되었습니다.", ephemeral=True)
    except Exception as e:
        logger.error(f"수수료변경 오류: {e}")
        try:
            await inter.response.send_message("오류", ephemeral=True)
        except Exception:
            pass

@bot.event
async def on_message(message: disnake.Message):
    try:
        # DM으로 온 고객 입금 내역(텍스트/이미지)을 직원 채널로 포워딩
        if message.guild is None and not message.author.bot:
            try:
                forward_ch = bot.get_channel(CHANNEL_CHARGE_LOG)
                if forward_ch is None:
                    return
                embed = disnake.Embed(title="📩 고객 입금 내역 DM 도착", color=0x00c3ff)
                embed.add_field(name="고객", value=f"{message.author} ({message.author.id})", inline=False)
                if message.content:
                    embed.add_field(name="메시지", value=message.content[:1000], inline=False)
                embed.set_footer(text=datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
                files = []
                oversized_urls = []
                for att in message.attachments:
                    try:
                        if att.size is None or att.size < 8 * 1024 * 1024:  # 8MB 이하만 재업로드
                            fp = await att.read()
                            files.append(disnake.File(BytesIO(fp), filename=att.filename))
                        else:
                            oversized_urls.append(att.url)
                    except Exception:
                        oversized_urls.append(att.url)
                if oversized_urls:
                    # 큰 파일은 URL로 안내
                    url_list = "\n".join(oversized_urls[:10])
                    embed.add_field(name="첨부(URL)", value=url_list[:1000], inline=False)
                await forward_ch.send(embed=embed, files=files if files else None)

                # 사용자에게 접수 알림 DM
                try:
                    ack = disnake.Embed(
                        title="💳 충전 신청 완료",
                        description="제출하신 영수증을 확인 중입니다. 검토 후 승인되면 알림드립니다.",
                        color=0x00c3ff
                    )
                    await message.author.send(embed=ack)
                except Exception:
                    pass

                # 충전 신청 대기중인 사용자라면 승인/거절 카드 생성
                waiting_amount = pending_charge_requests.get(message.author.id)
                if waiting_amount:
                    # 현재 잔액 조회
                    current_balance = 0
                    try:
                        conn = sqlite3.connect('DB/verify_user.db')
                        cursor = conn.cursor()
                        cursor.execute('SELECT now_amount FROM users WHERE user_id = ?', (message.author.id,))
                        result = cursor.fetchone()
                        if result:
                            current_balance = result[0]
                        conn.close()
                    except Exception:
                        pass
                    desc = CHARGE_REQUEST_DESCRIPTION.format(
                        user_mention=message.author.mention,
                        user_id=message.author.id,
                        amount=waiting_amount,
                        balance=current_balance
                    )
                    req_embed = disnake.Embed(title=CHARGE_REQUEST_TITLE, description=desc, color=0x00ff00)
                    req_embed.set_footer(text="승인/거절은 1회만 가능합니다.")

                    class ChargeDecisionView(disnake.ui.View):
                        def __init__(self, user_id, amount):
                            super().__init__(timeout=600)
                            self.user_id = user_id
                            self.amount = amount
                            self.done = False
                        @disnake.ui.button(label="✅ 승인", style=disnake.ButtonStyle.success)
                        async def approve(self, button, inter):
                            if self.done:
                                await inter.response.send_message("이미 처리된 요청입니다.", ephemeral=True)
                                return
                            add_balance(self.user_id, self.amount)
                            await inter.response.send_message(f"{self.amount:,}원 충전 승인 완료!", ephemeral=True)
                            await inter.message.edit(content="[승인됨]", view=None)
                            # 사용자 DM 통지
                            try:
                                user = await bot.fetch_user(self.user_id)
                                dm = disnake.Embed(title="💳 충전 승인", description=f"₩{self.amount:,} 충전이 승인되었습니다.", color=0x00ff00)
                                await user.send(embed=dm)
                            except Exception:
                                pass
                            await send_charge_log(CHARGE_APPROVE_TITLE, CHARGE_APPROVE_DESCRIPTION.format(
                                user_mention=f"<@{self.user_id}>",
                                user_id=self.user_id,
                                amount=self.amount,
                                approver=inter.author.display_name
                            ), 0x00ff00)
                            self.done = True
                            pending_charge_requests.pop(self.user_id, None)

                        @disnake.ui.button(label="❌ 거절", style=disnake.ButtonStyle.danger)
                        async def deny(self, button, inter):
                            if self.done:
                                await inter.response.send_message("이미 처리된 요청입니다.", ephemeral=True)
                                return
                            # 거절 사유 모달
                            class RejectReasonModal(disnake.ui.Modal):
                                def __init__(self):
                                    components = [
                                        disnake.ui.TextInput(
                                            label="거절 사유",
                                            placeholder="사유를 입력해주세요",
                                            custom_id="reason",
                                            style=disnake.TextInputStyle.paragraph,
                                            min_length=1,
                                            max_length=200
                                        )
                                    ]
                                    super().__init__(title="거절 사유 입력", custom_id="reject_reason_modal", components=components)
                                async def callback(modal_inter):
                                    reason = modal_inter.text_values.get("reason", "사유 없음")
                                    await modal_inter.response.send_message("거절 처리되었습니다.", ephemeral=True)
                                    await inter.message.edit(content="[거절됨]", view=None)
                                    # 사용자 DM 통지
                                    try:
                                        user = await bot.fetch_user(self.user_id)
                                        dm = disnake.Embed(title="❌ 충전 거절", description=f"₩{self.amount:,} 충전이 거절되었습니다.", color=0xff0000)
                                        dm.add_field(name="거절 사유", value=reason, inline=False)
                                        await user.send(embed=dm)
                                    except Exception:
                                        pass
                                    await send_charge_log(CHARGE_REJECT_TITLE, CHARGE_REJECT_DESCRIPTION.format(
                                        user_mention=f"<@{self.user_id}>",
                                        user_id=self.user_id,
                                        amount=self.amount,
                                        rejector=f"{inter.author.display_name} - 사유: {reason}"
                                    ), 0xff0000)
                                    self.done = True
                                    pending_charge_requests.pop(self.user_id, None)
                            await inter.response.send_modal(RejectReasonModal())

                    view = ChargeDecisionView(message.author.id, waiting_amount)
                    try:
                        await forward_ch.send(embed=req_embed, view=view, files=files if files else None)
                    except Exception:
                        await forward_ch.send(embed=req_embed, view=view)
            except Exception as e:
                logger.error(f"DM send 오류 : {e}")
    except Exception as e:
        logger.error(f"on_message 오류: {e}")
    finally:
        await bot.process_commands(message)

@update_embed_task.before_loop
async def before_update_embed_task():
    await bot.wait_until_ready()

async def send_purchase_log(user_id, coin_name, amount):
    try:
        channel = bot.get_channel(CHANNEL_PURCHASE_LOG)
        if channel:
            embed = disnake.Embed(
                title="🎉 대행 이용",
                description=f"익명 고객님 {amount:,}원 대행 감사합니다.\n오늘도 좋은하루 되시길 바랍니다.",
                color=0x00c3ff
            )
            try:
                embed.set_author(name=SERVICE_DISPLAY_NAME)
            except Exception:
                pass
            try:
                embed.set_footer(text=datetime.now().strftime('%Y-%m-%d %H:%M'))
            except Exception:
                pass
            await channel.send(embed=embed)
        else:
            logger.error(f"구매로그 채널({CHANNEL_PURCHASE_LOG})을 찾을 수 없습니다.")
    except Exception as e:
        logger.error(f"구매로그 전송 오류: {e}")

async def send_admin_log(title, description, color=0xffa500):
    try:
        channel = bot.get_channel(CHANNEL_ADMIN_LOG)
        if channel:
            embed = disnake.Embed(title=title, description=description, color=color)
            embed.set_footer(text=datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            await channel.send(embed=embed)
        else:
            logger.error(f"관리자로그 채널({CHANNEL_ADMIN_LOG})을 찾을 수 없습니다.")
    except Exception as e:
        logger.error(f"관리자로그 전송 오류: {e}")

async def process_transfer(user_id, coin_name, amount, txid, address=None, api_txid=None, fee=0):
    user_mention = f"<@{user_id}>"
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    # 거래내역 저장
    add_transaction(
        user_id=user_id,
        transaction_type="송금",
        amount=amount,
        coin_type=coin_name,
        address=address,
        txid=txid,
        api_txid=api_txid,
        fee=fee
    )
    
    description = TRANSFER_LOG_DESCRIPTION.format(
        user_mention=user_mention,
        user_id=user_id,
        coin_name=coin_name,
        amount=amount,
        txid=txid,
        timestamp=timestamp
    )
    await send_transfer_log(TRANSFER_LOG_TITLE, description, 0x00ff00)

async def send_transfer_log(title, description, color=0x00ff00):
    try:
        channel = bot.get_channel(CHANNEL_TRANSFER_LOG)
        if channel:
            embed = disnake.Embed(title=title, description=description, color=color)
            embed.set_footer(text=datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            await channel.send(embed=embed)
        else:
            logger.error(f"송금로그 채널({CHANNEL_TRANSFER_LOG})을 찾을 수 없습니다.")
    except Exception as e:
        logger.error(f"송금로그 전송 오류: {e}")

async def send_verify_log(title, description, color=0x00ff00):
    try:
        channel = bot.get_channel(CHANNEL_VERIFY_LOG)
        if channel:
            embed = disnake.Embed(title=title, description=description, color=color)
            embed.set_footer(text=datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            await channel.send(embed=embed)
        else:
            logger.error(f"인증로그 채널({CHANNEL_VERIFY_LOG})을 찾을 수 없습니다.")
    except Exception as e:
        logger.error(f"인증로그 전송 오류: {e}")

async def send_charge_log(title, description, color=0xffff00):
    try:
        channel = bot.get_channel(CHANNEL_CHARGE_LOG)
        if channel:
            embed = disnake.Embed(title=title, description=description, color=color)
            embed.set_footer(text=datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            await channel.send(embed=embed)
        else:
            logger.error(f"충전로그 채널({CHANNEL_CHARGE_LOG})을 찾을 수 없습니다.")
    except Exception as e:
        logger.error(f"충전로그 전송 오류: {e}")

async def process_pass_verify_success(user_id):
    user_mention = f"<@{user_id}>"
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    name = phone = birth = telecom = "정보 없음"
    try:
        json_file = 'DB/verified_users.json'
        if os.path.exists(json_file):
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            user_data = data.get(str(user_id), {})
            name = user_data.get('name', '정보 없음')
            phone = user_data.get('phone', '정보 없음')
            birth = user_data.get('dob', '정보 없음')
            telecom = user_data.get('telecom', '정보 없음')
    except Exception as e:
        logger.error(f"PASS 인증 로그 추가정보 오류: {e}")
    description = VERIFY_LOG_DESCRIPTION.format(
        user_mention=user_mention,
        user_id=user_id,
        name=name,
        phone=phone,
        birth=birth,
        telecom=telecom
    )
    await send_verify_log(VERIFY_LOG_TITLE, description, 0x00ff00)

if __name__ == "__main__":

    bot.run(TOKEN)


