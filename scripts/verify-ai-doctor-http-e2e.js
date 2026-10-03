'use strict';

/**
 * =======================================================================
 * BOOKINGCARE AI — PHASE 04 REAL HTTP & E2E INTEGRATION SUITE
 * 10 Canonical Scenarios (Section LIX) + Security Enforcements
 * =======================================================================
 */

require('dotenv').config();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const assert = require('assert');
const express = require('express');
const routes = require('../src/routes/web');
const db = require('../src/models');

const app = express();
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));
routes(app);

const TEST_PORT = 8097;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let serverInstance = null;
let passedCount = 0;
let failedCount = 0;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function logPass(title) {
  console.log(`  ✅ [PASS] ${title}`);
  passedCount++;
}

function logFail(title, err) {
  console.error(`  ❌ [FAIL] ${title} — ${err.message || err}`);
  failedCount++;
}

/**
 * Helper: Consume SSE Stream via HTTP Axios
 */
async function consumeSSEStream({ token, message, history = [], imageId = null }) {
  const chatResponse = await axios.post(
    `${BASE_URL}/api/v1/ai/chat`,
    { message, history, imageId, language: 'vi' },
    {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'text/event-stream',
      },
      responseType: 'stream',
      timeout: 30000,
    }
  );

  return new Promise((resolve, reject) => {
    let fullText = '';
    let doctorSearchResults = null;
    let slotSearchResults = null;
    let healthAssessment = null;
    const rawEvents = [];
    let buffer = '';

    chatResponse.data.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]' || data === '[TIMEOUT]') break;
          if (data.startsWith(':')) continue;

          try {
            const parsed = JSON.parse(data);
            rawEvents.push(parsed);

            if (parsed.text) {
              fullText += parsed.text;
            }
            if (parsed.event === 'doctor:search' || parsed.type === 'DOCTOR_SEARCH_RESULTS') {
              doctorSearchResults = parsed.data || parsed.doctorSearchResults || parsed;
            }
            if (parsed.event === 'slot:search' || parsed.type === 'SLOT_SEARCH_RESULTS') {
              slotSearchResults = parsed.data || parsed.slotSearchResults || parsed;
            }
            if (parsed.event === 'health:assessment' || parsed.type === 'HEALTH_ASSESSMENT') {
              healthAssessment = parsed.data || parsed.assessment || parsed.healthAssessment;
            }
          } catch (_) {}
        }
      }
    });

    chatResponse.data.on('end', () => {
      resolve({
        fullText,
        doctorSearchResults,
        slotSearchResults,
        healthAssessment,
        rawEvents,
      });
    });

    chatResponse.data.on('error', reject);
  });
}

async function main() {
  console.log('\n============================================================');
  console.log('🩺 BOOKINGCARE AI PHASE 04 — REAL HTTP & E2E SUITE');
  console.log('============================================================\n');

  try {
    // 0. Verify Database Connection
    await db.sequelize.authenticate();
    console.log('  [Init] PostgreSQL connection verified successfully.\n');

    // 1. Setup Test Server
    await new Promise((resolve) => {
      serverInstance = app.listen(TEST_PORT, () => resolve());
    });

    const jwtSecret = process.env.JWT_SECRET || 'secret';
    const makePatientToken = (id = 52) =>
      jwt.sign({ id, roleId: 'R3', tokenVersion: 0 }, jwtSecret, { expiresIn: '1h' });
    const doctorToken = jwt.sign({ id: 2, roleId: 'R2', tokenVersion: 0 }, jwtSecret, { expiresIn: '1h' });
    const adminToken = jwt.sign({ id: 1, roleId: 'R1', tokenVersion: 0 }, jwtSecret, { expiresIn: '1h' });

    // ─────────────────────────────────────────────────────────────
    // E2E 01 — DOCTOR QUERY: "Tôi muốn tìm bác sĩ da liễu."
    // ─────────────────────────────────────────────────────────────
    try {
      await delay(4000);
      const res = await consumeSSEStream({
        token: makePatientToken(52),
        message: 'Tôi muốn tìm bác sĩ da liễu.',
      });

      if (res.doctorSearchResults && res.doctorSearchResults.doctors?.length > 0) {
        const d = res.doctorSearchResults.doctors[0];
        assert.strictEqual(d.specialtyName, 'Da liễu');
        assert(d.name && d.doctorId, 'Doctor record must contain real name and doctorId');
        logPass('E2E 01 — DOCTOR QUERY: Resolved real specialty "Da liễu" and real doctors with structured cards');
      } else {
        throw new Error('Expected doctorSearchResults with real doctors');
      }
    } catch (err) {
      logFail('E2E 01 — DOCTOR QUERY', err);
    }

    // ─────────────────────────────────────────────────────────────
    // E2E 02 — DOCTOR QUERY: "Tìm bác sĩ tai mũi họng."
    // ─────────────────────────────────────────────────────────────
    try {
      await delay(4000);
      const res = await consumeSSEStream({
        token: makePatientToken(53),
        message: 'Tìm bác sĩ tai mũi họng.',
      });

      if (res.doctorSearchResults && res.doctorSearchResults.doctors?.length > 0) {
        const d = res.doctorSearchResults.doctors[0];
        assert.strictEqual(d.specialtyName, 'Tai Mũi Họng');
        logPass('E2E 02 — DOCTOR QUERY: Resolved real ENT doctors with structured cards');
      } else {
        throw new Error('Expected doctorSearchResults for Tai Mũi Họng');
      }
    } catch (err) {
      logFail('E2E 02 — DOCTOR QUERY', err);
    }

    // ─────────────────────────────────────────────────────────────
    // E2E 03 — SPECIALTY CLICK TO DOCTOR SEARCH
    // ─────────────────────────────────────────────────────────────
    try {
      await delay(4000);
      const res = await consumeSSEStream({
        token: makePatientToken(54),
        message: 'Tìm bác sĩ chuyên khoa Da liễu',
      });

      if (res.doctorSearchResults && res.doctorSearchResults.doctors?.length > 0) {
        logPass('E2E 03 — SPECIALTY CLICK: Triggered real doctor search from specialty chip');
      } else {
        throw new Error('Expected doctorSearchResults');
      }
    } catch (err) {
      logFail('E2E 03 — SPECIALTY CLICK', err);
    }

    // ─────────────────────────────────────────────────────────────
    // E2E 04 — DOCTOR SCHEDULE QUERY: "Cho tôi xem lịch bác sĩ Lan Trần Bích."
    // ─────────────────────────────────────────────────────────────
    try {
      await delay(4000);
      const res = await consumeSSEStream({
        token: makePatientToken(55),
        message: 'Cho tôi xem lịch bác sĩ Lan Trần Bích ngày mai.',
      });

      if (res.slotSearchResults && res.slotSearchResults.slots?.length > 0) {
        assert.strictEqual(res.slotSearchResults.doctor?.doctorId, 6);
        assert.strictEqual(res.slotSearchResults.timezone, 'Asia/Ho_Chi_Minh');
        logPass('E2E 04 — DOCTOR SCHEDULE QUERY: Resolved Doctor 6 and emitted real schedule slots');
      } else {
        throw new Error('Expected slotSearchResults with available slots');
      }
    } catch (err) {
      logFail('E2E 04 — DOCTOR SCHEDULE QUERY', err);
    }

    // ─────────────────────────────────────────────────────────────
    // E2E 05 — ASIA/HO_CHI_MINH TOMORROW NORMALIZATION
    // ─────────────────────────────────────────────────────────────
    try {
      await delay(4000);
      const res = await consumeSSEStream({
        token: makePatientToken(56),
        message: 'Ngày mai bác sĩ Lan Trần Bích còn lịch không?',
      });

      if (res.slotSearchResults) {
        assert(res.slotSearchResults.dateLabel, 'Must have formatted dateLabel in VN timezone');
        assert.strictEqual(res.slotSearchResults.timezone, 'Asia/Ho_Chi_Minh');
        assert(res.slotSearchResults.slots.length > 0, 'Doctor 6 has real tomorrow slots');
        logPass('E2E 05 — TIMEZONE NORMALIZATION: Handled "ngày mai" under Asia/Ho_Chi_Minh UTC+7');
      } else {
        throw new Error('Expected slotSearchResults');
      }
    } catch (err) {
      logFail('E2E 05 — TIMEZONE NORMALIZATION', err);
    }

    // ─────────────────────────────────────────────────────────────
    // E2E 06 — MORNING TIME-OF-DAY FILTER: "buổi sáng"
    // ─────────────────────────────────────────────────────────────
    try {
      await delay(4000);
      const res = await consumeSSEStream({
        token: makePatientToken(57),
        message: 'Ngày mai buổi sáng bác sĩ Lan Trần Bích còn lịch không?',
      });

      if (res.slotSearchResults) {
        assert.strictEqual(res.slotSearchResults.period, 'morning');
        for (const s of res.slotSearchResults.slots) {
          assert.strictEqual(s.period, 'morning', `Slot ${s.timeType} must be in morning`);
          assert(['T1', 'T2', 'T3', 'T4'].includes(s.timeType));
        }
        logPass('E2E 06 — MORNING PERIOD FILTER: Returned ONLY morning slots (T1-T4)');
      } else {
        throw new Error('Expected slotSearchResults with morning filter');
      }
    } catch (err) {
      logFail('E2E 06 — MORNING PERIOD FILTER', err);
    }

    // ─────────────────────────────────────────────────────────────
    // E2E 07 — NO SLOT CONDITION (No Hallucination)
    // ─────────────────────────────────────────────────────────────
    try {
      await delay(4000);
      // Doctor 2 has no schedule on Sunday 2026-10-04 (ngày mai)
      const res = await consumeSSEStream({
        token: makePatientToken(58),
        message: 'Ngày mai bác sĩ Tuấn Phan Công còn lịch không?',
      });

      if (res.slotSearchResults) {
        assert.strictEqual(res.slotSearchResults.slots.length, 0, 'Must have 0 slots');
        assert(
          res.slotSearchResults.message?.includes('không có lịch trống') ||
          res.fullText?.includes('không có lịch') ||
          res.fullText?.includes('chưa có lịch'),
          'Must honestly report no schedule available'
        );
        logPass('E2E 07 — NO SLOT: Correctly reported no schedule without hallucinating fake slots');
      } else {
        throw new Error('Expected slotSearchResults with empty slots');
      }
    } catch (err) {
      logFail('E2E 07 — NO SLOT', err);
    }

    // ─────────────────────────────────────────────────────────────
    // E2E 08 — UNKNOWN DOCTOR (No Hallucination)
    // ─────────────────────────────────────────────────────────────
    try {
      await delay(4000);
      const res = await consumeSSEStream({
        token: makePatientToken(59),
        message: 'Xem lịch của Bác sĩ Hoàn Toàn Không Tồn Tại 123 ngày mai.',
      });

      assert(
        !res.slotSearchResults || res.slotSearchResults.slots?.length === 0,
        'Must not create slots for fake doctor'
      );
      const textLower = (res.fullText || '').toLowerCase();
      assert(
        textLower.includes('không tìm thấy') ||
        textLower.includes('chưa tìm thấy') ||
        textLower.includes('không tồn tại') ||
        textLower.includes('không có bác sĩ') ||
        textLower.includes('không có thông tin') ||
        res.slotSearchResults?.status === 'not_found',
        'Must inform doctor not found'
      );
      logPass('E2E 08 — UNKNOWN DOCTOR: Refused to hallucinate fake doctor or slots');
    } catch (err) {
      logFail('E2E 08 — UNKNOWN DOCTOR', err);
    }

    // ─────────────────────────────────────────────────────────────
    // E2E 09 — MULTI-TURN CONTEXT DOCTOR REFERENCE ("bác sĩ này")
    // ─────────────────────────────────────────────────────────────
    try {
      await delay(4000);
      const history = [
        { role: 'user', text: 'Tìm bác sĩ da liễu cho tôi.' },
        {
          role: 'model',
          text: 'Tôi đã tìm thấy bác sĩ Lan Trần Bích chuyên khoa Da liễu.',
          doctorSearchResults: {
            data: {
              specialtyName: 'Da liễu',
              doctors: [{ doctorId: 6, name: 'Lan Trần Bích' }],
            },
          },
        },
      ];

      const res = await consumeSSEStream({
        token: makePatientToken(60),
        message: 'Bác sĩ này còn lịch ngày mai không?',
        history,
      });

      if (res.slotSearchResults) {
        assert.strictEqual(res.slotSearchResults.doctor?.doctorId, 6);
        logPass('E2E 09 — MULTI-TURN CONTEXT: Resolved "bác sĩ này" to Doctor 6 from history');
      } else {
        throw new Error('Expected slotSearchResults with resolved doctor');
      }
    } catch (err) {
      logFail('E2E 09 — MULTI-TURN CONTEXT', err);
    }

    // ─────────────────────────────────────────────────────────────
    // E2E 10 — BOOKING BOUNDARY: "Đặt luôn cho tôi"
    // Must NOT create booking transaction in DB
    // ─────────────────────────────────────────────────────────────
    try {
      await delay(4000);
      const initialBookingsCount = await db.Booking.count();

      const res = await consumeSSEStream({
        token: makePatientToken(61),
        message: 'Đặt luôn cho tôi bác sĩ Lan Trần Bích ngày mai lúc 8h.',
      });

      const finalBookingsCount = await db.Booking.count();
      assert.strictEqual(
        finalBookingsCount,
        initialBookingsCount,
        'Booking count must NOT increase in Phase 04'
      );

      // Must not state "đặt lịch thành công"
      assert(
        !res.fullText?.toLowerCase().includes('đặt lịch thành công') &&
        !res.fullText?.toLowerCase().includes('đã đặt thành công'),
        'Must NOT claim booking success'
      );

      logPass('E2E 10 — BOOKING BOUNDARY: Did NOT create booking transaction, ZERO DB mutation');
    } catch (err) {
      logFail('E2E 10 — BOOKING BOUNDARY', err);
    }

    // ─────────────────────────────────────────────────────────────
    // E2E 11 — RBAC & AUTHORIZATION CHECKS
    // ─────────────────────────────────────────────────────────────
    try {
      // 1. Unauthenticated -> 401
      let unauthCode = null;
      try {
        await axios.post(`${BASE_URL}/api/v1/ai/chat`, { message: 'Tìm bác sĩ' });
      } catch (e) {
        unauthCode = e.response?.status;
      }
      assert.strictEqual(unauthCode, 401, 'Unauthenticated request must return 401');

      // 2. Doctor Role (R2) -> 403
      let docCode = null;
      try {
        await axios.post(
          `${BASE_URL}/api/v1/ai/chat`,
          { message: 'Tìm bác sĩ' },
          { headers: { Authorization: `Bearer ${doctorToken}` } }
        );
      } catch (e) {
        docCode = e.response?.status;
      }
      assert.strictEqual(docCode, 403, 'Doctor R2 must receive 403 Forbidden');

      // 3. Admin Role (R1) -> 403
      let adminCode = null;
      try {
        await axios.post(
          `${BASE_URL}/api/v1/ai/chat`,
          { message: 'Tìm bác sĩ' },
          { headers: { Authorization: `Bearer ${adminToken}` } }
        );
      } catch (e) {
        adminCode = e.response?.status;
      }
      assert.strictEqual(adminCode, 403, 'Admin R1 must receive 403 Forbidden');

      logPass('E2E 11 — RBAC SECURITY: Patient (R3) allowed, Doctor (R2) 403, Admin (R1) 403, Unauth 401');
    } catch (err) {
      logFail('E2E 11 — RBAC SECURITY', err);
    }

  } catch (globalErr) {
    console.error('Fatal E2E test runner failure:', globalErr);
    failedCount++;
  } finally {
    if (serverInstance) {
      await new Promise((resolve) => serverInstance.close(resolve));
    }
  }

  console.log('\n============================================================');
  console.log(`REAL HTTP & E2E RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('============================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled fatal error in E2E runner:', err);
  process.exit(1);
});
