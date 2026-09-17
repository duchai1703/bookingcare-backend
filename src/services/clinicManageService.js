// src/services/clinicManageService.js
// Enterprise Clinic Operations & Healthcare Facility Management Service
const { Op } = require('sequelize');
const db = require('../models');
const moment = require('moment');
const { convertBlobToBase64 } = require('../utils/convertBlobToBase64');

const formatDataUri = (rawImage) => {
  if (!rawImage) return '';
  const b64 = convertBlobToBase64(rawImage);
  if (!b64) return '';
  return b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
};

/**
 * 1. Lấy danh sách Cơ sở / Phòng khám phục vụ Master page
 */
const getAdminClinicsList = async ({
  page = 1,
  limit = 15,
  search = '',
  status = 'all',
}) => {
  try {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 15);
    const offset = (pageNum - 1) * limitNum;

    const whereClause = {};
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      whereClause[Op.or] = [
        { name: { [Op.iLike]: q } },
        { address: { [Op.iLike]: q } },
      ];
    }
    if (status && status !== 'all') {
      whereClause.status = status;
    }

    const { count, rows: clinics } = await db.Clinic.findAndCountAll({
      where: whereClause,
      order: [['id', 'ASC']],
      limit: limitNum,
      offset,
      attributes: ['id', 'name', 'address', 'image', 'status', 'commissionRate', 'phone', 'email', 'createdAt'],
    });

    // Lấy danh sách bác sĩ theo Clinic
    const doctorInfos = await db.Doctor_Info.findAll({
      attributes: ['doctorId', 'clinicId', 'specialtyId', 'workingStatus', 'commissionRate'],
      include: [
        {
          model: db.User,
          as: 'doctorData',
          attributes: ['id', 'firstName', 'lastName', 'image', 'email', 'phoneNumber'],
          include: [{ model: db.Allcode, as: 'positionData', attributes: ['valueVi', 'valueEn'] }],
        },
        {
          model: db.Specialty,
          as: 'specialtyData',
          attributes: ['id', 'name'],
        },
      ],
    });

    const clinicDoctorMap = new Map();
    doctorInfos.forEach((info) => {
      if (!info.clinicId) return;
      if (!clinicDoctorMap.has(info.clinicId)) clinicDoctorMap.set(info.clinicId, []);
      clinicDoctorMap.get(info.clinicId).push(info);
    });

    // Thống kê Doanh thu & Bookings theo bác sĩ
    const revRows = await db.sequelize.query(
      `SELECT 
         "doctorId",
         COUNT(*)::INT AS "totalBookings",
         COUNT(CASE WHEN "statusId" = 'S3' THEN 1 END)::INT AS "completedBookings",
         COALESCE(SUM(CASE WHEN "statusId" = 'S3' OR "paymentStatus" = 'paid' THEN "bookingPrice" ELSE 0 END), 0)::FLOAT AS "grossRevenue"
       FROM "Bookings"
       GROUP BY "doctorId"`,
      { type: db.sequelize.QueryTypes.SELECT }
    );
    const doctorRevenueMap = new Map();
    revRows.forEach((r) => doctorRevenueMap.set(r.doctorId, r));

    // Thống kê Lịch khám 7 ngày tới theo bác sĩ
    const nowTs = moment().startOf('day').valueOf();
    const next7dTs = moment().add(7, 'days').endOf('day').valueOf();
    const schedRows = await db.sequelize.query(
      `SELECT 
         "doctorId",
         COUNT(*)::INT AS "totalSlots",
         COALESCE(SUM("currentNumber"), 0)::INT AS "occupiedSlots",
         COALESCE(SUM("maxNumber"), 0)::INT AS "capacitySlots"
       FROM "Schedules"
       WHERE CAST(date AS BIGINT) >= :from AND CAST(date AS BIGINT) <= :to
       GROUP BY "doctorId"`,
      { replacements: { from: String(nowTs), to: String(next7dTs) }, type: db.sequelize.QueryTypes.SELECT }
    );
    const doctorScheduleMap = new Map();
    schedRows.forEach((s) => doctorScheduleMap.set(s.doctorId, s));

    // Enriched clinics
    const enrichedClinics = clinics.map((c) => {
      const docs = clinicDoctorMap.get(c.id) || [];
      const totalDoctors = docs.length;
      const activeDoctors = docs.filter((d) => d.workingStatus === 'active').length;

      const specSet = new Set();
      docs.forEach((d) => {
        if (d.specialtyData?.name) specSet.add(d.specialtyData.name);
      });
      const specialties = Array.from(specSet);

      let weeklySlots = 0;
      let occupiedSlots = 0;
      let completedBookings = 0;
      let grossRevenue = 0;

      docs.forEach((d) => {
        const sch = doctorScheduleMap.get(d.doctorId) || { totalSlots: 0, occupiedSlots: 0, capacitySlots: 0 };
        weeklySlots += sch.capacitySlots;
        occupiedSlots += sch.occupiedSlots;

        const rev = doctorRevenueMap.get(d.doctorId) || { completedBookings: 0, grossRevenue: 0 };
        completedBookings += rev.completedBookings;
        grossRevenue += rev.grossRevenue;
      });

      const utilizationRate = weeklySlots > 0 ? Math.min(100, Math.round((occupiedSlots / weeklySlots) * 100)) : 0;

      let healthStatus = 'optimal';
      if (c.status === 'paused' || c.status === 'maintenance') {
        healthStatus = 'paused';
      } else if (totalDoctors < 2) {
        healthStatus = 'understaffed';
      } else if (weeklySlots < 10) {
        healthStatus = 'low_capacity';
      } else if (utilizationRate >= 75) {
        healthStatus = 'high_load';
      }

      const doctorAvatars = docs.slice(0, 4).map((d) => ({
        id: d.doctorId,
        name: `${d.doctorData?.lastName || ''} ${d.doctorData?.firstName || ''}`.trim(),
        avatar: formatDataUri(d.doctorData?.image),
      }));

      return {
        id: c.id,
        name: c.name,
        address: c.address,
        phone: c.phone || '1900 636 888',
        email: c.email || `clinic${c.id}@bookingcare.vn`,
        status: c.status || 'active',
        commissionRate: parseFloat(c.commissionRate || 15),
        image: formatDataUri(c.image),
        totalDoctors,
        activeDoctors,
        specialties,
        doctorAvatars,
        weeklySlots,
        occupiedSlots,
        utilizationRate,
        completedBookings,
        grossRevenue,
        healthStatus,
      };
    });

    // Summary KPIs
    const allClinicsDb = await db.Clinic.findAll({ attributes: ['id', 'status', 'commissionRate'] });
    const totalClinics = allClinicsDb.length;
    const activeClinics = allClinicsDb.filter((c) => c.status !== 'paused' && c.status !== 'maintenance').length;
    const pausedClinics = totalClinics - activeClinics;

    let totalGrossRevenue = 0;
    let understaffedCount = 0;
    let lowCapacityCount = 0;
    let totalSlotsSum = 0;
    let totalOccupiedSum = 0;

    enrichedClinics.forEach((c) => {
      totalGrossRevenue += c.grossRevenue;
      totalSlotsSum += c.weeklySlots;
      totalOccupiedSum += c.occupiedSlots;
      if (c.healthStatus === 'understaffed') understaffedCount++;
      if (c.healthStatus === 'low_capacity') lowCapacityCount++;
    });

    const avgUtilizationRate = totalSlotsSum > 0 ? Math.round((totalOccupiedSum / totalSlotsSum) * 100) : 0;

    return {
      errCode: 0,
      data: {
        clinics: enrichedClinics,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalCount: count,
          totalPages: Math.ceil(count / limitNum) || 1,
        },
        summaryKpis: {
          totalClinics,
          activeClinics,
          pausedClinics,
          totalAssignedDoctors: doctorInfos.length,
          avgUtilizationRate,
          totalGrossRevenue,
        },
        actionAlerts: {
          understaffedCount,
          lowCapacityCount,
        },
      },
    };
  } catch (error) {
    console.error('getAdminClinicsList Error:', error);
    return { errCode: 1, errMessage: error.message };
  }
};

/**
 * 2. Lấy chi tiết Clinic Control Center Workspace
 */
const getAdminClinicControlCenter = async (clinicId) => {
  try {
    const id = parseInt(clinicId, 10);
    if (!id) return { errCode: 1, errMessage: 'Mã cơ sở y tế không hợp lệ' };

    const clinic = await db.Clinic.findByPk(id);
    if (!clinic) return { errCode: 2, errMessage: 'Không tìm thấy cơ sở y tế' };

    const doctorInfos = await db.Doctor_Info.findAll({
      where: { clinicId: id },
      include: [
        {
          model: db.User,
          as: 'doctorData',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'image'],
          include: [{ model: db.Allcode, as: 'positionData', attributes: ['valueVi', 'valueEn'] }],
        },
        {
          model: db.Specialty,
          as: 'specialtyData',
          attributes: ['id', 'name'],
        },
      ],
    });

    const doctorIds = doctorInfos.map((d) => d.doctorId);

    // Schedules
    const nowTs = moment().startOf('day').valueOf();
    const next7dTs = moment().add(7, 'days').endOf('day').valueOf();

    const schedules = doctorIds.length > 0
      ? await db.Schedule.findAll({
          where: {
            doctorId: { [Op.in]: doctorIds },
            date: { [Op.between]: [String(nowTs), String(next7dTs)] },
          },
          include: [
            { model: db.Allcode, as: 'timeTypeData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
            { model: db.User, as: 'doctorData', attributes: ['id', 'firstName', 'lastName'] },
          ],
          order: [['date', 'ASC']],
        })
      : [];

    // Bookings
    const bookings = doctorIds.length > 0
      ? await db.Booking.findAll({
          where: { doctorId: { [Op.in]: doctorIds } },
          include: [
            { model: db.User, as: 'patientData', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'gender', 'address'] },
            { model: db.User, as: 'doctorBookingData', attributes: ['id', 'firstName', 'lastName'] },
            { model: db.Allcode, as: 'statusData', attributes: ['keyMap', 'valueVi', 'valueEn'] },
            { model: db.Allcode, as: 'timeTypeBooking', attributes: ['keyMap', 'valueVi', 'valueEn'] },
          ],
          order: [['createdAt', 'DESC']],
          limit: 50,
        })
      : [];

    let weeklySlots = 0;
    let occupiedSlots = 0;
    schedules.forEach((s) => {
      weeklySlots += (s.maxNumber || 10);
      occupiedSlots += (s.currentNumber || 0);
    });

    const completedBookings = bookings.filter((b) => b.statusId === 'S3').length;
    const cancelledBookings = bookings.filter((b) => b.statusId === 'S4').length;
    let grossRevenue = 0;
    bookings.filter((b) => b.statusId === 'S3').forEach((b) => {
      grossRevenue += parseFloat(b.bookingPrice || 300000);
    });

    const utilizationRate = weeklySlots > 0 ? Math.round((occupiedSlots / weeklySlots) * 100) : 0;

    const doctorList = doctorInfos.map((d) => {
      const dSchedules = schedules.filter((s) => s.doctorId === d.doctorId);
      const dBookings = bookings.filter((b) => b.doctorId === d.doctorId);
      const dCompleted = dBookings.filter((b) => b.statusId === 'S3').length;

      let dWeeklySlots = 0;
      let dOccupiedSlots = 0;
      dSchedules.forEach((s) => {
        dWeeklySlots += (s.maxNumber || 10);
        dOccupiedSlots += (s.currentNumber || 0);
      });

      return {
        doctorId: d.doctorId,
        doctorName: `${d.doctorData?.lastName || ''} ${d.doctorData?.firstName || ''}`.trim(),
        positionVi: d.doctorData?.positionData?.valueVi || 'Bác sĩ',
        email: d.doctorData?.email || '',
        phone: d.doctorData?.phoneNumber || '',
        avatar: formatDataUri(d.doctorData?.image),
        specialtyId: d.specialtyId,
        specialtyName: d.specialtyData?.name || 'Đa khoa',
        workingStatus: d.workingStatus || 'active',
        commissionRate: parseFloat(d.commissionRate || 15),
        weeklySlots: dWeeklySlots,
        occupiedSlots: dOccupiedSlots,
        completedBookings: dCompleted,
      };
    });

    const specialtyMap = {};
    doctorList.forEach((d) => {
      if (!specialtyMap[d.specialtyId]) {
        specialtyMap[d.specialtyId] = {
          id: d.specialtyId,
          name: d.specialtyName,
          doctorCount: 0,
          totalBookings: 0,
        };
      }
      specialtyMap[d.specialtyId].doctorCount += 1;
      specialtyMap[d.specialtyId].totalBookings += d.completedBookings;
    });

    // 7 days trend
    const dailyStats = [];
    const now = Date.now();
    for (let i = 6; i >= 0; i--) {
      const targetDay = new Date(now - i * 86400000);
      const dateStr = targetDay.toISOString().slice(0, 10);
      const countB = bookings.filter((b) => {
        const bDate = new Date(b.createdAt).toISOString().slice(0, 10);
        return bDate === dateStr;
      }).length;
      dailyStats.push({
        date: dateStr,
        bookingsCount: countB,
        estimatedRevenue: countB * 350000,
      });
    }

    return {
      errCode: 0,
      data: {
        profile: {
          id: clinic.id,
          name: clinic.name,
          address: clinic.address,
          phone: clinic.phone || '1900 636 888',
          email: clinic.email || `contact@clinic${clinic.id}.vn`,
          status: clinic.status || 'active',
          commissionRate: parseFloat(clinic.commissionRate || 15),
          image: formatDataUri(clinic.image),
          photos: clinic.photos ? (typeof clinic.photos === 'string' ? (() => { try { return JSON.parse(clinic.photos); } catch { return []; } })() : clinic.photos) : [],
          descriptionHTML: clinic.descriptionHTML || '',
          descriptionMarkdown: clinic.descriptionMarkdown || '',
        },
        kpis: {
          totalDoctors: doctorList.length,
          activeDoctors: doctorList.filter((d) => d.workingStatus === 'active').length,
          specialtiesCount: Object.keys(specialtyMap).length,
          weeklySlots,
          occupiedSlots,
          utilizationRate,
          totalBookings: bookings.length,
          completedBookings,
          cancelledBookings,
          grossRevenue,
          avgRating: 4.8,
        },
        doctors: doctorList,
        specialties: Object.values(specialtyMap),
        weeklySchedule: schedules.slice(0, 40).map((s) => ({
          id: s.id,
          doctorId: s.doctorId,
          doctorName: `${s.doctorData?.lastName || ''} ${s.doctorData?.firstName || ''}`.trim(),
          date: s.date,
          timeType: s.timeType,
          timeVi: s.timeTypeData?.valueVi || s.timeType,
          currentNumber: s.currentNumber || 0,
          maxNumber: s.maxNumber || 10,
        })),
        recentBookings: bookings.slice(0, 20).map((b) => ({
          id: b.id,
          patientName: `${b.patientData?.lastName || ''} ${b.patientData?.firstName || ''}`.trim() || 'Bệnh nhân',
          patientPhone: b.patientData?.phoneNumber || 'Chưa cập nhật',
          doctorName: `${b.doctorBookingData?.lastName || ''} ${b.doctorBookingData?.firstName || ''}`.trim(),
          timeVi: b.timeTypeBooking?.valueVi || 'Giờ khám',
          date: b.date,
          statusId: b.statusId,
          statusVi: b.statusData?.valueVi || b.statusId,
          createdAt: b.createdAt,
        })),
        performance: dailyStats,
      },
    };
  } catch (error) {
    console.error('getAdminClinicControlCenter Error:', error);
    return { errCode: 1, errMessage: error.message };
  }
};

/**
 * 3. Cập nhật trạng thái hoạt động của cơ sở
 */
const updateClinicWorkingStatus = async (clinicId, { status }) => {
  try {
    const id = parseInt(clinicId, 10);
    if (!id) return { errCode: 1, errMessage: 'Mã cơ sở không hợp lệ' };
    if (!['active', 'paused', 'maintenance'].includes(status)) {
      return { errCode: 2, errMessage: 'Trạng thái không hợp lệ' };
    }

    const clinic = await db.Clinic.findByPk(id);
    if (!clinic) return { errCode: 3, errMessage: 'Không tìm thấy cơ sở' };

    await clinic.update({ status });
    return { errCode: 0, message: 'Cập nhật trạng thái cơ sở thành công' };
  } catch (error) {
    console.error('updateClinicWorkingStatus Error:', error);
    return { errCode: 1, errMessage: error.message };
  }
};

/**
 * 4. Cập nhật tỷ lệ hoa hồng chia sẻ cơ sở
 */
const updateClinicCommission = async (clinicId, { commissionRate }) => {
  try {
    const id = parseInt(clinicId, 10);
    if (!id) return { errCode: 1, errMessage: 'Mã cơ sở không hợp lệ' };
    const rate = parseFloat(commissionRate);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      return { errCode: 2, errMessage: 'Tỷ lệ hoa hồng phải từ 0% đến 100%' };
    }

    const clinic = await db.Clinic.findByPk(id);
    if (!clinic) return { errCode: 3, errMessage: 'Không tìm thấy cơ sở' };

    await clinic.update({ commissionRate: rate });
    return { errCode: 0, message: 'Cập nhật tỷ lệ hoa hồng cơ sở thành công' };
  } catch (error) {
    console.error('updateClinicCommission Error:', error);
    return { errCode: 1, errMessage: error.message };
  }
};

/**
 * 5. Gán bác sĩ vào cơ sở y tế
 */
const assignDoctorToClinic = async (clinicId, { doctorId }) => {
  try {
    const cId = parseInt(clinicId, 10);
    const dId = parseInt(doctorId, 10);
    if (!cId || !dId) return { errCode: 1, errMessage: 'Thông tin cơ sở hoặc bác sĩ không hợp lệ' };

    const clinic = await db.Clinic.findByPk(cId);
    if (!clinic) return { errCode: 2, errMessage: 'Không tìm thấy cơ sở y tế' };

    let doctorInfo = await db.Doctor_Info.findOne({ where: { doctorId: dId } });
    if (doctorInfo) {
      await doctorInfo.update({ clinicId: cId });
    } else {
      await db.Doctor_Info.create({
        doctorId: dId,
        clinicId: cId,
        workingStatus: 'active',
        commissionRate: 15,
      });
    }

    return { errCode: 0, message: 'Gán bác sĩ vào cơ sở thành công' };
  } catch (error) {
    console.error('assignDoctorToClinic Error:', error);
    return { errCode: 1, errMessage: error.message };
  }
};

module.exports = {
  getAdminClinicsList,
  getAdminClinicControlCenter,
  updateClinicWorkingStatus,
  updateClinicCommission,
  assignDoctorToClinic,
};
