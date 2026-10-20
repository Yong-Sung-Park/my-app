import { createServer } from "node:http";
import { createHandler } from "./app.js";
import { createBatcher } from "./batcher.js";
import { loadConfig } from "./config.js";
import { formatNotification } from "./format.js";
import { openStore } from "./store.js";
import { createSummarizer } from "./summarizer.js";
import { extractGroupMessages, sendText } from "./whatsapp.js";

const config = loadConfig();
const store = await openStore(config.dataFile);

const batcher = createBatcher({
  store,
  batchSize: config.batchSize,
  groups: config.groups,
  summarize: createSummarizer(config),
  notify: ({ groupName, batch, summary }) =>
    sendText(
      config.whatsapp,
      config.notify,
      formatNotification({ groupName, batch, summary, timeZone: config.timeZone }),
    ),
});

const handler = createHandler({
  verifyToken: config.whatsapp.verifyToken,
  appSecret: config.whatsapp.appSecret,
  onPayload: (payload) => batcher.handle(extractGroupMessages(payload)),
});

createServer(handler).listen(config.port, () => {
  console.info(`[시작] http://localhost:${config.port}/webhook 에서 대기 중 (메시지 ${config.batchSize}개마다 요약)`);
  if (config.groups.size === 0) {
    console.warn("[설정] TARGET_GROUP_ID가 비어 있습니다. 단톡방에 메시지를 보내면 로그에 group_id가 찍힙니다.");
  }
  if (!config.whatsapp.appSecret) {
    console.warn("[설정] WHATSAPP_APP_SECRET이 없어 webhook 서명을 확인하지 않습니다. 운영 환경에서는 꼭 설정하세요.");
  }
});
