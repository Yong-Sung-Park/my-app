export function formatTime(timestamp, timeZone) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(timestamp);
}

/** Claude에게 넘길 대화 기록: "[10. 20. 14:02] 민수: 내일 몇 시?" */
export function formatTranscript(messages, timeZone) {
  return messages.map((m) => `[${formatTime(m.timestamp, timeZone)}] ${m.name}: ${m.text}`).join("\n");
}

/** 사용자에게 보낼 알림 본문 */
export function formatNotification({ groupName, batch, summary, timeZone }) {
  const title = groupName ? `${groupName} 새 메시지 ${batch.length}개 요약` : `단톡방 새 메시지 ${batch.length}개 요약`;
  const range = `${formatTime(batch[0].timestamp, timeZone)} ~ ${formatTime(batch.at(-1).timestamp, timeZone)}`;
  return `📋 *${title}*\n🕒 ${range}\n\n${summary}`;
}
