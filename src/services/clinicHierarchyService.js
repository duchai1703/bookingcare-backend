const db = require('../models');
const { Op } = require('sequelize');

/**
 * Service Quản trị Phân cấp Y tế theo Ngữ cảnh (Contextual Management Hierarchy)
 * Cấp độ: Cơ sở y tế (Clinic) -> Chuyên khoa tại Cơ sở (Clinic_Specialty) -> Bác sĩ phân bổ (Doctor_Assignment)
 */

// 1. Lấy danh sách Chuyên khoa tại một Cơ sở y tế
const getClinicSpecialties = async (clinicId) => {
  try {
    if (!clinicId) {
      return { errCode: 1, message: 'Thiếu mã cơ sở y tế (clinicId)' };
    }

    const clinic = await db.Clinic.findByPk(clinicId, {
      attributes: ['id', 'name', 'address', 'phone', 'email', 'status', 'commissionRate'],
    });
    if (!clinic) {
      return { errCode: 2, message: 'Không tìm thấy cơ sở y tế' };
    }

    // Lấy các chuyên khoa đã được triển khai tại cơ sở
    const clinicSpecialties = await db.Clinic_Specialty.findAll({
      where: { clinicId },
      include: [
        {
          model: db.Specialty,
          as: 'specialtyData',
          attributes: ['id', 'name', 'image'],
        },
        {
          model: db.User,
          as: 'headDoctorData',
          attributes: ['id', 'firstName', 'lastName', 'image', 'positionId'],
          include: [
            { model: db.Allcode, as: 'positionData', attributes: ['valueVi', 'valueEn'] },
          ],
        },
        {
          model: db.Doctor_Assignment,
          as: 'assignments',
          attributes: ['id', 'doctorId', 'workingStatus', 'roomNumber'],
        },
      ],
      order: [['createdAt', 'ASC']],
    });

    // Định dạng danh sách chuyên khoa tại cơ sở
    const formattedSpecialties = clinicSpecialties.map((cs) => {
      const activeDoctors = (cs.assignments || []).filter((a) => a.workingStatus === 'active');
      const headDoctor = cs.headDoctorData ? {
        id: cs.headDoctorData.id,
        name: `${cs.headDoctorData.positionData?.valueVi || 'Bác sĩ'} ${cs.headDoctorData.lastName} ${cs.headDoctorData.firstName}`,
        avatar: cs.headDoctorData.image ? Buffer.from(cs.headDoctorData.image).toString('binary') : null,
      } : null;

      let specialtyAvatar = null;
      if (cs.specialtyData?.image) {
        specialtyAvatar = Buffer.from(cs.specialtyData.image).toString('binary');
      }

      return {
        id: cs.id,
        clinicId: cs.clinicId,
        specialtyId: cs.specialtyId,
        specialtyName: cs.specialtyData?.name || `Chuyên khoa #${cs.specialtyId}`,
        specialtyAvatar,
        status: cs.status,
        description: cs.description,
        targetCapacity: cs.targetCapacity,
        totalDoctors: (cs.assignments || []).length,
        activeDoctorsCount: activeDoctors.length,
        headDoctor,
        createdAt: cs.createdAt,
      };
    });

    // Lấy danh mục tất cả chuyên khoa toàn sàn để Admin có thể chọn thêm vào cơ sở
    const allSpecialties = await db.Specialty.findAll({
      where: { status: 'active' },
      attributes: ['id', 'name'],
      order: [['name', 'ASC']],
    });

    const assignedSpecialtyIds = new Set(clinicSpecialties.map((cs) => cs.specialtyId));
    const availableSpecialties = allSpecialties.filter((s) => !assignedSpecialtyIds.has(s.id));

    return {
      errCode: 0,
      message: 'OK',
      data: {
        clinic,
        specialties: formattedSpecialties,
        availableSpecialties,
        totalSpecialtiesCount: formattedSpecialties.length,
        activeSpecialtiesCount: formattedSpecialties.filter((s) => s.status === 'active').length,
      },
    };
  } catch (error) {
    console.error('Error in getClinicSpecialties:', error);
    return { errCode: -1, message: error.message };
  }
};

// 2. Gán Chuyên khoa vào Cơ sở y tế
const assignSpecialtyToClinic = async ({ clinicId, specialtyId, headDoctorId, status, description, targetCapacity }) => {
  try {
    if (!clinicId || !specialtyId) {
      return { errCode: 1, message: 'Thiếu clinicId hoặc specialtyId' };
    }

    const clinic = await db.Clinic.findByPk(clinicId);
    if (!clinic) return { errCode: 2, message: 'Cơ sở y tế không tồn tại' };

    const specialty = await db.Specialty.findByPk(specialtyId);
    if (!specialty) return { errCode: 3, message: 'Chuyên khoa không tồn tại' };

    // Kiểm tra xem đã gán chưa
    const existing = await db.Clinic_Specialty.findOne({
      where: { clinicId, specialtyId },
    });

    if (existing) {
      if (existing.status === 'paused') {
        // Tái kích hoạt
        await existing.update({
          status: status || 'active',
          headDoctorId: headDoctorId || existing.headDoctorId,
          description: description !== undefined ? description : existing.description,
          targetCapacity: targetCapacity || existing.targetCapacity,
        });
        return {
          errCode: 0,
          message: 'Tái kích hoạt chuyên khoa tại cơ sở thành công',
          data: existing,
        };
      }
      return {
        errCode: 4,
        message: 'Chuyên khoa này đã được triển khai tại cơ sở y tế',
      };
    }

    const newClinicSpecialty = await db.Clinic_Specialty.create({
      clinicId,
      specialtyId,
      status: status || 'active',
      headDoctorId: headDoctorId || null,
      description: description || `Chuyên khoa ${specialty.name} trực thuộc ${clinic.name}`,
      targetCapacity: targetCapacity || 50,
    });

    return {
      errCode: 0,
      message: 'Gán chuyên khoa vào cơ sở y tế thành công',
      data: newClinicSpecialty,
    };
  } catch (error) {
    console.error('Error in assignSpecialtyToClinic:', error);
    return { errCode: -1, message: error.message };
  }
};

// 3. Gỡ Chuyên khoa khỏi Cơ sở y tế (kèm Guard Checks an toàn)
const unassignSpecialtyFromClinic = async ({ clinicId, specialtyId }) => {
  try {
    if (!clinicId || !specialtyId) {
      return { errCode: 1, message: 'Thiếu clinicId hoặc specialtyId' };
    }

    const record = await db.Clinic_Specialty.findOne({
      where: { clinicId, specialtyId },
    });
    if (!record) {
      return { errCode: 2, message: 'Chuyên khoa không tồn tại tại cơ sở này' };
    }

    // 🛡️ GUARD CHECK 1: Kiểm tra xem có bác sĩ nào đang hoạt động (active) không
    const activeAssignments = await db.Doctor_Assignment.findAll({
      where: {
        clinicId,
        specialtyId,
        workingStatus: 'active',
      },
      include: [
        { model: db.User, as: 'doctorData', attributes: ['firstName', 'lastName'] },
      ],
    });

    if (activeAssignments.length > 0) {
      const docNames = activeAssignments.slice(0, 3).map((a) => `${a.doctorData?.lastName} ${a.doctorData?.firstName}`).join(', ');
      return {
        errCode: 3,
        message: `Không thể gỡ chuyên khoa: Vẫn còn ${activeAssignments.length} bác sĩ đang hoạt động (${docNames}...). Vui lòng rút hoặc điều chuyển bác sĩ trước.`,
      };
    }

    // 🛡️ GUARD CHECK 2: Kiểm tra xem có lịch khám sắp tới nào đang chờ khám không
    const assignedDoctorIds = (await db.Doctor_Assignment.findAll({
      where: { clinicId, specialtyId },
      attributes: ['doctorId'],
    })).map((a) => a.doctorId);

    if (assignedDoctorIds.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const pendingBookings = await db.Booking.count({
        where: {
          doctorId: { [Op.in]: assignedDoctorIds },
          statusId: { [Op.in]: ['S1', 'S2'] },
          date: { [Op.gte]: today },
        },
      });

      if (pendingBookings > 0) {
        return {
          errCode: 4,
          message: `Không thể gỡ chuyên khoa: Còn ${pendingBookings} ca khám đang chờ thực hiện trong tương lai. Vui lòng xử lý ca khám trước.`,
        };
      }
    }

    // An toàn: Xóa hoặc chuyển trạng thái sang 'paused'
    await record.destroy();

    return {
      errCode: 0,
      message: 'Gỡ chuyên khoa khỏi cơ sở y tế thành công',
    };
  } catch (error) {
    console.error('Error in unassignSpecialtyFromClinic:', error);
    return { errCode: -1, message: error.message };
  }
};

// 4. Chi tiết Chuyên khoa tại Cơ sở y tế (Contextual Workspace: Clinic -> Specialty)
const getClinicSpecialtyWorkspace = async (clinicId, specialtyId) => {
  try {
    if (!clinicId || !specialtyId) {
      return { errCode: 1, message: 'Thiếu clinicId hoặc specialtyId' };
    }

    const clinic = await db.Clinic.findByPk(clinicId, {
      attributes: ['id', 'name', 'address', 'phone', 'email', 'status', 'commissionRate'],
    });
    if (!clinic) return { errCode: 2, message: 'Không tìm thấy cơ sở y tế' };

    const specialty = await db.Specialty.findByPk(specialtyId, {
      attributes: ['id', 'name', 'descriptionMarkdown', 'descriptionHTML', 'image', 'status'],
    });
    if (!specialty) return { errCode: 3, message: 'Không tìm thấy chuyên khoa' };

    let clinicSpecialty = await db.Clinic_Specialty.findOne({
      where: { clinicId, specialtyId },
      include: [
        {
          model: db.User,
          as: 'headDoctorData',
          attributes: ['id', 'firstName', 'lastName', 'image', 'positionId'],
          include: [{ model: db.Allcode, as: 'positionData', attributes: ['valueVi', 'valueEn'] }],
        },
      ],
    });

    // Nếu chưa có record Clinic_Specialty thì tự động tạo
    if (!clinicSpecialty) {
      clinicSpecialty = await db.Clinic_Specialty.create({
        clinicId,
        specialtyId,
        status: 'active',
        description: `Chuyên khoa ${specialty.name} trực thuộc ${clinic.name}`,
        targetCapacity: 50,
      });
    }

    // Lấy danh sách bác sĩ được phân bổ vào khoa tại cơ sở này
    const assignments = await db.Doctor_Assignment.findAll({
      where: { clinicId, specialtyId },
      include: [
        {
          model: db.User,
          as: 'doctorData',
          attributes: ['id', 'email', 'firstName', 'lastName', 'phoneNumber', 'image', 'positionId'],
          include: [{ model: db.Allcode, as: 'positionData', attributes: ['valueVi', 'valueEn'] }],
        },
        {
          model: db.Allcode,
          as: 'priceTypeData',
          attributes: ['keyMap', 'valueVi', 'valueEn'],
        },
      ],
      order: [['isPrimary', 'DESC'], ['createdAt', 'ASC']],
    });

    // Tính toán KPIs cho từng bác sĩ trong khoa
    const doctorIds = assignments.map((a) => a.doctorId);
    const bookings = doctorIds.length > 0 ? await db.Booking.findAll({
      where: {
        doctorId: { [Op.in]: doctorIds },
        statusId: 'S3', // Đã khám xong
      },
      attributes: ['doctorId', 'bookingPrice'],
    }) : [];

    const schedules = doctorIds.length > 0 ? await db.Schedule.findAll({
      where: {
        doctorId: { [Op.in]: doctorIds },
      },
      attributes: ['doctorId', 'date', 'currentNumber', 'maxNumber'],
    }) : [];

    const formattedAssignments = assignments.map((a) => {
      const doc = a.doctorData;
      let avatar = null;
      if (doc?.image) {
        avatar = Buffer.from(doc.image).toString('binary');
      }

      const docBookings = bookings.filter((b) => b.doctorId === a.doctorId);
      const totalRevenue = docBookings.reduce((sum, b) => sum + (b.bookingPrice || 300000), 0);
      const docSchedules = schedules.filter((s) => s.doctorId === a.doctorId);

      return {
        id: a.id,
        doctorId: a.doctorId,
        doctorName: doc ? `${doc.positionData?.valueVi || 'Bác sĩ'} ${doc.lastName} ${doc.firstName}` : `Bác sĩ #${a.doctorId}`,
        email: doc?.email || '',
        phoneNumber: doc?.phoneNumber || '',
        avatar,
        roomNumber: a.roomNumber || 'Chưa xếp phòng',
        priceId: a.priceId,
        priceText: a.priceTypeData?.valueVi || '300.000 VNĐ',
        commissionRate: parseFloat(a.commissionRate || 15.0),
        workingStatus: a.workingStatus,
        isPrimary: a.isPrimary,
        totalCompletedBookings: docBookings.length,
        totalRevenue,
        totalSchedules: docSchedules.length,
        startDate: a.startDate,
        note: a.note,
      };
    });

    // Lấy danh sách bác sĩ toàn sàn chưa được phân bổ vào khoa này để modal có thể chọn nhanh
    const assignedDoctorIdsSet = new Set(doctorIds);
    const allDoctors = await db.User.findAll({
      where: { roleId: 'R2' },
      attributes: ['id', 'firstName', 'lastName', 'email', 'positionId'],
      include: [
        { model: db.Allcode, as: 'positionData', attributes: ['valueVi', 'valueEn'] },
        { model: db.Doctor_Info, as: 'doctorInfoData', attributes: ['specialtyId', 'clinicId'] },
      ],
      order: [['firstName', 'ASC']],
    });

    const availableDoctors = allDoctors
      .filter((d) => !assignedDoctorIdsSet.has(d.id))
      .map((d) => ({
        id: d.id,
        name: `${d.positionData?.valueVi || 'Bác sĩ'} ${d.lastName} ${d.firstName} (${d.email})`,
        email: d.email,
        isOriginalSpecialist: d.doctorInfoData?.specialtyId === specialtyId,
      }));

    // KPIs tổng hợp của Khoa tại Cơ sở này
    const totalDoctors = formattedAssignments.length;
    const activeDoctors = formattedAssignments.filter((a) => a.workingStatus === 'active').length;
    const totalDeptRevenue = formattedAssignments.reduce((sum, a) => sum + a.totalRevenue, 0);
    const totalDeptCompleted = formattedAssignments.reduce((sum, a) => sum + a.totalCompletedBookings, 0);

    return {
      errCode: 0,
      message: 'OK',
      data: {
        clinic,
        specialty: {
          id: specialty.id,
          name: specialty.name,
          status: specialty.status,
          avatar: specialty.image ? Buffer.from(specialty.image).toString('binary') : null,
          descriptionMarkdown: specialty.descriptionMarkdown,
        },
        clinicSpecialty: {
          id: clinicSpecialty.id,
          status: clinicSpecialty.status,
          description: clinicSpecialty.description,
          targetCapacity: clinicSpecialty.targetCapacity,
          headDoctorId: clinicSpecialty.headDoctorId,
          headDoctorName: clinicSpecialty.headDoctorData ? `${clinicSpecialty.headDoctorData.positionData?.valueVi || 'Bác sĩ'} ${clinicSpecialty.headDoctorData.lastName} ${clinicSpecialty.headDoctorData.firstName}` : null,
        },
        assignments: formattedAssignments,
        availableDoctors,
        kpis: {
          totalDoctors,
          activeDoctors,
          totalDeptCompleted,
          totalDeptRevenue,
          targetCapacity: clinicSpecialty.targetCapacity || 50,
        },
      },
    };
  } catch (error) {
    console.error('Error in getClinicSpecialtyWorkspace:', error);
    return { errCode: -1, message: error.message };
  }
};

// 5. Phân bổ Bác sĩ vào Chuyên khoa tại Cơ sở y tế
const assignDoctorToClinicSpecialty = async ({
  clinicId,
  specialtyId,
  doctorId,
  roomNumber,
  priceId,
  commissionRate,
  workingStatus,
  isPrimary,
  note,
}) => {
  try {
    if (!clinicId || !specialtyId || !doctorId) {
      return { errCode: 1, message: 'Thiếu clinicId, specialtyId hoặc doctorId' };
    }

    const doctor = await db.User.findByPk(doctorId);
    if (!doctor || doctor.roleId !== 'R2') {
      return { errCode: 2, message: 'Bác sĩ không tồn tại hoặc không hợp lệ' };
    }

    // Đảm bảo Clinic_Specialty tồn tại
    let [cs] = await db.Clinic_Specialty.findOrCreate({
      where: { clinicId, specialtyId },
      defaults: {
        clinicId,
        specialtyId,
        status: 'active',
        description: 'Chuyên khoa triển khai tại cơ sở y tế',
      },
    });

    // Kiểm tra xem đã phân bổ chưa
    const existing = await db.Doctor_Assignment.findOne({
      where: { doctorId, clinicId, specialtyId },
    });

    if (existing) {
      // Cập nhật lại thông tin làm việc
      await existing.update({
        clinicSpecialtyId: cs.id,
        roomNumber: roomNumber !== undefined ? roomNumber : existing.roomNumber,
        priceId: priceId || existing.priceId,
        commissionRate: commissionRate !== undefined ? commissionRate : existing.commissionRate,
        workingStatus: workingStatus || 'active',
        isPrimary: isPrimary !== undefined ? isPrimary : existing.isPrimary,
        note: note !== undefined ? note : existing.note,
      });

      // Nếu là isPrimary -> đồng bộ sang Doctor_Info
      if (isPrimary) {
        await db.Doctor_Info.update(
          {
            clinicId,
            specialtyId,
            priceId: priceId || existing.priceId,
            commissionRate: commissionRate !== undefined ? commissionRate : existing.commissionRate,
            workingStatus: workingStatus || 'active',
          },
          { where: { doctorId } }
        );
      }

      return {
        errCode: 0,
        message: 'Cập nhật phân bổ bác sĩ vào chuyên khoa thành công',
        data: existing,
      };
    }

    // Nếu đánh dấu isPrimary: bỏ isPrimary của các phân bổ khác của bác sĩ này
    if (isPrimary) {
      await db.Doctor_Assignment.update(
        { isPrimary: false },
        { where: { doctorId } }
      );
    }

    const newAssignment = await db.Doctor_Assignment.create({
      doctorId,
      clinicId,
      specialtyId,
      clinicSpecialtyId: cs.id,
      roomNumber: roomNumber || 'Phòng khám đa khoa',
      priceId: priceId || 'PRI1',
      commissionRate: commissionRate !== undefined ? commissionRate : 15.0,
      workingStatus: workingStatus || 'active',
      isPrimary: isPrimary !== undefined ? isPrimary : false,
      startDate: new Date(),
      note: note || '',
    });

    // ✅ Tương thích ngược: Đồng bộ ngay lập tức sang Doctor_Info nếu là nơi làm việc chính
    if (isPrimary) {
      await db.Doctor_Info.update(
        {
          clinicId,
          specialtyId,
          priceId: priceId || 'PRI1',
          commissionRate: commissionRate !== undefined ? commissionRate : 15.0,
          workingStatus: workingStatus || 'active',
        },
        { where: { doctorId } }
      );
    }

    return {
      errCode: 0,
      message: 'Phân bổ bác sĩ vào chuyên khoa thành công',
      data: newAssignment,
    };
  } catch (error) {
    console.error('Error in assignDoctorToClinicSpecialty:', error);
    return { errCode: -1, message: error.message };
  }
};

// 6. Cập nhật Phân bổ Bác sĩ (Phòng khám, giá, hoa hồng, trạng thái)
const updateDoctorAssignment = async (assignmentId, updateData) => {
  try {
    if (!assignmentId) {
      return { errCode: 1, message: 'Thiếu mã phân bổ (assignmentId)' };
    }

    const assignment = await db.Doctor_Assignment.findByPk(assignmentId);
    if (!assignment) {
      return { errCode: 2, message: 'Không tìm thấy bản ghi phân bổ bác sĩ' };
    }

    const { roomNumber, priceId, commissionRate, workingStatus, isPrimary, note } = updateData;

    if (isPrimary) {
      await db.Doctor_Assignment.update(
        { isPrimary: false },
        { where: { doctorId: assignment.doctorId } }
      );
    }

    await assignment.update({
      roomNumber: roomNumber !== undefined ? roomNumber : assignment.roomNumber,
      priceId: priceId || assignment.priceId,
      commissionRate: commissionRate !== undefined ? commissionRate : assignment.commissionRate,
      workingStatus: workingStatus || assignment.workingStatus,
      isPrimary: isPrimary !== undefined ? isPrimary : assignment.isPrimary,
      note: note !== undefined ? note : assignment.note,
    });

    // Đồng bộ sang Doctor_Info nếu isPrimary
    if (isPrimary) {
      await db.Doctor_Info.update(
        {
          clinicId: assignment.clinicId,
          specialtyId: assignment.specialtyId,
          priceId: assignment.priceId,
          commissionRate: assignment.commissionRate,
          workingStatus: assignment.workingStatus,
        },
        { where: { doctorId: assignment.doctorId } }
      );
    }

    return {
      errCode: 0,
      message: 'Cập nhật phân bổ thành công',
      data: assignment,
    };
  } catch (error) {
    console.error('Error in updateDoctorAssignment:', error);
    return { errCode: -1, message: error.message };
  }
};

// 7. Rút Bác sĩ khỏi Chuyên khoa tại Cơ sở y tế (kèm Guard Check lịch khám tương lai)
const unassignDoctorFromClinicSpecialty = async (assignmentId) => {
  try {
    if (!assignmentId) {
      return { errCode: 1, message: 'Thiếu mã phân bổ (assignmentId)' };
    }

    const assignment = await db.Doctor_Assignment.findByPk(assignmentId, {
      include: [
        { model: db.User, as: 'doctorData', attributes: ['firstName', 'lastName'] },
        { model: db.Clinic, as: 'clinicData', attributes: ['name'] },
      ],
    });
    if (!assignment) {
      return { errCode: 2, message: 'Bản ghi phân bổ không tồn tại' };
    }

    // 🛡️ GUARD CHECK: Kiểm tra xem bác sĩ có ca khám nào sắp tới không
    const today = new Date().toISOString().split('T')[0];
    const pendingBookings = await db.Booking.count({
      where: {
        doctorId: assignment.doctorId,
        statusId: { [Op.in]: ['S1', 'S2'] },
        date: { [Op.gte]: today },
      },
    });

    if (pendingBookings > 0) {
      return {
        errCode: 3,
        message: `Không thể rút bác sĩ: Bác sĩ ${assignment.doctorData?.lastName} ${assignment.doctorData?.firstName} hiện còn ${pendingBookings} ca khám đang chờ thực hiện tại ${assignment.clinicData?.name}. Vui lòng hủy hoặc điều chuyển ca khám trước khi rút phân bổ.`,
      };
    }

    await assignment.destroy();

    return {
      errCode: 0,
      message: 'Rút bác sĩ khỏi chuyên khoa cơ sở y tế thành công',
    };
  } catch (error) {
    console.error('Error in unassignDoctorFromClinicSpecialty:', error);
    return { errCode: -1, message: error.message };
  }
};

// 8. Lấy toàn bộ danh sách Cơ sở & Chuyên khoa mà một Bác sĩ đang công tác
const getDoctorAssignments = async (doctorId) => {
  try {
    if (!doctorId) {
      return { errCode: 1, message: 'Thiếu mã bác sĩ (doctorId)' };
    }

    const assignments = await db.Doctor_Assignment.findAll({
      where: { doctorId },
      include: [
        {
          model: db.Clinic,
          as: 'clinicData',
          attributes: ['id', 'name', 'address', 'status', 'commissionRate'],
        },
        {
          model: db.Specialty,
          as: 'specialtyData',
          attributes: ['id', 'name', 'image'],
        },
        {
          model: db.Allcode,
          as: 'priceTypeData',
          attributes: ['keyMap', 'valueVi', 'valueEn'],
        },
      ],
      order: [['isPrimary', 'DESC'], ['createdAt', 'ASC']],
    });

    const formatted = assignments.map((a) => {
      let specialtyAvatar = null;
      if (a.specialtyData?.image) {
        specialtyAvatar = Buffer.from(a.specialtyData.image).toString('binary');
      }

      return {
        id: a.id,
        clinicId: a.clinicId,
        clinicName: a.clinicData?.name || `Cơ sở #${a.clinicId}`,
        clinicAddress: a.clinicData?.address || '',
        clinicStatus: a.clinicData?.status || 'active',
        specialtyId: a.specialtyId,
        specialtyName: a.specialtyData?.name || `Chuyên khoa #${a.specialtyId}`,
        specialtyAvatar,
        roomNumber: a.roomNumber || '',
        priceId: a.priceId,
        priceText: a.priceTypeData?.valueVi || '300.000 VNĐ',
        commissionRate: parseFloat(a.commissionRate || 15.0),
        workingStatus: a.workingStatus,
        isPrimary: a.isPrimary,
        startDate: a.startDate,
        note: a.note,
      };
    });

    return {
      errCode: 0,
      message: 'OK',
      data: formatted,
    };
  } catch (error) {
    console.error('Error in getDoctorAssignments:', error);
    return { errCode: -1, message: error.message };
  }
};

module.exports = {
  getClinicSpecialties,
  assignSpecialtyToClinic,
  unassignSpecialtyFromClinic,
  getClinicSpecialtyWorkspace,
  assignDoctorToClinicSpecialty,
  updateDoctorAssignment,
  unassignDoctorFromClinicSpecialty,
  getDoctorAssignments,
};
