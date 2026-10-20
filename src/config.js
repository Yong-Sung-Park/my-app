import { existsSync } from "node:fs";

const REQUIRED = ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WEBHOOK_VERIFY_TOKEN", "NOTIFY_TO"];

/**
 * TARGET_GROUP_ID="120363...=가족방,120364..." → Map { "120363..." => "가족방", "120364..." => "" }
 */
export function parseGroups(raw = "") {
  const groups = new Map();
  for (const entry of raw.split(",")) {
    const [id, ...name] = entry.split("=");
    if (id.trim()) groups.set(id.trim(), name.join("=").trim());
  }
  return groups;
}

export function loadConfig(env = process.env) {
  if (env === process.env && existsSync(".env")) process.loadEnvFile(".env");

  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(`환경변수가 설정되지 않았습니다: ${missing.join(", ")} (.env.example 참고)`);
  }

  const batchSize = Number(env.BATCH_SIZE ?? 10);
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error(`BATCH_SIZE는 1 이상의 정수여야 합니다: ${env.BATCH_SIZE}`);
  }

  return {
    port: Number(env.PORT ?? 3000),
    whatsapp: {
      token: env.WHATSAPP_TOKEN,
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
      apiBase: env.WHATSAPP_API_BASE ?? "https://graph.facebook.com",
      apiVersion: env.WHATSAPP_API_VERSION ?? "v24.0",
      verifyToken: env.WEBHOOK_VERIFY_TOKEN,
      appSecret: env.WHATSAPP_APP_SECRET ?? "",
    },
    groups: parseGroups(env.TARGET_GROUP_ID),
    notify: {
      to: env.NOTIFY_TO,
      recipientType: env.NOTIFY_RECIPIENT_TYPE ?? "individual",
    },
    batchSize,
    model: env.CLAUDE_MODEL ?? "claude-opus-5-5",
    timeZone: env.DISPLAY_TIMEZONE ?? "Asia/Seoul",
    dataFile: env.DATA_FILE ?? "data/state.json",
  };
}
