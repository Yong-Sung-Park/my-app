const byTime = (a, b) => a.timestamp - b.timestamp;

/**
 * 지정한 단톡방의 메시지를 모으다가 batchSize개가 되면 요약해서 알림을 보낸다.
 * 요약이나 전송이 실패하면 메시지를 버퍼에 그대로 두고, 다음 메시지가 들어올 때 다시 시도한다.
 */
export function createBatcher({ store, batchSize, groups, summarize, notify, log = console }) {
  const inFlight = new Set();

  async function drain(groupId) {
    if (inFlight.has(groupId)) return;
    inFlight.add(groupId);
    try {
      while ((store.buffers[groupId]?.length ?? 0) >= batchSize) {
        const batch = store.buffers[groupId].sort(byTime).slice(0, batchSize);
        const summary = await summarize(batch);
        await notify({ groupId, groupName: groups.get(groupId), batch, summary });

        const sent = new Set(batch.map((m) => m.id));
        store.buffers[groupId] = store.buffers[groupId].filter((m) => !sent.has(m.id));
        await store.save();
        log.info(`[요약 전송] group_id=${groupId} 메시지 ${batch.length}개`);
      }
    } catch (err) {
      log.error(`[요약 실패] group_id=${groupId} — 메시지는 보관하고 다음 메시지가 오면 다시 시도합니다: ${err.message}`);
    } finally {
      inFlight.delete(groupId);
    }
  }

  async function handle(messages) {
    const touched = new Set();
    for (const message of messages) {
      if (store.hasSeen(message.id)) continue;
      store.markSeen(message.id);

      if (!groups.has(message.groupId)) {
        // 처음 설정할 때 이 로그로 단톡방의 group_id를 찾는다.
        log.info(
          `[미등록 단톡방] group_id=${message.groupId} 보낸사람=${message.name} 내용="${message.text.slice(0, 30)}"`,
        );
        continue;
      }
      (store.buffers[message.groupId] ??= []).push(message);
      touched.add(message.groupId);
      log.info(`[수집] group_id=${message.groupId} ${store.buffers[message.groupId].length}/${batchSize}`);
    }
    await store.save();
    await Promise.all([...touched].map(drain));
  }

  return { handle };
}
