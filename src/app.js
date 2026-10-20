import { verifySignature } from "./whatsapp.js";

// webhook 본문 최대 크기 (Meta webhook은 이보다 훨씬 작다)
const MAX_BODY_BYTES = 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * WhatsApp Cloud API webhook 요청 핸들러.
 * GET /webhook: Meta의 구독 확인, POST /webhook: 메시지 수신 → onPayload(payload)
 */
export function createHandler({ verifyToken, appSecret, onPayload, log = console }) {
  return async function handler(req, res) {
    const url = new URL(req.url, "http://localhost");

    if (url.pathname === "/" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
      return;
    }
    if (url.pathname !== "/webhook") {
      res.writeHead(404).end();
      return;
    }

    if (req.method === "GET") {
      const ok =
        url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === verifyToken;
      if (ok) {
        res.writeHead(200, { "Content-Type": "text/plain" }).end(url.searchParams.get("hub.challenge") ?? "");
      } else {
        res.writeHead(403).end();
      }
      return;
    }

    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }

    let raw;
    try {
      raw = await readBody(req);
    } catch {
      res.writeHead(413).end();
      return;
    }
    if (appSecret && !verifySignature(raw, req.headers["x-hub-signature-256"], appSecret)) {
      log.warn("[webhook] 서명이 맞지 않는 요청을 거부했습니다");
      res.writeHead(401).end();
      return;
    }

    let payload;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      res.writeHead(400).end();
      return;
    }

    // Meta는 응답이 늦으면 같은 webhook을 재전송하므로 먼저 200을 돌려주고 처리한다.
    res.writeHead(200).end();
    Promise.resolve(onPayload(payload)).catch((err) => log.error(`[webhook] 처리 실패: ${err.stack ?? err}`));
  };
}
