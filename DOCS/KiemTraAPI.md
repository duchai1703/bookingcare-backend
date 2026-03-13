# 📋 BÁO CÁO KHẮC PHỤC BACKEND API – BOOKINGCARE

> **Ngày:** 13/03/2026  
> **Mục tiêu:** Thực hiện toàn bộ các "Đơn thuốc" từ Báo cáo Audit (`backend_api_audit.md`) để đưa Backend về chuẩn RESTful API Server hoàn chỉnh.

---

## Bảng tổng chẩn đoán: TRƯỚC ↔ SAU

| # | Tiêu chí | Trước khi sửa | Sau khi sửa | Trạng thái |
|---|----------|---------------|-------------|------------|
| 1 | Không còn SSR | ✅ Sạch | ✅ Sạch | 🟢 Giữ nguyên |
| 2 | Response dùng `res.json()` | ✅ Đạt (trừ 1 chỗ `res.send`) | ✅ 100% `res.json()` | 🟢 Đã sửa |
| 2b | Cấu trúc response đồng nhất | ⚠️ `getAllUsers` trả raw data | ✅ Tất cả service trả `{ errCode, message, data }` | 🟢 Đã sửa |
| 2c | HTTP Status Code đúng chuẩn | ❌ Luôn trả `status(200)` | ✅ 400, 401, 404, 409, 201, 500 | 🟢 Đã sửa |
| 3 | CORS & Body Parser | ✅ Đạt | ✅ Đạt + thêm `PATCH` | 🟢 Cải thiện |
| 4 | RESTful Naming Convention | ❌ Verb-based | ✅ Noun-based | 🟢 Đã sửa |
| 4b | API Versioning | ❌ Thiếu | ✅ `/api/v1/` | 🟢 Đã sửa |

---

## Đơn 1: Sửa Health-check Route

**File:** `src/routes/web.js` (dòng 12)

| | Code |
|---|---|
| **Trước** | `app.get('/', (req, res) => res.send('BookingCare Backend is running!'));` |
| **Sau** | `app.get('/api/health', (req, res) => res.json({ errCode: 0, message: 'BookingCare Backend is running!' }));` |

✅ **Đã sửa:** Đổi path từ `/` → `/api/health` và `res.send()` → `res.json()`.

---

## Đơn 2: Sửa HTTP Status Code — 5 Controllers

### Quy tắc ánh xạ đã áp dụng

```
errCode  0  → 200 OK (hoặc 201 Created cho create)
errCode  1  → 400 Bad Request (thiếu tham số)
errCode  1  → 401 Unauthorized (sai email/mật khẩu — riêng handleLogin)
errCode  2  → 409 Conflict (trùng lặp)
errCode  3  → 404 Not Found (không tìm thấy)
errCode -1  → 500 Internal Server Error (lỗi server)
```

### ✅ userController.js — ĐÃ SỬA

| Hàm | Trước | Sau |
|-----|-------|-----|
| `handleLogin` — thiếu email/password | `status(200)` | `status(400)` |
| `handleLogin` — sai email/password | `status(200)` | `status(401)` |
| `handleLogin` — lỗi server | `status(200)` | `status(500)` |
| `handleGetAllUsers` — thiếu id | `status(200)` | `status(400)` |
| `handleGetAllUsers` — lỗi server | `status(200)` | `status(500)` |
| `handleCreateNewUser` — thành công | `status(200)` | `status(201)` |
| `handleCreateNewUser` — thiếu params | `status(200)` | `status(400)` |
| `handleCreateNewUser` — email trùng | `status(200)` | `status(409)` |
| `handleEditUser` — thiếu id | `status(200)` | `status(400)` |
| `handleEditUser` — không tìm thấy | `status(200)` | `status(404)` |
| `handleDeleteUser` — thiếu id | `status(200)` | `status(400)` |
| `handleDeleteUser` — không tìm thấy | `status(200)` | `status(404)` |
| `getAllCode` — thiếu type | `status(200)` | `status(400)` |
| `handleSearch` — thiếu keyword | `status(200)` | `status(400)` |
| Tất cả hàm — catch error | `status(200)` | `status(500)` |

### ✅ doctorController.js — ĐÃ SỬA

| Hàm | Thay đổi chính |
|-----|----------------|
| `getTopDoctorHome` | catch → `status(500)` |
| `getDetailDoctorById` | thiếu id → `400`, không tìm thấy → `404`, đọc `req.params.id` |
| `saveInfoDoctor` | lỗi → `400`, catch → `500` |
| `deleteDoctorInfo` | đọc `req.params.doctorId`, lỗi → `400/404/500` |
| `bulkCreateSchedule` | lỗi → `400`, catch → `500` |
| `deleteSchedule` | đọc `req.params.id`, lỗi → `400/404/500` |
| `getScheduleByDate` | đọc `req.params.doctorId`, thiếu → `400`, catch → `500` |
| `getListPatientForDoctor` | đọc `req.params.doctorId`, thiếu → `400`, catch → `500` |
| `sendRemedy` | lỗi → `400`, catch → `500` |
| `cancelBooking` | lỗi → `400/404/500` |
| `getPatientBookingHistory` | đọc `req.params.patientId`, thiếu → `400`, catch → `500` |

### ✅ patientController.js — ĐÃ SỬA

| Hàm | Thay đổi |
|-----|----------|
| `postBookAppointment` | lỗi validation → `400`, catch → `500` |
| `postVerifyBookAppointment` | đã xác nhận rồi → `409`, thiếu params → `400`, catch → `500` |

### ✅ specialtyController.js — ĐÃ SỬA

| Hàm | Thay đổi |
|-----|----------|
| `createSpecialty` | thành công → `201`, lỗi → `400`, catch → `500` |
| `getAllSpecialty` | catch → `500` |
| `getDetailSpecialtyById` | đọc `req.params.id`, không tìm thấy → `404` |
| `editSpecialty` | thiếu → `400`, không tìm thấy → `404`, catch → `500` |
| `deleteSpecialty` | đọc `req.params.id`, thiếu → `400`, không tìm thấy → `404` |

### ✅ clinicController.js — ĐÃ SỬA

| Hàm | Thay đổi |
|-----|----------|
| `createClinic` | thành công → `201`, lỗi → `400`, catch → `500` |
| `getAllClinic` | catch → `500` |
| `getDetailClinicById` | đọc `req.params.id`, không tìm thấy → `404` |
| `editClinic` | thiếu → `400`, không tìm thấy → `404`, catch → `500` |
| `deleteClinic` | đọc `req.params.id`, thiếu → `400`, không tìm thấy → `404` |

---

## Đơn 3: Chuẩn hóa `getAllUsers` Service

**File:** `src/services/userService.js` (dòng 45-59)

| | Trước | Sau |
|---|---|---|
| **Return thành công** | Trả trực tiếp mảng/object từ Sequelize | `{ errCode: 0, message: 'OK', data: users }` |
| **Return lỗi** | `return []` | `{ errCode: -1, message: 'Lỗi server!' }` |

✅ **Đã sửa:** `getAllUsers` giờ trả về wrapper object `{ errCode, message, data }` — đồng nhất với tất cả service khác.

**File:** `src/controllers/userController.js` — `handleGetAllUsers` cũng đã cập nhật để nhận wrapper từ service thay vì tự wrap.

---

## Đơn 4: RESTful URL Naming + API Versioning

**File:** `src/routes/web.js` — Viết lại toàn bộ

### Bảng ánh xạ route cũ → mới (30 endpoints)

| # | Method | Route cũ ❌ | Route mới ✅ |
|---|--------|------------|-------------|
| 1 | POST | `/api/login` | `/api/v1/auth/login` |
| 2 | GET | `/api/get-top-doctor-home` | `/api/v1/doctors/top` |
| 3 | GET | `/api/get-detail-doctor-by-id` | `/api/v1/doctors/:id` |
| 4 | GET | `/api/get-schedule-by-date` | `/api/v1/doctors/:doctorId/schedules` |
| 5 | POST | `/api/patient-book-appointment` | `/api/v1/bookings` |
| 6 | POST | `/api/verify-book-appointment` | `/api/v1/bookings/verify` |
| 7 | GET | `/api/get-all-specialty` | `/api/v1/specialties` |
| 8 | GET | `/api/get-detail-specialty-by-id` | `/api/v1/specialties/:id` |
| 9 | GET | `/api/get-all-clinic` | `/api/v1/clinics` |
| 10 | GET | `/api/get-detail-clinic-by-id` | `/api/v1/clinics/:id` |
| 11 | GET | `/api/allcode` | `/api/v1/allcode` |
| 12 | GET | `/api/search` | `/api/v1/search` |
| 13 | GET | `/api/get-all-users` | `/api/v1/users` |
| 14 | POST | `/api/create-new-user` | `/api/v1/users` |
| 15 | PUT | `/api/edit-user` | `/api/v1/users/:id` |
| 16 | DELETE | `/api/delete-user` | `/api/v1/users/:id` |
| 17 | POST | `/api/save-info-doctor` | `/api/v1/doctors` |
| 18 | DELETE | `/api/delete-doctor-info` | `/api/v1/doctors/:doctorId` |
| 19 | POST | `/api/bulk-create-schedule` | `/api/v1/schedules/bulk` |
| 20 | DELETE | `/api/delete-schedule` | `/api/v1/schedules/:id` |
| 21 | POST | `/api/create-new-specialty` | `/api/v1/specialties` |
| 22 | PUT | `/api/edit-specialty` | `/api/v1/specialties/:id` |
| 23 | DELETE | `/api/delete-specialty` | `/api/v1/specialties/:id` |
| 24 | POST | `/api/create-new-clinic` | `/api/v1/clinics` |
| 25 | PUT | `/api/edit-clinic` | `/api/v1/clinics/:id` |
| 26 | DELETE | `/api/delete-clinic` | `/api/v1/clinics/:id` |
| 27 | GET | `/api/get-list-patient-for-doctor` | `/api/v1/doctors/:doctorId/patients` |
| 28 | POST | `/api/send-remedy` | `/api/v1/bookings/:bookingId/remedy` |
| 29 | ~~POST~~ → **PATCH** | `/api/cancel-booking` | `/api/v1/bookings/:bookingId/cancel` |
| 30 | GET | `/api/get-patient-booking-history` | `/api/v1/patients/:patientId/bookings` |

### Thay đổi bổ sung — CORS (server.js)

Thêm `PATCH` vào allowed methods trong CORS config vì route cancel-booking giờ dùng `PATCH`:

```diff
-methods: ['GET', 'POST', 'PUT', 'DELETE'],
+methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
```

---

## Tổng kết Files đã thay đổi

| # | File | Đơn thuốc | Loại thay đổi |
|---|------|-----------|---------------|
| 1 | `src/routes/web.js` | Đơn 1 + 4 | Viết lại toàn bộ routes |
| 2 | `src/controllers/userController.js` | Đơn 2 + 3 | HTTP status + cập nhật getAllUsers |
| 3 | `src/controllers/doctorController.js` | Đơn 2 | HTTP status + đọc req.params |
| 4 | `src/controllers/patientController.js` | Đơn 2 | HTTP status |
| 5 | `src/controllers/specialtyController.js` | Đơn 2 | HTTP status + đọc req.params |
| 6 | `src/controllers/clinicController.js` | Đơn 2 | HTTP status + đọc req.params |
| 7 | `src/services/userService.js` | Đơn 3 | Chuẩn hóa wrapper response |
| 8 | `src/server.js` | Đơn 4 (bổ sung) | Thêm PATCH vào CORS |

---

## ✅ Kết luận

> **Tất cả 4 đơn thuốc + 7 tiêu chí từ Bảng tổng chẩn đoán đã được khắc phục hoàn toàn (7/7 🟢).**

Backend giờ đã đạt chuẩn:
- ✅ **100% RESTful API** — không còn dấu tích SSR, không còn `res.send()`
- ✅ **HTTP Status Code chuẩn** — 400, 401, 404, 409, 201, 500
- ✅ **Response đồng nhất** — tất cả service trả `{ errCode, message, data }`
- ✅ **URL noun-based** — `/api/v1/users`, `/api/v1/doctors/:id`
- ✅ **API Versioning** — prefix `/api/v1/`
- ✅ **CORS đầy đủ** — hỗ trợ GET, POST, PUT, PATCH, DELETE

> ⚠️ **Lưu ý:** Nếu đã có Frontend, cần cập nhật lại toàn bộ URL API calls cho khớp với route mới.
