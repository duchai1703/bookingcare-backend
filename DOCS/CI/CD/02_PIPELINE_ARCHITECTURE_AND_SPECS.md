# CHUYÊN ĐỀ 02: ĐẶC TẢ KIẾN TRÚC PIPELINE CI/CD
> **Vị trí tài liệu:** `DOCS/CI/CD/02_PIPELINE_ARCHITECTURE_AND_SPECS.md`  
> **Áp dụng cho:** Kỹ sư DevOps, Tech Lead, Người bảo trì hệ thống

---

## 1. TỔNG QUAN KIẾN TRÚC PIPELINE ĐỒNG BỘ

Hệ thống CI/CD được thiết lập theo chiến lược **Đa nền tảng (Dual CI/CD System)**:
1. **Trục chính (Primary): GitLab CI/CD (`.gitlab-ci.yml`)**
   * Chạy trực tiếp trên runner của trường/công ty (`gitlab.s2.ttpprojects.com`).
   * Tự động kiểm thử, đóng gói Docker Image lên GitLab Container Registry nội bộ, và triển khai lên Production Server qua SSH.
2. **Hệ thống hỗ trợ (Backup/Portfolio): GitHub Actions (`.github/workflows/ci.yml`)**
   * Đảm bảo mọi commit trên GitHub cá nhân đều được kiểm tra cú pháp và build thử nghiệm thành công (giữ Badge xanh cho CV năng lực).

---

## 2. ĐẶC TẢ CÁC GIAI ĐOẠN TRONG GITLAB CI/CD (STAGES & JOBS)

Pipeline trong `.gitlab-ci.yml` được cấu trúc thành 3 giai đoạn nghiêm ngặt:

```
[ Stage 1: quality_gate ] ──► [ Stage 2: package ] ──► [ Stage 3: deploy ]
  ├── syntax_check              └── docker_build             └── deploy_production
  └── npm audit (CVE)               ├── Tag commit-sha           (SSH + deploy.sh)
                                    └── Tag latest
```

### Giai đoạn 1: Quality Gate (`backend_syntax_and_audit`)
* **Môi trường chạy:** `node:18-alpine`
* **Runner Tag:** `dockerrunner` (Ủy quyền cho Runner #5 nhận việc)
* **Cơ chế Caching:** Cache thư mục `node_modules/` theo khóa `${CI_COMMIT_REF_SLUG}-backend` để tránh tải lại gói phụ thuộc, giảm thời gian chạy từ 3 phút xuống còn 20 giây.
* **Các bước thực thi:**
  1. `npm ci --quiet`: Cài đặt chính xác các phiên bản trong `package-lock.json`.
  2. `npm run test:syntax`: Thực thi `node --check src/server.js` để quét toàn bộ lỗi cú pháp JavaScript trước khi build.
  3. `npm audit --audit-level=critical || true`: Rà quét phát hiện các lỗ hổng bảo mật cấp độ nghiêm trọng.
* **Quy tắc kích hoạt (Rules):** Tự động chạy trên mọi nhánh (branch) và mọi Merge Request (MR).

### Giai đoạn 2: Package (`backend_docker_build`)
* **Môi trường chạy:** `docker:24.0.5` kết hợp dịch vụ `docker:24.0.5-dind` (Docker-in-Docker).
* **Runner Tag:** `dockerrunner` (Ủy quyền cho Runner #5 nhận việc)
* **Cơ chế Đóng gói Multi-Stage:**
  * **Stage 1 (Builder):** `node:18-alpine` cài đặt toàn bộ `node_modules`.
  * **Stage 2 (Runtime):** Chỉ sao chép mã nguồn và thư mục thư viện sạch từ Builder sang. Cài đặt biến môi trường múi giờ Việt Nam `TZ=Asia/Ho_Chi_Minh` và phân quyền thư mục `uploads/` (`chmod 755`).
* **Cơ chế Gắn nhãn (Tagging Strategy):**
  * Tag kép 1: `$CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA` (Ví dụ: `backend:5e3daad`) — Bất biến, dùng để truy vết chính xác commit nào đang chạy và phục vụ Rollback.
  * Tag kép 2: `$CI_REGISTRY_IMAGE:latest` — Trỏ về bản dựng mới nhất cho server kéo về.
* **Quy tắc kích hoạt (Rules):** Chỉ chạy khi mã nguồn được merge vào nhánh **`main`**.

### Giai đoạn 3: Deploy (`backend_deploy_production`)
* **Môi trường chạy:** `alpine:latest` nhẹ, nạp tiện ích `openssh-client` và `bash`.
* **Runner Tag:** `deploy` (Ủy quyền chuyên biệt cho Runner #4 máy chủ triển khai)
* **Cơ chế Xác thực:** Nạp khóa SSH Private Key từ biến môi trường bí mật `$SSH_PRIVATE_KEY` vào `ssh-agent`.
* **Lệnh thực thi từ xa:**
  ```bash
  ssh $SERVER_USER@$SERVER_IP "cd /app/bookingcare-backend && git pull origin main && sudo bash deploy.sh"
  ```
* **Chốt chặn an toàn:** Job này được thiết lập `when: manual` và `allow_failure: true` (chế độ bấm nút xác nhận bằng tay trên giao diện GitLab) để người quản trị có quyền kiểm soát thời điểm phát hành phiên bản mới, tránh rủi ro tự động deploy vào giờ cao điểm.

---

## 3. KIẾN TRÚC PHÂN LUỒNG RUNNER THEO THẺ TAGS (RUNNER TAG MATCHING)

Trên hệ thống GitLab nội bộ (`gitlab.s2.ttpprojects.com`), có 3 Instance Runners được cấu hình phân quyền theo trách nhiệm:

| Runner ID | Trạng thái | Danh sách Tags hỗ trợ | Vai trò và Job được gán |
| :--- | :---: | :--- | :--- |
| **Runner #5** (`52FGRxK8`) | Online 🟢 | `build`, `dockerrunner`, `release`, `test` | Chuyên trách **Testing & Docker Build** (`quality_gate`, `package`). Cần gán `tags: [dockerrunner]`. |
| **Runner #4** (`sHcVNK4Qx`) | Online 🟢 | `deploy`, `hostdockerrunner`, `production` | Chuyên trách **Production Deployment** (`deploy`). Cần gán `tags: [deploy]`. |
| **Runner #3** (`_PB7C0Cf`) | Online 🟢 | `host`, `self` | Máy chủ Runner độc lập. |

> [!IMPORTANT]
> **Bài học thực tế:** Các Runner trên hệ thống này **chỉ nhận những Job có thẻ Tag tương ứng**. Nếu một Job trong `.gitlab-ci.yml` bị quên khai báo `tags:`, job đó sẽ rơi vào trạng thái `Pending` vĩnh viễn với thông báo: *"This job is in pending state and is waiting to be picked by a runner"*.

---

## 4. QUY CHUẨN CÚ PHÁP YAML & GIAO THỨC CHẨN ĐOÁN TRƯỚC KHI COMMIT

### 4.1. Lỗi phổ biến: Dấu hai chấm trong Plain Scalar (YAML Mapping Trap)
* **Hiện tượng:** GitLab báo lỗi đỏ trong Pipeline Editor:  
  `This GitLab CI configuration is invalid: jobs:<job_name>:script config should be a string or a nested array of strings up to 10 levels deep.`
* **Bản chất kỹ thuật:**  
  Khi viết lệnh dạng:
  ```yaml
  # ❌ SAI: Dấu hai chấm kèm dấu cách làm YAML hiểu 'Image:' là một Key của Object
  - echo "[CI SUCCESS] Đã xuất bản thành công Image: $IMAGE_TAG"
  ```
  Trình phân tích Psych YAML của GitLab sẽ dịch dòng trên thành `{ 'echo "[CI SUCCESS] ... Image': '$IMAGE_TAG"' }` (Object thay vì String).
* **Giải pháp chuẩn hóa:**
  1. Luôn bọc toàn bộ câu lệnh trong cặp nháy đơn `'...'`.
  2. Tránh dùng dấu hai chấm kèm khoảng trắng trong câu lệnh `echo`, thay bằng dấu gạch ngang `-`.
  ```yaml
  # ✔️ ĐÚNG CHUẨN:
  - 'echo "[CI SUCCESS] Đã xuất bản thành công Image - $IMAGE_TAG"'
  ```

### 4.2. Giao thức chẩn đoán tự động (Pre-Commit Diagnostic Protocol)
Trước khi commit bất kỳ thay đổi nào trong `.gitlab-ci.yml`, **bắt buộc** phải chạy lệnh chẩn đoán cục bộ để kiểm tra tính toàn vẹn cấu trúc:
```powershell
# Chẩn đoán Backend
npx -y js-yaml bookingcare-backend\.gitlab-ci.yml

# Chẩn đoán Frontend
npx -y js-yaml bookingcare-frontend\.gitlab-ci.yml
```
*Tiêu chuẩn nghiệm thu:* Toàn bộ mảng `script:` phải được in ra dưới dạng mảng các chuỗi `"..."` thuần túy, không có bất kỳ ký hiệu ngoặc nhọn `{}` nào xuất hiện bên trong `script`.

---

## 5. ĐẶC TẢ PIPELINE CHO FRONTEND (SO SÁNH KHÁC BIỆT)

Tương tự Backend, `bookingcare-frontend/.gitlab-ci.yml` bao gồm:
1. **Stage `quality_gate` (`frontend_build_test`):**
   * Tag: `dockerrunner`.
   * Sử dụng lệnh `npm ci --legacy-peer-deps` để giải quyết tương thích thư viện React 18.
   * Chạy `npm run build` để kiểm tra biên dịch Vite tĩnh.
   * Lưu trữ thư mục sản phẩm build `dist/` làm Artifacts trong 3 ngày.
2. **Stage `package` (`frontend_docker_build`):**
   * Tag: `dockerrunner`.
   * Multi-stage build: Vite Builder $\rightarrow$ Nginx 1.25 Alpine Runtime.
   * Sao chép file cấu hình Gateway bọc thép `nginx/nginx.conf` và các asset tĩnh sang `/usr/share/nginx/html`.
3. **Stage `deploy` (`frontend_deploy_production`):**
   * Tag: `deploy`.
   * SSH vào server và khởi động lại container frontend với `docker compose up --build -d app-frontend`.

---

## 6. TỐI ƯU HÓA TỐC ĐỘ PIPELINE (PERFORMANCE OPTIMIZATION)

| Kỹ thuật tối ưu | Trước khi áp dụng | Sau khi áp dụng | Lợi ích đạt được |
| :--- | :--- | :--- | :--- |
| **npm ci Caching** | ~3.5 phút mỗi lần chạy | ~20 - 30 giây | Giảm tải băng thông mạng, pipeline phản hồi nhanh. |
| **Docker Multi-Stage Build** | Image kích thước ~1.2 GB (chứa compiler, devDependencies) | Image kích thước ~180 MB (Alpine Runtime) | Tốc độ push/pull lên Registry nhanh gấp 6 lần, giảm bề mặt tấn công bảo mật. |
| **Artifacts Retention** | Lưu vĩnh viễn gây tràn dung lượng GitLab Server | Đặt hạn sử dụng 3 ngày (`expire_in: 3 days`) | Tối ưu hóa bộ nhớ ổ đĩa máy chủ GitLab nội bộ. |
