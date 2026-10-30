'use strict';
require('dotenv').config();
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const routes = require('../src/routes/web');

const TEST_PORT = 8097;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || 'bookingcare-secret-key-2026';

function createToken(userId, roleId = 'R3') {
  return jwt.sign({ id: userId, roleId }, JWT_SECRET, { expiresIn: '1h' });
}

async function testAppointmentHistorySSE() {
  const app = express();
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
  routes(app);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`Test server running at ${BASE_URL}`);

  try {
    const token = createToken(52); // Patient Huong Pham Thuy (ID 52)
    console.log('\n--- Sending request: "lịch sử khám của tôi" ---');

    const res = await axios.post(
      `${BASE_URL}/api/v1/ai/chat`,
      { message: 'lịch sử khám của tôi', history: [] },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        responseType: 'stream',
        timeout: 30000,
      }
    );

    const events = [];
    let text = '';
    let buffer = '';

    await new Promise((resolve, reject) => {
      res.data.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const line = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          if (line.startsWith('data: ')) {
            const rawData = line.slice(6);
            if (rawData === '[DONE]') {
              resolve();
              return;
            }
            if (rawData.startsWith(':')) continue;
            try {
              const parsed = JSON.parse(rawData);
              events.push(parsed);
              if (parsed.text) text += parsed.text;
            } catch (e) {
              console.log('Non-json line:', rawData);
            }
          }
        }
      });
      res.data.on('end', resolve);
      res.data.on('error', reject);
    });

    console.log('\n--- SSE Response Summary ---');
    console.log('Total events received:', events.length);
    console.log('Event types:', events.map(e => e.event || e.type || (e.text ? 'text' : Object.keys(e))));
    console.log('Accumulated text:\n', text);

    const apptListEvent = events.find(e => e.event === 'appointment:list' || e.type === 'APPOINTMENT_LIST' || e.appointmentList);
    if (apptListEvent) {
      console.log('\n✅ FOUND appointment:list event!');
      console.log('Payload sample:', JSON.stringify(apptListEvent, null, 2).slice(0, 500) + '...');
    } else {
      console.log('\n❌ NO appointment:list event found in stream!');
    }

  } catch (err) {
    if (err.response) {
      console.error('HTTP Status:', err.response.status);
      if (typeof err.response.data?.on === 'function') {
        let errBuf = '';
        err.response.data.on('data', c => errBuf += c.toString());
        err.response.data.on('end', () => console.error('Error Body:', errBuf));
      } else {
        console.error('Error Body:', err.response.data);
      }
    } else {
      console.error('Test error:', err.message);
    }
  } finally {
    server.close();
  }
}

testAppointmentHistorySSE();
