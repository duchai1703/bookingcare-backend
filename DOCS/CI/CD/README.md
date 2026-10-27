# 🚀 BOOKINGCARE — TRUNG TÂM TÀI LIỆU DEVOPS & CI/CD
> **Thư mục:** `DOCS/CI/CD/`  
> **Hệ thống:** BookingCare Platform (Backend & Frontend)  
> **Phiên bản:** 2.0-Production | **Cập nhật:** 27/10/2026

---

## 📌 GIỚI THIỆU & MỤC TIÊU TÀI LIỆU

Thư mục này là **Single Source of Truth (Nguồn thông tin duy nhất)** về toàn bộ kiến trúc hạ tầng DevOps, quy trình đồng bộ Git đa nền tảng và hệ thống CI/CD tự động hóa của dự án BookingCare.

Tài liệu được biên soạn phục vụ 2 mục đích chính:
1. **Dành cho Người mới (Newcomer Onboarding):** Giúp thành viên mới tiếp nhận dự án hiểu ngay toàn bộ những gì đã làm, tự thiết lập môi trường máy tính và bắt đầu làm việc trong vòng 10 phút.
2. **Dành cho Người vận hành (Context Retention & Maintenance):** Lưu trữ lại toàn bộ ngữ cảnh kỹ thuật, các sự cố thực tế đã khắc phục, đặc tả từng tệp cấu hình để tra cứu nhanh khi bảo trì hoặc mở rộng hệ thống.

---

## 🗺️ MỤC LỤC & ĐIỀU HƯỚNG TÀI LIỆU

Cụm tài liệu được chia thành các chuyên đề độc lập, rõ ràng:

| Tệp tài liệu | Nội dung chính | Đối tượng |
| :--- | :--- | :--- |
| 📘 **[`01_ONBOARDING_AND_GIT_SYNC.md`](01_ONBOARDING_AND_GIT_SYNC.md)** | • Hướng dẫn clone và cài đặt môi trường từ đầu.<br>• Cơ chế Dual-Remote Push song song GitHub & GitLab.<br>• Lịch sử các lỗi thực chiến đã xử lý (Auth, Unrelated Histories, Protected Branch). | Lập trình viên mới, người kế thừa mã nguồn |
| ⚙️ **[`02_PIPELINE_ARCHITECTURE_AND_SPECS.md`](02_PIPELINE_ARCHITECTURE_AND_SPECS.md)** | • Đặc tả chi tiết luồng hoạt động của `.gitlab-ci.yml` và GitHub Actions.<br>• Kiến trúc Docker Multi-Stage Builder $\rightarrow$ Alpine Runtime.<br>• Cơ chế Tối ưu hóa Caching và GitLab Container Registry. | Kỹ sư DevOps, Tech Lead |
| 🛡️ **[`03_DEPLOYMENT_RUNBOOK_AND_SECRETS.md`](03_DEPLOYMENT_RUNBOOK_AND_SECRETS.md)** | • Hướng dẫn cấu hình GitLab Variables (Từ điển biến môi trường bí mật).<br>• Tích hợp SSH Deploy Key và script bọc thép `deploy.sh`.<br>• Chốt chặn Boot Guard múi giờ `+07:00` và Quy trình Rollback khẩn cấp. | Người triển khai Production, Quản trị hệ thống |

---

## 🏗️ TỔNG QUAN KIẾN TRÚC HỆ THỐNG & PIPELINE

```
+-------------------------------------------------------------------------------+
|                            LẬP TRÌNH VIÊN (LOCAL)                             |
|  - Commit mã nguồn qua VS Code hoặc Terminal                                  |
|  - Lệnh "git push origin main" tự động bắn lên đồng thời cả 2 nền tảng:        |
+-----------------------+-------------------------------+-----------------------+
                        |                               |
                        v                               v
        +-------------------------------+ +-------------------------------+
        |       GITHUB REPOSITORY       | |       GITLAB REPOSITORY       |
        |  (duchai1703/bookingcare-...) | | (training/booking-care/...)   |
        +---------------+---------------+ +---------------+---------------+
                        |                               |
                        v (Tự động kích hoạt)           v (Tự động kích hoạt)
        +-------------------------------+ +-------------------------------+
        |      GITHUB ACTIONS CI        | |       GITLAB CI/CD RUNNER     |
        |  - Node.js 18 Syntax Check    | |  [Stage 1: Quality Gate]      |
        |  - Security Audit             | |    - npm ci & syntax check    |
        |  - Docker Build Validation    | |    - CVE Dependency Audit     |
        +-------------------------------+ |  [Stage 2: Package]           |
                                          |    - Docker Multi-Stage Build |
                                          |    - Push to Container Reg    |
                                          |  [Stage 3: CD Deploy]         |
                                          |    - SSH Production Server    |
                                          |    - Execute deploy.sh        |
                                          |    - Audit Timezone +07:00    |
                                          +---------------+---------------+
                                                          |
                                                          v
                                          +-------------------------------+
                                          |    PRODUCTION SERVER (VPS)    |
                                          |  - PostgreSQL 16 & Redis      |
                                          |  - App Backend & Nginx Front  |
                                          |  - Mạng cô lập 3-Tier         |
                                          +-------------------------------+
```

---

## ⚡ HƯỚNG DẪN BẮT ĐẦU NHANH CHO NGƯỜI MỚI (QUICK SUMMARY)

1. **Nếu bạn vừa nhận bàn giao máy:**
   * Mở ngay tệp [`01_ONBOARDING_AND_GIT_SYNC.md`](01_ONBOARDING_AND_GIT_SYNC.md) làm theo các bước từ 1 đến 4 để thiết lập quyền truy cập và liên kết 2 remote.
2. **Nếu bạn cần kiểm tra luồng CI/CD:**
   * Mở tệp [`02_PIPELINE_ARCHITECTURE_AND_SPECS.md`](02_PIPELINE_ARCHITECTURE_AND_SPECS.md) để xem cách các Stage tự động chạy và cách Docker Image được đóng gói.
3. **Nếu bạn chuẩn bị deploy lên Server thật:**
   * Mở tệp [`03_DEPLOYMENT_RUNBOOK_AND_SECRETS.md`](03_DEPLOYMENT_RUNBOOK_AND_SECRETS.md) để nạp các biến môi trường vào GitLab và chạy lệnh triển khai an toàn.
