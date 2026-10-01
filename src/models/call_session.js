'use strict';

module.exports = (sequelize, DataTypes) => {
  const CallSession = sequelize.define('CallSession', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    callId: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    bookingId: { type: DataTypes.INTEGER, allowNull: false },
    conversationId: { type: DataTypes.INTEGER, allowNull: true },
    callerId: { type: DataTypes.INTEGER, allowNull: false },
    receiverId: { type: DataTypes.INTEGER, allowNull: false },
    callType: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'VIDEO',
      validate: { isIn: [['AUDIO', 'VIDEO']] },
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'RINGING',
      validate: {
        isIn: [['RINGING', 'CONNECTING', 'CONNECTED', 'REJECTED', 'MISSED', 'CANCELLED', 'ENDED', 'FAILED', 'EXPIRED']]
      }
    },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    endedAt: { type: DataTypes.DATE, allowNull: true },
    duration: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    endReason: { type: DataTypes.STRING(50), allowNull: true },
    metadata: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'CallSessions',
    timestamps: true,
    indexes: [
      { fields: ['callId'], name: 'idx_call_sessions_callId' },
      { fields: ['bookingId'], name: 'idx_call_sessions_bookingId' },
      { fields: ['callerId', 'status'], name: 'idx_call_sessions_caller_status' },
      { fields: ['receiverId', 'status'], name: 'idx_call_sessions_receiver_status' },
      { fields: ['status'], name: 'idx_call_sessions_status' },
    ],
  });

  return CallSession;
};
