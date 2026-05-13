// SRS Section 4.2 – Bảng Schedule
module.exports = (sequelize, DataTypes) => {
  const Schedule = sequelize.define('Schedule', {
    id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    doctorId:      { type: DataTypes.INTEGER, allowNull: false },
    date:          { type: DataTypes.STRING(20), allowNull: false },
    timeType:      { type: DataTypes.STRING(10), allowNull: false },
    maxNumber:     { type: DataTypes.INTEGER, defaultValue: 10 },
    currentNumber: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, {
    // ═══════════════════════════════════════════════════════════════════════
    // [Phase 11 — Guard #44] Composite Unique Constraint
    // Đảm bảo mỗi bác sĩ chỉ có DUY NHẤT 1 slot cho mỗi (date, timeType)
    // Chống duplicate schedule khi concurrent request tạo lịch
    // ═══════════════════════════════════════════════════════════════════════
    indexes: [
      {
        unique: true,
        fields: ['doctorId', 'date', 'timeType'],
        name: 'idx_schedule_doctor_date_timeType',
      },
    ],
  });
  return Schedule;
};
