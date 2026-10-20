import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// 중복 webhook을 거르기 위해 기억해 둘 최근 메시지 ID 개수
const SEEN_LIMIT = 1000;

/**
 * 단톡방별 메시지 버퍼를 JSON 파일에 저장한다. 서버가 재시작돼도 쌓인 메시지를 잃지 않는다.
 */
export async function openStore(file) {
  let state = { buffers: {}, seenIds: [] };
  try {
    state = JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  const seen = new Set(state.seenIds);
  let writing = Promise.resolve();

  const write = async () => {
    const snapshot = JSON.stringify({ buffers: state.buffers, seenIds: [...seen] });
    await mkdir(dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, snapshot);
    await rename(`${file}.tmp`, file);
  };

  return {
    /** groupId → 아직 요약하지 않은 메시지 배열 */
    buffers: state.buffers,

    hasSeen: (id) => seen.has(id),

    markSeen(id) {
      seen.add(id);
      if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value);
    },

    /** 쓰기를 순서대로 직렬화한다. 앞선 쓰기가 실패해도 다음 쓰기는 진행된다. */
    save() {
      writing = writing.then(write, write);
      return writing;
    },
  };
}
