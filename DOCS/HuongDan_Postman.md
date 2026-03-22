# 🧪 HƯỚNG DẪN TEST API BẰNG POSTMAN
> Dự án: **BookingCare Backend** — dành cho người mới bắt đầu

---

## BƯỚC 0 — CHUẨN BỊ

### 0.1. Cài đặt & khởi động

1. Tải Postman tại [postman.com/downloads](https://www.postman.com/downloads/) → cài như phần mềm thường
2. Mở VS Code → chạy server backend:
   ```
   npm run dev
   ```
3. Thấy dòng này là server đã chạy:
   ```
   Server is running on port 8080
   Database connected successfully
   ```

### 0.2. URL gốc (Base URL)

Tất cả request đều bắt đầu bằng:
```
http://localhost:8080
```

---

## BƯỚC 1 — TẠO COLLECTION (Nhóm request)

> Collection giống như một thư mục chứa tất cả request của project.

1. Mở Postman → nhìn bên trái → click **"Collections"**
2. Click nút **"+"** hoặc **"New Collection"**
3. Đặt tên: `BookingCare API`
4. Click **"Create"**

---

## BƯỚC 2 — TEST HEALTH CHECK (Request đầu tiên)

> Mục tiêu: Kiểm tra server có đang chạy không.

1. Click **"Add a request"** trong Collection vừa tạo
2. Điền vào ô URL phía trên:
   ```
   http://localhost:8080/api/health
   ```
3. Method (ô bên trái URL) giữ nguyên **GET**
4. Click nút **"Send"** (màu xanh)

**✅ Kết quả đúng:**
```json
{
    "errCode": 0,
    "message": "BookingCare Backend is running!"
}
```
Phía dưới status sẽ hiện **`200 OK`**

5. Nhấn **Ctrl+S** → đặt tên request: `Health Check` → Save

---

## BƯỚC 3 — ĐĂNG NHẬP & LẤY TOKEN

> Hầu hết API cần Token để xác minh bạn là ai. Bước này lấy Token đó.

### 3.1. Tạo request đăng nhập

1. Tạo request mới trong Collection
2. Đổi Method từ **GET** → **POST**
3. URL:
   ```
   http://localhost:8080/api/v1/auth/login
   ```

### 3.2. Điền Body (dữ liệu gửi lên)

1. Click tab **"Body"** (nằm dưới ô URL)
2. Chọn **"raw"**
3. Ở dropdown bên phải chọn **"JSON"** (thay vì Text)
4. Dán vào ô bên dưới:
   ```json
   {
       "email": "admin@bookingcare.vn",
       "password": "123456"
   }
   ```
5. Click **"Send"**

**✅ Kết quả đúng — status `200 OK`:**
```json
{
    "errCode": 0,
    "message": "OK",
    "data": {
        "id": 1,
        "email": "admin@bookingcare.vn",
        "roleId": "R1",
        "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
}
```

### 3.3. Copy Token

1. Trong response, tìm trường `"accessToken"`
2. Copy **toàn bộ chuỗi dài** sau dấu `:`  
   (chuỗi bắt đầu bằng `eyJ...`)
3. Lưu vào Notepad tạm thời — sẽ dùng cho các bước sau

> ⚠️ **Lưu ý:** Token có hiệu lực 24 giờ. Nếu gặp lỗi 401 → đăng nhập lại để lấy token mới.

---

## BƯỚC 4 — DÙNG TOKEN CHO CÁC API PRIVATE

> Các API của Admin và Doctor cần gửi kèm Token trong Header.

### Cách thêm Token vào request:

1. Tạo request mới (ví dụ: lấy danh sách users)
2. Method: **GET**, URL:
   ```
   http://localhost:8080/api/v1/users
   ```
3. Click tab **"Headers"** (nằm cạnh Body)
4. Điền vào bảng:
   - **Key:** `Authorization`
   - **Value:** `Bearer eyJhbGci...` *(dán token vào đây, nhớ giữ chữ `Bearer ` phía trước)*
5. Click **"Send"**

**✅ Kết quả đúng:** Danh sách users trả về

**❌ Nếu quên Token:** Status `401 Unauthorized`

---

## BƯỚC 5 — TEST CÁC API QUAN TRỌNG

### 5.1. Xem danh sách chuyên khoa (Public — không cần token)

| | |
|---|---|
| Method | GET |
| URL | `http://localhost:8080/api/v1/specialties` |
| Headers | Không cần |

---

### 5.2. Đặt lịch hẹn (Public)

| | |
|---|---|
| Method | POST |
| URL | `http://localhost:8080/api/v1/bookings` |
| Headers | Không cần |

**Body (raw → JSON):**
```json
{
    "doctorId": 2,
    "patientId": 5,
    "date": "2026-03-25",
    "timeType": "T1",
    "fullName": "Nguyễn Văn A",
    "email": "patient@gmail.com",
    "address": "Hà Nội",
    "reason": "Đau đầu"
}
```

**✅ Thành công:** Status `201 Created`  
**❌ Lịch đã đầy:** Status `400` với message tương ứng  
**❌ Đặt trùng:** Status `409 Conflict`

---

### 5.3. Tạo User mới (Admin — cần token R1)

| | |
|---|---|
| Method | POST |
| URL | `http://localhost:8080/api/v1/users` |
| Headers | `Authorization: Bearer <admin_token>` |

**Body:**
```json
{
    "email": "bacsi@bookingcare.vn",
    "password": "123456",
    "firstName": "Nguyễn",
    "lastName": "Bác Sĩ",
    "roleId": "R2",
    "gender": "G1"
}
```

**✅ Thành công:** Status `201 Created`  
**❌ Email đã tồn tại:** Status `409 Conflict`

---

### 5.4. Tìm kiếm

| | |
|---|---|
| Method | GET |
| URL | `http://localhost:8080/api/v1/search?keyword=tim` |
| Headers | Không cần |

> Đổi `tim` thành từ khác tùy ý để tìm kiếm.

---

## BƯỚC 6 — ĐỌC HIỂU KẾT QUẢ

### HTTP Status Code — ý nghĩa:

| Status | Màu | Ý nghĩa |
|--------|-----|---------|
| `200 OK` | 🟢 Xanh | Thành công (GET, PUT, PATCH) |
| `201 Created` | 🟢 Xanh | Tạo mới thành công (POST) |
| `400 Bad Request` | 🔴 Đỏ | Thiếu hoặc sai tham số |
| `401 Unauthorized` | 🔴 Đỏ | Thiếu token / token sai / sai mật khẩu |
| `403 Forbidden` | 🔴 Đỏ | Có token nhưng không đủ quyền |
| `404 Not Found` | 🔴 Đỏ | Không tìm thấy tài nguyên |
| `409 Conflict` | 🔴 Đỏ | Dữ liệu đã tồn tại (trùng email, trùng lịch) |
| `500 Internal Server Error` | 🔴 Đỏ | Lỗi server — xem terminal để debug |

### Cấu trúc Response của project:

```json
{
    "errCode": 0,      ← 0 = OK, 1 = lỗi, -1 = lỗi server
    "message": "...",  ← Mô tả kết quả
    "data": { ... }    ← Dữ liệu trả về (nếu có)
}
```

---

## BƯỚC 7 — SỬ DỤNG BIẾN MÔI TRƯỜNG (Nâng cao nhẹ)

> Cách này giúp không phải dán token thủ công mỗi lần.

### 7.1. Tạo Environment

1. Click icon ⚙️ góc trên phải → **"Environments"**
2. Click **"+"** → đặt tên `BookingCare Local`
3. Thêm biến:
   - **Variable:** `base_url` | **Initial Value:** `http://localhost:8080`
   - **Variable:** `token` | **Initial Value:** *(để trống, sẽ điền sau)*
4. Click **"Save"**

### 7.2. Dùng biến trong URL

Thay vì:
```
http://localhost:8080/api/v1/users
```
Dùng:
```
{{base_url}}/api/v1/users
```

### 7.3. Tự động lưu Token sau khi đăng nhập

Trong request Login, click tab **"Tests"** → dán code sau:
```javascript
const res = pm.response.json();
if (res.data && res.data.accessToken) {
    pm.environment.set("token", res.data.accessToken);
    console.log("Token đã được lưu!");
}
```

Sau đó trong Header của các request khác dùng:
```
Authorization: Bearer {{token}}
```

---

## QUICK REFERENCE — DANH SÁCH API ĐỂ TEST

### 🔓 Public (không cần token)

| Method | URL | Mô tả |
|--------|-----|-------|
| GET | `/api/health` | Health check |
| POST | `/api/v1/auth/login` | Đăng nhập |
| GET | `/api/v1/doctors/top?limit=5` | Top bác sĩ |
| GET | `/api/v1/doctors/2` | Chi tiết bác sĩ id=2 |
| GET | `/api/v1/doctors/2/schedules?date=2026-03-25` | Lịch khám |
| POST | `/api/v1/bookings` | Đặt lịch |
| GET | `/api/v1/specialties` | Danh sách chuyên khoa |
| GET | `/api/v1/clinics` | Danh sách phòng khám |
| GET | `/api/v1/search?keyword=tim` | Tìm kiếm |

### 🔒 Admin (cần token R1)

| Method | URL | Mô tả |
|--------|-----|-------|
| GET | `/api/v1/users` | Danh sách users |
| POST | `/api/v1/users` | Tạo user mới |
| PUT | `/api/v1/users/1` | Sửa user id=1 |
| DELETE | `/api/v1/users/1` | Xóa user id=1 |
| POST | `/api/v1/schedules/bulk` | Tạo lịch hàng loạt |

### 🩺 Doctor (cần token R2)

| Method | URL | Mô tả |
|--------|-----|-------|
| GET | `/api/v1/doctors/2/patients?date=2026-03-25` | DS bệnh nhân |
| POST | `/api/v1/bookings/3/remedy` | Gửi kết quả khám |
| PATCH | `/api/v1/bookings/3/cancel` | Hủy lịch |

---

## LỖI HAY GẶP & CÁCH SỬA

| Lỗi | Nguyên nhân | Cách sửa |
|-----|-------------|---------|
| `Cannot connect` / `ECONNREFUSED` | Server chưa chạy | Chạy `npm run dev` trong terminal |
| `401 Unauthorized` | Thiếu/hết hạn token | Đăng nhập lại, copy token mới |
| `400 Bad Request` | Body sai / thiếu trường | Kiểm tra lại JSON, đúng tên field chưa |
| `404 Not Found` | Sai URL hoặc ID không tồn tại | Kiểm tra lại URL, thử ID khác |
| `500 Internal Server Error` | Lỗi trong code server | Xem terminal VS Code để đọc lỗi |
| Body rỗng dù đã điền | Quên chọn `raw` + `JSON` | Click tab Body → raw → JSON |
