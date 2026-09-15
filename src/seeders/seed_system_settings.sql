-- seed_system_settings.sql
-- [Phase B] Seed data mặc định cho bảng SystemSettings
-- Chạy: psql -U <user> -d <dbname> -f seed_system_settings.sql
-- Hoặc dùng pgAdmin / DBeaver paste nội dung này

INSERT INTO "SystemSettings" (key, value, description, "createdAt", "updatedAt")
VALUES
  (
    'refund_rate_cancel_before_24h',
    '100',
    'Tỷ lệ % hoàn tiền khi bệnh nhân hủy lịch TRƯỚC 24 giờ',
    NOW(), NOW()
  ),
  (
    'refund_rate_cancel_after_24h',
    '50',
    'Tỷ lệ % hoàn tiền khi bệnh nhân hủy lịch SAU 24 giờ',
    NOW(), NOW()
  ),
  (
    'service_fee_rate',
    '10',
    'Phí dịch vụ hệ thống (%) thu trên mỗi lịch khám thành công',
    NOW(), NOW()
  )
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description,
      "updatedAt" = NOW();
