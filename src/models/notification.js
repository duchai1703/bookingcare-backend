'use strict';

module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define('Notification', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    recipientId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'e.g. BOOKING_CREATED, BOOKING_CONFIRMED, BOOKING_CANCELLED, CONSULTATION_COMPLETED, PAYMENT_SUCCESS, REFUND_SUCCESS, WITHDRAWAL_PROCESSED, MISSED_CALL, NEW_MESSAGE, CONVERSATION_REOPENED',
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    entityType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'BOOKING | PAYMENT | WALLET | CALL | CHAT | SYSTEM',
    },
    entityId: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    data: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'JSON metadata string for deep linking, amounts, or roles',
      get() {
        const rawValue = this.getDataValue('data');
        if (!rawValue) return null;
        try {
          return JSON.parse(rawValue);
        } catch (e) {
          return rawValue;
        }
      },
      set(value) {
        if (value && typeof value === 'object') {
          this.setDataValue('data', JSON.stringify(value));
        } else {
          this.setDataValue('data', value);
        }
      },
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'Notifications',
    timestamps: true,
    indexes: [
      { fields: ['recipientId'], name: 'idx_notifications_recipientId' },
      { fields: ['recipientId', 'isRead'], name: 'idx_notifications_recipient_isRead' },
      { fields: ['recipientId', 'createdAt'], name: 'idx_notifications_recipient_createdAt' },
    ],
  });

  return Notification;
};
