# 🎤 SCRIPT BÁO CÁO BACKEND – BOOKINGCARE
## Thời lượng: 20 phút | Người trình bày: [Tên bạn]

---

> **Hướng dẫn đọc script:**
> - ⏱ = Mốc thời gian tham khảo
> - `code` = Đoạn code/tên file cần chỉ vào khi thuyết trình
> - 💡 = Ghi chú kỹ thuật bổ sung nếu giảng viên hỏi sâu

---

## PHẦN 1 – MỞ ĐẦU (⏱ 0:00 – 1:30)

> *"Kính chào thầy/cô và các bạn. Em tên là [Tên], hôm nay em xin báo cáo phần Backend của hệ thống BookingCare – nền tảng đặt lịch khám bệnh trực tuyến."*

Hệ thống BookingCare được xây dựng với mục tiêu mô phỏng một nền tảng y tế thực tế, cho phép **3 nhóm người dùng** tương tác: Admin, Bác sĩ và Bệnh nhân.

Phần backend em phụ trách có nhiệm vụ:
- Cung cấp **RESTful API** cho frontend (React) tiêu thụ
- Quản lý **cơ sở dữ liệu** với MySQL thông qua Sequelize ORM
- Xử lý **xác thực, phân quyền** và các **nghiệp vụ lõi** của hệ thống

---

## PHẦN 2 – TỔNG QUAN CÔNG NGHỆ (⏱ 1:30 – 3:00)

> *"Trước tiên em xin trình bày về công nghệ và cấu trúc dự án."*

**Tech Stack** (file: [package.json](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/package.json)):

| Thư viện | Mục đích |
|---|---|
| **Express.js** v5 | Framework web, xử lý HTTP request/response |
| **Sequelize** v6 | ORM – ánh xạ object JS ↔ bảng MySQL |
| **mysql2** | Driver kết nối MySQL |
| **bcryptjs** | Băm mật khẩu (salt rounds = 10) |
| **jsonwebtoken** | Tạo và xác thực JWT token |
| **nodemailer** | Gửi email xác thực & kết quả khám |
| **uuid** | Sinh token ngẫu nhiên cho xác thực email |
| **dotenv** | Quản lý biến môi trường bảo mật |
| **nodemon** | Tự reload server khi dev |

**Cấu trúc thư mục `src/`:**

```
src/
├── server.js          ← Entry point – khởi động app
├── config/            ← Cấu hình DB
├── models/            ← Định nghĩa 7 bảng CSDL
├── controllers/       ← Tiếp nhận request, gọi service
├── services/          ← Logic nghiệp vụ chính
├── routes/web.js      ← Khai báo toàn bộ API endpoint
├── middleware/        ← Xác thực JWT, phân quyền
└── seeders/           ← Seed dữ liệu mẫu ban đầu
```

> 💡 Kiến trúc này của em tuân theo mô hình **3 lớp**: Routes → Controllers → Services, giúp tách biệt rõ trách nhiệm từng lớp, dễ bảo trì.

---

## PHẦN 3 – KHỞI ĐỘNG SERVER & KẾT NỐI DATABASE (⏱ 3:00 – 5:00)

> *"Em sẽ bắt đầu từ điểm vào của server – file [server.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/server.js)."*

**File:** [src/server.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/server.js)

```javascript
// Cấu hình CORS – cho phép React frontend gọi API
app.use(cors({
  origin: process.env.URL_REACT,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true,
}));

// Tăng giới hạn body lên 50MB để hỗ trợ upload ảnh Base64
app.use(bodyParser.json({ limit: '50mb' }));

// Kết nối DB → sync bảng → mới khởi động server
db.sequelize.authenticate()
  .then(() => db.sequelize.sync())
  .then(() => app.listen(PORT, ...));
```

**Điểm quan trọng:**
- **CORS** chỉ cho phép đúng domain của React (`URL_REACT` lấy từ `.env`) → bảo mật
- **`bodyParser` limit 50MB** để hỗ trợ ảnh Base64 (ảnh bác sĩ, file kết quả khám scan)
- Quy trình khởi động tuần tự: kết nối DB → sync schema → mới lắng nghe request

**File:** [src/models/index.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/models/index.js) – Kết nối Sequelize và khai báo quan hệ bảng

```javascript
const sequelize = new Sequelize(
  process.env.DB_NAME, process.env.DB_USERNAME, process.env.DB_PASSWORD,
  { host: process.env.DB_HOST, dialect: process.env.DB_DIALECT, logging: false }
);

// Auto-load toàn bộ model file trong thư mục models/
fs.readdirSync(__dirname)
  .filter(file => file !== 'index.js' && file.endsWith('.js'))
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, DataTypes);
    db[model.name] = model;
  });
```

💡 Em dùng kỹ thuật **auto-load model** bằng `fs.readdirSync` – thêm model mới thì không cần sửa [index.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/models/index.js).

**Quan hệ bảng (Associations)** được khai báo trong [models/index.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/models/index.js):

```
User (1:1) Doctor_Info
User (1:N) Schedule
Doctor_Info (N:1) Specialty
Doctor_Info (N:1) Clinic
User/Doctor (1:N) Booking
Booking (N:1) Allcode (timeType, statusId)
```

---

## PHẦN 4 – XÁC THỰC & PHÂN QUYỀN (⏱ 5:00 – 7:30)

> *"Đây là phần em đầu tư nhiều tâm huyết nhất – cơ chế bảo mật cho toàn hệ thống."*

**File:** [src/middleware/authMiddleware.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/middleware/authMiddleware.js)

### 4.1 – Xác thực JWT (verifyToken)

```javascript
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ errCode: -1, message: 'Chưa đăng nhập!' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, roleId }
    next();
  } catch (err) {
    return res.status(403).json({ errCode: -1, message: 'Token không hợp lệ!' });
  }
};
```

### 4.2 – Phân quyền theo role

```javascript
// Chỉ Admin (R1)
const checkAdminRole = (req, res, next) => {
  if (!req.user || req.user.roleId !== 'R1') {
    return res.status(403).json({ errCode: -1, message: 'Không có quyền Admin!' });
  }
  next();
};

// Chỉ Bác sĩ (R2)
const checkDoctorRole = (req, res, next) => {
  if (!req.user || req.user.roleId !== 'R2') { ... }
  next();
};
```

**Hệ thống Role:** `R1` = Admin, `R2` = Bác sĩ, `R3` = Bệnh nhân

**File:** [src/routes/web.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/routes/web.js) – Minh họa cách áp dụng middleware:

```javascript
// PUBLIC – không cần đăng nhập
app.post('/api/v1/auth/login', userController.handleLogin);
app.get('/api/v1/doctors/top', doctorController.getTopDoctorHome);

// ADMIN ONLY – phải là R1
app.get('/api/v1/users', verifyToken, checkAdminRole, userController.handleGetAllUsers);
app.post('/api/v1/doctors', verifyToken, checkAdminRole, doctorController.saveInfoDoctor);

// DOCTOR ONLY – phải là R2
app.get('/api/v1/doctors/:doctorId/patients', verifyToken, checkDoctorRole, doctorController.getListPatientForDoctor);
app.post('/api/v1/bookings/:bookingId/remedy', verifyToken, checkDoctorRole, doctorController.sendRemedy);
```

> *"Như thầy/cô thấy, mỗi route nhạy cảm đều bắt buộc đi qua [verifyToken](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/middleware/authMiddleware.js#5-29) trước, rồi mới check role cụ thể. Điều này đảm bảo không có lỗ hổng bỏ sót."*

---

## PHẦN 5 – ĐĂNG NHẬP & QUẢN LÝ NGƯỜI DÙNG (⏱ 7:30 – 10:00)

> *"Bây giờ em đi vào luồng nghiệp vụ đầu tiên – Đăng nhập và CRUD người dùng."*

**File:** [src/services/userService.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/services/userService.js)

### 5.1 – Đăng nhập (handleUserLogin)

```javascript
const handleUserLogin = async (email, password) => {
  const user = await db.User.findOne({ where: { email }, raw: true });
  if (!user) return { errCode: 1, message: 'Email không tồn tại!' };

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return { errCode: 3, message: 'Sai mật khẩu!' };

  // Tạo JWT token (hết hạn 24h)
  const token = jwt.sign(
    { id: user.id, email: user.email, roleId: user.roleId },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  return { errCode: 0, user: { ...userData }, accessToken: token };
};
```

**Luồng đăng nhập:**
1. Frontend POST `/api/v1/auth/login` với `{ email, password }`
2. Backend tìm user trong DB, so khớp password bằng `bcrypt.compare`
3. Nếu đúng → tạo JWT chứa `{ id, email, roleId }`, hết hạn 24h
4. Trả về token → Frontend lưu vào Redux store

### 5.2 – CRUD User (Admin)

```javascript
// Tạo user: mã hóa password trước khi lưu
const hashedPassword = bcrypt.hashSync(data.password, salt); // salt = 10 rounds

// Sửa user: chỉ update các field được truyền vào
user.firstName = data.firstName || user.firstName;
await user.save();

// Xóa user
await db.User.destroy({ where: { id } });
```

> 💡 Em dùng `bcryptjs` với **salt rounds = 10** – đây là chuẩn công nghiệp. Password không bao giờ lưu dạng plain text.

### 5.3 – Tìm kiếm (searchService) – REQ-PT-002

```javascript
const searchService = async (keyword) => {
  const likeQuery = { [Op.like]: `%${keyword}%` };

  const doctors    = await db.User.findAll({ where: { roleId: 'R2', [Op.or]: [{ firstName: likeQuery }, { lastName: likeQuery }] } });
  const specialties = await db.Specialty.findAll({ where: { name: likeQuery } });
  const clinics    = await db.Clinic.findAll({ where: { name: likeQuery } });

  return { errCode: 0, data: { doctors, specialties, clinics } };
};
```

> *"Endpoint `GET /api/v1/search?keyword=...` cho phép tìm đồng thời bác sĩ, chuyên khoa và phòng khám trong một lần gọi API."*

---

## PHẦN 6 – QUẢN LÝ BÁC SĨ & LỊCH KHÁM (⏱ 10:00 – 13:30)

> *"Đây là module phức tạp nhất, em sẽ trình bày kỹ. File chính: [src/services/doctorService.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/services/doctorService.js)."*

### 6.1 – Lưu thông tin bác sĩ (Upsert Pattern)

```javascript
const saveInfoDoctor = async (data) => {
  const doctorInfo = await db.Doctor_Info.findOne({ where: { doctorId: data.doctorId } });

  if (doctorInfo) {
    // Nếu đã có → UPDATE
    doctorInfo.contentHTML = data.contentHTML;
    doctorInfo.specialtyId = data.specialtyId;
    // ... cập nhật các field khác
    await doctorInfo.save();
  } else {
    // Chưa có → INSERT
    await db.Doctor_Info.create({ doctorId: data.doctorId, ... });
  }
  return { errCode: 0, message: 'Lưu thành công!' };
};
```

> *"Em sử dụng pattern **Upsert** – kiểm tra tồn tại trước, nếu có thì update, chưa có thì create. Điều này tránh duplicate data."*

### 6.2 – Tạo lịch khám hàng loạt (bulkCreateSchedule)

```javascript
const bulkCreateSchedule = async (data) => {
  // Lấy danh sách lịch đã tồn tại trong ngày đó
  const existing = await db.Schedule.findAll({
    where: { doctorId: schedules[0].doctorId, date: schedules[0].date },
  });

  // Chỉ tạo các khung giờ CHƯA có → tránh trùng lặp
  const toCreate = schedules.filter(s => !existing.find(e => e.timeType === s.timeType));
  if (toCreate.length > 0) {
    await db.Schedule.bulkCreate(toCreate);
  }

  return { errCode: 0, message: `Tạo ${toCreate.length} lịch khám thành công!` };
};
```

> *"Admin có thể tick nhiều khung giờ và bấm lưu một lúc. Backend nhận một mảng schedule, lọc ra những khung giờ chưa có trong DB rồi insert hàng loạt bằng [bulkCreate](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/services/doctorService.js#127-153) – hiệu quả hơn nhiều so với insert từng cái một."*

### 6.3 – Xóa lịch khám an toàn (deleteSchedule)

```javascript
const deleteSchedule = async (data) => {
  // Kiểm tra nếu đã có bệnh nhân đặt → từ chối xóa
  if (schedule.currentNumber > 0) {
    return { errCode: 2, message: `Lịch đã có ${schedule.currentNumber} bệnh nhân đặt, không thể xóa!` };
  }
  await db.Schedule.destroy({ where: { doctorId, date, timeType } });
};
```

### 6.4 – Lịch khám còn trống (getScheduleByDate)

```javascript
const getScheduleByDate = async (doctorId, date) => {
  const schedules = await db.Schedule.findAll({
    where: { doctorId, date },
    include: [{ model: db.Allcode, as: 'timeTypeData', attributes: ['valueVi', 'valueEn'] }],
  });
  // Chỉ trả về những khung giờ còn chỗ
  const available = schedules.filter(s => s.currentNumber < s.maxNumber);
  return { errCode: 0, data: available };
};
```

---

## PHẦN 7 – QUY TRÌNH ĐẶT LỊCH KHÁM (⏱ 13:30 – 16:30)

> *"Đây là luồng nghiệp vụ cốt lõi – bệnh nhân đặt lịch và xác thực qua email. File: [src/services/patientService.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/services/patientService.js)."*

### 7.1 – State Machine của Booking

```
S1 (Chờ xác nhận) → S2 (Đã xác nhận) → S3 (Hoàn thành / đã gửi kết quả)
                                        → S4 (Đã hủy)
```

### 7.2 – Đặt lịch (postBookAppointment)

**Luồng xử lý:**

```javascript
const postBookAppointment = async (data) => {
  // 1. Validate đầu vào
  if (!data.email || !data.fullName || !data.doctorId || ...) { ... }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^[0-9]{10,11}$/;

  // 2. Kiểm tra khung giờ còn chỗ
  if (schedule.currentNumber >= schedule.maxNumber) {
    return { errCode: 4, message: 'Khung giờ đã hết chỗ!' };
  }

  // 3. Tạo token UUID duy nhất cho email xác thực
  const token = uuidv4();

  // 4. findOrCreate bệnh nhân (không tạo tài khoản trùng)
  const [patient] = await db.User.findOrCreate({ where: { email }, defaults: { roleId: 'R3', ... } });

  // 5. Kiểm tra đặt trùng
  const existBooking = await db.Booking.findOne({ where: { doctorId, patientId, date, timeType } });
  if (existBooking) return { errCode: 2, message: 'Bạn đã đặt lịch này rồi!' };

  // 6. Tạo Booking (statusId = 'S1')
  await db.Booking.create({ statusId: 'S1', token, ... });

  // 7. Tăng currentNumber của Schedule
  await db.Schedule.increment('currentNumber', { by: 1, where: { doctorId, date, timeType } });

  // 8. Gửi email xác thực
  const redirectLink = `${process.env.URL_REACT}/verify-booking?token=${token}&doctorId=${data.doctorId}`;
  await emailService.sendEmailBooking({ email, redirectLink, ... });
};
```

> *"Em xử lý 8 bước tuần tự trong một transaction API. Đặc biệt bước 7 – tăng `currentNumber` – đảm bảo không vượt quá `maxNumber` của lịch khám, tránh overbooking."*

### 7.3 – Xác thực lịch hẹn qua email (postVerifyBookAppointment)

```javascript
const postVerifyBookAppointment = async (data) => {
  const booking = await db.Booking.findOne({
    where: { token: data.token, doctorId: data.doctorId, statusId: 'S1' },
  });
  if (!booking) return { errCode: 3, message: 'Đã xác nhận hoặc không tồn tại!' };

  // State Machine: S1 → S2 (xác nhận thành công)
  booking.statusId = 'S2';
  await booking.save();
};
```

---

## PHẦN 8 – EMAIL SERVICE (⏱ 16:30 – 17:30)

> *"File [src/services/emailService.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/services/emailService.js) chịu trách nhiệm gửi 2 loại email: xác nhận lịch hẹn và gửi kết quả khám."*

**Cấu hình Nodemailer:**
```javascript
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com', port: 587,
  auth: { user: process.env.EMAIL_APP_USERNAME, pass: process.env.EMAIL_APP_PASSWORD },
});
```

**Email xác nhận booking** ([sendEmailBooking](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/services/emailService.js#14-41)):
- Nội dung HTML đa ngôn ngữ (vi/en)
- Chứa link `verify-booking?token=UUID&doctorId=...` để bệnh nhân nhấn xác nhận

**Email kết quả khám** ([sendEmailRemedy](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/services/emailService.js#42-68)):
- Đính kèm file ảnh đơn thuốc/kết quả (định dạng Base64)
- Tên file tự động: `ket-qua-kham-${Date.now()}.png`

---

## PHẦN 9 – QUY TRÌNH BÁC SĨ XỬ LÝ BỆNH NHÂN (⏱ 17:30 – 19:00)

> *"Sau khi Admin tạo lịch và bệnh nhân đặt, bác sĩ đăng nhập để xem danh sách và xử lý."*

**File:** [src/services/doctorService.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/services/doctorService.js)

### getListPatientForDoctor – Lọc theo trạng thái

```javascript
const getListPatientForDoctor = async (doctorId, date, statusId) => {
  const whereClause = { doctorId, date };
  if (statusId && statusId !== 'ALL') {
    whereClause.statusId = statusId; // lọc S1, S2, S3, S4...
  } else if (!statusId) {
    whereClause.statusId = 'S2'; // mặc định: đã xác nhận
  }
  // Nếu statusId === 'ALL' → hiển thị tất cả
  const patients = await db.Booking.findAll({ where: whereClause, include: [...] });
};
```

### cancelBooking – Hủy lịch (S2 → S4)

```javascript
const cancelBooking = async (data) => {
  const booking = await db.Booking.findOne({ where: { id: data.bookingId, statusId: 'S2' } });
  booking.statusId = 'S4'; // Đã hủy
  await booking.save();

  // Hoàn trả slot: giảm currentNumber
  await db.Schedule.decrement('currentNumber', {
    by: 1,
    where: { doctorId: booking.doctorId, date: booking.date, timeType: booking.timeType },
  });
};
```

> *"Khi hủy lịch, em không chỉ đổi status mà còn **hoàn trả slot** bằng cách `decrement currentNumber` – đảm bảo bệnh nhân khác có thể đặt lại khung giờ đó."*

### sendRemedy – Gửi kết quả khám (S2 → S3)

```javascript
const sendRemedy = async (data) => {
  if (booking) {
    booking.statusId = 'S3'; // Hoàn thành
    await booking.save();
  }
  await emailService.sendEmailRemedy({ email, imageBase64, doctorName, language });
};
```

---

## PHẦN 10 – KẾT LUẬN (⏱ 19:00 – 20:00)

> *"Tóm lại, backend BookingCare em đã hoàn thành các nhóm chức năng sau:"*

| # | Module | File chính | Chức năng |
|---|---|---|---|
| 1 | Khởi động server | [server.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/server.js) | CORS, body parser, kết nối DB |
| 2 | Database & ORM | [models/index.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/models/index.js) + 7 model files | Schema + Associations |
| 3 | Bảo mật | [middleware/authMiddleware.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/middleware/authMiddleware.js) | JWT + phân quyền R1/R2/R3 |
| 4 | API Routing | [routes/web.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/routes/web.js) | 30+ endpoint RESTful |
| 5 | Xác thực | [services/userService.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/services/userService.js) | Login + bcrypt + JWT |
| 6 | Quản lý bác sĩ | [services/doctorService.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/services/doctorService.js) | Upsert, Schedule bulk |
| 7 | Đặt lịch khám | [services/patientService.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/services/patientService.js) | 8-bước booking + UUID token |
| 8 | Email | [services/emailService.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/services/emailService.js) | Xác thực & gửi kết quả |
| 9 | Tìm kiếm | [services/userService.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/services/userService.js) | Full-text search đa entity |
| 10 | Lịch sử bệnh nhân | [services/doctorService.js](file:///d:/1_Hoc_Tap/1_1_Dai_Hoc/Tai_lieu_ki_2_nam_3/duchai1703/bookingcare-backend/src/services/doctorService.js) | Booking history |

> *"Trong quá trình phát triển, em đặc biệt chú ý đến 3 điểm: **bảo mật** (JWT + bcrypt + CORS), **tính nhất quán dữ liệu** (State Machine S1→S2→S3/S4, cập nhật currentNumber atomically), và **kiến trúc rõ ràng** (phân lớp Routes/Controllers/Services). Em xin cảm ơn thầy/cô đã lắng nghe, em sẵn sàng trả lời các câu hỏi."*

---

## ❓ CÂU HỎI CÓ THỂ GẶP & GỢI Ý TRẢ LỜI

**Q: Tại sao dùng Sequelize ORM thay vì viết SQL thuần?**
> Sequelize giúp định nghĩa schema bằng JavaScript, tự động tạo bảng qua `sync()`, hỗ trợ association trực quan (hasOne, belongsTo...) và bảo vệ khỏi SQL injection.

**Q: JWT token lưu ở đâu và có an toàn không?**
> Token được trả về cho frontend và frontend tự quản lý (lưu Redux/localStorage). Backend không lưu session. An toàn vì token ký bằng `JWT_SECRET` trong `.env`, hết hạn sau 24h.

**Q: Nếu 2 người cùng đặt cùng khung giờ, hệ thống xử lý thế nào?**
> Em kiểm tra `currentNumber >= maxNumber` trước khi tạo booking. Tuy nhiên do chưa có database transaction/lock, trong trường hợp high concurrency lý tưởng cần thêm một lớp transaction hoặc queue.

**Q: Password mặc định của bệnh nhân là gì?**
> Khi bệnh nhân đặt lịch lần đầu, hệ thống dùng `findOrCreate` với password mặc định `'patient_default'`. Bệnh nhân không có giao diện đăng nhập trong phiên bản này – đây là điểm cần cải thiện trong giai đoạn tiếp theo.

**Q: Tại sao ảnh lưu dạng BLOB thay vì upload file?**
> Với phạm vi đồ án sinh viên, lưu BLOB đơn giản hóa triển khai (không cần storage server như S3). Hạn chế là làm tăng kích thước DB và thời gian query. Production thực tế nên dùng cloud storage.
