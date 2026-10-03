'use strict';

// ═══════════════════════════════════════════════════════════════════════
// End-to-End Real HTTP / SSE / Docker PostgreSQL / Gemini Vision Test
// Run with: node scripts/verify-ai-vision-http-e2e.js
// ═══════════════════════════════════════════════════════════════════════

require('dotenv').config();
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const db = require('../src/models');
const express = require('express');
const routes = require('../src/routes/web');

const app = express();
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));
routes(app);

const TEST_PORT = 8089;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

// Valid 1x1 PNG Buffer
const VALID_1X1_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cfc000000301010018dd8d400000000049454e44ae426082',
  'hex'
);

// SVG Payload
const SVG_PAYLOAD = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect fill="red"/></svg>',
  'utf-8'
);

let serverInstance = null;
let passedCount = 0;
let failedCount = 0;

function logPass(title) {
  console.log(`  ✅ [PASS] ${title}`);
  passedCount++;
}

function logFail(title, err) {
  console.error(`  ❌ [FAIL] ${title}`);
  console.error(`     Reason: ${err.message || err}`);
  failedCount++;
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('🌐 BOOKINGCARE AI — REAL HTTP / SSE / POSTGRESQL / VISION E2E TEST');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  try {
    // 1. Authenticate with PostgreSQL
    await db.sequelize.authenticate();
    console.log('📦 Real PostgreSQL connection verified successfully.');

    // 2. Fetch real Patient and Doctor users from DB
    const patientUser = await db.User.findOne({ where: { roleId: 'R3' } });
    assert(patientUser, 'Must find a real Patient (R3) in database');

    const doctorUser = await db.User.findOne({ where: { roleId: 'R2' } });
    assert(doctorUser, 'Must find a real Doctor (R2) in database');

    const patientToken = jwt.sign(
      {
        id: patientUser.id,
        email: patientUser.email,
        roleId: patientUser.roleId,
        tokenVersion: patientUser.tokenVersion || 0,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const doctorToken = jwt.sign(
      {
        id: doctorUser.id,
        email: doctorUser.email,
        roleId: doctorUser.roleId,
        tokenVersion: doctorUser.tokenVersion || 0,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 3. Start server on ephemeral port
    serverInstance = app.listen(TEST_PORT);
    await new Promise((resolve) => serverInstance.on('listening', resolve));
    console.log(`🚀 Test Express server running on ${BASE_URL}\n`);

    // ── TEST 1: Doctor role is blocked from image upload (HTTP 403) ──
    try {
      const formData = new FormData();
      const blob = new Blob([VALID_1X1_PNG], { type: 'image/png' });
      formData.append('image', blob, 'test.png');

      await axios.post(`${BASE_URL}/api/v1/ai/upload-image`, formData, {
        headers: {
          Authorization: `Bearer ${doctorToken}`,
        },
      });
      logFail('1. Doctor is blocked from upload-image', new Error('Expected 403 but got 200'));
    } catch (err) {
      if (err.response && err.response.status === 403) {
        logPass('1. Doctor is blocked from upload-image with HTTP 403');
      } else {
        logFail('1. Doctor is blocked from upload-image', err);
      }
    }

    // ── TEST 2: Unauthenticated user is rejected (HTTP 401) ──
    try {
      const formData = new FormData();
      const blob = new Blob([VALID_1X1_PNG], { type: 'image/png' });
      formData.append('image', blob, 'test.png');

      await axios.post(`${BASE_URL}/api/v1/ai/upload-image`, formData);
      logFail('2. Unauthenticated user rejected', new Error('Expected 401 but got 200'));
    } catch (err) {
      if (err.response && err.response.status === 401) {
        logPass('2. Unauthenticated request to upload-image rejected with HTTP 401');
      } else {
        logFail('2. Unauthenticated request to upload-image', err);
      }
    }

    // ── TEST 3: SVG file rejected with HTTP 400 / 415 ──
    try {
      const formData = new FormData();
      const blob = new Blob([SVG_PAYLOAD], { type: 'image/svg+xml' });
      formData.append('image', blob, 'malicious.svg');

      await axios.post(`${BASE_URL}/api/v1/ai/upload-image`, formData, {
        headers: {
          Authorization: `Bearer ${patientToken}`,
        },
      });
      logFail('3. SVG file is strictly rejected', new Error('Expected rejection but got 200'));
    } catch (err) {
      if (err.response && (err.response.status === 400 || err.response.status === 415)) {
        logPass('3. SVG upload rejected by backend validation with HTTP ' + err.response.status);
      } else {
        logFail('3. SVG file is strictly rejected', err);
      }
    }

    // ── TEST 4: Oversized file (> 5MB) rejected ──
    try {
      const largeBuf = Buffer.alloc(5 * 1024 * 1024 + 1024);
      const formData = new FormData();
      const blob = new Blob([largeBuf], { type: 'image/jpeg' });
      formData.append('image', blob, 'oversized.jpg');

      await axios.post(`${BASE_URL}/api/v1/ai/upload-image`, formData, {
        headers: {
          Authorization: `Bearer ${patientToken}`,
        },
      });
      logFail('4. Oversized file (> 5MB) rejected', new Error('Expected 413/400 but got 200'));
    } catch (err) {
      if (err.response && (err.response.status === 413 || err.response.status === 400)) {
        logPass('4. Oversized file (> 5MB) rejected with HTTP ' + err.response.status);
      } else {
        logFail('4. Oversized file (> 5MB) rejected', err);
      }
    }

    // ── TEST 5: Patient uploads valid PNG image (HTTP 200) ──
    let uploadedImageId = null;
    try {
      const formData = new FormData();
      const blob = new Blob([VALID_1X1_PNG], { type: 'image/png' });
      formData.append('image', blob, 'valid_sample.png');

      const res = await axios.post(`${BASE_URL}/api/v1/ai/upload-image`, formData, {
        headers: {
          Authorization: `Bearer ${patientToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.success, true);
      assert.ok(res.data.imageId, 'Must return imageId');
      uploadedImageId = res.data.imageId;
      logPass(`5. Patient uploads valid PNG image successfully (imageId: ${uploadedImageId})`);
    } catch (err) {
      logFail('5. Patient uploads valid PNG image', err);
    }

    // ── TEST 6: Patient sends SSE chat request with imageId ──
    try {
      assert(uploadedImageId, 'uploadedImageId must exist');

      let receivedSseData = '';
      let hasVisionEvent = false;
      let hasDoneMarker = false;

      const chatResponse = await axios.post(
        `${BASE_URL}/api/v1/ai/chat`,
        {
          message: 'Phân tích sơ bộ hình ảnh này',
          imageId: uploadedImageId,
          history: [],
          language: 'vi',
        },
        {
          headers: {
            Authorization: `Bearer ${patientToken}`,
            Accept: 'text/event-stream',
          },
          responseType: 'stream',
        }
      );

      assert.strictEqual(chatResponse.headers['content-type'].includes('text/event-stream'), true);

      await new Promise((resolve, reject) => {
        chatResponse.data.on('data', (chunk) => {
          const text = chunk.toString('utf-8');
          receivedSseData += text;
          if (text.includes('vision:analysis') || text.includes('VISION_ANALYSIS')) {
            hasVisionEvent = true;
          }
          if (text.includes('[DONE]')) {
            hasDoneMarker = true;
          }
        });
        chatResponse.data.on('end', resolve);
        chatResponse.data.on('error', reject);
      });

      assert.ok(receivedSseData.length > 0, 'Must receive SSE stream data');
      assert.strictEqual(hasVisionEvent, true, 'SSE stream must deliver vision:analysis event');
      assert.strictEqual(hasDoneMarker, true, 'SSE stream must terminate with [DONE]');
      logPass('6. SSE stream with Gemini Vision delivered streaming text & structured vision event');
    } catch (err) {
      logFail('6. Patient sends SSE chat request with imageId', err);
    }

    // ── TEST 7: Verify temporary file cleanup after request completion ──
    try {
      const tempDir = path.join(__dirname, '../uploads/temp_ai');
      let orphanFound = false;
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
          if (file.includes(uploadedImageId)) {
            orphanFound = true;
            break;
          }
        }
      }
      assert.strictEqual(orphanFound, false, 'Temporary image file must be deleted upon stream completion');
      logPass('7. Temporary image file is automatically cleaned up from disk after processing');
    } catch (err) {
      logFail('7. Verify temporary file cleanup', err);
    }

    // ── TEST 8: Text-only Chat Regression Check over HTTP/SSE ──
    try {
      let receivedText = '';
      let textDone = false;

      const textRes = await axios.post(
        `${BASE_URL}/api/v1/ai/chat`,
        {
          message: 'Xin chào, phòng khám mở cửa mấy giờ?',
          history: [],
          language: 'vi',
        },
        {
          headers: {
            Authorization: `Bearer ${patientToken}`,
            Accept: 'text/event-stream',
          },
          responseType: 'stream',
        }
      );

      await new Promise((resolve, reject) => {
        textRes.data.on('data', (chunk) => {
          const text = chunk.toString('utf-8');
          receivedText += text;
          if (text.includes('[DONE]')) {
            textDone = true;
          }
        });
        textRes.data.on('end', resolve);
        textRes.data.on('error', reject);
      });

      assert.ok(receivedText.length > 0, 'Must receive text response');
      assert.strictEqual(textDone, true, 'Must finish with [DONE]');
      logPass('8. Existing text-only chat stream remains 100% functional (0 regressions)');
    } catch (err) {
      logFail('8. Text-only Chat Regression Check', err);
    }

  } catch (fatalErr) {
    console.error('Fatal Test Error:', fatalErr);
    failedCount++;
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`📊 HTTP E2E RESULTS: ${passedCount} PASSED, ${failedCount} FAILED out of 8 tests`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (failedCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

run();
