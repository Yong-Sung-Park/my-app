import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createBatcher } from "../src/batcher.js";
import { openStore } from "../src/store.js";

const silent = { info() {}, warn() {}, error() {} };

const msg = (n, groupId = "G1") => ({
  id: `m${n}`,
  groupId,
  from: "8210",
  name: "민수",
  text: `메시지 ${n}`,
  timestamp: 1760000000000 + n * 1000,
});

async function setup({ batchSize = 3, summarize, notify } = {}) {
  const file = join(await mkdtemp(join(tmpdir(), "batcher-")), "state.json");
  const store = await openStore(file);
  const sent = [];
  const batcher = createBatcher({
    store,
    batchSize,
    groups: new Map([["G1", "가족방"]]),
    summarize: summarize ?? (async (batch) => `요약(${batch.map((m) => m.id).join(",")})`),
    notify: notify ?? (async (n) => sent.push(n)),
    log: silent,
  });
  return { file, store, batcher, sent };
}

test("batchSize개가 쌓이면 한 번 요약하고 버퍼를 비운다", async () => {
  const { batcher, store, sent } = await setup();

  await batcher.handle([msg(1), msg(2)]);
  assert.equal(sent.length, 0);

  await batcher.handle([msg(3), msg(4)]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].summary, "요약(m1,m2,m3)");
  assert.equal(sent[0].groupName, "가족방");
  assert.deepEqual(store.buffers.G1.map((m) => m.id), ["m4"]);
});

test("순서가 뒤섞여 와도 시간순으로 요약한다", async () => {
  const { batcher, sent } = await setup();
  await batcher.handle([msg(3), msg(1), msg(2)]);
  assert.equal(sent[0].summary, "요약(m1,m2,m3)");
});

test("한 번에 여러 묶음이 쌓이면 모두 보낸다", async () => {
  const { batcher, store, sent } = await setup();
  await batcher.handle([1, 2, 3, 4, 5, 6, 7].map((n) => msg(n)));
  assert.deepEqual(sent.map((n) => n.summary), ["요약(m1,m2,m3)", "요약(m4,m5,m6)"]);
  assert.deepEqual(store.buffers.G1.map((m) => m.id), ["m7"]);
});

test("중복 webhook과 미등록 단톡방 메시지는 세지 않는다", async () => {
  const { batcher, store, sent } = await setup();
  await batcher.handle([msg(1), msg(1), msg(2, "OTHER")]);
  await batcher.handle([msg(1)]);
  assert.equal(sent.length, 0);
  assert.deepEqual(store.buffers.G1.map((m) => m.id), ["m1"]);
  assert.equal(store.buffers.OTHER, undefined);
});

test("전송이 실패하면 메시지를 보관했다가 다음 메시지 때 다시 보낸다", async () => {
  let fail = true;
  const sent = [];
  const { batcher, store } = await setup({
    notify: async (n) => {
      if (fail) throw new Error("network down");
      sent.push(n);
    },
  });

  await batcher.handle([msg(1), msg(2), msg(3)]);
  assert.equal(sent.length, 0);
  assert.equal(store.buffers.G1.length, 3);

  fail = false;
  await batcher.handle([msg(4)]);
  assert.deepEqual(sent.map((n) => n.summary), ["요약(m1,m2,m3)"]);
  assert.deepEqual(store.buffers.G1.map((m) => m.id), ["m4"]);
});

test("요약 중에 들어온 메시지는 중복 요약 없이 다음 묶음으로 간다", async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const summarized = [];
  const { batcher, sent } = await setup({
    summarize: async (batch) => {
      summarized.push(batch.map((m) => m.id).join(","));
      if (summarized.length === 1) await gate;
      return "ok";
    },
  });

  const first = batcher.handle([msg(1), msg(2), msg(3)]);
  await new Promise((resolve) => setImmediate(resolve));
  const second = batcher.handle([msg(4), msg(5), msg(6)]);
  release();
  await Promise.all([first, second]);

  assert.deepEqual(summarized, ["m1,m2,m3", "m4,m5,m6"]);
  assert.equal(sent.length, 2);
});

test("재시작해도 쌓인 메시지와 처리한 ID가 유지된다", async () => {
  const { batcher, file } = await setup();
  await batcher.handle([msg(1), msg(2)]);

  const reopened = await openStore(file);
  assert.deepEqual(reopened.buffers.G1.map((m) => m.id), ["m1", "m2"]);
  assert.equal(reopened.hasSeen("m2"), true);
});
