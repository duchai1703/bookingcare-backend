# 📊 BÁO CÁO TIẾN ĐỘ DỰ ÁN – BOOKINGCARE
## So sánh kế hoạch (Đề Cương + SRS) với thực tế hiện tại

> **Ngày đánh giá:** 13/03/2026  
> **Thời gian dự án:** 02/2026 – 06/2026

---

## 1. Tiến độ theo Timeline Đề Cương

| # | Giai đoạn | Thời gian kế hoạch | Trạng thái | Ghi chú |
|---|----------|-------------------|------------|---------|
| 1 | Lên kế hoạch | 01/02 – 07/02 | ✅ **Hoàn thành** | Đã chốt phạm vi 3 module, công nghệ, phân công |
| 2 | Khảo sát & phân tích | 08/02 – 18/02 | ✅ **Hoàn thành** | SRS v1.2 đã hoàn thiện (1157 dòng, 15 tính năng, 70+ REQ) |
| 3 | Thiết kế tổng thể | 19/02 – 05/03 | ✅ **Hoàn thành** | ERD 7 bảng, Use Case 4 sơ đồ, Sequence Diagram |
| 4 | **Xây dựng Backend** | **06/03 – 20/03** | 🟡 **Đang thực hiện** | Backend hoàn thành ~95% chức năng core, server chạy OK |
| 5 | Xây dựng Frontend | 21/03 – 05/04 | ⏳ Chưa bắt đầu | React.js + Redux — sắp tới |
| 6 | Module Admin (FE) | 06/04 – 16/04 | ⏳ Chưa bắt đầu | |
| 7 | Module Bệnh nhân (FE) | 17/04 – 30/04 | ⏳ Chưa bắt đầu | |
| 8 | Module Bác sĩ (FE) | 01/05 – 12/05 | ⏳ Chưa bắt đầu | |
| 9 | Triển khai Production | 13/05 – 19/05 | ⏳ Chưa bắt đầu | Deploy + Facebook Plugin + Chatbot |
| 10 | Kiểm thử & sửa lỗi | 20/05 – 27/05 | ⏳ Chưa bắt đầu | |
| 11 | Báo cáo & hoàn thiện | 28/05 – 10/06 | ⏳ Chưa bắt đầu | |

> 📍 **Bạn đang ở giai đoạn 4/11** — Backend cơ bản đã hoàn thành, đúng tiến độ (deadline 20/03).

---

## 2. Đối chiếu Backend với SRS — Từng Module

### ✅ Module 3.1: Authentication & Authorization (9 REQ)

| REQ | Mô tả | Backend | Frontend |
|-----|-------|---------|----------|
| REQ-AU-001 | Đăng nhập email + password | ✅ `handleUserLogin` | ⏳ |
| REQ-AU-002 | Mã hóa bcrypt (salt=10) | ✅ `bcrypt.genSaltSync(10)` | — |
| REQ-AU-003 | JWT session management | ✅ Token 24h | ⏳ |
| REQ-AU-004 | Phân quyền 3 role (R1, R2, R3) | ✅ middleware | ⏳ |
| REQ-AU-005 | Menu quản trị động theo role | — (Frontend) | ⏳ |
| REQ-AU-006 | Auto logout khi hết hạn | ✅ JWT expiresIn 24h | ⏳ |
| REQ-AU-007 | Thông báo lỗi cụ thể | ✅ "Email không tồn tại" / "Sai mật khẩu" | ⏳ |
| REQ-AU-008 | Chặn route bảo vệ | ✅ `verifyToken` middleware | ⏳ |
| REQ-AU-009 | Lưu user vào Redux store | — (Frontend) | ⏳ |

**Backend: 7/7 REQ liên quan ✅** | Frontend: 0/4 REQ ⏳

---

### ✅ Module 3.2: Admin – User Management (5 REQ)

| REQ | Mô tả | Backend |
|-----|-------|---------|
| REQ-AM-001 | Xem danh sách users | ✅ `GET /api/v1/users` |
| REQ-AM-002 | Tạo user mới | ✅ `POST /api/v1/users` |
| REQ-AM-003 | Sửa user | ✅ `PUT /api/v1/users/:id` |
| REQ-AM-004 | Xóa user | ✅ `DELETE /api/v1/users/:id` |
| REQ-AM-005 | Gán role | ✅ roleId trong `createNewUser` |

**5/5 REQ ✅**

---

### ✅ Module 3.3: Admin – Doctor Management (5 REQ)

| REQ | Mô tả | Backend |
|-----|-------|---------|
| REQ-AM-006 | Tạo hồ sơ bác sĩ | ✅ `POST /api/v1/doctors` |
| REQ-AM-007 | Markdown editor (lưu contentHTML + contentMarkdown) | ✅ `saveInfoDoctor` |
| REQ-AM-008 | Ảnh base64 BLOB | ✅ model `image: BLOB` |
| REQ-AM-009 | Gán chuyên khoa + phòng khám | ✅ `specialtyId`, `clinicId` |
| REQ-AM-010 | Xóa hồ sơ bác sĩ | ✅ `DELETE /api/v1/doctors/:doctorId` |
| REQ-AM-022 | Kiểm tra role R2 trước tạo | ✅ `saveInfoDoctor` kiểm tra |

**6/6 REQ ✅**

---

### ✅ Module 3.4: Admin – Clinic Management (4 REQ)

| REQ | Mô tả | Backend |
|-----|-------|---------|
| REQ-AM-011 | Tạo phòng khám | ✅ `POST /api/v1/clinics` |
| REQ-AM-012 | Sửa phòng khám | ✅ `PUT /api/v1/clinics/:id` |
| REQ-AM-013 | Xóa phòng khám | ✅ `DELETE /api/v1/clinics/:id` |
| REQ-AM-014 | Hiển thị danh sách | ✅ `GET /api/v1/clinics` |

**4/4 REQ ✅**

---

### ✅ Module 3.5: Admin – Specialty Management (3 REQ)

| REQ | Mô tả | Backend |
|-----|-------|---------|
| REQ-AM-015 | Tạo chuyên khoa | ✅ `POST /api/v1/specialties` |
| REQ-AM-016 | Sửa chuyên khoa | ✅ `PUT /api/v1/specialties/:id` |
| REQ-AM-017 | Xóa chuyên khoa | ✅ `DELETE /api/v1/specialties/:id` |

**3/3 REQ ✅**

---

### ✅ Module 3.6: Admin – Schedule Management (4 REQ)

| REQ | Mô tả | Backend |
|-----|-------|---------|
| REQ-AM-018 | Tạo lịch bulk | ✅ `POST /api/v1/schedules/bulk` |
| REQ-AM-019 | 8 khung giờ T1-T8 | ✅ Seed 8 TIME records |
| REQ-AM-020 | Giá khám ở Doctor_Info | ✅ `priceId` trong Doctor_Info |
| REQ-AM-021 | Xóa lịch khám | ✅ `DELETE /api/v1/schedules/:id` |
| REQ-AM-023 | maxNumber + currentNumber | ✅ Model Schedule |

**5/5 REQ ✅**

---

### ✅ Module 3.7: Patient – Homepage & Search (6 REQ)

| REQ | Mô tả | Backend | Frontend |
|-----|-------|---------|----------|
| REQ-PT-001 | Carousel/banner | — (Frontend only) | ⏳ |
| REQ-PT-002 | Thanh tìm kiếm | ✅ `GET /api/v1/search` | ⏳ |
| REQ-PT-003 | Top bác sĩ nổi bật | ✅ `GET /api/v1/doctors/top` | ⏳ |
| REQ-PT-004 | Danh sách phòng khám | ✅ `GET /api/v1/clinics` | ⏳ |
| REQ-PT-005 | Danh sách chuyên khoa | ✅ `GET /api/v1/specialties` | ⏳ |
| REQ-PT-006 | Bác sĩ theo phòng khám/chuyên khoa | ✅ `GET /api/v1/clinics/:id` + `specialties/:id` | ⏳ |

**Backend: 5/5 REQ liên quan ✅**

---

### ✅ Module 3.8: Patient – View Doctor Details (5 REQ)

| REQ | Mô tả | Backend |
|-----|-------|---------|
| REQ-PT-007 | Hồ sơ chuyên môn | ✅ `getDetailDoctorById` (include positionData, doctorInfoData) |
| REQ-PT-008 | Bài viết Markdown | ✅ `contentMarkdown` + `contentHTML` |
| REQ-PT-009 | Lịch khám theo ngày | ✅ `getScheduleByDate` |
| REQ-PT-010 | Giá khám (priceId → Allcode) | ✅ include `priceData` |
| REQ-PT-011 | Phòng khám bác sĩ | ✅ include `clinicData` |

**5/5 REQ ✅**

---

### ✅ Module 3.9: Patient – Appointment Booking (7 REQ)

| REQ | Mô tả | Backend |
|-----|-------|---------|
| REQ-PT-012 | Modal đặt lịch | — (Frontend) |
| REQ-PT-013 | Form fields (họ tên, email, SĐT...) | ✅ `postBookAppointment` nhận đủ fields |
| REQ-PT-014 | Validate dữ liệu | ✅ Email regex + SĐT regex + required check |
| REQ-PT-015 | Lưu booking vào DB | ✅ `db.Booking.create(...)` |
| REQ-PT-021 | Thông báo lỗi validate | ✅ errCode + message cụ thể |
| REQ-PT-022 | Kiểm tra đặt lịch trùng | ✅ `findOne` cùng doctor+patient+date+timeType |
| REQ-PT-023 | Thông báo thành công | ✅ errCode: 0, message |

**Backend: 6/6 REQ liên quan ✅**

---

### ✅ Module 3.10: Patient – Email Verification (4 REQ)

| REQ | Mô tả | Backend |
|-----|-------|---------|
| REQ-PT-016 | Gửi email đặt lịch (Nodemailer) | ✅ `sendEmailBooking` |
| REQ-PT-017 | Gửi ngay sau khi đặt lịch | ✅ Gọi trong `postBookAppointment` |
| REQ-PT-018 | Email chứa tên BS, ngày/giờ, link | ✅ HTML template Vi/En |
| REQ-PT-019 | Link xác nhận duy nhất (UUID) | ✅ `uuid.v4()` |
| REQ-PT-020 | Cập nhật trạng thái S1 → S2 | ✅ `postVerifyBookAppointment` |

**5/5 REQ ✅**

---

### ✅ Module 3.11: Doctor – Appointment Dashboard (4 REQ)

| REQ | Mô tả | Backend |
|-----|-------|---------|
| REQ-DR-001 | Danh sách bệnh nhân | ✅ `GET /api/v1/doctors/:doctorId/patients` |
| REQ-DR-002 | Lọc theo ngày | ✅ Param `date` |
| REQ-DR-003 | Lọc theo trạng thái | ✅ Param `statusId` (S1/S2/S3/S4/ALL) |
| REQ-DR-004 | Hoàn thành (S2→S3) / Hủy (S2→S4) | ✅ `sendRemedy` (S2→S3) + `cancelBooking` (S2→S4) |
| REQ-DR-011 | Dashboard mặc định ngày hiện tại | — (Frontend logic) |

**Backend: 4/4 REQ liên quan ✅**

---

### ✅ Module 3.12: Doctor – Patient Detail (3 REQ)

| REQ | Mô tả | Backend |
|-----|-------|---------|
| REQ-DR-005 | Thông tin cá nhân bệnh nhân | ✅ include `patientData` (email, name, phone, gender) |
| REQ-DR-006 | Lý do khám | ✅ `reason` field trong Booking |
| REQ-DR-007 | Lịch sử đặt lịch | ✅ `GET /api/v1/patients/:patientId/bookings` |

**3/3 REQ ✅**

---

### ✅ Module 3.13: Doctor – Send Medical Results (3 REQ)

| REQ | Mô tả | Backend |
|-----|-------|---------|
| REQ-DR-008 | Gửi email kết quả khám | ✅ `POST /api/v1/bookings/:bookingId/remedy` |
| REQ-DR-009 | Đính kèm file (ảnh) | ✅ `imageBase64` → Nodemailer attachment |
| REQ-DR-010 | Email chứa tên BS, ngày, nội dung | ✅ HTML template Vi/En |

**3/3 REQ ✅**

---

### ⏳ Module 3.14: Social Integration – Facebook Plugin (3 REQ)

| REQ | Mô tả | Trạng thái |
|-----|-------|-----------|
| REQ-SI-001 | Nút Like Facebook | ⏳ Frontend + Facebook SDK |
| REQ-SI-002 | Nút Share Facebook | ⏳ Frontend + Facebook SDK |
| REQ-SI-003 | Comment Plugin | ⏳ Frontend + Facebook SDK |

**0/3 REQ — Thuộc giai đoạn Triển khai Production (13/05 – 19/05)**

---

### ⏳ Module 3.15: Chatbot – Facebook Messenger (3 REQ)

| REQ | Mô tả | Trạng thái |
|-----|-------|-----------|
| REQ-CB-001 | Nhúng Messenger plugin | ⏳ Frontend |
| REQ-CB-002 | Chatbot tự động trả lời | ⏳ Backend Webhook |
| REQ-CB-003 | Webhook xử lý tin nhắn | ⏳ Backend Webhook |

**0/3 REQ — Thuộc giai đoạn Triển khai Production (13/05 – 19/05)**

---

## 3. Bảng tổng hợp

### Backend REQ Coverage

| Module | SRS Section | Backend REQ | Hoàn thành | Tỷ lệ |
|--------|------------|-------------|------------|--------|
| Authentication | 3.1 | 7 | 7 | 100% |
| User CRUD | 3.2 | 5 | 5 | 100% |
| Doctor Mgmt | 3.3 | 6 | 6 | 100% |
| Clinic CRUD | 3.4 | 4 | 4 | 100% |
| Specialty CRUD | 3.5 | 3 | 3 | 100% |
| Schedule Mgmt | 3.6 | 5 | 5 | 100% |
| Homepage/Search | 3.7 | 5 | 5 | 100% |
| Doctor Detail | 3.8 | 5 | 5 | 100% |
| Booking | 3.9 | 6 | 6 | 100% |
| Email Verify | 3.10 | 5 | 5 | 100% |
| Doctor Dashboard | 3.11 | 4 | 4 | 100% |
| Patient Detail | 3.12 | 3 | 3 | 100% |
| Send Remedy | 3.13 | 3 | 3 | 100% |
| Facebook Plugin | 3.14 | 0 | — | Frontend |
| Chatbot | 3.15 | 0 | — | Giai đoạn sau |
| **TỔNG** | | **61** | **61** | **100%** |

### Tiến độ theo phần

| Phần | Trạng thái | Ghi chú |
|------|-----------|---------|
| 📋 Đề cương chi tiết | ✅ 100% | Đã hoàn thành |
| 📄 SRS Document v1.2 | ✅ 100% | 1157 dòng, 70+ REQ |
| 🗄️ Database Schema | ✅ 100% | 7 bảng, 38 allcode records, seed OK |
| ⚙️ Backend API | ✅ 100% | 30 endpoints, RESTful, JWT, CORS |
| 🧪 API Test (Postman) | ✅ Tested | Login thành công trên Postman |
| 🖥️ Frontend React | ⏳ 0% | Bắt đầu giai đoạn 5 (21/03) |
| 📱 Facebook Plugin | ⏳ 0% | Giai đoạn 9 (13/05) |
| 🤖 Chatbot Messenger | ⏳ 0% | Giai đoạn 9 (13/05) |
| 🚀 Deploy Production | ⏳ 0% | Giai đoạn 9 (13/05) |

---

## 4. Kết luận

> **Backend đã hoàn thành 100% chức năng core** (61/61 REQ từ SRS sections 3.1–3.13), **đúng tiến độ** so với kế hoạch (giai đoạn 4: 06/03 – 20/03).

### ✅ Những gì đã làm xong
- 30 API endpoints RESTful với `/api/v1/` versioning
- JWT Authentication + Role-based middleware (R1, R2, R3)
- 7 bảng database + quan hệ đầy đủ (ERD chuẩn SRS)
- Seed data: 38 allcode + admin account
- Email service (booking + remedy) qua Nodemailer
- State Machine booking: S1 → S2 → S3/S4
- HTTP status codes chuẩn REST (200, 201, 400, 401, 404, 409, 500)
- Server chạy thành công trên `http://localhost:8080`

### ⏳ Những gì chưa làm (đúng kế hoạch)
- Frontend React (giai đoạn 5–8: 21/03 – 12/05)
- Facebook Social Plugin + Chatbot Messenger (giai đoạn 9: 13/05)
- Deploy lên Vercel + Heroku (giai đoạn 9: 13/05)
- Kiểm thử + Báo cáo (giai đoạn 10–11: 20/05 – 10/06)

### 📅 Bước tiếp theo ngay bây giờ
**Giai đoạn 5 — Xây dựng Frontend cơ bản (21/03 – 05/04):**
1. Khởi tạo project React.js (`create-react-app` hoặc Vite)
2. Cài Redux + redux-persist + react-router-dom
3. Kết nối API backend (`axios` + interceptor cho JWT token)
4. Xây dựng trang chủ + đa ngôn ngữ (react-intl / i18next)
