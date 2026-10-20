import assert from "node:assert/strict";
import { test } from "node:test";
import { createSummarizer } from "../src/summarizer.js";

const messages = [
  { id: "m1", name: "민수", text: "내일 7시 어때?", timestamp: Date.UTC(2026, 9, 20, 5, 2) },
  { id: "m2", name: "Jane", text: "Sounds good", timestamp: Date.UTC(2026, 9, 20, 5, 3) },
];

function fakeClient(response) {
  const calls = [];
  return { calls, beta: { messages: { create: async (params) => (calls.push(params), response) } } };
}

test("대화 기록을 한국 시간으로 넣어 요청하고 텍스트만 돌려준다", async () => {
  const client = fakeClient({
    stop_reason: "end_turn",
    content: [
      { type: "thinking", thinking: "" },
      { type: "text", text: "  내일 7시 약속 확정  " },
    ],
  });
  const summarize = createSummarizer({ model: "claude-opus-5-5", timeZone: "Asia/Seoul" }, client);

  assert.equal(await summarize(messages), "내일 7시 약속 확정");

  const [params] = client.calls;
  assert.equal(params.model, "claude-opus-5-5");
  assert.equal(params.fallbacks, "default");
  assert.match(params.messages[0].content, /^<chat>\n\[10\. 20\. 14:02\] 민수: 내일 7시 어때\?\n\[10\. 20\. 14:03\] Jane: Sounds good\n<\/chat>$/);
});

test("거절되면 에러를 던진다", async () => {
  const client = fakeClient({ stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] });
  const summarize = createSummarizer({ model: "claude-opus-5-5", timeZone: "Asia/Seoul" }, client);
  await assert.rejects(summarize(messages), /거절/);
});
