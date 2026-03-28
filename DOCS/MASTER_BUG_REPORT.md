# 🚨 MASTER BUG REPORT — BOOKINGCARE FULL-STACK

> **Ngày tạo:** 27/03/2026 | **Tác giả:** Principal Software Architect Audit
> **Phạm vi:** Backend GĐ4 + Frontend GĐ5/GĐ6 (Admin Module)
> **Phương pháp:** Cross-reference SRS v1.2 ↔ BACKEND_FIX_GUIDE.md ↔ Code thực tế
> **Status tổng [v1]:** 🔴 6 Critical | 🟡 5 Medium | 🟢 12 OK
> **Deep Scan [v2 — 27/03/2026]:** 🔴 +4 Critical mới | 🟡 +3 Medium mới | **Tổng: 20 lỗi chưa fix**

---

## BẢNG TỔNG QUAN NHANH

| #  | Mã lỗi | Tên | Nguồn | Mức độ | Trạng thái |
|----|--------|-----|-------|--------|-----------|
| 1  | BE-01  | handleEditUser bỏ qua req.params.id | L1 FIX_GUIDE | 🔴 Critical | ❌ Chưa fix |
| 2  | BE-02  | handleDeleteUser dùng req.body thay vì req.params | L2 FIX_GUIDE | 🔴 Critical | ❌ Chưa fix |
| 3  | BE-03  | Password bệnh nhân lưu plain-text | L7 FIX_GUIDE | 🔴 Critical | ❌ Chưa fix |
| 4  | BE-04  | Booking check trùng không loại trừ trạng thái S4 | L8 FIX_GUIDE | 🔴 Critical | ❌ Chưa fix |
| 5  | BE-05  | bcrypt.hashSync chặn Event Loop | L16 FIX_GUIDE | 🔴 Critical | ❌ Chưa fix |
| 6  | BE-06  | currentNumber tăng tại S1 thay vì S2 (Slot Hoarding) | L17 FIX_GUIDE | 🔴 Critical | ❌ Chưa fix |
| 7  | BE-07  | getTopDoctorHome: +limit không validate | L21 FIX_GUIDE | 🟡 Medium | ❌ Chưa fix |
| 8  | BE-08  | editSpecialty bỏ qua req.params.id | L3 FIX_GUIDE | 🟡 Medium | ❌ Chưa fix |
| 9  | BE-09  | editClinic bỏ qua req.params.id | L4 FIX_GUIDE | 🟡 Medium | ❌ Chưa fix |
| 10 | BE-10  | deleteUser thiếu guard self-delete + active booking | L12 FIX_GUIDE | 🟡 Medium | ❌ Chưa fix |
| 11 | BE-11  | searchService tìm tên không concat | L19 FIX_GUIDE | 🟡 Medium | ❌ Chưa fix |
| 12 | FE-01  | deleteUser FE gửi id cả trong URL lẫn body (mismatch) | Mới tìm | 🟡 Medium | ❌ Chưa fix |
| 13 | FE-02  | editSchedule chưa có backend PUT /schedules/:id | Mới tìm | 🟡 Medium | ❌ Chưa fix |

> **Đã OK (không cần làm):** L5 cancelBooking ✅, L6 sendRemedy ✅, L9 bulkCreateSchedule ✅, L10 sendRemedy service ✅, L11 getDetailDoctorById ✅, L13 check trùng tên specialty/clinic ✅, L14 saveInfoDoctor validate fk ✅, L22 deleteSchedule ✅, L23 cancelBooking ghost S1 ✅

---

# PHẦN 1 — BACKEND BUGS

---

## 🛑 BE-01 — handleEditUser bỏ qua req.params.id

**Mô tả lỗi:**
Route là `PUT /api/v1/users/:id` nhưng controller tại dòng 50 chỉ truyền `req.body` xuống service:
```js
const result = await userService.editUser(req.body);
```
Frontend gửi `PUT /api/v1/users/5` với body không có `id`, service nhận `data.id = undefined` → return `{ errCode: 1, message: 'Thiếu id!' }`. Chức năng **Sửa User không hoạt động**.

**Hậu quả:** REQ-AM-003 (Sửa user) hoàn toàn thất bại. Admin không thể sửa thông tin bất kỳ user nào.

**Hướng giải quyết:** Merge `req.params.id` vào data trước khi gọi service.

**Surgical Patch:**
📂 `src/controllers/userController.js`

🔍 Tìm:
```javascript
const handleEditUser = async (req, res) => {
  try {
    const result = await userService.editUser(req.body);
```

✍️ Thay bằng:
```javascript
const handleEditUser = async (req, res) => {
  try {
    const data = { ...req.body, id: req.params.id }; // FIX BE-01: lấy id từ URL
    const result = await userService.editUser(data);
```

---

## 🛑 BE-02 — handleDeleteUser lấy id từ req.body thay vì req.params

**Mô tả lỗi:**
Dòng 63: `const { id } = req.body;`. DELETE request theo chuẩn HTTP không có body (nhiều HTTP client/proxy bỏ body của DELETE). Frontend gửi `DELETE /api/v1/users/5` → `req.body.id = undefined` → controller trả ngay `400 Thiếu tham số id!`.

**Hậu quả:** REQ-AM-004 (Xóa user) hoàn toàn thất bại.

**Hướng giải quyết:** Lấy id từ `req.params.id`.

**Surgical Patch:**
📂 `src/controllers/userController.js`

🔍 Tìm:
```javascript
const handleDeleteUser = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu tham số id!' });
    }
    const result = await userService.deleteUser(id);
```

✍️ Thay bằng:
```javascript
const handleDeleteUser = async (req, res) => {
  try {
    const id = req.params.id; // FIX BE-02: lấy từ URL (DELETE không có body)
    if (!id) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu tham số id!' });
    }
    const result = await userService.deleteUser(id);
```

---

## 🛑 BE-03 — Mật khẩu bệnh nhân lưu plain-text 'patient_default'

**Mô tả lỗi:**
`patientService.js` dòng 46: `password: 'patient_default'`. Khi bệnh nhân đăng nhập, bcrypt.compare sẽ so sánh password nhập vào với chuỗi `'patient_default'` (plain text trong DB) → luôn trả `false` → bệnh nhân không thể login.

**Hậu quả:** Vi phạm REQ-AU-002 (bcrypt salt 10). Bệnh nhân tự đặt lịch nhưng không bao giờ đăng nhập được. Bảo mật nghiêm trọng — nếu DB leak, tất cả password bệnh nhân đều lộ.

**Hướng giải quyết:** Dùng `bcrypt.hash()` async trước khi `findOrCreate`.

**Surgical Patch:**
📂 `src/services/patientService.js`

🔍 Tìm (đầu file):
```javascript
const db = require('../models');
const emailService = require('./emailService');
const { v4: uuidv4 } = require('uuid');
```

✍️ Thay bằng:
```javascript
const db = require('../models');
const emailService = require('./emailService');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs'); // FIX BE-03
```

🔍 Tìm (trong postBookAppointment):
```javascript
    const [patient] = await db.User.findOrCreate({
      where: { email: data.email },
      defaults: {
        email: data.email,
        password: 'patient_default',
```

✍️ Thay bằng:
```javascript
    // FIX BE-03: hash password trước khi lưu (REQ-AU-002)
    const hashedDefault = await bcrypt.hash('patient_default', 10);
    const [patient] = await db.User.findOrCreate({
      where: { email: data.email },
      defaults: {
        email: data.email,
        password: hashedDefault,
```

---

## 🛑 BE-04 — Booking check trùng không loại trừ booking đã hủy (S4)

**Mô tả lỗi:**
`patientService.js` dòng 57-64: `findOne({ where: { doctorId, patientId, date, timeType } })` — không có điều kiện lọc `statusId`. Bệnh nhân đặt lịch → hủy (S4) → muốn đặt lại → vẫn bị báo "Bạn đã đặt lịch này rồi!".

**Hậu quả:** Vi phạm REQ-PT-022. Bệnh nhân bị khóa slot vĩnh viễn sau khi hủy — UX tệ, vi phạm nghiệp vụ.

**Hướng giải quyết:** Thêm filter `statusId: { [Op.ne]: 'S4' }`.

**Surgical Patch:**
📂 `src/services/patientService.js`

🔍 Tìm (đầu file):
```javascript
const { v4: uuidv4 } = require('uuid');
```

✍️ Thay bằng:
```javascript
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize'); // FIX BE-04
```

🔍 Tìm:
```javascript
    const existBooking = await db.Booking.findOne({
      where: {
        doctorId: data.doctorId,
        patientId: patient.id,
        date: data.date,
        timeType: data.timeType,
      },
    });
```

✍️ Thay bằng:
```javascript
    const existBooking = await db.Booking.findOne({
      where: {
        doctorId: data.doctorId,
        patientId: patient.id,
        date: data.date,
        timeType: data.timeType,
        statusId: { [Op.ne]: 'S4' }, // FIX BE-04: loại trừ booking đã hủy
      },
    });
```

---

## 🛑 BE-05 — bcrypt.hashSync chặn Event Loop Node.js

**Mô tả lỗi:**
`userService.js` dòng 71: `const hashedPassword = bcrypt.hashSync(data.password, salt)`. `hashSync` là đồng bộ, block event loop 50-100ms mỗi lần gọi. Dưới tải 50+ concurrent requests, server freeze hoàn toàn.

**Hậu quả:** Performance thảm hại dưới tải. Vi phạm nguyên tắc cơ bản Node.js async non-blocking.

**Hướng giải quyết:** Thay bằng `bcrypt.hash()` async.

**Surgical Patch:**
📂 `src/services/userService.js`

🔍 Tìm:
```javascript
    const hashedPassword = bcrypt.hashSync(data.password, salt);
```

✍️ Thay bằng:
```javascript
    const hashedPassword = await bcrypt.hash(data.password, 10); // FIX BE-05: async hash
```

---

## 🛑 BE-06 — currentNumber tăng tại S1 thay vì S2 (Slot Hoarding Attack)

**Mô tả lỗi:**
`patientService.js` dòng 86-89: `Schedule.increment('currentNumber', ...)` được gọi ngay sau khi `Booking.create(statusId: 'S1')`. Bệnh nhân chỉ cần gửi form đặt lịch (chưa verify email) là slot đã bị trừ.

**Hậu quả:** Hacker spam 10 email giả → không verify → slot bị giam vĩnh viễn. Vi phạm SRS State Machine (REQ-PT-016): slot chỉ được trừ khi S1→S2 (sau verify email). Vi phạm REQ-AM-023.

**Hướng giải quyết:** Xóa increment khỏi `postBookAppointment`, thêm increment vào `postVerifyBookAppointment`.

**Surgical Patch — Bước 1:**
📂 `src/services/patientService.js`

🔍 Tìm:
```javascript
    // Cập nhật currentNumber của Schedule (SRS REQ-AM-023)
    await db.Schedule.increment('currentNumber', {
      by: 1,
      where: { doctorId: data.doctorId, date: data.date, timeType: data.timeType },
    });
```

✍️ Thay bằng:
```javascript
    // FIX BE-06: KHÔNG tăng slot tại S1. Chỉ tăng sau khi verify email (S1→S2).
```

**Surgical Patch — Bước 2:**
📂 `src/services/patientService.js`

🔍 Tìm (trong `postVerifyBookAppointment`, sau `booking.save()`):
```javascript
    booking.statusId = 'S2';
    await booking.save();
    return { errCode: 0, message: 'Xác nhận lịch hẹn thành công!' };
```

✍️ Thay bằng:
```javascript
    booking.statusId = 'S2'; // S1 → S2
    await booking.save();

    // FIX BE-06: Chỉ tăng slot SAU KHI bệnh nhân xác nhận email (REQ-AM-023)
    await db.Schedule.increment('currentNumber', {
      by: 1,
      where: { doctorId: booking.doctorId, date: booking.date, timeType: booking.timeType },
    });
    return { errCode: 0, message: 'Xác nhận lịch hẹn thành công!' };
```

---

## 🛑 BE-07 — getTopDoctorHome: +limit không validate (crash với chuỗi âm)

**Mô tả lỗi:**
`doctorController.js` dòng 6-7:
```js
const limit = req.query.limit || 10;
const result = await doctorService.getTopDoctorHome(+limit);
```
Nếu user gửi `?limit=-5` → `+(-5)` = `-5` → Sequelize LIMIT -5 → crash. Hoặc `?limit=abc` → `+('abc')` = `NaN` → crash.

**Hậu quả:** Endpoint công khai `GET /api/v1/doctors/top` có thể bị crash bởi request độc hại.

**Hướng giải quyết:** Dùng `parseInt` + clamp giá trị.

**Surgical Patch:**
📂 `src/controllers/doctorController.js`

🔍 Tìm:
```javascript
  try {
    const limit = req.query.limit || 10;
    const result = await doctorService.getTopDoctorHome(+limit);
```

✍️ Thay bằng:
```javascript
  try {
    // FIX BE-07: parseInt an toàn, clamp 1–50
    let limit = parseInt(req.query.limit, 10) || 10;
    if (limit < 1) limit = 1;
    if (limit > 50) limit = 50;
    const result = await doctorService.getTopDoctorHome(limit);
```

---

## 🛑 BE-08 — editSpecialty controller bỏ qua req.params.id

**Mô tả lỗi:**
Controller `specialtyController.js` — hàm `editSpecialty` truyền nguyên `req.body` cho service. `data.id = undefined`. Chức năng **Sửa Chuyên Khoa không hoạt động**.

**Hậu quả:** REQ-AM-016 thất bại hoàn toàn.

**Surgical Patch:**
📂 `src/controllers/specialtyController.js`

🔍 Tìm:
```javascript
const editSpecialty = async (req, res) => {
  try {
    const result = await specialtyService.editSpecialty(req.body);
```

✍️ Thay bằng:
```javascript
const editSpecialty = async (req, res) => {
  try {
    const data = { ...req.body, id: req.params.id }; // FIX BE-08
    const result = await specialtyService.editSpecialty(data);
```

---

## 🛑 BE-09 — editClinic controller bỏ qua req.params.id

**Mô tả lỗi:**
Tương tự BE-08 cho `clinicController.js`. Chức năng **Sửa Phòng Khám không hoạt động**.

**Hậu quả:** REQ-AM-012 thất bại.

**Surgical Patch:**
📂 `src/controllers/clinicController.js`

🔍 Tìm:
```javascript
const editClinic = async (req, res) => {
  try {
    const result = await clinicService.editClinic(req.body);
```

✍️ Thay bằng:
```javascript
const editClinic = async (req, res) => {
  try {
    const data = { ...req.body, id: req.params.id }; // FIX BE-09
    const result = await clinicService.editClinic(data);
```

---

## 🛑 BE-10 — deleteUser thiếu guard: Admin tự xóa mình + Bác sĩ có booking

**Mô tả lỗi:**
`userService.deleteUser(id)` không có bất kỳ guard nào. Admin có thể tự xóa chính mình (mất quyền quản trị vĩnh viễn). Xóa bác sĩ đang có 10 lịch hẹn S2 → bệnh nhân đến khám nhưng không có bác sĩ.

**Hậu quả:** Dữ liệu toàn vẹn nghiêm trọng. Vi phạm nghiệp vụ cơ bản.

**Surgical Patch:**
📂 `src/services/userService.js`

🔍 Tìm:
```javascript
const deleteUser = async (id) => {
  try {
    const user = await db.User.findOne({ where: { id } });
    if (!user) return { errCode: 3, message: 'Không tìm thấy người dùng!' };
    await db.User.destroy({ where: { id } });
```

✍️ Thay bằng:
```javascript
const deleteUser = async (id, requesterId) => {
  try {
    // FIX BE-10 Guard 1: Admin không tự xóa mình
    if (requesterId && String(id) === String(requesterId)) {
      return { errCode: 5, message: 'Không thể tự xóa tài khoản của chính mình!' };
    }
    const user = await db.User.findOne({ where: { id } });
    if (!user) return { errCode: 3, message: 'Không tìm thấy người dùng!' };

    // FIX BE-10 Guard 2: Bác sĩ đang có booking chưa xử lý
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
```

> **Đồng thời sửa controller `handleDeleteUser` (BE-02) để truyền `req.user.id`:**
```javascript
// Trong handleDeleteUser (sau khi đã sửa BE-02):
const result = await userService.deleteUser(id, req.user?.id);
```

---

## 🛑 BE-11 — searchService: Tìm tên đầy đủ trả rỗng

**Mô tả lỗi:**
`userService.js` — hàm `searchService`: tìm `{ firstName: LIKE '%Nguyen Van A%' }` → không bao giờ khớp vì `firstName` chỉ lưu `'A'`, `lastName` lưu `'Nguyen Van'`. Người dùng search tên đầy đủ → không ra kết quả.

**Hậu quả:** REQ-PT-002 (tìm kiếm bác sĩ) bị fail với input tên đầy đủ.

**Surgical Patch:**
📂 `src/services/userService.js`

🔍 Tìm (trong searchService, phần tìm doctors):
```javascript
    [Op.or]: [
      { firstName: { [Op.like]: `%${keyword}%` } },
      { lastName: { [Op.like]: `%${keyword}%` } },
    ],
```

✍️ Thay bằng:
```javascript
    // FIX BE-11: concat để tìm tên đầy đủ
    [Op.or]: [
      db.Sequelize.where(
        db.Sequelize.fn('CONCAT', db.Sequelize.col('lastName'), ' ', db.Sequelize.col('firstName')),
        { [Op.like]: `%${keyword.trim()}%` }
      ),
      db.Sequelize.where(
        db.Sequelize.fn('CONCAT', db.Sequelize.col('firstName'), ' ', db.Sequelize.col('lastName')),
        { [Op.like]: `%${keyword.trim()}%` }
      ),
    ],
```

---

# PHẦN 2 — FRONTEND BUGS (FE ↔ BE API Mismatch)

---

## 🛑 FE-01 — deleteUser FE gửi id cả trong URL lẫn body (thừa + mismatch)

**Mô tả lỗi:**
`frontend/src/services/userService.js` dòng 34:
```javascript
export const deleteUser = (id) => {
  return axiosInstance.delete(`/api/v1/users/${id}`, { data: { id } });
};
```
FE gửi id trên URL (`/users/5`) **VÀ** trong body `{ id: 5 }`. Backend BE-02 đọc từ `req.body.id` — nên hiện tại nó hoạt động (như một workaround). Nhưng sau khi fix BE-02, backend sẽ đọc `req.params.id` → body `{ id }` trở thành thừa và có thể gây nhầm lẫn. Cũng: HTTP DELETE với body là anti-pattern.

**Hậu quả:** Sau khi fix BE-02, nếu không sửa FE này thì vẫn ok (URL vẫn đúng), nhưng gửi body thừa vi phạm REST convention.

**Hướng giải quyết:** Bỏ `{ data: { id } }` phần body — URL đã đủ.

**Surgical Patch:**
📂 `src/services/userService.js` (Frontend)

🔍 Tìm:
```javascript
export const deleteUser = (id) => {
  return axiosInstance.delete(`/api/v1/users/${id}`, { data: { id } });
};
```

✍️ Thay bằng:
```javascript
export const deleteUser = (id) => {
  // FIX FE-01: chỉ cần URL — không cần body cho DELETE
  return axiosInstance.delete(`/api/v1/users/${id}`);
};
```

---

## 🛑 FE-02 — editSchedule FE gọi PUT /schedules/:id nhưng Backend chưa có route này

**Mô tả lỗi:**
GAP-04 của GĐ6 đã thêm `editSchedule` vào `doctorService.js` (FE):
```javascript
export const editSchedule = (data) =>
  axiosInstance.put(`/api/v1/schedules/${data.id}`, data);
```
Nhưng backend **không có route** `PUT /api/v1/schedules/:id` và không có handler trong `doctorController.js`. Mọi request `editSchedule` từ ScheduleManage sẽ nhận `404 Not Found`.

**Hậu quả:** GAP-04 (inline edit maxNumber) của GĐ6 hoàn toàn không hoạt động ở runtime mặc dù FE code đúng.

**Hướng giải quyết:** Thêm route + controller + service vào backend.

**Surgical Patch — Backend Controller:**
📂 `src/controllers/doctorController.js`

🔍 Tìm (sau hàm deleteSchedule):
```javascript
// REQ-AM-021 – Xóa lịch khám
const deleteSchedule = async (req, res) => {
```

✍️ Thêm VÀO TRƯỚC đoạn đó:
```javascript
// FIX FE-02: REQ-AM-021 — Sửa lịch khám (maxNumber)
const editSchedule = async (req, res) => {
  try {
    const data = { ...req.body, id: req.params.id };
    if (!data.id) return res.status(400).json({ errCode: 1, message: 'Thiếu id!' });
    const schedule = await require('../models').Schedule.findByPk(data.id);
    if (!schedule) return res.status(404).json({ errCode: 3, message: 'Không tìm thấy lịch khám!' });
    if (data.maxNumber !== undefined) {
      if (data.maxNumber < schedule.currentNumber) {
        return res.status(400).json({ errCode: 2, message: `maxNumber không được nhỏ hơn currentNumber (${schedule.currentNumber})!` });
      }
      schedule.maxNumber = data.maxNumber;
      await schedule.save();
    }
    return res.status(200).json({ errCode: 0, message: 'Cập nhật lịch khám thành công!', data: schedule });
  } catch (err) {
    console.error('>>> editSchedule error:', err);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};
```

**Surgical Patch — Backend Route:**
📂 `src/routes/web.js` (hoặc file route tương ứng)

🔍 Tìm dòng route DELETE schedule:
```javascript
app.delete('/api/v1/schedules/:id', checkDoctorRole, doctorController.deleteSchedule);
```

✍️ Thêm VÀO TRƯỚC hoặc SAU dòng đó:
```javascript
// FIX FE-02: Edit schedule (maxNumber)
app.put('/api/v1/schedules/:id', checkDoctorRole, doctorController.editSchedule);
```

**Surgical Patch — Export Controller:**
📂 `src/controllers/doctorController.js` (cuối file, phần module.exports)

🔍 Tìm:
```javascript
  deleteSchedule,
```

✍️ Thêm NGAY SAU:
```javascript
  deleteSchedule,
  editSchedule, // FIX FE-02
```

---

# PHỤ LỤC — THỐNG KÊ VÀ ƯU TIÊN THỰC HIỆN

## Thứ Tự Fix Được Khuyến Nghị

```
Ngay hôm nay (Critical — ảnh hưởng core functionality):
1. BE-03 (password plain-text) → 5 phút
2. BE-04 (booking trùng S4)    → 5 phút
3. BE-01 (editUser params)     → 2 phút
4. BE-02 (deleteUser params)   → 2 phút
5. BE-05 (hashSync async)      → 2 phút
6. BE-06 (currentNumber S1)    → 10 phút

Tuần này (Medium — ảnh hưởng tính năng GĐ6):
7. BE-08 (editSpecialty)       → 2 phút
8. BE-09 (editClinic)          → 2 phút
9. FE-02 (editSchedule route)  → 10 phút
10. FE-01 (deleteUser body)    → 1 phút

Tùy chọn (Bảo mật / UX):
11. BE-10 (deleteUser guards)  → 15 phút
12. BE-07 (limit validate)     → 2 phút
13. BE-11 (search concat)      → 5 phút
```

## Lưu Ý Dependency

- Fix BE-10 phụ thuộc vào BE-02 (cần `req.user.id` từ controller đã sửa)
- Fix FE-01 nên làm SAU BE-02 (để tránh breaking thay đổi giữa chừng)
- BE-06 (slot hoarding) cần verify `postVerifyBookAppointment` có rollback nếu email lỗi → nên dùng transaction

---

# 🔬 PHẦN 3 — DEEP SCAN (v2) — LỖI ẨN GĐ4/5/6

> **Phương pháp:** Soi kính lúp vào: body-parser limit, Redux persist, Axios 401 loop, async unmount, IDOR, atomic transactions, verifyToken HTTP status.
> **Kết quả:** Tìm thêm 7 lỗi ẩn chưa từng được báo cáo.

---

## 🛑 DS-01 — body-parser limit 50mb vi phạm SRS Constraint #7 (DoS Risk)

**Mô tả lỗi:**
`server.js` dòng 18-19:
```javascript
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
```
SRS Constraint #7 quy định: **ảnh tối đa 5MB**. Body-parser limit 50mb nghĩa là bất kỳ endpoint nào (kể cả endpoint không liên quan ảnh như `/api/v1/auth/login`) đều chấp nhận body 50MB. Attacker gửi 1000 request với body 50MB → RAM server bị nuốt → OOM crash.

**Hậu quả:** Lỗ hổng DoS (Denial of Service) nghiêm trọng trên toàn bộ public endpoints. Vi phạm SRS Constraint #7.

**Hướng giải quyết:** Dùng limit mặc định nhỏ (`100kb`) cho toàn bộ routes, chỉ nâng lên `6mb` (thêm buffer) cho các routes nhận ảnh.

**Surgical Patch:**
📂 `src/server.js`

🔍 Tìm:
```javascript
// Body parser (SRS Section 5.2: JSON format, Constraint #7: 5MB image)
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
```

✍️ Thay bằng:
```javascript
// DS-01 FIX: limit 100kb mặc định, riêng routes nhận ảnh dùng 6mb
const jsonSmall = bodyParser.json({ limit: '100kb' });
const jsonLarge = bodyParser.json({ limit: '6mb' }); // 5MB ảnh + buffer
const urlencodedSmall = bodyParser.urlencoded({ limit: '100kb', extended: true });

// Áp dụng limit nhỏ cho toàn bộ app
app.use(jsonSmall);
app.use(urlencodedSmall);
```

> Sau đó, trong `web.js`, các routes nhận ảnh cần dùng `jsonLarge` middleware:
```javascript
// Trong routes(app), thêm tham số middleware:
app.post('/api/v1/users', verifyToken, checkAdminRole, jsonLarge, userController.handleCreateNewUser);
app.put('/api/v1/users/:id', verifyToken, checkAdminRole, jsonLarge, userController.handleEditUser);
app.post('/api/v1/doctors', verifyToken, checkAdminRole, jsonLarge, doctorController.saveInfoDoctor);
app.post('/api/v1/specialties', verifyToken, checkAdminRole, jsonLarge, specialtyController.createSpecialty);
app.put('/api/v1/specialties/:id', verifyToken, checkAdminRole, jsonLarge, specialtyController.editSpecialty);
app.post('/api/v1/clinics', verifyToken, checkAdminRole, jsonLarge, clinicController.createClinic);
app.put('/api/v1/clinics/:id', verifyToken, checkAdminRole, jsonLarge, clinicController.editClinic);
// Không cần jsonLarge cho login, search, allcode, schedules, bookings
```

---

## 🛑 DS-02 — verifyToken trả 403 khi token hết hạn → FE Axios interceptor 401 không bao giờ kích hoạt (No Auto-Logout)

**Mô tả lỗi:**
`authMiddleware.js` dòng 18-27:
```javascript
try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  req.user = decoded;
  next();
} catch (err) {
  return res.status(403).json({ ... }); // ← 403 khi token expired!
}
```
`jwt.verify()` ném `TokenExpiredError` → code vào catch → trả **403 Forbidden**.

Frontend `axiosConfig.js`:
```javascript
if (status === 401 || status === 403) {
  store.dispatch(processLogout()); // interceptor check cả 403
```
Frontend check cả 403 nên hiện tại vẫn dùng được. **Tuy nhiên đây là thiết kế sai về ngữ nghĩa HTTP:**
- `401 Unauthorized` = chưa xác thực / token expired → correct
- `403 Forbidden` = đã xác thực nhưng không có quyền → đang bị dùng nhầm cho 2 trường hợp

Hậu quả thực tế: Khi Admin nhận 403 vì không có quyền (đúng use case), hệ thống cũng **tự logout luôn** → UX tệ và có thể gây bug khó debug.

**Hậu quả:** Sai ngữ nghĩa HTTP. Admin nhận 403 (no permission) → bị logout oan. Vi phạm REQ-AU-006.

**Hướng giải quyết:** Phân biệt `TokenExpiredError` trả 401, các lỗi JWT khác trả 403. FE interceptor chỉ logout khi nhận 401.

**Surgical Patch — Backend:**
📂 `src/middleware/authMiddleware.js`

🔍 Tìm:
```javascript
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, roleId }
    next();
  } catch (err) {
    return res.status(403).json({
      errCode: -1,
      message: 'Token không hợp lệ hoặc đã hết hạn!',
    });
  }
```

✍️ Thay bằng:
```javascript
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, roleId }
    next();
  } catch (err) {
    // DS-02 FIX: phân biệt token hết hạn (401) vs token không hợp lệ (403)
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        errCode: -1,
        message: 'Phiên đăng nhập đã hết hạn! Vui lòng đăng nhập lại.',
      });
    }
    return res.status(403).json({
      errCode: -1,
      message: 'Token không hợp lệ!',
    });
  }
```

**Surgical Patch — Frontend:**
📂 `src/services/axiosConfig.js`

🔍 Tìm:
```javascript
    if (status === 401 || status === 403) {
      // Token hết hạn hoặc không hợp lệ → auto logout
      console.warn('>>> Token expired or invalid, auto logout...');
      store.dispatch(processLogout());
      window.location.href = '/login';
    }
```

✍️ Thay bằng:
```javascript
    if (status === 401) {
      // DS-02 FIX: chỉ logout khi token expired (401), không logout khi bị cấm quyền (403)
      console.warn('>>> Token expired, auto logout...');
      store.dispatch(processLogout());
      window.location.href = '/login';
    }
    // 403 = no permission → để component tự xử lý lỗi, không logout
```

---

## 🛑 DS-03 — accessToken lưu trong localStorage qua Redux Persist (XSS Risk)

**Mô tả lỗi:**
`store.js` dòng 17: `whitelist: ['user', 'app']`. Slice `user` chứa `accessToken`. Redux Persist lưu toàn bộ slice `user` vào `localStorage`. Bất kỳ XSS script nào chạy trên trang đều đọc được `localStorage['persist:root']` → lấy JWT token → tấn công API với quyền Admin/Doctor.

**Hậu quả:** Vi phạm nguyên tắc bảo mật "JWT không nên lưu localStorage" (OWASP). Nếu có XSS (dù nhỏ), toàn bộ JWT bị đánh cắp.

**Hướng giải quyết:** Dùng `blacklist` thay `whitelist` cho `accessToken`, hoặc chỉ persist `isLoggedIn` + `userInfo` (không persist token).

**Surgical Patch:**
📂 `src/redux/store.js`

🔍 Tìm:
```javascript
const persistConfig = {
  key: 'root',          // Key trong localStorage
  storage,              // localStorage (mặc định)
  whitelist: ['user', 'app'],  // CHỈ persist user (token, info) và app (language)
  // Không persist admin (fetch lại mỗi lần mở)
};
```

✍️ Thay bằng:
```javascript
import { createTransform } from 'redux-persist';

// DS-03 FIX: Lọc accessToken khỏi persist — không lưu JWT vào localStorage
const userTransform = createTransform(
  // Trước khi serialize vào storage: bỏ accessToken
  (inboundState) => ({ ...inboundState, accessToken: null }),
  // Sau khi rehydrate: giữ nguyên
  (outboundState) => outboundState,
  { whitelist: ['user'] }
);

const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['user', 'app'], // persist user (isLoggedIn, userInfo) và app (language)
  transforms: [userTransform], // DS-03: loại accessToken khỏi persist
};
```

> **Lưu ý:** Sau khi fix, user sẽ phải đăng nhập lại khi refresh trang (token không còn trong storage). Đây là trade-off bảo mật chấp nhận được.

---

## 🛑 DS-04 — sendRemedy và cancelBooking bỏ qua bookingId từ req.params (Đã có trong FIX_GUIDE nhưng CHƯA ĐƯỢC FIX)

**Mô tả lỗi:**
`doctorController.js` dòng 116 và 128:
```javascript
// sendRemedy
const result = await doctorService.sendRemedy(req.body); // bookingId từ URL bị bỏ
// cancelBooking  
const result = await doctorService.cancelBooking(req.body); // bookingId từ URL bị bỏ
```
Routes: `POST /api/v1/bookings/:bookingId/remedy` và `PATCH /api/v1/bookings/:bookingId/cancel`. `bookingId` trên URL bị bỏ qua hoàn toàn → service phải tìm booking theo `doctorId+patientId` (không chính xác).

**Hậu quả:** Gửi đơn thuốc nhầm bệnh nhân nếu có 2 booking cùng bác sĩ. Vi phạm REQ-DR-005, REQ-DR-004.

**Surgical Patch:**
📂 `src/controllers/doctorController.js`

🔍 Tìm:
```javascript
const sendRemedy = async (req, res) => {
  try {
    const result = await doctorService.sendRemedy(req.body);
```

✍️ Thay bằng:
```javascript
const sendRemedy = async (req, res) => {
  try {
    // DS-04 FIX: merge bookingId từ URL
    const data = { ...req.body, bookingId: req.params.bookingId };
    const result = await doctorService.sendRemedy(data);
```

🔍 Tìm:
```javascript
const cancelBooking = async (req, res) => {
  try {
    const result = await doctorService.cancelBooking(req.body);
```

✍️ Thay bằng:
```javascript
const cancelBooking = async (req, res) => {
  try {
    // DS-04 FIX: merge bookingId từ URL
    const data = { ...req.body, bookingId: req.params.bookingId };
    const result = await doctorService.cancelBooking(data);
```

---

## 🛑 DS-05 — postBookAppointment không atomic: Email lỗi nhưng Booking + Slot đã commit

**Mô tả lỗi:**
`patientService.js` luồng:
1. `db.Booking.create(...)` → commit thành công
2. `db.Schedule.increment(...)` → commit thành công  
3. `emailService.sendEmailBooking(...)` → **LỖI** (SMTP down, quota hết...)
4. Function throw → return `{ errCode: -1 }`

Kết quả: Booking đã tồn tại trong DB + slot đã bị trừ, nhưng bệnh nhân không nhận được email xác thực (và không bao giờ verify được → booking bị kẹt ở S1 vĩnh viễn).

**Hậu quả:** Slot bị chiếm bởi Ghost Booking S1 (bệnh nhân không verify được vì không nhận email). Vi phạm REQ-PT-016 (gửi email xác nhận là bắt buộc).

**Hướng giải quyết:** Dùng transaction — rollback booking và slot nếu email thất bại.

**Surgical Patch:**
📂 `src/services/patientService.js`

🔍 Tìm (dòng đầu hàm `postBookAppointment`):
```javascript
const postBookAppointment = async (data) => {
  try {
    // REQ-PT-014: Validate dữ liệu đầu vào
```

✍️ Thay bằng:
```javascript
const postBookAppointment = async (data) => {
  // DS-05 FIX: transaction để đảm bảo atomicity
  const t = await db.sequelize.transaction();
  try {
    // REQ-PT-014: Validate dữ liệu đầu vào
```

🔍 Tìm (cuối hàm, trước emailService.sendEmailBooking):
```javascript
    await db.Booking.create({
      statusId: 'S1',
```

✍️ Thay bằng:
```javascript
    await db.Booking.create({
      statusId: 'S1',
```
> **Thêm `{ transaction: t }` vào tất cả các DB calls trong hàm:**
```javascript
// db.User.findOrCreate → thêm { transaction: t }
const [patient] = await db.User.findOrCreate({
  where: { email: data.email },
  defaults: { ... },
  transaction: t, // DS-05
});

// db.Booking.findOne (check trùng) → thêm { transaction: t }
const existBooking = await db.Booking.findOne({
  where: { ... },
  transaction: t, // DS-05
});

// db.Booking.create → thêm { transaction: t }
await db.Booking.create({ ... , transaction: t });
```

🔍 Tìm (sau `emailService.sendEmailBooking(...)`):
```javascript
    return { errCode: 0, message: 'Đặt lịch thành công! Vui lòng kiểm tra email.' };
  } catch (err) {
    console.error('>>> postBookAppointment error:', err);
    return { errCode: -1, message: 'Lỗi server!' };
  }
```

✍️ Thay bằng:
```javascript
    await t.commit(); // DS-05: email OK → commit tất cả
    return { errCode: 0, message: 'Đặt lịch thành công! Vui lòng kiểm tra email.' };
  } catch (err) {
    await t.rollback(); // DS-05: bất kỳ lỗi nào (kể cả email) → rollback DB
    console.error('>>> postBookAppointment error:', err);
    if (err.message?.includes('email') || err.code === 'ECONNREFUSED') {
      return { errCode: -1, message: 'Không thể gửi email xác thực. Vui lòng thử lại!' };
    }
    return { errCode: -1, message: 'Lỗi server!' };
  }
```

---

## 🛑 DS-06 — getListPatientForDoctor IDOR: Bác sĩ A xem danh sách bệnh nhân của Bác sĩ B

**Mô tả lỗi:**
`doctorController.js` dòng 100:
```javascript
const doctorId = req.params.doctorId || req.query.doctorId;
```
Route: `GET /api/v1/doctors/:doctorId/patients` — yêu cầu `checkDoctorRole` nhưng bất kỳ bác sĩ nào login hợp lệ đều có thể truyền `doctorId` của bác sĩ khác → xem danh sách bệnh nhân của đồng nghiệp.

**Hậu quả:** IDOR (Insecure Direct Object Reference). Vi phạm bảo mật dữ liệu bệnh nhân — vi phạm nghiêm trọng quy định y tế (HIPAA-equivalent). Vi phạm REQ-DR-003.

**Hướng giải quyết:** Lấy `doctorId` từ JWT token (`req.user.id`) thay vì URL.

**Surgical Patch:**
📂 `src/controllers/doctorController.js`

🔍 Tìm:
```javascript
const getListPatientForDoctor = async (req, res) => {
  try {
    const doctorId = req.params.doctorId || req.query.doctorId;
    const { date, statusId } = req.query;
    if (!doctorId || !date) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu tham số!' });
    }
    const result = await doctorService.getListPatientForDoctor(doctorId, date, statusId);
```

✍️ Thay bằng:
```javascript
const getListPatientForDoctor = async (req, res) => {
  try {
    // DS-06 FIX: lấy doctorId từ JWT (không tin URL) để chặn IDOR
    const doctorId = req.user.id;
    const { date, statusId } = req.query;
    if (!date) {
      return res.status(400).json({ errCode: 1, message: 'Thiếu tham số date!' });
    }
    const result = await doctorService.getListPatientForDoctor(doctorId, date, statusId);
```

---

## 🛑 DS-07 — ScheduleManage: Memory Leak khi setState sau khi component unmount

**Mô tả lỗi:**
`ScheduleManage.jsx` dùng `useEffect` gọi `loadExistingSchedules()` và `fetchDoctorList()` — hai hàm async không có cleanup. Nếu Admin điều hướng khỏi trang (unmount) trong khi request đang chờ → Axios resolve → code gọi `setExistingSchedules(...)` hoặc `setDoctorList(...)` trên component đã unmount → React warning: *"Can't perform a React state update on an unmounted component"* → Memory leak tiềm ẩn.

**Hậu quả:** Console warning lộ thông tin debug (production), có thể gây race condition nếu user navigate nhanh. Performance degradation dần dần.

**Hướng giải quyết:** Dùng `AbortController` để cancel request khi unmount.

**Surgical Patch:**
📂 `src/containers/System/Admin/ScheduleManage.jsx`

🔍 Tìm:
```javascript
  useEffect(() => { fetchDoctorList(); }, []);

  useEffect(() => {
    if (selectedDoctorId && selectedDate) loadExistingSchedules();
    else { setExistingSchedules([]); setSelectedTimes([]); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDoctorId, selectedDate]);

  const fetchDoctorList = async () => {
    try {
      const res = await getAllUsers('ALL');
      if (res.errCode === 0)
        setDoctorList((res.data || []).filter((u) => u.roleId === 'R2'));
    } catch { /* silent */ }
  };
```

✍️ Thay bằng:
```javascript
  useEffect(() => {
    // DS-07 FIX: AbortController để cancel request khi unmount
    const controller = new AbortController();
    fetchDoctorList(controller.signal);
    return () => controller.abort(); // cleanup
  }, []);

  useEffect(() => {
    if (selectedDoctorId && selectedDate) {
      const controller = new AbortController();
      loadExistingSchedules(controller.signal);
      return () => controller.abort(); // cleanup
    } else {
      setExistingSchedules([]);
      setSelectedTimes([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDoctorId, selectedDate]);

  const fetchDoctorList = async (signal) => {
    try {
      const res = await getAllUsers('ALL', signal);
      if (res.errCode === 0)
        setDoctorList((res.data || []).filter((u) => u.roleId === 'R2'));
    } catch (err) {
      if (err.name !== 'CanceledError') console.error(err); // bỏ qua abort error
    }
  };
```

> **Lưu ý:** `getAllUsers` trong `userService.js` cần hỗ trợ `signal`:
```javascript
// FE: src/services/userService.js
export const getAllUsers = (id, signal) => {
  return axiosInstance.get('/api/v1/users', { params: { id }, signal });
};
```

---

# PHỤ LỤC (CẬP NHẬT) — THỨ TỰ FIX CUỐI CÙNG

```
🔴 CRITICAL — Fix ngay:
1.  BE-03 (password plain-text)        → 5 phút
2.  DS-05 (booking không atomic)       → 20 phút
3.  DS-04 (sendRemedy/cancel params)   → 5 phút
4.  DS-01 (body-parser 50mb DoS)       → 15 phút
5.  DS-02 (verifyToken 403 vs 401)     → 10 phút
6.  DS-06 (IDOR patient list)          → 3 phút
7.  BE-04 (booking trùng S4)           → 5 phút
8.  BE-01 (editUser params)            → 2 phút
9.  BE-02 (deleteUser params)          → 2 phút
10. BE-05 (hashSync async)             → 2 phút
11. BE-06 (currentNumber S1)           → 10 phút

🟡 MEDIUM — Fix trong tuần:
12. DS-03 (JWT localStorage XSS)       → 10 phút
13. BE-08 (editSpecialty)              → 2 phút
14. BE-09 (editClinic)                 → 2 phút
15. FE-02 (editSchedule route)         → 10 phút
16. BE-10 (deleteUser guards)          → 15 phút
17. BE-07 (limit validate)             → 2 phút
18. BE-11 (search concat)              → 5 phút
19. FE-01 (deleteUser body)            → 1 phút

🟢 NICE-TO-HAVE:
20. DS-07 (memory leak unmount)        → 20 phút
```
