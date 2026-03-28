# 🛠️ HƯỚNG DẪN SỬA LỖI BACKEND – BOOKINGCARE (TOÀN BỘ)
> **Tổng hợp từ 2 đợt audit | Ngày: 21/03/2026**
> **Cách dùng:** Đọc từng lỗi → mở file → thay code chính xác → test lại.

---

# 🔴 NHÓM 1 – SỬA NGAY (Chức năng đang hoạt động SAI hoặc THIẾU)

---

## L1 – `handleEditUser` bỏ qua `req.params.id`
**📌 File:** `src/controllers/userController.js` — hàm `handleEditUser`

**❌ Vấn đề:** Route `PUT /api/v1/users/:id` nhưng controller chỉ truyền `req.body` xuống Service, không lấy `:id` từ URL. Nếu Frontend không gửi `id` trong body thì Service báo "Thiếu id" và không sửa được gì.

**✅ Code thay thế:**
```javascript
const handleEditUser = async (req, res) => {
  try {
    const data = { ...req.body, id: req.params.id }; // ✅ FIX: merge params.id
    const result = await userService.editUser(data);
    const statusMap = { 0: 200, 1: 400, 3: 404 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> handleEditUser error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};
```

---

## L2 – `handleDeleteUser` lấy `id` từ `req.body` thay vì `req.params`
**📌 File:** `src/controllers/userController.js` — hàm `handleDeleteUser`

**❌ Vấn đề:** Route `DELETE /api/v1/users/:id`. Chuẩn REST: ID xóa phải lấy từ URL. Hiện tại dùng `const { id } = req.body` — DELETE request thường không có body, luôn báo "Thiếu id".

**✅ Code thay thế:**
```javascript
const handleDeleteUser = async (req, res) => {
  try {
    const id = req.params.id; // ✅ FIX: lấy từ URL
    if (!id) return res.status(400).json({ errCode: 1, message: 'Thiếu tham số id!' });
    const result = await userService.deleteUser(id, req.user.id); // truyền requesterId để guard
    const statusMap = { 0: 200, 3: 404, 5: 400, 6: 409 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> handleDeleteUser error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};
```

---

## L3 – `editSpecialty` controller bỏ qua `req.params.id`
**📌 File:** `src/controllers/specialtyController.js` — hàm `editSpecialty`

**❌ Vấn đề:** Route `PUT /api/v1/specialties/:id`. Controller truyền `req.body` → Service nhận `data.id = undefined` → luôn báo "Thiếu id". Chức năng Edit Chuyên Khoa **không hoạt động**.

**✅ Code thay thế:**
```javascript
const editSpecialty = async (req, res) => {
  try {
    const data = { ...req.body, id: req.params.id }; // ✅ FIX
    const result = await specialtyService.editSpecialty(data);
    const statusMap = { 0: 200, 1: 400, 3: 404 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> editSpecialty error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};
```
> **Đồng thời sửa statusMap của `createSpecialty`:**
> ```javascript
> const statusMap = { 0: 201, 1: 400, 2: 409, 3: 404 }; // thêm 2: 409 Conflict
> ```

---

## L4 – `editClinic` controller bỏ qua `req.params.id`
**📌 File:** `src/controllers/clinicController.js` — hàm `editClinic`

**❌ Vấn đề:** Hoàn toàn như L3. Route `PUT /api/v1/clinics/:id` nhưng `id` không được truyền xuống.

**✅ Code thay thế:**
```javascript
const editClinic = async (req, res) => {
  try {
    const data = { ...req.body, id: req.params.id }; // ✅ FIX
    const result = await clinicService.editClinic(data);
    const statusMap = { 0: 200, 1: 400, 3: 404 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> editClinic error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};
```
> **Đồng thời sửa statusMap của `createClinic`:**
> ```javascript
> const statusMap = { 0: 201, 1: 400, 2: 409, 3: 404 };
> ```

---

## L5 – `cancelBooking` controller không truyền `bookingId` từ `req.params`
**📌 File:** `src/controllers/doctorController.js` — hàm `cancelBooking`

**❌ Vấn đề:** Route `PATCH /api/v1/bookings/:bookingId/cancel`. Controller chỉ truyền `req.body` xuống. Service check `if (!data.bookingId)` → nếu FE không gửi trong body thì không bao giờ hủy được.

**✅ Code thay thế:**
```javascript
const cancelBooking = async (req, res) => {
  try {
    const data = { ...req.body, bookingId: req.params.bookingId }; // ✅ FIX
    const result = await doctorService.cancelBooking(data);
    const statusMap = { 0: 200, 1: 400, 3: 404 };
    const httpStatus = statusMap[result.errCode] || 500;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> cancelBooking error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};
```

---

## L6 – `sendRemedy` controller không truyền `bookingId` từ `req.params`
**📌 File:** `src/controllers/doctorController.js` — hàm `sendRemedy`

**❌ Vấn đề:** Route `POST /api/v1/bookings/:bookingId/remedy`. `bookingId` từ URL bị bỏ qua → Service tìm booking theo `doctorId+patientId` gây nhầm lẫn (lỗi L10 bên dưới).

**✅ Code thay thế:**
```javascript
const sendRemedy = async (req, res) => {
  try {
    const data = { ...req.body, bookingId: req.params.bookingId }; // ✅ FIX
    const result = await doctorService.sendRemedy(data);
    const httpStatus = result.errCode === 0 ? 200 : 400;
    return res.status(httpStatus).json(result);
  } catch (err) {
    console.error('>>> sendRemedy error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};
```

---

## L7 – Mật khẩu bệnh nhân lưu plain-text `'patient_default'`
**📌 File:** `src/services/patientService.js` — hàm `postBookAppointment` (dòng ~42–54)

**❌ Vấn đề:** Khi bệnh nhân đặt lịch lần đầu, hệ thống tự tạo tài khoản với `password: 'patient_default'` lưu thẳng vào DB. `bcrypt.compare('patient_default', 'patient_default_in_db')` sẽ **luôn trả `false`** vì DB không lưu hash — bệnh nhân không đăng nhập được bao giờ.

**✅ Code thay thế** (thêm ở đầu file nếu chưa có: `const bcrypt = require('bcryptjs');`):
```javascript
// Trong hàm postBookAppointment, thay khối findOrCreate:

// ✅ FIX: hash mật khẩu trước khi lưu
const salt = await bcrypt.genSalt(10);
const hashedDefaultPassword = await bcrypt.hash('patient_default', salt);

const [patient] = await db.User.findOrCreate({
  where: { email: data.email.trim().toLowerCase() },
  defaults: {
    email: data.email.trim().toLowerCase(),
    password: hashedDefaultPassword, // ✅ đã hash
    firstName: data.fullName,
    lastName: '',
    roleId: 'R3',
    gender: data.gender || '',
    address: data.address || '',
    phoneNumber: data.phoneNumber || '',
  },
});
```

---

## L8 – Check đặt lịch trùng không loại trừ booking đã hủy (S4)
**📌 File:** `src/services/patientService.js` — hàm `postBookAppointment` (dòng ~57–67)

**❌ Vấn đề:** `findOne` không có điều kiện `statusId`. Bệnh nhân từng đặt lịch rồi hủy (S4) → vẫn bị báo "Bạn đã đặt lịch này rồi!" → không thể đặt lại bao giờ.

**✅ Code thay thế:**
```javascript
const { Op } = require('sequelize'); // thêm ở đầu file nếu chưa có

const existBooking = await db.Booking.findOne({
  where: {
    doctorId: data.doctorId,
    patientId: patient.id,
    date: data.date,
    timeType: data.timeType,
    statusId: { [Op.ne]: 'S4' }, // ✅ FIX: loại trừ booking đã hủy
  },
});
if (existBooking) {
  return { errCode: 2, message: 'Bạn đã đặt lịch này rồi!' };
}
```

---

## L9 – `bulkCreateSchedule` chỉ check trùng theo ngày đầu tiên
**📌 File:** `src/services/doctorService.js` — hàm `bulkCreateSchedule` (dòng ~138–146)

**❌ Vấn đề:** `where: { doctorId: schedules[0].doctorId, date: schedules[0].date }` — chỉ check trùng Ngày 1. Nếu Admin gửi lịch cho 3 ngày cùng lúc, Ngày 2+3 không được check → tạo trùng lặp vô hạn.

**✅ Code thay thế** (thay toàn bộ hàm `bulkCreateSchedule`):
```javascript
const bulkCreateSchedule = async (data) => {
  try {
    if (!data.arrSchedule || !Array.isArray(data.arrSchedule) || data.arrSchedule.length === 0) {
      return { errCode: 1, message: 'Thiếu dữ liệu lịch khám!' };
    }
    const { Op } = require('sequelize');
    const schedules = data.arrSchedule.map(item => ({
      ...item,
      maxNumber: item.maxNumber || 10,
      currentNumber: 0,
    }));

    // ✅ FIX: lấy TẤT CẢ ngày trong mảng để check trùng
    const allDates = [...new Set(schedules.map(s => s.date))];
    const doctorId = schedules[0].doctorId;

    const existing = await db.Schedule.findAll({
      where: {
        doctorId: doctorId,
        date: { [Op.in]: allDates }, // ✅ check tất cả ngày
      },
      attributes: ['timeType', 'doctorId', 'date'],
      raw: true,
    });

    const toCreate = schedules.filter(s =>
      !existing.find(e => e.timeType === s.timeType && e.date === s.date)
    );

    if (toCreate.length > 0) {
      await db.Schedule.bulkCreate(toCreate);
    }
    return { errCode: 0, message: `Tạo ${toCreate.length} lịch khám thành công!` };
  } catch (err) {
    console.error('>>> bulkCreateSchedule error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};
```

---

## L10 – `sendRemedy` service tìm booking không chính xác
**📌 File:** `src/services/doctorService.js` — hàm `sendRemedy` (dòng ~240–257)

**❌ Vấn đề:** Tìm bằng `{ doctorId, patientId, statusId: 'S2' }`. Nếu bệnh nhân có 2 lịch S2 với cùng bác sĩ → `findOne` lấy bừa cái đầu tiên → gửi kết quả khám nhầm.

**✅ Code thay thế** (thay toàn bộ hàm `sendRemedy`):
```javascript
const sendRemedy = async (data) => {
  const t = await db.sequelize.transaction(); // ✅ Transaction để đảm bảo ACID
  try {
    if (!data.email || !data.bookingId || !data.imageBase64) {
      await t.rollback();
      return { errCode: 1, message: 'Thiếu tham số bắt buộc (email, bookingId, imageBase64)!' };
    }

    // ✅ FIX: tìm chính xác theo bookingId
    const booking = await db.Booking.findOne({
      where: { id: data.bookingId, statusId: 'S2' },
      transaction: t,
      raw: false,
    });
    if (!booking) {
      await t.rollback();
      return { errCode: 3, message: 'Không tìm thấy lịch hẹn hoặc lịch chưa được xác nhận!' };
    }

    // State Machine: S2 → S3 (trong transaction)
    booking.statusId = 'S3';
    await booking.save({ transaction: t });

    // Gửi email (nếu lỗi → rollback về S2)
    await emailService.sendEmailRemedy({
      email: data.email,
      imageBase64: data.imageBase64,
      doctorName: data.doctorName || 'Bác sĩ',
      language: data.language || 'vi',
    });

    await t.commit(); // ✅ Cả 2 thành công → commit
    return { errCode: 0, message: 'Gửi kết quả khám thành công!' };
  } catch (err) {
    await t.rollback(); // ✅ Email lỗi → DB hoàn tác về S2
    console.error('>>> sendRemedy error:', err);
    return { errCode: -1, message: 'Gửi email thất bại! Dữ liệu đã được hoàn tác.' };
  }
};
```

---

## L11 – `getDetailDoctorById` không check `roleId: 'R2'`
**📌 File:** `src/services/doctorService.js` — hàm `getDetailDoctorById` (dòng ~30–31)

**❌ Vấn đề:** `findOne({ where: { id } })` không lọc role. Truyền ID của Admin/Patient vào `GET /api/v1/doctors/:id` → hệ thống trả đầy đủ thông tin cá nhân của họ — lỗ hổng data exposure.

**✅ Code thay thế** (chỉ sửa điều kiện `findOne`):
```javascript
const doctor = await db.User.findOne({
  where: { id, roleId: 'R2' }, // ✅ FIX: chỉ trả bác sĩ
  attributes: { exclude: ['password'] },
  include: [
    { model: db.Allcode, as: 'positionData', attributes: ['valueVi', 'valueEn'] },
    {
      model: db.Doctor_Info, as: 'doctorInfoData',
      include: [
        { model: db.Allcode, as: 'priceData', attributes: ['valueVi', 'valueEn'] },
        { model: db.Allcode, as: 'paymentData', attributes: ['valueVi', 'valueEn'] },
        { model: db.Allcode, as: 'provinceData', attributes: ['valueVi', 'valueEn'] },
        { model: db.Specialty, as: 'specialtyData', attributes: ['name'] },
        { model: db.Clinic, as: 'clinicData', attributes: ['name', 'address'] },
      ],
    },
  ],
  raw: false,
  nest: true,
});
if (!doctor) return { errCode: 3, message: 'Không tìm thấy bác sĩ!' };
```

---

## L12 – `deleteUser` không có guard: Admin tự xóa + bác sĩ đang có booking
**📌 File:** `src/services/userService.js` — hàm `deleteUser` (dòng ~120–132)

**❌ Vấn đề:**
- Admin có thể vô tình tự xóa chính mình → mất quyền Admin vĩnh viễn.
- Xóa bác sĩ đang có 10 lịch hẹn S2 → bệnh nhân đến tái hỏa.

**✅ Code thay thế** (thay toàn bộ hàm và sửa signature để nhận `requesterId`):
```javascript
// Controller handleDeleteUser đã sửa ở L2, truyền req.user.id sang:
// await userService.deleteUser(id, req.user.id);

const deleteUser = async (id, requesterId) => {
  try {
    // ✅ Guard 1: Admin không tự xóa chính mình
    if (String(id) === String(requesterId)) {
      return { errCode: 5, message: 'Không thể tự xóa tài khoản của chính mình!' };
    }

    const user = await db.User.findOne({ where: { id } });
    if (!user) return { errCode: 3, message: 'Không tìm thấy người dùng!' };

    // ✅ Guard 2: Không xóa bác sĩ đang có lịch hẹn chưa xử lý
    if (user.roleId === 'R2') {
      const { Op } = require('sequelize');
      const activeBooking = await db.Booking.findOne({
        where: { doctorId: id, statusId: { [Op.in]: ['S1', 'S2'] } },
      });
      if (activeBooking) {
        return { errCode: 6, message: 'Bác sĩ đang có lịch hẹn chưa hoàn thành, không thể xóa!' };
      }
    }

    await db.User.destroy({ where: { id } });
    return { errCode: 0, message: 'Xóa người dùng thành công!' };
  } catch (err) {
    console.error('>>> deleteUser error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};
```

---

## L13 – Thiếu check trùng tên khi tạo Chuyên Khoa / Phòng Khám
**📌 File 1:** `src/services/specialtyService.js` — hàm `createSpecialty`
**📌 File 2:** `src/services/clinicService.js` — hàm `createClinic`

**❌ Vấn đề:** Admin nhấn "Tạo" 3 lần → 3 chuyên khoa/phòng khám y hệt nhau → dữ liệu rác.

**✅ `createSpecialty` hoàn chỉnh:**
```javascript
const createSpecialty = async (data) => {
  try {
    if (!data.name?.trim()) {
      return { errCode: 1, message: 'Thiếu tên chuyên khoa!' };
    }
    // ✅ FIX: check trùng tên
    const exist = await db.Specialty.findOne({ where: { name: data.name.trim() } });
    if (exist) return { errCode: 2, message: 'Chuyên khoa này đã tồn tại!' };

    await db.Specialty.create({
      name: data.name.trim(),
      image: data.imageBase64 || '',
      descriptionHTML: data.descriptionHTML || '',
      descriptionMarkdown: data.descriptionMarkdown || '',
    });
    return { errCode: 0, message: 'Tạo chuyên khoa thành công!' };
  } catch (err) {
    console.error('>>> createSpecialty error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};
```

**✅ `createClinic` hoàn chỉnh:**
```javascript
const createClinic = async (data) => {
  try {
    if (!data.name?.trim() || !data.address?.trim()) {
      return { errCode: 1, message: 'Thiếu tên hoặc địa chỉ phòng khám!' };
    }
    // ✅ FIX: check trùng tên
    const exist = await db.Clinic.findOne({ where: { name: data.name.trim() } });
    if (exist) return { errCode: 2, message: 'Phòng khám này đã tồn tại!' };

    await db.Clinic.create({
      name: data.name.trim(),
      address: data.address.trim(),
      image: data.imageBase64 || '',
      descriptionHTML: data.descriptionHTML || '',
      descriptionMarkdown: data.descriptionMarkdown || '',
    });
    return { errCode: 0, message: 'Tạo phòng khám thành công!' };
  } catch (err) {
    console.error('>>> createClinic error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};
```

---

## L14 – `saveInfoDoctor` không validate `specialtyId`/`clinicId` tồn tại
**📌 File:** `src/services/doctorService.js` — hàm `saveInfoDoctor` (dòng ~66–107)

**❌ Vấn đề:** Admin nhập `specialtyId: 9999` không tồn tại → DB lưu thành công (không có FK constraint), Frontend query ra lỗi vì JOIN bị null.

**✅ Thêm validation sau khi check `user.roleId`:**
```javascript
// Thêm TRƯỚC khối if (doctorInfo) { ... }
if (data.specialtyId) {
  const specialty = await db.Specialty.findByPk(data.specialtyId);
  if (!specialty) return { errCode: 4, message: 'Chuyên khoa không tồn tại!' };
}
if (data.clinicId) {
  const clinic = await db.Clinic.findByPk(data.clinicId);
  if (!clinic) return { errCode: 5, message: 'Phòng khám không tồn tại!' };
}
```

---

## L15 – Facebook Webhook Endpoint (SRS 3.15 – Chatbot Messenger)
**📌 File:** `src/routes/web.js` (cần thêm route)

> ⏳ **CHƯA CẦN LÀM BÂY GIỜ** — Theo đề cương chi tiết, Facebook Social Plugin + Chatbot Messenger thuộc **Giai đoạn 9 (13/05 – 19/05/2026)**. Hiện tại (21/03) bạn đang ở Giai đoạn 5 (Frontend cơ bản). Lưu lại để làm sau.
>
> **Facebook Like/Share button** → Chỉ cần nhúng Facebook JavaScript SDK ở **Frontend**, không cần Backend.
>
> **Chatbot Messenger Webhook** → Cần Backend, làm ở Giai đoạn 9.

**❌ Vấn đề:** SRS Section 3.15 và Proposal yêu cầu tích hợp Facebook Messenger Chatbot với Webhook. Backend hiện tại **không có bất kỳ route nào** xử lý Webhook → Chatbot không hoạt động.

**✅ Thêm vào cuối `web.js` trước `};`:**
```javascript
// ===== FACEBOOK MESSENGER WEBHOOK (SRS 3.15) =====

// GET: Facebook verify webhook khi cấu hình trên Developer Portal
app.get('/api/v1/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('>>> Facebook Webhook verified!');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// POST: Nhận tin nhắn từ người dùng Messenger
app.post('/api/v1/webhook', (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    body.entry && body.entry.forEach(entry => {
      entry.messaging && entry.messaging.forEach(event => {
        if (event.message && event.message.text) {
          console.log('>>> Messenger msg:', event.message.text, 'from:', event.sender.id);
          // TODO: Gọi Facebook Graph API để reply tự động
        }
      });
    });
    return res.sendStatus(200); // Phải trả 200 trong 20s hoặc Facebook retry
  }
  return res.sendStatus(404);
});
```
**Thêm vào `.env`:**
```
FB_VERIFY_TOKEN=your_custom_verify_token_here
```

---

# 🟡 NHÓM 2 – SỬA SAU (Bảo mật & Hiệu năng quan trọng)

---

## L16 – `bcrypt.hashSync` chặn Event Loop Node.js
**📌 File:** `src/services/userService.js` — hàm `createNewUser` (dòng ~71)

**❌ Vấn đề:** `hashSync` là đồng bộ, treo server vài chục ms. Spam 100 req/s sẽ làm server treo hoàn toàn.

**✅ Sửa đầu file và hàm `createNewUser`:**
```javascript
// Xóa: const salt = bcrypt.genSaltSync(10);
// Thay bằng:
const SALT_ROUNDS = 10;

// Trong createNewUser, thay dòng hashSync:
const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS); // ✅ async
```

---

## L17 – `currentNumber` tăng trước khi bệnh nhân verify email (Hoarding Attack)
**📌 File:** `src/services/patientService.js`

**❌ Vấn đề:** Slot bị trừ ngay lúc S1 (chưa verify). Spam 10 email giả, không mở mail → slot bị giam vĩnh viễn.

**✅ Bước 1 — Xóa `increment` khỏi `postBookAppointment`:**
```javascript
// XÓA ĐOẠN NÀY trong postBookAppointment:
// await db.Schedule.increment('currentNumber', {
//   by: 1,
//   where: { doctorId: data.doctorId, date: data.date, timeType: data.timeType },
// });
```

**✅ Bước 2 — Thêm `increment` vào `postVerifyBookAppointment` sau `booking.save()`:**
```javascript
const postVerifyBookAppointment = async (data) => {
  try {
    if (!data.token || !data.doctorId) {
      return { errCode: 1, message: 'Thiếu tham số!' };
    }
    const booking = await db.Booking.findOne({
      where: { token: data.token, doctorId: data.doctorId, statusId: 'S1' },
      raw: false,
    });
    if (!booking) {
      return { errCode: 3, message: 'Lịch hẹn không tồn tại hoặc đã được xác nhận!' };
    }
    booking.statusId = 'S2'; // S1 → S2
    await booking.save();

    // ✅ FIX: Chỉ tăng slot SAU KHI bệnh nhân xác nhận email
    await db.Schedule.increment('currentNumber', {
      by: 1,
      where: { doctorId: booking.doctorId, date: booking.date, timeType: booking.timeType },
    });
    return { errCode: 0, message: 'Xác nhận lịch hẹn thành công!' };
  } catch (err) {
    console.error('>>> postVerifyBookAppointment error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};
```

---

## L18 – IDOR: Bác sĩ A thao tác dữ liệu của Bác sĩ B
**📌 File:** `src/controllers/doctorController.js`

**❌ Vấn đề:** `checkDoctorRole` chỉ xác nhận "là bác sĩ", nhưng `doctorId` lấy từ `req.params/req.body` → Hacker đăng nhập là bác sĩ, truyền doctorId của người khác → xem/hủy lịch của đồng nghiệp.

**✅ Sửa các hàm `getListPatientForDoctor` và `getPatientBookingHistory`:**
```javascript
// getListPatientForDoctor:
const getListPatientForDoctor = async (req, res) => {
  try {
    const doctorId = req.user.id; // ✅ FIX: lấy từ JWT, không tin req.params
    const { date, statusId } = req.query;
    if (!date) return res.status(400).json({ errCode: 1, message: 'Thiếu tham số date!' });
    const result = await doctorService.getListPatientForDoctor(doctorId, date, statusId);
    return res.status(result.errCode === 0 ? 200 : 500).json(result);
  } catch (err) {
    console.error('>>> getListPatientForDoctor error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

// getPatientBookingHistory:
const getPatientBookingHistory = async (req, res) => {
  try {
    const patientId = req.params.patientId;
    const doctorId = req.user.id; // ✅ FIX: bác sĩ chỉ thấy lịch của chính mình với bệnh nhân này
    if (!patientId) return res.status(400).json({ errCode: 1, message: 'Thiếu patientId!' });
    const result = await doctorService.getPatientBookingHistory(patientId, doctorId);
    return res.status(result.errCode === 0 ? 200 : 500).json(result);
  } catch (err) {
    console.error('>>> getPatientBookingHistory error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};
```

**✅ Đồng thời sửa Service `getPatientBookingHistory` để nhận `doctorId`:**
```javascript
const getPatientBookingHistory = async (patientId, doctorId) => {
  try {
    const bookings = await db.Booking.findAll({
      where: {
        patientId,
        doctorId, // ✅ FIX: chỉ lịch với bác sĩ đang xem
      },
      include: [
        { model: db.User, as: 'doctorBookingData', attributes: ['firstName', 'lastName', 'email'] },
        { model: db.Allcode, as: 'timeTypeBooking', attributes: ['valueVi', 'valueEn'] },
        { model: db.Allcode, as: 'statusData', attributes: ['valueVi', 'valueEn'] },
      ],
      order: [['createdAt', 'DESC']],
    });
    return { errCode: 0, data: bookings };
  } catch (err) {
    console.error('>>> getPatientBookingHistory error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};
```

---

## L19 – Tìm kiếm tên đầy đủ trả rỗng
**📌 File:** `src/services/userService.js` — hàm `searchService` (dòng ~158–161)

**❌ Vấn đề:** `Op.or: [{ firstName: LIKE 'Nguyen Van A' }, { lastName: LIKE 'Nguyen Van A' }]` → không ra kết quả vì không trường nào chứa đủ chuỗi dài đó.

**✅ Code thay thế** (thay phần tìm doctors trong `searchService`):
```javascript
const searchService = async (keyword) => {
  try {
    const { Op } = require('sequelize');
    const likeQuery = { [Op.like]: `%${keyword.trim()}%` };

    // ✅ FIX: nối tên để tìm đầy đủ
    const doctors = await db.User.findAll({
      where: {
        roleId: 'R2',
        [Op.or]: [
          db.Sequelize.where(
            db.Sequelize.fn('concat', db.Sequelize.col('lastName'), ' ', db.Sequelize.col('firstName')),
            { [Op.like]: `%${keyword.trim()}%` }
          ),
          db.Sequelize.where(
            db.Sequelize.fn('concat', db.Sequelize.col('firstName'), ' ', db.Sequelize.col('lastName')),
            { [Op.like]: `%${keyword.trim()}%` }
          ),
        ],
      },
      attributes: ['id', 'firstName', 'lastName', 'image'],
      include: [{ model: db.Allcode, as: 'positionData', attributes: ['valueVi', 'valueEn'] }],
      raw: true,
      nest: true,
    });

    const specialties = await db.Specialty.findAll({
      where: { name: likeQuery },
      attributes: ['id', 'name', 'image'],
    });
    const clinics = await db.Clinic.findAll({
      where: { [Op.or]: [{ name: likeQuery }, { address: likeQuery }] },
      attributes: ['id', 'name', 'address', 'image'],
    });

    return { errCode: 0, data: { doctors, specialties, clinics } };
  } catch (err) {
    console.error('>>> searchService error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};
```

---

## L20 – `createNewUser` dùng `bcrypt.hashSync` (đã bao gồm trong L16)
> Xem L16 ở trên.

---

# ⚪ NHÓM 3 – CẢI THIỆN THÊM (Nice-to-have)

---

## L21 – `getTopDoctorHome` crash khi `limit` là chữ hoặc số âm
**📌 File:** `src/controllers/doctorController.js` — hàm `getTopDoctorHome`

**✅ Code thay thế:**
```javascript
const getTopDoctorHome = async (req, res) => {
  try {
    let limit = parseInt(req.query.limit) || 10; // ✅ parseInt an toàn
    if (limit < 1) limit = 1;
    if (limit > 50) limit = 50;
    const result = await doctorService.getTopDoctorHome(limit);
    return res.status(result.errCode === 0 ? 200 : 500).json(result);
  } catch (err) {
    console.error('>>> getTopDoctorHome error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};
```

---

## L22 – `deleteSchedule` service dùng composite key thay vì `id`
**📌 File:** `src/services/doctorService.js` — hàm `deleteSchedule`

**❌ Vấn đề:** Route `DELETE /schedules/:id` nhưng service check bằng `doctorId+date+timeType`. Nếu FE chỉ có `schedule.id` thì không gọi được.

**✅ Code thay thế:**
```javascript
const deleteSchedule = async (data) => {
  try {
    let schedule;
    if (data.id) {
      schedule = await db.Schedule.findByPk(data.id); // ✅ ưu tiên id
    } else if (data.doctorId && data.date && data.timeType) {
      schedule = await db.Schedule.findOne({
        where: { doctorId: data.doctorId, date: data.date, timeType: data.timeType },
      });
    } else {
      return { errCode: 1, message: 'Thiếu tham số (id hoặc doctorId+date+timeType)!' };
    }
    if (!schedule) return { errCode: 3, message: 'Không tìm thấy lịch khám!' };
    if (schedule.currentNumber > 0) {
      return { errCode: 2, message: `Lịch đã có ${schedule.currentNumber} bệnh nhân, không thể xóa!` };
    }
    await schedule.destroy();
    return { errCode: 0, message: 'Xóa lịch khám thành công!' };
  } catch (err) {
    console.error('>>> deleteSchedule error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};
```

---

## L23 – `cancelBooking` không hủy được Ghost Booking S1
**📌 File:** `src/services/doctorService.js` — hàm `cancelBooking`

**❌ Vấn đề:** Chỉ hủy S2. Booking S1 (bệnh nhân đặt nhưng chưa verify email) chiếm slot mãi mãi.

**✅ Code thay thế** (thay toàn bộ hàm `cancelBooking`):
```javascript
const cancelBooking = async (data) => {
  try {
    if (!data.bookingId) return { errCode: 1, message: 'Thiếu tham số bookingId!' };
    const { Op } = require('sequelize');
    // ✅ FIX: cho phép hủy cả S1 (ghost) và S2 (đã xác nhận)
    const booking = await db.Booking.findOne({
      where: { id: data.bookingId, statusId: { [Op.in]: ['S1', 'S2'] } },
      raw: false,
    });
    if (!booking) return { errCode: 3, message: 'Không tìm thấy lịch hẹn có thể hủy!' };

    const wasConfirmed = booking.statusId === 'S2'; // chỉ giảm slot nếu đã là S2
    booking.statusId = 'S4';
    await booking.save();

    if (wasConfirmed) {
      await db.Schedule.decrement('currentNumber', {
        by: 1,
        where: { doctorId: booking.doctorId, date: booking.date, timeType: booking.timeType },
      });
    }
    return { errCode: 0, message: 'Hủy lịch hẹn thành công!' };
  } catch (err) {
    console.error('>>> cancelBooking error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
};
```

---

## L24 – `bcrypt.compare` crash khi password là số (không phải string)
**📌 File:** `src/services/userService.js` — hàm `handleUserLogin` (dòng ~15)

**✅ Sửa 1 dòng:**
```javascript
const isMatch = await bcrypt.compare(String(password), user.password); // ✅ ép về string
```

---

## L25 – Thiếu `.trim()` trong validation chuỗi
**📌 File:** Tất cả Service files

**❌ Vấn đề:** `if (!data.name)` không bắt được `"   "` (toàn khoảng trắng).

**✅ Nguyên tắc áp dụng toàn bộ:**
```javascript
// Thay tất cả:
if (!data.name)           // ❌
if (!data.name?.trim())   // ✅
```

---

## L26 – `getDetailSpecialtyById` và `getDetailClinicById` trả mảng ID thay vì info đầy đủ
**📌 File:** `specialtyService.js` và `clinicService.js`

**❌ Vấn đề:** FE nhận `doctorList: [1, 3, 7]` → phải gọi N request riêng để lấy thông tin từng bác sĩ → chậm.

**✅ Sửa `getDetailSpecialtyById` — thay khối `doctorInfos`:**
```javascript
const doctorInfos = await db.Doctor_Info.findAll({
  where: whereClause,
  include: [
    {
      model: db.User, as: 'doctorData',
      attributes: ['id', 'firstName', 'lastName', 'image'],
      include: [{ model: db.Allcode, as: 'positionData', attributes: ['valueVi', 'valueEn'] }]
    }
  ]
});
return {
  errCode: 0,
  data: {
    specialty,
    doctorList: doctorInfos.map(d => ({
      doctorId: d.doctorId,
      provinceId: d.provinceId,
      doctorInfo: d.doctorData,
    }))
  }
};
```
> Áp dụng tương tự cho `getDetailClinicById`.

---

# ✅ CHECKLIST THEO DÕI (đánh dấu `[x]` khi xong)

## Nhóm 1 — Sửa ngay:
- [ ] **L1**  – `handleEditUser` merge `req.params.id`
- [ ] **L2**  – `handleDeleteUser` dùng `req.params.id`
- [ ] **L3**  – `editSpecialty` merge `req.params.id` + statusMap 409
- [ ] **L4**  – `editClinic` merge `req.params.id` + statusMap 409
- [ ] **L5**  – `cancelBooking` merge `req.params.bookingId`
- [ ] **L6**  – `sendRemedy` merge `req.params.bookingId`
- [ ] **L7**  – Hash password bệnh nhân bằng bcrypt
- [ ] **L8**  – Check đặt lịch trùng loại trừ S4
- [ ] **L9**  – `bulkCreateSchedule` check tất cả ngày
- [ ] **L10** – `sendRemedy` service dùng `bookingId` + SQL Transaction
- [ ] **L11** – `getDetailDoctorById` thêm `roleId: 'R2'`
- [ ] **L12** – `deleteUser` guard tự xóa + guard bác sĩ có booking
- [ ] **L13** – Check trùng tên Specialty/Clinic
- [ ] **L14** – Validate `specialtyId`/`clinicId` trong `saveInfoDoctor`
- [ ] **L15** – Thêm Facebook Webhook routes

## Nhóm 2 — Sửa sau:
- [ ] **L16** – `bcrypt.hashSync` → `await bcrypt.hash()`
- [ ] **L17** – Di chuyển `increment currentNumber` sang `postVerifyBookAppointment`
- [ ] **L18** – IDOR: `getListPatient` + `getPatientBookingHistory` dùng `req.user.id`
- [ ] **L19** – Fix search tên đầy đủ dùng concat

## Nhóm 3 — Cải thiện:
- [ ] **L21** – Validate `limit` âm/NaN
- [ ] **L22** – `deleteSchedule` hỗ trợ id
- [ ] **L23** – `cancelBooking` hủy được S1
- [ ] **L24** – `String(password)` trong bcrypt.compare
- [ ] **L25** – Thêm `.trim()` toàn bộ
- [ ] **L26** – getDetailSpecialty/Clinic trả info đầy đủ thay vì chỉ ID
