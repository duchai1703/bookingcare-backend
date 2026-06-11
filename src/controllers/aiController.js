'use strict';

// ═══════════════════════════════════════════════════════════════════════
// [Phase 12.2] AI Controller — SSE Streaming with 29 Guards
// ═══════════════════════════════════════════════════════════════════════

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { executeFunctionCall, aiFunctions, aiAuthFunctions } = require('../services/aiFunctionHandlers');
const { SYSTEM_PROMPT } = require('../services/aiService');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'MISSING_KEY');

// ═══ [Guard #2] Concurrent Stream Counter ═══
let activeStreams = 0;
const MAX_STREAMS = 15;

// ═══════════════════════════════════════════════════════════════════════
// streamChat — POST /api/v1/ai/chat
// SSE streaming với 29 guards từ Phase 1-12
// ═══════════════════════════════════════════════════════════════════════
async function streamChat(req, res) {

  // [DEVOPS GUARD] Chặn sập server ngầm do thiếu cấu hình .env
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'PLEASE_ENTER_YOUR_REAL_API_KEY_HERE') {
    console.error("[CRITICAL FATAL] Lỗi cấu hình: Chưa khai báo GEMINI_API_KEY hợp lệ trong file .env!");
    if (res && typeof res.status === 'function') {
      return res.status(500).json({ error: 'Hệ thống AI đang bảo trì cấu hình (Thiếu API Key). Vui lòng liên hệ quản trị viên.' });
    }
    throw new Error("Missing GEMINI_API_KEY");
  }

  // ──── [Guard #1 — Kill-Switch] ────
  if (process.env.AI_CHATBOT_ENABLED !== 'true') {
    if (res && typeof res.status === 'function') {
      return res.status(403).json({ error: 'Tính năng AI Chatbot hiện đang bị vô hiệu hóa.' });
    }
    throw new Error("AI Chatbot disabled");
  }

  // ──── [Guard #2 — Max 15 Streams] ────
  if (activeStreams >= MAX_STREAMS) {
    return res.status(503).json({
      errCode: -4,
      message: 'Server đang bận. Vui lòng thử lại sau.',
    });
  }

  // ──── [Guard #3 — Check Active User] ────
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      errCode: -1,
      message: 'Chưa đăng nhập.',
    });
  }

  // ──── [Guard #4 — Limit UserID — parseInt + isFinite] ────
  const userId = parseInt(String(req.user.id), 10);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({
      errCode: 1,
      message: 'userId không hợp lệ.',
    });
  }

  // ──── [Guard #5 — ParseInt + Validate Body] ────
  const { message, history = [] } = req.body;
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({
      errCode: 1,
      message: 'Thiếu nội dung tin nhắn.',
    });
  }

  console.log('[AI_STREAM] 1. Đã nhận request từ Frontend. Câu hỏi:', message);

  // ──── [Guard #6 — Unicode Capping — 2500 chars] ────
  const safeMessage = Array.from(message.trim()).slice(0, 2500).join('');

  // ──── [Guard #7 — Zalgo Clean — Zero-width Regex] ────
  const cleanMessage = safeMessage
    .replace(/[\u0300-\u036f]{3,}/g, '')
    .replace(/[\u200B-\u200F\uFEFF]/g, '');

  const parseFunctionResult = (value) => {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string') return { error: 'Invalid function result' };
    const start = '---DB_RESULT---\n';
    const end = '\n---/DB_RESULT---';
    if (value.includes(start)) {
      const raw = value.split(start)[1]?.split(end)[0] || '';
      try { return JSON.parse(raw); } catch { return { error: 'Invalid function result JSON' }; }
    }
    try { return JSON.parse(value); } catch { return { error: 'Invalid function result JSON' }; }
  };

  const extractScheduleRequest = (text) => {
    if (typeof text !== 'string') return null;
    const nameMatch = text.match(/b\s*a\s*c\s*s\s*i\s*\s+([A-Za-zÀ-ỹ\.\s]+?)(?:\s+v\s*a\s*|\s+ng\s*a\s*y|$)/i);
    const dateMatch = text.match(/\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4}|ng\s*a\s*y\s*\d{1,2}\s*th\s*a\s*ng\s*\d{1,2}(?:\s*n\s*a\s*m\s*\d{4})?/i);
    const doctorName = nameMatch?.[1]?.trim();
    const date = dateMatch?.[0]?.trim();
    if (!doctorName || !date) return null;
    return { doctorName, date };
  };

  const extractDateLabel = (text) => {
    if (typeof text !== 'string') return null;
    const match = text.match(/\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4}|ng\s*a\s*y\s*\d{1,2}\s*th\s*a\s*ng\s*\d{1,2}(?:\s*n\s*a\s*m\s*\d{4})?/i);
    return match ? match[0].trim() : null;
  };

  const extractSpecialtyName = (text) => {
    if (typeof text !== 'string') return null;
    const match = text.match(/ch\s*u\s*y\s*e\s*n\s*k\s*h\s*o\s*a\s*([A-Za-zÀ-ỹ\s]+?)(?:\s+v\s*a\s*|\s+ng\s*a\s*y|\s+tr\s*o\s*n\s*g|$)/i);
    return match ? match[1].trim() : null;
  };

  const formatDateLabel = (dateObj) => {
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const getUpcomingDates = (days) => {
    const result = [];
    const now = new Date();
    for (let i = 0; i < days; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      result.push(formatDateLabel(d));
    }
    return result;
  };

  const findLatestFromHistory = (extractor) => {
    if (!Array.isArray(history)) return null;
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const msg = history[i];
      const text = typeof msg?.text === 'string'
        ? msg.text
        : (typeof msg?.parts === 'string'
          ? msg.parts
          : msg?.parts?.[0]?.text || '');
      const value = extractor(text);
      if (value) return value;
    }
    return null;
  };

  const formatScheduleResponse = (result, doctorName, dateLabel) => {
    if (!result || result.error) {
      return result?.error || 'Không thể kiểm tra lịch khám lúc này. Vui lòng thử lại.';
    }
    const resolvedName = result.doctorName || doctorName || 'bác sĩ';
    if (Array.isArray(result.schedules) && result.schedules.length === 0) {
      return `Dạ, bác sĩ ${resolvedName} hiện không có lịch trống vào ngày ${dateLabel}. Bạn có muốn thử xem ngày khác không ạ?`;
    }
    if (Array.isArray(result.availableSlots) && result.availableSlots.length > 0) {
      const slots = result.availableSlots
        .map((s) => `• ${s.timeLabel || s.timeType} (còn ${s.remaining} suất)`)
        .join('\n');
      return `Dạ, lịch trống của bác sĩ ${resolvedName} vào ngày ${dateLabel} như sau:\n${slots}\n\nNếu bạn muốn đặt lịch, hãy truy cập [trang bác sĩ ${resolvedName}](/doctor/${result.doctorId}) để chọn khung giờ phù hợp ạ.`;
    }
    return `Dạ, hiện chưa có lịch trống cho bác sĩ ${resolvedName} vào ngày ${dateLabel}. Bạn có muốn thử xem ngày khác không ạ?`;
  };

  // ══════════════════════════════════════════════════════
  // SSE SETUP
  // ══════════════════════════════════════════════════════
  activeStreams++;
  const ac = new AbortController();
  const signal = ac.signal;
  let heartbeatInterval = null;
  let hardTimeoutHandle = null;
  let functionCallCount = 0;

  // ──── [Guard #8 — SSE Headers] ────
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': process.env.URL_REACT,
    'Access-Control-Allow-Credentials': 'true',
  });

  let isClientConnected = true;

  // ──── [Guard #9 — SSE Heartbeat — 15s] ────
  heartbeatInterval = setInterval(() => {
    if (!res.writableEnded) { res.write(':heartbeat\n\n'); }
  }, 15000);

  // ──── [Guard #10 — Hard Timeout 60s] ────
  hardTimeoutHandle = setTimeout(() => {
    ac.abort();
    if (!res.writableEnded) { res.write('data: [TIMEOUT]\n\n'); res.end(); }
  }, 60000);

  // ──── [Guard #11 — Ngắt kết nối vật lý] ────
  req.on('close', () => {
    isClientConnected = false;
    console.log('⚠️ [AI_STREAM] Client thực sự đã đóng Socket kết nối!');
  });

  // ──── [Guard #12 — Bẫy lỗi OS] ────
  res.on('error', (err) => {
    if (err.code !== 'ERR_STREAM_WRITE_AFTER_END') {
      console.error('[SSE res.error]', err.code);
    }
  });

  try {
    // ──── [Guard #24 — Gộp Role History] ────
    const geminiHistory = [];
    if (Array.isArray(history) && history.length > 0) {
      history.forEach((msg) => {
        const roleHint = msg?.sender || msg?.role;
        const role = roleHint === 'user' ? 'user' : 'model';
        const text = typeof msg?.text === 'string'
          ? msg.text
          : (typeof msg?.parts === 'string'
            ? msg.parts
            : msg?.parts?.[0]?.text || '');
        if (text && text.trim() !== '') {
          geminiHistory.push({ role, parts: [{ text }] });
        }
      });
    }

    // ──── Shortcut: Schedule Request ────
    const scheduleRequest = extractScheduleRequest(cleanMessage);
    if (scheduleRequest) {
      const fnRaw = await executeFunctionCall('getAvailableSchedules', scheduleRequest, userId, signal);
      const fnResult = parseFunctionResult(fnRaw);
      const responseText = formatScheduleResponse(fnResult, scheduleRequest.doctorName, scheduleRequest.date);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ text: responseText })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
      return;
    }

    // ──── Shortcut: Wants Other Doctors / Other Day ────
    const wantsOtherDoctors = /b\s*a\s*c\s*s\s*i\s*kh\s*a\s*c|ki\s*e\s*m\s*t\s*r\s*a\s*l\s*i\s*c\s*h|t\s*i\s*m\s*b\s*a\s*c\s*s\s*i\s*kh\s*a\s*c/i.test(cleanMessage);
    const wantsOtherDay = /ng\s*a\s*y\s*kh\s*a\s*c|tr\s*o\s*n\s*g\s*tu\s*a\s*n|tu\s*a\s*n\s*n\s*a\s*y|k\s*h\s*o\s*a\s*n\s*g\s*th\s*o\s*i\s*g\s*i\s*a\s*n/i.test(cleanMessage);
    if (wantsOtherDoctors || wantsOtherDay) {
      const specialtyName = extractSpecialtyName(cleanMessage) || findLatestFromHistory(extractSpecialtyName);
      if (!specialtyName) {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ text: 'Bạn muốn kiểm tra lịch cho chuyên khoa nào ạ?' })}\n\n`);
          res.write('data: [DONE]\n\n'); res.end();
        }
        return;
      }
      const explicitDate = extractDateLabel(cleanMessage) || findLatestFromHistory(extractDateLabel);
      let dateCandidates = explicitDate ? [explicitDate] : [];
      if (dateCandidates.length === 0 && wantsOtherDay) { dateCandidates = getUpcomingDates(7); }
      if (dateCandidates.length === 0) {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ text: 'Bạn muốn kiểm tra lịch vào ngày nào ạ?' })}\n\n`);
          res.write('data: [DONE]\n\n'); res.end();
        }
        return;
      }
      const listRaw = await executeFunctionCall('searchDoctorsBySpecialty', { specialtyName, language: req.body.language || 'vi' }, userId, signal);
      const listResult = parseFunctionResult(listRaw);
      const doctors = Array.isArray(listResult?.doctors) ? listResult.doctors : [];
      const candidates = doctors.filter((d) => d?.name).slice(0, 5);
      if (candidates.length === 0) {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ text: `Dạ, hiện hệ thống chưa có bác sĩ chuyên khoa ${specialtyName}. Bạn muốn thử chuyên khoa khác không ạ?` })}\n\n`);
          res.write('data: [DONE]\n\n'); res.end();
        }
        return;
      }
      const availableByDate = [];
      for (const dateLabel of dateCandidates.slice(0, 3)) {
        const availableDoctors = [];
        for (const doctor of candidates) {
          const schedRaw = await executeFunctionCall('getAvailableSchedules', { doctorName: doctor.name, date: dateLabel }, userId, signal);
          const schedResult = parseFunctionResult(schedRaw);
          const slots = Array.isArray(schedResult?.availableSlots) ? schedResult.availableSlots : [];
          if (slots.length > 0) {
            availableDoctors.push({ name: doctor.name, clinic: doctor.clinic, price: doctor.price, slots });
          }
          if (availableDoctors.length >= 3) break;
        }
        if (availableDoctors.length > 0) { availableByDate.push({ dateLabel, doctors: availableDoctors }); }
        if (availableByDate.length >= 2) break;
      }
      let responseText = '';
      if (availableByDate.length === 0) {
        responseText = `Dạ, hiện chưa có bác sĩ chuyên khoa ${specialtyName} có lịch trống vào ngày ${dateCandidates[0]}. Bạn muốn chọn ngày khác không ạ?`;
      } else {
        const blocks = availableByDate.map((entry) => {
          const lines = entry.doctors.map((doc) => {
            const slotLabels = doc.slots.slice(0, 3).map((s) => s.timeLabel || s.timeType).join(', ');
            return `• ${doc.name}${doc.clinic ? ` (${doc.clinic})` : ''}${doc.price ? ` - Giá khám: ${doc.price}` : ''}. Khung giờ trống: ${slotLabels}`;
          });
          return `Ngày ${entry.dateLabel}:\n${lines.join('\n')}`;
        });
        responseText = `Dạ, dưới đây là lịch trống của bác sĩ chuyên khoa ${specialtyName}:\n${blocks.join('\n\n')}\n\nBạn muốn chọn bác sĩ nào để tôi hỗ trợ đặt lịch?`;
      }
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ text: responseText })}\n\n`);
        res.write('data: [DONE]\n\n'); res.end();
      }
      return;
    }

    // ──── [Guard #25 — Cấp Timestamp UTC] ────
    const nowUTC = new Date().toISOString();

    // ──── Build Gemini Chat ────
    console.log('[AI_STREAM] 2. Bắt đầu gọi genAI.getGenerativeModel...');
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      systemInstruction: SYSTEM_PROMPT + `\n\nThời gian hiện tại (UTC): ${nowUTC}\n\n[LUẬT CHỐNG BỊA DỮ LIỆU - TUYỆT ĐỐI TUÂN THỦ]: Khi trả lời về một bác sĩ cụ thể, BẮT BUỘC chỉ sử dụng CHÍNH XÁC dữ liệu từ kết quả function trả về. TUYỆT ĐỐI CẤM trộn lẫn thông tin của bác sĩ khác. Nếu function trả về bác sĩ A thì CHỈ nói về bác sĩ A.`,
      generationConfig: { maxOutputTokens: 500, temperature: 0.3 },
      tools: [{
        functionDeclarations: [
          ...Object.entries(aiFunctions).map(([name, def]) => ({ name, ...def })),
          ...Object.entries(aiAuthFunctions).map(([name, def]) => ({ name, ...def })),
        ],
      }],
    });

    const chat = model.startChat({ history: geminiHistory });

    // ──── [Guard #15 — Function Calling Loop — Max 8 Calls] ────
    let currentMessage = cleanMessage;
    let isFirstRound = true;

    while (true) {
      if (isFirstRound) {
        // Lần đầu: stream realtime cho user
        const streamResult = await chat.sendMessageStream(currentMessage);
        let pendingFunctionCall = null;

        for await (const chunk of streamResult.stream) {
          const fCalls = chunk.functionCalls();
          if (fCalls && fCalls.length > 0) { pendingFunctionCall = fCalls[0]; break; }
          const deltaText = chunk.text();
          if (deltaText) {
            const safeChunk = deltaText.replace(/\n\ndata:/g, '\n\n data:');
            if (!res.writableEnded) {
              if (!isClientConnected) { break; }
              if (safeChunk) {
                const canWrite = res.write(`data: ${JSON.stringify({ text: safeChunk })}\n\n`);
                if (!canWrite) {
                  await new Promise((resolve) => {
                    const cleanup = () => { res.removeListener('drain', onDrain); req.removeListener('close', onClose); resolve(); };
                    const onDrain = () => cleanup();
                    const onClose = () => cleanup();
                    res.on('drain', onDrain); req.on('close', onClose);
                    if (!isClientConnected) cleanup();
                  });
                }
              }
              if (!isClientConnected) { break; }
            }
          }
        }

        if (!isClientConnected) break;

        if (pendingFunctionCall && !signal.aborted) {
          isFirstRound = false;
          functionCallCount++;
          if (functionCallCount > 8) { break; }
          let fnResult;
          try {
            console.log(`🔍 [AI_FUNC_START] Bắt đầu gọi hàm: ${pendingFunctionCall?.name}`);
            fnResult = await executeFunctionCall(pendingFunctionCall.name, pendingFunctionCall.args, userId, signal);
            console.log('✅ [AI_FUNC_DONE] Đã có kết quả từ DB trả về cho hàm.');
          } catch (fnErr) {
            fnResult = { error: 'Lỗi truy vấn dữ liệu' };
            console.error('[AI_FN_ERR]', pendingFunctionCall.name, fnErr);
          }
          console.log('🔄 [AI_FUNC_REPLY] Gửi kết quả DB ngược lại cho Gemini...');
          currentMessage = [{ functionResponse: { name: pendingFunctionCall.name, response: typeof fnResult === 'object' ? fnResult : { result: fnResult } } }];
          continue;
        }
        break; // No function call, done

      } else {
        // Các lần sau: dùng sendMessage (không stream) để tránh lỗi Gemini 400
        const nonStreamResult = await chat.sendMessage(currentMessage);
        const response = nonStreamResult.response;
        const nextFCalls = response.functionCalls();

        if (nextFCalls && nextFCalls.length > 0) {
          functionCallCount++;
          if (functionCallCount > 8) { break; }
          let fnResult;
          try {
            console.log(`🔍 [AI_FUNC_START] Bắt đầu gọi hàm: ${nextFCalls[0]?.name}`);
            fnResult = await executeFunctionCall(nextFCalls[0].name, nextFCalls[0].args, userId, signal);
            console.log('✅ [AI_FUNC_DONE] Đã có kết quả từ DB trả về cho hàm.');
          } catch (fnErr) {
            fnResult = { error: 'Lỗi truy vấn dữ liệu' };
            console.error('[AI_FN_ERR]', nextFCalls[0].name, fnErr);
          }
          currentMessage = [{ functionResponse: { name: nextFCalls[0].name, response: typeof fnResult === 'object' ? fnResult : { result: fnResult } } }];
          continue;
        }

        // Lấy text cuối cùng gửi cho client
        const finalText = response.text();
        if (finalText && !res.writableEnded && isClientConnected) {
          const safeText = finalText.replace(/\n\ndata:/g, '\n\n data:');
          res.write(`data: ${JSON.stringify({ text: safeText })}\n\n`);
        }
        break;
      }
    }

  } catch (error) {
    console.error('[AI_STREAM_ERROR] LỖI RỒI:', error);
    const status = error.status || 500;
    const errMsg = error.message || '';

    if (status === 403 || errMsg.includes('API_KEY_INVALID') || errMsg.includes('BILLING')) {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: 'Hệ thống bảo trì vui lòng quay lại sau.' })}\n\n`);
        res.end();
      }
      return;
    }
    if (status === 400) {
      console.warn('[AI_400] Gemini bad request:', errMsg);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ text: 'Dạ, xin lỗi bạn. Hệ thống gặp trục trặc khi xử lý. Vui lòng thử lại nhé!' })}\n\n`);
      }
    } else if (status === 429 || errMsg.includes('RESOURCE_EXHAUSTED')) {
      console.warn('[AI_429] Gemini rate limited:', errMsg);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: true, text: 'AI đang quá tải. Vui lòng thử lại sau 30 giây.' })}\n\n`);
      }
    } else if (error.name === 'AbortError' || signal.aborted) {
      // Silent
    } else {
      console.error('[AI_STREAM_ERR]', typeof errMsg === 'string' ? Array.from(errMsg).slice(0, 200).join('') : 'unknown');
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: true, text: 'Đã xảy ra lỗi. Vui lòng thử lại.' })}\n\n`);
      }
    }
  } finally {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (hardTimeoutHandle) clearTimeout(hardTimeoutHandle);
    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
    activeStreams = Math.max(0, activeStreams - 1);
  }
}

module.exports = { streamChat };
