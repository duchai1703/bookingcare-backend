// scripts/migrate-7day-call-session.js
'use strict';

require('dotenv').config();
const db = require('../src/models');

async function migrate() {
  console.log('--- Migrating Database for 7-Day Follow-Up Window & WebRTC Call Sessions ---');
  const queryInterface = db.sequelize.getQueryInterface();

  // 1. Add consultationCompletedAt & followUpExpiresAt to Bookings if not present
  const bookingTableDesc = await queryInterface.describeTable('Bookings').catch(() => ({}));

  if (!bookingTableDesc.consultationCompletedAt) {
    console.log('Adding consultationCompletedAt to Bookings...');
    await db.sequelize.query(`
      ALTER TABLE "Bookings"
      ADD COLUMN IF NOT EXISTS "consultationCompletedAt" TIMESTAMP WITH TIME ZONE;
    `);
  } else {
    console.log('Column consultationCompletedAt already exists on Bookings.');
  }

  if (!bookingTableDesc.followUpExpiresAt) {
    console.log('Adding followUpExpiresAt to Bookings...');
    await db.sequelize.query(`
      ALTER TABLE "Bookings"
      ADD COLUMN IF NOT EXISTS "followUpExpiresAt" TIMESTAMP WITH TIME ZONE;
    `);
  } else {
    console.log('Column followUpExpiresAt already exists on Bookings.');
  }

  // Ensure clinicShare exists if referenced by models
  await db.sequelize.query(`
    ALTER TABLE "Bookings"
    ADD COLUMN IF NOT EXISTS "clinicShare" INTEGER DEFAULT 0;
  `);

  // 2. Create index on followUpExpiresAt
  await db.sequelize.query(`
    CREATE INDEX IF NOT EXISTS "idx_bookings_followUpExpiresAt" ON "Bookings" ("followUpExpiresAt");
  `).catch(e => console.warn('Index notice:', e.message));

  // 3. Create CallSessions table if not present
  await db.sequelize.query(`
    CREATE TABLE IF NOT EXISTS "CallSessions" (
      "id" SERIAL PRIMARY KEY,
      "callId" VARCHAR(50) NOT NULL UNIQUE,
      "bookingId" INTEGER NOT NULL REFERENCES "Bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "conversationId" INTEGER REFERENCES "Conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
      "callerId" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "receiverId" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "callType" VARCHAR(20) NOT NULL DEFAULT 'VIDEO',
      "status" VARCHAR(30) NOT NULL DEFAULT 'RINGING',
      "startedAt" TIMESTAMP WITH TIME ZONE,
      "endedAt" TIMESTAMP WITH TIME ZONE,
      "duration" INTEGER DEFAULT 0,
      "endReason" VARCHAR(50),
      "metadata" TEXT,
      "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
  `);

  await db.sequelize.query(`
    CREATE INDEX IF NOT EXISTS "idx_call_sessions_callId" ON "CallSessions" ("callId");
    CREATE INDEX IF NOT EXISTS "idx_call_sessions_bookingId" ON "CallSessions" ("bookingId");
    CREATE INDEX IF NOT EXISTS "idx_call_sessions_caller_status" ON "CallSessions" ("callerId", "status");
    CREATE INDEX IF NOT EXISTS "idx_call_sessions_receiver_status" ON "CallSessions" ("receiverId", "status");
    CREATE INDEX IF NOT EXISTS "idx_call_sessions_status" ON "CallSessions" ("status");
  `).catch(e => console.warn('CallSession index notice:', e.message));

  console.log('✅ Migration completed successfully!');
}

migrate()
  .catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
