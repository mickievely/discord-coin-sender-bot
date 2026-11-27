import disnake
import requests
import time
import hashlib
import hmac
import sqlite3
from datetime import datetime
import urllib.parse
# 웹훅 사용 제거

# MEXC API 설정
API_KEY = "" # api 설정
SECRET_KEY = "" # 시크릿키 설정
BASE_URL = "https://api.mexc.com"

# 서비스 수수료율(기본 0.05 = 5%) 
SERVICE_FEE_RATE = 0.05

def set_service_fee_rate(rate: float):
    global SERVICE_FEE_RATE
    try:
        if rate < 0 or rate > 0.5:
            return False
        SERVICE_FEE_RATE = rate
        return True
    except Exception:
        return False

def get_service_fee_rate() -> float:
    try:
        return SERVICE_FEE_RATE
    except Exception:
        return 0.05

def sign_params(params, secret):
    try:
        query_string = '&'.join([f"{k}={v}" for k, v in params.items()])
        signature = hmac.new(secret.encode('utf-8'), query_string.encode('utf-8'), hashlib.sha256).hexdigest()
        return signature
    except Exception:
        return ""

def get_exchange_rate():
    try:
        response = requests.get("https://api.exchangerate-api.com/v4/latest/USD", timeout=10)
        response.raise_for_status()
        data = response.json()
        rate = data.get("rates", {}).get("KRW")
        return rate if rate and rate > 0 else 1350
    except (requests.RequestException, ValueError, KeyError):
        return 1350
    except Exception:
        return 1350

def get_kimchi_premium():
    try:
        upbit_response = requests.get("https://api.upbit.com/v1/ticker?markets=KRW-BTC", timeout=10)
        if upbit_response.status_code == 200:
            upbit_data = upbit_response.json()
            upbit_price = upbit_data[0]['trade_price']
        else:
            return 0
        
        binance_response = requests.get("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", timeout=10)
        if binance_response.status_code == 200:
            binance_data = binance_response.json()
            binance_price_usd = float(binance_data['price'])
        else:
            return 0
        
        # USD/KRW 환율
        krw_rate = get_exchange_rate()
        
        # 김치프리미엄 계산
        binance_price_krw = binance_price_usd * krw_rate
        kimchi_premium = ((upbit_price - binance_price_krw) / binance_price_krw) * 100
        
        return round(kimchi_premium, 2)
        
    except Exception:
        return 0

def get_coin_price(coin_symbol):
    """특정 코인의 현재 가격을 USD로 조회 (업비트 우선, MEXC 백업)"""
    try:
        # 업비트에서 가격 조회 시도
        upbit_price = get_upbit_coin_price(coin_symbol)
        if upbit_price > 0:
            return upbit_price
        
        # 업비트 실패 시 MEXC에서 조회
        endpoint = "/api/v3/ticker/price"
        params = {'symbol': f"{coin_symbol}USDT"}
        
        response = requests.get(f"{BASE_URL}{endpoint}", params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            return float(data.get('price', 0))
        else:
            return 0
    except (requests.RequestException, ValueError, KeyError):
        return 0
    except Exception:
        return 0

def get_upbit_coin_price(coin_symbol):
    """업비트에서 코인 가격을 USD로 조회"""
    try:
        # 업비트 코인 매핑
        upbit_mapping = {
            'USDT': 'USDT-KRW',
            'BNB': 'BNB-KRW', 
            'TRX': 'TRX-KRW',
            'LTC': 'LTC-KRW'
        }
        
        upbit_symbol = upbit_mapping.get(coin_symbol)
        if not upbit_symbol:
            return 0
        
        # 업비트 API 호출
        url = f"https://api.upbit.com/v1/ticker?markets={upbit_symbol}"
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data and len(data) > 0:
                krw_price = float(data[0].get('trade_price', 0))
                # KRW를 USD로 변환
                usd_krw_rate = get_exchange_rate()
                if usd_krw_rate > 0:
                    usd_price = krw_price / usd_krw_rate
                    return usd_price
        return 0
    except (requests.RequestException, ValueError, KeyError):
        return 0
    except Exception:
        return 0

def get_all_coin_prices():
    """모든 지원 코인의 현재 가격을 조회 (업비트 우선, MEXC 백업)"""
    try:
        prices = {}
        supported_coins = ['USDT', 'TRX', 'LTC', 'BNB']
        
        # 각 코인별로 업비트에서 가격 조회 시도
        for coin in supported_coins:
            if coin == 'USDT':
                prices[coin] = 1.0  # USDT는 항상 1
            else:
                upbit_price = get_upbit_coin_price(coin)
                if upbit_price > 0:
                    prices[coin] = upbit_price
                else:
                    # 업비트 실패 시 MEXC에서 조회
                    mexc_price = get_mexc_coin_price(coin)
                    prices[coin] = mexc_price
        
        return prices
    except Exception:
        return {}

def get_mexc_coin_price(coin_symbol):
    """MEXC에서 코인 가격 조회 (백업용)"""
    try:
        endpoint = "/api/v3/ticker/price"
        params = {'symbol': f"{coin_symbol}USDT"}
        
        response = requests.get(f"{BASE_URL}{endpoint}", params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            return float(data.get('price', 0))
        else:
            return 0
    except (requests.RequestException, ValueError, KeyError):
        return 0
    except Exception:
        return 0

def get_convert_pairs():
    """MEXC Convert 가능한 코인 쌍 조회"""
    if not API_KEY or not SECRET_KEY:
        return None
    
    try:
        endpoint = "/api/v3/convert/pairs"
        timestamp = int(time.time() * 1000)
        
        params = {
            'recvWindow': 60000,
            'timestamp': timestamp
        }
        
        signature = sign_params(params, SECRET_KEY)
        if not signature:
            return None
            
        params['signature'] = signature
        
        headers = {
            'X-MEXC-APIKEY': API_KEY
        }
        
        response = requests.get(f"{BASE_URL}{endpoint}", headers=headers, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('code') == 200:
                return data.get('data', [])
        return None
    except Exception:
        return None

def get_symbol_info(symbol):
    """거래소에서 지원하는 심볼 정보 확인"""
    if not API_KEY or not SECRET_KEY:
        return None
    
    try:
        endpoint = "/api/v3/exchangeInfo"
        response = requests.get(f"{BASE_URL}{endpoint}", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            symbols = data.get('symbols', [])
            
            for sym in symbols:
                if sym.get('symbol') == symbol and sym.get('status') == 'ENABLED':
                    return sym
            return None
        else:
            return None
    except Exception:
        return None

def mexc_swap_coins(from_coin, to_coin, amount):
    """MEXC Convert 시뮬레이션 (실제 Convert API가 작동하지 않음)"""
    if not API_KEY or not SECRET_KEY:
        return {'success': False, 'error': 'API 키가 설정되지 않았습니다'}
    
    try:
        # MEXC Convert API가 실제로 작동하지 않으므로 시뮬레이션
        # 실제 운영 시에는 수동으로 Convert하거나 다른 방법 필요
        
        # 코인 가격 조회
        from_price = get_coin_price(from_coin.upper())
        to_price = get_coin_price(to_coin.upper())
        
        if from_price <= 0 or to_price <= 0:
            return {'success': False, 'error': '코인 가격 조회 실패'}
        
        # 스왑 계산 (from_coin을 USDT로, USDT를 to_coin으로)
        usdt_amount = amount * from_price
        to_amount = usdt_amount / to_price
        
        # 스왑 수수료 적용 (0.1%)
        swap_fee = 0.001
        final_amount = to_amount * (1 - swap_fee)
        
        print(f"Debug: {from_coin} {amount} → {to_coin} {final_amount:.6f} (시뮬레이션)")
        
        return {
            'success': True,
            'orderId': f"SWAP_{int(time.time())}",
            'status': 'success',
            'from_coin': from_coin.upper(),
            'to_coin': to_coin.upper(),
            'amount': amount,
            'swapped_amount': final_amount,
            'fee': swap_fee
        }
        
    except Exception as e:
        return {'success': False, 'error': f'스왑 오류: {str(e)}'}

def simple_send_coin(target_coin, amount, address, network):
    """선택한 코인으로 직접 송금 (자동 스왑 없음)"""
    if not API_KEY or not SECRET_KEY:
        return {'success': False, 'error': 'API 키가 설정되지 않았습니다'}
    
    try:
        # 현재 코인 잔액 확인
        balances = get_all_balances()
        target_balance = balances.get(target_coin.upper(), 0)
        
        print(f"Debug: 목표 코인={target_coin.upper()}, 필요량={amount}, 현재잔액={target_balance}")
        
        # 목표 코인 잔액 확인
        if target_balance < amount:
            return {'success': False, 'error': f'{target_coin.upper()} 잔액 부족: {target_balance:.6f} {target_coin.upper()} (필요: {amount:.6f})'}
        
        # 바로 송금
        print(f"Debug: {target_coin.upper()} 잔액 충분, 바로 송금")
        return send_coin_transaction(amount, address, network, target_coin)
        
    except Exception as e:
        return {'success': False, 'error': f'송금 오류: {str(e)}'}

def get_balance(coin='USDT'):
    if not API_KEY or not SECRET_KEY:
        return "0"
    
    try:
        endpoint = "/api/v3/account"
        timestamp = int(time.time() * 1000)
        
        params = {
            'timestamp': timestamp
        }
        
        signature = sign_params(params, SECRET_KEY)
        if not signature:
            return "0"
            
        params['signature'] = signature
        
        headers = {
            'X-MEXC-APIKEY': API_KEY
        }
        
        response = requests.get(f"{BASE_URL}{endpoint}", headers=headers, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            balances = data.get('balances', [])
            
            for balance in balances:
                if balance.get('asset') == coin.upper():
                    free_balance = float(balance.get('free', 0))
                    return str(max(0, free_balance))
            
            return "0"
        else:
            return "0"
            
    except (requests.RequestException, ValueError, KeyError):
        return "0"
    except Exception:
        return "0"

def get_all_balances():
    """모든 지원 코인의 잔액을 조회"""
    if not API_KEY or not SECRET_KEY:
        return {}
    
    try:
        endpoint = "/api/v3/account"
        timestamp = int(time.time() * 1000)
        
        params = {
            'timestamp': timestamp
        }
        
        signature = sign_params(params, SECRET_KEY)
        if not signature:
            return {}
            
        params['signature'] = signature
        
        headers = {
            'X-MEXC-APIKEY': API_KEY
        }
        
        response = requests.get(f"{BASE_URL}{endpoint}", headers=headers, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            balances = data.get('balances', [])
            
            supported_coins = ['USDT', 'TRX', 'LTC', 'BNB']
            result = {}
            
            for balance in balances:
                asset = balance.get('asset', '')
                if asset in supported_coins:
                    free_balance = float(balance.get('free', 0))
                    result[asset] = max(0, free_balance)
            
            # 지원하지 않는 코인은 0으로 설정
            for coin in supported_coins:
                if coin not in result:
                    result[coin] = 0
                    
            return result
        else:
            return {}
            
    except (requests.RequestException, ValueError, KeyError):
        return {}
    except Exception:
        return {}

def get_verified_user(user_id):
    try:
        conn = sqlite3.connect('DB/verify_user.db')
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM users WHERE user_id = ?', (user_id,))
        user = cursor.fetchone()
        conn.close()
        return user
    except (sqlite3.Error, OSError):
        return None
    except Exception:
        return None

def subtract_balance(user_id, amount):
    conn = None
    try:
        conn = sqlite3.connect('DB/verify_user.db')
        cursor = conn.cursor()
        cursor.execute('SELECT now_amount FROM users WHERE user_id = ?', (user_id,))
        current = cursor.fetchone()
        
        if current and current[0] >= amount:
            new_balance = current[0] - amount
            cursor.execute('UPDATE users SET now_amount = ? WHERE user_id = ?', (new_balance, user_id))
            conn.commit()
            return True
        else:
            return False
    except (sqlite3.Error, OSError):
        if conn:
            try:
                conn.rollback()
            except:
                pass
        return False
    except Exception:
        if conn:
            try:
                conn.rollback()
            except:
                pass
        return False
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass

def add_transaction_history(user_id, amount, transaction_type):
    conn = None
    try:
        conn = sqlite3.connect('DB/history.db')
        cursor = conn.cursor()
        cursor.execute('INSERT INTO transaction_history (user_id, amount, type) VALUES (?, ?, ?)', 
                      (user_id, amount, transaction_type))
        conn.commit()
    except (sqlite3.Error, OSError):
        pass
    except Exception:
        pass
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass

def get_txid_link(txid, coin='USDT'):
    try:
        if txid and len(str(txid)) > 0:
            # 코인별 블록 익스플로러 링크
            explorer_links = {
                'USDT': f"https://bscscan.com/tx/{txid}",
                'BNB': f"https://bscscan.com/tx/{txid}",
                'TRX': f"https://tronscan.org/#/transaction/{txid}",
                'LTC': f"https://blockchair.com/litecoin/transaction/{txid}"
            }
            return explorer_links.get(coin.upper(), f"https://bscscan.com/tx/{txid}")
        return "https://bscscan.com/"
    except Exception:
        return "https://bscscan.com/"

def get_transaction_fee(coin, network):
    """송금 수수료 조회"""
    fees = {
        'USDT': {'BSC': 0.8, 'TRX': 1.0},
        'TRX': {'TRX': 1.0},
        'LTC': {'LTC': 0.001},
        'BNB': {'BSC': 0.0005}
    }
    
    coin_fees = fees.get(coin.upper(), {})
    return coin_fees.get(network.upper(), 1.0)

def get_minimum_amounts_krw():
    """최소 송금 금액을 KRW로 변환하여 반환"""
    min_amounts = {
        'USDT': 10,     # 10 USDT
        'TRX': 10,      # 10 TRX
        'LTC': 0.015,   # 0.015 LTC
        'BNB': 0.008    # 0.008 BNB
    }
    
    prices = get_all_coin_prices()
    krw_rate = get_exchange_rate()
    kimchi_premium = get_kimchi_premium()
    actual_krw_rate = krw_rate * (1 + kimchi_premium / 100)
    
    min_amounts_krw = {}
    for coin, min_amount in min_amounts.items():
        coin_price = prices.get(coin, 0)
        if coin_price > 0:
            krw_value = min_amount * coin_price * actual_krw_rate
            min_amounts_krw[coin] = int(krw_value)
        else:
            min_amounts_krw[coin] = 0
    
    return min_amounts_krw

# ===== Tier/Fees Helpers =====
def get_user_tier_and_fee(user_id: int):
    """Return (tier, service_fee_rate, purchase_bonus_rate). tier: 'VIP' or 'BUYER'"""
    try:
        total_amount = 0
        try:
            conn = sqlite3.connect('DB/verify_user.db')
            cursor = conn.cursor()
            cursor.execute('SELECT Total_amount FROM users WHERE user_id = ?', (user_id,))
            row = cursor.fetchone()
            if row:
                total_amount = int(row[0] or 0)
            conn.close()
        except Exception:
            pass
        if total_amount >= 10_000_000:
            return ('VIP', 0.03, 0.01)
        else:
            return ('BUYER', 0.05, 0.0)
    except Exception:
        return ('BUYER', 0.05, 0.0)

def get_minimum_amount_coin(coin_symbol):
    """특정 코인의 최소 송금 금액을 코인 단위로 반환"""
    min_amounts = {
        'USDT': 10,     # 10 USDT
        'TRX': 10,      # 10 TRX
        'LTC': 0.015,   # 0.015 LTC
        'BNB': 0.008    # 0.008 BNB
    }
    
    return min_amounts.get(coin_symbol.upper(), 10)

def krw_to_coin_amount(krw_amount, coin_symbol):
    """KRW 금액을 코인 단위로 변환"""
    krw_rate = get_exchange_rate()
    coin_price = get_coin_price(coin_symbol.upper())
    kimchi_premium = get_kimchi_premium()
    actual_krw_rate = krw_rate * (1 + kimchi_premium / 100)
    
    return krw_amount / actual_krw_rate / coin_price

def send_coin_transaction(amount, address, network, coin='USDT', skip_min_check=False, skip_address_check=False):
    if not API_KEY or not SECRET_KEY:
        return {'success': False, 'error': 'API 키가 설정되지 않았습니다'}
    
    # MEXC 최소 송금 금액 확인 (skip_min_check가 True면 건너뛰기)
    if not skip_min_check:
        # 통일된 최소 송금 금액 조회
        min_amount = get_minimum_amount_coin(coin.upper())
        min_amounts_krw = get_minimum_amounts_krw()
        min_krw = min_amounts_krw.get(coin.upper(), 10000)
        
        if amount < min_amount:
            return {'success': False, 'error': f'최소 송금 금액 미달: ₩{min_krw:,} (약 {min_amount:.6f} {coin.upper()}) 필요'}
    
    # 네트워크 매핑 (MEXC API 기준)
    network_mapping = {
        'bep20': 'BSC',      # BSC 네트워크 (BEP20)
        'trc20': 'TRX',      # TRON 네트워크 (TRC20)
        'ltc': 'LTC',        # Litecoin 네트워크
        'bnb': 'BSC'         # BSC 네트워크 (BNB)
    }
    
    # 코인별 주소 형식 검증 (skip_address_check가 True면 건너뛰기)
    if not skip_address_check:
        if coin.upper() == 'LTC':
            # LTC 주소 검증 제거 (MEXC에서 자체 검증)
            pass
        
        elif coin.upper() == 'USDT':
            # USDT 주소 검증 제거 (MEXC에서 자체 검증)
            pass
        
        elif coin.upper() == 'TRX':
            # TRX 주소 검증 제거 (MEXC에서 자체 검증)
            pass
        
        elif coin.upper() == 'BNB':
            # BNB 주소 검증 제거 (MEXC에서 자체 검증)
            pass
    
    network_code = network_mapping.get(network.lower())
    if not network_code:
        return {'success': False, 'error': f'지원하지 않는 네트워크: {network}'}
    
    # 디버깅을 위한 로그 (실제 운영 시에는 제거)
    print(f"Debug: Coin={coin}, Network={network}, NetworkCode={network_code}, Address={address}")
    
    try:
        endpoint = "/api/v3/capital/withdraw"
        timestamp = int(time.time() * 1000)
        
        params = {
            'coin': coin.upper(),
            'address': str(address).strip(),
            'amount': str(amount),
            'netWork': network_code,
            'recvWindow': 60000,
            'timestamp': timestamp
        }
        
        signature = sign_params(params, SECRET_KEY)
        if not signature:
            return {'success': False, 'error': 'API 서명 생성 실패'}
            
        params['signature'] = signature
        
        headers = {
            'X-MEXC-APIKEY': API_KEY
        }
        
        response = requests.post(f"{BASE_URL}{endpoint}", headers=headers, params=params, timeout=30)
        
        if response.status_code == 200:
            try:
                data = response.json()
                
                if data.get('id'):
                    txid = str(data.get('id', ''))
                    share_link = get_txid_link(txid, coin.upper())
                    
                    # 송금 수수료 계산
                    transaction_fee = get_transaction_fee(coin.upper(), network_code)
                    
                    # 사용자 잔액에서 송금 수수료 차감
                    try:
                        from persistence import subtract_balance as global_subtract_balance
                        krw_rate = get_exchange_rate()
                        coin_price = get_coin_price(coin.upper())
                        fee_krw = transaction_fee * coin_price * krw_rate
                        global_subtract_balance(None, int(fee_krw))
                    except Exception as e:
                        print(f"송금 수수료 차감 실패: {e}")
                    
                    result = {
                        'success': True,
                        'time': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                        'txid': txid,
                        'network': network_code,
                        'fee': f"{transaction_fee} {coin.upper()}",
                        'to_address': str(address).strip(),
                        'share_link': share_link,
                        'coin': coin.upper()
                    }
                    
                    return result
                else:
                    error_msg = data.get('msg', '알 수 없는 오류')
                    return {'success': False, 'error': f'거래소 오류: {error_msg}'}
            except (ValueError, KeyError):
                return {'success': False, 'error': '응답 데이터 파싱 오류'}
        else:
            # 상세 오류 메시지 구성 (HTTP 상태, 거래소 msg, raw 응답 일부, 요청 요약)
            status = response.status_code
            error_msg = None
            try:
                error_data = response.json()
                error_msg = error_data.get('msg') or error_data.get('message')
            except Exception:
                pass
            raw_snippet = ''
            try:
                raw_text = response.text
                raw_snippet = raw_text[:300]
            except Exception:
                raw_snippet = ''
            req_summary = f"coin={params.get('coin')} net={params.get('netWork')} amt={params.get('amount')}"
            composed = f"HTTP {status} | {error_msg or '거래소 응답 오류'} | {req_summary}"
            if raw_snippet:
                composed += f" | raw={raw_snippet}"
            return {'success': False, 'error': composed}
        
    except requests.exceptions.RequestException as e:
        return {'success': False, 'error': f'네트워크 오류: {str(e)}'}
    except Exception as e:
        return {'success': False, 'error': f'예상치 못한 오류: {str(e)}'}

class AmountModal(disnake.ui.Modal):
    def __init__(self, network, coin='usdt'):
        self.network = network
        self.coin = coin
        
        # 실시간 최소송금 금액 조회
        min_amounts_krw = get_minimum_amounts_krw()
        min_krw = min_amounts_krw.get(coin.upper(), 10000)
        
        # 코인별 단위 정보
        coin_info = {
            'usdt': {'unit': 'USDT'},
            'trx': {'unit': 'TRX'},
            'ltc': {'unit': 'LTC'},
            'bnb': {'unit': 'BNB'}
        }
        
        info = coin_info.get(coin.lower(), coin_info['usdt'])
        
        components = [
            disnake.ui.TextInput(
                label="원화 금액",
                placeholder=f"원화 금액을 입력해주세요 (최소 ₩{min_krw:,})",
                custom_id="amount",
                style=disnake.TextInputStyle.short,
                min_length=1,
                max_length=15,
            ),
            disnake.ui.TextInput(
                label="코인 주소",
                placeholder="코인을 송금 받으실 지갑 주소를 입력해주세요",
                custom_id="address",
                style=disnake.TextInputStyle.short,
                min_length=10,
                max_length=100,
            )
        ]
        super().__init__(
            title=f"{info['unit']} 송금 정보 (최소 ₩{min_krw:,})",
            custom_id=f"amount_modal_{network}_{coin}",
            components=components,
        )

class ChargeModal(disnake.ui.Modal):
    def __init__(self):
        components = [
            disnake.ui.TextInput(
                label="충전 금액",
                placeholder="충전할 원화 금액을 입력해주세요 (최소 500원)",
                custom_id="charge_amount",
                style=disnake.TextInputStyle.short,
                min_length=1,
                max_length=15,
            )
        ]
        super().__init__(
            title="💳 충전 금액 입력",
            custom_id="charge_modal",
            components=components,
        )

class CoinDropdown(disnake.ui.Select):
    def __init__(self):
        options = [
            disnake.SelectOption(label="USDT", description="테더코인 (Tether)", value="usdt"),
            disnake.SelectOption(label="TRX", description="트론 (TRON)", value="trx"),
            disnake.SelectOption(label="LTC", description="라이트코인 (Litecoin)", value="ltc"),
            disnake.SelectOption(label="BNB", description="바이낸스코인 (Binance Coin)", value="bnb")
        ]
        super().__init__(placeholder="코인을 선택해주세요", options=options)

    async def callback(self, interaction):
        try:
            # Avoid timeout by deferring first
            await interaction.response.defer(ephemeral=True)
            user_data = get_verified_user(interaction.author.id)
            if not user_data:
                embed = disnake.Embed(
                    title="**오류**",
                    description="인증되지 않은 고객님입니다.",
                    color=0xff0000
                )
                await interaction.edit_original_response(embed=embed)
                return
                
            # 최소송금 금액 안내
            selected_coin = self.values[0]
            
            # 실시간 최소 송금 금액 조회
            min_amounts_krw = get_minimum_amounts_krw()
            min_krw = min_amounts_krw.get(selected_coin.upper(), 10000)
            min_amount = f"₩{min_krw:,}"
                
            embed = disnake.Embed(
                title=f"**{selected_coin.upper()} 송금**",
                description=f"최소 송금 금액: {min_amount}",
                color=0xffff00
            )
            embed.add_field(
                name="**네트워크를 선택해주세요!**",
                value="아래에서 네트워크를 선택하세요",
                inline=False
            )
            view = disnake.ui.View()
            view.add_item(NetworkDropdown(selected_coin))
            await interaction.edit_original_response(embed=embed, view=view)
        except Exception:
            embed = disnake.Embed(
                title="**오류**",
                description="처리 중 오류가 발생했습니다.",
                color=0xff0000
            )
            try:
                await interaction.edit_original_response(embed=embed)
            except:
                pass

class NetworkDropdown(disnake.ui.Select):
    def __init__(self, selected_coin):
        self.selected_coin = selected_coin
        
        # 코인별 지원 네트워크
        network_options = {
            'usdt': [
                disnake.SelectOption(label="BEP20", description="BSC Network", value="bep20"),
                disnake.SelectOption(label="TRC20", description="TRON Network", value="trc20")
            ],
            'trx': [
                disnake.SelectOption(label="TRC20", description="TRON Network", value="trc20")
            ],
            'ltc': [
                disnake.SelectOption(label="LTC", description="Litecoin Network", value="ltc")
            ],
            'bnb': [
            disnake.SelectOption(label="BEP20", description="BSC Network", value="bep20")
        ]
        }
        
        options = network_options.get(selected_coin.lower(), [
            disnake.SelectOption(label="BEP20", description="BSC Network", value="bep20")
        ])
        
        super().__init__(placeholder="네트워크를 선택해주세요", options=options)

    async def callback(self, interaction):
        try:
            await interaction.response.send_modal(AmountModal(self.values[0], self.selected_coin))
        except Exception as e:
            try:
                embed = disnake.Embed(
                    title="**오류**",
                    description="처리 중 오류가 발생했습니다.",
                    color=0xff0000
                )
                await interaction.response.send_message(embed=embed, ephemeral=True)
            except Exception:
                try:
                    await interaction.edit_original_response(embed=embed)
                except Exception:
                    pass

pending_transactions = {}

async def handle_amount_modal(interaction):
    try:
        # 응답 지연 (3초 제한 해결)
        await interaction.response.defer(ephemeral=True)
        
        amount_str = interaction.text_values.get("amount", "").strip()
        address = interaction.text_values.get("address", "").strip()
        
        if not amount_str or not address:
            embed = disnake.Embed(
                title="**오류**",
                description="모든 필드를 입력해주세요.",
                color=0xff0000
            )
            await interaction.edit_original_response(embed=embed)
            return
        
        try:
            krw_amount = float(amount_str)
            if krw_amount <= 0:
                raise ValueError("양수여야 합니다")
        except (ValueError, TypeError):
            embed = disnake.Embed(
                title="**오류**",
                description="올바른 숫자를 입력해주세요.",
                color=0xff0000
            )
            await interaction.edit_original_response(embed=embed)
            return
        
        # 커스텀 ID에서 코인과 네트워크 정보 추출
        custom_id_parts = interaction.custom_id.split('_')
        network = custom_id_parts[-2] if len(custom_id_parts) >= 3 else "bep20"
        coin = custom_id_parts[-1] if len(custom_id_parts) >= 4 else "usdt"
        
        # 통일된 최소 송금 금액 조회
        min_amounts_krw = get_minimum_amounts_krw()
        min_amount_krw = min_amounts_krw.get(coin.upper(), 10000)
        coin_unit = coin.upper()
        
        # 원화 금액을 코인 단위로 변환 (통일된 함수 사용)
        amount = krw_to_coin_amount(krw_amount, coin.upper())
        
        # 환율 및 김치프리미엄 조회
        krw_rate = get_exchange_rate()
        coin_price = get_coin_price(coin.upper())
        kimchi_premium = get_kimchi_premium()
        actual_krw_rate = krw_rate * (1 + kimchi_premium / 100)
        
        if krw_amount < min_amount_krw:
            embed = disnake.Embed(
                title="**오류**",
                description=f"출금 최소 금액은 ₩{min_amount_krw:,}입니다.",
                color=0xff0000
            )
            await interaction.edit_original_response(embed=embed)
            return
        
        user_data = get_verified_user(interaction.author.id)
        if not user_data:
            embed = disnake.Embed(
                title="**오류**",
                description="인증되지 않은 고객님 입니다.",
                color=0xff0000
            )
            await interaction.edit_original_response(embed=embed)
            return
        
        # 코인 가격 조회
        coin_price = get_coin_price(coin.upper())
        if coin_price <= 0:
            embed = disnake.Embed(
                title="**오류**",
                description="코인 가격을 조회할 수 없습니다.",
                color=0xff0000
            )
            await interaction.edit_original_response(embed=embed)
            return
        
        # 수수료 계산 (5% + 김치프리미엄% + 거래소 송금 수수료)
        fee_rate = 0.05 + (kimchi_premium / 100)  # 5% + 김치프리미엄%
        
        # 거래소 송금 수수료 (원화)
        transaction_fee = get_transaction_fee(coin.upper(), network.upper())
        exchange_fee_krw = transaction_fee * coin_price * actual_krw_rate
        
        # 사용자 입력 금액을 원화로 변환
        user_input_krw = amount * coin_price * actual_krw_rate
        
        # 수수료 계산 (입력 금액의 5% + 김치프리미엄% + 거래소 송금 수수료)
        service_fee_krw = user_input_krw * fee_rate
        total_fee_krw = service_fee_krw + exchange_fee_krw
        
        # 실제 송금할 금액 (입력 금액 - 총 수수료)
        actual_send_krw = user_input_krw - total_fee_krw
        
        # 실제 송금할 코인 양 계산
        actual_send_amount = actual_send_krw / (coin_price * actual_krw_rate)
        
        # 차감할 총 금액 (사용자 입력 금액)
        krw_amount = int(user_input_krw)
        
        current_balance = user_data[6] if len(user_data) > 6 else 0
        
        if current_balance < krw_amount:
            embed = disnake.Embed(
                title="**잔액 부족**",
                description=f"보유 금액: {current_balance:,}원\n필요금액: {krw_amount:,}원",
                color=0xff0000
            )
            await interaction.edit_original_response(embed=embed)
            return
        
        network_name = network.upper()
        
        pending_transactions[interaction.author.id] = {
            'send_amount': actual_send_amount,  # 실제 송금할 코인 양
            'total_amount': user_input_krw,     # 사용자 입력 금액
            'krw_amount': krw_amount,           # 차감할 총 금액
            'network': network_name,
            'address': address,
            'krw_rate': krw_rate,
            'actual_krw_rate': actual_krw_rate,
            'kimchi_premium': kimchi_premium,
            'coin': coin.upper(),
            'coin_price': coin_price,
            'service_fee_krw': service_fee_krw, # 서비스 수수료 (원화)
            'exchange_fee_krw': exchange_fee_krw, # 거래소 수수료 (원화)
            'total_fee_krw': total_fee_krw,     # 총 수수료 (원화)
            'actual_send_krw': actual_send_krw, # 실제 송금 금액 (원화)
            'fee_rate': fee_rate                # 수수료율 (5% + 김치프리미엄%)
        }
        
        embed = disnake.Embed(
            title=f"**{coin_unit} 송금 준비완료**",
            color=0xffff00
        )
        
        # 송금 금액 정보 (김치프리미엄 적용)
        embed.add_field(
            name="**💰 실제 송금 금액**",
            value=f"```{actual_send_amount:.6f} {coin_unit}\n₩{int(actual_send_krw):,}```",
            inline=True
        )
        embed.add_field(
            name="**💸 수수료 (5% + 김프 + 거래소)**",
            value=f"```서비스: ₩{int(service_fee_krw):,}\n거래소: ₩{int(exchange_fee_krw):,}\n총합: ₩{int(total_fee_krw):,}```",
            inline=True
        )
        embed.add_field(
            name="**💳 총 차감금액**",
            value=f"```₩{krw_amount:,}```",
            inline=True
        )
        
        embed.add_field(
            name="**🌐 네트워크**",
            value=f"```{network_name}```",
            inline=True
        )
        embed.add_field(
            name="**📍 수신 주소**",
            value=f"```{address}```",
            inline=False
        )
        
        embed.add_field(
            name="**📊 환율 정보**",
            value=f"```기본환율: ₩{krw_rate:.0f}\n김치프리미엄: {kimchi_premium:+.2f}%\n실제환율: ₩{actual_krw_rate:.0f}```",
            inline=False
        )
        
        send_btn = disnake.ui.Button(
            label="송금하기",
            style=disnake.ButtonStyle.red,
            custom_id="송금하기"
        )
        
        view = disnake.ui.View()
        view.add_item(send_btn)
        
        # 최초 defer 후에는 원본 응답 수정으로 전송
        await interaction.edit_original_response(embed=embed, view=view)
        
    except Exception:
        embed = disnake.Embed(
            title="**오류**",
            description="처리 중 오류가 발생했습니다.",
            color=0xff0000
        )
        await interaction.edit_original_response(embed=embed)

async def handle_send_button(interaction):
    try:
        # 응답 지연 (3초 제한 해결)
        await interaction.response.defer(ephemeral=True)
        
        user_data = get_verified_user(interaction.author.id)
        if not user_data:
            embed = disnake.Embed(
                title="**오류**",
                description="인증되지 않은 고객님 입니다.",
                color=0xff0000
            )
            await interaction.edit_original_response(embed=embed)
            return
        
        transaction_data = pending_transactions.get(interaction.author.id)
        if not transaction_data:
            embed = disnake.Embed(
                title="**오류**",
                description="송금 정보를 찾을 수 없습니다. 다시 시도해주세요.",
                color=0xff0000
            )
            await interaction.edit_original_response(embed=embed)
            return
        
        send_amount = transaction_data.get('send_amount', 0)
        total_krw_amount = transaction_data.get('krw_amount', 0)
        network = transaction_data.get('network', 'BEP20').lower()
        address = transaction_data.get('address', '')
        
        if send_amount <= 0 or total_krw_amount <= 0 or not address:
            embed = disnake.Embed(
                title="**오류**",
                description="유효하지 않은 거래 정보입니다.",
                color=0xff0000
            )
            await interaction.edit_original_response(embed=embed)
            return
        
        processing_embed = disnake.Embed(
            title="**송금 처리중...**",
            description="잠시만 기다려주세요.",
            color=0xffff00
        )
        await interaction.edit_original_response(embed=processing_embed)
        
        if not subtract_balance(interaction.author.id, total_krw_amount):
            embed = disnake.Embed(
                title="**잔액 부족**",
                description="잔액이 부족합니다.",
                color=0xff0000
            )
            await interaction.edit_original_response(embed=embed)
            return
        
        # 수수료 차감 처리
        fee_krw = transaction_data.get('fee_krw', 0)
        if fee_krw > 0:
            add_transaction_history(interaction.author.id, int(fee_krw), "수수료")
        
        add_transaction_history(interaction.author.id, total_krw_amount, "송금")
        
        coin = transaction_data.get('coin', 'USDT')
        # 직접 송금 (자동 스왑 없음)
        transaction_result = simple_send_coin(coin, send_amount, address, network)
        
        if transaction_result and transaction_result.get('success', True):
            coin_name = transaction_result.get('coin', 'USDT')
            actual_send_krw = transaction_data.get('actual_send_krw', 0)
            service_fee_krw = transaction_data.get('service_fee_krw', 0)
            exchange_fee_krw = transaction_data.get('exchange_fee_krw', 0)
            total_fee_krw = transaction_data.get('total_fee_krw', 0)
            fee_rate = transaction_data.get('fee_rate', 0.05)
            
            success_embed = disnake.Embed(
                title=f"**{coin_name} 송금 성공**",
                color=0x00ff00
            )
            success_embed.add_field(name="**💰 실제 송금 금액**", value=f"```₩{int(actual_send_krw):,}```", inline=True)
            # 환율 정보를 상세 표기(기본환율, 김프, 실제환율)
            krw_rate = transaction_data.get('krw_rate', 0)
            kimchi_premium = transaction_data.get('kimchi_premium', 0)
            actual_rate = transaction_data.get('actual_krw_rate', 0)
            success_embed.add_field(
                name="**📊 환율 정보(상세)**",
                value=f"```기본환율: ₩{int(krw_rate):,}\n김치프리미엄: {kimchi_premium:+.2f}%\n실제환율: ₩{int(actual_rate):,}```",
                inline=False
            )
            success_embed.add_field(name="**💸 수수료 (5% + 김프 + 거래소)**", value=f"```서비스: ₩{int(service_fee_krw):,}\n거래소: ₩{int(exchange_fee_krw):,}\n총합: ₩{int(total_fee_krw):,}```", inline=True)
            success_embed.add_field(name="**💳 총 차감금액**", value=f"```₩{total_krw_amount:,}```", inline=True)
            success_embed.add_field(name="시간", value=f"```{transaction_result.get('time', 'N/A')}```", inline=False)
            success_embed.add_field(name="TXID", value=f"```{transaction_result.get('txid', 'N/A')}```", inline=False)
            success_embed.add_field(name="네트워크", value=f"```{transaction_result.get('network', 'N/A')}```", inline=False)
            success_embed.add_field(name="체인 수수료", value=f"```{transaction_result.get('fee', 'N/A')}```", inline=False)
            success_embed.add_field(name="보낸주소", value=f"```{transaction_result.get('to_address', 'N/A')}```", inline=False)
            success_embed.add_field(name="내역링크", value=f"```{transaction_result.get('share_link', 'N/A')}```", inline=False)
            success_embed.set_footer(text="오늘도 다영대행을 이용해주셔서 감사해요!")
            
            await interaction.edit_original_response(embed=success_embed)
            # 전송 상세 로그 채널 전송 및 구매 로그(익명)
            try:
                # 모든 송금/충전/명령어 로그는 관리자 로그로
                from bot import CHANNEL_ADMIN_LOG, CHANNEL_PURCHASE_LOG, bot as _bot
                admin_ch = _bot.get_channel(CHANNEL_ADMIN_LOG)
                if admin_ch:
                    t_embed = disnake.Embed(title="🚀 코인 송금 내역", color=0x00ff00)
                    t_embed.add_field(name="고객", value=f"{interaction.author.mention} ({interaction.author.id})", inline=False)
                    t_embed.add_field(name="총 차감금액", value=f"₩{total_krw_amount:,}", inline=True)
                    t_embed.add_field(name="실제 송금 KRW", value=f"₩{int(actual_send_krw):,}", inline=True)
                    t_embed.add_field(name="서비스 수수료", value=f"₩{int(service_fee_krw):,}", inline=True)
                    t_embed.add_field(name="거래소 수수료", value=f"₩{int(exchange_fee_krw):,}", inline=True)
                    t_embed.add_field(name="TXID", value=transaction_result.get('txid', 'N/A'), inline=False)
                    t_embed.add_field(name="네트워크", value=transaction_result.get('network', 'N/A'), inline=True)
                    t_embed.add_field(name="체인 수수료", value=f"{transaction_result.get('fee', 'N/A')}", inline=True)
                    t_embed.add_field(name="보낸주소", value=f"{transaction_result.get('to_address', 'N/A')}", inline=False)
                    await admin_ch.send(embed=t_embed)

                # 대행 구매 로그는 요청 포맷으로 구매 채널에 간단 전송
                purchase_ch = _bot.get_channel(CHANNEL_PURCHASE_LOG)
                if purchase_ch:
                    from bot import send_purchase_log
                    await send_purchase_log(interaction.author.id, transaction_result.get('coin', 'USDT'), int(total_krw_amount))
            except Exception:
                pass
            
            if interaction.author.id in pending_transactions:
                del pending_transactions[interaction.author.id]
                
        else:
            # 오류 정보 추출
            error_message = "알 수 없는 오류"
            if isinstance(transaction_result, dict) and 'error' in transaction_result:
                error_message = transaction_result['error']
            # 요청/계산 요약 만들기 (디버깅용)
            coin = transaction_data.get('coin', 'USDT')
            network = transaction_data.get('network', 'N/A')
            address = transaction_data.get('address', '')
            send_amount_dbg = transaction_data.get('send_amount', 0)
            total_krw_amount = transaction_data.get('krw_amount', 0)
            actual_send_krw = transaction_data.get('actual_send_krw', 0)
            service_fee_krw = transaction_data.get('service_fee_krw', 0)
            exchange_fee_krw = transaction_data.get('exchange_fee_krw', 0)
            
            # 김치프리미엄 정보 가져오기
            kimchi_premium = transaction_data.get('kimchi_premium', 0)
            fee_rate = transaction_data.get('fee_rate', 0.05)
            
            conn = None
            try:
                conn = sqlite3.connect('DB/verify_user.db')
                cursor = conn.cursor()
                cursor.execute('UPDATE users SET now_amount = now_amount + ? WHERE user_id = ?', 
                              (total_krw_amount, interaction.author.id))
                conn.commit()
            except (sqlite3.Error, OSError):
                pass
            except Exception:
                pass
            finally:
                if conn:
                    try:
                        conn.close()
                    except:
                        pass
            
            add_transaction_history(interaction.author.id, total_krw_amount, "환불")
            
            refund_embed = disnake.Embed(
                title="**송금 실패 - 환불 처리됨**",
                description=f"송금 중 오류가 발생하여 ₩{total_krw_amount:,}이 환불되었습니다.",
                color=0xff0000
            )
            refund_embed.add_field(
                name="**오류 원인**",
                value=f"```{error_message}```",
                inline=False
            )
            refund_embed.add_field(
                name="**요청 요약**",
                value=f"```코인: {coin}\n네트워크: {network}\n보낼양: {send_amount_dbg:.8f} {coin}\n주소: {address[:6]}...{address[-6:] if len(address)>12 else address}```",
                inline=False
            )
            refund_embed.add_field(
                name="**환불 금액**",
                value=f"```₩{total_krw_amount:,}```",
                inline=True
            )
            refund_embed.add_field(
                name="**처리 시간**",
                value=f"```{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}```",
                inline=True
            )
            refund_embed.add_field(
                name="**김치프리미엄**",
                value=f"```{kimchi_premium:+.2f}%```",
                inline=True
            )
            refund_embed.add_field(
                name="**수수료율**",
                value=f"```{fee_rate*100:.1f}% (5% + 김프)```",
                inline=True
            )
            
            await interaction.edit_original_response(embed=refund_embed)
            
            if interaction.author.id in pending_transactions:
                del pending_transactions[interaction.author.id]
            
            # 실패 로그를 전송 채널에 기록
            try:
                from bot import CHANNEL_ADMIN_LOG, bot as _bot
                admin_ch = _bot.get_channel(CHANNEL_ADMIN_LOG)
                if admin_ch:
                    f_embed = disnake.Embed(title="❌ 코인 송금 실패", color=0xff0000)
                    f_embed.add_field(name="고객", value=f"{interaction.author.mention} ({interaction.author.id})", inline=False)
                    f_embed.add_field(name="환불 금액", value=f"₩{total_krw_amount:,}", inline=True)
                    f_embed.add_field(name="코인/네트워크", value=f"{coin} / {network}", inline=True)
                    f_embed.add_field(name="보낼양", value=f"{send_amount_dbg:.8f} {coin}", inline=True)
                    f_embed.add_field(name="실제 송금 KRW", value=f"₩{int(actual_send_krw):,}", inline=True)
                    f_embed.add_field(name="수수료(서비스/거래소)", value=f"₩{int(service_fee_krw):,} / ₩{int(exchange_fee_krw):,}", inline=True)
                    if address:
                        f_embed.add_field(name="주소", value=address, inline=False)
                    f_embed.add_field(name="오류", value=f"```{error_message}```", inline=False)
                    await admin_ch.send(embed=f_embed)
            except Exception:
                pass
            
    except Exception:
        try:
            embed = disnake.Embed(
                title="**처리 중 오류 발생**",
                description="직원에게 문의해주세요.",
                color=0xff0000
            )
            await interaction.edit_original_response(embed=embed)
        except:
            pass

def init_coin_selenium():
    return True

def quit_driver():
    pass
