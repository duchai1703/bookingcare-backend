# Hướng Dẫn Chi Tiết – Giai Đoạn 4: Xây Dựng Backend Cơ Bản

**Thời gian:** 06/03/2026 – 20/03/2026 (15 ngày)  
**Kết quả mong đợi:** Server backend cơ bản, API CRUD, database hoạt động  
**Tham chiếu:** [SRS_Document.md](file:///c:/Users/USER/Documents/DOAN1/DOCS/SRS_Document.md) | [Đề cương](file:///c:/Users/USER/Documents/DOAN1/DOCS/Detailed_Project_Proposal_for_Language_Learning_Application.md)

---

## Mục lục

1. [Tổng quan giai đoạn](#1-tổng-quan-giai-đoạn)
2. [Cài đặt môi trường](#2-cài-đặt-môi-trường)
3. [Khởi tạo dự án](#3-khởi-tạo-dự-án)
4. [Thiết kế cấu trúc thư mục](#4-thiết-kế-cấu-trúc-thư-mục)
5. [Tạo Database & Models](#5-tạo-database--models)
6. [Xây dựng API theo module](#6-xây-dựng-api-theo-module)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Cấu hình Email Service](#8-cấu-hình-email-service)
9. [Kiểm thử API bằng Postman](#9-kiểm-thử-api-bằng-postman)
10. [Lịch trình 15 ngày](#10-lịch-trình-15-ngày)

---

## 1. Tổng quan giai đoạn

### Công việc chính (theo đề cương):

- Nghiên cứu Node.js, Express.js, MySQL
- Xây dựng RESTful API với Sequelize ORM
- Thiết lập authentication, phân quyền role
- Kiểm thử API bằng Postman

### Mapping với SRS:

| Công việc          | SRS Sections                 | REQs liên quan        |
| ------------------ | ---------------------------- | --------------------- |
| Database setup     | 4.1 ERD, 4.2 Data Dictionary | 7 bảng                |
| Authentication API | 3.1                          | REQ-AU-001 → 009      |
| User CRUD API      | 3.2                          | REQ-AM-001 → 005      |
| Doctor Info API    | 3.3                          | REQ-AM-006 → 010, 022 |
| Clinic API         | 3.4                          | REQ-AM-011 → 014      |
| Specialty API      | 3.5                          | REQ-AM-015 → 017      |
| Schedule API       | 3.6                          | REQ-AM-018 → 021, 023 |
| Allcode API        | 4.2 Allcode table            | Bảng tra cứu chung    |

---

## 2. Cài đặt môi trường

### 2.1 Phần mềm cần cài

| Phần mềm    | Phiên bản                  | Mục đích                  | Link                          |
| ----------- | -------------------------- | ------------------------- | ----------------------------- |
| **Node.js** | v14+ (khuyến nghị v18 LTS) | Runtime JavaScript        | https://nodejs.org            |
| **XAMPP**   | Latest                     | MySQL server + phpMyAdmin | https://www.apachefriends.org |
| **VS Code** | Latest                     | IDE                       | https://code.visualstudio.com |
| **Postman** | Latest                     | Test API                  | https://www.postman.com       |
| **Git**     | Latest                     | Version control           | https://git-scm.com           |

### 2.2 VS Code Extensions khuyến nghị

```
- ESLint
- Prettier
- REST Client (thay thế Postman nếu muốn)
- MySQL (by Weijan Chen)
- DotENV
```

### 2.3 Tạo Database MySQL

```sql
-- Mở phpMyAdmin (XAMPP) hoặc MySQL Workbench
-- Tạo database mới:

CREATE DATABASE bookingcare;
USE bookingcare;

-- Lưu ý: Các bảng sẽ do Sequelize tự tạo qua sync/migration
```

---

## 3. Khởi tạo dự án

### 3.1 Tạo thư mục và init project

```bash
# Tạo thư mục dự án backend
mkdir bookingcare-backend
cd bookingcare-backend

# Khởi tạo npm project
npm init -y
```

### 3.2 Cài đặt dependencies

```bash
# Core dependencies
npm install express sequelize mysql2 dotenv

# Authentication
npm install bcryptjs express-session jsonwebtoken

# Email service
npm install nodemailer

# Utilities
npm install cors body-parser

# Development dependencies
npm install --save-dev nodemon
```

### 3.3 Package.json scripts

```json
{
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js"
  }
}
```

### 3.4 Tạo file .env

```env
# Server
PORT=8080

# Database (SRS Section 2.4 – Constraint #6)
DB_HOST=localhost
DB_USERNAME=root
DB_PASSWORD=
DB_NAME=bookingcare
DB_PORT=3306
DB_DIALECT=mysql

# Email (SRS Section 2.4 – Constraint #8)
EMAIL_APP_USERNAME=your-email@gmail.com
EMAIL_APP_PASSWORD=your-app-password

# JWT Secret
JWT_SECRET=your-secret-key

# Frontend URL (cho CORS và email link)
URL_REACT=http://localhost:3000
```

### 3.5 Tạo file .gitignore

```
node_modules/
.env
```

---

## 4. Thiết kế cấu trúc thư mục

```
bookingcare-backend/
├── src/
│   ├── config/
│   │   └── connectDB.js          # Kết nối Sequelize → MySQL
│   ├── controllers/
│   │   ├── homeController.js     # Test route
│   │   ├── userController.js     # User CRUD (SRS 3.2)
│   │   ├── doctorController.js   # Doctor APIs (SRS 3.3, 3.8)
│   │   ├── patientController.js  # Patient booking (SRS 3.9, 3.10)
│   │   ├── specialtyController.js # Specialty CRUD (SRS 3.5)
│   │   └── clinicController.js   # Clinic CRUD (SRS 3.4)
│   ├── models/
│   │   ├── index.js              # Sequelize model loader
│   │   ├── user.js               # Bảng User (SRS 4.2)
│   │   ├── allcode.js            # Bảng Allcode (SRS 4.2)
│   │   ├── doctor_info.js        # Bảng Doctor_Info (SRS 4.2)
│   │   ├── schedule.js           # Bảng Schedule (SRS 4.2)
│   │   ├── booking.js            # Bảng Booking (SRS 4.2)
│   │   ├── specialty.js          # Bảng Specialty (SRS 4.2)
│   │   └── clinic.js             # Bảng Clinic (SRS 4.2)
│   ├── routes/
│   │   └── web.js                # Tất cả API routes (SRS 5.2)
│   ├── services/
│   │   ├── userService.js        # Business logic User
│   │   ├── doctorService.js      # Business logic Doctor
│   │   ├── patientService.js     # Business logic Patient/Booking
│   │   ├── specialtyService.js   # Business logic Specialty
│   │   ├── clinicService.js      # Business logic Clinic
│   │   └── emailService.js       # Nodemailer (SRS 3.10, 3.13)
│   ├── middleware/
│   │   └── authMiddleware.js     # Kiểm tra đăng nhập (SRS REQ-AU-008)
│   └── server.js                 # Entry point
├── .env
├── .gitignore
└── package.json
```

**Kiến trúc 3 lớp (theo SRS Section 2.1):**

```
Route (routes/web.js)  →  Controller  →  Service  →  Model (Sequelize)  →  Database
```

---

## 5. Tạo Database & Models

### 5.1 Kết nối Database – `src/config/connectDB.js`

```javascript
// SRS Section 2.4: Sequelize ORM, MySQL development
const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: process.env.DB_DIALECT, // 'mysql'
    logging: false,
  },
);

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log(">>> Database connected successfully");
  } catch (error) {
    console.error(">>> Database connection failed:", error);
  }
};

module.exports = { sequelize, connectDB };
```

### 5.2 Models – Tạo từ SRS Data Dictionary (Section 4.2)

Mỗi model tương ứng 1 bảng trong SRS. Dưới đây là các model cần tạo:

#### Model User – `src/models/user.js`

```javascript
// SRS Section 4.2 – Bảng User
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define("User", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    password: { type: DataTypes.STRING(255), allowNull: false },
    firstName: { type: DataTypes.STRING(255), allowNull: false },
    lastName: { type: DataTypes.STRING(255), allowNull: false },
    address: { type: DataTypes.STRING(255), allowNull: true },
    phoneNumber: { type: DataTypes.STRING(20), allowNull: true },
    gender: { type: DataTypes.STRING(10), allowNull: true }, // keyMap: G1, G2, G3
    roleId: { type: DataTypes.STRING(10), allowNull: false }, // R1, R2, R3
    image: { type: DataTypes.BLOB("long"), allowNull: true }, // base64 (SRS Constraint #7)
    positionId: { type: DataTypes.STRING(10), allowNull: true }, // P1-P5
  });
  return User;
};
```

#### Model Doctor_Info – `src/models/doctor_info.js`

```javascript
// SRS Section 4.2 – Bảng Doctor_Info
module.exports = (sequelize, DataTypes) => {
  const Doctor_Info = sequelize.define("Doctor_Info", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    doctorId: { type: DataTypes.INTEGER, allowNull: false }, // FK → User.id
    specialtyId: { type: DataTypes.INTEGER, allowNull: true }, // FK → Specialty.id
    clinicId: { type: DataTypes.INTEGER, allowNull: true }, // FK → Clinic.id
    priceId: { type: DataTypes.STRING(10), allowNull: false }, // PRI1-PRI4 (SRS REQ-AM-020)
    provinceId: { type: DataTypes.STRING(10), allowNull: true },
    paymentId: { type: DataTypes.STRING(10), allowNull: true },
    contentHTML: { type: DataTypes.TEXT, allowNull: true }, // HTML render (SRS REQ-AM-007)
    contentMarkdown: { type: DataTypes.TEXT, allowNull: true }, // Markdown gốc (SRS REQ-AM-007)
    description: { type: DataTypes.TEXT, allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    count: { type: DataTypes.INTEGER, defaultValue: 0 },
  });
  return Doctor_Info;
};
```

#### Model Schedule – `src/models/schedule.js`

```javascript
// SRS Section 4.2 – Bảng Schedule
module.exports = (sequelize, DataTypes) => {
  const Schedule = sequelize.define("Schedule", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    doctorId: { type: DataTypes.INTEGER, allowNull: false }, // FK → User.id
    date: { type: DataTypes.STRING(20), allowNull: false },
    timeType: { type: DataTypes.STRING(10), allowNull: false }, // T1-T8
    maxNumber: { type: DataTypes.INTEGER, defaultValue: 10 }, // SRS REQ-AM-023
    currentNumber: { type: DataTypes.INTEGER, defaultValue: 0 }, // SRS REQ-AM-023
  });
  return Schedule;
};
```

#### Model Booking – `src/models/booking.js`

```javascript
// SRS Section 4.2 – Bảng Booking
module.exports = (sequelize, DataTypes) => {
  const Booking = sequelize.define("Booking", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    statusId: { type: DataTypes.STRING(10), allowNull: false }, // S1-S4 (SRS State Machine)
    doctorId: { type: DataTypes.INTEGER, allowNull: false },
    patientId: { type: DataTypes.INTEGER, allowNull: false },
    date: { type: DataTypes.STRING(20), allowNull: false },
    timeType: { type: DataTypes.STRING(10), allowNull: false },
    token: { type: DataTypes.STRING(255), allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: true },
    patientName: { type: DataTypes.STRING(255), allowNull: true },
    patientPhoneNumber: { type: DataTypes.STRING(20), allowNull: true },
    patientAddress: { type: DataTypes.STRING(255), allowNull: true },
    patientGender: { type: DataTypes.STRING(10), allowNull: true },
    patientBirthday: { type: DataTypes.STRING(20), allowNull: true },
  });
  return Booking;
};
```

#### Model Specialty – `src/models/specialty.js`

```javascript
// SRS Section 4.2 – Bảng Specialty
module.exports = (sequelize, DataTypes) => {
  const Specialty = sequelize.define("Specialty", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    image: { type: DataTypes.BLOB("long"), allowNull: true },
    descriptionHTML: { type: DataTypes.TEXT, allowNull: true },
    descriptionMarkdown: { type: DataTypes.TEXT, allowNull: true },
  });
  return Specialty;
};
```

#### Model Clinic – `src/models/clinic.js`

```javascript
// SRS Section 4.2 – Bảng Clinic
module.exports = (sequelize, DataTypes) => {
  const Clinic = sequelize.define("Clinic", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    address: { type: DataTypes.STRING(255), allowNull: false },
    image: { type: DataTypes.BLOB("long"), allowNull: true },
    descriptionHTML: { type: DataTypes.TEXT, allowNull: true },
    descriptionMarkdown: { type: DataTypes.TEXT, allowNull: true },
  });
  return Clinic;
};
```

#### Model Allcode – `src/models/allcode.js`

```javascript
// SRS Section 4.2 – Bảng Allcode (37 records mẫu)
module.exports = (sequelize, DataTypes) => {
  const Allcode = sequelize.define("Allcode", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    type: { type: DataTypes.STRING(50), allowNull: false }, // ROLE, GENDER, TIME, STATUS...
    keyMap: { type: DataTypes.STRING(10), allowNull: false, unique: true },
    valueVi: { type: DataTypes.STRING(255), allowNull: false },
    valueEn: { type: DataTypes.STRING(255), allowNull: false },
  });
  return Allcode;
};
```

### 5.3 Thiết lập Associations (SRS Section 4.1 ERD)

```javascript
// Trong src/models/index.js hoặc nơi define relationships

// SRS: User ↔ Doctor_Info (1:1)
User.hasOne(Doctor_Info, { foreignKey: "doctorId", as: "doctorData" });
Doctor_Info.belongsTo(User, { foreignKey: "doctorId" });

// SRS: Doctor_Info ↔ Specialty (N:1)
Specialty.hasMany(Doctor_Info, { foreignKey: "specialtyId" });
Doctor_Info.belongsTo(Specialty, {
  foreignKey: "specialtyId",
  as: "specialtyData",
});

// SRS: Doctor_Info ↔ Clinic (N:1)
Clinic.hasMany(Doctor_Info, { foreignKey: "clinicId" });
Doctor_Info.belongsTo(Clinic, { foreignKey: "clinicId", as: "clinicData" });

// SRS: User (Doctor) ↔ Schedule (1:N)
User.hasMany(Schedule, { foreignKey: "doctorId" });
Schedule.belongsTo(User, { foreignKey: "doctorId" });

// SRS: User (Doctor) ↔ Booking (1:N)
User.hasMany(Booking, { foreignKey: "doctorId", as: "doctorBookings" });
Booking.belongsTo(User, { foreignKey: "doctorId", as: "doctorData" });

// SRS: User (Patient) ↔ Booking (1:N)
User.hasMany(Booking, { foreignKey: "patientId", as: "patientBookings" });
Booking.belongsTo(User, { foreignKey: "patientId", as: "patientData" });

// SRS: Allcode ↔ Multiple Tables (tra cứu chung)
Allcode.hasMany(User, { foreignKey: "roleId", sourceKey: "keyMap" });
Allcode.hasMany(User, { foreignKey: "positionId", sourceKey: "keyMap" });
Allcode.hasMany(User, { foreignKey: "gender", sourceKey: "keyMap" });
Allcode.hasMany(Doctor_Info, { foreignKey: "priceId", sourceKey: "keyMap" });
Allcode.hasMany(Doctor_Info, { foreignKey: "paymentId", sourceKey: "keyMap" });
Allcode.hasMany(Doctor_Info, { foreignKey: "provinceId", sourceKey: "keyMap" });
Allcode.hasMany(Schedule, { foreignKey: "timeType", sourceKey: "keyMap" });
Allcode.hasMany(Booking, { foreignKey: "statusId", sourceKey: "keyMap" });
Allcode.hasMany(Booking, { foreignKey: "timeType", sourceKey: "keyMap" });
```

### 5.4 Seed Data Allcode (SRS Section 4.2 – 37 records mẫu)

```javascript
// File: src/seeders/allcode-seeder.js
// Chạy 1 lần để tạo dữ liệu mẫu cho bảng Allcode

const allcodeData = [
  // ROLE (SRS: R1, R2, R3)
  { type: "ROLE", keyMap: "R1", valueVi: "Quản trị viên", valueEn: "Admin" },
  { type: "ROLE", keyMap: "R2", valueVi: "Bác sĩ", valueEn: "Doctor" },
  { type: "ROLE", keyMap: "R3", valueVi: "Bệnh nhân", valueEn: "Patient" },

  // GENDER (SRS: G1, G2, G3)
  { type: "GENDER", keyMap: "G1", valueVi: "Nam", valueEn: "Male" },
  { type: "GENDER", keyMap: "G2", valueVi: "Nữ", valueEn: "Female" },
  { type: "GENDER", keyMap: "G3", valueVi: "Khác", valueEn: "Other" },

  // TIME (SRS: T1-T8, REQ-AM-019)
  {
    type: "TIME",
    keyMap: "T1",
    valueVi: "8:00 – 9:00",
    valueEn: "8:00 AM – 9:00 AM",
  },
  {
    type: "TIME",
    keyMap: "T2",
    valueVi: "9:00 – 10:00",
    valueEn: "9:00 AM – 10:00 AM",
  },
  {
    type: "TIME",
    keyMap: "T3",
    valueVi: "10:00 – 11:00",
    valueEn: "10:00 AM – 11:00 AM",
  },
  {
    type: "TIME",
    keyMap: "T4",
    valueVi: "11:00 – 12:00",
    valueEn: "11:00 AM – 12:00 PM",
  },
  {
    type: "TIME",
    keyMap: "T5",
    valueVi: "13:00 – 14:00",
    valueEn: "1:00 PM – 2:00 PM",
  },
  {
    type: "TIME",
    keyMap: "T6",
    valueVi: "14:00 – 15:00",
    valueEn: "2:00 PM – 3:00 PM",
  },
  {
    type: "TIME",
    keyMap: "T7",
    valueVi: "15:00 – 16:00",
    valueEn: "3:00 PM – 4:00 PM",
  },
  {
    type: "TIME",
    keyMap: "T8",
    valueVi: "16:00 – 17:00",
    valueEn: "4:00 PM – 5:00 PM",
  },

  // STATUS (SRS: S1-S4, State Machine)
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

  // POSITION (SRS: P1-P5)
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

  // PRICE (SRS: PRI1-PRI4)
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

  // PAYMENT (SRS: PAY1-PAY2)
  { type: "PAYMENT", keyMap: "PAY1", valueVi: "Tiền mặt", valueEn: "Cash" },
  {
    type: "PAYMENT",
    keyMap: "PAY2",
    valueVi: "Chuyển khoản",
    valueEn: "Bank transfer",
  },

  // PROVINCE (SRS: PRO1-PRO3)
  { type: "PROVINCE", keyMap: "PRO1", valueVi: "Hà Nội", valueEn: "Hanoi" },
  {
    type: "PROVINCE",
    keyMap: "PRO2",
    valueVi: "TP. Hồ Chí Minh",
    valueEn: "Ho Chi Minh City",
  },
  { type: "PROVINCE", keyMap: "PRO3", valueVi: "Đà Nẵng", valueEn: "Da Nang" },
];
```

---

## 6. Xây dựng API theo module

### 6.1 Entry Point – `src/server.js`

```javascript
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { connectDB } = require("./config/connectDB");
const routes = require("./routes/web");

const app = express();

// SRS Section 5.4: CORS Policy
app.use(
  cors({
    origin: process.env.URL_REACT, // http://localhost:3000
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);

// Body parser (SRS Section 5.2: JSON format)
app.use(bodyParser.json({ limit: "50mb" })); // Cho base64 image (SRS Constraint #7: 5MB)
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

// Routes
routes(app);

// Connect DB & Start server
connectDB();
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`>>> Backend running on port ${PORT}`);
});
```

### 6.2 Routes – `src/routes/web.js` (SRS Section 5.2 – 21 endpoints)

```javascript
const userController = require("../controllers/userController");
const doctorController = require("../controllers/doctorController");
const patientController = require("../controllers/patientController");
const specialtyController = require("../controllers/specialtyController");
const clinicController = require("../controllers/clinicController");

const routes = (app) => {
  // ===== AUTHENTICATION (SRS 3.1) =====
  app.post("/api/login", userController.handleLogin);

  // ===== USER CRUD – Admin (SRS 3.2) =====
  app.get("/api/get-all-users", userController.handleGetAllUsers);
  app.post("/api/create-new-user", userController.handleCreateNewUser);
  app.put("/api/edit-user", userController.handleEditUser);
  app.delete("/api/delete-user", userController.handleDeleteUser);

  // ===== DOCTOR APIs (SRS 3.3, 3.8) =====
  app.get("/api/get-top-doctor-home", doctorController.getTopDoctorHome);
  app.get("/api/get-detail-doctor-by-id", doctorController.getDetailDoctorById);
  app.post("/api/save-info-doctor", doctorController.saveInfoDoctor);

  // ===== SCHEDULE APIs (SRS 3.6) =====
  app.post("/api/bulk-create-schedule", doctorController.bulkCreateSchedule);
  app.get("/api/get-schedule-by-date", doctorController.getScheduleByDate);

  // ===== PATIENT BOOKING (SRS 3.9, 3.10) =====
  app.post(
    "/api/patient-book-appointment",
    patientController.postBookAppointment,
  );
  app.post(
    "/api/verify-book-appointment",
    patientController.postVerifyBookAppointment,
  );

  // ===== DOCTOR DASHBOARD (SRS 3.11, 3.13) =====
  app.get(
    "/api/get-list-patient-for-doctor",
    doctorController.getListPatientForDoctor,
  );
  app.post("/api/send-remedy", doctorController.sendRemedy);

  // ===== SPECIALTY (SRS 3.5) =====
  app.post("/api/create-new-specialty", specialtyController.createSpecialty);
  app.get("/api/get-all-specialty", specialtyController.getAllSpecialty);
  app.get(
    "/api/get-detail-specialty-by-id",
    specialtyController.getDetailSpecialtyById,
  );

  // ===== CLINIC (SRS 3.4) =====
  app.post("/api/create-new-clinic", clinicController.createClinic);
  app.get("/api/get-all-clinic", clinicController.getAllClinic);
  app.get("/api/get-detail-clinic-by-id", clinicController.getDetailClinicById);

  // ===== ALLCODE (SRS 4.2) =====
  app.get("/api/allcode", userController.getAllCode);
};

module.exports = routes;
```

### 6.3 Quy ước Response (SRS Section 5.2)

```javascript
// Tất cả API phải trả về format thống nhất:
// errCode = 0: Thành công
// errCode = 1: Thiếu tham số bắt buộc
// errCode = 2: Dữ liệu đã tồn tại
// errCode = 3: Không tìm thấy dữ liệu

// Ví dụ response thành công:
res.status(200).json({
  errCode: 0,
  message: "OK",
  data: result,
});

// Ví dụ response lỗi:
res.status(200).json({
  errCode: 1,
  message: "Missing required parameters!",
});
```

---

## 7. Authentication & Authorization

### 7.1 Login API (SRS REQ-AU-001, 002, 009)

```javascript
// src/services/userService.js

const bcrypt = require("bcryptjs");
const db = require("../models");

const handleUserLogin = async (email, password) => {
  // REQ-AU-001: Đăng nhập bằng email và mật khẩu
  const user = await db.User.findOne({ where: { email } });

  if (!user) {
    return { errCode: 1, message: "Email không tồn tại" }; // REQ-AU-007
  }

  // REQ-AU-002: So sánh mật khẩu đã mã hóa bcrypt
  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return { errCode: 3, message: "Sai mật khẩu" }; // REQ-AU-007
  }

  // REQ-AU-009: Trả về thông tin để lưu vào Redux store
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
```

### 7.2 Mã hóa mật khẩu khi tạo user (SRS REQ-AU-002)

```javascript
// Khi tạo user mới:
const salt = bcrypt.genSaltSync(10); // SRS: salt rounds = 10
const hashedPassword = bcrypt.hashSync(password, salt);
```

### 7.3 Middleware phân quyền (SRS REQ-AU-004, 008)

```javascript
// src/middleware/authMiddleware.js

const checkAdminRole = (req, res, next) => {
  // REQ-AU-008: Chặn truy cập route được bảo vệ
  // Kiểm tra session/JWT có role R1 (Admin) không
  // Nếu không → redirect về login
};

const checkDoctorRole = (req, res, next) => {
  // Kiểm tra role R2 (Doctor)
};
```

---

## 8. Cấu hình Email Service

### 8.1 Gmail App Password Setup

```
1. Đăng nhập Gmail → myaccount.google.com
2. Security → 2-Step Verification → BẬT
3. App passwords → Tạo password cho "Mail" + "Other (Node.js)"
4. Copy 16-ký tự password → paste vào .env EMAIL_APP_PASSWORD
```

### 8.2 Nodemailer Config (SRS REQ-PT-017, Section 5.4)

```javascript
// src/services/emailService.js

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587, // SRS Section 5.4: cổng 587 với TLS
  secure: false,
  auth: {
    user: process.env.EMAIL_APP_USERNAME,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

// Gửi email xác thực lịch hẹn (SRS REQ-PT-016, 018)
const sendEmailBooking = async (data) => {
  await transporter.sendMail({
    from: '"BookingCare" <your-email@gmail.com>',
    to: data.email,
    subject: "Xác nhận lịch hẹn khám bệnh",
    html: `
      <h3>Xin chào ${data.patientName},</h3>
      <p>Bạn đã đặt lịch khám bệnh thành công.</p>
      <p><b>Bác sĩ:</b> ${data.doctorName}</p>
      <p><b>Thời gian:</b> ${data.time}</p>
      <p><b>Ngày:</b> ${data.date}</p>
      <p>Vui lòng click link bên dưới để xác nhận:</p>
      <a href="${data.redirectLink}" target="_blank">Xác nhận lịch hẹn</a>
    `,
  });
};

// Gửi kết quả khám kèm file đính kèm (SRS REQ-DR-009, 010)
const sendEmailRemedy = async (data) => {
  await transporter.sendMail({
    from: '"BookingCare" <your-email@gmail.com>',
    to: data.email,
    subject: "Kết quả khám bệnh",
    html: `<h3>Kết quả khám bệnh</h3><p>Bác sĩ: ${data.doctorName}</p>`,
    attachments: [
      {
        filename: "ket-qua-kham.png",
        content: data.imageBase64.split("base64,")[1],
        encoding: "base64",
      },
    ],
  });
};
```

---

## 9. Kiểm thử API bằng Postman (SRS OT-008)

### 9.1 Danh sách test cases (mapping với SRS API table)

| #   | Method | Endpoint                                    | Test data                |  Expected errCode   |
| --- | ------ | ------------------------------------------- | ------------------------ | :-----------------: |
| 1   | POST   | /api/login                                  | `{email, password}` đúng |          0          |
| 2   | POST   | /api/login                                  | email sai                |          1          |
| 3   | POST   | /api/login                                  | password sai             |          3          |
| 4   | GET    | /api/get-all-users?id=ALL                   | —                        |          0          |
| 5   | POST   | /api/create-new-user                        | Đầy đủ fields            |          0          |
| 6   | POST   | /api/create-new-user                        | Email trùng              |          2          |
| 7   | POST   | /api/create-new-user                        | Thiếu email              |          1          |
| 8   | PUT    | /api/edit-user                              | `{id, firstName...}`     |          0          |
| 9   | DELETE | /api/delete-user                            | `{id}`                   |          0          |
| 10  | GET    | /api/allcode?type=ROLE                      | —                        |          0          |
| 11  | GET    | /api/allcode?type=TIME                      | —                        | 0 (8 records T1-T8) |
| 12  | GET    | /api/get-top-doctor-home?limit=10           | —                        |          0          |
| 13  | POST   | /api/save-info-doctor                       | Doctor info fields       |          0          |
| 14  | POST   | /api/bulk-create-schedule                   | `{arrSchedule: [...]}`   |          0          |
| 15  | GET    | /api/get-schedule-by-date?doctorId=1&date=X | —                        |          0          |

### 9.2 Postman Collection Setup

```
1. Tạo Collection: "BookingCare API"
2. Tạo 3 Folders: "Auth", "Admin", "Doctor"
3. Tạo Environment "Local": BASE_URL = http://localhost:8080
4. Mỗi request dùng {{BASE_URL}}/api/...
5. Test từng API, verify errCode đúng
```

---

## 10. Lịch trình 15 ngày

| Ngày         | Công việc                                                   | Output                             | SRS Reference  |
| ------------ | ----------------------------------------------------------- | ---------------------------------- | -------------- |
| **06/03**    | Cài đặt môi trường + Khởi tạo project + Tạo DB              | Project chạy được, DB connected    | Mục 2, 3       |
| **07/03**    | Tạo 7 Models + Associations + Seed Allcode                  | 7 bảng trong MySQL                 | Mục 5          |
| **08–09/03** | Login API + bcrypt + session/JWT                            | Đăng nhập hoạt động                | SRS 3.1        |
| **10–11/03** | User CRUD API (create, read, update, delete)                | 5 endpoints hoạt động              | SRS 3.2        |
| **12/03**    | Allcode API + GetTopDoctor API                              | Tra cứu + top bác sĩ               | SRS 4.2, 3.7   |
| **13–14/03** | Doctor Info API (save, get detail, get by specialty/clinic) | Chi tiết bác sĩ đầy đủ             | SRS 3.3, 3.8   |
| **15/03**    | Schedule API (bulk create, get by date)                     | Tạo/xem lịch khám                  | SRS 3.6        |
| **16/03**    | Specialty CRUD API (create, getAll, getById)                | 3 endpoints hoạt động              | SRS 3.5        |
| **17/03**    | Clinic CRUD API (create, getAll, getById)                   | 3 endpoints hoạt động              | SRS 3.4        |
| **18/03**    | Booking API + Email xác thực (Nodemailer)                   | Đặt lịch + gửi email               | SRS 3.9, 3.10  |
| **19/03**    | Doctor Dashboard API + Send Remedy API                      | Xem bệnh nhân + gửi KQ             | SRS 3.11, 3.13 |
| **20/03**    | Kiểm thử toàn bộ API bằng Postman + Fix bugs                | 21 APIs tested, Postman collection | SRS OT-008     |

---

## Checklist hoàn thành giai đoạn 4

- [ ] Project Node.js + Express chạy được trên port 8080
- [ ] MySQL database "bookingcare" với 7 bảng
- [ ] Allcode seeded (37 records)
- [ ] Login API hoạt động (bcrypt, errCode conventions)
- [ ] User CRUD API (5 endpoints)
- [ ] Doctor APIs (save info, get detail, get top)
- [ ] Schedule APIs (bulk create, get by date)
- [ ] Specialty APIs (create, getAll, getById)
- [ ] Clinic APIs (create, getAll, getById)
- [ ] Booking API + Email xác thực (Nodemailer)
- [ ] Send Remedy API (email + attachment)
- [ ] CORS configured cho localhost:3000
- [ ] .env + .gitignore configured
- [ ] Postman collection với 15+ test cases
- [ ] Tất cả 21 API endpoints hoạt động

---

_Tài liệu hướng dẫn Giai đoạn 4 – Phiên bản 1.0_
