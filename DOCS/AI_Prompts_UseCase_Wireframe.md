# Prompts Cho AI Vẽ Use Case Diagram & Figma AI Wireframe

**Dự án:** Hệ thống đặt lịch khám bệnh trực tuyến  
**Nguồn:** [SRS_Document.md](file:///c:/Users/USER/Documents/DOAN1/DOCS/SRS_Document.md)

---

## 1. Prompt Vẽ Use Case Diagram (Dùng cho ChatGPT, Gemini, hoặc bất kỳ AI nào hỗ trợ vẽ diagram)

### Prompt chính (Copy & Paste):

```
Vẽ cho tôi sơ đồ Use Case Diagram chuẩn UML cho hệ thống "Đặt lịch khám bệnh trực tuyến" với các thông tin sau:

**3 Actors:**
- Admin (Quản trị viên)
- Bệnh nhân (Patient)
- Bác sĩ (Doctor)

**Use Cases cho Admin:**
1. Quản lý người dùng (CRUD)
2. Quản lý bác sĩ (CRUD + Markdown editor)
3. Quản lý phòng khám (CRUD)
4. Quản lý chuyên khoa (CRUD)
5. Quản lý lịch khám bác sĩ (Bulk create T1-T8)
6. Phân quyền role (R1, R2, R3)

**Use Cases cho Bệnh nhân:**
1. Xem trang chủ (Homepage)
2. Tìm kiếm bác sĩ/chuyên khoa
3. Xem chi tiết bác sĩ
4. Đặt lịch khám bệnh (4 bước)
5. Xác thực email lịch hẹn
6. Like/Share Facebook
7. Chat với Chatbot Messenger

**Use Cases cho Bác sĩ:**
1. Xem dashboard lịch hẹn
2. Xem chi tiết bệnh nhân
3. Cập nhật trạng thái lịch hẹn (Xác nhận → Hoàn thành / Hủy)
4. Gửi kết quả khám qua email (kèm file đính kèm)

**Shared Use Case (Include):**
- "Đăng nhập" được <<include>> bởi tất cả use cases của Admin và Bác sĩ
- "Gửi email" được <<include>> bởi "Đặt lịch khám" và "Gửi kết quả khám"

**Yêu cầu:**
- Vẽ đúng chuẩn UML Use Case Diagram
- System boundary box có tên "Hệ thống đặt lịch khám bệnh trực tuyến"
- Actors ở bên ngoài system boundary
- Mũi tên association từ Actor đến Use Case
- Dùng <<include>> cho shared use cases
- Tiếng Việt cho tên use cases
- Xuất hình ảnh rõ ràng, đẹp, chuyên nghiệp
```

### Prompt phụ (nếu AI không vẽ được, yêu cầu PlantUML code):

```
Viết code PlantUML cho Use Case Diagram ở trên. Tôi sẽ dùng trang plantuml.com/plantuml để render ra hình ảnh.
```

---

## 2. Prompts Figma AI Wireframe (9 trang)

> **Cách dùng:** Mở Figma → Bật Figma AI (Make Designs) → Paste từng prompt bên dưới

---

### Trang 1: 🔴 Homepage (Trang chủ)

```
Design a medical appointment booking homepage for a Vietnamese healthcare platform called "Đặt lịch khám bệnh". The page should include:

1. TOP: Navigation bar with logo on left, language switcher (VI/EN) on right
2. HERO: Full-width carousel/banner with medical images and a prominent search bar in the center (placeholder: "Tìm bác sĩ, chuyên khoa...")
3. SECTION 1: "Chuyên khoa phổ biến" - Horizontal scrollable cards showing medical specialties (Nội khoa, Ngoại khoa, Tim mạch, Da liễu, etc.) with icons/images and names
4. SECTION 2: "Bác sĩ nổi bật" - Horizontal scrollable doctor cards with: circular avatar photo, doctor name, specialty name, short description
5. SECTION 3: "Phòng khám nổi bật" - Horizontal scrollable clinic cards with: clinic photo, clinic name, address
6. FOOTER: Basic footer with copyright info

Style: Clean, modern medical theme. Primary color: #45C3D2 (teal/cyan). White background. Rounded cards with subtle shadows. Vietnamese text. Desktop layout (1440px wide). Reference design: BookingCare.vn
```

---

### Trang 2: 🔴 Chi tiết bác sĩ + Modal đặt lịch

```
Design a doctor detail page for a medical booking system with 2 states:

STATE 1 - DOCTOR DETAIL PAGE:
- LEFT column (40%): Doctor photo (large), name with position badge (e.g. "Tiến sĩ"), specialty name
- RIGHT column (60%):
  - Markdown-rendered doctor introduction/bio text
  - "Lịch khám" section: Date picker (showing next 7 days), then 8 time slot buttons in 2 rows (8:00-9:00, 9:00-10:00, ..., 16:00-17:00). Available slots are teal, booked slots are greyed out
  - Price info: "Giá khám: 200.000đ"
  - Clinic info: Clinic name and address
  - Facebook Like and Share buttons at bottom

STATE 2 - BOOKING MODAL (overlay):
- Title: "Đặt lịch khám bệnh"
- Shows selected doctor name, date, time slot at top
- Form fields: Họ tên*, Email*, Số điện thoại*, Lý do khám, Ngày sinh, Giới tính (dropdown: Nam/Nữ/Khác), Địa chỉ (dropdown by province)
- Two buttons: "Hủy" (outline) and "Xác nhận đặt lịch" (teal filled)

Style: Clean medical theme, primary #45C3D2, Vietnamese text, desktop 1440px
```

---

### Trang 3: 🔴 Dashboard Admin

```
Design an admin dashboard for a medical booking management system:

LEFT SIDEBAR (250px, dark background #282c34):
- Logo at top
- Menu items with icons:
  1. Quản lý người dùng (Users icon)
  2. Quản lý bác sĩ (Stethoscope icon)
  3. Quản lý lịch khám (Calendar icon)
  4. Quản lý phòng khám (Hospital icon)
  5. Quản lý chuyên khoa (Category icon)
- User info at bottom: Admin name, Logout button

MAIN CONTENT (right side):
Show "Quản lý người dùng" (User Management) active state:
- Header: "Quản lý người dùng" with "Tạo mới" button (teal)
- Data table with columns: ID, Email, Họ tên, Số điện thoại, Địa chỉ, Role (tag: Admin/Doctor/Patient), Actions (Edit/Delete icons)
- Table shows 5 sample rows
- Pagination at bottom

Style: Professional admin panel, clean table design, Vietnamese text, desktop 1440px
```

---

### Trang 4: 🟡 Dashboard Bác sĩ

```
Design a doctor dashboard for managing patient appointments:

LEFT SIDEBAR (250px, dark #282c34):
- Logo at top
- Single menu item: "Quản lý lịch hẹn bệnh nhân" (active, highlighted)
- Doctor info at bottom with logout

MAIN CONTENT:
- Header: "Quản lý lịch hẹn bệnh nhân"
- Date picker: Dropdown or calendar widget to select date (showing today's date)
- Patient list table with columns:
  - STT (index number)
  - Thông tin bệnh nhân (Patient name, email, phone)
  - Thời gian (Time slot, e.g. "8:00 - 9:00")
  - Lý do khám (Reason)
  - Trạng thái (Status tag: "Đã xác nhận" in blue, "Đã khám" in green, "Đã hủy" in red)
  - Actions: "Hoàn thành" button (green), "Hủy" button (red), "Gửi kết quả" button (blue, only for completed)
- Show 4-5 sample rows with different statuses

Style: Clean medical dashboard, Vietnamese text, desktop 1440px, primary #45C3D2
```

---

### Trang 5: 🟡 Trang đăng nhập

```
Design a simple login page for a medical appointment booking system:

- Centered card on a light gray background
- Logo and system name "Hệ thống đặt lịch khám bệnh" at top of card
- Form fields:
  - Email input with envelope icon
  - Password input with lock icon and show/hide toggle
- "Đăng nhập" button (full width, teal #45C3D2)
- Error message area (red text, hidden by default)
- Footer text: "© 2026 - Đặt lịch khám bệnh trực tuyến"

Style: Minimal, clean, centered layout. Desktop and mobile responsive. Vietnamese text.
```

---

### Trang 6 & 7: 🟢 Danh sách bác sĩ theo chuyên khoa/phòng khám

```
Design a doctor listing page filtered by specialty for a medical booking system:

- Header: Specialty name with background image banner (e.g. "Nội khoa - Internal Medicine")
- Below: Description text about the specialty (2-3 lines)
- Location filter: Dropdown "Chọn tỉnh/thành" to filter doctors by province
- Doctor list: Vertical list of doctor cards, each card contains:
  - LEFT: Circular doctor avatar
  - MIDDLE: Doctor name, position, specialty, short bio (2 lines)
  - RIGHT: Available time slots for today as small buttons
  - "Xem thêm" link to doctor detail page
- Show 3-4 doctor cards

Style: Clean list layout, Vietnamese text, desktop 1440px, primary #45C3D2
```

---

### Trang 8: 🟢 Xác nhận email

```
Design a simple email verification result page for a medical booking system:

SUCCESS STATE:
- Centered content on white background
- Large green checkmark icon
- Title: "Xác nhận lịch hẹn thành công!"
- Details card showing:
  - Bác sĩ: Dr. Nguyễn Văn A
  - Chuyên khoa: Nội khoa
  - Ngày: 10/03/2026
  - Giờ: 8:00 - 9:00
- Message: "Vui lòng đến đúng giờ. Cảm ơn bạn đã sử dụng dịch vụ."
- "Về trang chủ" button (teal)

Style: Minimal, centered, Vietnamese text
```

---

### Trang 9: 🟢 Form gửi kết quả khám (Modal)

```
Design a modal dialog for doctors to send medical results to patients via email:

- Modal title: "Gửi kết quả khám bệnh"
- Patient info at top: Name, Email (read-only)
- File upload area: Drag & drop zone with text "Kéo thả file hoặc nhấn để chọn" (supports PDF, JPEG, PNG)
- Preview of uploaded file (thumbnail)
- "Hủy" button (outline) and "Gửi email" button (teal filled)

Style: Clean modal, Vietnamese text, overlay on dark background
```

---

## 3. Mẹo sử dụng

### Figma AI:

1. Mở Figma → New file → Nhấn phím `/` hoặc tìm "Make Designs"
2. Paste prompt → Enter
3. Chỉnh sửa kết quả theo ý muốn
4. Export → PNG (2x) để đưa vào báo cáo

### Use Case Diagram:

1. Dùng ChatGPT/Gemini → Paste prompt → Tải hình
2. **Hoặc** dùng PlantUML code → Paste vào [plantuml.com](http://www.plantuml.com/plantuml/uml/) → Download PNG
3. Đưa vào báo cáo Section 10.1
