'use strict';

module.exports = (sequelize, DataTypes) => {
  const ChatMessage = sequelize.define('ChatMessage', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    conversationId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Conversations',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    senderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
      },
    },
    clientMessageId: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    messageType: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'TEXT',
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'ChatMessages',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['conversationId', 'senderId', 'clientMessageId'],
        name: 'idx_chat_messages_idempotency_unique',
      },
      {
        fields: ['conversationId', 'createdAt'],
        name: 'idx_chat_messages_conversation_created',
      },
      {
        fields: ['conversationId', 'readAt'],
        name: 'idx_chat_messages_conversation_read',
      },
      {
        fields: ['senderId'],
        name: 'idx_chat_messages_senderId',
      },
    ],
  });

  return ChatMessage;
};
