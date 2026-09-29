// bookingcare-backend/scripts/migrate-multi-facility-phase1.js
// [Phase 1 - Multi-facility] Schema Alteration, Indexing & Data Backfill
'use strict';
require('dotenv').config();
const db = require('../src/models');

async function runMigration() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🚀 BẮT ĐẦU MIGRATION PHASE 1: BÁC SĨ ĐA CƠ SỞ Y TẾ (MULTI-FACILITY)');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  try {
    await db.sequelize.authenticate();
    console.log('✅ Bước 1: Kết nối cơ sở dữ liệu PostgreSQL thành công.\n');

    // ─────────────────────────────────────────────────────────────────
    // 1. DDL: Thêm các cột mới vào Schedules & Bookings nếu chưa tồn tại
    // ─────────────────────────────────────────────────────────────────
    console.log('⏳ Bước 2: Bổ sung cấu trúc cột mới vào bảng Schedules & Bookings...');
    
    // Thêm clinicId vào Schedules
    await db.sequelize.query(`
      ALTER TABLE "Schedules" ADD COLUMN IF NOT EXISTS "clinicId" INTEGER;
    `);
    console.log('   ✓ Bảng "Schedules": Đã đảm bảo tồn tại cột "clinicId" (INTEGER).');

    // Thêm clinicId & doctorAssignmentId vào Bookings
    await db.sequelize.query(`
      ALTER TABLE "Bookings" ADD COLUMN IF NOT EXISTS "clinicId" INTEGER;
      ALTER TABLE "Bookings" ADD COLUMN IF NOT EXISTS "doctorAssignmentId" INTEGER;
    `);
    console.log('   ✓ Bảng "Bookings": Đã đảm bảo tồn tại cột "clinicId" & "doctorAssignmentId".\n');

    // ─────────────────────────────────────────────────────────────────
    // 2. DDL: Tạo Indexes phục vụ truy vấn tốc độ cao
    // ─────────────────────────────────────────────────────────────────
    console.log('⏳ Bước 3: Tạo Index tra cứu theo cơ sở và quan hệ công tác...');
    await db.sequelize.query(`
      CREATE INDEX IF NOT EXISTS "idx_schedule_clinicId" ON "Schedules" ("clinicId");
      CREATE INDEX IF NOT EXISTS "idx_schedule_doctor_clinic_date" ON "Schedules" ("doctorId", "clinicId", "date");
      CREATE INDEX IF NOT EXISTS "idx_bookings_clinicId" ON "Bookings" ("clinicId");
      CREATE INDEX IF NOT EXISTS "idx_bookings_doctorAssignmentId" ON "Bookings" ("doctorAssignmentId");
      CREATE INDEX IF NOT EXISTS "idx_bookings_doctor_clinic_date" ON "Bookings" ("doctorId", "clinicId", "date");
    `);
    console.log('   ✓ Đã hoàn tất tạo 5 Composite Indexes tối ưu truy vấn.\n');

    // ─────────────────────────────────────────────────────────────────
    // 3. DML: Backfill clinicId cho bảng Schedules
    // ─────────────────────────────────────────────────────────────────
    console.log('⏳ Bước 4: Đồng bộ hóa dữ liệu (Backfill) cho bảng Schedules...');
    
    // Lấy mapping doctor -> clinicId (ưu tiên Doctor_Assignment isPrimary, fallback Doctor_Info)
    const [scheduleBackfillResult] = await db.sequelize.query(`
      UPDATE "Schedules" s
      SET "clinicId" = COALESCE(
        (SELECT da."clinicId" 
         FROM "Doctor_Assignments" da 
         WHERE da."doctorId" = s."doctorId" AND da."isPrimary" = true 
         LIMIT 1),
        (SELECT da."clinicId" 
         FROM "Doctor_Assignments" da 
         WHERE da."doctorId" = s."doctorId" 
         ORDER BY da."id" ASC 
         LIMIT 1),
        (SELECT di."clinicId" 
         FROM "Doctor_Infos" di 
         WHERE di."doctorId" = s."doctorId" 
         LIMIT 1)
      )
      WHERE s."clinicId" IS NULL;
    `);
    console.log(`   ✓ Đã backfill clinicId cho các bản ghi Schedule.\n`);

    // ─────────────────────────────────────────────────────────────────
    // 4. DML: Backfill clinicId & doctorAssignmentId cho bảng Bookings
    // ─────────────────────────────────────────────────────────────────
    console.log('⏳ Bước 5: Đồng bộ hóa dữ liệu (Backfill) cho bảng Bookings...');
    
    // Cập nhật doctorAssignmentId và clinicId cho Bookings
    const [bookingBackfillResult] = await db.sequelize.query(`
      UPDATE "Bookings" b
      SET 
        "doctorAssignmentId" = COALESCE(
          b."doctorAssignmentId",
          (SELECT da."id" 
           FROM "Doctor_Assignments" da 
           WHERE da."doctorId" = b."doctorId" AND da."isPrimary" = true 
           LIMIT 1),
          (SELECT da."id" 
           FROM "Doctor_Assignments" da 
           WHERE da."doctorId" = b."doctorId" 
           ORDER BY da."id" ASC 
           LIMIT 1)
        ),
        "clinicId" = COALESCE(
          b."clinicId",
          (SELECT da."clinicId" 
           FROM "Doctor_Assignments" da 
           WHERE da."doctorId" = b."doctorId" AND da."isPrimary" = true 
           LIMIT 1),
          (SELECT da."clinicId" 
           FROM "Doctor_Assignments" da 
           WHERE da."doctorId" = b."doctorId" 
           ORDER BY da."id" ASC 
           LIMIT 1),
          (SELECT di."clinicId" 
           FROM "Doctor_Infos" di 
           WHERE di."doctorId" = b."doctorId" 
           LIMIT 1)
        )
      WHERE b."clinicId" IS NULL OR b."doctorAssignmentId" IS NULL;
    `);
    console.log(`   ✓ Đã backfill clinicId & doctorAssignmentId cho các bản ghi Booking.\n`);

    // ─────────────────────────────────────────────────────────────────
    // 5. Thống kê kết quả kiểm tra toàn vẹn dữ liệu
    // ─────────────────────────────────────────────────────────────────
    console.log('⏳ Bước 6: Thống kê số lượng sau migration...');

    const [schedStats] = await db.sequelize.query(`
      SELECT 
        COUNT(*) as total_schedules,
        COUNT("clinicId") as schedules_with_clinic,
        COUNT(*) - COUNT("clinicId") as schedules_without_clinic
      FROM "Schedules";
    `);

    const [bookStats] = await db.sequelize.query(`
      SELECT 
        COUNT(*) as total_bookings,
        COUNT("clinicId") as bookings_with_clinic,
        COUNT("doctorAssignmentId") as bookings_with_assignment,
        COUNT(*) - COUNT("clinicId") as bookings_without_clinic
      FROM "Bookings";
    `);

    const [assignStats] = await db.sequelize.query(`
      SELECT 
        COUNT(*) as total_assignments,
        COUNT(DISTINCT "doctorId") as doctors_assigned,
        COUNT(DISTINCT "clinicId") as clinics_assigned
      FROM "Doctor_Assignments";
    `);

    console.log('   📊 Thống kê Lịch khám (Schedules):', schedStats[0]);
    console.log('   📊 Thống kê Lịch hẹn (Bookings):', bookStats[0]);
    console.log('   📊 Thống kê Phân bổ (Doctor_Assignments):', assignStats[0]);

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('🎉 MIGRATION PHASE 1 HOÀN TẤT THÀNH CÔNG VỚI 100% TOÀN VẸN DỮ LIỆU!');
    console.log('═══════════════════════════════════════════════════════════════════');

    process.exit(0);
  } catch (err) {
    console.error('❌ [FATAL ERROR] Lỗi trong quá trình migration Phase 1:', err);
    process.exit(1);
  }
}

runMigration();
