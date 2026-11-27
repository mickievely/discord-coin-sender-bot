"""Service panel embed (재고 / 김프 / 수수료)."""
import disnake

import coin
from api import get_service_fee_rate
from settings import EMBED_ICON_URL, SERVICE_DISPLAY_NAME

SUPPORTED_COINS = ("USDT", "BNB", "TRX", "LTC")


def _balance_lines(current_rate: float) -> str:
    all_balances = coin.get_all_balances()
    all_prices = coin.get_all_coin_prices()
    lines = []
    for coin_symbol in SUPPORTED_COINS:
        balance = all_balances.get(coin_symbol, 0)
        if balance > 0:
            price = all_prices.get(coin_symbol, 0)
            krw_value = balance * price * current_rate
            lines.append(f"**{coin_symbol}**: ₩{krw_value:,.0f}\n")
    return "".join(lines)


def build_service_embed(*, current_rate: float, refresh_label: str) -> disnake.Embed:
    balance_text = _balance_lines(current_rate)
    kimchi_premium = coin.get_kimchi_premium()

    embed = disnake.Embed(
        title=f"# {SERVICE_DISPLAY_NAME}",
        color=0xFFFF00,
    )
    if EMBED_ICON_URL:
        try:
            embed.set_thumbnail(url=EMBED_ICON_URL)
        except Exception:
            pass

    embed.add_field(
        name="**실시간 재고(₩)**",
        value=balance_text if balance_text else "`재고 없음`",
        inline=False,
    )
    embed.add_field(
        name="**김치프리미엄**",
        value=f"`{kimchi_premium:+.2f}%`",
        inline=True,
    )
    try:
        service_fee_rate = get_service_fee_rate()
    except Exception:
        service_fee_rate = 0.05
    embed.add_field(
        name="**수수료(서비스)**",
        value=f"`{service_fee_rate * 100:.1f}%`",
        inline=True,
    )
    embed.add_field(name="**갱신**", value=f"`{refresh_label}`", inline=True)
    return embed