# CHUYÊN ĐỀ 03: SỔ TAY TRIỂN KHAI PRODUCTION & QUẢN LÝ SECRETS
> **Vị trí tài liệu:** `DOCS/CI/CD/03_DEPLOYMENT_RUNBOOK_AND_SECRETS.md`  
> **Áp dụng cho:** Quản trị viên máy chủ, Người phụ trách phát hành (Release Manager), DevOps

---

## 1. TỪ ĐIỂN BIẾN MÔI TRƯỜNG CI/CD (SECRETS DICTIONARY)

Để pipeline có thể hoạt động mà không làm lộ các thông tin nhạy cảm vào Git, toàn bộ bí mật được cấu hình tại:  
**GitLab Repository $\rightarrow$ Settings $\rightarrow$ CI/CD $\rightarrow$ Variables $\rightarrow$ Add Variable**.

### Bảng cấu hình chi tiết:

| Tên biến (Key) | Kiểu (Type) | Flags | Mô tả chi tiết & Hướng dẫn giá trị |
| :--- | :---: | :---: | :--- |
| `SSH_PRIVATE_KEY` | **Variable** | *Protected* | Khóa bí mật (Private Key) dùng để pipeline SSH vào máy chủ. *(Xem mục 2 để biết cách tạo)*. |
| `SERVER_IP` | **Variable** | *Protected* | Địa chỉ IP công khai hoặc IP mạng nội bộ của Production Server (Ví dụ: `103.x.x.x` hoặc `192.168.1.x`). |
| `SERVER_USER` | **Variable** | *Protected* | Tên người dùng có quyền thực thi `sudo` trên server (Ví dụ: `ubuntu`, `deployer` hoặc `root`). |
| `PRODUCTION_ENV_BASE64` | **Variable** | *Masked, Protected* | Chuỗi Base64 của toàn bộ tệp `.env.production`. Dùng để tạo file cấu hình an toàn trên server. |
| `CI_REGISTRY_USER` | **Variable** | - | Biến mặc định của GitLab, dùng để đăng nhập Container Registry. |
| `CI_REGISTRY_PASSWORD` | **Variable** | *Masked* | Biến mặc định của GitLab (`$CI_JOB_TOKEN`), cấp quyền đẩy/kéo image tự động. |

> [!WARNING]
> **Nguyên tắc bảo mật tối cao:**
> * Không bao giờ bỏ chọn cờ **Protected** cho các biến trên (để ngăn các nhánh thử nghiệm không được bảo vệ đọc trộm SSH Key).
> * Không bao giờ commit file `.env.production` lên GitHub hay GitLab.

---

## 2. HƯỚNG DẪN TẠO VÀ CẤU HÌNH KHÓA SSH CHO CI/CD (TỪNG BƯỚC)

### Bước 1: Tạo cặp khóa SSH Ed25519 an toàn
Trên máy chủ Production (hoặc máy local của bạn), chạy lệnh:
```bash
ssh-keygen -t ed25519 -C "gitlab-cicd-deploy@bookingcare" -f ~/.ssh/bookingcare_deploy_key -N ""
```
Lệnh trên tạo ra 2 tệp:
1. `bookingcare_deploy_key` (Private Key — Bí mật tối cao).
2. `bookingcare_deploy_key.pub` (Public Key — Dùng để cấp quyền).

### Bước 2: Cấp quyền truy cập trên Production Server
Thêm Public Key vào danh sách khóa được phép đăng nhập của server:
```bash
cat ~/.ssh/bookingcare_deploy_key.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

### Bước 3: Nạp Private Key vào GitLab CI/CD
1. Đọc nội dung Private Key:
   ```bash
   cat ~/.ssh/bookingcare_deploy_key
   ```
2. Sao chép toàn bộ nội dung (bao gồm cả dòng `-----BEGIN OPENSSH PRIVATE KEY-----` và `-----END OPENSSH PRIVATE KEY-----`).
3. Dán vào biến `SSH_PRIVATE_KEY` trên GitLab.

---

## 3. CHỐT CHẶN VẬN HÀNH TRONG `deploy.sh` (HOẠT ĐỘNG THẾ NÀO?)

Khi pipeline SSH vào server, nó kích hoạt script bọc thép **`deploy.sh`**. Người vận hành cần hiểu 3 trụ cột mà script này bảo vệ:

```
[ BƯỚC 1: BẢO MẬT VẬT LÝ ]
chown root:root .env.production && chmod 600 .env.production
(Ngăn chặn rò rỉ secret cho các user không phải root trên server)
            │
            ▼
[ BƯỚC 2: KHỞI TẠO CỤM CONTAINER 3-TIER ]
docker compose --env-file .env.production up --build -d
(Khởi chạy: db-postgres, redis-cache, app-backend trong mạng cô lập backend-net)
            │
            ▼
[ BƯỚC 3: BOOT-TIME GUARD AUDIT (VÒNG LẶP 60 GIÂY) ]
Quét log stream của container 'app-backend':
Tìm chuỗi: "[DEVSECOPS SUCCESS] MySQL Native Timezone Alignment confirmed at +07:00"
            │
   ┌────────┴────────┐
   ▼                 ▼
[ TÌM THẤY ]      [ TIMEOUT QUÁ 60S / CONTAINER CRASH ]
Exit Code 0       Exit Code 1 -> Pipeline Báo Lỗi Ngay Lập Tức
(Thành công)      (Dừng triển khai để bảo vệ dữ liệu lịch khám)
```

---

## 4. QUY TRÌNH ROLLBACK KHẨN CẤP (EMERGENCY ROLLBACK RUNBOOK)

Nếu sau khi deploy phiên bản mới phát sinh lỗi nghiêm trọng (API crash, database deadlock), hãy thực hiện Rollback khôi phục trạng thái hoạt động trong 60 giây theo các bước sau:

### Cách 1: Rollback qua giao diện GitLab (Khuyên dùng)
1. Vào mục **CI/CD $\rightarrow$ Pipelines**.
2. Tìm Pipeline thành công gần nhất trước đó.
3. Bấm vào Job `backend_deploy_production` của Pipeline đó và chọn **Retry**. Server sẽ tự động kéo lại phiên bản commit SHA ổn định trước đó.

### Cách 2: Rollback trực tiếp trên Server (Khi mất mạng hoặc sự cố khẩn cấp)
1. SSH vào Production Server:
   ```bash
   ssh user@server-ip
   cd /app/bookingcare-backend
   ```
2. Kiểm tra commit SHA ổn định trước đó:
   ```bash
   git log --oneline -n 5
   ```
3. Checkout về commit ổn định (Ví dụ commit `5e3daad`):
   ```bash
   git checkout 5e3daad
   sudo bash deploy.sh
   ```
4. Kiểm tra lại trạng thái container:
   ```bash
   docker compose ps
   docker logs --tail 50 app-backend
   ```

---

## 5. BẢNG KIỂM TRA TRƯỚC KHI BÀN GIAO (PRE-HANDOVER CHECKLIST)

Trước khi bàn giao hệ thống cho người mới hoặc đưa vào bảo vệ đồ án:
- [x] Cấu hình Dual-Push Git đồng bộ đồng thời cả GitHub và GitLab.
- [x] Lịch sử commit của 2 nền tảng khớp nhau 100%.
- [x] Tệp `.gitlab-ci.yml` đã được định nghĩa và kiểm tra cú pháp.
- [x] Tệp `.github/workflows/ci.yml` đã được thiết lập để giữ Badge xanh.
- [x] Cấu trúc tài liệu `DOCS/CI/CD/` được phân tách khoa học, có mục lục và hướng dẫn chi tiết.
- [x] Không có bất kỳ file chứa mật khẩu (`.env`, `.env.production`) nào bị commit vào Git.
