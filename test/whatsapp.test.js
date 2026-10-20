import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { extractGroupMessages, verifySignature } from "../src/whatsapp.js";

const groupPayload = (messages, contacts = []) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "WABA_ID", changes: [{ field: "messages", value: { messaging_product: "whatsapp", contacts, messages } }] }],
});

test("그룹 메시지만 꺼내고 보낸 사람 이름을 붙인다", () => {
  const payload = groupPayload(
    [
      { id: "m1", from: "821011112222", group_id: "G1", timestamp: "1760000000", type: "text", text: { body: "안녕" } },
      { id: "m2", from: "821033334444", timestamp: "1760000001", type: "text", text: { body: "1:1 메시지" } },
    ],
    [{ wa_id: "821011112222", profile: { name: "민수" } }],
  );

  assert.deepEqual(extractGroupMessages(payload), [
    { id: "m1", groupId: "G1", from: "821011112222", name: "민수", text: "안녕", timestamp: 1760000000000 },
  ]);
});

test("미디어는 라벨과 캡션으로, 리액션은 제외한다", () => {
  const base = { from: "8210", group_id: "G1", timestamp: "1760000000" };
  const payload = groupPayload([
    { ...base, id: "a", type: "image", image: { caption: "오늘 사진" } },
    { ...base, id: "b", type: "document", document: { filename: "회의록.pdf" } },
    { ...base, id: "c", type: "reaction", reaction: { emoji: "👍", message_id: "a" } },
    { ...base, id: "d", type: "location", location: { name: "강남역" } },
  ]);

  assert.deepEqual(
    extractGroupMessages(payload).map((m) => [m.id, m.text, m.name]),
    [
      ["a", "[사진] 오늘 사진", "8210"],
      ["b", "[파일: 회의록.pdf]", "8210"],
      ["d", "[위치] 강남역", "8210"],
    ],
  );
});

test("messages 이외의 필드와 빈 payload는 무시한다", () => {
  assert.deepEqual(extractGroupMessages({}), []);
  assert.deepEqual(extractGroupMessages({ entry: [{ changes: [{ field: "statuses", value: {} }] }] }), []);
});

test("webhook 서명을 검증한다", () => {
  const body = Buffer.from('{"hello":"world"}');
  const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;

  assert.equal(verifySignature(body, signature, "secret"), true);
  assert.equal(verifySignature(body, signature, "other-secret"), false);
  assert.equal(verifySignature(body, "sha256=abc", "secret"), false);
  assert.equal(verifySignature(body, undefined, "secret"), false);
});
