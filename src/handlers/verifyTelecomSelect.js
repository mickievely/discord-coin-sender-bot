/** NICE 본인인증 통신사 선택 (StringSelect) 옵션 */

const TELECOM_SELECT = {
  id: "verify_telecom_select",
  placeholder: "통신사 선택",
  options: [
    { label: "SKT", value: "SKT", emojiKey: "telecom_skt" },
    { label: "KT", value: "KT", emojiKey: "telecom_kt" },
    { label: "LG U+", value: "LG", emojiKey: "telecom_lg" },
    { label: "알뜰폰", value: "MVNO", emojiKey: "telecom_mvno" },
  ],
};

const MVNO_SELECT = {
  id: "verify_mvno_select",
  placeholder: "알뜰폰 통신사 선택",
  options: [
    { label: "SKT 알뜰", value: "SKM", emojiKey: "telecom_skt" },
    { label: "KT 알뜰", value: "KTM", emojiKey: "telecom_kt" },
    { label: "LG U+ 알뜰", value: "LGM", emojiKey: "telecom_lg" },
  ],
};

const GENDER_SELECT = {
  id: "verify_gender_select",
  placeholder: "성별 선택",
  options: [
    { label: "남자", value: "M", emojiKey: "gender_male" },
    { label: "여자", value: "F", emojiKey: "gender_female" },
  ],
};

module.exports = { TELECOM_SELECT, MVNO_SELECT, GENDER_SELECT };