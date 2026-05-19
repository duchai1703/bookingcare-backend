'use strict';

const { v4: uuidv4 } = require('uuid');

function prepareHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];

  // 1. Lọc bỏ functionCall / functionResponse
  let filtered = rawHistory.filter(
    (msg) => msg.role !== 'functionCall' && msg.role !== 'functionResponse'
  );

  // 2. Lọc bỏ isLocal
  filtered = filtered.filter((msg) => msg.isLocal !== true);

  // 3. Gắn UUID
  filtered = filtered.map((msg) => ({
    ...msg,
    id: msg.id || uuidv4(),
  }));

  // 4. Sliding Window 2500 chars — Array.from chống Surrogate Mutilation
  let totalChars = 0;
  const windowMessages = [];

  for (let i = filtered.length - 1; i >= 0; i--) {
    const msg = filtered[i];
    const msgText =
      typeof msg.parts === 'string'
        ? msg.parts
        : Array.isArray(msg.parts)
          ? msg.parts.map((p) => p.text || '').join('')
          : '';

    const charCount = Array.from(msgText).length;
    if (totalChars + charCount > 2500) break;
    totalChars += charCount;
    windowMessages.unshift(msg);
  }

  // 5. Đảm bảo bắt đầu bằng 'user'
  while (windowMessages.length > 0 && windowMessages[0].role !== 'user') {
    windowMessages.shift();
  }

  return windowMessages;
}

module.exports = { prepareHistory };
