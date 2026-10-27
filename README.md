# BookingCare — Backend API Service

> Hệ thống Đặt lịch Khám bệnh Y tế Trực tuyến (Online Medical Appointment Booking System)  
> Kiến trúc: **Node.js 18 LTS** | **Express 5** | **PostgreSQL 16 Alpine** | **Redis** | **Docker 3-Tier**

---

## 📌 Tổng quan dự án

`bookingcare-backend` cung cấp toàn bộ API dịch vụ cho nền tảng BookingCare, bao gồm:
* Quản lý đặt lịch khám bệnh, chuyên khoa, phòng khám và bác sĩ.
* Tích hợp trợ lý y tế AI (Google Gemini AI), đánh giá nguy cơ lâm sàng, RAG Cancellation Policy.
* Quản lý ví bệnh nhân, thanh toán VNPay, chính sách rút tiền cho cơ sở y tế.
* Hệ thống thông báo thời gian thực (Socket.io) và email xác nhận (Nodemailer).
* Kiến trúc bảo mật đa tầng: Mạng cô lập 3-Tier (Gateway - App - Database/Cache), xác thực múi giờ nguyên tử `+07:00` (Asia/Ho_Chi_Minh).

---

## 📚 Tài liệu kỹ thuật & Bàn giao (Documentation)

Toàn bộ tài liệu chi tiết được lưu trữ trong thư mục [`DOCS/`](file:///d:/2_Projects/2_1_Dai_Hoc/BookingCare/bookingcare-backend/DOCS):

* 🚀 **[Tài liệu Bàn giao Git Đa Nền tảng & Kế hoạch CI/CD](file:///d:/2_Projects/2_1_Dai_Hoc/BookingCare/bookingcare-backend/DOCS/HANDOVER_DEVOPS_CICD_AND_SYNC_GUIDE.md)**: Hướng dẫn chi tiết dành cho người mới tiếp nhận dự án (Onboarding), cơ chế đồng bộ song song GitHub & GitLab, và kế hoạch triển khai CI/CD 4 phase.
* 📋 **[Đặc tả Yêu cầu Phần mềm (SRS)](file:///d:/2_Projects/2_1_Dai_Hoc/BookingCare/bookingcare-backend/DOCS/SRS_Document.md)**: Phân tích nghiệp vụ, ca sử dụng và kiến trúc dữ liệu.
* 🛠️ **[Hướng dẫn Phát triển & Vận hành Backend](file:///d:/2_Projects/2_1_Dai_Hoc/BookingCare/bookingcare-backend/DOCS/Phase4_Backend_Development_Guide.md)**: Chi tiết cấu hình dịch vụ, API endpoints và luồng xử lý.
* 💰 **[Sổ tay Quản lý Tài chính & Ngân quỹ](file:///d:/2_Projects/2_1_Dai_Hoc/BookingCare/bookingcare-backend/DOCS/ADMIN_FINANCIAL_TREASURY_MANUAL.md)**: Nghiệp vụ ví, đối soát và giải ngân.

---

## ⚡ Hướng dẫn Khởi chạy Nhanh (Quick Start)

### 1. Khởi chạy môi trường phát triển cục bộ (Local Development)

```bash
# 1. Cài đặt các gói phụ thuộc
npm install

# 2. Tạo file cấu hình môi trường từ mẫu
cp .env.example .env

# 3. Khởi tạo dữ liệu AllCode mặc định
npm run seed

# 4. Chạy server ở chế độ theo dõi thay đổi (nodemon)
npm run dev
```

### 2. Khởi chạy bằng Docker (Production / Staging)

Dự án hỗ trợ triển khai bằng Docker Compose với cụm mạng 3-tier độc lập:

```bash
# Triển khai tự động bằng script bảo mật bọc thép
sudo bash deploy.sh
```
*Script sẽ tự động bảo mật quyền file `.env.production` (`chmod 600`), khởi tạo cụm container, và rà soát log xác thực múi giờ `+07:00` trong 60 giây.*

---

## 🔄 Cơ chế Đồng bộ Git Song Song (Dual-Remote)

Repository được cấu hình để mỗi khi thực hiện `git push`, code sẽ tự động được đẩy lên đồng thời cả 2 nền tảng:
1. **GitHub:** `https://github.com/duchai1703/bookingcare-backend.git` (Portfolio/Cá nhân)
2. **GitLab:** `https://gitlab.s2.ttpprojects.com/training/booking-care/bookingcare-backend.git` (Đào tạo/Nộp bài)

```bash
# Chỉ cần 1 lệnh duy nhất để đẩy lên cả 2 nơi:
git push origin main
```
*(Chi tiết cấu hình và xử lý sự cố xem tại [Tài liệu Bàn giao Kỹ thuật](file:///d:/2_Projects/2_1_Dai_Hoc/BookingCare/bookingcare-backend/DOCS/HANDOVER_DEVOPS_CICD_AND_SYNC_GUIDE.md)).*
