# BÁO CÁO PHÂN TÍCH VÀ KHẮC PHỤC LỖI HIỂN THỊ ẢNH BLOB

## Dự án: BookingCare — Hệ thống Đặt lịch khám bệnh trực tuyến
## Ngày: 04/04/2026
## Phiên bản: Fix-Image v2.0

---

## MỤC LỤC

1. [Tổng quan vấn đề](#1-tổng-quan-vấn-đề)
2. [Phân tích Root Cause](#2-phân-tích-root-cause)
3. [Danh sách lỗi phát hiện](#3-danh-sách-lỗi-phát-hiện)
4. [Chi tiết từng lỗi và code khắc phục](#4-chi-tiết-từng-lỗi-và-code-khắc-phục)
5. [Migration Script — Cleanup dữ liệu cũ](#5-migration-script--cleanup-dữ-liệu-cũ)
6. [Tổng kết các file đã sửa](#6-tổng-kết-các-file-đã-sửa)
7. [Hướng dẫn kiểm tra sau khi sửa](#7-hướng-dẫn-kiểm-tra-sau-khi-sửa)
8. [Ảnh hưởng đến các giai đoạn tiếp theo](#8-ảnh-hưởng-đến-các-giai-đoạn-tiếp-theo)

---

## 1. TỔNG QUAN VẤN ĐỀ

### 1.1. Triệu chứng
- Ảnh (avatar người dùng, ảnh chuyên khoa, ảnh phòng khám) đã được **lưu thành công** vào Database MySQL (kiểu dữ liệu `BLOB('long')`)
- Tuy nhiên khi lấy lên để **hiển thị trên giao diện**, ảnh **không hiện được** hoặc hiển thị ảnh bị hỏng (broken image icon)
- Trường hợp nghiêm trọng hơn: một số trang bị **trắng trắng (white screen)** do JavaScript lỗi khi xử lý dữ liệu ảnh sai format

### 1.2. Phạm vi ảnh hưởng

| Module | Trang/Component | Mức độ |
|--------|----------------|--------|
| Admin | Quản lý người dùng (UserManage) | 🔴 Nghiêm trọng |
| Admin | Quản lý chuyên khoa (SpecialtyManage) | 🔴 Nghiêm trọng |
| Admin | Quản lý phòng khám (ClinicManage) | 🔴 Nghiêm trọng |
| Admin | Quản lý bác sĩ (DoctorManage) | 🔴 Nghiêm trọng |
| Patient | Trang chủ — Carousel Chuyên khoa | 🟡 Trung bình |
| Patient | Trang chủ — Carousel Bác sĩ nổi bật | 🟡 Trung bình |
| Patient | Trang chủ — Carousel Cơ sở y tế | 🟡 Trung bình |
| Patient | Trang chi tiết chuyên khoa | 🟡 Trung bình |
| Patient | Trang chi tiết bác sĩ | 🟡 Trung bình |
| Patient | Trang chi tiết phòng khám | 🟡 Trung bình |
| Search | Kết quả tìm kiếm | 🟡 Trung bình |

---

## 2. PHÂN TÍCH ROOT CAUSE

### 2.1. Pipeline xử lý ảnh trong hệ thống

Hệ thống BookingCare xử lý ảnh theo 4 bước:

```
[Bước 1: Frontend Upload]     → [Bước 2: Backend Lưu DB]
[Bước 4: Frontend Hiển thị]   ← [Bước 3: Backend Đọc DB]
```

### 2.2. Luồng xử lý TRƯỚC KHI SỬA (SAI)

```
Bước 1: FileReader.readAsDataURL()
  → Output: "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
             ^^^^^^^^^^^^^^^^^^^^^^^  <- DATA URI PREFIX
                                      ^^^^^^^^^^^^^^^^ <- PURE BASE64 DATA

Bước 2: Sequelize .create({ image: data.imageBase64 })
  → MySQL BLOB nhận TOÀN BỘ string (CẢ prefix + base64 data)
  → Binary trong DB: 64 61 74 61 3A 69 6D 61 67 65 2F ... (bytes của "data:image/...")

Bước 3: Buffer.from(spec.image).toString('base64')
  → Encode TOÀN BỘ binary (gồm cả bytes của prefix) thành base64 MỚI
  → Output: "ZGF0YTppbWFnZS9qcGVnO2Jhc2U2NCwvOWov..."
             ← Đây là BASE64 CỦA "data:image/jpeg;base64,/9j/..." (DOUBLE ENCODED!)

Bước 4: CommonUtils.decodeBase64Image() thêm prefix
  → Output: "data:image/jpeg;base64,ZGF0YTppbWFnZS9qcGVnO2Jhc2U2NCwvOWov..."
  → Browser decode base64 → ra "data:image/jpeg;base64,/9j/..." (TEXT, KHÔNG PHẢI ẢNH!)
  → ❌ KHÔNG HIỂN THỊ ĐƯỢC
```

### 2.3. Luồng xử lý SAU KHI SỬA (ĐÚNG)

```
Bước 1: FileReader.readAsDataURL()
  → Output: "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
  → validateBase64Image() kiểm tra prefix, MIME type, size ✅

Bước 2: stripBase64Prefix() → Sequelize .create({ image: pureBase64 })
  → Chỉ lưu "/9j/4AAQSkZJRg..." vào BLOB (KHÔNG CÓ PREFIX)
  → Binary trong DB: chỉ chứa bytes của pure base64

Bước 3: convertBlobToBase64(blob)
  → Buffer.from(blob).toString('utf8') → "/9j/4AAQSkZJRg..." (ĐÚNG! Trả lại text gốc)
  ⚠️ TRƯỚC ĐÂY dùng toString('base64') → double-encode! (xem lỗi IMG-006)

Bước 4: CommonUtils.decodeBase64Image() thêm prefix
  → Output: "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
  → Browser decode → ẢNH GỐC
  → ✅ HIỂN THỊ ĐÚNG
```

---

## 3. DANH SÁCH LỖI PHÁT HIỆN

| # | Mã lỗi | Tên lỗi | Mức độ | File |
|---|--------|---------|--------|------|
| 1 | IMG-001 | Double-Encoding: Lưu data URI prefix vào BLOB | 🔴 Critical | specialtyService.js, clinicService.js, userService.js, doctorService.js |
| 2 | IMG-002 | Double-Encoding: Đọc BLOB không xử lý backward-compat | 🔴 Critical | Tất cả service đọc ảnh |
| 3 | IMG-003 | getTopDoctorHome() không convert image BLOB | 🟡 Major | doctorService.js |
| 4 | IMG-004 | searchService() không convert image BLOB | 🟡 Major | userService.js |
| 5 | IMG-005 | decodeBase64Image() không handle Buffer object | 🟢 Minor | CommonUtils.js |
| 6 | IMG-006 | convertBlobToBase64 dùng sai toString('base64') thay vì toString('utf8') | 🔴 Critical | convertBlobToBase64.js |
| 7 | IMG-007 | Body parser global limit 100KB chặn image upload | 🔴 Critical | server.js, web.js |
| 8 | IMG-008 | Axios interceptor auto-logout khi login sai (401) | 🟡 Major | axiosConfig.js (Frontend) |
| 9 | IMG-009 | Login error message bị mất — lấy err.message thay vì API message | 🟡 Major | userSlice.js (Frontend) |
| 10 | IMG-010 | Email service crash khi SMTP chưa cấu hình | 🟡 Major | emailService.js |

---

## 4. CHI TIẾT TỪNG LỖI VÀ CODE KHẮC PHỤC

---

### 4.1. LỖI IMG-001: Double-Encoding khi LƯU ảnh vào DB

#### Mô tả
Frontend gửi ảnh dạng Data URI: `"data:image/jpeg;base64,/9j/4AAQ..."`. Backend nhận qua `req.body` và lưu **nguyên chuỗi** (bao gồm cả prefix `data:image/jpeg;base64,`) vào MySQL BLOB. Điều này khiến BLOB chứa dữ liệu thừa, và khi đọc ra + encode lại base64 sẽ tạo ra **double encoding**.

#### File bị ảnh hưởng
- `src/services/specialtyService.js` — hàm `createSpecialty()` và `editSpecialty()`
- `src/services/clinicService.js` — hàm `createClinic()` và `editClinic()`
- `src/services/userService.js` — hàm `createNewUser()` và `editUser()`
- `src/services/doctorService.js` — hàm `saveInfoDoctor()`

#### Giải pháp: Tạo utility `stripBase64Prefix.js`

**File mới:** `src/utils/stripBase64Prefix.js`

```javascript
// src/utils/stripBase64Prefix.js
// ✅ [FIX-IMAGE] Utility: Loại bỏ prefix "data:image/...;base64," khỏi chuỗi base64
// trước khi lưu vào MySQL BLOB — tránh Double-Encoding bug

/**
 * Loại bỏ data URI prefix khỏi chuỗi base64 image.
 * @param {string} dataUri - "data:image/jpeg;base64,/9j/4AAQ..."
 * @returns {string} Pure base64: "/9j/4AAQ..."
 */
const stripBase64Prefix = (dataUri) => {
  if (!dataUri || typeof dataUri !== 'string') return dataUri;
  return dataUri.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
};

module.exports = { stripBase64Prefix };
```

#### Code SAI → Code ĐÚNG cho từng file

**specialtyService.js — `createSpecialty()`:**
```diff
  await db.Specialty.create({
    name: data.name,
-   image: data.imageBase64 || '',
+   // ✅ [FIX-IMAGE] Strip prefix TRƯỚC khi lưu vào BLOB
+   // Thứ tự: validate (cần prefix) → strip (bỏ prefix) → save (pure base64)
+   image: data.imageBase64 ? stripBase64Prefix(data.imageBase64) : '',
    descriptionHTML: sanitizeContent(data.descriptionHTML),
    descriptionMarkdown: data.descriptionMarkdown || '',
  });
```

**specialtyService.js — `editSpecialty()`:**
```diff
  if (data.imageBase64) {
    const imgResult = validateBase64Image(data.imageBase64);
    if (!imgResult.isValid) {
      return { errCode: 4, message: imgResult.error };
    }
-   specialty.image = data.imageBase64;
+   // ✅ [FIX-IMAGE] Strip prefix trước khi lưu
+   specialty.image = stripBase64Prefix(data.imageBase64);
  }
```

**clinicService.js — `createClinic()`:**
```diff
  await db.Clinic.create({
    name: data.name,
    address: data.address,
-   image: data.imageBase64 || '',
+   // ✅ [FIX-IMAGE] Strip prefix TRƯỚC khi lưu vào BLOB
+   image: data.imageBase64 ? stripBase64Prefix(data.imageBase64) : '',
    descriptionHTML: sanitizeContent(data.descriptionHTML),
    descriptionMarkdown: data.descriptionMarkdown || '',
  });
```

**clinicService.js — `editClinic()`:**
```diff
  if (data.imageBase64) {
    const imgResult = validateBase64Image(data.imageBase64);
    if (!imgResult.isValid) {
      return { errCode: 4, message: imgResult.error };
    }
-   clinic.image = data.imageBase64;
+   // ✅ [FIX-IMAGE] Strip prefix trước khi lưu
+   clinic.image = stripBase64Prefix(data.imageBase64);
  }
```

**userService.js — `createNewUser()`:**
```diff
  await db.User.create({
    email: data.email,
    password: hashedPassword,
    ...
-   image: data.image || '',
+   // ✅ [FIX-IMAGE] Strip prefix trước khi lưu vào BLOB
+   image: data.image ? stripBase64Prefix(data.image) : '',
    positionId: data.positionId || '',
  });
```

**userService.js — `editUser()`:**
```diff
  if (data.image) {
    const imgResult = validateBase64Image(data.image);
    if (!imgResult.isValid) {
      return { errCode: 4, message: imgResult.error };
    }
-   user.image = data.image;
+   // ✅ [FIX-IMAGE] Strip prefix trước khi lưu
+   user.image = stripBase64Prefix(data.image);
  }
```

**doctorService.js — `saveInfoDoctor()`:**
```diff
  if (data.image) {
    const imgResult = validateBase64Image(data.image);
    if (imgResult.isValid) {
-     await db.User.update({ image: data.image }, { where: { id: data.doctorId } });
+     await db.User.update(
+       { image: stripBase64Prefix(data.image) },
+       { where: { id: data.doctorId } }
+     );
    }
  }
```

> **LƯU Ý QUAN TRỌNG:** Thứ tự xử lý PHẢI là:
> 1. `validateBase64Image(data.imageBase64)` — Validate cần prefix để kiểm tra MIME type
> 2. `stripBase64Prefix(data.imageBase64)` — Strip prefix SAU KHI validate thành công
> 3. Lưu vào DB

---

### 4.2. LỖI IMG-002: Đọc BLOB không tương thích ngược

#### Mô tả
Hàm đọc ảnh hiện tại dùng `Buffer.from(blob).toString('base64')` — đúng cho data mới (pure base64) nhưng **sai cho data cũ** (có prefix). Cần utility function xử lý cả 2 trường hợp.

#### Giải pháp: Tạo utility `convertBlobToBase64.js`

**File mới:** `src/utils/convertBlobToBase64.js`

```javascript
// src/utils/convertBlobToBase64.js — PHIÊN BẢN v2 (ĐÃ SỬA)
// ✅ [FIX-IMAGE v2] Utility: Convert MySQL BLOB → base64 string an toàn

/**
 * Convert BLOB/Buffer từ MySQL → pure base64 string.
 * Tương thích ngược với cả data cũ (có prefix) và data mới (pure base64).
 * @param {Buffer|string|null} blob - Image data từ database
 * @returns {string} Pure base64 string (không có prefix data:image/...)
 */
const convertBlobToBase64 = (blob) => {
  if (!blob) return '';

  // Nếu đã là string → xử lý trực tiếp
  if (typeof blob === 'string') {
    return blob.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  }

  // ✅ [FIX v2] Buffer → toString('utf8') để lấy lại base64 TEXT gốc
  // TRƯỚC ĐÂY: dùng toString('base64') → DOUBLE ENCODE! (xem lỗi IMG-006)
  // Lý do: BLOB lưu "iVBORw0KGgo..." dưới dạng UTF-8 bytes
  //         toString('base64') encode bytes → "aVZCT1J3MEtH..." (SAI!)
  //         toString('utf8') decode bytes → "iVBORw0KGgo..." (ĐÚNG!)
  const utf8String = Buffer.from(blob).toString('utf8');

  // Strip prefix nếu có (backward-compat với data cũ)
  return utf8String.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
};

module.exports = { convertBlobToBase64 };
```

#### Code SAI → Code ĐÚNG cho hàm đọc ảnh

**specialtyService.js — `getAllSpecialty()` và `getDetailSpecialtyById()`:**
```diff
  specialties.forEach((spec) => {
    if (spec.image) {
-     spec.setDataValue('image', Buffer.from(spec.image).toString('base64'));
+     // ✅ [FIX-IMAGE] Convert BLOB → pure base64 (tương thích cả data cũ & mới)
+     spec.setDataValue('image', convertBlobToBase64(spec.image));
    }
  });
```

**clinicService.js — `getAllClinic()` và `getDetailClinicById()`:**
```diff
  clinics.forEach((clinic) => {
    if (clinic.image) {
-     clinic.setDataValue('image', Buffer.from(clinic.image).toString('base64'));
+     // ✅ [FIX-IMAGE] Convert BLOB → pure base64
+     clinic.setDataValue('image', convertBlobToBase64(clinic.image));
    }
  });
```

**userService.js — `getAllUsers()`:**
```diff
  const convertImage = (user) => {
    if (user && user.image) {
-     const imgBase64 = Buffer.from(user.image).toString('base64');
-     user.setDataValue('image', imgBase64);
+     // ✅ [FIX-IMAGE] Convert BLOB → pure base64
+     user.setDataValue('image', convertBlobToBase64(user.image));
    }
    return user;
  };
```

**doctorService.js — `getDetailDoctorById()`:**
```diff
  if (doctor.image) {
-   const imageBase64 = Buffer.from(doctor.image).toString('base64');
-   doctor.setDataValue('image', imageBase64);
+   // ✅ [FIX-IMAGE] Convert BLOB → pure base64
+   doctor.setDataValue('image', convertBlobToBase64(doctor.image));
  }
```

---

### 4.3. LỖI IMG-003: `getTopDoctorHome()` không convert image BLOB

#### Mô tả
Hàm `getTopDoctorHome()` trong `doctorService.js` dùng Sequelize với option `raw: true`, trả về plain JavaScript object. Khác với `raw: false` (trả Sequelize Model instance), plain object **không tự động serialize BLOB thành string**. Kết quả là `doctor.image` được gửi về frontend dưới dạng **Buffer object thô**, không thể hiển thị được.

Ngoài ra, hàm này cũng **THIẾU bước convert** BLOB → base64, dẫn đến:
- Frontend nhận `image: { type: "Buffer", data: [137, 80, 78, ...] }` (JSON serialized Buffer)
- `CommonUtils.decodeBase64Image()` nhận object, không phải string → trả rỗng hoặc crash

#### Code SAI:
```javascript
// getTopDoctorHome — TRƯỚC KHI SỬA
const getTopDoctorHome = async (limit) => {
  const doctors = await db.User.findAll({
    limit: limit,
    where: { roleId: 'R2' },
    order: [['createdAt', 'DESC']],
    attributes: { exclude: ['password'] },
    include: [...],
    raw: true,    // ← Trả plain object → image vẫn là Buffer
    nest: true,
  });
  return { errCode: 0, data: doctors };
  // ← THIẾU bước convert image!
};
```

#### Code ĐÚNG:
```javascript
// getTopDoctorHome — SAU KHI SỬA
const getTopDoctorHome = async (limit) => {
  const doctors = await db.User.findAll({
    limit: limit,
    where: { roleId: 'R2' },
    order: [['createdAt', 'DESC']],
    attributes: { exclude: ['password'] },
    include: [...],
    raw: false,   // ← Trả Sequelize instance → có setDataValue()
    nest: true,
  });
  // ✅ [FIX-IMAGE] Convert BLOB → pure base64 cho tất cả doctors
  doctors.forEach((doc) => {
    if (doc.image) {
      doc.setDataValue('image', convertBlobToBase64(doc.image));
    }
  });
  return { errCode: 0, data: doctors };
};
```

#### Giải thích thay đổi:
1. **`raw: true` → `raw: false`**: Để có thể dùng `setDataValue()` (method của Sequelize Model instance)
2. **Thêm vòng lặp convert**: Duyệt qua tất cả doctors, convert BLOB → base64

---

### 4.4. LỖI IMG-004: `searchService()` không convert image BLOB

#### Mô tả
Hàm `searchService()` trong `userService.js` trả về kết quả tìm kiếm doctors, specialties, clinics — tất cả đều có trường `image`. Tuy nhiên, hàm này **không có bước convert** BLOB → base64 cho bất kỳ loại nào. Ngoài ra, query dùng `raw: true` (mặc định) nên không thể dùng `setDataValue()`.

#### Code SAI:
```javascript
// searchService — TRƯỚC KHI SỬA
const doctors = await db.User.findAll({
  where: { roleId: 'R2', ... },
  attributes: ['id', 'firstName', 'lastName', 'image'],
  include: [...],
  raw: true,     // ← plain object
  nest: true,
});
// ← THIẾU convert image!

const specialties = await db.Specialty.findAll({
  where: { name: likeQuery },
  attributes: ['id', 'name', 'image'],
  // ← raw mặc định = true, THIẾU convert image!
});

const clinics = await db.Clinic.findAll({
  where: { ... },
  attributes: ['id', 'name', 'address', 'image'],
  // ← raw mặc định = true, THIẾU convert image!
});
```

#### Code ĐÚNG:
```javascript
// searchService — SAU KHI SỬA
const doctors = await db.User.findAll({
  where: { roleId: 'R2', ... },
  attributes: ['id', 'firstName', 'lastName', 'image'],
  include: [...],
  raw: false,    // ← Sequelize instance
  nest: true,
});
// ✅ [FIX-IMAGE] Convert BLOB → base64 cho kết quả tìm kiếm
doctors.forEach((doc) => {
  if (doc.image) {
    doc.setDataValue('image', convertBlobToBase64(doc.image));
  }
});

const specialties = await db.Specialty.findAll({
  where: { name: likeQuery },
  attributes: ['id', 'name', 'image'],
  raw: false,    // ← Sequelize instance
});
// ✅ [FIX-IMAGE] Convert BLOB → base64
specialties.forEach((spec) => {
  if (spec.image) {
    spec.setDataValue('image', convertBlobToBase64(spec.image));
  }
});

const clinics = await db.Clinic.findAll({
  where: { ... },
  attributes: ['id', 'name', 'address', 'image'],
  raw: false,    // ← Sequelize instance
});
// ✅ [FIX-IMAGE] Convert BLOB → base64
clinics.forEach((clinic) => {
  if (clinic.image) {
    clinic.setDataValue('image', convertBlobToBase64(clinic.image));
  }
});
```

---

### 4.5. LỖI IMG-005: Frontend `decodeBase64Image()` không handle edge cases

#### Mô tả
Hàm `CommonUtils.decodeBase64Image()` ở frontend chỉ kiểm tra 2 case:
1. Đã có prefix `data:image` → trả luôn
2. Mọi thứ khác → thêm prefix

Thiếu kiểm tra nếu input **không phải string** (Buffer object khi backend dùng `raw: true`), dẫn đến lỗi crash khi gọi `.startsWith()` trên non-string value.

#### Code SAI:
```javascript
static decodeBase64Image(base64String) {
  if (!base64String) return '';
  // Thiếu: không check typeof!
  if (base64String.startsWith('data:image')) return base64String;
  return `data:image/jpeg;base64,${base64String}`;
}
```

#### Code ĐÚNG:
```javascript
// ✅ [FIX-IMAGE] Cải thiện xử lý nhiều format
static decodeBase64Image(base64String) {
  if (!base64String) return '';
  // Nếu không phải string (Buffer object từ raw query) → không xử lý được
  if (typeof base64String !== 'string') return '';
  // Nếu đã có prefix data:image → trả luôn (trường hợp frontend tự tạo)
  if (base64String.startsWith('data:image')) return base64String;
  // Pure base64 từ backend (sau khi đã fix) → thêm prefix để browser render
  return `data:image/jpeg;base64,${base64String}`;
}
```

---

### 4.6. LỖI IMG-006: `convertBlobToBase64` dùng sai `toString('base64')` thay vì `toString('utf8')`

#### Mô tả
Đây là **ROOT CAUSE thực sự** khiến ảnh không hiển thị dù đã fix tất cả lỗi trên.

Khi `stripBase64Prefix` loại bỏ prefix, pure base64 text (ví dụ: `"iVBORw0KGgo..."`) được lưu vào MySQL BLOB. MySQL BLOB lưu dữ liệu dưới dạng **binary bytes** — tức là các ký tự ASCII/UTF-8 của chuỗi base64.

Khi đọc ra, `convertBlobToBase64` dùng `Buffer.from(blob).toString('base64')` — hàm này **encode binary bytes thành base64 MỘT LẦN NỮA**, tạo ra double-encode:

```
LƯU VÀO DB:
  "iVBORw0KGgo..." (pure base64 text)
  → MySQL BLOB lưu: 69 56 42 4F 52 77 30 4B 47 67 6F ... (UTF-8 bytes)

ĐỌC RA (SAI — toString('base64')):
  Buffer [69 56 42 4F 52 77 30 4B ...] → toString('base64') → "aVZCT1J3MEtH..."
  ← Đây là base64 CỦA "iVBORw0KGgo..." → DOUBLE ENCODED!
  ← Browser không thể decode thành ảnh!

ĐỌC RA (ĐÚNG — toString('utf8')):
  Buffer [69 56 42 4F 52 77 30 4B ...] → toString('utf8') → "iVBORw0KGgo..."
  ← Trả lại đúng text gốc → Browser decode thành ảnh OK!
```

#### Code SAI (v1):
```javascript
// convertBlobToBase64.js — PHIÊN BẢN v1 (SAI!)
const base64String = Buffer.from(blob).toString('base64'); // ← DOUBLE ENCODE!
```

#### Code ĐÚNG (v2):
```javascript
// convertBlobToBase64.js — PHIÊN BẢN v2 (ĐÚNG!)
// ✅ [FIX v2] toString('utf8') thay vì toString('base64')
const utf8String = Buffer.from(blob).toString('utf8');
// Strip prefix nếu có (backward-compat với data cũ)
return utf8String.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
```

#### Cách phân biệt
| Phương thức | Input (BLOB bytes) | Output | Đúng/Sai |
|------------|-------------------|--------|----------|
| `toString('base64')` | `69 56 42 4F 52 77...` | `"aVZCT1J3..."` | ❌ Double-encoded |
| `toString('utf8')` | `69 56 42 4F 52 77...` | `"iVBORw0K..."` | ✅ Đúng text gốc |

---

### 4.7. LỖI IMG-007: Body parser global limit 100KB chặn image upload

#### Mô tả
Express server áp dụng `bodyParser.json({ limit: '100kb' })` ở **global level** (middleware cho toàn bộ app). Mặc dù các route nhận ảnh có thêm middleware `jsonLarge` (6MB) ở **route level**, nhưng Express xử lý middleware theo thứ tự:

1. Global middleware `jsonSmall` (100kb) chạy TRƯỚC
2. Body > 100kb → Express ném `PayloadTooLargeError` NGAY LẬP TỨC
3. Route-level `jsonLarge` (6mb) KHÔNG BAO GIỜ được gọi

→ Ảnh dưới 5MB vẫn bị reject bởi limit 100kb!

#### Triệu chứng
- Frontend: validate ảnh < 5MB → gửi lên backend → nhận lại "Lỗi server!"
- Backend log: `PayloadTooLargeError: request entity too large`

#### Code SAI (server.js):
```javascript
// server.js — TRƯỚC KHI SỬA
const jsonSmall = bodyParser.json({ limit: '100kb' });    // ← 100KB cho TOÀN BỘ app
const jsonLarge = bodyParser.json({ limit: '6mb' });      // ← 6MB cho image routes
app.use(jsonSmall);  // ← Parse body ĐẦU TIÊN → reject > 100kb
app.locals.jsonLarge = jsonLarge;  // ← Export cho routes dùng
```

```javascript
// web.js — TRƯỚC KHI SỬA
const jsonLarge = app.locals.jsonLarge;
app.post('/api/v1/users', verifyToken, checkAdminRole, jsonLarge, controller);
// ← jsonLarge KHÔNG CÓ TÁC DỤNG vì body đã bị jsonSmall reject rồi!
```

#### Code ĐÚNG (server.js):
```javascript
// server.js — SAU KHI SỬA
// ✅ [FIX-IMAGE] DS-01 FIX v2: Tăng limit global lên 8mb
app.use(bodyParser.json({ limit: '8mb' }));
app.use(bodyParser.urlencoded({ limit: '8mb', extended: true }));
// → Không cần jsonLarge ở route level nữa
```

```javascript
// web.js — SAU KHI SỬA: Xóa hết jsonLarge khỏi routes
app.post('/api/v1/users', verifyToken, checkAdminRole, controller);
app.post('/api/v1/specialties', verifyToken, checkAdminRole, controller);
// ...tương tự cho tất cả route
```

---

### 4.8. LỖI IMG-008: Axios interceptor auto-logout khi login sai (401)

#### Mô tả
Axios response interceptor ở frontend bắt **TẤT CẢ response 401** → tự động gọi `processLogout()` + redirect về `/login`. Vấn đề: khi nhập sai email/password, backend trả 401 (đúng chuẩn HTTP) → interceptor auto-logout ngay lập tức → **trang login KHÔNG BAO GIỜ hiển thị được thông báo lỗi** cho người dùng.

#### Triệu chứng
- Nhập sai mật khẩu → trang nhấp nháy (redirect) → không thấy thông báo lỗi
- Console: `>>> Token expired, auto logout...` (dù đang ở trang login!)

#### Code SAI (axiosConfig.js):
```javascript
// axiosConfig.js — TRƯỚC KHI SỬA
if (status === 401) {
  console.warn('>>> Token expired, auto logout...');
  store.dispatch(processLogout());      // ← Logout CẢ khi login sai!
  window.location.href = '/login';       // ← Redirect vô nghĩa (đang ở login rồi!)
}
```

#### Code ĐÚNG (axiosConfig.js):
```javascript
// axiosConfig.js — SAU KHI SỬA
if (status === 401) {
  // ✅ [FIX] Phân biệt 401 login vs 401 token expired
  const requestUrl = error.config?.url || '';
  if (!requestUrl.includes('/auth/login')) {
    // Chỉ logout khi 401 từ protected route (token expired)
    console.warn('>>> Token expired, auto logout...');
    store.dispatch(processLogout());
    window.location.href = '/login';
  }
  // 401 từ /auth/login → KHÔNG logout, để component hiển thị lỗi
}
```

---

### 4.9. LỖI IMG-009: Login error message bị mất

#### Mô tả
Redux thunk `loginUser` bắt error từ Axios bằng `catch (err)` rồi lấy `err.message`. Tuy nhiên, `err.message` của Axios error là `"Request failed with status code 401"` — KHÔNG PHẢI message từ API response (`"Sai mật khẩu!"` hoặc `"Email không tồn tại!"`).

Message thực sự nằm trong `err.response.data.message` nhưng không được truy cập.

#### Triệu chứng
- Login sai → hiển thị `Request failed with status code 401` thay vì `Sai mật khẩu!`

#### Code SAI (userSlice.js):
```javascript
} catch (err) {
  return rejectWithValue(err.message || 'Lỗi kết nối server!');
  // <- err.message = "Request failed with status code 401" (Axios error)
}
```

#### Code ĐÚNG (userSlice.js):
```javascript
} catch (err) {
  // ✅ [FIX] Lấy message từ API response body
  const apiMessage = err.response?.data?.message;
  return rejectWithValue(apiMessage || err.message || 'Lỗi kết nối server!');
}
```

---

### 4.10. LỖI IMG-010: Email service crash khi SMTP chưa cấu hình

#### Mô tả
emailService.js tạo nodemailer transporter với credentials từ .env. Nếu chưa cấu hình email thật, booking flow sẽ crash và rollback toàn bộ.

#### Triệu chứng
- Đặt lịch → "Lỗi server!" / Backend log: ECONNREFUSED

#### Giải pháp
Kiểm tra credentials trước khi tạo transporter. Nếu chưa cấu hình → skip email, booking vẫn thành công.

---

## 5. MIGRATION SCRIPT — CLEANUP DỮ LIỆU CŨ

Chạy script cleanup 1 lần để thống nhất format ảnh cũ:

```bash
cd bookingcare-backend
node src/scripts/cleanupOldImageData.js
```

- Sử dụng Transaction — nếu lỗi → rollback toàn bộ
- Chỉ UPDATE — không xóa, không đổi schema. Idempotent.

---

## 6. TỔNG KẾT CÁC FILE ĐÃ SỬA

### 6.1. File MỚI tạo

| # | File | Mục đích |
|---|------|---------|
| 1 | src/utils/stripBase64Prefix.js | Strip data URI prefix trước khi lưu DB |
| 2 | src/utils/convertBlobToBase64.js | Convert BLOB → base64 (v2: toString utf8) |
| 3 | src/scripts/cleanupOldImageData.js | Cleanup data cũ trong DB |

### 6.2. File ĐÃ SỬA — Backend (19 thay đổi)

| # | File | Thay đổi |
|---|------|---------|
| 1-4 | specialtyService.js | Strip prefix khi lưu + convertBlobToBase64 khi đọc |
| 5-8 | clinicService.js | Strip prefix khi lưu + convertBlobToBase64 khi đọc |
| 9-12 | userService.js | Strip prefix + convertBlobToBase64 + search fix |
| 13-15 | doctorService.js | raw:false + convert image + strip prefix |
| 16 | convertBlobToBase64.js | [IMG-006] toString base64 → toString utf8 |
| 17 | server.js | [IMG-007] Body parser limit 100kb → 8mb |
| 18 | routes/web.js | [IMG-007] Xóa jsonLarge middleware |
| 19 | emailService.js | [IMG-010] Skip email khi SMTP chưa cấu hình |

### 6.3. File ĐÃ SỬA — Frontend (3 thay đổi)

| # | File | Thay đổi |
|---|------|---------|
| 1 | CommonUtils.js | [IMG-005] decodeBase64Image check typeof |
| 2 | axiosConfig.js | [IMG-008] Skip auto-logout cho login 401 |
| 3 | userSlice.js | [IMG-009] Lấy err.response.data.message |

---

## 7. HƯỚNG DẪN KIỂM TRA SAU KHI SỬA

| # | Test Case | Kết quả mong đợi |
|---|-----------|------------------|
| 1 | Upload ảnh User/Specialty/Clinic | Ảnh hiển thị đúng sau khi lưu |
| 2 | Homepage carousels | Ảnh chuyên khoa, bác sĩ, phòng khám hiển thị |
| 3 | Chi tiết bác sĩ/chuyên khoa | Avatar và ảnh hiển thị đúng |
| 4 | Tìm kiếm | Ảnh trong kết quả tìm kiếm hiển thị |
| 5 | Login sai mật khẩu | Hiển thị "Sai mật khẩu!" (không bị redirect) |
| 6 | Đặt lịch (chưa có email) | Đặt lịch thành công (email bị skip) |
| 7 | Upload ảnh dưới 5MB | Lưu thành công (không PayloadTooLargeError) |

---

## 8. ẢNH HƯỞNG ĐẾN CÁC GIAI ĐOẠN TIẾP THEO

### 8.1. Tương thích hoàn toàn
Các thay đổi KHÔNG ảnh hưởng đến: API contract, Database schema, Kiến trúc hệ thống.

### 8.2. Quy tắc cho phát triển tương lai
1. Model: Dùng DataTypes.BLOB('long')
2. Lưu: validateBase64Image → stripBase64Prefix → save
3. Đọc: raw:false → convertBlobToBase64 → setDataValue
4. Frontend: CommonUtils.decodeBase64Image

---

*Tài liệu — BookingCare Fix-Image v2.0*
