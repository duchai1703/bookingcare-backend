'use strict';

/**
 * Live End-to-End WebSocket & REST Test through Nginx on Port 80
 */
require('dotenv').config();
const { io } = require('socket.io-client');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const db = require('../src/models');

async function testRealSocketFlow() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🌐 TESTING LIVE REAL-TIME SOCKET.IO & REST THROUGH NGINX (PORT 80)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // 1. Fetch an S3 booking with its patient and doctor
    const s3Booking = await db.Booking.findOne({
      where: { statusId: 'S3' },
      include: [
        { model: db.User, as: 'patientData' },
        { model: db.User, as: 'doctorBookingData' },
      ],
    });

    if (!s3Booking) {
      throw new Error('No S3 booking found in database.');
    }

    console.log(`📌 Using Booking ID #${s3Booking.id} (Status: ${s3Booking.statusId})`);
    console.log(`   Patient ID: ${s3Booking.patientId}, Doctor ID: ${s3Booking.doctorId}`);

    if (!s3Booking.consultationCompletedAt || !s3Booking.followUpExpiresAt) {
      const completedAt = new Date();
      const expiresAt = new Date(completedAt.getTime() + 168 * 3600 * 1000);
      await s3Booking.update({
        consultationCompletedAt: completedAt,
        followUpExpiresAt: expiresAt,
      });
      s3Booking.consultationCompletedAt = completedAt;
      s3Booking.followUpExpiresAt = expiresAt;
    }

    const patientToken = jwt.sign(
      {
        id: s3Booking.patientId,
        email: s3Booking.patientData?.email,
        roleId: 'R3',
        tokenVersion: s3Booking.patientData?.tokenVersion || 0,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const doctorToken = jwt.sign(
      {
        id: s3Booking.doctorId,
        email: s3Booking.doctorBookingData?.email,
        roleId: 'R2',
        tokenVersion: s3Booking.doctorBookingData?.tokenVersion || 0,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 2. Test REST endpoint through Nginx (Port 80)
    console.log('\n--- Step 1: POST /api/v1/chat/bookings/:id/conversation via Nginx ---');
    const restRes = await axios.post(
      `http://localhost/api/v1/chat/bookings/${s3Booking.id}/conversation`,
      {},
      {
        headers: { Authorization: `Bearer ${patientToken}` },
      }
    );

    console.log('✅ REST Response Status:', restRes.status);
    console.log('✅ REST Response Body:', restRes.data);
    const conversationId = restRes.data.data.id;

    // 3. Connect Patient Socket through Nginx (/socket.io/)
    console.log('\n--- Step 2: Patient connects to Socket.IO through Nginx ---');
    const patientSocket = io('http://localhost', {
      path: '/socket.io/',
      auth: { token: patientToken },
      transports: ['websocket', 'polling'],
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Patient socket connection timeout')), 10000);
      patientSocket.on('connect', () => {
        clearTimeout(timeout);
        console.log('✅ Patient Socket connected! ID:', patientSocket.id);
        resolve();
      });
      patientSocket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // 4. Connect Doctor Socket through Nginx (/socket.io/)
    console.log('\n--- Step 3: Doctor connects to Socket.IO through Nginx ---');
    const doctorSocket = io('http://localhost', {
      path: '/socket.io/',
      auth: { token: doctorToken },
      transports: ['websocket', 'polling'],
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Doctor socket connection timeout')), 10000);
      doctorSocket.on('connect', () => {
        clearTimeout(timeout);
        console.log('✅ Doctor Socket connected! ID:', doctorSocket.id);
        resolve();
      });
      doctorSocket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // 5. Join Conversation Room for both
    console.log('\n--- Step 4: Both join conversation room ---');
    await new Promise((resolve) => {
      patientSocket.emit('chat:conversation:join', { conversationId }, (res) => {
        console.log('✅ Patient joined room response:', res);
        resolve();
      });
    });

    await new Promise((resolve) => {
      doctorSocket.emit('chat:conversation:join', { conversationId }, (res) => {
        console.log('✅ Doctor joined room response:', res);
        resolve();
      });
    });

    // 6. Test Real-time Message Exchange (Patient -> Doctor)
    console.log('\n--- Step 5: Patient sends real-time message ---');
    const testMessagePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for real-time message broadcast')), 10000);
      doctorSocket.on('chat:message:new', (payload) => {
        clearTimeout(timeout);
        console.log('✅ Doctor received real-time broadcast message:', payload.message.content);
        resolve(payload);
      });
    });

    const clientMsgId = `live-test-${Date.now()}`;
    patientSocket.emit(
      'chat:message:send',
      {
        conversationId,
        clientMessageId: clientMsgId,
        content: 'Bác sĩ cho em hỏi đơn thuốc uống trước hay sau ăn?',
      },
      (ack) => {
        console.log('✅ Patient received server ACK:', ack);
      }
    );

    const receivedPayload = await testMessagePromise;
    console.log('✅ Real-time broadcast successfully verified across sockets!');

    // 7. Test Read Receipts
    console.log('\n--- Step 6: Doctor marks message as read ---');
    const readReceiptPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for read receipt broadcast')), 10000);
      patientSocket.on('chat:message:read', (payload) => {
        clearTimeout(timeout);
        console.log('✅ Patient received read receipt broadcast:', payload);
        resolve(payload);
      });
    });

    doctorSocket.emit('chat:message:read', { conversationId }, (ack) => {
      console.log('✅ Doctor received read ACK:', ack);
    });

    await readReceiptPromise;
    console.log('✅ Real-time read receipt successfully verified!');

    // Clean disconnect
    patientSocket.disconnect();
    doctorSocket.disconnect();

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('🎉 LIVE REAL-TIME SOCKET.IO & REST VERIFICATION 100% SUCCESSFUL!');
    console.log('═══════════════════════════════════════════════════════════════\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Real socket flow test failed:', err);
    process.exit(1);
  }
}

testRealSocketFlow();
