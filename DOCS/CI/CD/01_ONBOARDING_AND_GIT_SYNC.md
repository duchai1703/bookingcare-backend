# CHUYÊN ĐỀ 01: HƯỚNG DẪN ONBOARDING & ĐỒNG BỘ GIT ĐA NỀN TẢNG
> **Vị trí tài liệu:** `DOCS/CI/CD/01_ONBOARDING_AND_GIT_SYNC.md`  
> **Áp dụng cho:** Lập trình viên mới, người kế thừa mã nguồn, DevOps Engineer

---

## 1. TỔNG QUAN KIẾN TRÚC DUAL-REMOTE

Dự án BookingCare được cấu hình để duy trì đồng thời trên **hai dịch vụ lưu trữ Git độc lập**:
1. **GitHub cá nhân (`duchai1703`):** Lưu trữ mã nguồn, phục vụ Portfolio / CV năng lực cá nhân.
2. **GitLab nội bộ (`gitlab.s2.ttpprojects.com`):** Hệ thống đào tạo / nộp bài, báo cáo tiến độ, chạy CI/CD Runner và quản lý Merge Request.

Thay vì phải gõ 2 lệnh `git push` riêng biệt cho từng server, Git trên máy phát triển được cấu hình cơ chế **Dual-Push URL trên cùng remote `origin`**:
* **Lệnh Fetch (Kéo code):** Mặc định kéo từ GitHub để đảm bảo an toàn.
* **Lệnh Push (Đẩy code):** Tự động đẩy tuần tự lên GitHub $\rightarrow$ sau đó đẩy tiếp lên GitLab trong cùng một thao tác duy nhất.

---

## 2. LỊCH SỬ CÁC LỖI THỰC CHIẾN ĐÃ XỬ LÝ (QUAN TRỌNG ĐỂ KHÔNG TÁI DIỄN)

Trong quá trình khởi tạo kết nối giữa GitHub và GitLab, chúng tôi đã gặp và xử lý triệt để 3 rào cản kỹ thuật. Người mới cần nắm rõ để hiểu cách hệ thống vận hành:

### Lỗi 1: Xác thực tài khoản (Authentication & Credential Mismatch)
* **Triệu chứng:** `fatal: Authentication failed` hoặc `HTTP Basic: Access denied`.
* **Nguyên nhân:** Máy tính lưu thông tin tài khoản GitHub cho domain `github.com`. Khi lần đầu kết nối đến `gitlab.s2.ttpprojects.com`, Git chưa có thông tin xác thực của tài khoản GitLab riêng biệt.
* **Giải pháp đã thực hiện:** 
  * Đăng nhập thành công tài khoản GitLab. Windows Credential Manager tự động phân tách theo Domain (`github.com` và `gitlab.s2.ttpprojects.com`) nên hai tài khoản hoàn toàn độc lập, không bị đè lên nhau.
  * Nếu GitLab bật 2FA: Cần tạo **Personal Access Token** (tại *User Settings > Access Tokens*) với các quyền: `read_repository`, `write_repository`.

### Lỗi 2: Xung đột lịch sử khởi tạo (Unrelated Histories)
* **Triệu chứng:** `! [rejected] main -> main (fetch first) - failed to push some refs`.
* **Nguyên nhân:** Khi tạo project mới trên GitLab, giao diện web đã tự động tạo một commit ban đầu (chứa file template `README.md`). Code ở máy local (và trên GitHub) có chuỗi commit riêng biệt, không có commit này của GitLab.
* **Giải pháp đã thực hiện:** 
  * Sử dụng lệnh fetch nhánh từ GitLab: `git fetch gitlab`
  * Hợp nhất an toàn bằng cờ cho phép lịch sử không liên quan:
    ```bash
    git merge gitlab/main --allow-unrelated-histories -m "chore: sync initial commit from GitLab"
    ```
  * Việc merge diễn ra tự động 100% không có xung đột, vì code dự án ban đầu chưa có file `README.md`.

### Lỗi 3: Chặn Force Push trên Nhánh được bảo vệ (Protected Branch Pre-receive Hook)
* **Triệu chứng:** `remote: GitLab: You are not allowed to force push code to a protected branch on this project. ! [remote rejected] main -> main (pre-receive hook declined)`.
* **Nguyên nhân:** Nhánh `main` trên GitLab mặc định là **Protected Branch**, hệ thống cấu hình sẵn hook từ chối mọi thao tác ghi đè lịch sử (`git push --force`).
* **Giải pháp đã thực hiện:** 
  * Sau khi thực hiện hợp nhất (merge) sạch sẽ ở Lỗi 2, commit của GitLab đã trở thành một phần trong lịch sử của local.
  * Lệnh push sau đó là **Fast-forward push hợp lệ** (không cần `--force`), nên GitLab chấp thuận ngay lập tức.
  * Đồng thời đẩy commit merge này lên lại GitHub để hai bên hoàn toàn đồng nhất 100%.

---

## 3. HƯỚNG DẪN ONBOARDING DÀNH CHO MÁY MỚI (TỪNG BƯỚC)

Nếu bạn là thành viên mới tiếp nhận dự án trên một máy tính mới, hãy thực hiện theo đúng các bước sau:

### Bước 1: Clone dự án từ GitHub
```powershell
# Clone mã nguồn backend
git clone https://github.com/duchai1703/bookingcare-backend.git
cd bookingcare-backend
```

### Bước 2: Thiết lập thông tin tác giả commit (nếu cần)
```powershell
# Đặt tên và email riêng cho repo này
git config user.name "Họ và Tên Của Bạn"
git config user.email "email_cua_ban@example.com"
```

### Bước 3: Cấu hình Dual-Push sang GitLab
Mở PowerShell tại thư mục `bookingcare-backend` và chạy:
```powershell
# 1. Đảm bảo fetch trỏ về GitHub
git remote set-url origin https://github.com/duchai1703/bookingcare-backend.git

# 2. Đặt URL push thứ nhất: GitHub
git remote set-url --push origin https://github.com/duchai1703/bookingcare-backend.git

# 3. Thêm URL push thứ hai: GitLab
git remote set-url --add --push origin https://gitlab.s2.ttpprojects.com/training/booking-care/bookingcare-backend.git

# 4. Kiểm tra cấu hình kết quả
git remote -v
```

**Kết quả hiển thị bắt buộc phải đúng định dạng:**
```text
origin  https://github.com/duchai1703/bookingcare-backend.git (fetch)
origin  https://github.com/duchai1703/bookingcare-backend.git (push)
origin  https://gitlab.s2.ttpprojects.com/training/booking-care/bookingcare-backend.git (push)
```

### Bước 4: Kiểm tra đẩy code (First Push)
Chạy thử lệnh:
```powershell
git push origin main
```
* Nếu máy hiện popup yêu cầu đăng nhập GitLab: Nhập tài khoản/mật khẩu (hoặc Personal Access Token) của bạn trên hệ thống `gitlab.s2.ttpprojects.com`.
* Windows Credential Manager sẽ tự động lưu lại cho tất cả các lần sau.

---

## 4. QUY TRÌNH LÀM VIỆC CHUẨN HÀNG NGÀY (DAILY WORKFLOW)

Từ thời điểm này, quy trình làm việc của bạn hoàn toàn tự nhiên:

1. **Trước khi bắt đầu code (Lấy code mới nhất):**
   ```powershell
   git pull origin main
   ```
2. **Sau khi hoàn thành tính năng:**
   * **Cách 1 (Terminal):**
     ```powershell
     git add .
     git commit -m "feat: mô tả công việc vừa làm"
     git push origin main
     ```
   * **Cách 2 (Giao diện VS Code / Antigravity):**
     * Nhấn tổ hợp phím `Ctrl + Shift + G` (tab Source Control).
     * Nhập message và bấm nút **Commit**.
     * Bấm nút **Sync Changes** (hoặc dấu `...` $\rightarrow$ Push).
     * Git sẽ **tự động đẩy lên cả GitHub và GitLab** cùng lúc mà bạn không phải làm thêm bất kỳ thao tác nào.
