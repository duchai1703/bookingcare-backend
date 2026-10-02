// bookingcare-backend/scripts/verify-notification-system.js
'use strict';

const assert = require('assert');
const db = require('../src/models');
const notificationService = require('../src/services/notificationService');
const notificationRepository = require('../src/repositories/notificationRepository');

async function runNotificationVerification() {
  console.log('====================================================');
  console.log('🧪 RUNNING NOTIFICATION SYSTEM END-TO-END VERIFICATION');
  console.log('====================================================');

  try {
    // 1. Check Table in Database
    const tableExists = await db.sequelize.getQueryInterface().showAllTables();
    console.log('1. Checking database tables...');
    assert(tableExists.map(t => t.toLowerCase()).includes('notifications'), 'Table Notifications must exist in database');
    console.log('  ✔ [PASS] Table "Notifications" exists and is synchronized in PostgreSQL');

    // 2. Fetch real users from database for valid Foreign Key test
    const users = await db.User.findAll({ limit: 2, attributes: ['id', 'email', 'roleId'] });
    assert(users.length >= 2, 'Must have at least 2 users in database');
    const user1Id = users[0].id;
    const user2Id = users[1].id;
    console.log(`  ✔ [PASS] Using real users from database: User 1 (#${user1Id}), User 2 (#${user2Id})`);

    // Clean up any old test data
    await db.Notification.destroy({ where: { recipientId: [user1Id, user2Id] } });

    // 3. Test Create & Persistence
    console.log('2. Testing Notification creation and persistence...');
    const notif1 = await notificationService.createAndSendNotification({
      recipientId: user1Id,
      type: 'BOOKING_CREATED',
      title: 'Lịch khám mới',
      message: 'Bệnh nhân Nguyễn Văn A đã đặt lịch hẹn #12345.',
      entityType: 'BOOKING',
      entityId: 12345,
      data: { bookingId: 12345, patientName: 'Nguyễn Văn A' },
    });

    assert(notif1, 'Notification should be created');
    assert.strictEqual(notif1.recipientId, user1Id);
    assert.strictEqual(notif1.isRead, false);
    assert.strictEqual(notif1.type, 'BOOKING_CREATED');
    console.log('  ✔ [PASS] Notification persisted to DB with correct schema & attributes');

    const notif2 = await notificationService.createAndSendNotification({
      recipientId: user1Id,
      type: 'PAYMENT_SUCCESS',
      title: 'Nạp tiền vào ví thành công',
      message: 'Ví của bạn đã được nạp +500.000 đ',
      entityType: 'WALLET',
      entityId: 88,
      data: { walletId: 88, amount: 500000 },
    });

    // 4. Test Unread Count
    console.log('3. Testing Unread Count...');
    let unreadRes = await notificationService.getUnreadCount(user1Id);
    assert.strictEqual(unreadRes.errCode, 0);
    assert.strictEqual(unreadRes.data.unreadCount, 2);
    console.log(`  ✔ [PASS] Unread count is correct: ${unreadRes.data.unreadCount}`);

    // 5. Test Recipient Isolation (User 2 should have 0 notifications)
    console.log('4. Testing Recipient Isolation...');
    let user2Res = await notificationService.getUserNotifications(user2Id);
    assert.strictEqual(user2Res.data.count, 0);
    let user2Count = await notificationService.getUnreadCount(user2Id);
    assert.strictEqual(user2Count.data.unreadCount, 0);
    console.log('  ✔ [PASS] Recipient isolation strictly enforced: User 2 has 0 notifications and 0 unread count');

    // 6. Test Mark Single Notification as Read
    console.log('5. Testing Mark as Read...');
    const markReadRes = await notificationService.markAsRead(notif1.id, user1Id);
    assert.strictEqual(markReadRes.errCode, 0);
    unreadRes = await notificationService.getUnreadCount(user1Id);
    assert.strictEqual(unreadRes.data.unreadCount, 1);
    console.log('  ✔ [PASS] Single notification marked as read; unread count accurately decremented to 1');

    // 7. Test Mark as Read Security (User 2 attempts to mark User 1 notification)
    console.log('6. Testing Mark as Read Unauthorized Access Attempt...');
    const unauthorizedMark = await notificationService.markAsRead(notif2.id, user2Id);
    assert.strictEqual(unauthorizedMark.errCode, 0);
    assert.strictEqual(unauthorizedMark.data.success, false);
    assert.strictEqual(unauthorizedMark.data.notification, null);
    unreadRes = await notificationService.getUnreadCount(user1Id);
    assert.strictEqual(unreadRes.data.unreadCount, 1);
    console.log('  ✔ [PASS] User 2 cannot mark User 1 notification as read; User 1 unread count unchanged');

    // 8. Test Mark All as Read
    console.log('7. Testing Mark All as Read...');
    const markAllRes = await notificationService.markAllAsRead(user1Id);
    assert.strictEqual(markAllRes.errCode, 0);
    unreadRes = await notificationService.getUnreadCount(user1Id);
    assert.strictEqual(unreadRes.data.unreadCount, 0);
    console.log('  ✔ [PASS] Mark all as read succeeds; unread count is 0');

    // 9. Test Admin Notification Gate (WITHDRAWAL_REQUESTED)
    console.log('8. Testing Admin Notification Gate...');
    const adminUser = await db.User.findOne({ where: { roleId: 'R1' } });
    if (adminUser) {
      await db.Notification.destroy({ where: { recipientId: adminUser.id } });
      const adminNotif = await notificationService.createAndSendNotification({
        recipientId: adminUser.id,
        type: 'WITHDRAWAL_REQUESTED',
        title: 'Yêu cầu rút tiền mới',
        message: 'Bác sĩ A vừa tạo yêu cầu rút 1.000.000 đ',
        entityType: 'WALLET',
        entityId: 999,
        data: { withdrawalId: 999, amount: 1000000 },
      });
      assert(adminNotif, 'Admin notification should be created');
      const adminUnread = await notificationService.getUnreadCount(adminUser.id);
      assert.strictEqual(adminUnread.data.unreadCount, 1);
      const adminList = await notificationService.getUserNotifications(adminUser.id);
      assert.strictEqual(adminList.data.count, 1);
      assert.strictEqual(adminList.data.rows[0].type, 'WITHDRAWAL_REQUESTED');

      // Admin marks all as read
      await notificationService.markAllAsRead(adminUser.id);
      const adminAfter = await notificationService.getUnreadCount(adminUser.id);
      assert.strictEqual(adminAfter.data.unreadCount, 0);
      await db.Notification.destroy({ where: { recipientId: adminUser.id } });
      console.log(`  ✔ [PASS] Admin (#${adminUser.id}) successfully receives and processes WITHDRAWAL_REQUESTED notification`);
    } else {
      console.log('  ℹ No R1 Admin user found in DB, skipping Admin notification test');
    }

    // 10. Clean up test records
    await db.Notification.destroy({ where: { recipientId: [user1Id, user2Id] } });
    console.log('  ✔ [PASS] Cleaned up temporary test records');

    console.log('====================================================');
    console.log('🎉 ALL NOTIFICATION SYSTEM VERIFICATION CHECKS PASSED!');
    console.log('====================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Notification verification failed:', err);
    process.exit(1);
  }
}

runNotificationVerification();
