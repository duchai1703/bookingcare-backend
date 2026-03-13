# Chi Tiết Code Backend – Tất Cả Controllers & Services

**Tham chiếu:** [Phase4_Backend_Development_Guide.md](file:///c:/Users/USER/Documents/DOAN1/DOCS/Phase4_Backend_Development_Guide.md) | [SRS_Document.md](file:///c:/Users/USER/Documents/DOAN1/DOCS/SRS_Document.md)

> File này bổ sung code đầy đủ cho từng function (Controller + Service) của tất cả 21 API endpoints.
> Guide chính (Phase4) chứa kiến trúc, models, routes. File này chứa **logic xử lý chi tiết**.

---

## 1. Model Loader – `src/models/index.js`

```javascript
"use strict";

const fs = require("fs");
const path = require("path");
const { Sequelize, DataTypes } = require("sequelize");
require("dotenv").config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: process.env.DB_DIALECT,
    logging: false,
  },
);

const db = {};

// Auto-load tất cả model files trong thư mục models/
fs.readdirSync(__dirname)
  .filter((file) => file !== "index.js" && file.endsWith(".js"))
  .forEach((file) => {
    const model = require(path.join(__dirname, file))(sequelize, DataTypes);
    db[model.name] = model;
  });

// ===== ASSOCIATIONS (SRS Section 4.1 ERD) =====

// User ↔ Doctor_Info (1:1)
db.User.hasOne(db.Doctor_Info, {
  foreignKey: "doctorId",
  as: "doctorInfoData",
});
db.Doctor_Info.belongsTo(db.User, { foreignKey: "doctorId" });

// Doctor_Info ↔ Specialty (N:1)
db.Doctor_Info.belongsTo(db.Specialty, {
  foreignKey: "specialtyId",
  as: "specialtyData",
});

// Doctor_Info ↔ Clinic (N:1)
db.Doctor_Info.belongsTo(db.Clinic, {
  foreignKey: "clinicId",
  as: "clinicData",
});

// User (Doctor) ↔ Schedule (1:N)
db.User.hasMany(db.Schedule, { foreignKey: "doctorId" });
db.Schedule.belongsTo(db.User, { foreignKey: "doctorId" });

// Allcode relationships
db.Allcode.hasMany(db.User, {
  foreignKey: "positionId",
  sourceKey: "keyMap",
  as: "positionData",
});
db.Allcode.hasMany(db.User, {
  foreignKey: "gender",
  sourceKey: "keyMap",
  as: "genderData",
});
db.User.belongsTo(db.Allcode, {
  foreignKey: "positionId",
  targetKey: "keyMap",
  as: "positionData",
});
db.User.belongsTo(db.Allcode, {
  foreignKey: "gender",
  targetKey: "keyMap",
  as: "genderData",
});

db.Doctor_Info.belongsTo(db.Allcode, {
  foreignKey: "priceId",
  targetKey: "keyMap",
  as: "priceData",
});
db.Doctor_Info.belongsTo(db.Allcode, {
  foreignKey: "paymentId",
  targetKey: "keyMap",
  as: "paymentData",
});
db.Doctor_Info.belongsTo(db.Allcode, {
  foreignKey: "provinceId",
  targetKey: "keyMap",
  as: "provinceData",
});

db.Schedule.belongsTo(db.Allcode, {
  foreignKey: "timeType",
  targetKey: "keyMap",
  as: "timeTypeData",
});

// Booking relationships
db.User.hasMany(db.Booking, { foreignKey: "patientId", as: "patientBookings" });
db.Booking.belongsTo(db.User, { foreignKey: "patientId", as: "patientData" });
db.Booking.belongsTo(db.User, {
  foreignKey: "doctorId",
  as: "doctorBookingData",
});
db.Booking.belongsTo(db.Allcode, {
  foreignKey: "timeType",
  targetKey: "keyMap",
  as: "timeTypeBooking",
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
```

---

## 2. Server Entry Point (cập nhật) – `src/server.js`

```javascript
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./models"); // Import model loader
const routes = require("./routes/web");

const app = express();

// CORS (SRS Section 5.4)
app.use(
  cors({
    origin: process.env.URL_REACT,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);

// Body parser
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

// Routes
routes(app);

// Connect DB, sync tables, start server
const PORT = process.env.PORT || 8080;

db.sequelize
  .authenticate()
  .then(() => {
    console.log(">>> Database connected");
    // Tự động tạo bảng nếu chưa có (development only)
    return db.sequelize.sync();
  })
  .then(() => {
    console.log(">>> All tables synced");
    app.listen(PORT, () => {
      console.log(`>>> Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => console.error(">>> DB Error:", err));
```

---

## 3. userController.js – Đầy đủ 6 functions

```javascript
// src/controllers/userController.js
const userService = require("../services/userService");

// ===== POST /api/login (SRS 3.1) =====
const handleLogin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(200).json({
      errCode: 1,
      message: "Thiếu email hoặc mật khẩu!",
    });
  }

  const result = await userService.handleUserLogin(email, password);
  return res.status(200).json(result);
};

// ===== GET /api/get-all-users?id=ALL (SRS 3.2 REQ-AM-001) =====
const handleGetAllUsers = async (req, res) => {
  const id = req.query.id; // 'ALL' hoặc userId cụ thể

  if (!id) {
    return res.status(200).json({
      errCode: 1,
      message: "Thiếu tham số id!",
    });
  }

  const users = await userService.getAllUsers(id);
  return res.status(200).json({
    errCode: 0,
    message: "OK",
    users: users,
  });
};

// ===== POST /api/create-new-user (SRS 3.2 REQ-AM-002) =====
const handleCreateNewUser = async (req, res) => {
  const result = await userService.createNewUser(req.body);
  return res.status(200).json(result);
};

// ===== PUT /api/edit-user (SRS 3.2 REQ-AM-003) =====
const handleEditUser = async (req, res) => {
  const result = await userService.editUser(req.body);
  return res.status(200).json(result);
};

// ===== DELETE /api/delete-user (SRS 3.2 REQ-AM-004) =====
const handleDeleteUser = async (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(200).json({
      errCode: 1,
      message: "Thiếu tham số id!",
    });
  }

  const result = await userService.deleteUser(id);
  return res.status(200).json(result);
};

// ===== GET /api/allcode?type=X (SRS 4.2) =====
const getAllCode = async (req, res) => {
  const result = await userService.getAllCodeService(req.query.type);
  return res.status(200).json(result);
};

module.exports = {
  handleLogin,
  handleGetAllUsers,
  handleCreateNewUser,
  handleEditUser,
  handleDeleteUser,
  getAllCode,
};
```

---

## 4. userService.js – Đầy đủ 6 functions

```javascript
// src/services/userService.js
const db = require("../models");
const bcrypt = require("bcryptjs");
const salt = bcrypt.genSaltSync(10); // SRS REQ-AU-002: salt rounds = 10

// ===== LOGIN (SRS REQ-AU-001, 002, 007, 009) =====
const handleUserLogin = async (email, password) => {
  const user = await db.User.findOne({
    where: { email },
    raw: true,
  });

  if (!user) {
    return { errCode: 1, message: "Email không tồn tại trong hệ thống!" };
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return { errCode: 3, message: "Sai mật khẩu!" };
  }

  // REQ-AU-009: Trả về info cho Redux store
  return {
    errCode: 0,
    message: "OK",
    user: {
      id: user.id,
      email: user.email,
      roleId: user.roleId,
      firstName: user.firstName,
      lastName: user.lastName,
    },
  };
};

// ===== GET ALL USERS (SRS REQ-AM-001) =====
const getAllUsers = async (id) => {
  let users;
  if (id === "ALL") {
    users = await db.User.findAll({
      attributes: { exclude: ["password"] }, // Không trả về password
    });
  } else {
    users = await db.User.findOne({
      where: { id },
      attributes: { exclude: ["password"] },
    });
  }
  return users;
};

// ===== CREATE NEW USER (SRS REQ-AM-002, REQ-AU-002) =====
const createNewUser = async (data) => {
  // Kiểm tra required fields
  if (
    !data.email ||
    !data.password ||
    !data.firstName ||
    !data.lastName ||
    !data.roleId
  ) {
    return { errCode: 1, message: "Thiếu tham số bắt buộc!" };
  }

  // Kiểm tra email trùng
  const existUser = await db.User.findOne({ where: { email: data.email } });
  if (existUser) {
    return { errCode: 2, message: "Email đã tồn tại!" };
  }

  // REQ-AU-002: Mã hóa mật khẩu bcrypt salt=10
  const hashedPassword = bcrypt.hashSync(data.password, salt);

  await db.User.create({
    email: data.email,
    password: hashedPassword,
    firstName: data.firstName,
    lastName: data.lastName,
    address: data.address || "",
    phoneNumber: data.phoneNumber || "",
    gender: data.gender || "",
    roleId: data.roleId,
    image: data.image || "", // base64 string (SRS Constraint #7)
    positionId: data.positionId || "",
  });

  return { errCode: 0, message: "Tạo người dùng thành công!" };
};

// ===== EDIT USER (SRS REQ-AM-003) =====
const editUser = async (data) => {
  if (!data.id) {
    return { errCode: 1, message: "Thiếu tham số id!" };
  }

  const user = await db.User.findOne({ where: { id: data.id }, raw: false });
  if (!user) {
    return { errCode: 3, message: "Không tìm thấy người dùng!" };
  }

  // Cập nhật các trường được phép sửa
  user.firstName = data.firstName;
  user.lastName = data.lastName;
  user.address = data.address;
  user.phoneNumber = data.phoneNumber;
  user.gender = data.gender;
  user.roleId = data.roleId;
  user.positionId = data.positionId;
  if (data.image) {
    user.image = data.image;
  }

  await user.save();
  return { errCode: 0, message: "Cập nhật thành công!" };
};

// ===== DELETE USER (SRS REQ-AM-004) =====
const deleteUser = async (id) => {
  const user = await db.User.findOne({ where: { id } });
  if (!user) {
    return { errCode: 3, message: "Không tìm thấy người dùng!" };
  }

  await db.User.destroy({ where: { id } });
  return { errCode: 0, message: "Xóa người dùng thành công!" };
};

// ===== GET ALLCODE (SRS Section 4.2) =====
const getAllCodeService = async (type) => {
  if (!type) {
    return { errCode: 1, message: "Thiếu tham số type!" };
  }

  const allcodes = await db.Allcode.findAll({ where: { type } });
  return { errCode: 0, message: "OK", data: allcodes };
};

module.exports = {
  handleUserLogin,
  getAllUsers,
  createNewUser,
  editUser,
  deleteUser,
  getAllCodeService,
};
```

---

## 5. doctorController.js – Đầy đủ 6 functions

```javascript
// src/controllers/doctorController.js
const doctorService = require("../services/doctorService");

// ===== GET /api/get-top-doctor-home?limit=10 (SRS 3.7 REQ-PT-003) =====
const getTopDoctorHome = async (req, res) => {
  const limit = req.query.limit || 10;
  const result = await doctorService.getTopDoctorHome(+limit);
  return res.status(200).json(result);
};

// ===== GET /api/get-detail-doctor-by-id?id=X (SRS 3.8) =====
const getDetailDoctorById = async (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(200).json({ errCode: 1, message: "Thiếu tham số id!" });
  }
  const result = await doctorService.getDetailDoctorById(id);
  return res.status(200).json(result);
};

// ===== POST /api/save-info-doctor (SRS 3.3 REQ-AM-006, 007) =====
const saveInfoDoctor = async (req, res) => {
  const result = await doctorService.saveInfoDoctor(req.body);
  return res.status(200).json(result);
};

// ===== POST /api/bulk-create-schedule (SRS 3.6 REQ-AM-018) =====
const bulkCreateSchedule = async (req, res) => {
  const result = await doctorService.bulkCreateSchedule(req.body);
  return res.status(200).json(result);
};

// ===== GET /api/get-schedule-by-date (SRS 3.6, 3.8) =====
const getScheduleByDate = async (req, res) => {
  const { doctorId, date } = req.query;
  if (!doctorId || !date) {
    return res.status(200).json({ errCode: 1, message: "Thiếu tham số!" });
  }
  const result = await doctorService.getScheduleByDate(doctorId, date);
  return res.status(200).json(result);
};

// ===== GET /api/get-list-patient-for-doctor (SRS 3.11 REQ-DR-001) =====
const getListPatientForDoctor = async (req, res) => {
  const { doctorId, date } = req.query;
  if (!doctorId || !date) {
    return res.status(200).json({ errCode: 1, message: "Thiếu tham số!" });
  }
  const result = await doctorService.getListPatientForDoctor(doctorId, date);
  return res.status(200).json(result);
};

// ===== POST /api/send-remedy (SRS 3.13 REQ-DR-008, 009, 010) =====
const sendRemedy = async (req, res) => {
  const result = await doctorService.sendRemedy(req.body);
  return res.status(200).json(result);
};

module.exports = {
  getTopDoctorHome,
  getDetailDoctorById,
  saveInfoDoctor,
  bulkCreateSchedule,
  getScheduleByDate,
  getListPatientForDoctor,
  sendRemedy,
};
```

---

## 6. doctorService.js – Đầy đủ 7 functions

```javascript
// src/services/doctorService.js
const db = require("../models");
const emailService = require("./emailService");

// ===== GET TOP DOCTOR (SRS REQ-PT-003) =====
const getTopDoctorHome = async (limit) => {
  const doctors = await db.User.findAll({
    limit: limit,
    where: { roleId: "R2" }, // Chỉ lấy role Doctor
    order: [["createdAt", "DESC"]],
    attributes: { exclude: ["password"] },
    include: [
      {
        model: db.Allcode,
        as: "positionData",
        attributes: ["valueVi", "valueEn"],
      },
      {
        model: db.Allcode,
        as: "genderData",
        attributes: ["valueVi", "valueEn"],
      },
    ],
    raw: true,
    nest: true,
  });

  return { errCode: 0, data: doctors };
};

// ===== GET DETAIL DOCTOR (SRS 3.8, REQ-PT-007 → 011) =====
const getDetailDoctorById = async (id) => {
  const doctor = await db.User.findOne({
    where: { id },
    attributes: { exclude: ["password"] },
    include: [
      {
        model: db.Allcode,
        as: "positionData",
        attributes: ["valueVi", "valueEn"],
      },
      {
        model: db.Doctor_Info,
        as: "doctorInfoData",
        include: [
          {
            model: db.Allcode,
            as: "priceData",
            attributes: ["valueVi", "valueEn"],
          },
          {
            model: db.Allcode,
            as: "paymentData",
            attributes: ["valueVi", "valueEn"],
          },
          {
            model: db.Allcode,
            as: "provinceData",
            attributes: ["valueVi", "valueEn"],
          },
          { model: db.Specialty, as: "specialtyData", attributes: ["name"] },
          {
            model: db.Clinic,
            as: "clinicData",
            attributes: ["name", "address"],
          },
        ],
      },
    ],
    raw: false,
    nest: true,
  });

  if (!doctor) {
    return { errCode: 3, message: "Không tìm thấy bác sĩ!" };
  }

  // Chuyển image BLOB sang base64 string
  if (doctor.image) {
    doctor.image = Buffer.from(doctor.image, "base64").toString("binary");
  }

  return { errCode: 0, data: doctor };
};

// ===== SAVE DOCTOR INFO (SRS REQ-AM-006, 007) =====
const saveInfoDoctor = async (data) => {
  if (!data.doctorId || !data.contentHTML || !data.contentMarkdown) {
    return { errCode: 1, message: "Thiếu tham số bắt buộc!" };
  }

  // REQ-AM-022: Kiểm tra user có role Doctor (R2)
  const user = await db.User.findOne({ where: { id: data.doctorId } });
  if (!user || user.roleId !== "R2") {
    return { errCode: 3, message: "User không phải bác sĩ!" };
  }

  // Kiểm tra đã có Doctor_Info chưa → update hoặc create
  const doctorInfo = await db.Doctor_Info.findOne({
    where: { doctorId: data.doctorId },
    raw: false,
  });

  if (doctorInfo) {
    // Update existing (SRS REQ-AM-007: lưu đồng thời cả 2 format)
    doctorInfo.contentHTML = data.contentHTML;
    doctorInfo.contentMarkdown = data.contentMarkdown;
    doctorInfo.description = data.description || "";
    doctorInfo.specialtyId = data.specialtyId;
    doctorInfo.clinicId = data.clinicId;
    doctorInfo.priceId = data.priceId;
    doctorInfo.provinceId = data.provinceId;
    doctorInfo.paymentId = data.paymentId;
    doctorInfo.note = data.note || "";
    await doctorInfo.save();
  } else {
    // Create new
    await db.Doctor_Info.create({
      doctorId: data.doctorId,
      contentHTML: data.contentHTML,
      contentMarkdown: data.contentMarkdown,
      description: data.description || "",
      specialtyId: data.specialtyId,
      clinicId: data.clinicId,
      priceId: data.priceId,
      provinceId: data.provinceId,
      paymentId: data.paymentId,
      note: data.note || "",
    });
  }

  return { errCode: 0, message: "Lưu thông tin bác sĩ thành công!" };
};

// ===== BULK CREATE SCHEDULE (SRS REQ-AM-018, 019) =====
const bulkCreateSchedule = async (data) => {
  if (
    !data.arrSchedule ||
    !Array.isArray(data.arrSchedule) ||
    data.arrSchedule.length === 0
  ) {
    return { errCode: 1, message: "Thiếu dữ liệu lịch khám!" };
  }

  // Thêm maxNumber, currentNumber mặc định (SRS REQ-AM-023)
  const schedules = data.arrSchedule.map((item) => ({
    ...item,
    maxNumber: 10,
    currentNumber: 0,
  }));

  // Lấy schedules đã tồn tại (tránh trùng)
  const existing = await db.Schedule.findAll({
    where: { doctorId: schedules[0].doctorId, date: schedules[0].date },
    attributes: ["timeType", "doctorId", "date"],
    raw: true,
  });

  // Lọc ra chỉ tạo khung giờ chưa có
  const toCreate = schedules.filter(
    (s) => !existing.find((e) => e.timeType === s.timeType),
  );

  if (toCreate.length > 0) {
    await db.Schedule.bulkCreate(toCreate);
  }

  return {
    errCode: 0,
    message: `Tạo ${toCreate.length} lịch khám thành công!`,
  };
};

// ===== GET SCHEDULE BY DATE (SRS 3.8 REQ-PT-009) =====
const getScheduleByDate = async (doctorId, date) => {
  const schedules = await db.Schedule.findAll({
    where: { doctorId, date },
    include: [
      {
        model: db.Allcode,
        as: "timeTypeData",
        attributes: ["valueVi", "valueEn"],
      },
    ],
    raw: false,
    nest: true,
  });

  // REQ-AM-023: Lọc khung giờ còn chỗ (currentNumber < maxNumber)
  const available = schedules.filter((s) => s.currentNumber < s.maxNumber);

  return { errCode: 0, data: available };
};

// ===== GET LIST PATIENT FOR DOCTOR (SRS 3.11 REQ-DR-001, 002, 003) =====
const getListPatientForDoctor = async (doctorId, date) => {
  const patients = await db.Booking.findAll({
    where: { doctorId, date, statusId: "S2" }, // Chỉ lấy lịch hẹn đã xác nhận
    include: [
      {
        model: db.User,
        as: "patientData",
        attributes: [
          "email",
          "firstName",
          "lastName",
          "address",
          "gender",
          "phoneNumber",
        ],
        include: [
          {
            model: db.Allcode,
            as: "genderData",
            attributes: ["valueVi", "valueEn"],
          },
        ],
      },
      {
        model: db.Allcode,
        as: "timeTypeBooking",
        attributes: ["valueVi", "valueEn"],
      },
    ],
    raw: false,
    nest: true,
  });

  return { errCode: 0, data: patients };
};

// ===== SEND REMEDY (SRS 3.13 REQ-DR-008, 009, 010) =====
const sendRemedy = async (data) => {
  if (!data.email || !data.doctorId || !data.patientId || !data.imageBase64) {
    return { errCode: 1, message: "Thiếu tham số bắt buộc!" };
  }

  // Gửi email với file đính kèm
  await emailService.sendEmailRemedy({
    email: data.email,
    imageBase64: data.imageBase64,
    doctorName: data.doctorName || "Bác sĩ",
    language: data.language || "vi",
  });

  return { errCode: 0, message: "Gửi kết quả khám thành công!" };
};

module.exports = {
  getTopDoctorHome,
  getDetailDoctorById,
  saveInfoDoctor,
  bulkCreateSchedule,
  getScheduleByDate,
  getListPatientForDoctor,
  sendRemedy,
};
```

---

## 7. patientController.js – 2 functions

```javascript
// src/controllers/patientController.js
const patientService = require("../services/patientService");

// ===== POST /api/patient-book-appointment (SRS 3.9) =====
const postBookAppointment = async (req, res) => {
  const result = await patientService.postBookAppointment(req.body);
  return res.status(200).json(result);
};

// ===== POST /api/verify-book-appointment (SRS 3.10) =====
const postVerifyBookAppointment = async (req, res) => {
  const result = await patientService.postVerifyBookAppointment(req.body);
  return res.status(200).json(result);
};

module.exports = {
  postBookAppointment,
  postVerifyBookAppointment,
};
```

---

## 8. patientService.js – 2 functions (CORE: đặt lịch + xác thực)

```javascript
// src/services/patientService.js
const db = require("../models");
const emailService = require("./emailService");
const { v4: uuidv4 } = require("uuid"); // npm install uuid

// ===== BOOK APPOINTMENT (SRS 3.9, REQ-PT-012 → 023) =====
const postBookAppointment = async (data) => {
  // REQ-PT-014: Validate dữ liệu
  if (
    !data.email ||
    !data.fullName ||
    !data.doctorId ||
    !data.date ||
    !data.timeType ||
    !data.phoneNumber
  ) {
    return { errCode: 1, message: "Thiếu tham số bắt buộc!" };
  }

  // Tạo token duy nhất cho email xác thực (SRS REQ-PT-019)
  const token = uuidv4();

  // Tìm hoặc tạo user bệnh nhân (role R3)
  const [patient, created] = await db.User.findOrCreate({
    where: { email: data.email },
    defaults: {
      email: data.email,
      password: "patient_default", // Bệnh nhân không cần đăng nhập
      firstName: data.fullName,
      lastName: "",
      roleId: "R3",
      gender: data.gender || "",
      address: data.address || "",
      phoneNumber: data.phoneNumber || "",
    },
  });

  // REQ-PT-022: Kiểm tra đặt lịch trùng
  const existBooking = await db.Booking.findOne({
    where: {
      doctorId: data.doctorId,
      patientId: patient.id,
      date: data.date,
      timeType: data.timeType,
    },
  });

  if (existBooking) {
    return { errCode: 2, message: "Bạn đã đặt lịch này rồi!" };
  }

  // REQ-PT-015: Lưu booking vào database (statusId = 'S1' theo State Machine)
  await db.Booking.create({
    statusId: "S1", // S1 = Mới (SRS State Machine)
    doctorId: data.doctorId,
    patientId: patient.id,
    date: data.date,
    timeType: data.timeType,
    token: token,
    reason: data.reason || "",
    patientName: data.fullName,
    patientPhoneNumber: data.phoneNumber,
    patientAddress: data.address || "",
    patientGender: data.gender || "",
    patientBirthday: data.birthday || "",
  });

  // Cập nhật currentNumber của Schedule (SRS REQ-AM-023)
  await db.Schedule.increment("currentNumber", {
    by: 1,
    where: {
      doctorId: data.doctorId,
      date: data.date,
      timeType: data.timeType,
    },
  });

  // REQ-PT-016, 017: Gửi email xác thực
  const redirectLink = `${process.env.URL_REACT}/verify-booking?token=${token}&doctorId=${data.doctorId}`;

  await emailService.sendEmailBooking({
    email: data.email,
    patientName: data.fullName,
    doctorName: data.doctorName || "Bác sĩ",
    time: data.timeString || "",
    date: data.dateString || "",
    redirectLink: redirectLink,
    language: data.language || "vi",
  });

  return {
    errCode: 0,
    message: "Đặt lịch thành công! Vui lòng kiểm tra email.",
  };
};

// ===== VERIFY BOOKING (SRS 3.10, REQ-PT-019, 020) =====
const postVerifyBookAppointment = async (data) => {
  if (!data.token || !data.doctorId) {
    return { errCode: 1, message: "Thiếu tham số!" };
  }

  // Tìm booking theo token
  const booking = await db.Booking.findOne({
    where: {
      token: data.token,
      doctorId: data.doctorId,
      statusId: "S1", // Chỉ xác nhận booking ở trạng thái S1 (Mới)
    },
    raw: false,
  });

  if (!booking) {
    return {
      errCode: 3,
      message: "Lịch hẹn không tồn tại hoặc đã được xác nhận!",
    };
  }

  // SRS State Machine: S1 → S2 (Đã xác nhận)
  booking.statusId = "S2";
  await booking.save();

  return { errCode: 0, message: "Xác nhận lịch hẹn thành công!" };
};

module.exports = {
  postBookAppointment,
  postVerifyBookAppointment,
};
```

---

## 9. specialtyController.js + specialtyService.js

```javascript
// ========== src/controllers/specialtyController.js ==========
const specialtyService = require("../services/specialtyService");

// POST /api/create-new-specialty (SRS 3.5 REQ-AM-015)
const createSpecialty = async (req, res) => {
  const result = await specialtyService.createSpecialty(req.body);
  return res.status(200).json(result);
};

// GET /api/get-all-specialty (SRS 3.5)
const getAllSpecialty = async (req, res) => {
  const result = await specialtyService.getAllSpecialty();
  return res.status(200).json(result);
};

// GET /api/get-detail-specialty-by-id?id=X&location=ALL (SRS 3.5, 3.7 REQ-PT-006)
const getDetailSpecialtyById = async (req, res) => {
  const result = await specialtyService.getDetailSpecialtyById(
    req.query.id,
    req.query.location,
  );
  return res.status(200).json(result);
};

module.exports = { createSpecialty, getAllSpecialty, getDetailSpecialtyById };
```

```javascript
// ========== src/services/specialtyService.js ==========
const db = require("../models");

// REQ-AM-015: Tạo chuyên khoa mới
const createSpecialty = async (data) => {
  if (!data.name) {
    return { errCode: 1, message: "Thiếu tên chuyên khoa!" };
  }

  await db.Specialty.create({
    name: data.name,
    image: data.imageBase64 || "",
    descriptionHTML: data.descriptionHTML || "",
    descriptionMarkdown: data.descriptionMarkdown || "",
  });

  return { errCode: 0, message: "Tạo chuyên khoa thành công!" };
};

// Lấy tất cả chuyên khoa
const getAllSpecialty = async () => {
  const specialties = await db.Specialty.findAll();
  return { errCode: 0, data: specialties };
};

// Lấy chi tiết chuyên khoa + danh sách bác sĩ (REQ-PT-006)
const getDetailSpecialtyById = async (id, location) => {
  if (!id) {
    return { errCode: 1, message: "Thiếu tham số id!" };
  }

  const specialty = await db.Specialty.findOne({ where: { id } });

  if (!specialty) {
    return { errCode: 3, message: "Không tìm thấy chuyên khoa!" };
  }

  // Lấy danh sách bác sĩ theo chuyên khoa
  let whereClause = { specialtyId: id };
  if (location && location !== "ALL") {
    whereClause.provinceId = location;
  }

  const doctorInfos = await db.Doctor_Info.findAll({
    where: whereClause,
    attributes: ["doctorId", "provinceId"],
  });

  return {
    errCode: 0,
    data: {
      specialty: specialty,
      doctorList: doctorInfos.map((d) => d.doctorId),
    },
  };
};

module.exports = { createSpecialty, getAllSpecialty, getDetailSpecialtyById };
```

---

## 10. clinicController.js + clinicService.js

```javascript
// ========== src/controllers/clinicController.js ==========
const clinicService = require("../services/clinicService");

// POST /api/create-new-clinic (SRS 3.4 REQ-AM-011)
const createClinic = async (req, res) => {
  const result = await clinicService.createClinic(req.body);
  return res.status(200).json(result);
};

// GET /api/get-all-clinic (SRS 3.4 REQ-AM-014)
const getAllClinic = async (req, res) => {
  const result = await clinicService.getAllClinic();
  return res.status(200).json(result);
};

// GET /api/get-detail-clinic-by-id?id=X (SRS 3.4)
const getDetailClinicById = async (req, res) => {
  const result = await clinicService.getDetailClinicById(req.query.id);
  return res.status(200).json(result);
};

module.exports = { createClinic, getAllClinic, getDetailClinicById };
```

```javascript
// ========== src/services/clinicService.js ==========
const db = require("../models");

// REQ-AM-011: Tạo phòng khám mới
const createClinic = async (data) => {
  if (!data.name || !data.address) {
    return { errCode: 1, message: "Thiếu tên hoặc địa chỉ phòng khám!" };
  }

  await db.Clinic.create({
    name: data.name,
    address: data.address,
    image: data.imageBase64 || "",
    descriptionHTML: data.descriptionHTML || "",
    descriptionMarkdown: data.descriptionMarkdown || "",
  });

  return { errCode: 0, message: "Tạo phòng khám thành công!" };
};

// REQ-AM-014: Lấy tất cả phòng khám
const getAllClinic = async () => {
  const clinics = await db.Clinic.findAll();
  return { errCode: 0, data: clinics };
};

// Lấy chi tiết phòng khám + danh sách bác sĩ
const getDetailClinicById = async (id) => {
  if (!id) {
    return { errCode: 1, message: "Thiếu tham số id!" };
  }

  const clinic = await db.Clinic.findOne({ where: { id } });
  if (!clinic) {
    return { errCode: 3, message: "Không tìm thấy phòng khám!" };
  }

  const doctorInfos = await db.Doctor_Info.findAll({
    where: { clinicId: id },
    attributes: ["doctorId"],
  });

  return {
    errCode: 0,
    data: {
      clinic: clinic,
      doctorList: doctorInfos.map((d) => d.doctorId),
    },
  };
};

module.exports = { createClinic, getAllClinic, getDetailClinicById };
```

---

## 11. emailService.js (hoàn chỉnh)

```javascript
// src/services/emailService.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_APP_USERNAME,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

// ===== Email xác thực lịch hẹn (SRS REQ-PT-016, 017, 018) =====
const sendEmailBooking = async (data) => {
  const htmlContent =
    data.language === "vi"
      ? `<h3>Xin chào ${data.patientName},</h3>
       <p>Bạn đã đặt lịch khám bệnh trực tuyến thành công.</p>
       <p><b>Bác sĩ:</b> ${data.doctorName}</p>
       <p><b>Thời gian:</b> ${data.time}</p>
       <p><b>Ngày:</b> ${data.date}</p>
       <p>Nếu thông tin trên là chính xác, vui lòng click vào link bên dưới để xác nhận:</p>
       <div><a href="${data.redirectLink}" target="_blank">Xác nhận lịch hẹn</a></div>
       <p>Xin chân thành cảm ơn!</p>`
      : `<h3>Dear ${data.patientName},</h3>
       <p>You have successfully booked a medical appointment online.</p>
       <p><b>Doctor:</b> ${data.doctorName}</p>
       <p><b>Time:</b> ${data.time}</p>
       <p><b>Date:</b> ${data.date}</p>
       <p>Please click the link below to confirm your appointment:</p>
       <div><a href="${data.redirectLink}" target="_blank">Confirm appointment</a></div>
       <p>Thank you!</p>`;

  await transporter.sendMail({
    from: '"BookingCare" <noreply@bookingcare.vn>',
    to: data.email,
    subject:
      data.language === "vi"
        ? "Xác nhận lịch hẹn khám bệnh"
        : "Medical Appointment Confirmation",
    html: htmlContent,
  });
};

// ===== Email kết quả khám (SRS REQ-DR-008, 009, 010) =====
const sendEmailRemedy = async (data) => {
  const htmlContent =
    data.language === "vi"
      ? `<h3>Xin chào,</h3>
       <p>Bạn nhận được kết quả khám bệnh từ bác sĩ <b>${data.doctorName}</b>.</p>
       <p>Thông tin kết quả khám được gửi trong file đính kèm.</p>
       <p>Xin chân thành cảm ơn!</p>`
      : `<h3>Dear Patient,</h3>
       <p>You have received medical results from Dr. <b>${data.doctorName}</b>.</p>
       <p>Please find the results in the attached file.</p>
       <p>Thank you!</p>`;

  await transporter.sendMail({
    from: '"BookingCare" <noreply@bookingcare.vn>',
    to: data.email,
    subject:
      data.language === "vi"
        ? "Kết quả khám bệnh"
        : "Medical Examination Results",
    html: htmlContent,
    attachments: [
      {
        filename: `ket-qua-kham-${Date.now()}.png`,
        content: data.imageBase64.split("base64,")[1],
        encoding: "base64",
      },
    ],
  });
};

module.exports = { sendEmailBooking, sendEmailRemedy };
```

---

## 12. Seed Data Runner – `src/seeders/seedAllcode.js`

```javascript
// src/seeders/seedAllcode.js
// Chạy: node src/seeders/seedAllcode.js

require("dotenv").config();
const db = require("../models");

const allcodeData = [
  { type: "ROLE", keyMap: "R1", valueVi: "Quản trị viên", valueEn: "Admin" },
  { type: "ROLE", keyMap: "R2", valueVi: "Bác sĩ", valueEn: "Doctor" },
  { type: "ROLE", keyMap: "R3", valueVi: "Bệnh nhân", valueEn: "Patient" },
  { type: "GENDER", keyMap: "G1", valueVi: "Nam", valueEn: "Male" },
  { type: "GENDER", keyMap: "G2", valueVi: "Nữ", valueEn: "Female" },
  { type: "GENDER", keyMap: "G3", valueVi: "Khác", valueEn: "Other" },
  {
    type: "TIME",
    keyMap: "T1",
    valueVi: "8:00 - 9:00",
    valueEn: "8:00 AM - 9:00 AM",
  },
  {
    type: "TIME",
    keyMap: "T2",
    valueVi: "9:00 - 10:00",
    valueEn: "9:00 AM - 10:00 AM",
  },
  {
    type: "TIME",
    keyMap: "T3",
    valueVi: "10:00 - 11:00",
    valueEn: "10:00 AM - 11:00 AM",
  },
  {
    type: "TIME",
    keyMap: "T4",
    valueVi: "11:00 - 12:00",
    valueEn: "11:00 AM - 12:00 PM",
  },
  {
    type: "TIME",
    keyMap: "T5",
    valueVi: "13:00 - 14:00",
    valueEn: "1:00 PM - 2:00 PM",
  },
  {
    type: "TIME",
    keyMap: "T6",
    valueVi: "14:00 - 15:00",
    valueEn: "2:00 PM - 3:00 PM",
  },
  {
    type: "TIME",
    keyMap: "T7",
    valueVi: "15:00 - 16:00",
    valueEn: "3:00 PM - 4:00 PM",
  },
  {
    type: "TIME",
    keyMap: "T8",
    valueVi: "16:00 - 17:00",
    valueEn: "4:00 PM - 5:00 PM",
  },
  {
    type: "STATUS",
    keyMap: "S1",
    valueVi: "Lịch hẹn mới",
    valueEn: "New appointment",
  },
  {
    type: "STATUS",
    keyMap: "S2",
    valueVi: "Đã xác nhận",
    valueEn: "Confirmed",
  },
  { type: "STATUS", keyMap: "S3", valueVi: "Đã khám xong", valueEn: "Done" },
  { type: "STATUS", keyMap: "S4", valueVi: "Đã hủy", valueEn: "Cancelled" },
  { type: "POSITION", keyMap: "P1", valueVi: "Bác sĩ", valueEn: "Doctor" },
  { type: "POSITION", keyMap: "P2", valueVi: "Thạc sĩ", valueEn: "Master" },
  { type: "POSITION", keyMap: "P3", valueVi: "Tiến sĩ", valueEn: "PhD" },
  {
    type: "POSITION",
    keyMap: "P4",
    valueVi: "Phó giáo sư",
    valueEn: "Associate Professor",
  },
  { type: "POSITION", keyMap: "P5", valueVi: "Giáo sư", valueEn: "Professor" },
  {
    type: "PRICE",
    keyMap: "PRI1",
    valueVi: "100.000đ",
    valueEn: "100,000 VND",
  },
  {
    type: "PRICE",
    keyMap: "PRI2",
    valueVi: "200.000đ",
    valueEn: "200,000 VND",
  },
  {
    type: "PRICE",
    keyMap: "PRI3",
    valueVi: "300.000đ",
    valueEn: "300,000 VND",
  },
  {
    type: "PRICE",
    keyMap: "PRI4",
    valueVi: "500.000đ",
    valueEn: "500,000 VND",
  },
  { type: "PAYMENT", keyMap: "PAY1", valueVi: "Tiền mặt", valueEn: "Cash" },
  {
    type: "PAYMENT",
    keyMap: "PAY2",
    valueVi: "Chuyển khoản",
    valueEn: "Bank transfer",
  },
  { type: "PROVINCE", keyMap: "PRO1", valueVi: "Hà Nội", valueEn: "Hanoi" },
  {
    type: "PROVINCE",
    keyMap: "PRO2",
    valueVi: "TP. Hồ Chí Minh",
    valueEn: "Ho Chi Minh City",
  },
  { type: "PROVINCE", keyMap: "PRO3", valueVi: "Đà Nẵng", valueEn: "Da Nang" },
];

// Seed Admin account mặc định
const adminData = {
  email: "admin@bookingcare.vn",
  password: "$2a$10$eMjBREW.3xRkJYF0TaaqiepLle8dMbFBNmTqpJ.ZzGKBJ1GKz1tXG", // "123456" hashed
  firstName: "Admin",
  lastName: "BookingCare",
  roleId: "R1",
  gender: "G1",
  address: "TP. Hồ Chí Minh",
  phoneNumber: "0123456789",
};

const seed = async () => {
  try {
    await db.sequelize.authenticate();
    await db.sequelize.sync({ force: true }); // ⚠️ Xóa & tạo lại bảng
    console.log(">>> Tables created");

    await db.Allcode.bulkCreate(allcodeData);
    console.log(`>>> Seeded ${allcodeData.length} allcode records`);

    await db.User.create(adminData);
    console.log(">>> Seeded admin account (admin@bookingcare.vn / 123456)");

    console.log(">>> SEED COMPLETE!");
    process.exit(0);
  } catch (err) {
    console.error(">>> Seed error:", err);
    process.exit(1);
  }
};

seed();
```

**Chạy seed:**

```bash
node src/seeders/seedAllcode.js
```

---

## 13. Dependency bổ sung

```bash
# Cần thêm uuid cho tạo token xác thực email
npm install uuid
```

---

## Tổng kết: Mapping File → SRS API

| File                            | Functions | SRS APIs covered                                                                                                               |
| ------------------------------- | :-------: | ------------------------------------------------------------------------------------------------------------------------------ |
| `userController + Service`      |     6     | login, get-all-users, create-new-user, edit-user, delete-user, allcode                                                         |
| `doctorController + Service`    |     7     | get-top-doctor, get-detail-doctor, save-info-doctor, bulk-create-schedule, get-schedule-by-date, get-list-patient, send-remedy |
| `patientController + Service`   |     2     | patient-book-appointment, verify-book-appointment                                                                              |
| `specialtyController + Service` |     3     | create-new-specialty, get-all-specialty, get-detail-specialty-by-id                                                            |
| `clinicController + Service`    |     3     | create-new-clinic, get-all-clinic, get-detail-clinic-by-id                                                                     |
| **Tổng**                        |  **21**   | **21/21 APIs (100%)**                                                                                                          |
