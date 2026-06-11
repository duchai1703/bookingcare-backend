# ==========================================
# BOOKINGCARE BACKEND DOCKERFILE — PHASE 13 BLUEPRINT COMPLIANT
# Multi-stage build: node:18-alpine (Builder) -> node:18-alpine (Runtime)
# Phiên bản: 2.0-MySQL | Ngày: 2026-05-25
# ==========================================

# STAGE 1: Build môi trường và cài đặt thư viện phụ thuộc
FROM node:18-alpine AS backend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --quiet
COPY . .

# STAGE 2: Tạo bản dựng Runtime Production siêu nhẹ, triệt tiêu lỗ hổng bảo mật CVE
FROM node:18-alpine AS backend-runtime
WORKDIR /app
ENV NODE_ENV=production
# Kế thừa biến múi giờ Việt Nam đồng bộ 3 tầng hệ thống
ENV TZ=Asia/Ho_Chi_Minh

# Sao chép node_modules sạch và mã nguồn từ Builder sang Runtime
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app ./

# Cấp phân quyền hệ thống tập tin cho thư mục lưu trữ ảnh Base64 tải lên
RUN mkdir -p uploads && chmod -R 755 uploads

EXPOSE 8080
CMD ["node", "src/server.js"]
