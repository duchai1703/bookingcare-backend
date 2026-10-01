'use strict';

module.exports = (sequelize, DataTypes) => {
  const Conversation = sequelize.define('Conversation', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    bookingId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: {
        model: 'Bookings',
        key: 'id',
      },
    },
    patientId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
      },
    },
    doctorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
      },
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'OPEN', // 'OPEN' | 'CLOSED'
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'Conversations',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['bookingId'],
        name: 'idx_conversations_bookingId_unique',
      },
      {
        fields: ['patientId'],
        name: 'idx_conversations_patientId',
      },
      {
        fields: ['doctorId'],
        name: 'idx_conversations_doctorId',
      },
      {
        fields: ['status'],
        name: 'idx_conversations_status',
      },
      {
        fields: ['lastMessageAt'],
        name: 'idx_conversations_lastMessageAt',
      },
    ],
  });

  return Conversation;
};
