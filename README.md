# WhatsApp 단톡방 요약 알림

지정한 WhatsApp 단톡방에 메시지가 **10개** 쌓일 때마다 Claude가 한국어로 요약해서 내 WhatsApp으로 알림을 보내 줍니다.

```
단톡방 메시지 ──webhook──▶ 이 서버 ──(10개 모이면)──▶ Claude 요약 ──▶ WhatsApp으로 나에게 전송
```

알림 예시:

```
📋 *가족방 새 메시지 10개 요약*
🕒 10. 20. 14:01 ~ 10. 20. 14:35

내일 저녁 7시 강남역에서 모이기로 정리됨.
• 장소: 강남역 11번 출구 앞, 식당은 민수가 예약
• 회비는 1인 3만 원
✅ 결정/할 일: 민수 — 오늘 중 식당 예약
❓ 답변 필요: Jane이 주차 가능한지 물어봄
```

## 먼저 알아 둘 제약

- **단톡방은 WhatsApp Cloud API의 Groups API로 만든 그룹이어야 합니다.** Cloud API에 등록된 비즈니스 번호는 휴대폰 WhatsApp 앱에서 쓸 수 없어서, 기존 개인 단톡방에 초대할 수 없습니다. Groups API로 비즈니스 번호가 그룹을 만들고 초대 링크로 사람들을 부르면, 그 그룹의 메시지가 webhook으로 들어옵니다 (메시지에 `group_id`가 붙어서 옵니다).
- **알림은 24시간 대화창 안에서만 갑니다.** WhatsApp은 받는 사람이 최근 24시간 안에 비즈니스 번호로 메시지를 보낸 적이 있을 때만 자유 형식 텍스트를 보낼 수 있게 합니다. 알림이 안 오고 로그에 `code 131047`이 찍히면, `NOTIFY_TO` 번호에서 비즈니스 번호로 아무 메시지나 한 번 보내 주세요. 알림을 단톡방 자체로 받고 싶다면 `NOTIFY_RECIPIENT_TYPE=group`, `NOTIFY_TO=<group_id>`로 설정하면 됩니다.
- 리액션(👍 등)은 개수에 넣지 않습니다. 사진·파일·음성 같은 미디어는 `[사진] 캡션`처럼 표시해서 셉니다.

## 설정

1. **의존성 설치** (Node.js 20.12 이상)

   ```bash
   npm install
   cp .env.example .env
   ```

2. **`.env` 채우기** — 각 항목 설명은 `.env.example`에 있습니다.
   - `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`: Meta for Developers > 내 앱 > WhatsApp > API 설정 / 앱 설정
   - `WEBHOOK_VERIFY_TOKEN`: 직접 정하는 아무 문자열
   - `NOTIFY_TO`: 알림 받을 내 번호 (예: `821012345678`)
   - `ANTHROPIC_API_KEY`: Claude API 키

   토큰과 키는 `.env`나 호스팅 서비스의 환경변수에만 넣고, 코드나 git에는 넣지 마세요.

3. **공개 HTTPS 주소로 서버 띄우기** — Meta가 webhook을 보내려면 인터넷에서 접근 가능한 HTTPS 주소가 필요합니다. Render, Railway, Fly.io 같은 곳에 배포하거나, 테스트할 때는 `ngrok http 3000`을 쓰면 됩니다.

   ```bash
   npm start
   ```

4. **Meta에 webhook 등록** — WhatsApp > 구성 > Webhook
   - 콜백 URL: `https://<내 주소>/webhook`
   - 확인 토큰: `.env`의 `WEBHOOK_VERIFY_TOKEN`과 같은 값
   - Webhook 필드에서 `messages` 구독

5. **단톡방 `group_id` 찾기** — `TARGET_GROUP_ID`를 비워 둔 채로 실행하고 단톡방에 메시지를 하나 보내면 로그에 이렇게 찍힙니다.

   ```
   [미등록 단톡방] group_id=120363000000000001 보낸사람=민수 내용="안녕"
   ```

   이 값을 `.env`에 `TARGET_GROUP_ID=120363000000000001=가족방`처럼 넣고 다시 시작하면 끝입니다. 여러 단톡방은 쉼표로 구분합니다.

## 동작 세부

- 쌓인 메시지는 `data/state.json`에 저장되어 서버를 재시작해도 이어서 셉니다.
- Meta가 같은 webhook을 다시 보내도 메시지 ID로 걸러서 두 번 세지 않습니다.
- 요약이나 전송이 실패하면 메시지를 버리지 않고 보관했다가, 다음 메시지가 들어올 때 다시 시도합니다.
- 요약 모델은 `claude-opus-5-5`이고 `CLAUDE_MODEL`로 바꿀 수 있습니다. 메시지 개수는 `BATCH_SIZE`로 조정합니다.

## 테스트

```bash
npm test
```

## 파일 구성

| 파일 | 역할 |
|---|---|
| `src/index.js` | 설정을 읽고 서버를 띄움 |
| `src/app.js` | webhook HTTP 처리 (구독 확인, 서명 검증) |
| `src/whatsapp.js` | webhook에서 단톡방 메시지 추출, 메시지 전송 |
| `src/batcher.js` | 단톡방별로 메시지를 모으고 10개마다 요약·전송 |
| `src/summarizer.js` | Claude로 한국어 요약 |
| `src/store.js` | 쌓인 메시지를 파일에 저장 |
| `src/format.js` | 시간·알림 문구 형식 |
