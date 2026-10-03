'use strict';

/**
 * [Phase 07 — Controlled User Memory] Model
 * Stores allowlisted, non-sensitive patient preferences with explicit lifecycle and ownership.
 * Never stores diagnoses, symptoms as facts, medications, credentials, or PII.
 */
module.exports = (sequelize, DataTypes) => {
  const AIMemory = sequelize.define('AIMemory', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
      },
    },
    conversationId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    memoryType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'PREFERENCE', // 'PREFERENCE' | 'INTERACTION_STYLE' | 'ACCESSIBILITY'
    },
    key: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    source: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'USER_STATED', // 'USER_STATED' | 'USER_CONFIRMED' | 'INFERRED_SAFE'
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'ACTIVE', // 'ACTIVE' | 'SUPERSEDED' | 'EXPIRED' | 'DELETED'
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 1.0,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'AIMemories',
    timestamps: true,
    indexes: [
      {
        fields: ['userId', 'status'],
        name: 'idx_ai_memories_user_status',
      },
      {
        fields: ['userId', 'key'],
        name: 'idx_ai_memories_user_key',
      },
    ],
  });

  return AIMemory;
};
