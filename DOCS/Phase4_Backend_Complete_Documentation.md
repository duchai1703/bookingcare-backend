# Tài Liệu Chi Tiết Backend – BookingCare

**Ngày cập nhật:** 08/03/2026 | **Tổng:** 23 files, 30 APIs, 7 bảng, 37 seed records

---

## MỤC LỤC

- [PHẦN A – HƯỚNG DẪN CÀI ĐẶT VÀ CHẠY THỬ](#phần-a--hướng-dẫn-cài-đặt-và-chạy-thử)
- [PHẦN B – CẤU TRÚC DỰ ÁN](#phần-b--cấu-trúc-dự-án)
- [PHẦN C – CƠ SỞ DỮ LIỆU (7 BẢNG)](#phần-c--cơ-sở-dữ-liệu-7-bảng)
- [PHẦN D – MIDDLEWARE BẢO MẬT](#phần-d--middleware-bảo-mật)
- [PHẦN E – EMAIL SERVICE](#phần-e--email-service)
- [PHẦN F – CHI TIẾT 30 APIs](#phần-f--chi-tiết-30-apis)
- [PHẦN G – TEST BẰNG POSTMAN](#phần-g--test-bằng-postman)

---

# PHẦN A – HƯỚNG DẪN CÀI ĐẶT VÀ CHẠY THỬ

## Bước 1: Bật XAMPP và tạo Database

1. Mở **XAMPP Control Panel**
2. Nhấn **Start** ở hàng **MySQL**
3. Nhấn **Start** ở hàng **Apache** (để dùng phpMyAdmin)
4. Nhấn **Admin** ở hàng MySQL → mở **phpMyAdmin**
5. Trong phpMyAdmin:
   - Click tab **"Databases"** (hoặc "Cơ sở dữ liệu")
   - Gõ tên: `bookingcare`
   - Nhấn **Create** (Tạo)

## Bước 2: Cấu hình .env

Mở file `bookingcare-backend/.env` và kiểm tra:

```env
# Server
PORT=8080

# Database
DB_HOST=localhost
DB_USERNAME=root        ← Mặc định XAMPP
DB_PASSWORD=            ← Mặc định XAMPP là trống
DB_NAME=bookingcare
DB_PORT=3306
DB_DIALECT=mysql

# Email (cấu hình ở Bước 6 nếu muốn test email)
EMAIL_APP_USERNAME=your-email@gmail.com
EMAIL_APP_PASSWORD=your-app-password

# JWT Secret
JWT_SECRET=bookingcare-secret-key-2026

# Frontend URL
URL_REACT=http://localhost:3000
```

## Bước 3: Cài đặt thư viện

```bash
cd bookingcare-backend
npm install
```

**Các thư viện sẽ được cài:**

| Thư viện               | Vai trò                                               |
| ---------------------- | ----------------------------------------------------- |
| `express`              | Web framework, xử lý HTTP request/response            |
| `sequelize` + `mysql2` | ORM kết nối và thao tác MySQL                         |
| `dotenv`               | Đọc biến môi trường từ file `.env`                    |
| `cors`                 | Cho phép frontend (port 3000) gọi backend (port 8080) |
| `body-parser`          | Parse JSON body từ request                            |
| `bcryptjs`             | Mã hóa mật khẩu (hash + so sánh)                      |
| `jsonwebtoken`         | Tạo và xác thực JWT token                             |
| `nodemailer`           | Gửi email qua Gmail SMTP                              |
| `uuid`                 | Tạo mã token duy nhất cho xác thực email              |
| `nodemon`              | Tự restart server khi code thay đổi (dev)             |

## Bước 4: Seed Data (tạo bảng + dữ liệu mẫu)

```bash
npm run seed
```

**Kết quả mong đợi:**

```
>>> Database connected
>>> All tables created
>>> Seeded 37 allcode records
>>> Seeded admin account (admin@bookingcare.vn / 123456)
========================================
  SEED COMPLETE!
========================================
```

Sau khi seed xong, vào phpMyAdmin kiểm tra → database `bookingcare` sẽ có **7 bảng** + dữ liệu trong bảng `Allcodes` (37 records) và `Users` (1 admin).

## Bước 5: Chạy Server

```bash
npm run dev
```

**Kết quả mong đợi:**

```
>>> Database connected
>>> All tables synced
>>> Server running on http://localhost:8080
```

Truy cập `http://localhost:8080/` → thấy text **"BookingCare Backend is running!"** = thành công!

## Bước 6: Cấu hình Email (tùy chọn)

Chỉ cần nếu muốn test chức năng gửi email (đặt lịch + gửi kết quả).

1. Đăng nhập Gmail → `myaccount.google.com`
2. **Security → 2-Step Verification → BẬT**
3. **App passwords** → Tạo password cho "Mail" + "Other (Node.js)"
4. Copy 16-ký tự password → paste vào `.env`:

```env
EMAIL_APP_USERNAME=your-real-email@gmail.com
EMAIL_APP_PASSWORD=abcd efgh ijkl mnop  ← 16 ký tự từ Google
```

---

# PHẦN B – CẤU TRÚC DỰ ÁN

```
bookingcare-backend/
├── package.json            ← Thông tin project + scripts
├── .env                    ← Biến môi trường (DB, email, JWT)
├── .gitignore              ← Bỏ qua node_modules/ và .env
├── node_modules/           ← Thư viện (npm install)
└── src/
    ├── server.js                          ← ENTRY POINT (khởi động server)
    ├── middleware/
    │   └── authMiddleware.js              ← JWT + phân quyền R1/R2
    ├── models/
    │   ├── index.js                       ← Kết nối DB + load models + associations
    │   ├── user.js                        ← Bảng User (11 cột)
    │   ├── allcode.js                     ← Bảng Allcode (5 cột, 37 records)
    │   ├── doctor_info.js                 ← Bảng Doctor_Info (12 cột)
    │   ├── schedule.js                    ← Bảng Schedule (6 cột)
    │   ├── booking.js                     ← Bảng Booking (13 cột)
    │   ├── specialty.js                   ← Bảng Specialty (5 cột)
    │   └── clinic.js                      ← Bảng Clinic (6 cột)
    ├── routes/
    │   └── web.js                         ← 30 routes (Public/Admin/Doctor)
    ├── controllers/                       ← Nhận request, trả response
    │   ├── userController.js              ← 7 hàm
    │   ├── doctorController.js            ← 11 hàm
    │   ├── patientController.js           ← 2 hàm
    │   ├── specialtyController.js         ← 5 hàm
    │   └── clinicController.js            ← 5 hàm
    ├── services/                          ← Xử lý logic nghiệp vụ
    │   ├── userService.js                 ← 7 hàm (login, CRUD, search)
    │   ├── doctorService.js               ← 11 hàm
    │   ├── patientService.js              ← 2 hàm (booking, verify)
    │   ├── specialtyService.js            ← 5 hàm
    │   ├── clinicService.js               ← 5 hàm
    │   └── emailService.js                ← 2 hàm (booking email, remedy email)
    └── seeders/
        └── seedAllcode.js                 ← Tạo 37 allcode + 1 admin
```

### Luồng hoạt động (kiến trúc 3 lớp):

```
1. Client gửi request (ví dụ: POST /api/login)
        │
        ▼
2. routes/web.js → Dẫn request đến đúng controller
        │
        ▼
3. controllers/ → Nhận req, validate cơ bản, gọi service
        │
        ▼
4. services/ → Xử lý logic nghiệp vụ (query DB, tính toán, gửi email)
        │
        ▼
5. models/ → Sequelize giao tiếp với MySQL database
        │
        ▼
6. Controller nhận kết quả → Trả JSON response cho client
```

### Quy ước Response (tất cả API đều trả về):

```json
{
  "errCode": 0,       // 0=Thành công, 1=Thiếu params, 2=Trùng, 3=Không tìm thấy, 4=Hết chỗ, -1=Server error
  "message": "OK",    // Mô tả kết quả
  "data": { ... }     // Dữ liệu (nếu có)
}
```

---

# PHẦN C – CƠ SỞ DỮ LIỆU (7 BẢNG)

## C.1 – Bảng User (người dùng)

**File:** `src/models/user.js`

| Cột           | Kiểu           | Ý nghĩa                                       |
| ------------- | -------------- | --------------------------------------------- |
| `id`          | INTEGER, PK    | Mã người dùng (tự tăng)                       |
| `email`       | STRING, UNIQUE | Email đăng nhập                               |
| `password`    | STRING         | Mật khẩu đã mã hóa bcrypt                     |
| `firstName`   | STRING         | Tên                                           |
| `lastName`    | STRING         | Họ                                            |
| `address`     | STRING         | Địa chỉ                                       |
| `phoneNumber` | STRING         | SĐT                                           |
| `gender`      | STRING         | G1=Nam, G2=Nữ, G3=Khác                        |
| `roleId`      | STRING         | **R1**=Admin, **R2**=Bác sĩ, **R3**=Bệnh nhân |
| `image`       | BLOB           | Ảnh đại diện (base64)                         |
| `positionId`  | STRING         | P1=BS, P2=Thạc sĩ, P3=TS, P4=PGS, P5=GS       |

## C.2 – Bảng Doctor_Info (hồ sơ bác sĩ)

**File:** `src/models/doctor_info.js`

| Cột               | Kiểu                  | Ý nghĩa                      |
| ----------------- | --------------------- | ---------------------------- |
| `id`              | INTEGER, PK           | Mã hồ sơ                     |
| `doctorId`        | INTEGER, FK→User      | Liên kết bác sĩ              |
| `specialtyId`     | INTEGER, FK→Specialty | Chuyên khoa                  |
| `clinicId`        | INTEGER, FK→Clinic    | Phòng khám                   |
| `priceId`         | STRING                | PRI1-PRI6 (giá khám)         |
| `provinceId`      | STRING                | PRO1-PRO6 (tỉnh/thành)       |
| `paymentId`       | STRING                | PAY1-PAY3 (thanh toán)       |
| `contentHTML`     | TEXT                  | Bài giới thiệu dạng HTML     |
| `contentMarkdown` | TEXT                  | Bài giới thiệu dạng Markdown |
| `description`     | TEXT                  | Mô tả ngắn                   |
| `note`            | TEXT                  | Ghi chú                      |
| `count`           | INTEGER               | Số lượt đặt khám             |

## C.3 – Bảng Schedule (lịch khám)

**File:** `src/models/schedule.js`

| Cột             | Kiểu             | Ý nghĩa             |
| --------------- | ---------------- | ------------------- |
| `id`            | INTEGER, PK      | Mã lịch             |
| `doctorId`      | INTEGER, FK→User | Bác sĩ              |
| `date`          | STRING           | Ngày (timestamp)    |
| `timeType`      | STRING           | T1-T8 (khung giờ)   |
| `maxNumber`     | INTEGER (=10)    | Số bệnh nhân tối đa |
| `currentNumber` | INTEGER (=0)     | Số đã đặt           |

## C.4 – Bảng Booking (lịch hẹn)

**File:** `src/models/booking.js`

| Cột                  | Kiểu             | Ý nghĩa                                                       |
| -------------------- | ---------------- | ------------------------------------------------------------- |
| `id`                 | INTEGER, PK      | Mã lịch hẹn                                                   |
| `statusId`           | STRING           | **S1**=Mới, **S2**=Đã xác nhận, **S3**=Đã khám, **S4**=Đã hủy |
| `doctorId`           | INTEGER, FK→User | Bác sĩ                                                        |
| `patientId`          | INTEGER, FK→User | Bệnh nhân                                                     |
| `date`               | STRING           | Ngày hẹn                                                      |
| `timeType`           | STRING           | Khung giờ                                                     |
| `token`              | STRING           | UUID cho xác thực email                                       |
| `reason`             | TEXT             | Lý do khám                                                    |
| `patientName`        | STRING           | Tên BN                                                        |
| `patientPhoneNumber` | STRING           | SĐT BN                                                        |
| `patientAddress`     | STRING           | Địa chỉ BN                                                    |
| `patientGender`      | STRING           | Giới tính BN                                                  |
| `patientBirthday`    | STRING           | Ngày sinh BN                                                  |

**State Machine (vòng đời lịch hẹn):**

```
Bệnh nhân đặt lịch → S1 (Mới)
         │
    BN click email xác nhận
         │
         ▼
      S2 (Đã xác nhận)
       /        \
  BS hoàn thành  BS hủy
      │            │
      ▼            ▼
   S3 (Done)    S4 (Cancelled)
```

## C.5-C.7 – Các bảng còn lại

- **Specialty** (`specialty.js`): id, name, image, descriptionHTML, descriptionMarkdown
- **Clinic** (`clinic.js`): id, name, address, image, descriptionHTML, descriptionMarkdown
- **Allcode** (`allcode.js`): id, type, keyMap, valueVi, valueEn → **37 records** tra cứu chung

## C.8 – Mối quan hệ (Associations)

**File:** `src/models/index.js`

```
User ↔ Doctor_Info     (1:1)  – 1 BS có 1 hồ sơ
Doctor_Info ↔ Specialty (N:1) – Nhiều BS cùng 1 chuyên khoa
Doctor_Info ↔ Clinic    (N:1) – Nhiều BS cùng 1 phòng khám
User ↔ Schedule         (1:N) – 1 BS có nhiều lịch khám
User ↔ Booking          (1:N) – 1 BS/BN có nhiều lịch hẹn
Allcode ↔ Tất cả bảng         – Bảng tra cứu chung
```

---

# PHẦN D – MIDDLEWARE BẢO MẬT

**File:** `src/middleware/authMiddleware.js`

Có **4 hàm** middleware chạy TRƯỚC controller:

### D.1 – `verifyToken` (xác thực đăng nhập)

```
Hoạt động:
1. Lấy token từ header: Authorization: Bearer <token>
2. Nếu KHÔNG có token → trả 401 "Chưa đăng nhập"
3. jwt.verify(token, secretKey) → giải mã
4. Nếu token HẾT HẠN hoặc SAI → trả 403 "Token không hợp lệ"
5. Nếu OK → gắn { id, email, roleId } vào req.user → next()
```

### D.2 – `checkAdminRole` (chỉ Admin R1)

```
Hoạt động:
1. Kiểm tra req.user.roleId === 'R1'
2. Nếu KHÔNG phải R1 → trả 403 "Không có quyền Admin"
3. Nếu OK → next()
```

### D.3 – `checkDoctorRole` (chỉ Bác sĩ R2)

```
Hoạt động: tương tự D.2 nhưng check roleId === 'R2'
```

### D.4 – `checkAdminOrDoctorRole` (R1 hoặc R2)

```
Hoạt động: check roleId === 'R1' HOẶC 'R2'
```

### Cách áp dụng vào route:

```javascript
// Route công khai – ai cũng vào được:
app.get("/api/get-all-specialty", specialtyController.getAllSpecialty);

// Route Admin – phải login + role R1:
app.post(
  "/api/create-new-user",
  verifyToken,
  checkAdminRole,
  userController.handleCreateNewUser,
);
// → Request đi qua: verifyToken → checkAdminRole → controller

// Route Doctor – phải login + role R2:
app.get(
  "/api/get-list-patient-for-doctor",
  verifyToken,
  checkDoctorRole,
  doctorController.getListPatientForDoctor,
);
```

---

# PHẦN E – EMAIL SERVICE

**File:** `src/services/emailService.js`

### E.1 – Cấu hình Nodemailer

```
- Dùng Gmail SMTP (smtp.gmail.com, port 587)
- Lấy username/password từ .env
- Cần bật 2FA + tạo App Password trong Google Account
```

### E.2 – `sendEmailBooking` (gửi email xác thực lịch hẹn)

```
Khi bệnh nhân đặt lịch → hàm này tự động gửi email chứa:
- Tên bệnh nhân
- Tên bác sĩ
- Ngày + giờ khám
- Link xác nhận (http://localhost:3000/verify-booking?token=xxx&doctorId=y)
- Hỗ trợ 2 ngôn ngữ: Việt/Anh
```

### E.3 – `sendEmailRemedy` (gửi kết quả khám)

```
Khi bác sĩ gửi kết quả → hàm này gửi email chứa:
- Tên bác sĩ
- File đính kèm (ảnh base64 → PNG)
- Hỗ trợ 2 ngôn ngữ: Việt/Anh
```

---

# PHẦN F – CHI TIẾT 30 APIs

## F.1 – AUTHENTICATION (1 API)

### API 1: `POST /api/login` — Đăng nhập

**Route:** Public (không cần token)

**Code hoạt động:**

```
1. Nhận { email, password } từ body
2. Controller kiểm tra: thiếu email hoặc password → errCode: 1
3. Service tìm user theo email trong DB
4. Nếu không tìm thấy → errCode: 1 "Email không tồn tại"
5. So sánh password bằng bcrypt.compare(password, hashedPassword)
6. Nếu sai mật khẩu → errCode: 3 "Sai mật khẩu"
7. Tạo JWT token = jwt.sign({ id, email, roleId }, secret, { expiresIn: '24h' })
8. Trả về: { errCode: 0, user: {...}, accessToken: "eyJhbGc..." }
```

**Files liên quan:** `userController.handleLogin` → `userService.handleUserLogin`

---

## F.2 – USER CRUD (4 APIs) — Chỉ Admin R1

### API 2: `GET /api/get-all-users?id=ALL` — Lấy danh sách users

**Route:** 🔒 `verifyToken` → `checkAdminRole`

```
1. Nhận query param: id=ALL (tất cả) hoặc id=<number> (1 user)
2. Nếu id=ALL → db.User.findAll(), ẩn password
3. Nếu id=2 → db.User.findOne({ where: { id: 2 } })
4. Trả: { errCode: 0, users: [...] }
```

### API 3: `POST /api/create-new-user` — Tạo user mới

**Route:** 🔒 Admin only

```
1. Nhận body: { email, password, firstName, lastName, roleId, ... }
2. Validate: thiếu field bắt buộc → errCode: 1
3. Check email trùng: db.User.findOne({ where: { email } }) → errCode: 2
4. Mã hóa password: bcrypt.hashSync(password, salt=10)
5. db.User.create({ email, password: hashedPassword, ... })
6. Trả: { errCode: 0, message: "Tạo người dùng thành công!" }
```

### API 4: `PUT /api/edit-user` — Sửa user

**Route:** 🔒 Admin only

```
1. Nhận body: { id, firstName, lastName, ... }  ← id bắt buộc
2. Tìm user: db.User.findOne({ where: { id } })
3. Không tìm thấy → errCode: 3
4. Cập nhật: user.firstName = data.firstName || user.firstName (giữ giá trị cũ nếu không gửi mới)
5. Nếu có data.image → cập nhật ảnh mới
6. user.save()
```

### API 5: `DELETE /api/delete-user` — Xóa user

**Route:** 🔒 Admin only

```
1. Nhận body: { id }
2. Tìm user, không thấy → errCode: 3
3. db.User.destroy({ where: { id } })
```

---

## F.3 – DOCTOR MANAGEMENT (3 APIs)

### API 6: `GET /api/get-top-doctor-home?limit=10` — Bác sĩ nổi bật

**Route:** Public

```
1. Nhận query: limit (mặc định 10)
2. db.User.findAll({
     where: { roleId: 'R2' },    ← Chỉ lấy user có role Bác sĩ
     limit: 10,
     order: [['createdAt', 'DESC']],  ← Mới nhất lên đầu
     include: positionData, genderData  ← JOIN bảng Allcode
   })
3. Ẩn password
4. Trả: { errCode: 0, data: [{ id, firstName, positionData: { valueVi: "Tiến sĩ" }, ... }] }
```

### API 7: `GET /api/get-detail-doctor-by-id?id=X` — Chi tiết bác sĩ

**Route:** Public

```
1. Nhận query: id
2. db.User.findOne({
     include: [
       positionData,           ← Chức danh (P1-P5)
       doctorInfoData → include: [
         priceData,            ← Giá khám (PRI1-PRI6)
         paymentData,          ← Thanh toán (PAY1-PAY3)
         provinceData,         ← Tỉnh (PRO1-PRO6)
         specialtyData,        ← Tên chuyên khoa
         clinicData            ← Tên + địa chỉ phòng khám
       ]
     ]
   })
3. Chuyển image BLOB → base64 string (để frontend render <img src=...>)
4. Trả: { errCode: 0, data: { toàn bộ thông tin doctor nested } }
```

### API 8: `POST /api/save-info-doctor` — Lưu/cập nhật hồ sơ BS

**Route:** 🔒 Admin only

```
1. Nhận body: { doctorId, contentHTML, contentMarkdown, specialtyId, clinicId, priceId, ... }
2. Validate: thiếu doctorId/contentHTML/contentMarkdown → errCode: 1
3. Kiểm tra user có phải BS (roleId = R2) → nếu không → errCode: 3
4. Tìm Doctor_Info theo doctorId:
   - Đã có → UPDATE (cập nhật tất cả fields)
   - Chưa có → CREATE (tạo mới)
5. Trả: { errCode: 0, message: "Lưu thông tin bác sĩ thành công!" }
```

### API 9: `DELETE /api/delete-doctor-info` — Xóa hồ sơ BS

**Route:** 🔒 Admin only

```
1. Nhận body: { doctorId }
2. Tìm Doctor_Info, không thấy → errCode: 3
3. db.Doctor_Info.destroy()
```

---

## F.4 – SCHEDULE MANAGEMENT (3 APIs)

### API 10: `POST /api/bulk-create-schedule` — Tạo lịch khám hàng loạt

**Route:** 🔒 Admin only

```
1. Nhận body: { arrSchedule: [{ doctorId, date, timeType }, ...] }
2. Validate: mảng rỗng → errCode: 1
3. Gán mặc định: maxNumber = 10, currentNumber = 0
4. Tìm lịch đã tồn tại (cùng doctorId + date)
5. Lọc ra những khung giờ chưa có → chỉ tạo mới cái chưa tồn tại
6. db.Schedule.bulkCreate(toCreate)
7. Trả: { errCode: 0, message: "Tạo 3 lịch khám thành công!" }
```

### API 11: `DELETE /api/delete-schedule` — Xóa lịch khám

**Route:** 🔒 Admin only

```
1. Nhận body: { doctorId, date, timeType }
2. Tìm schedule tương ứng, không thấy → errCode: 3
3. ⚠️ Nếu currentNumber > 0 (đã có BN đặt) → errCode: 2 "Không thể xóa"
4. Nếu chưa ai đặt → db.Schedule.destroy()
```

### API 12: `GET /api/get-schedule-by-date?doctorId=X&date=Y` — Lịch khám theo ngày

**Route:** Public

```
1. Nhận query: doctorId, date
2. db.Schedule.findAll({ where: { doctorId, date }, include: timeTypeData })
3. Filter: chỉ trả khung giờ CÒN CHỖ (currentNumber < maxNumber)
4. Trả: [{ timeType: "T1", timeTypeData: { valueVi: "8:00 - 9:00" }, maxNumber: 10, currentNumber: 3 }, ...]
```

---

## F.5 – PATIENT BOOKING (2 APIs)

### API 13: `POST /api/patient-book-appointment` — Đặt lịch khám

**Route:** Public

```
1. Nhận body: { email, fullName, doctorId, date, timeType, phoneNumber, gender, address, birthday, reason, doctorName, timeString, dateString, language }

2. VALIDATE:
   - Thiếu field bắt buộc → errCode: 1
   - Email sai format (regex) → errCode: 1 "Email không đúng định dạng"
   - SĐT không phải 10-11 số → errCode: 1 "SĐT không hợp lệ"

3. KIỂM TRA LỊCH:
   - Tìm Schedule(doctorId, date, timeType)
   - Không tìm thấy → errCode: 3 "Khung giờ không tồn tại"
   - currentNumber >= maxNumber → errCode: 4 "Hết chỗ"

4. TẠO TOKEN: uuid v4 (cho link xác thực email)

5. TÌM/TẠO BỆNH NHÂN:
   - db.User.findOrCreate({ where: { email } })
   - Nếu chưa có → tạo user mới với roleId = 'R3'

6. CHECK TRÙNG:
   - Tìm Booking(doctorId, patientId, date, timeType)
   - Nếu đã có → errCode: 2 "Đã đặt lịch này rồi"

7. TẠO BOOKING:
   - db.Booking.create({ statusId: 'S1', ... })  ← Trạng thái S1 (Mới)

8. TĂNG SỐ LƯỢNG:
   - Schedule.increment('currentNumber', +1)

9. GỬI EMAIL:
   - Tạo link: http://localhost:3000/verify-booking?token=xxx&doctorId=y
   - Gọi emailService.sendEmailBooking()

10. Trả: { errCode: 0, message: "Đặt lịch thành công! Vui lòng kiểm tra email." }
```

### API 14: `POST /api/verify-book-appointment` — Xác nhận lịch qua email

**Route:** Public

```
1. Nhận body: { token, doctorId }
2. Tìm Booking có token + doctorId + statusId = 'S1'
3. Không thấy → errCode: 3 "Đã xác nhận hoặc không tồn tại"
4. Cập nhật: booking.statusId = 'S2'  ← STATE: S1 → S2
5. Trả: { errCode: 0, message: "Xác nhận thành công!" }
```

---

## F.6 – DOCTOR DASHBOARD (4 APIs)

### API 15: `GET /api/get-list-patient-for-doctor?doctorId=X&date=Y&statusId=S2` — Danh sách BN

**Route:** 🔒 Doctor only (R2)

```
1. Nhận query: doctorId, date, statusId (mặc định 'S2' nếu không gửi)
2. Nếu statusId = 'ALL' → không filter theo trạng thái
3. db.Booking.findAll({
     where: { doctorId, date, statusId },
     include: [
       patientData: { email, firstName, lastName, address, gender, phone }
         → genderData: { valueVi, valueEn }
       timeTypeBooking: { valueVi, valueEn }
     ]
   })
4. Trả: danh sách booking kèm thông tin BN
```

### API 16: `POST /api/send-remedy` — Gửi kết quả khám (S2→S3)

**Route:** 🔒 Doctor only

```
1. Nhận body: { email, doctorId, patientId, imageBase64, doctorName, language }
2. Tìm Booking(doctorId, patientId, statusId='S2')
3. Cập nhật: booking.statusId = 'S3'  ← STATE: S2 → S3 (Đã khám xong)
4. Gọi emailService.sendEmailRemedy():
   - Gửi email kèm file đính kèm (ảnh base64 → PNG)
5. Trả: { errCode: 0, message: "Gửi kết quả khám thành công!" }
```

### API 17: `POST /api/cancel-booking` — Hủy lịch hẹn (S2→S4)

**Route:** 🔒 Doctor only

```
1. Nhận body: { bookingId }
2. Tìm Booking(id=bookingId, statusId='S2')
3. Không thấy → errCode: 3
4. Cập nhật: booking.statusId = 'S4'  ← STATE: S2 → S4 (Đã hủy)
5. Giảm Schedule.currentNumber (-1) → mở lại slot cho BN khác
6. Trả: { errCode: 0, message: "Hủy lịch hẹn thành công!" }
```

### API 18: `GET /api/get-patient-booking-history?patientId=X` — Lịch sử booking

**Route:** 🔒 Doctor only

```
1. Nhận query: patientId
2. db.Booking.findAll({
     where: { patientId },
     include: doctorBookingData + timeTypeBooking,
     order: [['createdAt', 'DESC']]
   })
3. Trả: tất cả lịch hẹn (S1-S4) của bệnh nhân, mới nhất trước
```

---

## F.7 – SPECIALTY MANAGEMENT (5 APIs)

### API 19: `POST /api/create-new-specialty` — Tạo chuyên khoa

**Route:** 🔒 Admin only

```
1. Nhận body: { name, imageBase64, descriptionHTML, descriptionMarkdown }
2. Validate tên → errCode: 1
3. db.Specialty.create(...)
```

### API 20: `GET /api/get-all-specialty` — Danh sách chuyên khoa

**Route:** Public

```
db.Specialty.findAll() → trả tất cả
```

### API 21: `GET /api/get-detail-specialty-by-id?id=X&location=ALL` — Chi tiết chuyên khoa

**Route:** Public

```
1. Tìm Specialty by id
2. Tìm Doctor_Info theo specialtyId
3. Nếu location !== 'ALL' → filter thêm theo provinceId (ví dụ: PRO1 = Hà Nội)
4. Trả: { specialty info, doctorList: [2, 5, 7] }  ← danh sách doctorId
```

### API 22: `PUT /api/edit-specialty` — Sửa chuyên khoa

**Route:** 🔒 Admin only

```
1. Nhận body: { id, name, imageBase64, descriptionHTML, descriptionMarkdown }
2. Tìm specialty, không thấy → errCode: 3
3. Cập nhật: giữ giá trị cũ nếu không gửi mới
4. specialty.save()
```

### API 23: `DELETE /api/delete-specialty` — Xóa chuyên khoa

**Route:** 🔒 Admin only

```
1. Nhận body: { id }
2. Tìm, không thấy → errCode: 3
3. db.Specialty.destroy()
```

---

## F.8 – CLINIC MANAGEMENT (5 APIs)

### API 24: `POST /api/create-new-clinic` — Tạo phòng khám

**Route:** 🔒 Admin only

```
1. Nhận body: { name, address, imageBase64, descriptionHTML, descriptionMarkdown }
2. Validate name + address → errCode: 1
3. db.Clinic.create(...)
```

### API 25: `GET /api/get-all-clinic` — Danh sách phòng khám

**Route:** Public

```
db.Clinic.findAll() → trả tất cả
```

### API 26: `GET /api/get-detail-clinic-by-id?id=X` — Chi tiết phòng khám

**Route:** Public

```
1. Tìm Clinic by id
2. Tìm Doctor_Info theo clinicId
3. Trả: { clinic info, doctorList: [2, 5] }  ← BS thuộc phòng khám này
```

### API 27: `PUT /api/edit-clinic` — Sửa phòng khám

**Route:** 🔒 Admin only

```
1. Nhận body: { id, name, address, imageBase64, ... }
2. Tìm clinic, không thấy → errCode: 3
3. Cập nhật fields, giữ giá trị cũ nếu không gửi mới
4. clinic.save()
```

### API 28: `DELETE /api/delete-clinic` — Xóa phòng khám

**Route:** 🔒 Admin only

```
1. Nhận body: { id }
2. Tìm, không thấy → errCode: 3
3. db.Clinic.destroy()
```

---

## F.9 – ALLCODE + SEARCH (2 APIs)

### API 29: `GET /api/allcode?type=TIME` — Lấy dữ liệu tra cứu

**Route:** Public

```
1. Nhận query: type (ROLE, GENDER, TIME, STATUS, POSITION, PRICE, PAYMENT, PROVINCE)
2. db.Allcode.findAll({ where: { type } })
3. Ví dụ type=TIME → 8 records T1-T8
```

### API 30: `GET /api/search?keyword=tim` — Tìm kiếm

**Route:** Public

```
1. Nhận query: keyword
2. Tìm BS: User.findAll({ where: { roleId: 'R2', Op.or: [firstName LIKE %keyword%, lastName LIKE %keyword%] } })
3. Tìm Chuyên khoa: Specialty.findAll({ where: { name LIKE %keyword% } })
4. Tìm Phòng khám: Clinic.findAll({ where: { name LIKE %keyword% OR address LIKE %keyword% } })
5. Trả: { doctors: [...], specialties: [...], clinics: [...] }
```

---

# PHẦN G – TEST BẰNG POSTMAN

## Bảng test 30 APIs

### G.1 – Các API Public (test ngay, không cần token)

| #   | Method | URL                                              | Body/Params                                            | Kết quả mong đợi                  |
| --- | ------ | ------------------------------------------------ | ------------------------------------------------------ | --------------------------------- |
| 1   | GET    | `localhost:8080/`                                | —                                                      | "BookingCare Backend is running!" |
| 2   | POST   | `localhost:8080/api/login`                       | `{"email":"admin@bookingcare.vn","password":"123456"}` | errCode: 0 + accessToken          |
| 3   | GET    | `localhost:8080/api/allcode?type=TIME`           | —                                                      | 8 records T1-T8                   |
| 4   | GET    | `localhost:8080/api/allcode?type=ROLE`           | —                                                      | 3 records R1-R3                   |
| 5   | GET    | `localhost:8080/api/allcode?type=STATUS`         | —                                                      | 4 records S1-S4                   |
| 6   | GET    | `localhost:8080/api/allcode?type=PRICE`          | —                                                      | 6 records PRI1-PRI6               |
| 7   | GET    | `localhost:8080/api/get-top-doctor-home?limit=5` | —                                                      | Danh sách BS (rỗng nếu chưa tạo)  |
| 8   | GET    | `localhost:8080/api/get-all-specialty`           | —                                                      | Danh sách chuyên khoa (rỗng)      |
| 9   | GET    | `localhost:8080/api/get-all-clinic`              | —                                                      | Danh sách phòng khám (rỗng)       |
| 10  | GET    | `localhost:8080/api/search?keyword=tim`          | —                                                      | Kết quả tìm kiếm                  |

### G.2 – Các API Admin (cần token từ login)

**Cách gửi token:** Trong Postman → Tab **Headers** → thêm:

```
Key:   Authorization
Value: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  ← Paste token từ login
```

| #   | Method | URL                         | Body                                                                                                                                                             | Mô tả            |
| --- | ------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 11  | GET    | `/api/get-all-users?id=ALL` | —                                                                                                                                                                | Xem tất cả users |
| 12  | POST   | `/api/create-new-user`      | `{"email":"bs1@test.com","password":"123456","firstName":"Nguyễn","lastName":"Văn A","roleId":"R2","positionId":"P3","gender":"G1"}`                             | Tạo bác sĩ mới   |
| 13  | PUT    | `/api/edit-user`            | `{"id":2,"firstName":"Trần"}`                                                                                                                                    | Sửa tên          |
| 14  | DELETE | `/api/delete-user`          | `{"id":2}`                                                                                                                                                       | Xóa user         |
| 15  | POST   | `/api/save-info-doctor`     | `{"doctorId":2,"contentHTML":"<p>Giới thiệu</p>","contentMarkdown":"# GT","specialtyId":1,"clinicId":1,"priceId":"PRI2","paymentId":"PAY1","provinceId":"PRO2"}` | Lưu hồ sơ BS     |
| 16  | DELETE | `/api/delete-doctor-info`   | `{"doctorId":2}`                                                                                                                                                 | Xóa hồ sơ BS     |
| 17  | POST   | `/api/bulk-create-schedule` | `{"arrSchedule":[{"doctorId":2,"date":"1741046400000","timeType":"T1"},{"doctorId":2,"date":"1741046400000","timeType":"T2"}]}`                                  | Tạo lịch BS      |
| 18  | DELETE | `/api/delete-schedule`      | `{"doctorId":2,"date":"1741046400000","timeType":"T1"}`                                                                                                          | Xóa lịch         |
| 19  | POST   | `/api/create-new-specialty` | `{"name":"Tim mạch","descriptionHTML":"<p>Mô tả</p>","descriptionMarkdown":"# Mô tả"}`                                                                           | Tạo chuyên khoa  |
| 20  | PUT    | `/api/edit-specialty`       | `{"id":1,"name":"Tim mạch (cập nhật)"}`                                                                                                                          | Sửa chuyên khoa  |
| 21  | DELETE | `/api/delete-specialty`     | `{"id":1}`                                                                                                                                                       | Xóa chuyên khoa  |
| 22  | POST   | `/api/create-new-clinic`    | `{"name":"PK ABC","address":"123 Đường X","descriptionHTML":"<p>Mô tả</p>","descriptionMarkdown":"# Mô tả"}`                                                     | Tạo phòng khám   |
| 23  | PUT    | `/api/edit-clinic`          | `{"id":1,"name":"PK ABC (cập nhật)"}`                                                                                                                            | Sửa PK           |
| 24  | DELETE | `/api/delete-clinic`        | `{"id":1}`                                                                                                                                                       | Xóa PK           |

### G.3 – Quy trình test đặt lịch (từ đầu đến cuối)

**Bước 1:** Tạo BS + Hồ sơ + Lịch khám (dùng token Admin)

```
POST /api/create-new-user         → Tạo BS (roleId: "R2")
POST /api/create-new-specialty    → Tạo chuyên khoa
POST /api/create-new-clinic       → Tạo phòng khám
POST /api/save-info-doctor        → Gán hồ sơ cho BS
POST /api/bulk-create-schedule    → Tạo lịch khám
```

**Bước 2:** Bệnh nhân đặt lịch (Public, không cần token)

```
POST /api/patient-book-appointment
Body: {
  "email": "patient@test.com",
  "fullName": "Lê Văn B",
  "gender": "G1",
  "phoneNumber": "0901234567",
  "doctorId": 2,
  "date": "1741046400000",
  "timeType": "T1",
  "doctorName": "BS. Nguyễn Văn A",
  "timeString": "8:00 - 9:00",
  "dateString": "08/03/2026",
  "language": "vi"
}
→ errCode: 0 "Đặt lịch thành công!"
→ Email được gửi đến patient@test.com (nếu đã cấu hình email)
```

**Bước 3:** Xác nhận lịch (giả lập BN click email)

```
POST /api/verify-book-appointment
Body: { "token": "<uuid từ DB bảng Bookings>", "doctorId": 2 }
→ errCode: 0
→ Booking: S1 → S2
```

**Bước 4:** Login BS → Xem + Gửi kết quả (token Doctor)

```
POST /api/login → {"email":"bs1@test.com","password":"123456"} → lấy token BS

GET /api/get-list-patient-for-doctor?doctorId=2&date=1741046400000
→ Danh sách BN đã xác nhận (S2)

POST /api/send-remedy
Body: { "email": "patient@test.com", "doctorId": 2, "patientId": 3, "imageBase64": "data:image/png;base64,..." }
→ Booking: S2 → S3
→ Email gửi kèm file đính kèm
```

**Hoặc Bước 4b:** Hủy lịch

```
POST /api/cancel-booking
Body: { "bookingId": 1 }
→ Booking: S2 → S4
→ Schedule.currentNumber giảm 1
```

---

_Tài liệu Backend BookingCare – v2.0 – 08/03/2026_
