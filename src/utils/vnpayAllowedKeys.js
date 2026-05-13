// ═══════════════════════════════════════════════════════════════════════
// [Phase 11 — GĐ 11.2 — Guard #16] vnpayAllowedKeys.js
// Whitelist chính xác các key hợp lệ từ VNPay IPN callback.
// Mọi key KHÔNG có trong danh sách này → reject ngay (RspCode: "97").
// ═══════════════════════════════════════════════════════════════════════

const VNPAY_ALLOWED_KEYS = [
  'vnp_Amount',
  'vnp_BankCode',
  'vnp_BankTranNo',
  'vnp_CardType',
  'vnp_Command',
  'vnp_CreateDate',
  'vnp_CurrCode',
  'vnp_IpAddr',
  'vnp_Locale',
  'vnp_OrderInfo',
  'vnp_PayDate',
  'vnp_ResponseCode',
  'vnp_SecureHash',
  'vnp_SecureHashType',
  'vnp_TmnCode',
  'vnp_TransactionNo',
  'vnp_TransactionStatus',
  'vnp_TxnRef',
  'vnp_Version',
];

module.exports = VNPAY_ALLOWED_KEYS;
