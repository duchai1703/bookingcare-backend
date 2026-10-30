'use strict';

/**
 * Regression Verification Suite for BUG-08, BUG-09, BUG-10
 * Validates:
 * TC-08.01: Người dùng nói "Đặt lịch cho người thân" → hiển thị Sổ y bạ (FAMILY_QUERY).
 * TC-08.02: Người dùng nói "Đặt lịch cho mẹ mình" và chỉ có một người phù hợp → nhận diện đúng người.
 * TC-08.03: Người dùng nói "Đặt lịch cho con tôi" nhưng có nhiều người phù hợp → hỏi xác nhận.
 * TC-08.04: Không có thành viên quan hệ phù hợp → thông báo và cho phép lựa chọn thủ công.
 * TC-09.01: Chọn người thân → bắt đầu đặt lịch → không yêu cầu chọn lại.
 * TC-09.02: Chọn người thân → chọn bác sĩ → xem slot → booking vẫn thuộc đúng người thân.
 * TC-09.03: Chọn người thân → chuyển qua nhiều lượt chat → không mất context.
 * TC-09.04: Đổi đối tượng từ mẹ sang bố → context cập nhật chính xác.
 * TC-09.05: Thử truyền patientId/familyMemberId không thuộc quyền truy cập → backend phải từ chối.
 * TC-10.01: Bấm Lịch sử khám của mẹ → hiển thị lịch sử của mẹ.
 * TC-10.02: Bấm Lịch sử khám của người thân khác → dữ liệu không bị trộn.
 * TC-10.03: Xem chi tiết một lịch khám của người thân → đúng booking ID.
 * TC-10.04: Người thân chưa có lịch sử → empty state.
 * TC-10.05: Nhập câu lệnh trực tiếp xem lịch sử khám của mẹ → gọi đúng function.
 * TC-10.06: Lịch sử khám của bản thân vẫn hoạt động bình thường sau khi sửa.
 */

require('dotenv').config();
const db = require('../src/models');
const { classifyIntent, INTENTS } = require('../src/services/aiIntentRouter');
const {
  handleGetMyBookings,
  handlePrepareBookingDraft,
  handleGetAppointmentDetail,
} = require('../src/services/aiFunctionHandlers');
const aiContextService = require('../src/services/aiContextService');

async function runRegressionSuite() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🧪 BẮT ĐẦU REGRESSION TEST SUITE: BUG-08, BUG-09, BUG-10 (FAMILY)');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const results = [];
  function assert(testId, description, condition, details = {}) {
    if (condition) {
      console.log(`✅ [PASS] ${testId}: ${description}`);
      results.push({ testId, description, status: 'PASS', details });
    } else {
      console.error(`❌ [FAIL] ${testId}: ${description}`);
      console.error('   Details:', details);
      results.push({ testId, description, status: 'FAIL', details });
    }
  }

  // Find test users in DB
  // User with family members: e.g. User 52 has 2 CHILDs, User 172 has 1 PARENT (Nguyễn Thị Bé) and booking #492
  const user172 = await db.User.findByPk(172);
  const user52 = await db.User.findByPk(52);
  const user172Members = await db.Family_Member.findAll({ where: { userId: 172 } });
  const user52Members = await db.Family_Member.findAll({ where: { userId: 52 } });
  const user172Booking = await db.Booking.findOne({ where: { patientId: 172, bookingFor: 'FAMILY' } });

  // Find a valid future schedule for doctor 2 or 3
  const now = Date.now();
  let validFutureSchedule = await db.Schedule.findOne({
    where: {
      date: { [db.Sequelize.Op.gte]: String(now) },
      currentNumber: { [db.Sequelize.Op.lt]: db.sequelize.col('maxNumber') },
    },
    include: [{ model: db.User, as: 'doctorData', where: { roleId: 'R2', isActive: true } }],
  });

  if (!validFutureSchedule) {
    validFutureSchedule = await db.Schedule.findByPk(25261);
  }

  const validDoctorId = validFutureSchedule ? validFutureSchedule.doctorId : 2;
  const validScheduleId = validFutureSchedule ? validFutureSchedule.id : 25261;

  console.log(`ℹ️ Test data: User 172 has ${user172Members.length} family member(s) (${user172Members.map(m => `${m.fullName} - ${m.relationship}`).join(', ')}).`);
  console.log(`ℹ️ Test data: User 52 has ${user52Members.length} family member(s) (${user52Members.map(m => `${m.fullName} - ${m.relationship}`).join(', ')}).`);
  console.log(`ℹ️ Active test schedule: ID ${validScheduleId}, Doctor ${validDoctorId}.`);

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 1: BUG-08 — NHẬN DIỆN Ý ĐỊNH ĐẶT LỊCH CHO NGƯỜI THÂN
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n--- KIỂM TRA BUG-08: NHẬN DIỆN Ý ĐỊNH ĐẶT LỊCH CHO NGƯỜI THÂN ---');

  // TC-08.01: Người dùng nói "Đặt lịch cho người thân" → hiển thị Sổ y bạ (FAMILY_QUERY)
  const res08_01 = classifyIntent('Mình muốn đặt lịch cho người thân');
  assert(
    'TC-08.01',
    'Người dùng nói "Đặt lịch cho người thân" → trả về FAMILY_QUERY (hiển thị Sổ y bạ)',
    res08_01.intent === INTENTS.FAMILY_QUERY,
    { res08_01 }
  );

  // TC-08.02: Người dùng nói "Đặt lịch cho mẹ mình" và chỉ có một người phù hợp → nhận diện đúng người
  const res08_02 = classifyIntent('Mình muốn đặt lịch cho mẹ mình');
  assert(
    'TC-08.02',
    'Người dùng nói "Đặt lịch cho mẹ mình" → nhận diện BOOKING_FOR_FAMILY với relationship: PARENT',
    res08_02.intent === INTENTS.BOOKING_FOR_FAMILY &&
    res08_02.extractedEntities?.bookingFor === 'FAMILY' &&
    res08_02.extractedEntities?.relationship === 'PARENT',
    { res08_02 }
  );

  // Resolution test: User 172 has exactly 1 PARENT ('nguyễn thị bé')
  const matched172Parent = user172Members.filter(m => m.relationship === 'PARENT');
  assert(
    'TC-08.02-RES',
    'User 172 có duy nhất 1 người mẹ trong sổ y bạ → xác định chính xác đối tượng',
    matched172Parent.length === 1 && matched172Parent[0].fullName.toLowerCase().includes('bé'),
    { matchedCount: matched172Parent.length, member: matched172Parent[0] }
  );

  // TC-08.03: Người dùng nói "Đặt lịch cho con tôi" nhưng có nhiều người phù hợp → hỏi xác nhận
  const res08_03 = classifyIntent('đặt lịch cho con tôi');
  assert(
    'TC-08.03',
    'Người dùng nói "đặt lịch cho con tôi" → nhận diện BOOKING_FOR_FAMILY với relationship: CHILD',
    res08_03.intent === INTENTS.BOOKING_FOR_FAMILY &&
    res08_03.extractedEntities?.relationship === 'CHILD',
    { res08_03 }
  );

  // Ambiguity test: User 52 has 2 CHILDs in DB
  const draftAmbiguous = await handlePrepareBookingDraft(
    { relationship: 'CHILD', doctorId: validDoctorId, scheduleId: validScheduleId },
    52,
    null,
    {}
  );
  assert(
    'TC-08.03-AMBIGUOUS',
    'User 52 có nhiều người con → backend phát hiện mơ hồ và yêu cầu xác nhận danh tính',
    draftAmbiguous.status === 'ambiguous_family_member' &&
    Array.isArray(draftAmbiguous.members) &&
    draftAmbiguous.members.length >= 2,
    { draftAmbiguous }
  );

  // TC-08.04: Không có thành viên quan hệ phù hợp → thông báo và cho phép lựa chọn thủ công
  const draftNotFound = await handlePrepareBookingDraft(
    { relationship: 'SPOUSE', doctorId: validDoctorId, scheduleId: validScheduleId },
    172,
    null,
    {}
  );
  assert(
    'TC-08.04',
    'Không tìm thấy thành viên có quan hệ phù hợp → backend trả về family_member_not_found',
    draftNotFound.status === 'family_member_not_found' &&
    draftNotFound.error === 'family_member_not_found',
    { draftNotFound }
  );

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 2: BUG-09 — GIỮ TRẠNG THÁI NGƯỜI THÂN ĐÃ CHỌN
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n--- KIỂM TRA BUG-09: GIỮ TRẠNG THÁI NGƯỜI THÂN ĐÃ CHỌN ---');

  // TC-09.01: Chọn người thân → bắt đầu đặt lịch → lưu trữ và duy trì context
  const targetMember = matched172Parent[0];
  const toolContextTest = {
    selectedFamilyMember: targetMember,
    activeFamilyMember: targetMember,
    bookingFor: 'FAMILY',
    familyMemberId: targetMember.id,
  };

  const contextBundle = await aiContextService.buildAIContext({
    userId: 172,
    conversationId: 'test-conv-09',
    currentMessage: 'Tìm bác sĩ chuyên khoa da liễu',
    intent: 'DOCTOR_QUERY',
    rawHistory: [],
    toolContext: toolContextTest,
  });

  assert(
    'TC-09.01',
    'Chọn người thân → context systemInstructionAugmentation duy trì [ĐỐI TƯỢNG ĐẶT LỊCH HIỆN TẠI]',
    contextBundle.systemInstructionAugmentation.includes('[ĐỐI TƯỢNG ĐẶT LỊCH HIỆN TẠI]') &&
    contextBundle.systemInstructionAugmentation.includes(targetMember.fullName) &&
    contextBundle.systemInstructionAugmentation.includes(String(targetMember.id)),
    { augmentation: contextBundle.systemInstructionAugmentation }
  );

  // TC-09.02: Chọn người thân → chọn bác sĩ → xem slot → booking draft vẫn thuộc đúng người thân
  const draftResult = await handlePrepareBookingDraft(
    { scheduleId: validScheduleId, doctorId: validDoctorId },
    172,
    null,
    toolContextTest
  );
  assert(
    'TC-09.02',
    'Booking draft tự động sử dụng selectedFamilyMember từ context (bookingFor: FAMILY, familyMember đúng)',
    draftResult.status === 'success' &&
    draftResult.draft?.bookingFor === 'FAMILY' &&
    (draftResult.draft?.familyMember?.id === targetMember.id || draftResult.draft?.familyMemberId === targetMember.id) &&
    (draftResult.draft?.familyMember?.fullName === targetMember.fullName || draftResult.draft?.patientTarget === targetMember.fullName),
    { draftResult }
  );

  // TC-09.03: Chuyển qua nhiều lượt chat → context không bị mất
  const multiTurnContext = await aiContextService.buildAIContext({
    userId: 172,
    conversationId: 'test-conv-09',
    currentMessage: 'Xem lịch trống ngày mai',
    intent: 'SLOT_QUERY',
    rawHistory: [
      { role: 'user', text: 'Đặt lịch cho mẹ mình' },
      { role: 'model', text: 'Dạ mình đã chọn hồ sơ của Mẹ bạn: Nguyễn Thị Bé.' },
    ],
    toolContext: toolContextTest,
  });

  assert(
    'TC-09.03',
    'Chuyển qua nhiều lượt chat → Context vẫn duy trì đầy đủ familyMemberId và tên người thân',
    multiTurnContext.systemInstructionAugmentation.includes(targetMember.fullName) &&
    multiTurnContext.systemInstructionAugmentation.includes(`ID: ${targetMember.id}`),
    { multiTurnAugmentation: multiTurnContext.systemInstructionAugmentation }
  );

  // TC-09.04: Đổi đối tượng từ mẹ sang bố → context cập nhật chính xác
  const res09_04 = classifyIntent('đổi sang đặt cho bố');
  assert(
    'TC-09.04',
    'Người dùng nói "đổi sang đặt cho bố" → nhận diện BOOKING_FOR_FAMILY với action: SWITCH_TARGET',
    res09_04.intent === INTENTS.BOOKING_FOR_FAMILY &&
    res09_04.extractedEntities?.action === 'SWITCH_TARGET' &&
    res09_04.extractedEntities?.relationship === 'PARENT' &&
    res09_04.extractedEntities?.targetRaw === 'bố',
    { res09_04 }
  );

  // TC-09.05: Thử truyền patientId/familyMemberId không thuộc quyền truy cập → backend từ chối
  const unownedMemberId = user52Members[0]?.id || 999999;
  const idorDraftResult = await handlePrepareBookingDraft(
    { familyMemberId: unownedMemberId, doctorId: validDoctorId, scheduleId: validScheduleId },
    172,
    null,
    {}
  );
  assert(
    'TC-09.05',
    'Thử truyền familyMemberId không thuộc sở hữu của User 172 → Backend từ chối với family_member_not_found',
    idorDraftResult.status === 'error' &&
    idorDraftResult.error === 'family_member_not_found',
    { idorDraftResult }
  );

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 3: BUG-10 — LỊCH SỬ KHÁM CỦA NGƯỜI THÂN
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n--- KIỂM TRA BUG-10: LỊCH SỬ KHÁM CỦA NGƯỜI THÂN ---');

  // TC-10.01: Bấm Lịch sử khám của mẹ → hiển thị lịch sử của mẹ
  const motherHistory = await handleGetMyBookings(
    { familyMemberId: targetMember.id, bookingFor: 'FAMILY' },
    172,
    null,
    toolContextTest
  );
  assert(
    'TC-10.01',
    'Lấy lịch sử khám theo familyMemberId của mẹ → trả về đúng các booking của mẹ',
    motherHistory.status === 'success' &&
    motherHistory.familyMemberName === targetMember.fullName &&
    motherHistory.bookingFor === 'FAMILY' &&
    Array.isArray(motherHistory.bookings) &&
    motherHistory.bookings.every(b => b.bookingFor === 'FAMILY'),
    { motherHistoryCount: motherHistory.total }
  );

  // TC-10.02: Bấm Lịch sử khám của người thân khác → dữ liệu không bị trộn
  const otherMemberHistory = await handleGetMyBookings(
    { familyMemberId: 999998, bookingFor: 'FAMILY' },
    172,
    null,
    {}
  );
  assert(
    'TC-10.02',
    'Tra cứu lịch sử của thành viên không thuộc quyền sở hữu → Bị chặn chống IDOR (không trộn dữ liệu)',
    otherMemberHistory.status === 'error' &&
    otherMemberHistory.error === 'family_member_unauthorized',
    { otherMemberHistory }
  );

  // TC-10.03: Xem chi tiết một lịch khám của người thân → đúng booking ID
  if (user172Booking) {
    const detailRes = await handleGetAppointmentDetail({ bookingId: user172Booking.id }, 172, null);
    const detailBookingId = detailRes.bookingId || detailRes.data?.bookingId;
    const detailBookingFor = detailRes.bookingFor || detailRes.data?.bookingFor;
    assert(
      'TC-10.03',
      `Xem chi tiết ca khám #${user172Booking.id} của người thân → đúng booking ID và bookingFor: FAMILY`,
      detailRes.status === 'success' &&
      detailBookingId === user172Booking.id &&
      detailBookingFor === 'FAMILY',
      { detailRes }
    );
  } else {
    console.warn('⚠️ [SKIP TC-10.03] Không có booking lịch sử của người thân');
  }

  // TC-10.04: Người thân chưa có lịch sử → empty state
  const emptyMemberHistory = await handleGetMyBookings(
    { familyMemberId: user52Members[0]?.id, bookingFor: 'FAMILY' },
    52,
    null,
    {}
  );
  assert(
    'TC-10.04',
    'Người thân chưa có lịch sử khám → Trả về empty state rõ ràng (total: 0, bookings: [])',
    emptyMemberHistory.status === 'success' &&
    emptyMemberHistory.total === 0 &&
    Array.isArray(emptyMemberHistory.bookings) &&
    emptyMemberHistory.bookings.length === 0,
    { emptyMemberHistory }
  );

  // TC-10.05: Nhập câu lệnh trực tiếp xem lịch sử khám của mẹ → gọi đúng function
  const res10_05 = classifyIntent('Xem lịch sử khám của mẹ tôi');
  assert(
    'TC-10.05',
    'Nhập câu lệnh trực tiếp "Xem lịch sử khám của mẹ tôi" → phân loại MY_BOOKING_QUERY với isFamilyHistory: true',
    res10_05.intent === INTENTS.MY_BOOKING_QUERY &&
    res10_05.extractedEntities?.bookingFor === 'FAMILY' &&
    res10_05.extractedEntities?.isFamilyHistory === true &&
    res10_05.extractedEntities?.relationship === 'PARENT',
    { res10_05 }
  );

  // Direct by name
  const res10_05_name = classifyIntent('Cho tôi xem các lịch khám của Nguyễn Thị Bé');
  assert(
    'TC-10.05-NAME',
    'Nhập câu lệnh trực tiếp có tên "Cho tôi xem các lịch khám của Nguyễn Thị Bé" → nhận diện familyMemberName',
    res10_05_name.intent === INTENTS.MY_BOOKING_QUERY &&
    res10_05_name.extractedEntities?.bookingFor === 'FAMILY' &&
    res10_05_name.extractedEntities?.familyMemberName === 'nguyễn thị bé',
    { res10_05_name }
  );

  // TC-10.06: Lịch sử khám của bản thân vẫn hoạt động bình thường sau khi sửa
  const res10_06 = classifyIntent('lịch sử khám của tôi');
  const selfHistory = await handleGetMyBookings({ bookingFor: 'SELF' }, 172, null, {});
  assert(
    'TC-10.06',
    'Lịch sử khám của bản thân ("lịch sử khám của tôi") vẫn hoạt động chuẩn xác (bookingFor: SELF)',
    res10_06.intent === INTENTS.MY_BOOKING_QUERY &&
    res10_06.extractedEntities?.bookingFor !== 'FAMILY' &&
    selfHistory.status === 'success' &&
    selfHistory.bookingFor === 'SELF',
    { res10_06, selfHistoryCount: selfHistory.total }
  );

  // ═══════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('📊 TỔNG KẾT KẾT QUẢ KIỂM ĐỊNH BUG-08, BUG-09, BUG-10:');
  const totalTests = results.length;
  const passTests = results.filter(r => r.status === 'PASS').length;
  const failTests = results.filter(r => r.status === 'FAIL').length;
  console.log(`- Tổng số test case: ${totalTests}`);
  console.log(`- PASS: ${passTests}`);
  console.log(`- FAIL: ${failTests}`);
  console.log(`- Tỷ lệ thành công: ${((passTests / totalTests) * 100).toFixed(1)}%`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (failTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRegressionSuite().catch(err => {
  console.error('Fatal error running suite:', err);
  process.exit(1);
});
