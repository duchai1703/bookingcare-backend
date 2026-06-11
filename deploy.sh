#!/bin/bash

# ==========================================
# BOOKINGCARE PRODUCTION DEPLOYMENT SCRIPT — PHASE 13 BLUEPRINT COMPLIANT
# Tệp: deploy.sh
# Vị trí triển khai: bookingcare-backend/ (root directory — cùng cấp docker-compose.yml)
# Phiên bản: 2.0-MySQL | Ngày: 2026-05-25
# Nguồn đặc tả: Phase13-MySQL-Blueprint-Part1.md (Phân khu 5.1.1) + Part2.md (Phần 2)
# Cách chạy: sudo bash deploy.sh
# ==========================================

# Thiết lập chế độ nghiêm ngặt: Dừng script ngay lập tức nếu bất kỳ câu lệnh nào chạy lỗi (Exit Code != 0)
# -E: kế thừa trap ERR vào subshells
# -e: exit on error
# -u: treat unset variables as error
# -o pipefail: pipe fails if any command in pipeline fails
set -Eeuo pipefail

echo "========================================================================="
echo "   STARTING HARDENED DEVSECOPS DEPLOYMENT SYSTEM — PHASE 13 PRODUCTION"
echo "========================================================================="

# =========================================================================
# CHỐT CHẶN QUYỀN TỐI CAO: Ép script bắt buộc phải thực thi dưới quyền root/sudo
# =========================================================================
if [ "$EUID" -ne 0 ]; then
    echo "[FATAL ERROR] This automation script must be executed with root privileges (sudo)."
    exit 1
fi

# =========================================================================
# CHỐT CHẶN TỆP MÔI TRƯỜNG TĨNH: Kiểm tra sự tồn tại của file .env.production
# =========================================================================
if [ ! -f ".env.production" ]; then
    echo "[FATAL ERROR] The environment configuration file '.env.production' is missing in the current root directory."
    echo "Please create it and populate all enterprise secrets from the Blueprint before running this script."
    exit 1
fi

# -------------------------------------------------------------------------
# BƯỚC 1: THIẾT LẬP VÀ KIÊN CỐ HÓA BẢO MẬT TỆP MÔI TRƯỜNG TĨNH
# Blueprint: Part1.md — Phân khu 5.1.1 — chmod 600 + chown root:root
# -------------------------------------------------------------------------
echo ""
echo "[DEVSECOPS STEP 1] Executing host physical level file system hardening on '.env.production' file."

echo "[INFO] Transferring file ownership of '.env.production' to root:root to prevent non-root access."
chown root:root .env.production

echo "[INFO] Restricting file read/write permissions to owner only (chmod 600) — blocking group and other access."
chmod 600 .env.production

# Xác minh lại quyền vật lý sau khi bọc thép — abort nếu không khớp kỳ vọng
PERMS=$(stat -c "%a" .env.production)
OWNER=$(stat -c "%U:%G" .env.production)

if [ "$PERMS" != "600" ] || [ "$OWNER" != "root:root" ]; then
    echo "[FATAL ERROR] File system hardening verification failed!"
    echo "  Expected: Permissions=600, Owner=root:root"
    echo "  Actual:   Permissions=$PERMS, Owner=$OWNER"
    echo "Aborting deployment to prevent secret exposure."
    exit 1
fi

echo "[SUCCESS STEP 1] File '.env.production' successfully secured. Verified: -rw------- root:root ($PERMS)."

# -------------------------------------------------------------------------
# BƯỚC 2: KHỞI CHẠY ĐỒNG BỘ CỤM CONTAINER MẠNG CÔ LẬP 3-TIER
# Blueprint: Part2.md — Phần 2: docker-compose.yml (4 services, 2 networks)
# -------------------------------------------------------------------------
echo ""
echo "[DEVSECOPS STEP 2] Initializing isolated 3-tier container infrastructure setup."

echo "[INFO] Running docker compose orchestration with build isolation cache rules."
echo "[INFO] Using env-file: .env.production | Build mode: --build -d (detached)"
docker compose --env-file .env.production up --build -d

echo "[INFO] Listing all running containers for visual confirmation:"
docker compose --env-file .env.production ps

echo "[SUCCESS STEP 2] Docker container network clusters have been provisioned successfully."

# -------------------------------------------------------------------------
# BƯỚC 3: XÁC MINH NHẬT KÝ VẬN HÀNH HẬU DEPLOY (BOOT-TIME GUARD VERIFICATION)
# Rà quét log stream backend để xác minh Boot Guard timezone đã pass
# Blueprint: Part1.md — Phân khu 2.1 — Kiểm tra session timezone = +07:00
# Timeout tổng cộng: MAX_ATTEMPTS * SLEEP_INTERVAL = 30 * 2 = 60 giây
# -------------------------------------------------------------------------
echo ""
echo "[DEVSECOPS STEP 3] Starting post-deployment live runtime audit log polling verification."
echo "[INFO] Waiting for database instance to pass internal healthchecks and app-backend to boot up."

TARGET_SIGNATURE="[DEVSECOPS SUCCESS] MySQL Native Timezone Alignment confirmed at +07:00. System initialization approved."
MAX_ATTEMPTS=30
SLEEP_INTERVAL=2
ATTEMPT=1
SUCCESS_FOUND=0

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    echo "[POLLING LOGS] Verification audit cycle ($ATTEMPT/$MAX_ATTEMPTS) — Checking container log stream."

    # Kiểm tra xem container backend có đang sống không, tránh kẹt loop nếu container crash ngầm
    CONTAINER_STATUS=$(docker inspect -f '{{.State.Running}}' app-backend 2>/dev/null || echo "false")
    if [ "$CONTAINER_STATUS" != "true" ]; then
        echo "[WARNING] Container 'app-backend' is not in a running state. Checking termination reason."
        echo "==================== DUMPING RECENT CONTAINER BACKEND LOGS ===================="
        docker logs --tail 20 app-backend 2>&1 || true
        echo "==============================================================================="
        echo "[FATAL ERROR] Container 'app-backend' crashed prematurely. Stopping deployment script."
        exit 1
    fi

    # Rà quét chuỗi tĩnh ký duyệt múi giờ nguyên tử của Codex ngay trong log stream của backend
    if docker logs app-backend 2>&1 | grep -q "$TARGET_SIGNATURE"; then
        echo ""
        echo "========================================================================="
        echo "  [VERIFICATION AUDIT SUCCESS: PHASE 13 ARCHITECTURE PASSED ALL CRITERIA]"
        echo "========================================================================="
        echo "Evidence — Static signature detected in container log stream:"
        docker logs app-backend 2>&1 | grep "$TARGET_SIGNATURE"
        echo ""
        SUCCESS_FOUND=1
        break
    fi

    sleep $SLEEP_INTERVAL
    ATTEMPT=$((ATTEMPT + 1))
done

if [ $SUCCESS_FOUND -ne 1 ]; then
    echo ""
    echo "[FATAL ERROR] Post-deployment verification audit TIMEOUT threshold exceeded!"
    echo "The green signature verifying the timezone boot guard was not detected within 60 seconds."
    echo "==================== DUMPING RECENT CONTAINER BACKEND LOGS ===================="
    docker logs --tail 50 app-backend 2>&1 || true
    echo "==============================================================================="
    echo "[CRITICAL STATUS] System architecture status is in an unverified state. Halting operations."
    exit 1
fi

echo ""
echo "========================================================================="
echo "  DEPLOYMENT COMPLETE: ALL 3 DEVSECOPS PILLARS HARDENED SUCCESSFULLY"
echo "========================================================================="
echo "  Pillar 1: .env.production secured (chmod 600, root:root)"
echo "  Pillar 2: Docker 3-tier containers provisioned (4 services, 2 networks)"
echo "  Pillar 3: Boot guard timezone verification passed (+07:00 confirmed)"
echo "========================================================================="
exit 0
