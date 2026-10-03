'use strict';

// ═══════════════════════════════════════════════════════════════════════
// AI Controller — SSE Streaming & Gemini Vision Integration (Phase 02)
// ═══════════════════════════════════════════════════════════════════════

const crypto = require('crypto');
const { getGenerativeModel, isAiConfigured } = require('../services/aiConfig');
const {
  executeFunctionCall,
  aiFunctions,
  aiAuthFunctions,
  handlePrepareBookingDraft,
  handleConfirmCreateBooking,
  handlePrepareCancellationDraft,
  handleConfirmCancelBooking,
  handlePrepareRescheduleDraft,
  handleConfirmRescheduleBooking,
  handleGetPaymentStatus,
  handleInitiatePayment,
} = require('../services/aiFunctionHandlers');
const { SYSTEM_PROMPT } = require('../services/aiService');
const { checkMedicalEmergency, checkPromptInjection } = require('../services/aiSafetyGuard');
const { classifyIntent, INTENTS } = require('../services/aiIntentRouter');
const { normalizeGeminiHistory } = require('../services/aiHistoryNormalizer');
const aiContextService = require('../services/aiContextService');
const aiMemoryService = require('../services/aiMemoryService');
const { aiLogger } = require('../utils/aiLogger');
const {
  saveTemporaryImage,
  getTemporaryImage,
  cleanupImage,
  validateImageBuffer,
} = require('../services/aiImageService');
const {
  VISION_SYSTEM_INSTRUCTION,
  createImagePart,
  buildVisionPrompt,
  createStructuredVisionResult,
} = require('../services/aiVisionService');
const {
  HEALTH_ASSESSMENT_SYSTEM_INSTRUCTION,
  extractHealthContext,
  validateAndSanitizeAssessment,
  buildHealthAssessmentPrompt,
  extractJsonFromModelOutput,
  getHealthAssessmentModel,
  RISK_LEVELS,
} = require('../services/aiHealthAssessmentService');

// Global Active Stream Counter
let activeStreams = 0;
const MAX_STREAMS = 15;

/**
 * Upload Image Endpoint
 * POST /api/v1/ai/upload-image
 * Authenticated: Patient (R3) only, rate-limited
 */
async function uploadImage(req, res) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID ? crypto.randomUUID() : `img_${Date.now()}`;

  try {
    let buffer = null;
    let filename = '';

    if (req.file && req.file.buffer) {
      buffer = req.file.buffer;
      filename = req.file.originalname || 'image.jpg';
    } else if (req.body && req.body.imageBase64) {
      const base64Str = req.body.imageBase64;
      filename = req.body.filename || 'image.jpg';
      const match = base64Str.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        buffer = Buffer.from(match[2], 'base64');
      } else {
        buffer = Buffer.from(base64Str, 'base64');
      }
    } else {
      return res.status(400).json({
        errCode: 'IMAGE_REQUIRED',
        message: 'Vui lòng đính kèm tệp hình ảnh (JPEG, PNG hoặc WebP).',
      });
    }

    // Save temporary image with 5-minute TTL
    const saved = await saveTemporaryImage(buffer, filename, req.user.id);

    aiLogger.info(requestId, 'AI_IMAGE_UPLOADED', {
      userId: req.user.id,
      imageId: saved.imageId,
      mimeType: saved.mimeType,
      size: saved.size,
      latencyMs: Date.now() - startTime,
    });

    return res.status(200).json({
      errCode: 0,
      success: true,
      message: 'Tải ảnh lên thành công.',
      imageId: saved.imageId,
      data: {
        imageId: saved.imageId,
        mimeType: saved.mimeType,
        size: saved.size,
      },
    });
  } catch (err) {
    aiLogger.error(requestId, 'AI_IMAGE_UPLOAD_ERROR', { error: err.message, code: err.code });
    const code = err.code || 'IMAGE_UPLOAD_FAILED';
    const status = (code === 'IMAGE_TOO_LARGE' || code === 'IMAGE_TYPE_NOT_ALLOWED' || code === 'IMAGE_INVALID') ? 400 : 500;

    return res.status(status).json({
      errCode: code,
      message: err.message || 'Lỗi trong quá trình xử lý hình ảnh.',
    });
  }
}

/**
 * Phát sinh và gửi Canonical SSE Structured Events cho Discovery (Phase 04)
 * - doctor:search (type: DOCTOR_SEARCH_RESULTS)
 * - slot:search (type: SLOT_SEARCH_RESULTS)
 */
function emitToolStructuredEvent(toolName, args, fnResult, res, isClientConnected) {
  if (!res || res.writableEnded || !isClientConnected || !fnResult) return;

  // 1. Doctor Discovery Event
  if (
    toolName === 'searchDoctorsBySpecialty' ||
    (toolName === 'universalSystemSearch' && args?.entityType === 'doctor')
  ) {
    let rawDoctors = [];
    if (Array.isArray(fnResult.doctors)) {
      rawDoctors = fnResult.doctors;
    } else if (Array.isArray(fnResult.data)) {
      rawDoctors = fnResult.data;
    }

    const payload = {
      event: 'doctor:search',
      type: 'DOCTOR_SEARCH_RESULTS',
      data: {
        query: {
          specialtyId: fnResult.specialtyId || undefined,
          specialtyName: fnResult.specialty || fnResult.specialtyName || args?.specialtyName || undefined,
          date: args?.date || undefined,
          language: args?.language || 'vi',
        },
        doctors: rawDoctors.map((d) => ({
          doctorId: d.doctorId,
          name: d.name,
          position: d.position || null,
          specialtyId: d.specialtyId || fnResult.specialtyId || null,
          specialtyName: d.specialtyName || fnResult.specialty || fnResult.specialtyName || null,
          clinicId: d.clinicId || null,
          clinicName: d.clinicName || d.clinic || null,
          clinicAddress: d.clinicAddress || d.address || null,
          avatarUrl: d.avatarUrl || null,
          price: d.price || null,
          rating: typeof d.rating === 'number' ? d.rating : null,
          reviewCount: typeof d.reviewCount === 'number' ? d.reviewCount : null,
          description: d.description || '',
        })),
        pagination: {
          page: 1,
          limit: rawDoctors.length,
          hasNext: false,
        },
        status: fnResult.status,
        specialties: fnResult.specialties || undefined,
        message: fnResult.message || undefined,
        timestamp: Date.now(),
      },
    };

    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  // 2. Real Slot Discovery Event
  if (toolName === 'getAvailableSchedules') {
    const rawSlots = Array.isArray(fnResult.availableSlots)
      ? fnResult.availableSlots
      : (Array.isArray(fnResult.schedules) ? fnResult.schedules : []);

    const payload = {
      event: 'slot:search',
      type: 'SLOT_SEARCH_RESULTS',
      data: {
        doctor: {
          doctorId: fnResult.doctorId || args?.doctorId || null,
          name: fnResult.doctorName || args?.doctorName || 'Bác sĩ',
        },
        date: fnResult.date || args?.date,
        dateLabel: fnResult.dateLabel || undefined,
        timezone: fnResult.timezone || 'Asia/Ho_Chi_Minh',
        period: fnResult.period || 'all',
        slots: rawSlots.map((s) => ({
          scheduleId: s.scheduleId || s.id,
          timeType: s.timeType,
          displayTime: s.displayTime || s.timeLabel || s.timeType,
          period: s.period || (['T1', 'T2', 'T3', 'T4'].includes(s.timeType) ? 'morning' : 'afternoon'),
          status: (s.remaining > 0 || s.currentNumber < s.maxNumber) ? 'AVAILABLE' : 'FULL',
          remaining: typeof s.remaining === 'number' ? s.remaining : Math.max(0, (s.maxNumber || 10) - (s.currentNumber || 0)),
        })),
        status: fnResult.status,
        message: fnResult.message || undefined,
        timestamp: Date.now(),
      },
    };

    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  // 3. Booking Draft Event (Phase 05)
  if (toolName === 'prepareBookingDraft') {
    if (fnResult.status === 'success' && fnResult.draft) {
      const payload = {
        event: 'booking:draft',
        type: 'BOOKING_DRAFT',
        data: fnResult.draft,
        timestamp: Date.now(),
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } else {
      const payload = {
        event: 'booking:error',
        type: 'BOOKING_ERROR',
        data: {
          error: fnResult.error || 'draft_error',
          message: fnResult.message || 'Không thể tạo bản nháp đặt lịch.',
        },
        timestamp: Date.now(),
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  }

  // 4. Confirm Create Booking Event (Phase 05)
  if (toolName === 'confirmCreateBooking') {
    if (fnResult.status === 'success' && fnResult.data) {
      const payload = {
        event: 'booking:success',
        type: 'BOOKING_SUCCESS',
        data: fnResult.data,
        timestamp: Date.now(),
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } else {
      const payload = {
        event: 'booking:error',
        type: 'BOOKING_ERROR',
        data: {
          error: fnResult.error || 'booking_error',
          message: fnResult.message || 'Xác nhận đặt lịch không thành công.',
        },
        timestamp: Date.now(),
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  }

  // 5. Booking Cancellation Draft Event (Phase 06B)
  if (toolName === 'prepareCancellationDraft' || toolName === 'cancelMyBooking') {
    if (fnResult.status === 'success' && fnResult.draft) {
      const payload = {
        event: 'booking:cancel-draft',
        type: 'BOOKING_CANCEL_DRAFT',
        data: fnResult.draft,
        timestamp: Date.now(),
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } else {
      const payload = {
        event: 'booking:cancel-error',
        type: 'BOOKING_CANCEL_ERROR',
        data: {
          error: fnResult.error || 'cancel_draft_error',
          message: fnResult.message || 'Không thể tạo bản nháp hủy lịch.',
        },
        timestamp: Date.now(),
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  }

  // 6. Booking Cancellation Confirm Event (Phase 06B)
  if (toolName === 'confirmCancelBooking') {
    if (fnResult.status === 'success' && (fnResult.data || fnResult.alreadyCancelled)) {
      const payload = {
        event: 'booking:cancel-success',
        type: 'BOOKING_CANCEL_SUCCESS',
        data: fnResult.data || fnResult,
        alreadyCancelled: !!fnResult.alreadyCancelled,
        timestamp: Date.now(),
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } else {
      const payload = {
        event: 'booking:cancel-error',
        type: 'BOOKING_CANCEL_ERROR',
        data: {
          error: fnResult.error || 'cancel_error',
          message: fnResult.message || 'Hủy lịch khám không thành công.',
        },
        timestamp: Date.now(),
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  }

  // 7. Booking Reschedule Draft Event (Phase 06C)
  if (toolName === 'prepareRescheduleDraft' || toolName === 'rescheduleMyBooking' || toolName === 'requestSmartReschedule') {
    if (fnResult.status === 'success' && fnResult.draft) {
      const payload = {
        event: 'booking:reschedule-draft',
        type: 'BOOKING_RESCHEDULE_DRAFT',
        data: fnResult.draft,
        timestamp: Date.now(),
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } else if (fnResult.status === 'error') {
      const payload = {
        event: 'booking:reschedule-error',
        type: 'BOOKING_RESCHEDULE_ERROR',
        data: {
          error: fnResult.error || 'reschedule_draft_error',
          message: fnResult.message || 'Không thể tạo bản nháp đổi lịch.',
        },
        timestamp: Date.now(),
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  }

  // 8. Booking Reschedule Confirm Event (Phase 06C)
  if (toolName === 'confirmRescheduleBooking') {
    if (fnResult.status === 'success' && fnResult.data) {
      const payload = {
        event: 'booking:reschedule-success',
        type: 'BOOKING_RESCHEDULE_SUCCESS',
        data: fnResult.data,
        timestamp: Date.now(),
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } else {
      const payload = {
        event: 'booking:reschedule-error',
        type: 'BOOKING_RESCHEDULE_ERROR',
        data: {
          error: fnResult.error || 'reschedule_error',
          message: fnResult.message || 'Đổi lịch khám không thành công.',
        },
        timestamp: Date.now(),
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  }

  // 9. Payment Action Event (Phase 06D)
  if (toolName === 'initiateBookingPayment') {
    if (fnResult.status === 'success' && fnResult.paymentUrl) {
      const payload = {
        event: 'payment:action',
        type: 'PAYMENT_ACTION',
        data: fnResult,
        timestamp: Date.now(),
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  }
}

/**
 * SSE Streaming Chatbot & Vision Handler
 * POST /api/v1/ai/chat
 */
async function streamChat(req, res) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID ? crypto.randomUUID() : `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  // 1. Kiểm tra cấu hình hệ thống
  if (!isAiConfigured()) {
    aiLogger.error(requestId, 'AI_PROVIDER_ERROR', { error: 'Missing or placeholder GEMINI_API_KEY' });
    return res.status(500).json({
      errCode: 'AI_PROVIDER_ERROR',
      message: 'Hệ thống AI đang bảo trì cấu hình. Vui lòng liên hệ quản trị viên.',
    });
  }

  // 2. Kill-Switch
  if (process.env.AI_CHATBOT_ENABLED !== 'true') {
    return res.status(403).json({
      errCode: 'AI_FORBIDDEN',
      message: 'Tính năng AI Chatbot hiện đang tạm ngừng hoạt động.',
    });
  }

  // 3. Global Stream Capacity Guard
  if (activeStreams >= MAX_STREAMS) {
    return res.status(503).json({
      errCode: 'AI_RATE_LIMITED',
      message: 'Hệ thống AI đang bận phục vụ nhiều yêu cầu. Vui lòng thử lại sau 30 giây.',
    });
  }

  // 4. Role Guard: Chỉ cho phép Patient (R3)
  if (!req.user || !req.user.id) {
    return res.status(401).json({
      errCode: 'AI_UNAUTHORIZED',
      message: 'Vui lòng đăng nhập để sử dụng AI Chatbot.',
    });
  }

  if (req.user.roleId !== 'R3') {
    aiLogger.warn(requestId, 'AI_FORBIDDEN', { userId: req.user.id, roleId: req.user.roleId });
    return res.status(403).json({
      errCode: 'AI_FORBIDDEN',
      message: 'Tính năng AI Chatbot chỉ dành riêng cho Bệnh nhân.',
    });
  }

  const userId = parseInt(String(req.user.id), 10);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({
      errCode: 'AI_INVALID_INPUT',
      message: 'userId không hợp lệ.',
    });
  }

  // 5. Message Body Validation
  const { message = '', history = [], language = 'vi', imageId, conversationId } = req.body;
  const rawText = typeof message === 'string' ? message.trim() : '';

  // Khi có ảnh, tin nhắn văn bản có thể để trống
  if (!rawText && !imageId) {
    return res.status(400).json({
      errCode: 'AI_INVALID_INPUT',
      message: 'Vui lòng nhập nội dung tin nhắn hoặc đính kèm hình ảnh.',
    });
  }

  // Unicode Capping & Sanitization (2500 chars, strip Zalgo / zero-width)
  const safeMessage = Array.from(rawText).slice(0, 2500).join('');
  const cleanMessage = safeMessage
    .replace(/[\u0300-\u036f]{3,}/g, '')
    .replace(/[\u200B-\u200F\uFEFF]/g, '');

  // 6. SAFETY GUARD LAYER 1: Cấp cứu y tế
  const emergencyCheck = checkMedicalEmergency(cleanMessage);
  if (emergencyCheck.isEmergency) {
    aiLogger.warn(requestId, 'AI_EMERGENCY_TRIGGERED', {
      userId,
      category: emergencyCheck.category,
      matchedKeyword: emergencyCheck.matchedKeyword,
    });

    initSSEHeaders(res);
    res.write(`data: ${JSON.stringify({ text: emergencyCheck.response })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    if (imageId) cleanupImage(imageId);
    return;
  }

  // 7. SAFETY GUARD LAYER 2: Chống Prompt Injection / Jailbreak
  const injectionCheck = checkPromptInjection(cleanMessage);
  if (injectionCheck.isInjection) {
    aiLogger.warn(requestId, 'AI_PROMPT_INJECTION_TRIGGERED', {
      userId,
      matchedPattern: injectionCheck.matchedPattern,
    });

    initSSEHeaders(res);
    res.write(`data: ${JSON.stringify({ text: injectionCheck.response })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    if (imageId) cleanupImage(imageId);
    return;
  }

  // 8. DETERMINISTIC INTENT CLASSIFICATION
  const intentResult = classifyIntent(cleanMessage, Boolean(imageId));
  const intent = intentResult.intent;
  aiLogger.info(requestId, 'AI_REQUEST_START', {
    userId,
    intent,
    hasImage: Boolean(imageId),
  });

  // 9. SSE SETUP & LIFECYCLE
  activeStreams++;
  const ac = new AbortController();
  const signal = ac.signal;
  let heartbeatInterval = null;
  let hardTimeoutHandle = null;
  let isClientConnected = true;

  initSSEHeaders(res);

  // SSE Heartbeat (15s)
  heartbeatInterval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(':heartbeat\n\n');
    }
  }, 15000);

  // Hard Timeout 60s
  hardTimeoutHandle = setTimeout(() => {
    ac.abort();
    aiLogger.warn(requestId, 'AI_TIMEOUT', { userId, latencyMs: Date.now() - startTime });
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: true, code: 'AI_TIMEOUT', text: 'Quá trình phản hồi mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.' })}\n\n`);
      res.write('data: [TIMEOUT]\n\n');
      res.end();
    }
  }, 60000);

  req.on('close', () => {
    isClientConnected = false;
    ac.abort();
    if (imageId) cleanupImage(imageId);
  });

  res.on('error', (err) => {
    if (err.code !== 'ERR_STREAM_WRITE_AFTER_END') {
      aiLogger.warn(requestId, 'SSE_STREAM_ERROR', { error: err.code || err.message });
    }
    if (imageId) cleanupImage(imageId);
  });

  try {
    const nowUTC = new Date().toISOString();

    // ═══════════════════════════════════════════════════════════════════
    // CASE A: HEALTH ASSESSMENT ORCHESTRATOR (Phase 03 Flow)
    // Kích hoạt khi:
    // 1. Có imageId đính kèm
    // 2. Ý định là HEALTH_QUERY (triệu chứng, bệnh lý, ngứa, đau, sốt, dùng thuốc)
    // 3. Có ngữ cảnh theo dõi (follow-up) từ lượt trước (ảnh cũ, triệu chứng cũ)
    // ═══════════════════════════════════════════════════════════════════
    const initialHealthContext = extractHealthContext(cleanMessage, history, null);
    const isHealthAssessmentFlow = Boolean(imageId) ||
      intentResult.intent === INTENTS.HEALTH_QUERY ||
      initialHealthContext.isFollowUp;

    if (isHealthAssessmentFlow) {
      let tempImageData = null;
      let imagePart = null;
      let currentVisionData = null;

      if (imageId) {
        try {
          tempImageData = await getTemporaryImage(imageId, userId);
        } catch (imgErr) {
          if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({
              error: true,
              code: imgErr.code || 'IMAGE_EXPIRED',
              text: 'Hình ảnh tạm thời đã hết hạn hoặc không khả dụng. Bạn vui lòng chụp hoặc tải lại hình ảnh nhé.'
            })}\n\n`);
          }
          return;
        }

        imagePart = createImagePart(tempImageData.buffer, tempImageData.metadata.mimeType);
        currentVisionData = createStructuredVisionResult({
          text: cleanMessage,
          imageId,
          mimeType: tempImageData.metadata.mimeType,
        });
      }

      // Tái trích xuất ngữ cảnh sức khỏe tích lũy toàn diện
      const healthContext = extractHealthContext(cleanMessage, history, currentVisionData);
      const assessmentPrompt = buildHealthAssessmentPrompt(healthContext);

      const healthSystemCombined = `${HEALTH_ASSESSMENT_SYSTEM_INSTRUCTION}\n\n${SYSTEM_PROMPT}\n\nThời gian hiện tại (UTC): ${nowUTC}\nNgôn ngữ người dùng: ${language}`;

      const assessmentModel = getHealthAssessmentModel({
        systemInstruction: healthSystemCombined,
      });

      aiLogger.info(requestId, 'AI_HEALTH_ASSESSMENT_START', {
        userId,
        hasImage: Boolean(imageId),
        isFollowUp: healthContext.isFollowUp,
        symptomsCount: healthContext.symptoms.length,
      });

      // Gọi generateContentStream với multimodal (ảnh + prompt) hoặc đơn modal (prompt)
      const modelContent = imagePart ? [imagePart, assessmentPrompt] : assessmentPrompt;
      const streamResult = await assessmentModel.generateContentStream(modelContent);
      let fullResponseText = '';

      for await (const chunk of streamResult.stream) {
        if (!isClientConnected || signal.aborted) break;

        const delta = chunk.text ? chunk.text() : '';
        if (delta && !res.writableEnded) {
          fullResponseText += delta;
          const safeChunk = delta.replace(/\n\ndata:/g, '\n\n data:');
          res.write(`data: ${JSON.stringify({
            text: safeChunk,
            isHealthAssessment: true,
            hasImage: Boolean(imageId),
            imageId: imageId || undefined
          })}\n\n`);
        }
      }

      if (fullResponseText && !res.writableEnded && isClientConnected) {
        // Trích xuất khối JSON từ output của model
        const rawJson = extractJsonFromModelOutput(fullResponseText);
        // Chuẩn hóa và thẩm định cấu trúc theo Canonical HEALTH_ASSESSMENT Schema
        const sanitizedAssessment = validateAndSanitizeAssessment(rawJson, healthContext);

        // Backward compatibility: gửi visionAnalysis nếu có ảnh
        if (imageId && currentVisionData) {
          const structuredVision = createStructuredVisionResult({
            text: fullResponseText,
            imageId,
            mimeType: tempImageData?.metadata?.mimeType,
          });
          res.write(`data: ${JSON.stringify({ visionAnalysis: structuredVision })}\n\n`);
        }

        // Phát sinh và gửi Canonical HEALTH_ASSESSMENT event về Frontend
        res.write(`data: ${JSON.stringify({
          event: 'health:assessment',
          type: 'HEALTH_ASSESSMENT',
          data: sanitizedAssessment.data,
          assessment: sanitizedAssessment.data,
          healthAssessment: sanitizedAssessment.data,
        })}\n\n`);
      }

      aiLogger.info(requestId, 'AI_HEALTH_ASSESSMENT_COMPLETED', {
        userId,
        hasImage: Boolean(imageId),
        isFollowUp: healthContext.isFollowUp,
        latencyMs: Date.now() - startTime,
      });

      return;
    }

    // ═══════════════════════════════════════════════════════════════════
    // CASE B: STANDARD TEXT CHATBOT WITH TOOLS (Phase 01 Flow)
    // ═══════════════════════════════════════════════════════════════════

    // 10. CONTEXT ASSEMBLY VIA AI_CONTEXT_SERVICE (Phase 07)
    let lastDoctorId = null;
    let lastDoctorName = null;
    if (Array.isArray(history)) {
      for (let i = history.length - 1; i >= 0; i--) {
        const item = history[i];
        const docList = item.doctorSearchResults?.data?.doctors || item.doctorSearchResults?.doctors;
        if (Array.isArray(docList) && docList.length > 0) {
          lastDoctorId = docList[0].doctorId;
          lastDoctorName = docList[0].name;
          break;
        }
        const slotDoc = item.slotSearchResults?.data?.doctor || item.slotSearchResults?.doctor;
        if (slotDoc?.doctorId) {
          lastDoctorId = slotDoc.doctorId;
          lastDoctorName = slotDoc.name;
          break;
        }
      }
    }
    const toolContext = {
      userQuery: cleanMessage,
      lastDoctorId,
      lastDoctorName,
      history,
    };

    const contextBundle = await aiContextService.buildAIContext({
      userId,
      conversationId: conversationId || null,
      currentMessage: cleanMessage,
      intent,
      rawHistory: history,
      toolContext,
    });

    const geminiHistory = contextBundle.geminiHistory;

    // Phát sinh sự kiện KNOWLEDGE_CITATIONS về Frontend nếu RAG tìm thấy nguồn chính thức
    if (contextBundle.citations && contextBundle.citations.length > 0 && isClientConnected && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({
        event: 'knowledge:citations',
        type: 'KNOWLEDGE_CITATIONS',
        data: { citations: contextBundle.citations },
        timestamp: Date.now(),
      })}\n\n`);
    }

    // 11. BUILD GEMINI MODEL WITH REGISTERED TOOLS & AUGMENTED CONTEXT
    let augmentedSystemPrompt = SYSTEM_PROMPT;
    if (contextBundle.systemInstructionAugmentation) {
      augmentedSystemPrompt += `\n\n════════════════════════════════════════\nNGỮ CẢNH HỆ THỐNG BỔ SUNG (PHASE 07):\n${contextBundle.systemInstructionAugmentation}\n════════════════════════════════════════`;
    }

    const systemPromptCombined = `${augmentedSystemPrompt}\n\nThời gian hiện tại (UTC): ${nowUTC}\nNgôn ngữ người dùng: ${language}`;

    const model = getGenerativeModel({
      systemInstruction: systemPromptCombined,
      tools: [{
        functionDeclarations: [
          ...Object.entries(aiFunctions).map(([name, def]) => ({ name, ...def })),
          ...Object.entries(aiAuthFunctions).map(([name, def]) => ({ name, ...def })),
        ],
      }],
    });

    const chat = model.startChat({ history: geminiHistory });

    // 12. MULTI-ROUND FUNCTION CALLING LOOP (Max 5 rounds)
    let currentMessage = cleanMessage;
    let isFirstRound = true;
    let roundCount = 0;
    let lastFnResult = null;

    while (roundCount < 5) {
      if (!isClientConnected || signal.aborted) break;

      if (isFirstRound) {
        let responseResult;
        let retryCount = 0;
        while (retryCount < 5) {
          try {
            responseResult = await chat.sendMessage(currentMessage);
            break;
          } catch (err) {
            if ((err?.message?.includes('429') || err?.message?.includes('503') || err?.status === 503) && retryCount < 4) {
              retryCount++;
              aiLogger.warn(requestId, 'AI_RATE_LIMIT_BACKOFF', { retryCount, error: err?.message });
              await new Promise((r) => setTimeout(r, retryCount * 2500));
            } else {
              throw err;
            }
          }
        }

        const response = responseResult.response;
        const fCalls = response.functionCalls ? response.functionCalls() : null;

        if (fCalls && fCalls.length > 0) {
          const pendingFunctionCall = fCalls[0];
          isFirstRound = false;
          roundCount++;

          const toolStartTime = Date.now();
          let fnResult;
          try {
            fnResult = await executeFunctionCall(
              pendingFunctionCall.name,
              pendingFunctionCall.args,
              userId,
              signal,
              toolContext
            );
            lastFnResult = fnResult;

            emitToolStructuredEvent(
              pendingFunctionCall.name,
              pendingFunctionCall.args,
              fnResult,
              res,
              isClientConnected
            );

            if (fnResult?.doctors && fnResult.doctors.length > 0) {
              toolContext.lastDoctorId = fnResult.doctors[0].doctorId;
              toolContext.lastDoctorName = fnResult.doctors[0].name;
            } else if (fnResult?.doctorId) {
              toolContext.lastDoctorId = fnResult.doctorId;
              toolContext.lastDoctorName = fnResult.doctorName;
            }

            aiLogger.info(requestId, 'AI_TOOL_SUCCESS', {
              toolName: pendingFunctionCall.name,
              latencyMs: Date.now() - toolStartTime,
            });
          } catch (fnErr) {
            aiLogger.error(requestId, 'AI_TOOL_ERROR', {
              toolName: pendingFunctionCall.name,
              error: fnErr?.message || fnErr,
            });
            fnResult = { status: 'error', message: 'Không thể truy vấn dữ liệu từ hệ thống.' };
            lastFnResult = fnResult;
          }

          currentMessage = [{
            functionResponse: {
              name: pendingFunctionCall.name,
              response: typeof fnResult === 'object' ? fnResult : { result: fnResult },
              ...(pendingFunctionCall.id ? { id: pendingFunctionCall.id } : {}),
            },
          }];
          continue;
        }

        // Không có tool call -> gửi text trực tiếp về client SSE
        const initialText = response.text ? response.text() : '';
        if (initialText && !res.writableEnded && isClientConnected) {
          const safeText = initialText.replace(/\n\ndata:/g, '\n\n data:');
          res.write(`data: ${JSON.stringify({ text: safeText })}\n\n`);
        }
        break;

      } else {
        let responseResult = null;
        let followupRetry = 0;
        while (followupRetry < 4) {
          try {
            responseResult = await chat.sendMessage(currentMessage);
            break;
          } catch (chatErr) {
            if ((chatErr?.message?.includes('429') || chatErr?.message?.includes('503') || chatErr?.status === 503) && followupRetry < 3) {
              followupRetry++;
              aiLogger.warn(requestId, 'AI_FOLLOWUP_BACKOFF', { followupRetry, error: chatErr?.message });
              await new Promise((r) => setTimeout(r, followupRetry * 2000));
            } else {
              aiLogger.warn(requestId, 'AI_FOLLOWUP_CHAT_WARN', {
                error: chatErr?.message || chatErr,
              });
              if (!res.writableEnded && isClientConnected) {
                let fallbackMsg = 'Dưới đây là kết quả tra cứu từ hệ thống BookingCare:';
                if (lastFnResult?.paymentStatus) {
                  const statusText = lastFnResult.paymentStatus === 'paid' ? 'đã thanh toán' : 'chưa thanh toán';
                  const amtText = Number(lastFnResult.amount || 0).toLocaleString('vi-VN');
                  fallbackMsg = `Lịch hẹn #${lastFnResult.bookingId} hiện ${statusText} với số tiền là ${amtText} VNĐ.`;
                }
                res.write(`data: ${JSON.stringify({ text: fallbackMsg })}\n\n`);
              }
              break;
            }
          }
        }
        if (!responseResult) break;
        const response = responseResult.response;
        const nextFCalls = response.functionCalls ? response.functionCalls() : null;

        if (nextFCalls && nextFCalls.length > 0) {
          roundCount++;
          const toolStartTime = Date.now();
          let fnResult;
          try {
            fnResult = await executeFunctionCall(
              nextFCalls[0].name,
              nextFCalls[0].args,
              userId,
              signal,
              toolContext
            );

            emitToolStructuredEvent(
              nextFCalls[0].name,
              nextFCalls[0].args,
              fnResult,
              res,
              isClientConnected
            );

            if (fnResult?.doctors && fnResult.doctors.length > 0) {
              toolContext.lastDoctorId = fnResult.doctors[0].doctorId;
              toolContext.lastDoctorName = fnResult.doctors[0].name;
            } else if (fnResult?.doctorId) {
              toolContext.lastDoctorId = fnResult.doctorId;
              toolContext.lastDoctorName = fnResult.doctorName;
            }

            aiLogger.info(requestId, 'AI_TOOL_SUCCESS', {
              toolName: nextFCalls[0].name,
              latencyMs: Date.now() - toolStartTime,
            });
          } catch (fnErr) {
            aiLogger.error(requestId, 'AI_TOOL_ERROR', {
              toolName: nextFCalls[0].name,
              error: fnErr?.message || fnErr,
            });
            fnResult = { status: 'error', message: 'Không thể truy vấn dữ liệu từ hệ thống.' };
          }

          currentMessage = [{
            functionResponse: {
              name: nextFCalls[0].name,
              response: typeof fnResult === 'object' ? fnResult : { result: fnResult },
              ...(nextFCalls[0].id ? { id: nextFCalls[0].id } : {}),
            },
          }];
          continue;
        }

        const finalText = response.text ? response.text() : '';
        if (finalText && !res.writableEnded && isClientConnected) {
          const safeText = finalText.replace(/\n\ndata:/g, '\n\n data:');
          res.write(`data: ${JSON.stringify({ text: safeText })}\n\n`);
        }
        break;
      }
    }

    aiLogger.info(requestId, 'AI_REQUEST_COMPLETED', {
      userId,
      latencyMs: Date.now() - startTime,
      rounds: roundCount + 1,
    });

  } catch (error) {
    const status = error.status || 500;
    const errMsg = error.message || '';

    aiLogger.error(requestId, 'AI_STREAM_ERROR', {
      status,
      errorName: error.name,
      message: errMsg,
      latencyMs: Date.now() - startTime,
    });

    if (error.name === 'AbortError' || signal.aborted) {
      // Aborted — silent
    } else if (status === 429 || errMsg.includes('RESOURCE_EXHAUSTED')) {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: true, code: 'AI_RATE_LIMITED', text: 'Hệ thống AI đang nhận được rất nhiều yêu cầu. Vui lòng thử lại sau 30 giây.' })}\n\n`);
      }
    } else if (status === 400) {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: true, code: 'AI_PROVIDER_ERROR', text: 'Dạ, hệ thống gặp trục trặc khi xử lý định dạng. Vui lòng thử lại nhé.' })}\n\n`);
      }
    } else if (status === 403 || errMsg.includes('API_KEY_INVALID')) {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: true, code: 'AI_PROVIDER_ERROR', text: 'Dịch vụ AI đang bảo trì. Vui lòng quay lại sau.' })}\n\n`);
      }
    } else {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: true, code: 'VISION_PROVIDER_ERROR', text: 'Đã xảy ra sự cố khi kết nối trợ lý AI. Vui lòng thử lại sau.' })}\n\n`);
      }
    }
  } finally {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (hardTimeoutHandle) clearTimeout(hardTimeoutHandle);

    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }

    // Cleanup temporary image file ngay sau khi stream hoàn thành hoặc bị ngắt
    if (imageId) {
      cleanupImage(imageId);
    }

    if (typeof req.releaseAiStreamLock === 'function') {
      req.releaseAiStreamLock();
    }
    activeStreams = Math.max(0, activeStreams - 1);
  }
}

/**
 * Helper khởi tạo SSE Headers an toàn
 */
function initSSEHeaders(res) {
  if (res.headersSent) return;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': process.env.URL_REACT || 'http://localhost:3000',
    'Access-Control-Allow-Credentials': 'true',
  });
}

/**
 * Direct Endpoint for Booking Draft Creation (Phase 05)
 * POST /api/v1/ai/booking/draft
 * Authenticated: R3 only
 */
async function prepareBookingDraftEndpoint(req, res) {
  const userId = req.user?.id;
  try {
    const result = await handlePrepareBookingDraft(req.body, userId, null, null);
    const status = result.status === 'success' ? 200 : (result.status === 'unauthorized' ? 401 : 400);
    return res.status(status).json({
      errCode: result.status === 'success' ? 0 : 1,
      ...result,
    });
  } catch (err) {
    console.error('[AI_PREPARE_DRAFT_ERR]', err);
    return res.status(500).json({ errCode: -1, status: 'error', message: 'Lỗi server!' });
  }
}

/**
 * Direct Endpoint for Real Booking Confirmation (Phase 05)
 * POST /api/v1/ai/booking/confirm
 * Authenticated: R3 only
 */
async function confirmBookingEndpoint(req, res) {
  const userId = req.user?.id;
  try {
    const result = await handleConfirmCreateBooking(req.body, userId, null, null);
    const status = result.status === 'success' ? 200 : (result.status === 'unauthorized' ? 401 : 400);
    return res.status(status).json({
      errCode: result.status === 'success' ? 0 : 1,
      ...result,
    });
  } catch (err) {
    console.error('[AI_CONFIRM_BOOKING_ERR]', err);
    return res.status(500).json({ errCode: -1, status: 'error', message: 'Lỗi server!' });
  }
}

/**
 * Direct Endpoint for Cancellation Draft Creation (Phase 06B)
 * POST /api/v1/ai/booking/cancel-draft
 * Authenticated: R3 only
 */
async function prepareCancellationDraftEndpoint(req, res) {
  const userId = req.user?.id;
  try {
    const result = await handlePrepareCancellationDraft(req.body, userId, null);
    const isOk = result.status === 'success' || result.status === 'already_cancelled' || result.alreadyCancelled;
    const status = isOk ? 200 : (result.status === 'unauthorized' ? 401 : 400);
    return res.status(status).json({
      errCode: isOk ? 0 : 1,
      ...result,
    });
  } catch (err) {
    console.error('[AI_PREPARE_CANCEL_DRAFT_ERR]', err);
    return res.status(500).json({ errCode: -1, status: 'error', message: 'Lỗi server!' });
  }
}

/**
 * Direct Endpoint for Real Cancellation Confirmation (Phase 06B)
 * POST /api/v1/ai/booking/cancel-confirm
 * Authenticated: R3 only
 */
async function confirmCancelBookingEndpoint(req, res) {
  const userId = req.user?.id;
  try {
    const result = await handleConfirmCancelBooking(req.body, userId, null);
    const status = result.status === 'success' ? 200 : (result.status === 'unauthorized' ? 401 : 400);
    return res.status(status).json({
      errCode: result.status === 'success' ? 0 : 1,
      ...result,
    });
  } catch (err) {
    console.error('[AI_CONFIRM_CANCEL_BOOKING_ERR]', err);
    return res.status(500).json({ errCode: -1, status: 'error', message: 'Lỗi server!' });
  }
}

/**
 * Direct Endpoint for Reschedule Draft Creation (Phase 06C)
 * POST /api/v1/ai/booking/reschedule-draft
 * Authenticated: R3 only
 */
async function prepareRescheduleDraftEndpoint(req, res) {
  const userId = req.user?.id;
  try {
    const result = await handlePrepareRescheduleDraft(req.body, userId, null);
    const isOk = result.status === 'success' || result.status === 'needs_slot_selection';
    const status = isOk ? 200 : (result.status === 'unauthorized' ? 401 : 400);
    return res.status(status).json({
      errCode: isOk ? 0 : 1,
      ...result,
    });
  } catch (err) {
    console.error('[AI_PREPARE_RESCHEDULE_DRAFT_ERR]', err);
    return res.status(500).json({ errCode: -1, status: 'error', message: 'Lỗi server!' });
  }
}

/**
 * Direct Endpoint for Real Reschedule Confirmation (Phase 06C)
 * POST /api/v1/ai/booking/reschedule-confirm
 * Authenticated: R3 only
 */
async function confirmRescheduleBookingEndpoint(req, res) {
  const userId = req.user?.id;
  try {
    const result = await handleConfirmRescheduleBooking(req.body, userId, null);
    const status = result.status === 'success' ? 200 : (result.status === 'unauthorized' ? 401 : 400);
    return res.status(status).json({
      errCode: result.status === 'success' ? 0 : 1,
      ...result,
    });
  } catch (err) {
    console.error('[AI_CONFIRM_RESCHEDULE_BOOKING_ERR]', err);
    return res.status(500).json({ errCode: -1, status: 'error', message: 'Lỗi server!' });
  }
}

/**
 * Direct Endpoint for Payment Status Lookup (Phase 06D)
 * GET /api/v1/ai/booking/payment-status
 * Authenticated: R3 only
 */
async function getPaymentStatusEndpoint(req, res) {
  const userId = req.user?.id;
  try {
    const result = await handleGetPaymentStatus({ bookingId: req.query.bookingId || req.body?.bookingId }, userId, null);
    const status = result.status === 'success' ? 200 : (result.status === 'unauthorized' ? 401 : 400);
    return res.status(status).json({
      errCode: result.status === 'success' ? 0 : 1,
      ...result,
    });
  } catch (err) {
    console.error('[AI_GET_PAYMENT_STATUS_ERR]', err);
    return res.status(500).json({ errCode: -1, status: 'error', message: 'Lỗi server!' });
  }
}

/**
 * Direct Endpoint for Payment URL Initiation (Phase 06D)
 * POST /api/v1/ai/booking/pay
 * Authenticated: R3 only
 */
async function initiatePaymentEndpoint(req, res) {
  const userId = req.user?.id;
  try {
    const result = await handleInitiatePayment(req.body, userId, null);
    const isOk = result.status === 'success' || result.status === 'already_paid';
    const status = isOk ? 200 : (result.status === 'unauthorized' ? 401 : 400);
    return res.status(status).json({
      errCode: isOk ? 0 : 1,
      ...result,
    });
  } catch (err) {
    console.error('[AI_INITIATE_PAYMENT_ERR]', err);
    return res.status(500).json({ errCode: -1, status: 'error', message: 'Lỗi server!' });
  }
}

/**
 * Direct Endpoint to list Controlled User Memories (Phase 07)
 * GET /api/v1/ai/memory
 * Authenticated: R3 only (IDOR protected)
 */
async function getMemoriesEndpoint(req, res) {
  const userId = req.user?.id;
  try {
    const memories = await aiMemoryService.getUserMemories(userId);
    return res.status(200).json({
      errCode: 0,
      status: 'success',
      data: memories,
    });
  } catch (err) {
    console.error('[AI_GET_MEMORIES_ERR]', err);
    return res.status(500).json({ errCode: -1, status: 'error', message: 'Lỗi tải bộ nhớ người dùng.' });
  }
}

/**
 * Direct Endpoint to delete a specific memory key (Phase 07)
 * DELETE /api/v1/ai/memory/:key
 * Authenticated: R3 only (IDOR protected)
 */
async function deleteMemoryEndpoint(req, res) {
  const userId = req.user?.id;
  const { key } = req.params;
  try {
    const deleted = await aiMemoryService.deleteUserMemory(userId, key);
    return res.status(200).json({
      errCode: 0,
      status: 'success',
      deleted,
      message: deleted ? 'Đã xóa tùy chọn thành công.' : 'Không tìm thấy tùy chọn cần xóa.',
    });
  } catch (err) {
    console.error('[AI_DELETE_MEMORY_ERR]', err);
    return res.status(500).json({ errCode: -1, status: 'error', message: 'Lỗi xóa bộ nhớ.' });
  }
}

/**
 * Direct Endpoint to clear all user memories (Phase 07)
 * POST /api/v1/ai/memory/clear
 * Authenticated: R3 only (IDOR protected)
 */
async function clearMemoriesEndpoint(req, res) {
  const userId = req.user?.id;
  try {
    const clearedCount = await aiMemoryService.clearUserMemories(userId);
    return res.status(200).json({
      errCode: 0,
      status: 'success',
      clearedCount,
      message: 'Đã xóa toàn bộ bộ nhớ tùy chọn của bạn.',
    });
  } catch (err) {
    console.error('[AI_CLEAR_MEMORIES_ERR]', err);
    return res.status(500).json({ errCode: -1, status: 'error', message: 'Lỗi xóa tất cả bộ nhớ.' });
  }
}

module.exports = {
  streamChat,
  uploadImage,
  prepareBookingDraftEndpoint,
  confirmBookingEndpoint,
  prepareCancellationDraftEndpoint,
  confirmCancelBookingEndpoint,
  prepareRescheduleDraftEndpoint,
  confirmRescheduleBookingEndpoint,
  getPaymentStatusEndpoint,
  initiatePaymentEndpoint,
  getMemoriesEndpoint,
  deleteMemoryEndpoint,
  clearMemoriesEndpoint,
};
