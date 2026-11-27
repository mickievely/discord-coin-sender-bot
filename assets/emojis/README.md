# 봇 애플리케이션 이모지 (Bootstrap Icons)

- SVG 출처: **cdnjs.cloudflare.com** 의 `bootstrap-icons` 만 허용
- `catalog.json`: 키·이름·카테고리·아이콘 파일명
- `svg/`, `png/`: 동기화된 에셋 (128×128 흰색 PNG)
- `registry.json`: SHA256·URL 등 **공용 메타** (커밋)
- `registry.local.json`: 디스코드 앱 이모지 ID (**gitignore**, 배포마다 생성)

## 명령

```bash
npm run emojis:sync      # CDN에서 SVG 받기 → PNG 변환 → registry.json 갱신
npm run emojis:register  # POST /applications/{id}/emojis (길드 이모지 아님)
```

환경 변수: `BOOTSTRAP_ICONS_VERSION` (기본 `1.11.3`)