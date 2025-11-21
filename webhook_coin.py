import requests
import json
from datetime import datetime

# 웹훅 URL 설정 (실제 사용시 변경 필요)
WEBHOOK_URL = "https://discord.com/api/webhooks/1403115128169173022/LAjI--ubblfRHQ5oOrLs2gIJJulsYd_TFa-VYlQg2N9YP1B8XbEK"

def send_transaction_webhook(username, amount):
    """
    거래 완료 웹훅 전송
    """
    try:
        if not WEBHOOK_URL:
            return
        
        embed = {
            "title": "💰 코인 송금 완료",
            "description": f"**{username}** 고객님이 코인 송금을 완료했습니다!",
            "color": 0x00ff00,
            "fields": [
                {
                    "name": "송금 금액",
                    "value": f"₩{amount:,}원",
                    "inline": True
                },
                {
                    "name": "시간",
                    "value": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "inline": True
                }
            ],
            "footer": {
                "text": "xdayoungx의 코인대행"
            }
        }
        
        payload = {
            "embeds": [embed]
        }
        
        response = requests.post(WEBHOOK_URL, json=payload, timeout=10)
        
        if response.status_code == 204:
            print(f"웹훅 전송 성공: {username} - ₩{amount:,}원")
        else:
            print(f"웹훅 전송 실패: {response.status_code}")
            
    except Exception as e:
        print(f"웹훅 전송 오류: {e}")

def send_error_webhook(error_message):
    """
    오류 발생 웹훅 전송
    """
    try:
        if not WEBHOOK_URL:
            return
        
        embed = {
            "title": "⚠️ 시스템 오류",
            "description": f"**오류 발생:** {error_message}",
            "color": 0xff0000,
            "timestamp": datetime.now().isoformat(),
            "footer": {
                "text": "xdayoungx의 코인대행"
            }
        }
        
        payload = {
            "embeds": [embed]
        }
        
        response = requests.post(WEBHOOK_URL, json=payload, timeout=10)
        
        if response.status_code == 204:
            print(f"오류 웹훅 전송 성공: {error_message}")
        else:
            print(f"오류 웹훅 전송 실패: {response.status_code}")
            
    except Exception as e:
        print(f"오류 웹훅 전송 오류: {e}")
