import requests
import json
from urllib.parse import quote
from PIL import Image
from io import BytesIO

def make_passapi(telecom):
    res = requests.get('https://bsb.scourt.go.kr/NiceCheck/checkplus_main.jsp')
    EncodeData = res.text.split('name="EncodeData" value="')[1].split('">')[0]
    
    session = requests.session()
    headers = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.7',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://bsb.scourt.go.kr',
        'Referer': 'https://bsb.scourt.go.kr/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }
    
    data = {
        'm': 'checkplusSerivce',
        'EncodeData': EncodeData,
        'param_r1': '',
        'param_r2': '',
        'param_r3': '',
    }
    
    res = session.post('https://nice.checkplus.co.kr/CheckPlusSafeModel/checkplus.cb', headers=headers, data=data)
    res = session.post('https://nice.checkplus.co.kr/cert/main/tracer', headers=headers)
    res = session.post('https://nice.checkplus.co.kr/cert/main/menu', headers=headers)
    
    data = {'selectMobileCo': telecom, 'os': 'Windows'}
    res = session.post('https://nice.checkplus.co.kr/cert/mobileCert/method', headers=headers, data=data)
    
    certInfoHash = res.text.split('name="certInfoHash" value="')[1].split('">')[0]
    
    data = {'certInfoHash': certInfoHash, 'mobileCertAgree': 'Y'}
    res = session.post('https://nice.checkplus.co.kr/cert/mobileCert/sms/certification', headers=headers, data=data)
    
    service_info = res.text.split('const SERVICE_INFO = "')[1].split('";')[0]
    captchaVersion = res.text.split('const captchaVersion = "')[1].split('";')[0]
    
    res = session.get(f'https://nice.checkplus.co.kr/cert/captcha/image/{captchaVersion}', headers=headers)
    return {"image": res.content, "service_info": service_info, "encodeData": EncodeData, "session": session}

def send_passapi(session, service_info, EncodeData, name, telecom, birth_1, birth_2, phone, captcha):
    headers = {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'ko-KR,ko;q=0.7',
        'Connection': 'keep-alive',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://nice.checkplus.co.kr',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'x-service-info': service_info,
    }
    
    data = {
        'userNameEncoding': quote(name, encoding='utf-8'),
        'mobileCertMethod': 'SMS',
        'mobileCo': telecom,
        'userName': name,
        'myNum1': birth_1,
        'myNum2': birth_2,
        'mobileNo': phone,
        'captchaAnswer': captcha,
    }
    
    response = session.post('https://nice.checkplus.co.kr/cert/mobileCert/sms/certification/proc', headers=headers, data=data)
    return response.text

def verify_passapi(session, service_info, telecom, verify_code):
    headers = {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'ko-KR,ko;q=0.7',
        'Connection': 'keep-alive',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'https://nice.checkplus.co.kr',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'x-service-info': service_info,
    }
    
    data = {'mobileCo': telecom, 'certCode': verify_code}
    res = session.post('https://nice.checkplus.co.kr/cert/mobileCert/sms/confirm/proc', headers=headers, data=data)
    return res.json()