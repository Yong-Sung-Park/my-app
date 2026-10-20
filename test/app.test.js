import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { createHandler } from "../src/app.js";

const received = [];
let server;
let base;

before(async () => {
  server = createServer(
    createHandler({
      verifyToken: "my-verify-token",
      appSecret: "app-secret",
      onPayload: (payload) => received.push(payload),
      log: { warn() {}, error() {} },
    }),
  );
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const sign = (body) => `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;

test("Meta의 webhook 구독 확인에 challenge를 돌려준다", async () => {
  const ok = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=my-verify-token&hub.challenge=12345`);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "12345");

  const bad = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345`);
  assert.equal(bad.status, 403);
});

test("서명이 맞는 POST만 처리한다", async () => {
  const body = JSON.stringify({ entry: [] });

  const unsigned = await fetch(`${base}/webhook`, { method: "POST", body });
  assert.equal(unsigned.status, 401);
  assert.equal(received.length, 0);

  const signed = await fetch(`${base}/webhook`, {
    method: "POST",
    body,
    headers: { "X-Hub-Signature-256": sign(body) },
  });
  assert.equal(signed.status, 200);
  assert.deepEqual(received, [{ entry: [] }]);
});
