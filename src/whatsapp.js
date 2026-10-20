import { createHmac, timingSafeEqual } from "node:crypto";

// WhatsApp 텍스트 메시지 본문 최대 길이
const MAX_TEXT_LENGTH = 4096;

const MEDIA_LABELS = {
  image: "사진",
  video: "동영상",
  audio: "음성 메시지",
  sticker: "스티커",
  document: "파일",
};

/** Meta가 보낸 webhook인지 X-Hub-Signature-256 헤더로 확인한다. */
export function verifySignature(rawBody, signatureHeader, appSecret) {
  if (typeof signatureHeader !== "string" || !signatureHeader.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`);
  const received = Buffer.from(signatureHeader);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** 메시지 한 개를 요약에 넣을 한 줄 텍스트로 바꾼다. 요약 대상이 아니면 null. */
function describe(message) {
  switch (message.type) {
    case "text":
      return message.text?.body ?? null;
    case "image":
    case "video":
    case "document": {
      const media = message[message.type] ?? {};
      const label =
        message.type === "document" && media.filename ? `파일: ${media.filename}` : MEDIA_LABELS[message.type];
      return media.caption ? `[${label}] ${media.caption}` : `[${label}]`;
    }
    case "audio":
    case "sticker":
      return `[${MEDIA_LABELS[message.type]}]`;
    case "location": {
      const { name, address } = message.location ?? {};
      return ["[위치]", name, address].filter(Boolean).join(" ");
    }
    case "contacts":
      return "[연락처 공유]";
    case "button":
      return message.button?.text ?? null;
    case "interactive":
      return message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? null;
    default:
      // reaction, unsupported, system 등은 메시지 개수에 넣지 않는다.
      return null;
  }
}

/** webhook payload에서 그룹(단톡방) 메시지만 꺼낸다. */
export function extractGroupMessages(payload) {
  const result = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value ?? {};
      const names = new Map((value.contacts ?? []).map((contact) => [contact.wa_id, contact.profile?.name]));
      for (const message of value.messages ?? []) {
        if (!message.group_id) continue;
        const text = describe(message);
        if (!text) continue;
        result.push({
          id: message.id,
          groupId: message.group_id,
          from: message.from,
          name: names.get(message.from) || message.from,
          text,
          timestamp: Number(message.timestamp) * 1000,
        });
      }
    }
  }
  return result;
}

/** 텍스트 메시지를 보낸다. recipientType이 "group"이면 `to`는 group_id. */
export async function sendText({ token, phoneNumberId, apiBase, apiVersion }, { to, recipientType }, body) {
  const response = await fetch(`${apiBase}/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: recipientType,
      to,
      type: "text",
      text: { body: [...body].slice(0, MAX_TEXT_LENGTH).join("") },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const { code, message } = data.error ?? {};
    // 131047: 받는 사람이 24시간 안에 비즈니스 번호로 메시지를 보낸 적이 없음
    const hint =
      code === 131047
        ? " — NOTIFY_TO 번호에서 비즈니스 번호로 아무 메시지나 먼저 보내 24시간 대화창을 열어 주세요"
        : "";
    throw new Error(`WhatsApp 전송 실패 (HTTP ${response.status}, code ${code}): ${message ?? "unknown"}${hint}`);
  }
  return data;
}
