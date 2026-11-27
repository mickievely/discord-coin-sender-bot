const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const { CookieJar } = require("tough-cookie");
const qs = require("qs");

const NICE_API = "https://nice.checkplus.co.kr";

function updateSessionHeaders(session, headers) {
  session.defaults.headers.common = headers;
  session.defaults.headers.post = headers;
  session.defaults.headers.get = headers;
  session.defaults.headers.put = headers;
  session.defaults.headers.patch = headers;
  session.defaults.headers.delete = headers;
}

class NiceApi {
  constructor() {
    const jar = new CookieJar();
    this.session = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        timeout: 30000,
        validateStatus: (s) => s >= 200 && s < 500,
      })
    );
    this.mobile_code = null;
    this.encodeData = null;
    this.service_info = null;
    this.captchaVersion = null;
    this.captchaImageStream = null;
    this.telecomLabel = null;
  }

  /** @param {string} mobile_code NICE 통신사 코드 (SK, KT, LG, SM, KM, LM) */
  async Initalize(mobile_code) {
    updateSessionHeaders(this.session, {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "ko-KR,ko;q=0.7",
      "Cache-Control": "max-age=0",
      Connection: "keep-alive",
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://bsb.scourt.go.kr",
      Referer: "https://bsb.scourt.go.kr/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    try {
      let res = await this.session.get(
        "https://bsb.scourt.go.kr/NiceCheck/checkplus_main.jsp"
      );
      if (!res.data?.includes?.('name="EncodeData" value="')) {
        return { success: false, error: "EncodeData 파싱 실패" };
      }
      const encodeData = res.data
        .split('name="EncodeData" value="')[1]
        .split('">')[0];

      await this.session.post(
        `${NICE_API}/CheckPlusSafeModel/checkplus.cb`,
        qs.stringify({
          m: "checkplusSerivce",
          EncodeData: encodeData,
          param_r1: "",
          param_r2: "",
          param_r3: "",
        })
      );

      await this.session.post(`${NICE_API}/cert/main/tracer`);
      await this.session.post(`${NICE_API}/cert/main/menu`);

      res = await this.session.post(
        `${NICE_API}/cert/mobileCert/method`,
        qs.stringify({
          selectMobileCo: mobile_code,
          os: "Windows",
        })
      );

      if (!res.data?.includes?.('name="certInfoHash" value="')) {
        return { success: false, error: "certInfoHash 파싱 실패" };
      }
      const certInfoHash = res.data
        .split('name="certInfoHash" value="')[1]
        .split('">')[0];

      res = await this.session.post(
        `${NICE_API}/cert/mobileCert/sms/certification`,
        qs.stringify({
          certInfoHash,
          mobileCertAgree: "Y",
        })
      );

      const service_info = res.data
        .split('const SERVICE_INFO = "')[1]
        .split('";')[0];
      const captchaVersion = res.data
        .split('const captchaVersion = "')[1]
        .split('";')[0];

      res = await this.session.get(
        `${NICE_API}/cert/captcha/image/${captchaVersion}`,
        { responseType: "arraybuffer" }
      );

      this.mobile_code = mobile_code;
      this.encodeData = encodeData;
      this.service_info = service_info;
      this.captchaVersion = captchaVersion;
      this.captchaImageStream = Buffer.from(res.data);
      this.telecomLabel = mobile_code;

      return {
        success: true,
        captchaVersion,
        captchaStream: this.captchaImageStream,
      };
    } catch (e) {
      return {
        success: false,
        error: e?.message || String(e),
      };
    }
  }

  async RequestCode(name, birth, gender, phone_number, captcha) {
    updateSessionHeaders(this.session, {
      Connection: "keep-alive",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: "https://nice.checkplus.co.kr",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "x-service-info": this.service_info,
    });

    try {
      const payload = qs.stringify({
        userNameEncoding: encodeURIComponent(name),
        userName: name,
        mobileCertMethod: "SMS",
        mobileCo: this.mobile_code,
        myNum1: birth,
        myNum2: gender,
        mobileNo: phone_number,
        captchaAnswer: captcha,
      });

      const res = await this.session.post(
        `${NICE_API}/cert/mobileCert/sms/certification/proc`,
        payload
      );
      return { success: true, result: res.data, status: res.status };
    } catch (e) {
      return { success: false, error: e?.message || String(e) };
    }
  }

  async VerifyCode(verify_code) {
    updateSessionHeaders(this.session, {
      Connection: "keep-alive",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: "https://nice.checkplus.co.kr",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "x-service-info": this.service_info,
    });

    try {
      const res = await this.session.post(
        `${NICE_API}/cert/mobileCert/sms/confirm/proc`,
        qs.stringify({
          mobileCo: this.mobile_code,
          certCode: verify_code,
        })
      );
      return { success: true, result: res.data, status: res.status };
    } catch (e) {
      return { success: false, error: e?.message || String(e) };
    }
  }
}

module.exports = { NiceApi, NICE_API };