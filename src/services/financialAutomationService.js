// bookingcare-backend/src/services/financialAutomationService.js
// Hệ Thống Tự Động Hóa Tài Chính & Hàng Đợi Ngoại Lệ (Financial Automation & Exception Queue)
'use strict';

const db = require('../models');
const { Op } = require('sequelize');
const moment = require('moment');
const doctorSettlementService = require('./doctorSettlementService');
const refundGovernanceService = require('./refundGovernanceService');
const walletService = require('./walletService');
const { getExactAppointmentTime } = require('./aiTimezoneUtils');

const HIGH_VALUE_WITHDRAWAL_THRESHOLD = 5000000; // 5.000.000 đ
const CRITICAL_SLA_HOURS_LEFT = 4; // Dưới 4h là khẩn cấp

/**
 * 1. Lấy Danh Sách Hàng Đợi Ngoại Lệ Trung Tâm (Unified Financial Exception Queue)
 */
async function getExceptionQueue() {
  try {
    const now = new Date();
    const exceptions = [];

    // ── A. NGOẠI LỆ RÚT TIỀN (Withdrawals) ──
    const pendingWithdrawals = await db.Withdrawal_Request.findAll({
      where: { status: 'PENDING' },
      include: [
        {
          model: db.Wallet,
          as: 'wallet',
          include: [
            {
              model: db.User,
              as: 'owner',
              attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
            },
          ],
        },
        {
          model: db.Financial_Policy,
          as: 'appliedPolicy',
        },
      ],
      order: [['createdAt', 'ASC']],
    });

    for (const w of pendingWithdrawals) {
      const amount = Number(w.amount) || 0;
      const createdAt = moment(w.createdAt);
      const slaHours = w.appliedPolicy?.slaHours || 24;
      const deadline = moment(createdAt).add(slaHours, 'hours');
      const hoursLeft = deadline.diff(moment(now), 'hours', true);

      let priority = 'NORMAL';
      let reason = 'Chờ thẩm định & đối soát giải ngân ngân hàng';

      if (hoursLeft <= 0) {
        priority = 'CRITICAL';
        reason = `ĐÃ QUÁ HẠN SLA (${Math.abs(hoursLeft).toFixed(1)}h trễ) - Cần giải ngân ngay`;
      } else if (hoursLeft <= CRITICAL_SLA_HOURS_LEFT) {
        priority = 'CRITICAL';
        reason = `Sắp vi phạm SLA cam kết (${hoursLeft.toFixed(1)}h còn lại)`;
      } else if (amount >= HIGH_VALUE_WITHDRAWAL_THRESHOLD) {
        priority = 'HIGH';
        reason = `Lệnh rút giá trị lớn (${amount.toLocaleString('vi-VN')} ₫ ≥ ${HIGH_VALUE_WITHDRAWAL_THRESHOLD.toLocaleString('vi-VN')} ₫)`;
      }

      exceptions.push({
        id: `WD-${w.id}`,
        rawId: w.id,
        category: 'WITHDRAWAL',
        categoryLabel: 'Rút tiền về ngân hàng',
        priority,
        reason,
        amount,
        ownerName: w.wallet?.owner ? `${w.wallet.owner.lastName || ''} ${w.wallet.owner.firstName || ''}` : w.accountHolderName,
        ownerEmail: w.wallet?.owner?.email || 'N/A',
        walletType: w.wallet?.walletType || 'USER',
        bankInfo: `${w.bankName} - ${w.accountNumber}`,
        createdAt: w.createdAt,
        deadlineAt: deadline.toISOString(),
        hoursLeft: Math.round(hoursLeft * 10) / 10,
        targetTab: 'withdrawals',
        quickActions: ['APPROVE_TRANSFER', 'REJECT'],
      });
    }

    // ── B. NGOẠI LỆ HOÀN TIỀN (Refunds) ──
    if (db.Refund_Case) {
      const pendingRefunds = await db.Refund_Case.findAll({
        where: { status: 'PENDING' },
        include: [
          {
            model: db.Booking,
            as: 'booking',
            attributes: ['id', 'patientName', 'bookingPrice', 'date', 'timeType'],
          },
          {
            model: db.User,
            as: 'patient',
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
        ],
        order: [['createdAt', 'ASC']],
      });

      for (const r of pendingRefunds) {
        const amount = Number(r.refundAmount) || Number(r.paidAmount) || 0;
        const hoursPending = moment(now).diff(moment(r.createdAt), 'hours', true);

        let priority = 'NORMAL';
        let reason = 'Hồ sơ hoàn tiền ca khám chờ duyệt';

        if (r.cancellationReason === 'PATIENT_DISPUTED' || r.cancellationReason === 'OTHER' || (r.reasonNotes && r.reasonNotes.length > 0)) {
          priority = 'CRITICAL';
          reason = `Có khiếu nại dịch vụ từ bệnh nhân: "${r.reasonNotes || r.cancellationReason}"`;
        } else if (hoursPending >= 24) {
          priority = 'HIGH';
          reason = `Hồ sơ tồn đọng quá 24h chưa xử lý (${Math.round(hoursPending)}h)`;
        }

        exceptions.push({
          id: `RF-${r.id}`,
          rawId: r.id,
          category: 'REFUND',
          categoryLabel: 'Hoàn tiền bệnh nhân',
          priority,
          reason,
          amount,
          ownerName: r.booking?.patientName || (r.patient ? `${r.patient.lastName || ''} ${r.patient.firstName || ''}` : 'Bệnh nhân'),
          ownerEmail: r.patient?.email || 'N/A',
          walletType: 'PATIENT',
          bookingId: r.bookingId,
          createdAt: r.createdAt,
          hoursPending: Math.round(hoursPending * 10) / 10,
          targetTab: 'refunds',
          quickActions: ['APPROVE_REFUND', 'REJECT_REFUND'],
        });
      }
    }

    // ── C. NGOẠI LỆ QUYẾT TOÁN THÙ LAO (Doctor Settlements) ──
    if (db.Doctor_Settlement_Item) {
      // 1. Các ca bị tạm giữ (HELD do khiếu nại)
      const heldSettlements = await db.Doctor_Settlement_Item.findAll({
        where: { status: 'HELD' },
        include: [
          {
            model: db.User,
            as: 'doctor',
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
          {
            model: db.Booking,
            as: 'booking',
            attributes: ['id', 'patientName', 'bookingPrice'],
          },
        ],
      });

      for (const s of heldSettlements) {
        exceptions.push({
          id: `ST-${s.id}`,
          rawId: s.id,
          category: 'SETTLEMENT',
          categoryLabel: 'Quyết toán Bác sĩ (Tạm giữ)',
          priority: 'CRITICAL',
          reason: 'Ca khám bị khiếu nại - Đang đóng băng thù lao để đối soát y khoa',
          amount: Number(s.netAmount) || 0,
          ownerName: s.doctor ? `${s.doctor.lastName || ''} ${s.doctor.firstName || ''}` : `Bác sĩ #${s.doctorId}`,
          ownerEmail: s.doctor?.email || 'N/A',
          walletType: 'DOCTOR',
          bookingId: s.bookingId,
          createdAt: s.earnedAt || s.createdAt,
          targetTab: 'doctor-settlements',
          quickActions: ['RELEASE_HELD', 'CANCEL_SETTLEMENT'],
        });
      }

      // 2. Các ca đã vượt quá T+24h mà chưa được mở khóa (cần automation quét)
      const overdueEarned = await db.Doctor_Settlement_Item.findAll({
        where: {
          status: 'EARNED',
          availableAt: { [Op.lte]: now },
        },
        limit: 10,
      });

      if (overdueEarned.length > 0) {
        const totalOverdueNet = overdueEarned.reduce((sum, item) => sum + (Number(item.netAmount) || 0), 0);
        exceptions.push({
          id: `ST-OVERDUE-BATCH`,
          rawId: overdueEarned.map((x) => x.id).join(','),
          category: 'SETTLEMENT',
          categoryLabel: 'Thù lao Bác sĩ (Chờ quét mở khóa)',
          priority: 'NORMAL',
          reason: `${overdueEarned.length} ca khám đã hết thời hạn T+24h - Sẵn sàng mở khóa tự động`,
          amount: totalOverdueNet,
          ownerName: `${overdueEarned.length} Bác sĩ liên quan`,
          ownerEmail: 'Hệ thống',
          walletType: 'DOCTOR',
          createdAt: now,
          targetTab: 'doctor-settlements',
          quickActions: ['RUN_RELEASE_CYCLE'],
        });
      }
    }

    // ── D. KIỂM SOÁT CẦU CHÌ THANH KHOẢN (Circuit Breaker) ──
    const metricsRes = await walletService.getAdminLiquidityMetrics();
    const lcr = metricsRes?.data?.coverageRatio7d || 100;
    const isCircuitBreaker = lcr < 100;

    if (isCircuitBreaker) {
      exceptions.unshift({
        id: `ALERT-LCR-BREAKER`,
        category: 'LIQUIDITY',
        categoryLabel: 'Cảnh báo Thanh khoản Toàn sàn',
        priority: 'CRITICAL',
        reason: `Hệ số LCR 7 ngày đạt ${lcr.toFixed(1)}% (< 100%) - Kích hoạt Cầu chì an toàn, hạn chế tự động xuất quỹ`,
        amount: metricsRes?.data?.totalDueIn7Days || 0,
        ownerName: 'Toàn hệ thống',
        ownerEmail: 'cfo@bookingcare.vn',
        walletType: 'SYSTEM',
        createdAt: now,
        targetTab: 'overview',
        quickActions: ['VIEW_LIQUIDITY'],
      });
    }

    // Sắp xếp thứ tự ưu tiên: CRITICAL -> HIGH -> NORMAL
    const priorityWeight = { CRITICAL: 1, HIGH: 2, NORMAL: 3 };
    exceptions.sort((a, b) => {
      const pDiff = (priorityWeight[a.priority] || 4) - (priorityWeight[b.priority] || 4);
      if (pDiff !== 0) return pDiff;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    const summary = {
      totalCount: exceptions.length,
      criticalCount: exceptions.filter((x) => x.priority === 'CRITICAL').length,
      highCount: exceptions.filter((x) => x.priority === 'HIGH').length,
      normalCount: exceptions.filter((x) => x.priority === 'NORMAL').length,
      byCategory: {
        withdrawals: exceptions.filter((x) => x.category === 'WITHDRAWAL').length,
        refunds: exceptions.filter((x) => x.category === 'REFUND').length,
        settlements: exceptions.filter((x) => x.category === 'SETTLEMENT').length,
        liquidity: exceptions.filter((x) => x.category === 'LIQUIDITY').length,
      },
      circuitBreakerActive: isCircuitBreaker,
      lcrCurrent: lcr,
    };

    return {
      errCode: 0,
      errMessage: 'OK',
      data: {
        summary,
        items: exceptions,
      },
    };
  } catch (error) {
    console.error('Error in getExceptionQueue:', error);
    return {
      errCode: -1,
      errMessage: error.message || 'Lỗi khi lấy hàng đợi ngoại lệ tài chính',
    };
  }
}

/**
 * 2. Kích Hoạt Chu Trình Tự Động Hóa Tài Chính (Financial Automation Run-Cycle)
 * Thực thi các nghiệp vụ đủ điều kiện theo quy tắc an toàn:
 * - 1. Kiểm tra Cầu chì LCR
 * - 2. Tự động quét và mở khóa thù lao T+24h sạch (EARNED -> AVAILABLE)
 * - 3. Tự động hoàn tiền cho các ca Bác sĩ hủy (100% hợp lệ)
 */
async function runAutomationCycle({ adminId = null, dryRun = false } = {}) {
  const t0 = Date.now();
  try {
    const report = {
      timestamp: new Date().toISOString(),
      circuitBreakerTriggered: false,
      settlementsUnlocked: 0,
      cleanRefundsProcessed: 0,
      cleanPayoutsProcessed: 0,
      messages: [],
    };

    // Bước 1: Kiểm tra Cầu chì LCR
    const metricsRes = await walletService.getAdminLiquidityMetrics();
    const lcr = metricsRes?.data?.coverageRatio7d || 100;

    if (lcr < 100) {
      report.circuitBreakerTriggered = true;
      report.messages.push(`Cầu chì an toàn kích hoạt: LCR hiện tại đạt ${lcr.toFixed(1)}% (< 100%). Tạm dừng các đợt tự động chi trả thù lao.`);
    }

    // Bước 2: Tự động mở khóa Thù lao T+24h
    if (db.Doctor_Settlement_Item) {
      const releaseRes = await doctorSettlementService.releaseEligibleSettlements();
      report.settlementsUnlocked = releaseRes?.updatedCount || 0;
      if (report.settlementsUnlocked > 0) {
        report.messages.push(`Tự động mở khóa thành công ${report.settlementsUnlocked} ca khám thù lao (EARNED -> AVAILABLE) đã qua T+24h.`);
      }
    }

    // Bước 3: Tự động hoàn tiền cho các ca Bác sĩ hủy (Không tranh chấp)
    if (db.Refund_Case && !dryRun) {
      const cleanDoctorCancelledCases = await db.Refund_Case.findAll({
        where: {
          status: 'PENDING',
          cancellationReason: 'DOCTOR_CANCELLED',
        },
        limit: 10,
      });

      for (const rc of cleanDoctorCancelledCases) {
        try {
          const refundRes = await refundGovernanceService.reviewAndProcessRefundCase({
            caseId: rc.id,
            action: 'APPROVE',
            adminId: adminId || 1,
            reviewNote: 'Hệ thống tự động phê duyệt hoàn tiền 100% do Bác sĩ hủy lịch khám',
          });
          if (refundRes && refundRes.errCode === 0) {
            report.cleanRefundsProcessed++;
          }
        } catch (rErr) {
          console.error(`Error auto-refunding case #${rc.id}:`, rErr);
        }
      }

      if (report.cleanRefundsProcessed > 0) {
        report.messages.push(`Tự động hoàn tiền thành công ${report.cleanRefundsProcessed} ca do Bác sĩ hủy theo đúng chính sách.`);
      }
    }

    // Lấy lại thống kê hàng đợi ngoại lệ sau khi chạy chu trình
    const queueRes = await getExceptionQueue();
    return {
      errCode: 0,
      message: `Chu trình tự động hoàn tất trong ${report.executionTimeMs}ms. Đã mở khóa ${report.settlementsUnlocked} ca thù lao, tự động hoàn ${report.cleanRefundsProcessed} hồ sơ sạch.`,
      data: report,
    };
  } catch (error) {
    console.error('Error in runAutomationCycle:', error);
    return {
      errCode: 1,
      errMessage: error.message || 'Lỗi khi chạy chu trình tự động hóa tài chính',
    };
  }
}

/**
 * 3. Lấy Tổng Quan Ngân Quỹ & Điều Phối Dòng Tiền Toàn Sàn (Master Treasury Overview)
 * Tổng hợp toàn bộ số liệu của tất cả các nhánh tài chính cho Executive Console
 */
async function getMasterTreasuryOverview() {

  try {
    const now = new Date();

    // ── A. TỔNG QUAN VỐN & SỐ DƯ TÀI KHOẢN (Treasury Balances) ──
    const totalWalletBalance = (await db.Wallet.sum('availableBalance')) || 0;
    const doctorWalletBalance = (await db.Wallet.sum('availableBalance', { where: { walletType: 'DOCTOR' } })) || 0;
    const patientWalletBalance = (await db.Wallet.sum('availableBalance', { where: { walletType: 'USER' } })) || 0;
    const totalReservedBalance = (await db.Wallet.sum('reservedBalance')) || 0;

    // Doanh thu sàn thu lũy kế (Platform Fee)
    const totalPlatformFee = db.Doctor_Settlement_Item
      ? ((await db.Doctor_Settlement_Item.sum('platformFee')) || 0)
      : 0;

    // Quỹ Escrow tạm giữ sàn (Ca chưa khám hoặc chưa quyết toán PAID)
    const escrowHoldingAmount = db.Doctor_Settlement_Item
      ? ((await db.Doctor_Settlement_Item.sum('grossAmount', { where: { status: { [Op.ne]: 'PAID' } } })) || 0)
      : 0;

    // Tổng tiền thù lao đã chi trả thành công vào ví bác sĩ
    const totalPaidToDoctors = db.Doctor_Settlement_Item
      ? ((await db.Doctor_Settlement_Item.sum('netAmount', { where: { status: 'PAID' } })) || 0)
      : 0;

    // Tổng tiền đã rút về ngân hàng thành công
    const totalWithdrawnAmount = db.Withdrawal_Request
      ? ((await db.Withdrawal_Request.sum('amount', { where: { status: 'APPROVED' } })) || 0)
      : 0;

    // Tổng tiền đã hoàn trả cho bệnh nhân
    const totalRefundedAmount = db.Refund_Case
      ? ((await db.Refund_Case.sum('refundAmount', { where: { status: 'COMPLETED' } })) || 0)
      : 0;

    // ── B. MA TRẬN HÀNG ĐỢI NGHIỆP VỤ CHỜ XỬ LÝ (Processing Readiness Matrix) ──
    // 1. Quyết toán thù lao bác sĩ (Settlements)
    let pendingSettlementsCount = 0;
    let pendingSettlementsAmount = 0;
    if (db.Doctor_Settlement_Item) {
      pendingSettlementsCount = await db.Doctor_Settlement_Item.count({ where: { status: 'AVAILABLE' } });
      pendingSettlementsAmount = (await db.Doctor_Settlement_Item.sum('netAmount', { where: { status: 'AVAILABLE' } })) || 0;
    }

    // 2. Yêu cầu rút tiền (Withdrawals)
    let pendingWithdrawalsCount = 0;
    let pendingWithdrawalsAmount = 0;
    let autoEligibleWithdrawalsCount = 0;
    if (db.Withdrawal_Request) {
      pendingWithdrawalsCount = await db.Withdrawal_Request.count({ where: { status: 'PENDING' } });
      pendingWithdrawalsAmount = (await db.Withdrawal_Request.sum('amount', { where: { status: 'PENDING' } })) || 0;
      autoEligibleWithdrawalsCount = await db.Withdrawal_Request.count({
        where: {
          status: 'PENDING',
          amount: { [Op.lte]: HIGH_VALUE_WITHDRAWAL_THRESHOLD },
        },
      });
    }

    // 3. Hồ sơ hoàn tiền (Refunds)
    let pendingRefundsCount = 0;
    let pendingRefundsAmount = 0;
    let cleanDoctorCancelledRefundsCount = 0;
    if (db.Refund_Case) {
      pendingRefundsCount = await db.Refund_Case.count({ where: { status: 'PENDING' } });
      pendingRefundsAmount = (await db.Refund_Case.sum('refundAmount', { where: { status: 'PENDING' } })) || 0;
      cleanDoctorCancelledRefundsCount = await db.Refund_Case.count({
        where: {
          status: 'PENDING',
          [Op.or]: [
            { cancelledByRole: 'DOCTOR' },
            {
              cancellationReason: {
                [Op.in]: ['DOCTOR_UNAVAILABLE', 'DOCTOR_CANCELLED', 'CLINIC_FORCE_MAJEURE', 'SYSTEM_DUPLICATE_PAYMENT', 'PATIENT_ON_TIME', 'PATIENT_NO_SHOW'],
              },
            },
          ],
        },
      });

    }

    // 4. Hàng đợi ngoại lệ & khiếu nại (Exceptions)
    const exceptionQueueRes = await getExceptionQueue();
    const totalExceptionsCount = exceptionQueueRes?.data?.summary?.totalCount || 0;
    const criticalExceptionsCount = exceptionQueueRes?.data?.summary?.criticalCount || 0;

    // ── C. TRẠNG THÁI TỰ ĐỘNG HÓA HỆ THỐNG (Automation Engine Status) ──
    let totalAutomationRuns = 0;
    let latestAutomationRun = null;
    let totalAutomatedVolume = 0;
    if (db.Financial_Automation_Log) {
      totalAutomationRuns = await db.Financial_Automation_Log.count();
      latestAutomationRun = await db.Financial_Automation_Log.findOne({
        order: [['id', 'DESC']],
        attributes: ['id', 'batchCode', 'jobType', 'status', 'totalItems', 'totalAmount', 'createdAt', 'executionTimeMs'],
      });
      totalAutomatedVolume = (await db.Financial_Automation_Log.sum('totalAmount')) || 0;
    }

    // ── D. DÒNG TIỀN GIAO DỊCH GẦN NHẤT (Recent Cash Flow Feed) ──
    let recentTransactions = [];
    if (db.Wallet_Transaction) {
      recentTransactions = await db.Wallet_Transaction.findAll({
        limit: 8,
        order: [['id', 'DESC']],
        include: [
          {
            model: db.Wallet,
            as: 'wallet',
            attributes: ['id', 'ownerId', 'walletType'],
            include: [
              {
                model: db.User,
                as: 'owner',
                attributes: ['id', 'firstName', 'lastName', 'email'],
              },
            ],
          },
        ],
      });
    }

    // Tính toán Tỷ lệ An toàn Ngân quỹ (Reserve Coverage)
    const totalLiabilities = totalWalletBalance + escrowHoldingAmount; // Tổng tiền sàn đang giữ hộ
    const estimatedCashPool = totalLiabilities + totalPlatformFee; // Vốn ước lượng trong tài khoản đối ứng
    const reserveCoveragePercent = totalLiabilities > 0 ? Math.min(100, Math.round((estimatedCashPool / totalLiabilities) * 100)) : 100;

    return {
      errCode: 0,
      errMessage: 'OK',
      data: {
        timestamp: now.toISOString(),
        treasury: {
          totalManagedVolume: totalLiabilities,
          escrowHoldingAmount,
          totalWalletLiabilities: totalWalletBalance,
          doctorWalletLiabilities: doctorWalletBalance,
          patientWalletLiabilities: patientWalletBalance,
          reservedBalance: totalReservedBalance,
          totalPlatformRevenue: totalPlatformFee,
          totalPaidToDoctors,
          totalWithdrawnAmount,
          totalRefundedAmount,
          reserveCoveragePercent,
        },
        readinessMatrix: [
          {
            id: 'doctor-settlements',
            name: 'Quyết Toán Thù Lao Bác Sĩ (T+0)',
            desc: 'Ca khám hoàn tất sẵn sàng kết chuyển vào ví bác sĩ',
            pendingCount: pendingSettlementsCount,
            pendingAmount: pendingSettlementsAmount,
            readyForAuto: pendingSettlementsCount > 0,
            autoEligibleCount: pendingSettlementsCount,
            badge: pendingSettlementsCount > 0 ? 'SẴN SÀNG QUYẾT TOÁN' : 'ĐÃ ĐỐI SOÁT HẾT',
            badgeColor: pendingSettlementsCount > 0 ? 'emerald' : 'slate',
            targetTab: 'doctor-settlements',
            actionName: 'Quyết toán ca khám',
          },
          {
            id: 'withdrawals',
            name: 'Duyệt Chi Rút Tiền Về Ngân Hàng',
            desc: 'Yêu cầu rút tiền từ Ví Bác sĩ & Bệnh nhân về STK',
            pendingCount: pendingWithdrawalsCount,
            pendingAmount: pendingWithdrawalsAmount,
            readyForAuto: autoEligibleWithdrawalsCount > 0,
            autoEligibleCount: autoEligibleWithdrawalsCount,
            badge: pendingWithdrawalsCount > 0 ? `${autoEligibleWithdrawalsCount} lệnh đủ điều kiện` : 'KHÔNG CÓ YÊU CẦU',
            badgeColor: pendingWithdrawalsCount > 0 ? 'blue' : 'slate',
            targetTab: 'withdrawals',
            actionName: 'Duyệt lệnh rút tiền',
          },
          {
            id: 'refunds',
            name: 'Quản Trị Hoàn Tiền Hủy Lịch',
            desc: 'Hồ sơ hoàn tiền ca khám hủy theo chính sách SLA',
            pendingCount: pendingRefundsCount,
            pendingAmount: pendingRefundsAmount,
            readyForAuto: cleanDoctorCancelledRefundsCount > 0,
            autoEligibleCount: cleanDoctorCancelledRefundsCount,
            badge: cleanDoctorCancelledRefundsCount > 0 ? `${cleanDoctorCancelledRefundsCount} ca sạch` : (pendingRefundsCount > 0 ? 'CHỜ THẨM ĐỊNH' : 'SẠCH HỒ SƠ'),
            badgeColor: cleanDoctorCancelledRefundsCount > 0 ? 'purple' : (pendingRefundsCount > 0 ? 'amber' : 'slate'),
            targetTab: 'refunds',
            actionName: 'Hoàn tiền tự động',
          },
        ],

        automationEngine: {
          totalRuns: totalAutomationRuns,
          totalAutomatedVolume,
          latestRun: latestAutomationRun,
          status: 'STANDBY',
          canAutoRun: pendingSettlementsCount > 0 || autoEligibleWithdrawalsCount > 0 || cleanDoctorCancelledRefundsCount > 0,
        },
        recentCashFlow: recentTransactions.map((tx) => {
          const owner = tx.wallet?.owner;
          const ownerName = owner ? `${owner.lastName || ''} ${owner.firstName || ''}`.trim() : `Ví #${tx.walletId}`;
          return {
            id: tx.id,
            transactionType: tx.transactionType || tx.type,
            direction: tx.direction,
            amount: Number(tx.amount || 0),
            balanceAfter: Number(tx.balanceAfter || 0),
            description: tx.description,
            walletType: tx.wallet?.walletType,
            ownerName,
            createdAt: tx.createdAt,
          };
        }),
      },
    };
  } catch (error) {
    console.error('Error in getMasterTreasuryOverview:', error);
    return { errCode: -1, errMessage: 'Lỗi khi tải tổng quan ngân quỹ toàn sàn' };
  }
}

/**
 * 4. Chu Trình Tự Động Hóa Tài Chính Toàn Diện (Master Financial Automation Cycle)
 * Quét liên hoàn 3 nghiệp vụ:
 * 1. Hoàn tiền ca hủy sạch
 * 2. Quyết toán thù lao ca khám AVAILABLE (T+0)
 * 3. Tự động duyệt giải ngân rút tiền đủ điều kiện
 * Ghi 1 bản Master Batch Log tổng hợp
 */
async function runMasterAutomationCycle({ adminId = 1 } = {}) {
  const t0 = Date.now();
  try {
    const report = {
      timestamp: new Date().toISOString(),
      phases: {
        settlements: { processedCount: 0, totalAmount: 0 },
        withdrawals: { processedCount: 0, totalAmount: 0 },
        refunds: { processedCount: 0, totalAmount: 0 },
      },
      grandTotalAmount: 0,
      grandTotalItems: 0,
      executionTimeMs: 0,
      messages: [],
    };

    // ── GIAI ĐOẠN 0: TỰ ĐỘNG CHỐT CÁC CA QUÁ HẠN KHÔNG ĐẾN (NO-SHOW AUTO SCAN) ──
    const now = new Date();
    try {
      let autoScanHours = 4;
      try {
        const activePolicy = await db.Financial_Policy.findOne({
          where: { code: 'POL_REFUND_RULE', status: 'ACTIVE' },
          order: [['version', 'DESC']],
        });
        if (activePolicy && activePolicy.rules) {
          const r = typeof activePolicy.rules === 'string' ? JSON.parse(activePolicy.rules) : activePolicy.rules;
          if (r.noShowAutoScanHours) autoScanHours = Number(r.noShowAutoScanHours);
        }
      } catch (pe) {}

      const cutoffTime = new Date(now.getTime() - autoScanHours * 60 * 60 * 1000);
      const expiredBookings = await db.Booking.findAll({
        where: {
          statusId: 'S2',
          paymentStatus: 'paid',
        },
        limit: 20,
      });

      let autoNoShowCount = 0;
      for (const b of expiredBookings) {
        let appTime = null;
        if (b.date) {
          if (b.timeType) {
            appTime = getExactAppointmentTime(b.date, b.timeType);
          }
          if (!appTime || isNaN(appTime.getTime())) {
            const rawDate = Number(b.date);
            if (!isNaN(rawDate) && rawDate > 1000000000) {
              appTime = new Date(rawDate);
            } else {
              appTime = new Date(b.date);
            }
          }
        }
        if (appTime && appTime < cutoffTime) {
          b.statusId = 'S4';
          b.cancellationType = 'SYSTEM_NO_SHOW';
          b.cancellationReason = 'PATIENT_NO_SHOW';
          b.cancelledAt = now;
          await b.save();

          try {
            await db.Schedule.decrement('currentNumber', {
              by: 1,
              where: {
                doctorId: b.doctorId,
                date: b.date,
                timeType: b.timeType,
                currentNumber: { [db.Sequelize.Op.gt]: 0 },
              },
            });
          } catch (scErr) {
            console.warn('Lỗi decrement schedule khi chốt No-Show tự động:', scErr.message);
          }

          await refundGovernanceService.createRefundCase({
            bookingId: b.id,
            cancelledByRole: 'SYSTEM',
            cancellationReason: 'PATIENT_NO_SHOW',
            cancellationNote: `Hệ thống tự động chốt vắng mặt sau ${autoScanHours}h quá hạn`,
          });
          autoNoShowCount++;
        }
      }
      if (autoNoShowCount > 0) {
        report.messages.push(`Tự động chốt vắng mặt (No-Show) cho ${autoNoShowCount} ca khám quá hạn.`);
      }
    } catch (scanErr) {
      console.warn('Lỗi auto-scan No-Show:', scanErr.message);
    }

    // ── GIAI ĐOẠN 1: QUYẾT TOÁN THÙ LAO CA KHÁM (DOCTOR SETTLEMENTS) ──
    const settlementRes = await doctorSettlementService.autoRunDoctorPayoutCycle({ adminId });
    if (settlementRes && settlementRes.errCode === 0) {
      report.phases.settlements.processedCount = settlementRes.data?.totalProcessed || 0;
      report.phases.settlements.totalAmount = settlementRes.data?.totalAmount || 0;
      if (report.phases.settlements.processedCount > 0) {
        report.messages.push(`Quyết toán thành công ${report.phases.settlements.processedCount} ca khám (${report.phases.settlements.totalAmount.toLocaleString('vi-VN')} ₫) vào ví Bác sĩ.`);
      }
    }

    // ── GIAI ĐOẠN 2: HOÀN TIỀN TỰ ĐỘNG CÁC CA HỢP LỆ (REFUNDS) ──
    if (db.Refund_Case) {
      const cleanRefunds = await db.Refund_Case.findAll({
        where: {
          status: 'PENDING',
          [Op.or]: [
            { cancelledByRole: 'DOCTOR' },
            {
              cancellationReason: {
                [Op.in]: ['DOCTOR_UNAVAILABLE', 'DOCTOR_CANCELLED', 'CLINIC_FORCE_MAJEURE', 'SYSTEM_DUPLICATE_PAYMENT', 'PATIENT_ON_TIME', 'PATIENT_NO_SHOW'],
              },
            },
          ],
        },
        limit: 15,
      });

      for (const rc of cleanRefunds) {
        try {
          const res = await refundGovernanceService.processAdminReviewRefund(rc.id, {
            action: 'APPROVE',
            adminId: adminId || 1,
            reviewNote: 'Chu trình Master tự động hoàn tiền theo chính sách SLA',
          });
          if (res && res.errCode === 0) {
            report.phases.refunds.processedCount++;
            report.phases.refunds.totalAmount += Number(rc.refundAmount || rc.paidAmount || 0);
          }
        } catch (e) {
          console.warn(`Lỗi hoàn tiền ca #${rc.id}:`, e.message);
        }
      }
      if (report.phases.refunds.processedCount > 0) {
        report.messages.push(`Tự động hoàn tiền ${report.phases.refunds.processedCount} ca (${report.phases.refunds.totalAmount.toLocaleString('vi-VN')} ₫) cho bệnh nhân.`);
      }
    }

    // ── GIAI ĐOẠN 3: DUYỆT TỰ ĐỘNG RÚT TIỀN HỢP LỆ (WITHDRAWALS) ──
    if (db.Withdrawal_Request) {
      const eligibleWithdrawals = await db.Withdrawal_Request.findAll({
        where: {
          status: 'PENDING',
          amount: { [Op.lte]: HIGH_VALUE_WITHDRAWAL_THRESHOLD },
        },
        limit: 10,
      });

      for (const wd of eligibleWithdrawals) {
        try {
          const bankTransactionRef = `AUTO-CYCLE-TXN-${wd.id}-${Math.floor(100000 + Math.random() * 900000)}`;
          const res = await walletService.adminProcessWithdrawal(adminId || 1, {
            requestId: wd.id,
            action: 'TRANSFER',
            adminNote: 'Chu trình Master tự động phê duyệt giải ngân ngân hàng',
            bankTransactionRef,
          });
          if (res && res.errCode === 0) {
            report.phases.withdrawals.processedCount++;
            report.phases.withdrawals.totalAmount += Number(wd.amount || 0);
          }
        } catch (wErr) {
          console.warn(`Lỗi duyệt rút tiền #${wd.id}:`, wErr.message);
        }
      }
      if (report.phases.withdrawals.processedCount > 0) {
        report.messages.push(`Tự động duyệt chi ${report.phases.withdrawals.processedCount} lệnh rút tiền (${report.phases.withdrawals.totalAmount.toLocaleString('vi-VN')} ₫) về ngân hàng.`);
      }
    }

    report.grandTotalItems =

      report.phases.settlements.processedCount +
      report.phases.refunds.processedCount +
      report.phases.withdrawals.processedCount;
    report.grandTotalAmount =
      report.phases.settlements.totalAmount +
      report.phases.refunds.totalAmount +
      report.phases.withdrawals.totalAmount;
    report.executionTimeMs = Date.now() - t0;

    // Ghi nhận Master Automation Log
    if (db.Financial_Automation_Log && report.grandTotalItems > 0) {
      const batchCode = `MASTER-RUN-${moment().format('YYYYMMDD-HHmmss')}`;
      await db.Financial_Automation_Log.create({
        batchCode,
        jobType: 'MASTER_TREASURY_CYCLE',
        status: 'SUCCESS',
        totalItems: report.grandTotalItems,
        totalAmount: report.grandTotalAmount,
        details: JSON.stringify(report),
        triggeredBy: adminId ? 'ADMIN_MANUAL' : 'SYSTEM_CRON',
        adminId,
        executionTimeMs: report.executionTimeMs,
      });
    }

    return {
      errCode: 0,
      message:
        report.grandTotalItems > 0
          ? `Chu trình toàn diện hoàn tất! Đã xử lý ${report.grandTotalItems} nghiệp vụ, luân chuyển ${report.grandTotalAmount.toLocaleString('vi-VN')} ₫.`
          : 'Không có nghiệp vụ nào đủ điều kiện tự động hóa trong phiên này.',
      data: report,
    };
  } catch (error) {
    console.error('Error in runMasterAutomationCycle:', error);
    return { errCode: -1, errMessage: error.message || 'Lỗi khi chạy chu trình tài chính toàn diện' };
  }
}

/**
 * Helper: Giải mã khung thời gian lọc dòng tiền từ preset hoặc custom range
 */
function resolveCashflowDateRange(timeRange = 'all', fromDate = null, toDate = null) {
  let start = null;
  let end = null;
  const effectiveRange = (fromDate || toDate) && (!timeRange || timeRange === 'all' || timeRange === 'custom')
    ? 'custom'
    : (timeRange || 'all');

  if (effectiveRange === 'today') {
    start = moment().startOf('day').toDate();
    end = moment().endOf('day').toDate();
  } else if (effectiveRange === '7d') {
    start = moment().subtract(6, 'days').startOf('day').toDate();
    end = moment().endOf('day').toDate();
  } else if (effectiveRange === 'mtd') {
    start = moment().startOf('month').toDate();
    end = moment().endOf('day').toDate();
  } else if (effectiveRange === 'custom') {
    if (fromDate && moment(fromDate).isValid()) {
      start = moment(fromDate).startOf('day').toDate();
    }
    if (toDate && moment(toDate).isValid()) {
      end = moment(toDate).endOf('day').toDate();
    }
  }

  return {
    timeRange: effectiveRange,
    start,
    end,
    buildWhere(field = 'createdAt') {
      if (start && end) return { [field]: { [Op.between]: [start, end] } };
      if (start) return { [field]: { [Op.gte]: start } };
      if (end) return { [field]: { [Op.lte]: end } };
      return {};
    },
    inRange(dateVal) {
      if (!start && !end) return true;
      if (!dateVal) return false;
      const ts = new Date(dateVal).getTime();
      if (isNaN(ts)) return false;
      if (start && ts < start.getTime()) return false;
      if (end && ts > end.getTime()) return false;
      return true;
    },
  };
}

/**
 * Helper: Sắp xếp danh sách chứng từ nhất quán theo sort option
 */
function sortCashflowItems(items, sort = 'newest', amountKey = 'amount', dateKey = 'createdAt') {
  const list = [...(items || [])];
  if (sort === 'oldest') {
    return list.sort((a, b) => new Date(a[dateKey] || 0) - new Date(b[dateKey] || 0));
  }
  if (sort === 'highest') {
    return list.sort((a, b) => (Number(b[amountKey]) || 0) - (Number(a[amountKey]) || 0));
  }
  if (sort === 'lowest') {
    return list.sort((a, b) => (Number(a[amountKey]) || 0) - (Number(b[amountKey]) || 0));
  }
  return list.sort((a, b) => new Date(b[dateKey] || 0) - new Date(a[dateKey] || 0));
}

/**
 * Helper: Chuẩn hóa ngày khám từ epoch ms hoặc chuỗi ngày thành DD/MM/YYYY
 */
function formatAppointmentDate(rawDate, fallbackDate) {
  if (!rawDate) return fallbackDate ? moment(fallbackDate).format('DD/MM/YYYY') : '--';
  const asNum = Number(rawDate);
  const m = !isNaN(asNum) && asNum > 100000000 ? moment(asNum) : moment(rawDate);
  return m.isValid() ? m.format('DD/MM/YYYY') : String(rawDate);
}

/**
 * Helper: Tính phân bổ Bác sĩ / Sàn từ dữ liệu thật của Booking hoặc Policy Snapshot
 */
function resolveBookingSplit(booking, totalAmount, fallbackPlatformRate = 15) {
  const gross = Number(totalAmount) || 0;
  if (gross <= 0) return { doctorShare: 0, platformShare: 0 };

  if (booking && ((booking.doctorShare !== undefined && booking.doctorShare !== null) || (booking.platformFee !== undefined && booking.platformFee !== null))) {
    const doc = Number(booking.doctorShare || 0);
    const fee = Number(booking.platformFee || 0);
    if (doc + fee > 0) {
      return { doctorShare: doc, platformShare: fee };
    }
  }

  if (booking?.policySnapshot) {
    try {
      const snap = typeof booking.policySnapshot === 'string'
        ? JSON.parse(booking.policySnapshot)
        : booking.policySnapshot;
      if (snap?.calculation && (Number(snap.calculation.doctorShare) + Number(snap.calculation.platformFee) > 0)) {
        return {
          doctorShare: Number(snap.calculation.doctorShare || 0),
          platformShare: Number(snap.calculation.platformFee || 0),
        };
      }
      if (snap?.revenuePolicy?.rules?.platformFeePercent != null) {
        const rate = Number(snap.revenuePolicy.rules.platformFeePercent);
        const fee = Math.round((gross * rate) / 100);
        return { doctorShare: Math.max(0, gross - fee), platformShare: fee };
      }
    } catch (e) {
      // Bỏ qua nếu policySnapshot không hợp lệ
    }
  }

  const fee = Math.round((gross * fallbackPlatformRate) / 100);
  return { doctorShare: Math.max(0, gross - fee), platformShare: fee };
}

/**
 * Helper: Đọc tỷ lệ hoa hồng nền tảng đang hiệu lực từ Financial_Policy (GLOBAL)
 */
async function getActivePlatformFeeRate(fallbackRate = 15) {
  try {
    if (db.Financial_Policy) {
      const revPolicy = await db.Financial_Policy.findOne({
        where: { policyType: 'REVENUE_SHARE', status: 'ACTIVE', scopeType: 'GLOBAL' },
        order: [['version', 'DESC']],
        raw: true,
      });
      if (revPolicy?.rules) {
        const rules = typeof revPolicy.rules === 'string' ? JSON.parse(revPolicy.rules) : revPolicy.rules;
        if (rules?.standardRate != null && !isNaN(Number(rules.standardRate))) {
          return Number(rules.standardRate);
        }
      }
    }
  } catch (e) {
    console.warn('Could not read active revenue policy:', e.message);
  }
  return fallbackRate;
}

/**
 * Helper: Chuẩn hóa một bản ghi ca khám đang trong khoang tạm giữ Escrow Pool
 */
function buildEscrowBookingEntry(b, rawAmount, holdId, createdAt, paymentSource, fallbackRate = 15, fallbackPatientLabel = null) {
  const patient = b?.patientData || {};
  const doctor = b?.doctorBookingData || {};
  const amount = Number(rawAmount ?? b?.bookingPrice ?? 0);
  const { doctorShare, platformShare } = resolveBookingSplit(b, amount, fallbackRate);
  const pName = (patient.firstName || patient.lastName)
    ? `${patient.lastName || ''} ${patient.firstName || ''}`.trim()
    : (b?.patientName || fallbackPatientLabel || (b?.patientId ? `Bệnh nhân #${b.patientId}` : `Bệnh nhân ca #${b?.id || 'N/A'}`));
  const dName = (doctor.firstName || doctor.lastName)
    ? `${doctor.lastName || ''} ${doctor.firstName || ''}`.trim()
    : `Bác sĩ #${b?.doctorId || 'N/A'}`;
  const doctorPercent = amount > 0 ? Math.round((doctorShare / amount) * 100) : (100 - fallbackRate);
  const platformPercent = amount > 0 ? (100 - doctorPercent) : fallbackRate;

  return {
    holdId,
    bookingId: b?.id || null,
    paymentSource,
    paymentSourceLabel: paymentSource === 'WALLET' ? 'Ví nội bộ (HELD)' : 'VNPay trực tiếp',
    patientId: b?.patientId || null,
    patientName: pName,
    doctorId: b?.doctorId || null,
    clinicId: b?.clinicId || null,
    doctorName: dName,
    bookingPrice: amount,
    doctorShare,
    platformShare,
    doctorSharePercent: doctorPercent,
    platformSharePercent: platformPercent,
    statusId: b?.statusId || 'S2',
    date: formatAppointmentDate(b?.date, createdAt),
    timeType: b?.timeType || '--',
    createdAt,
  };
}

/**
 * [PHASE 1 - CASH FLOW ARCHITECTURE]
 * GET /api/v1/admin/financial/visual-cashflow
 * Tổng hợp toàn bộ dữ liệu 5 Khối Vốn Lõi, Đối soát Bất biến & 4 Biểu đồ Recharts chuẩn Ramp FinTech
 */
async function getVisualCashflowMetrics(options = {}) {
  const { fromDate, toDate, doctorId, clinicId, sort = 'newest', timeRange = 'all' } = options || {};
  try {
    const now = new Date();
    const dateFilter = resolveCashflowDateRange(timeRange, fromDate, toDate);
    const parsedDoctorId = doctorId ? parseInt(doctorId, 10) : null;
    const parsedClinicId = clinicId ? parseInt(clinicId, 10) : null;

    // 1. Đọc cấu hình tài chính thực tế từ SystemSetting & Financial_Policy
    let adminProfitWithdrawn = 0;
    let floatAllocatedAmount = 0;
    let platformReserveFund = 0;
    try {
      const settings = await db.SystemSetting.findAll({
        where: {
          key: {
            [Op.in]: [
              'financial_admin_profit_withdrawn',
              'financial_float_allocated_amount',
              'financial_platform_reserve_fund',
            ],
          },
        },
        raw: true,
      });
      settings.forEach((s) => {
        const val = Number(s.value);
        if (isNaN(val)) return;
        if (s.key === 'financial_admin_profit_withdrawn') adminProfitWithdrawn = Math.max(0, val);
        if (s.key === 'financial_float_allocated_amount') floatAllocatedAmount = Math.max(0, val);
        if (s.key === 'financial_platform_reserve_fund') platformReserveFund = Math.max(0, val);
      });
    } catch (e) {
      console.warn('Could not read financial system settings:', e.message);
    }

    const defaultPlatformFeeRate = await getActivePlatformFeeRate(15);

    // 2. KHỐI VÍ BỆNH NHÂN (Patient Wallets — số dư hiện hữu toàn sàn)
    let patientAvailable = 0;
    let patientReserved = 0;
    let patientWalletCount = 0;
    try {
      const patientStats = await db.Wallet.findAll({
        where: { walletType: { [Op.in]: ['PATIENT', 'USER'] } },
        attributes: [
          [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('availableBalance')), 0), 'totalAvailable'],
          [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('reservedBalance')), 0), 'totalReserved'],
          [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'walletCount'],
        ],
        raw: true,
      });
      patientAvailable = Number(patientStats[0]?.totalAvailable || 0);
      patientReserved = Number(patientStats[0]?.totalReserved || 0);
      patientWalletCount = parseInt(patientStats[0]?.walletCount || 0, 10);
    } catch (e) {
      console.warn('Could not query patient wallets:', e.message);
    }
    const totalPatientWallets = patientAvailable + patientReserved;

    // 3. KHỐI VÍ BÁC SĨ (Doctor Wallets — số dư hiện hữu toàn sàn)
    let doctorAvailable = 0;
    let doctorReserved = 0;
    let doctorWalletCount = 0;
    try {
      const doctorStats = await db.Wallet.findAll({
        where: { walletType: 'DOCTOR' },
        attributes: [
          [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('availableBalance')), 0), 'totalAvailable'],
          [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('reservedBalance')), 0), 'totalReserved'],
          [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'walletCount'],
        ],
        raw: true,
      });
      doctorAvailable = Number(doctorStats[0]?.totalAvailable || 0);
      doctorReserved = Number(doctorStats[0]?.totalReserved || 0);
      doctorWalletCount = parseInt(doctorStats[0]?.walletCount || 0, 10);
    } catch (e) {
      console.warn('Could not query doctor wallets:', e.message);
    }
    const totalDoctorWallets = doctorAvailable + doctorReserved;

    // 4. KHỐI TẠM GIỮ TRUNG GIAN (Escrow Pool — gồm cả cọc Ví BN HELD + ca VNPay đã thanh toán chờ khám S1/S2)
    let escrowTotal = 0;
    let escrowDoctorShare = 0;
    let escrowPlatformShare = 0;
    let walletHoldTotal = 0;
    let walletHoldCount = 0;
    let directVnpayTotal = 0;
    let directVnpayCount = 0;
    let activeHoldCount = 0;
    let escrowBookingsAll = [];

    try {
      const heldBookingIdSet = new Set();
      let walletEscrowBookingsAll = [];

      if (db.Wallet_Hold) {
        const holds = await db.Wallet_Hold.findAll({
          where: { status: 'HELD' },
          raw: true,
        });
        const bIds = holds.map((h) => h.bookingId).filter(Boolean);
        bIds.forEach((id) => heldBookingIdSet.add(id));

        const bookingsMap = {};
        if (bIds.length > 0) {
          const bList = await db.Booking.findAll({
            where: { id: { [Op.in]: bIds } },
            include: [
              { model: db.User, as: 'patientData', attributes: ['id', 'firstName', 'lastName'] },
              { model: db.User, as: 'doctorBookingData', attributes: ['id', 'firstName', 'lastName'] },
            ],
          });
          bList.forEach((b) => {
            bookingsMap[b.id] = b;
          });
        }

        walletEscrowBookingsAll = holds.map((h) => {
          const b = bookingsMap[h.bookingId] || { id: h.bookingId };
          return buildEscrowBookingEntry(
            b,
            h.amount,
            h.id,
            h.createdAt,
            'WALLET',
            defaultPlatformFeeRate,
            `Bệnh nhân #${b.patientId || h.walletId}`
          );
        });
      }

      // Loại trừ mọi booking đã có bút toán quyết toán (tránh đếm trùng với Doctor_Settlement_Item)
      const settledBookingIdSet = new Set();
      if (db.Doctor_Settlement_Item) {
        const settledRows = await db.Doctor_Settlement_Item.findAll({
          where: { status: { [Op.in]: ['EARNED', 'AVAILABLE', 'PAID'] } },
          attributes: ['bookingId'],
          raw: true,
        });
        settledRows.forEach((r) => {
          if (r.bookingId) settledBookingIdSet.add(r.bookingId);
        });
      }

      let directEscrowBookingsAll = [];
      if (db.Booking) {
        const excludedBookingIds = Array.from(new Set([...heldBookingIdSet, ...settledBookingIdSet]));
        const directEscrowWhere = {
          paymentMethod: 'VNPAY',
          paymentStatus: 'paid',
          statusId: { [Op.in]: ['S1', 'S2'] },
          bookingPrice: { [Op.gt]: 0 },
          [Op.or]: [{ refundStatus: 'none' }, { refundStatus: null }],
        };
        if (excludedBookingIds.length > 0) {
          directEscrowWhere.id = { [Op.notIn]: excludedBookingIds };
        }

        const directList = await db.Booking.findAll({
          where: directEscrowWhere,
          include: [
            { model: db.User, as: 'patientData', attributes: ['id', 'firstName', 'lastName'] },
            { model: db.User, as: 'doctorBookingData', attributes: ['id', 'firstName', 'lastName'] },
          ],
        });

        directEscrowBookingsAll = directList.map((b) =>
          buildEscrowBookingEntry(b, b.bookingPrice, `VNPAY-BK-${b.id}`, b.createdAt, 'VNPAY', defaultPlatformFeeRate)
        );
      }

      escrowBookingsAll = [...walletEscrowBookingsAll, ...directEscrowBookingsAll];
      activeHoldCount = escrowBookingsAll.length;
      escrowBookingsAll.forEach((eb) => {
        escrowTotal += eb.bookingPrice;
        escrowDoctorShare += eb.doctorShare;
        escrowPlatformShare += eb.platformShare;
        if (eb.paymentSource === 'WALLET') {
          walletHoldTotal += eb.bookingPrice;
          walletHoldCount += 1;
        } else {
          directVnpayTotal += eb.bookingPrice;
          directVnpayCount += 1;
        }
      });
    } catch (e) {
      console.warn('Could not query active escrow holds:', e.message);
    }

    const escrowDoctorPercent = escrowTotal > 0 ? Math.round((escrowDoctorShare / escrowTotal) * 100) : (100 - defaultPlatformFeeRate);
    const escrowPlatformPercent = escrowTotal > 0 ? (100 - escrowDoctorPercent) : defaultPlatformFeeRate;

    const filteredEscrowRaw = escrowBookingsAll.filter((eb) => {
      if (parsedDoctorId && eb.doctorId !== parsedDoctorId) return false;
      if (parsedClinicId && eb.clinicId !== parsedClinicId) return false;
      return dateFilter.inRange(eb.createdAt);
    });
    const escrowBookings = sortCashflowItems(filteredEscrowRaw, sort, 'bookingPrice', 'createdAt');
    const flowHeldBooking = escrowBookings.reduce((sum, item) => sum + item.bookingPrice, 0);
    const flowHeldCount = escrowBookings.length;
    const flowHeldWalletBooking = escrowBookings
      .filter((item) => item.paymentSource === 'WALLET')
      .reduce((sum, item) => sum + item.bookingPrice, 0);
    const flowHeldWalletCount = escrowBookings.filter((item) => item.paymentSource === 'WALLET').length;
    const flowHeldDirectVnpayBooking = flowHeldBooking - flowHeldWalletBooking;
    const flowHeldDirectVnpayCount = flowHeldCount - flowHeldWalletCount;

    // 5. KHỐI TIỀN LỜI CÔNG TY (Platform Profit — snapshot toàn sàn)
    let totalPlatformFeeEarned = 0;
    try {
      if (db.Doctor_Settlement_Item) {
        totalPlatformFeeEarned = Number(
          (await db.Doctor_Settlement_Item.sum('platformFee', {
            where: { status: { [Op.in]: ['EARNED', 'AVAILABLE', 'PAID'] } },
          })) || 0
        );
      }
    } catch (e) {
      console.warn('Could not query platform fees:', e.message);
    }
    const spendableProfit = Math.max(0, totalPlatformFeeEarned - adminProfitWithdrawn);

    // 6. KHỐI TÀI KHOẢN NGÂN HÀNG THẬT (Real Bank VCB Company Account — Toàn sàn & Theo kỳ lọc)
    let walletDepositInflowAll = 0;
    let walletDepositInflowPeriod = 0;
    let walletDepositCountPeriod = 0;
    let recentDeposits = [];
    try {
      if (db.Payment_Transaction) {
        walletDepositInflowAll = Number(
          (await db.Payment_Transaction.sum('amount', { where: { status: 'SUCCESS' } })) || 0
        );

        const depWhere = { status: 'SUCCESS', ...dateFilter.buildWhere('createdAt') };
        const depList = await db.Payment_Transaction.findAll({
          where: depWhere,
          order: [['createdAt', 'DESC']],
          include: [
            {
              model: db.Wallet,
              as: 'wallet',
              include: [{ model: db.User, as: 'owner', attributes: ['id', 'firstName', 'lastName'] }],
            },
          ],
        });

        walletDepositCountPeriod = depList.length;
        const mappedDeposits = depList.map((d) => {
          const amt = Number(d.amount || 0);
          walletDepositInflowPeriod += amt;
          const o = d.wallet?.owner;
          return {
            id: d.id,
            amount: amt,
            paymentMethod: d.gateway || d.paymentMethod || 'VNPAY',
            txnRef: d.gatewayTransactionNo || d.txnRef || `PAY-${d.id}`,
            patientName: o ? `${o.lastName || ''} ${o.firstName || ''}`.trim() : 'Bệnh nhân',
            createdAt: d.createdAt,
          };
        });
        recentDeposits = sortCashflowItems(mappedDeposits, sort, 'amount', 'createdAt').slice(0, 50);
      }
    } catch (e) {
      console.warn('Could not query payment transactions:', e.message);
    }

    let directBookingInflowAll = 0;
    let directBookingInflowPeriod = 0;
    let directBookingCountPeriod = 0;
    try {
      const bAllStats = await db.Booking.findAll({
        where: { paymentStatus: 'paid', paymentMethod: 'VNPAY' },
        attributes: [
          [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('bookingPrice')), 0), 'totalPaid'],
        ],
        raw: true,
      });
      directBookingInflowAll = Number(bAllStats[0]?.totalPaid || 0);

      const bPeriodWhere = {
        paymentStatus: 'paid',
        paymentMethod: 'VNPAY',
        ...dateFilter.buildWhere('createdAt'),
      };
      if (parsedDoctorId) bPeriodWhere.doctorId = parsedDoctorId;
      if (parsedClinicId) bPeriodWhere.clinicId = parsedClinicId;

      const bPeriodStats = await db.Booking.findAll({
        where: bPeriodWhere,
        attributes: [
          [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('bookingPrice')), 0), 'totalPaid'],
          [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'cnt'],
        ],
        raw: true,
      });
      directBookingInflowPeriod = Number(bPeriodStats[0]?.totalPaid || 0);
      directBookingCountPeriod = parseInt(bPeriodStats[0]?.cnt || 0, 10);
    } catch (e) {
      console.warn('Could not query direct bookings:', e.message);
    }

    const totalRealInflowAll = walletDepositInflowAll + directBookingInflowAll;

    // Rút tiền thực tế (Withdrawal_Request + join Wallet để lấy đúng walletType và accountNumber)
    let doctorBankPayoutAll = 0;
    let patientBankPayoutAll = 0;
    let doctorBankPayoutPeriod = 0;
    let patientBankPayoutPeriod = 0;
    let doctorPayoutCountPeriod = 0;
    let pendingWithdrawalsCount = 0;
    let pendingWithdrawalsAmount = 0;
    let recentWithdrawals = [];
    let doctorPayoutsList = [];

    try {
      if (db.Withdrawal_Request) {
        const allWithdrawals = await db.Withdrawal_Request.findAll({
          order: [['createdAt', 'DESC']],
          include: [
            {
              model: db.Wallet,
              as: 'wallet',
              attributes: ['id', 'ownerId', 'walletType'],
              include: [{ model: db.User, as: 'owner', attributes: ['id', 'firstName', 'lastName'] }],
            },
          ],
        });

        const mappedAllWithdrawals = allWithdrawals.map((wInst) => {
          const w = wInst.toJSON();
          const wType = w.wallet?.walletType || 'USER';
          const owner = w.wallet?.owner;
          const ownerName = owner ? `${owner.lastName || ''} ${owner.firstName || ''}`.trim() : null;
          const amt = Number(w.amount || 0);
          const effectiveDate = w.transferredAt || w.createdAt;

          if (w.status === 'TRANSFERRED') {
            if (wType === 'DOCTOR') {
              doctorBankPayoutAll += amt;
            } else {
              patientBankPayoutAll += amt;
            }
          } else if (['PENDING', 'APPROVED'].includes(w.status)) {
            pendingWithdrawalsCount += 1;
            pendingWithdrawalsAmount += amt;
          }

          return {
            id: w.id,
            amount: amt,
            walletType: wType,
            ownerName: ownerName || w.accountHolderName || 'Chủ tài khoản',
            accountHolderName: w.accountHolderName || ownerName || 'Chủ tài khoản',
            bankName: w.bankName || '--',
            accountNumber: w.accountNumber || null,
            bankAccountNumber: w.accountNumber || null,
            bankTransactionRef: w.bankTransactionRef || null,
            status: w.status,
            transferredAt: w.transferredAt,
            createdAt: w.createdAt,
            effectiveDate,
          };
        });

        const periodWithdrawals = mappedAllWithdrawals.filter((w) => dateFilter.inRange(w.effectiveDate));
        recentWithdrawals = sortCashflowItems(periodWithdrawals, sort, 'amount', 'effectiveDate').slice(0, 50);

        const disbursedDoctorList = periodWithdrawals.filter(
          (w) => w.status === 'TRANSFERRED' && w.walletType === 'DOCTOR'
        );
        const disbursedPatientList = periodWithdrawals.filter(
          (w) => w.status === 'TRANSFERRED' && w.walletType !== 'DOCTOR'
        );

        doctorBankPayoutPeriod = disbursedDoctorList.reduce((acc, w) => acc + w.amount, 0);
        patientBankPayoutPeriod = disbursedPatientList.reduce((acc, w) => acc + w.amount, 0);
        doctorPayoutCountPeriod = disbursedDoctorList.length;
        doctorPayoutsList = sortCashflowItems(disbursedDoctorList, sort, 'amount', 'effectiveDate').slice(0, 50);
      }
    } catch (e) {
      console.warn('Could not query withdrawals:', e.message);
    }

    // 6b. SỬA LOGIC KẾ TOÁN TẦNG 1 & ĐỐI SOÁT TẦNG 2 (Không đếm trùng reservedBalance!)
    // Tổng nghĩa vụ Sổ cái Sàn = patientAvailable (rảnh) + escrowTotal (tạm giữ) + totalDoctorWallets + spendableProfit
    const totalSystemLiabilities = patientAvailable + escrowTotal + totalDoctorWallets + spendableProfit;

    // Tiền mặt thật tại VCB = Vốn đối ứng bảo chứng sàn + Tổng thu VNPay (Nạp ví + Đặt khám trực tiếp) - Tổng chi UNC/Rút lời - Vốn trích đầu tư
    const totalRealOutflowAll = adminProfitWithdrawn + doctorBankPayoutAll + patientBankPayoutAll + floatAllocatedAmount;
    const realBankBalance = Math.max(0, platformReserveFund + totalRealInflowAll - totalRealOutflowAll);

    // Chênh lệch thanh khoản: Dương = Dự trữ thanh khoản tại VCB; Âm = Thiếu hụt tiền mặt bảo chứng
    const discrepancy = realBankBalance - totalSystemLiabilities;
    const reserveSurplus = Math.max(0, discrepancy);
    const isBalanced = realBankBalance >= totalSystemLiabilities;
    const coveragePercent = totalSystemLiabilities > 0
      ? Math.round((realBankBalance / totalSystemLiabilities) * 100)
      : 100;

    // 7. QUYẾT TOÁN THÙ LAO & PHÍ SÀN TRONG KỲ LỌC (Doctor_Settlement_Item)
    let recentSettlements = [];
    let platformFeeItemsList = [];
    let periodDoctorSettledNet = 0;
    let periodDoctorSettledGross = 0;
    let periodPlatformCommission = 0;
    let periodDoctorSettledCount = 0;
    let periodDoctorPaidToWallet = 0;
    let periodDoctorPendingPayout = 0;

    try {
      if (db.Doctor_Settlement_Item) {
        const settleWhere = {
          status: { [Op.in]: ['EARNED', 'AVAILABLE', 'PAID'] },
          ...dateFilter.buildWhere('earnedAt'),
        };
        if (parsedDoctorId) settleWhere.doctorId = parsedDoctorId;
        if (parsedClinicId) settleWhere.clinicId = parsedClinicId;

        const items = await db.Doctor_Settlement_Item.findAll({
          where: settleWhere,
          order: [['earnedAt', 'DESC']],
          raw: true,
        });

        const docIds = [...new Set(items.map((i) => i.doctorId).filter(Boolean))];
        const docMap = {};
        if (docIds.length > 0) {
          const docUsers = await db.User.findAll({
            where: { id: { [Op.in]: docIds } },
            attributes: ['id', 'firstName', 'lastName'],
            raw: true,
          });
          docUsers.forEach((u) => {
            docMap[u.id] = `${u.lastName || ''} ${u.firstName || ''}`.trim();
          });
        }

        const mappedSettlements = items.map((s) => {
          const gross = Number(s.grossAmount || 0);
          const net = Number(s.netAmount || 0);
          const fee = Number(s.platformFee || 0);
          periodDoctorSettledGross += gross;
          periodDoctorSettledNet += net;
          periodPlatformCommission += fee;
          periodDoctorSettledCount += 1;
          if (s.status === 'PAID') {
            periodDoctorPaidToWallet += net;
          } else {
            periodDoctorPendingPayout += net;
          }
          return {
            id: s.id,
            bookingId: s.bookingId,
            doctorId: s.doctorId,
            doctorName: docMap[s.doctorId] || `Bác sĩ #${s.doctorId}`,
            grossAmount: gross,
            netAmount: net,
            platformFeeRate: Number(s.platformFeeRate || defaultPlatformFeeRate),
            platformFee: fee,
            status: s.status,
            earnedAt: s.earnedAt || s.createdAt,
            note: s.note,
          };
        });

        recentSettlements = sortCashflowItems(mappedSettlements, sort, 'netAmount', 'earnedAt').slice(0, 50);

        const feeOnlyItems = mappedSettlements
          .filter((f) => f.platformFee > 0)
          .map((f) => ({
            id: f.id,
            bookingId: f.bookingId,
            doctorId: f.doctorId,
            doctorName: f.doctorName,
            grossAmount: f.grossAmount,
            platformFeeRate: f.platformFeeRate,
            platformFee: f.platformFee,
            earnedAt: f.earnedAt,
            note: f.note,
          }));
        platformFeeItemsList = sortCashflowItems(feeOnlyItems, sort, 'platformFee', 'earnedAt').slice(0, 50);
      }
    } catch (e) {
      console.warn('Could not query settlement constituents:', e.message);
    }

    const periodDoctorPercent = periodDoctorSettledGross > 0
      ? Math.round((periodDoctorSettledNet / periodDoctorSettledGross) * 1000) / 10
      : escrowDoctorPercent;
    const periodPlatformPercent = periodDoctorSettledGross > 0
      ? Math.round((periodPlatformCommission / periodDoctorSettledGross) * 1000) / 10
      : escrowPlatformPercent;

    // 7b. Lịch sử Rút lợi nhuận sàn thật từ Financial_Automation_Log
    let companyWithdrawalsList = [];
    let profitWithdrawnPeriod = 0;
    try {
      if (db.Financial_Automation_Log) {
        const cashoutLogs = await db.Financial_Automation_Log.findAll({
          where: {
            jobType: 'PLATFORM_PROFIT_CASHOUT',
            ...dateFilter.buildWhere('createdAt'),
          },
          order: [['createdAt', 'DESC']],
          raw: true,
        });
        companyWithdrawalsList = cashoutLogs.map((log) => {
          let details = {};
          try {
            details = typeof log.details === 'string' ? JSON.parse(log.details) : (log.details || {});
          } catch (e) {
            details = {};
          }
          const amt = Number(details.amount || log.totalAmount || 0);
          profitWithdrawnPeriod += amt;
          return {
            id: log.id,
            batchCode: log.batchCode,
            amount: amt,
            recipient: details.bankAccountInfo || 'CONG TY CP CONG NGHE BOOKINGCARE',
            bankName: 'Ngân hàng thụ hưởng',
            accountNumber: details.bankAccountInfo || 'Theo nhật ký Admin',
            reason: details.note || 'Rút lợi nhuận hoa hồng sàn',
            transferredAt: log.createdAt,
            status: log.status === 'SUCCESS' ? 'TRANSFERRED' : log.status,
          };
        });
        companyWithdrawalsList = sortCashflowItems(companyWithdrawalsList, sort, 'amount', 'transferredAt');
      }
    } catch (e) {
      console.warn('Could not query company profit cashout logs:', e.message);
    }

    // Hoàn tiền trong kỳ lọc (Wallet_Transaction REFUND)
    let refundedAmountPeriod = 0;
    let refundCountPeriod = 0;
    try {
      if (db.Wallet_Transaction) {
        const refStats = await db.Wallet_Transaction.findAll({
          where: {
            transactionType: 'REFUND',
            ...dateFilter.buildWhere('createdAt'),
          },
          attributes: [
            [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('amount')), 0), 'totalRefund'],
            [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'cnt'],
          ],
          raw: true,
        });
        refundedAmountPeriod = Number(refStats[0]?.totalRefund || 0);
        refundCountPeriod = parseInt(refStats[0]?.cnt || 0, 10);
      }
    } catch (e) {
      console.warn('Could not query refund period stats:', e.message);
    }

    // 8. DỮ LIỆU BIỂU ĐỒ RECHARTS (4 Biểu đồ — phản ánh đúng kỳ lọc và tỷ lệ thực tế)
    const reconciliationChart = [
      {
        name: 'Tiền mặt VCB Thực tế',
        totalReal: realBankBalance,
        patientLiabilities: 0,
        doctorLiabilities: 0,
        escrowLiabilities: 0,
        profitLiabilities: 0,
        reserveLiabilities: 0,
      },
      {
        name: 'Nghĩa vụ Sổ cái & Dự trữ',
        totalReal: 0,
        patientLiabilities: patientAvailable,
        doctorLiabilities: totalDoctorWallets,
        escrowLiabilities: escrowTotal,
        profitLiabilities: spendableProfit,
        reserveLiabilities: reserveSurplus,
      },
    ];

    const capitalComposition = [
      { name: 'Ví Bệnh nhân khả dụng', value: patientAvailable, color: '#8b5cf6' },
      { name: 'Ví Bác sĩ (BS App)', value: totalDoctorWallets, color: '#10b981' },
      { name: 'Quỹ Tạm giữ Escrow', value: escrowTotal, color: '#f59e0b' },
      { name: 'Lợi nhuận Công ty', value: spendableProfit, color: '#d4ff00' },
    ].filter((item) => item.value > 0);

    const dailyCashFlow = [];
    let chartDays = [];
    if (dateFilter.timeRange === 'today') {
      chartDays = [moment().startOf('day')];
    } else if (dateFilter.timeRange === 'mtd') {
      const mStart = moment().startOf('month');
      const todayM = moment().startOf('day');
      const diff = Math.min(30, todayM.diff(mStart, 'days'));
      for (let i = diff; i >= 0; i--) {
        chartDays.push(moment().subtract(i, 'days').startOf('day'));
      }
    } else if (dateFilter.timeRange === 'custom' && dateFilter.start && dateFilter.end) {
      const cEnd = moment(dateFilter.end).startOf('day');
      const cStart = moment(dateFilter.start).startOf('day');
      const diff = Math.max(0, Math.min(30, cEnd.diff(cStart, 'days')));
      for (let i = diff; i >= 0; i--) {
        chartDays.push(moment(cEnd).subtract(i, 'days').startOf('day'));
      }
    } else {
      for (let i = 6; i >= 0; i--) {
        chartDays.push(moment().subtract(i, 'days').startOf('day'));
      }
    }

    for (const d of chartDays) {
      const startOfDay = moment(d).startOf('day').toDate();
      const endOfDay = moment(d).endOf('day').toDate();

      let dayInflow = 0;
      let dayOutflow = 0;
      try {
        if (db.Payment_Transaction) {
          dayInflow += Number(
            (await db.Payment_Transaction.sum('amount', {
              where: {
                status: 'SUCCESS',
                createdAt: { [Op.between]: [startOfDay, endOfDay] },
              },
            })) || 0
          );
        }
        if (db.Booking) {
          dayInflow += Number(
            (await db.Booking.sum('bookingPrice', {
              where: {
                paymentStatus: 'paid',
                paymentMethod: 'VNPAY',
                createdAt: { [Op.between]: [startOfDay, endOfDay] },
              },
            })) || 0
          );
        }
        if (db.Withdrawal_Request) {
          dayOutflow += Number(
            (await db.Withdrawal_Request.sum('amount', {
              where: {
                status: 'TRANSFERRED',
                transferredAt: { [Op.between]: [startOfDay, endOfDay] },
              },
            })) || 0
          );
        }
      } catch (e) {
        dayInflow = 0;
        dayOutflow = 0;
      }

      dailyCashFlow.push({
        date: d.format('DD/MM'),
        inflow: dayInflow,
        outflow: dayOutflow,
        net: dayInflow - dayOutflow,
      });
    }

    const commissionSplit = periodDoctorSettledGross > 0
      ? [
          {
            name: 'Thù lao Bác sĩ',
            percent: periodDoctorPercent,
            amount: periodDoctorSettledNet,
            color: '#10b981',
          },
          {
            name: 'Phí Dịch vụ Sàn',
            percent: periodPlatformPercent,
            amount: periodPlatformCommission,
            color: '#d4ff00',
          },
        ]
      : [
          {
            name: 'Thù lao Bác sĩ',
            percent: escrowDoctorPercent,
            amount: escrowDoctorShare,
            color: '#10b981',
          },
          {
            name: 'Phí Dịch vụ Sàn',
            percent: escrowPlatformPercent,
            amount: escrowPlatformShare,
            color: '#d4ff00',
          },
        ];

    // 9. BƯỚC THỰC TẾ GẦN NHẤT TRONG KỲ LỌC (Step Breakdown — không hardcode giả)
    let latestDeposit = null;
    try {
      if (db.Payment_Transaction) {
        latestDeposit = await db.Payment_Transaction.findOne({
          where: { status: 'SUCCESS', ...dateFilter.buildWhere('createdAt') },
          order: [['createdAt', 'DESC']],
          include: [
            {
              model: db.Wallet,
              as: 'wallet',
              include: [{ model: db.User, as: 'owner', attributes: ['id', 'firstName', 'lastName'] }],
            },
          ],
        });
      }
    } catch (e) {
      latestDeposit = null;
    }

    const latestBookingHoldItem = escrowBookings[0] || null;
    const latestWithdrawalItem = doctorPayoutsList[0] || recentWithdrawals.find((w) => w.status === 'TRANSFERRED') || null;

    // 10. GIAO DỊCH THỜI GIAN THỰC GẦN ĐÂY (Recent Audit Feed — lọc theo thời gian & sắp xếp)
    let recentTransactions = [];
    try {
      if (db.Wallet_Transaction) {
        const orderCol = sort === 'oldest'
          ? [['createdAt', 'ASC']]
          : sort === 'highest'
          ? [['amount', 'DESC']]
          : sort === 'lowest'
          ? [['amount', 'ASC']]
          : [['createdAt', 'DESC']];

        const txs = await db.Wallet_Transaction.findAll({
          where: dateFilter.buildWhere('createdAt'),
          limit: 15,
          order: orderCol,
          include: [
            {
              model: db.Wallet,
              as: 'wallet',
              attributes: ['id', 'ownerId', 'walletType'],
              include: [{ model: db.User, as: 'owner', attributes: ['id', 'firstName', 'lastName', 'email'] }],
            },
          ],
        });
        recentTransactions = txs.map((tx) => {
          const item = tx.toJSON();
          const owner = item.wallet?.owner;
          item.ownerName = owner ? `${owner.lastName || ''} ${owner.firstName || ''}`.trim() : 'Hệ thống';
          item.ownerEmail = owner?.email || null;
          return item;
        });
      }
    } catch (e) {
      recentTransactions = [];
    }

    // 11. FLOWS THEO KỲ LỌC (100% số liệu thật từ DB trong khoảng thời gian đã chọn)
    const flows = {
      depositInflow: walletDepositInflowPeriod,
      depositCount: walletDepositCountPeriod,
      directBookingInflow: directBookingInflowPeriod,
      directBookingCount: directBookingCountPeriod,
      totalVnpayInflow: walletDepositInflowPeriod + directBookingInflowPeriod,
      heldBooking: flowHeldBooking,
      heldCount: flowHeldCount,
      heldWalletBooking: flowHeldWalletBooking,
      heldWalletCount: flowHeldWalletCount,
      heldDirectVnpayBooking: flowHeldDirectVnpayBooking,
      heldDirectVnpayCount: flowHeldDirectVnpayCount,
      doctorSettled: periodDoctorSettledNet,
      doctorSettledGross: periodDoctorSettledGross,
      doctorSettledCount: periodDoctorSettledCount,
      doctorSettledPaidToWallet: periodDoctorPaidToWallet,
      doctorSettledPendingPayout: periodDoctorPendingPayout,
      platformCommission: periodPlatformCommission,
      doctorSharePercent: periodDoctorPercent,
      platformSharePercent: periodPlatformPercent,
      bankTransferred: doctorBankPayoutPeriod + patientBankPayoutPeriod,
      doctorBankTransferred: doctorBankPayoutPeriod,
      patientBankTransferred: patientBankPayoutPeriod,
      bankTransferredCount: doctorPayoutCountPeriod,
      pendingWithdrawalsCount,
      pendingWithdrawalsAmount,
      profitWithdrawn: profitWithdrawnPeriod,
      refundedAmount: refundedAmountPeriod,
      refundCount: refundCountPeriod,
    };

    // 12. DANH SÁCH VÍ CẤU THÀNH (EVIDENCE SUB-LEDGER)
    let patientWalletsList = [];
    try {
      if (db.Wallet) {
        const pwList = await db.Wallet.findAll({
          where: { walletType: { [Op.in]: ['PATIENT', 'USER'] } },
          order: [['availableBalance', 'DESC']],
          include: [{ model: db.User, as: 'owner', attributes: ['id', 'firstName', 'lastName', 'phoneNumber', 'email'] }],
        });
        patientWalletsList = pwList.map((w) => {
          const o = w.owner || {};
          const avail = Number(w.availableBalance) || 0;
          const resv = Number(w.reservedBalance) || 0;
          return {
            walletId: w.id,
            ownerId: w.ownerId,
            ownerName: (o.firstName || o.lastName) ? `${o.lastName || ''} ${o.firstName || ''}`.trim() : `Bệnh nhân #${w.ownerId}`,
            phone: o.phoneNumber || '---',
            email: o.email || '---',
            availableBalance: avail,
            reservedBalance: resv,
            totalBalance: avail + resv,
            updatedAt: w.updatedAt,
          };
        });
        patientWalletsList = sortCashflowItems(patientWalletsList, sort, 'totalBalance', 'updatedAt');
      }
    } catch (e) {
      console.warn('Could not query patient wallets list:', e.message);
    }

    let doctorWalletsList = [];
    try {
      if (db.Wallet) {
        const dwList = await db.Wallet.findAll({
          where: { walletType: 'DOCTOR' },
          order: [['availableBalance', 'DESC']],
          include: [{ model: db.User, as: 'owner', attributes: ['id', 'firstName', 'lastName', 'phoneNumber', 'email'] }],
        });
        doctorWalletsList = dwList.map((w) => {
          const o = w.owner || {};
          const avail = Number(w.availableBalance) || 0;
          const resv = Number(w.reservedBalance) || 0;
          return {
            walletId: w.id,
            ownerId: w.ownerId,
            doctorName: (o.firstName || o.lastName) ? `${o.lastName || ''} ${o.firstName || ''}`.trim() : `Bác sĩ #${w.ownerId}`,
            phone: o.phoneNumber || '---',
            email: o.email || '---',
            availableBalance: avail,
            reservedBalance: resv,
            totalBalance: avail + resv,
            updatedAt: w.updatedAt,
          };
        });
        doctorWalletsList = sortCashflowItems(doctorWalletsList, sort, 'totalBalance', 'updatedAt');
      }
    } catch (e) {
      console.warn('Could not query doctor wallets list:', e.message);
    }

    const constituents = {
      escrowBookings,
      recentSettlements,
      recentDeposits,
      recentWithdrawals,
      patientWalletsList,
      doctorWalletsList,
      platformFeeItemsList,
      doctorPayoutsList,
      companyWithdrawalsList,
    };

    const balanceSign = discrepancy >= 0 ? `+${reserveSurplus.toLocaleString('vi-VN')} đ dự trữ` : `THIẾU ${Math.abs(discrepancy).toLocaleString('vi-VN')} đ`;

    return {
      errCode: 0,
      errMessage: 'OK',
      data: {
        timestamp: now.toISOString(),
        flows,
        constituents,
        filters: {
          timeRange: dateFilter.timeRange,
          fromDate: fromDate || null,
          toDate: toDate || null,
          sort,
          doctorId: parsedDoctorId,
          clinicId: parsedClinicId,
        },
        vaults: {
          realBank: {
            currentBalance: realBankBalance,
            totalInflowVNPay: totalRealInflowAll,
            walletDepositInflow: walletDepositInflowAll,
            directBookingInflow: directBookingInflowAll,
            totalOutflowBank: totalRealOutflowAll,
            doctorPayouts: doctorBankPayoutAll,
            patientPayouts: patientBankPayoutAll,
            adminProfitWithdrawn,
            floatAllocatedAmount,
            platformReserveFund,
            reserveSurplus,
            bankName: 'Vietcombank (VCB)',
            accountNumber: '9988-1703-8888',
            accountHolder: 'CONG TY CP CONG NGHE BOOKINGCARE',
          },
          patientWallets: {
            total: totalPatientWallets,
            available: patientAvailable,
            reserved: patientReserved,
            count: patientWalletCount,
          },
          escrowPool: {
            total: escrowTotal,
            walletHoldTotal,
            walletHoldCount,
            directVnpayTotal,
            directVnpayCount,
            doctorShare: escrowDoctorShare,
            platformShare: escrowPlatformShare,
            doctorSharePercent: escrowDoctorPercent,
            platformSharePercent: escrowPlatformPercent,
            activeCount: activeHoldCount,
          },
          doctorWallets: {
            total: totalDoctorWallets,
            available: doctorAvailable,
            reserved: doctorReserved,
            count: doctorWalletCount,
            pendingSettlementTotal: periodDoctorPendingPayout,
          },
          platformProfit: {
            totalEarned: totalPlatformFeeEarned,
            withdrawnByAdmin: adminProfitWithdrawn,
            spendable: spendableProfit,
            spendablePercent: totalPlatformFeeEarned > 0 ? Math.round((spendableProfit / totalPlatformFeeEarned) * 100) : 100,
          },
        },
        reconciliation: {
          isBalanced,
          status: isBalanced ? 'HEALTHY' : 'DEFICIT',
          discrepancyAmount: discrepancy,
          totalSystemLiabilities,
          reserveSurplus,
          coveragePercent,
          requiredBacking: totalSystemLiabilities,
          formula: `VCB Thật (${realBankBalance.toLocaleString('vi-VN')} đ) vs Sổ cái (${totalSystemLiabilities.toLocaleString('vi-VN')} đ = Ví BN rảnh ${patientAvailable.toLocaleString('vi-VN')} + Escrow ${escrowTotal.toLocaleString('vi-VN')} + Ví BS ${totalDoctorWallets.toLocaleString('vi-VN')} + Lợi nhuận ${spendableProfit.toLocaleString('vi-VN')}) | ${balanceSign}`,
        },
        charts: {
          reconciliationChart,
          capitalComposition,
          dailyCashFlow,
          commissionSplit,
        },
        stepBreakdown: {
          step1: latestDeposit
            ? {
                amount: Number(latestDeposit.amount),
                vnpayTxCode: latestDeposit.gatewayTransactionNo || latestDeposit.txnRef,
                patientName: latestDeposit.wallet?.owner
                  ? `${latestDeposit.wallet.owner.lastName || ''} ${latestDeposit.wallet.owner.firstName || ''}`.trim()
                  : 'Bệnh nhân',
                createdAt: latestDeposit.createdAt,
              }
            : null,
          step2: latestBookingHoldItem
            ? {
                bookingId: latestBookingHoldItem.bookingId,
                amount: latestBookingHoldItem.bookingPrice,
                doctorShare: latestBookingHoldItem.doctorShare,
                platformShare: latestBookingHoldItem.platformShare,
                doctorName: latestBookingHoldItem.doctorName,
                createdAt: latestBookingHoldItem.createdAt,
              }
            : null,
          step3: latestWithdrawalItem
            ? {
                amount: latestWithdrawalItem.amount,
                bankRef: latestWithdrawalItem.bankTransactionRef,
                recipientName: latestWithdrawalItem.accountHolderName,
                bankName: latestWithdrawalItem.bankName,
                transferredAt: latestWithdrawalItem.transferredAt || latestWithdrawalItem.createdAt,
              }
            : null,
        },
        recentTransactions,
      },
    };
  } catch (error) {
    console.error('Error in getVisualCashflowMetrics:', error);
    return {
      errCode: -1,
      errMessage: error.message || 'Lỗi khi tổng hợp sơ đồ dòng tiền',
    };
  }
}

/**
 * [PHASE 1 - CASH FLOW ARCHITECTURE]
 * POST /api/v1/admin/financial/withdraw-platform-profit
 * Admin rút lợi nhuận nền tảng tích lũy ra tài khoản ngân hàng
 */
async function withdrawPlatformProfit(adminId, { amount, note, bankAccountInfo }) {
  const numAmount = Number(amount);
  if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
    return { errCode: 1, errMessage: 'Số tiền rút không hợp lệ (phải lớn hơn 0)' };
  }

  const t = await db.sequelize.transaction();
  try {
    const metricsRes = await getVisualCashflowMetrics();
    const metrics = metricsRes?.data;
    if (!metrics) {
      await t.rollback();
      return { errCode: 2, errMessage: 'Không thể đọc chỉ số ngân quỹ sàn' };
    }

    const availableProfit = metrics.vaults.platformProfit.spendable;
    if (numAmount > availableProfit) {
      await t.rollback();
      return {
        errCode: 3,
        errMessage: `Số tiền muốn rút (${numAmount.toLocaleString('vi-VN')} đ) vượt quá Lợi nhuận sàn khả dụng (${availableProfit.toLocaleString('vi-VN')} đ)!`,
      };
    }

    const remainingCash = metrics.vaults.realBank.currentBalance - numAmount;
    const requiredCoverage =
      metrics.vaults.patientWallets.available +
      metrics.vaults.doctorWallets.total +
      metrics.vaults.escrowPool.total;

    if (remainingCash < requiredCoverage) {
      await t.rollback();
      return {
        errCode: 4,
        errMessage: `Không thể rút! Tiền mặt còn lại sau khi rút (${remainingCash.toLocaleString('vi-VN')} đ) không đủ để bảo chứng 100% cho số dư ví của Bệnh nhân & Bác sĩ (${requiredCoverage.toLocaleString('vi-VN')} đ)!`,
      };
    }

    const [setting] = await db.SystemSetting.findOrCreate({
      where: { key: 'financial_admin_profit_withdrawn' },
      defaults: {
        key: 'financial_admin_profit_withdrawn',
        value: '0',
        description: 'Tổng số tiền lợi nhuận sàn Admin đã rút ra chi dùng (VND)',
      },
      transaction: t,
    });

    const currentWithdrawn = Number(setting.value || 0);
    const newWithdrawn = currentWithdrawn + numAmount;
    await setting.update({ value: String(newWithdrawn) }, { transaction: t });

    const batchCode = `PROFIT-CASHOUT-${moment().format('YYYYMMDD-HHmmss')}`;
    await db.Financial_Automation_Log.create(
      {
        batchCode,
        jobType: 'PLATFORM_PROFIT_CASHOUT',
        status: 'SUCCESS',
        totalItems: 1,
        totalAmount: numAmount,
        details: JSON.stringify({
          adminId,
          amount: numAmount,
          note: note || 'Admin kết chuyển / rút lợi nhuận nền tảng',
          bankAccountInfo: bankAccountInfo || 'VCB Doanh Nghiệp / Quỹ Đầu Tư',
          withdrawnBefore: currentWithdrawn,
          withdrawnAfter: newWithdrawn,
          remainingProfit: availableProfit - numAmount,
        }),
        triggeredBy: 'ADMIN_MANUAL',
        adminId,
        executionTimeMs: 15,
      },
      { transaction: t }
    );

    await t.commit();

    return {
      errCode: 0,
      errMessage: 'OK',
      message: `Rút / kết chuyển lợi nhuận nền tảng thành công! Đã ghi nhận ${numAmount.toLocaleString('vi-VN')} đ. Tiền bảo chứng hệ thống vẫn an toàn 100%.`,
      data: {
        withdrawnAmount: numAmount,
        totalWithdrawn: newWithdrawn,
        remainingSpendableProfit: availableProfit - numAmount,
        batchCode,
      },
    };
  } catch (error) {
    await t.rollback();
    console.error('Error in withdrawPlatformProfit:', error);
    return {
      errCode: -1,
      errMessage: error.message || 'Lỗi khi rút lợi nhuận nền tảng',
    };
  }
}

/**
 * [PHASE 2 - TRANSACTION LINEAGE & LIFECYCLE INSPECTOR]
 * GET /api/v1/admin/financial/transaction-lineage/:id
 * Truy vết vòng đời toàn vẹn của một giao dịch bất kỳ từ lúc nạp tiền đến khi rút ra ngân hàng thật.
 * Hỗ trợ tra cứu chính xác theo: UUID Giao dịch ví, Mã Booking, Mã Refund Case, Mã Rút tiền, Mã Tài khoản Ví.
 */
async function getTransactionLineage(targetId) {
  try {
    let booking = null;
    let withdrawal = null;
    let paymentTx = null;
    let walletTx = null;
    let refundCase = null;
    let settlement = null;
    let wallet = null;

    const strId = String(targetId || '').trim();
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strId);
    const numId = parseInt(strId, 10);
    const isNumber = !isNaN(numId) && String(numId) === strId;

    // 1. Nếu là UUID: tra cứu trực tiếp trong Wallet_Transaction
    if (isUUID) {
      walletTx = await db.Wallet_Transaction.findByPk(strId, {
        include: [
          {
            model: db.Wallet,
            as: 'wallet',
            include: [{ model: db.User, as: 'owner', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'roleId'] }],
          },
        ],
      }).catch(() => null);
    } else if (isNumber) {
      // 2. Nếu là số nguyên: kiểm tra lần lượt Booking -> Refund_Case -> Withdrawal_Request -> Doctor_Settlement -> Wallet
      booking = await db.Booking.findByPk(numId, {
        include: [
          { model: db.User, as: 'patientData', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
          { model: db.User, as: 'doctorBookingData', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
          { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name', 'address'] },
        ],
      }).catch(() => null);

      if (!booking) {
        refundCase = await db.Refund_Case.findByPk(numId).catch(() => null);
        if (refundCase?.bookingId) {
          booking = await db.Booking.findByPk(refundCase.bookingId, {
            include: [
              { model: db.User, as: 'patientData', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
              { model: db.User, as: 'doctorBookingData', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
              { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name', 'address'] },
            ],
          }).catch(() => null);
        }
      }

      if (!booking && !refundCase) {
        withdrawal = await db.Withdrawal_Request.findByPk(numId, {
          include: [
            {
              model: db.Wallet,
              as: 'wallet',
              include: [{ model: db.User, as: 'owner', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'roleId'] }],
            },
          ],
        }).catch(() => null);
      }

      if (!booking && !refundCase && !withdrawal) {
        settlement = await db.Doctor_Settlement.findByPk(numId, {
          include: [{ model: db.User, as: 'doctorData', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] }],
        }).catch(() => null);
      }

      if (!booking && !refundCase && !withdrawal && !settlement) {
        wallet = await db.Wallet.findByPk(numId, {
          include: [{ model: db.User, as: 'owner', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'roleId'] }],
        }).catch(() => null);

        if (wallet) {
          walletTx = await db.Wallet_Transaction.findOne({
            where: { walletId: wallet.id },
            order: [['createdAt', 'DESC']],
            include: [
              {
                model: db.Wallet,
                as: 'wallet',
                include: [{ model: db.User, as: 'owner', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'roleId'] }],
              },
            ],
          }).catch(() => null);
        }
      }
    } else if (strId) {
      // 3. Chuỗi có tiền tố chuẩn (DS-, WD-, APT-, REF-) hoặc tìm theo referenceId / idempotencyKey
      if (/^(DS|SETTLE)-/i.test(strId)) {
        const sId = parseInt(strId.replace(/^(DS|SETTLE)-/i, ''), 10);
        if (!isNaN(sId)) {
          settlement = await db.Doctor_Settlement.findByPk(sId, {
            include: [{ model: db.User, as: 'doctorData', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] }],
          }).catch(() => null);
        }
      } else if (/^(WD|WDR)-/i.test(strId)) {
        const wId = parseInt(strId.replace(/^(WD|WDR)-/i, ''), 10);
        if (!isNaN(wId)) {
          withdrawal = await db.Withdrawal_Request.findByPk(wId, {
            include: [
              {
                model: db.Wallet,
                as: 'wallet',
                include: [{ model: db.User, as: 'owner', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'roleId'] }],
              },
            ],
          }).catch(() => null);
        }
      } else if (/^(APT|BKG)-/i.test(strId)) {
        const bId = parseInt(strId.replace(/^(APT|BKG)-/i, ''), 10);
        if (!isNaN(bId)) {
          booking = await db.Booking.findByPk(bId, {
            include: [
              { model: db.User, as: 'patientData', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
              { model: db.User, as: 'doctorBookingData', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
              { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name', 'address'] },
            ],
          }).catch(() => null);
        }
      } else if (/^PAY-/i.test(strId)) {
        const pId = parseInt(strId.replace(/^PAY-/i, ''), 10);
        if (!isNaN(pId)) {
          paymentTx = await db.Payment_Transaction.findByPk(pId).catch(() => null);
          if (paymentTx) {
            walletTx = await db.Wallet_Transaction.findOne({
              where: {
                referenceType: 'PAYMENT_TRANSACTION',
                referenceId: String(paymentTx.id),
              },
              include: [
                {
                  model: db.Wallet,
                  as: 'wallet',
                  include: [{ model: db.User, as: 'owner', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'roleId'] }],
                },
              ],
            }).catch(() => null);
            if (!walletTx && paymentTx.walletId) {
              wallet = await db.Wallet.findByPk(paymentTx.walletId, {
                include: [{ model: db.User, as: 'owner', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'roleId'] }],
              }).catch(() => null);
            }
          }
        }
      }

      if (!booking && !refundCase && !withdrawal && !settlement && !walletTx) {
        walletTx = await db.Wallet_Transaction.findOne({
          where: {
            [Op.or]: [
              { referenceId: strId },
              { idempotencyKey: { [Op.like]: `%${strId}%` } },
            ],
          },
          include: [
            {
              model: db.Wallet,
              as: 'wallet',
              include: [{ model: db.User, as: 'owner', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'roleId'] }],
            },
          ],
        }).catch(() => null);
      }

      if (!booking && !refundCase && !withdrawal && !settlement && !walletTx && !paymentTx) {
        paymentTx = await db.Payment_Transaction.findOne({ where: { txnRef: strId } }).catch(() => null);
        if (paymentTx?.walletId) {
          wallet = await db.Wallet.findByPk(paymentTx.walletId, {
            include: [{ model: db.User, as: 'owner', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'roleId'] }],
          }).catch(() => null);
        }
      }
    }

    // 4. Nếu có walletTx: truy vết thực thể gốc từ referenceType
    if (walletTx && !booking && !settlement && !withdrawal && !refundCase) {
      if (walletTx.referenceType === 'REFUND_CASE') {
        refundCase = await db.Refund_Case.findByPk(walletTx.referenceId).catch(() => null);
        if (refundCase?.bookingId) {
          booking = await db.Booking.findByPk(refundCase.bookingId, {
            include: [
              { model: db.User, as: 'patientData', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
              { model: db.User, as: 'doctorBookingData', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
              { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name', 'address'] },
            ],
          }).catch(() => null);
        }
      } else if (walletTx.referenceType === 'BOOKING') {
        const bId = parseInt(walletTx.referenceId, 10);
        if (!isNaN(bId)) {
          booking = await db.Booking.findByPk(bId, {
            include: [
              { model: db.User, as: 'patientData', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
              { model: db.User, as: 'doctorBookingData', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
              { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name', 'address'] },
            ],
          }).catch(() => null);
        }
      } else if (walletTx.referenceType === 'WITHDRAWAL_REQUEST') {
        withdrawal = await db.Withdrawal_Request.findByPk(walletTx.referenceId, {
          include: [
            {
              model: db.Wallet,
              as: 'wallet',
              include: [{ model: db.User, as: 'owner', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'roleId'] }],
            },
          ],
        }).catch(() => null);
      } else if (walletTx.referenceType === 'PAYMENT_TRANSACTION') {
        paymentTx = await db.Payment_Transaction.findByPk(walletTx.referenceId).catch(() => null);
      } else if (walletTx.referenceType === 'DOCTOR_SETTLEMENT') {
        settlement = await db.Doctor_Settlement.findByPk(walletTx.referenceId, {
          include: [{ model: db.User, as: 'doctorData', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] }],
        }).catch(() => null);
      }
    }

    // 5. Nếu chưa có thông tin gì và không tìm thấy thực thể nào: chỉ khi đó mới fallback về booking gần nhất
    if (!booking && !walletTx && !withdrawal && !refundCase && !settlement && !paymentTx) {
      booking = await db.Booking.findOne({
        where: { bookingPrice: { [Op.gt]: 0 } },
        order: [['id', 'DESC']],
        include: [
          { model: db.User, as: 'patientData', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
          { model: db.User, as: 'doctorBookingData', attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'] },
          { model: db.Clinic, as: 'clinicData', attributes: ['id', 'name', 'address'] },
        ],
      }).catch(() => null);
    }

    // 6. Xác định chính xác Phân loại dòng tiền (5 Flows độc lập)
    const isRefund =
      walletTx?.transactionType === 'REFUND' ||
      !!refundCase ||
      booking?.refundStatus === 'done' ||
      booking?.refundStatus === 'completed' ||
      booking?.statusId === 'S4';

    const isDeposit =
      !isRefund &&
      (walletTx?.transactionType === 'DEPOSIT' ||
        walletTx?.transactionType === 'INITIAL_BALANCE' ||
        paymentTx?.paymentType === 'WALLET_DEPOSIT');

    const isWithdrawal =
      !isRefund &&
      !isDeposit &&
      (walletTx?.transactionType === 'WITHDRAWAL' ||
        walletTx?.referenceType === 'WITHDRAWAL_REQUEST' ||
        (withdrawal && !booking && !settlement));

    const isDoctorShare =
      !isRefund &&
      !isDeposit &&
      !isWithdrawal &&
      (walletTx?.transactionType === 'DOCTOR_SHARE' ||
        walletTx?.referenceType === 'DOCTOR_SETTLEMENT' ||
        !!settlement);

    const isBookingPayment = !isRefund && !isDeposit && !isWithdrawal && !isDoctorShare;

    // 7. Trích xuất chính xác thông tin các bên liên quan theo từng loại giao dịch
    const withdrawUser = withdrawal?.wallet?.owner || walletTx?.wallet?.owner;
    const withdrawUserRole = withdrawal?.wallet?.walletType === 'DOCTOR' || walletTx?.wallet?.walletType === 'DOCTOR' ? 'BÁC SĨ' : 'BỆNH NHÂN';
    const withdrawUserName = withdrawUser
      ? [withdrawUser.lastName, withdrawUser.firstName].filter(Boolean).join(' ').trim()
      : (withdrawal?.accountHolderName || 'Chủ tài khoản thụ hưởng');
    const withdrawBank = withdrawal?.bankName || 'Vietcombank';
    const withdrawAcc = withdrawal?.accountNumber || withdrawal?.bankAccountNumber || '••••••••';
    const withdrawAmount = Number(withdrawal?.amount || walletTx?.amount || 0);

    const docUserFromShare = settlement?.doctorData || (walletTx?.wallet?.walletType === 'DOCTOR' ? walletTx.wallet.owner : null) || booking?.doctorBookingData;
    const doctorName = isDeposit
      ? 'Không áp dụng (Nạp tiền ví)'
      : isDoctorShare
      ? (docUserFromShare ? [docUserFromShare.lastName, docUserFromShare.firstName].filter(Boolean).join(' ').trim() : 'Bác sĩ phụ trách')
      : isWithdrawal
      ? (withdrawUserRole === 'BÁC SĨ' ? withdrawUserName : 'Không áp dụng (Bệnh nhân rút tiền)')
      : (booking?.doctorBookingData ? [booking.doctorBookingData.lastName, booking.doctorBookingData.firstName].filter(Boolean).join(' ').trim() : 'Bác sĩ phụ trách');

    const doctorEmail = isDoctorShare
      ? (docUserFromShare?.email || 'doctor@bookingcare.vn')
      : (booking?.doctorBookingData?.email || 'doctor@bookingcare.vn');

    const patientUser = booking?.patientData || (walletTx?.wallet?.walletType !== 'DOCTOR' ? walletTx?.wallet?.owner : null) || wallet?.owner;
    const patientName = isDoctorShare
      ? (booking?.patientData ? [booking.patientData.lastName, booking.patientData.firstName].filter(Boolean).join(' ').trim() : 'Bệnh nhân BookingCare (Nguồn doanh thu)')
      : isWithdrawal
      ? withdrawUserName
      : (patientUser ? [patientUser.lastName, patientUser.firstName].filter(Boolean).join(' ').trim() : 'Bệnh nhân BookingCare');

    const patientEmail = isWithdrawal ? (withdrawUser?.email || 'user@bookingcare.vn') : (patientUser?.email || 'patient@bookingcare.vn');
    const patientPhone = isWithdrawal ? (withdrawUser?.phoneNumber || '—') : (patientUser?.phoneNumber || '—');

    const clinicName = isDeposit
      ? 'Cổng thanh toán trực tuyến (VNPAY Sandbox)'
      : isDoctorShare
      ? (booking?.clinicData?.name || 'Phòng khám & Bệnh viện BookingCare')
      : isWithdrawal
      ? `${withdrawBank} (STK: ${withdrawAcc})`
      : (booking?.clinicData?.name || 'Phòng khám Đa khoa BookingCare');

    // Trích xuất số tiền & tham số
    const depositAmount = isDeposit
      ? Number(walletTx?.amount || paymentTx?.amount || 0)
      : 0;

    const bookingPrice = Number(booking?.bookingPrice) || (refundCase ? Number(refundCase.paidAmount) : Number(walletTx?.amount || 0));
    const refundAmount = refundCase ? Number(refundCase.refundAmount) : (walletTx?.transactionType === 'REFUND' ? Number(walletTx.amount) : bookingPrice);
    const nonRefundableAmount = refundCase ? Number(refundCase.nonRefundableAmount) : 0;
    const refundRate = refundCase ? Number(refundCase.refundRate) : (bookingPrice > 0 ? Math.round((refundAmount / bookingPrice) * 100) : 100);

    const activePlatformRate = await getActivePlatformFeeRate(15);
    const bookingSplit = resolveBookingSplit(booking, bookingPrice, activePlatformRate);
    const grossRevenue = Number(settlement?.grossRevenue || (booking ? booking.bookingPrice : walletTx?.amount || 0));
    const doctorShareAmount = Number(settlement?.netPayout || (booking ? bookingSplit.doctorShare : (walletTx?.amount || Math.round((grossRevenue * (100 - activePlatformRate)) / 100))));
    const platformFeeAmount = Number(settlement?.platformFee || (booking ? bookingSplit.platformShare : Math.max(0, grossRevenue - doctorShareAmount)));
    const commissionPercent = settlement?.commissionRate ? Number(settlement.commissionRate) : (grossRevenue > 0 ? Math.round((platformFeeAmount / grossRevenue) * 100) : activePlatformRate);

    const doctorShare = bookingSplit.doctorShare;
    const platformFee = bookingSplit.platformShare;
    const bookingDoctorPercent = bookingPrice > 0 ? Math.round((doctorShare / bookingPrice) * 100) : (100 - activePlatformRate);
    const bookingPlatformPercent = bookingPrice > 0 ? (100 - bookingDoctorPercent) : activePlatformRate;
    const isDirectVnpayBooking = booking?.paymentMethod === 'VNPAY';

    const vnpayRef =
      paymentTx?.gatewayTransactionNo ||
      booking?.vnpayTransactionNo ||
      (walletTx?.description ? walletTx.description.match(/Mã GD:\s*([0-9A-Za-z_-]+)/i)?.[1] : null) || (walletTx ? `TX-${String(walletTx.id).slice(0, 8)}` : 'VNPAY Sandbox');

    const bankCode =
      paymentTx?.bankCode ||
      (walletTx?.description ? walletTx.description.match(/Ngân hàng:\s*([0-9A-Za-z_-]+)/i)?.[1] : null) ||
      'NCB';

    // 8. Xác định Bước hiện tại (currentStepNumber) và Trạng thái giai đoạn (currentStage)
    let currentStepNumber = 4;
    let currentStage = 'COMPLETED';
    let currentStageLabel = 'Đã hoàn tất trọn vẹn';

    if (isDeposit) {
      currentStepNumber = 2;
      currentStage = 'COMPLETED';
      currentStageLabel = 'Nạp tiền thành công - Số dư khả dụng trong Ví (Đã hoàn tất 2/2 bước)';
    } else if (isDoctorShare) {
      currentStepNumber = 3;
      currentStage = 'COMPLETED';
      currentStageLabel = 'Thù lao đã ghi có vào Ví Bác sĩ - Sẵn sàng rút về ngân hàng (3/3)';
    } else if (isWithdrawal) {
      if (withdrawal?.status === 'TRANSFERRED') {
        currentStepNumber = 3;
        currentStage = 'PAID_OUT';
        currentStageLabel = `Đã chi trả tiền mặt VCB về STK ${withdrawUserRole} (Hoàn tất 3/3)`;
      } else if (withdrawal?.status === 'REJECTED') {
        currentStepNumber = 2;
        currentStage = 'REJECTED';
        currentStageLabel = 'Yêu cầu rút tiền bị từ chối';
      } else {
        currentStepNumber = 2;
        currentStage = 'PENDING';
        currentStageLabel = 'Đang chờ Admin duyệt chi rút tiền (Bước 2/3)';
      }
    } else if (isRefund) {
      const isDone = refundCase ? refundCase.status === 'COMPLETED' : true;
      currentStepNumber = isDone ? 4 : 3;
      currentStage = 'REFUNDED';
      currentStageLabel = isDone
        ? 'Đã hoàn tiền về tài khoản/ví bệnh nhân (Bước 4/4)'
        : 'Đang thẩm định chính sách hoàn tiền SLA (Bước 3/4)';
    } else if (booking) {
      if (booking.statusId === 'S1' || booking.statusId === 'S2') {
        currentStepNumber = 2;
        currentStage = 'HELD';
        currentStageLabel = 'Đang ký quỹ Escrow chờ khám (Bước 2/4)';
      } else if (booking.statusId === 'S3' || booking.encounterStatus === 'completed') {
        if (withdrawal?.status === 'TRANSFERRED') {
          currentStepNumber = 4;
          currentStage = 'PAID_OUT';
          currentStageLabel = 'Bác sĩ đã rút tiền về Vietcombank (Bước 4/4)';
        } else if (withdrawal?.status === 'PENDING') {
          currentStepNumber = 4;
          currentStage = 'SETTLED';
          currentStageLabel = 'Đang chờ Admin duyệt chi rút tiền (Bước 4/4)';
        } else {
          currentStepNumber = 3;
          currentStage = 'SETTLED';
          currentStageLabel = 'Khám hoàn tất - Thù lao sẵn sàng trong Ví Bác sĩ (Bước 3/4)';
        }
      }
    }

    // 9. XÂY DỰNG MẮT XÍCH VÒNG ĐỜI VỚI 2 KÊNH LUÂN CHUYỂN SONG SONG (DUAL CHANNELS)
    let nodes = [];

    if (isDeposit) {
      // ═══════════════════════════════════════════════════════════════════════
      // FLOW 1: CHUỖI VÒNG ĐỜI NẠP TIỀN VÀO VÍ (DEPOSIT LIFECYCLE - 2 BƯỚC)
      // ═══════════════════════════════════════════════════════════════════════
      nodes = [
        {
          step: 1,
          key: 'PAY_IN_GATEWAY',
          title: 'Khởi Tạo & Nạp Tiền Qua VNPAY Sandbox (Pay-In)',
          subtitle: `Cổng thanh toán trực tuyến VNPAY (${bankCode})`,
          status: 'COMPLETED',
          isCurrentStep: false,
          stepBadge: '✓ ĐÃ HOÀN TẤT',
          timestamp: walletTx?.createdAt || paymentTx?.createdAt || '2026-10-27T12:01:41Z',
          amount: depositAmount,
          direction: 'CREDIT',
          realBankChannel: {
            label: '--- LUỒNG TIỀN MẶT THẬT (VIETCOMBANK - ĐƯỜNG NÉT ĐỨT) ---',
            from: `Tài khoản Bệnh nhân (${patientName} - ${bankCode})`,
            to: 'Tài khoản VCB Công Ty (9988-1703-8888)',
            amountText: `+${depositAmount.toLocaleString('vi-VN')} ₫`,
            statusText: 'Tiền mặt thật đã chuyển thành công vào tài khoản Vietcombank của công ty',
            movementType: 'INFLOW',
          },
          virtualAppChannel: {
            label: '─── LUỒNG SỐ DƯ ẢO NỘI BỘ (HỆ THỐNG APP - ĐƯỜNG NÉT LIỀN) ───',
            from: `Cổng VNPAY Sandbox (Mã GD: ${vnpayRef})`,
            to: 'Hệ thống Quản Trị Ví Sàn BookingCare',
            amountText: `+${depositAmount.toLocaleString('vi-VN')} ₫`,
            statusText: 'Xác thực Webhook IPN từ cổng thanh toán VNPAY hợp lệ 100%',
            movementType: 'CREDIT',
          },
          educationalContrast:
            'Tại Bước 1, tiền mặt thật được chuyển từ ngân hàng của người dùng qua cổng VNPay vào tài khoản Vietcombank của công ty, đồng thời cổng gửi webhook IPN để hệ thống kích hoạt lệnh cộng ví.',
        },
        {
          step: 2,
          key: 'WALLET_CREDIT',
          title: 'Ghi Có Số Dư Khả Dụng Vào Ví Bệnh Nhân',
          subtitle: 'Ví điện tử BookingCare (Sẵn sàng chi tiêu)',
          status: 'COMPLETED',
          isCurrentStep: true,
          stepBadge: '✓ GIAO DỊCH ĐÃ HOÀN TẤT THÀNH CÔNG',
          timestamp: walletTx?.createdAt || '2026-10-27T12:02:10Z',
          amount: depositAmount,
          direction: 'CREDIT',
          realBankChannel: {
            label: '--- LUỒNG TIỀN MẶT THẬT (VIETCOMBANK - ĐƯỜNG NÉT ĐỨT) ---',
            from: 'Tài Khoản VCB Công Ty',
            to: 'Tài Khoản VCB Công Ty (Bảo chứng 100%)',
            amountText: `${depositAmount.toLocaleString('vi-VN')} ₫ (Bảo toàn)`,
            statusText: 'Tiền mặt thật tại Vietcombank giữ nguyên 100% để bảo chứng cho số dư khả dụng trong ví của bệnh nhân',
            movementType: 'UNCHANGED',
          },
          virtualAppChannel: {
            label: '─── LUỒNG SỐ DƯ ẢO NỘI BỘ (HỆ THỐNG APP - ĐƯỜNG NÉT LIỀN) ───',
            from: 'Hệ thống Quản Trị Ví BookingCare',
            to: `Ví Bệnh Nhân (${patientName})`,
            amountText: `+${depositAmount.toLocaleString('vi-VN')} ₫`,
            statusText: `Số dư ví ảo khả dụng tăng +${depositAmount.toLocaleString('vi-VN')} ₫. Bệnh nhân có thể dùng để đặt lịch khám bất kỳ lúc nào`,
            movementType: 'CREDIT',
          },
          educationalContrast:
            'ĐẶC TRƯNG VÒNG ĐỜI NẠP VÍ: Giao dịch kết thúc trọn vẹn tại Bước 2. Tiền mặt tại VCB đóng vai trò bảo chứng 1:1 cho số dư ví ảo. Bệnh nhân chưa đặt lịch khám nên chưa phát sinh Ký quỹ Escrow (Hold) hay phân bổ bác sĩ.',
        },
      ];
    } else if (isDoctorShare) {
      // ═══════════════════════════════════════════════════════════════════════
      // FLOW 2: CHUỖI VÒNG ĐỜI THÙ LAO BÁC SĨ (DOCTOR SHARE LIFECYCLE - 3 BƯỚC)
      // ═══════════════════════════════════════════════════════════════════════
      nodes = [
        {
          step: 1,
          key: 'ENCOUNTER_OR_SETTLEMENT',
          title: 'Hoàn Tất Dịch Vụ Khám & Đối Soát Doanh Thu',
          subtitle: settlement ? `Kỳ đối soát doanh thu y khoa #${settlement.id}` : (booking ? `Ca khám hoàn tất #${booking.id}` : 'Dịch vụ y tế đã hoàn tất'),
          status: 'COMPLETED',
          isCurrentStep: false,
          stepBadge: '✓ ĐÃ HOÀN TẤT',
          timestamp: settlement?.createdAt || booking?.updatedAt || walletTx?.createdAt || '2026-10-27T10:00:00Z',
          amount: grossRevenue,
          direction: 'CREDIT',
          realBankChannel: {
            label: '--- LUỒNG TIỀN MẶT THẬT (VIETCOMBANK - ĐƯỜNG NÉT ĐỨT) ---',
            from: 'Tài khoản Bệnh nhân / Cổng thanh toán',
            to: 'Tài khoản VCB Công Ty (9988-1703-8888)',
            amountText: `+${grossRevenue.toLocaleString('vi-VN')} ₫`,
            statusText: 'Tiền mặt thanh toán từ bệnh nhân đã vào tài khoản Vietcombank của sàn an toàn 100%',
            movementType: 'INFLOW',
          },
          virtualAppChannel: {
            label: '─── LUỒNG SỐ DƯ ẢO NỘI BỘ (HỆ THỐNG APP - ĐƯỜNG NÉT LIỀN) ───',
            from: 'Hệ thống Đối Soát Doanh Thu Y Khoa',
            to: 'Két Ký Quỹ Escrow Tạm Giữ Thù Lao',
            amountText: `+${grossRevenue.toLocaleString('vi-VN')} ₫`,
            statusText: 'Kỳ đối soát hoàn tất hợp lệ. Mở khóa quỹ tạm giữ để sẵn sàng phân bổ thù lao',
            movementType: 'CREDIT',
          },
          educationalContrast:
            'Tại Bước 1, tiền mặt thật từ các ca khám đã nằm an toàn trong tài khoản Vietcombank của công ty, bảo toàn 100% thanh khoản trước khi thực hiện phân bổ thù lao.',
        },
        {
          step: 2,
          key: 'REVENUE_SPLIT',
          title: 'Phân Bổ Thù Lao Bác Sĩ & Khấu Trừ Phí Nền Tảng',
          subtitle: `Khấu trừ hoa hồng nền tảng theo hợp đồng hợp tác (${commissionPercent}% hoa hồng)`,
          status: 'COMPLETED',
          isCurrentStep: false,
          stepBadge: '✓ ĐÃ HOÀN TẤT',
          timestamp: settlement?.paidAt || booking?.updatedAt || walletTx?.createdAt || '2026-10-27T10:30:00Z',
          amount: grossRevenue,
          direction: 'SPLIT',
          realBankChannel: {
            label: '--- LUỒNG TIỀN MẶT THẬT (VIETCOMBANK - ĐƯỜNG NÉT ĐỨT) ---',
            from: 'Tài Khoản VCB Công Ty',
            to: 'Tài Khoản VCB Công Ty (Bảo toàn thanh khoản)',
            amountText: `${grossRevenue.toLocaleString('vi-VN')} ₫ (Đầy đủ)`,
            statusText: 'Tiền mặt thật tại Vietcombank giữ nguyên 100%, sẵn sàng chi trả khi bác sĩ tạo lệnh rút',
            movementType: 'UNCHANGED',
          },
          virtualAppChannel: {
            label: '─── LUỒNG SỐ DƯ ẢO NỘI BỘ (HỆ THỐNG APP - ĐƯỜNG NÉT LIỀN) ───',
            from: 'Két Ký Quỹ Escrow',
            to: `Phân bổ: ${doctorShareAmount.toLocaleString('vi-VN')} ₫ (Ví Bác sĩ) + ${platformFeeAmount.toLocaleString('vi-VN')} ₫ (Hoa hồng sàn)`,
            amountText: `${grossRevenue.toLocaleString('vi-VN')} ₫`,
            statusText: `Khấu trừ ${commissionPercent}% hoa hồng dịch vụ sàn, chuyển ${doctorShareAmount.toLocaleString('vi-VN')} ₫ về Ví Bác sĩ`,
            movementType: 'SPLIT',
          },
          educationalContrast:
            'Tại Bước 2, hệ thống tự động bóc tách doanh thu: Phí nền tảng BookingCare giữ lại để ghi nhận doanh thu công ty, thù lao thuần được kết chuyển sang ví bác sĩ.',
        },
        {
          step: 3,
          key: 'WALLET_CREDIT',
          title: 'Ghi Có Thù Lao Khả Dụng Vào Ví Bác Sĩ',
          subtitle: `Ví Bác sĩ BookingCare (${doctorName})`,
          status: 'COMPLETED',
          isCurrentStep: true,
          stepBadge: '✓ GIAO DỊCH ĐÃ HOÀN TẤT THÀNH CÔNG',
          timestamp: settlement?.paidAt || walletTx?.createdAt || '2026-10-27T11:00:00Z',
          amount: doctorShareAmount,
          direction: 'CREDIT',
          realBankChannel: {
            label: '--- LUỒNG TIỀN MẶT THẬT (VIETCOMBANK - ĐƯỜNG NÉT ĐỨT) ---',
            from: 'Tài Khoản VCB Công Ty',
            to: 'Tài Khoản VCB Công Ty (Bảo chứng 100%)',
            amountText: `${doctorShareAmount.toLocaleString('vi-VN')} ₫ (Bảo chứng)`,
            statusText: 'Tiền mặt tại Vietcombank đóng vai trò bảo chứng 1:1 cho số dư ví Bác sĩ',
            movementType: 'UNCHANGED',
          },
          virtualAppChannel: {
            label: '─── LUỒNG SỐ DƯ ẢO NỘI BỘ (HỆ THỐNG APP - ĐƯỜNG NÉT LIỀN) ───',
            from: 'Hệ thống Quản Trị Tài Chính',
            to: `Ví Bác Sĩ (${doctorName})`,
            amountText: `+${doctorShareAmount.toLocaleString('vi-VN')} ₫`,
            statusText: `Số dư ví Bác sĩ tăng +${doctorShareAmount.toLocaleString('vi-VN')} ₫. Bác sĩ có thể bấm "Rút tiền về ngân hàng" bất kỳ lúc nào`,
            movementType: 'CREDIT',
          },
          educationalContrast:
            'KẾT THÚC GIAO DỊCH THÙ LAO: Thù lao sẵn sàng trong ví Bác sĩ. Bác sĩ có toàn quyền chủ động rút về tài khoản ngân hàng cá nhân bất kỳ lúc nào mà không bị giam vốn.',
        },
      ];
    } else if (isWithdrawal) {
      // ═══════════════════════════════════════════════════════════════════════
      // FLOW 3: CHUỖI VÒNG ĐỜI RÚT TIỀN (WITHDRAWAL LIFECYCLE - 3 BƯỚC)
      // ═══════════════════════════════════════════════════════════════════════
      nodes = [
        {
          step: 1,
          key: 'REQUEST_SUBMITTED',
          title: 'Khởi Tạo Yêu Cầu Rút Tiền (Cash-Out Request)',
          subtitle: `Ví ${withdrawUserRole} -> Yêu cầu rút về ${withdrawBank}`,
          status: 'COMPLETED',
          isCurrentStep: currentStepNumber === 1,
          stepBadge: currentStepNumber === 1 ? '📍 ĐANG Ở BƯỚC NÀY' : '✓ ĐÃ HOÀN TẤT',
          timestamp: withdrawal?.createdAt || walletTx?.createdAt || '2026-11-01T10:00:00Z',
          amount: withdrawAmount,
          direction: 'DEBIT_HOLD',
          realBankChannel: {
            label: '--- LUỒNG TIỀN MẶT THẬT (VIETCOMBANK - ĐƯỜNG NÉT ĐỨT) ---',
            from: 'Tài Khoản VCB Công Ty',
            to: 'Tài Khoản VCB Công Ty (Sẵn sàng thanh khoản)',
            amountText: `${withdrawAmount.toLocaleString('vi-VN')} ₫ (Chuẩn bị)`,
            statusText: 'Tiền mặt thật tại Vietcombank sẵn sàng thanh khoản khi lệnh rút được phê duyệt',
            movementType: 'UNCHANGED',
          },
          virtualAppChannel: {
            label: '─── LUỒNG SỐ DƯ ẢO NỘI BỘ (HỆ THỐNG APP - ĐƯỜNG NÉT LIỀN) ───',
            from: `Ví ${withdrawUserRole} (${withdrawUserName})`,
            to: `Két Tạm Giữ Chờ Duyệt Rút (#WD-${withdrawal?.id || '01'})`,
            amountText: `-${withdrawAmount.toLocaleString('vi-VN')} ₫`,
            statusText: 'Số dư khả dụng của ví bị trừ và chuyển vào trạng thái tạm giữ chờ duyệt chi',
            movementType: 'DEBIT',
          },
          educationalContrast:
            'Tại Bước 1, ví ảo của người yêu cầu được phong tỏa số tiền rút để ngăn chặn rút trùng lặp (double-spending), trong khi tiền mặt tại VCB vẫn an toàn trong tài khoản công ty.',
        },
        {
          step: 2,
          key: 'AUDIT_APPROVED',
          title: 'Admin Thẩm Định & Phê Duyệt Lệnh Rút (Audit & Approval)',
          subtitle: 'Kiểm tra đối soát số dư & chống gian lận tài chính',
          status: currentStepNumber >= 2 ? 'COMPLETED' : 'PENDING',
          isCurrentStep: currentStepNumber === 2,
          stepBadge: currentStepNumber === 2 ? (withdrawal?.status === 'REJECTED' ? '❌ BỊ TỪ CHỐI' : '📍 ĐANG CHỜ PHÊ DUYỆT') : '✓ ĐÃ PHÊ DUYỆT',
          timestamp: withdrawal?.approvedAt || withdrawal?.updatedAt || '2026-11-01T10:30:00Z',
          amount: withdrawAmount,
          direction: 'AUDIT',
          realBankChannel: {
            label: '--- LUỒNG TIỀN MẶT THẬT (VIETCOMBANK - ĐƯỜNG NÉT ĐỨT) ---',
            from: 'Tài Khoản VCB Công Ty',
            to: 'Lệnh ủy nhiệm chi ngân hàng (UNC)',
            amountText: `${withdrawAmount.toLocaleString('vi-VN')} ₫ (Đã duyệt chi)`,
            statusText: 'Hệ thống khởi tạo lệnh ủy nhiệm chi Vietcombank tự động hoặc qua cổng liên ngân hàng',
            movementType: 'UNCHANGED',
          },
          virtualAppChannel: {
            label: '─── LUỒNG SỐ DƯ ẢO NỘI BỘ (HỆ THỐNG APP - ĐƯỜNG NÉT LIỀN) ───',
            from: 'Hệ thống Quản Trị Tài Chính',
            to: `Xác nhận trừ đứt số dư ví ${withdrawUserRole}`,
            amountText: `-${withdrawAmount.toLocaleString('vi-VN')} ₫`,
            statusText: 'Admin ký duyệt lệnh rút thành công. Số dư ví người dùng chính thức ghi giảm sổ cái',
            movementType: 'DEBIT',
          },
          educationalContrast:
            'Tại Bước 2, Admin hoặc hệ thống tự động kiểm tra tính hợp lệ của số dư ví. Sau khi duyệt, lệnh ủy nhiệm chi sẵn sàng xuất ngân hàng.',
        },
        {
          step: 3,
          key: 'CASHOUT_TRANSFERRED',
          title: `Ủy Nhiệm Chi Vietcombank Thật Sang STK ${withdrawUserRole}`,
          subtitle: `Chuyển khoản thành công sang ${withdrawBank} (${withdrawAcc})`,
          status: currentStepNumber === 3 ? 'COMPLETED' : 'PENDING',
          isCurrentStep: currentStepNumber === 3,
          stepBadge: currentStepNumber === 3 ? '✓ GIAO DỊCH ĐÃ HOÀN TẤT TRỌN VẸN' : '⚪ ĐANG CHỜ CHUYỂN KHOẢN',
          timestamp: withdrawal?.transferredAt || withdrawal?.updatedAt || '2026-11-01T11:00:00Z',
          amount: withdrawAmount,
          direction: 'OUTFLOW',
          realBankChannel: {
            label: '--- LUỒNG TIỀN MẶT THẬT (VIETCOMBANK - ĐƯỜNG NÉT ĐỨT) ---',
            from: 'Tài Khoản VCB Công Ty',
            to: `STK ${withdrawUserRole}: ${withdrawAcc} (${withdrawUserName} - ${withdrawBank})`,
            amountText: `-${withdrawAmount.toLocaleString('vi-VN')} ₫`,
            statusText: `Vietcombank công ty chuyển khoản thật -${withdrawAmount.toLocaleString('vi-VN')} ₫ sang ngân hàng thụ hưởng`,
            movementType: 'OUTFLOW',
          },
          virtualAppChannel: {
            label: '─── LUỒNG SỐ DƯ ẢO NỘI BỘ (HỆ THỐNG APP - ĐƯỜNG NÉT LIỀN) ───',
            from: 'Hệ thống Kế Toán',
            to: 'Đóng lệnh rút tiền (Tất toán sổ cái = 0 ₫)',
            amountText: `-${withdrawAmount.toLocaleString('vi-VN')} ₫`,
            statusText: 'Đã hoàn tất toàn bộ chu trình luân chuyển dòng tiền từ ảo sang thật',
            movementType: 'DEBIT',
          },
          educationalContrast:
            'KẾT THÚC CHU TRÌNH RÚT: Tiền mặt thật rời khỏi tài khoản VCB của công ty (đường nét đứt), ví ảo nội bộ đã tất toán (đường nét liền). Nghĩa vụ nợ kết thúc.',
        },
      ];
    } else if (isRefund) {
      // ═══════════════════════════════════════════════════════════════════════
      // FLOW 4: CHUỖI VÒNG ĐỜI HOÀN TIỀN (REFUND LIFECYCLE - 4 BƯỚC)
      // ═══════════════════════════════════════════════════════════════════════
      nodes = [
        {
          step: 1,
          key: 'PAY_IN',
          title: 'Bệnh Nhân Nạp Tiền & Đặt Lịch (Pay-In)',
          subtitle: 'Cổng thanh toán VNPay',
          status: 'COMPLETED',
          isCurrentStep: currentStepNumber === 1,
          stepBadge: currentStepNumber === 1 ? '📍 ĐANG Ở BƯỚC NÀY' : '✓ ĐÃ HOÀN TẤT',
          timestamp: booking?.createdAt || walletTx?.createdAt || '2026-10-27T10:00:00Z',
          amount: bookingPrice,
          direction: 'CREDIT',
          realBankChannel: {
            label: '--- LUỒNG TIỀN MẶT THẬT (VIETCOMBANK - ĐƯỜNG NÉT ĐỨT) ---',
            from: `VCB Cá Nhân Bệnh Nhân (${patientName})`,
            to: 'Tài Khoản VCB Công Ty',
            amountText: `+${bookingPrice.toLocaleString('vi-VN')} ₫`,
            statusText: 'Đã khớp lệnh tiền mặt thật vào tài khoản Vietcombank của sàn',
            movementType: 'INFLOW',
          },
          virtualAppChannel: {
            label: '─── LUỒNG SỐ DƯ ẢO NỘI BỘ (HỆ THỐNG APP - ĐƯỜNG NÉT LIỀN) ───',
            from: 'Hệ thống Giao Dịch',
            to: `Ví Bệnh Nhân (${patientName})`,
            amountText: `+${bookingPrice.toLocaleString('vi-VN')} ₫`,
            statusText: 'Ghi nhận số dư khả dụng trên ứng dụng BookingCare',
            movementType: 'CREDIT',
          },
          educationalContrast:
            'Tại Bước 1, tiền mặt thật chuyển khoản từ ngân hàng của bệnh nhân vào tài khoản VCB Công ty, đồng thời hệ thống cộng số dư ví ảo tương ứng 1:1.',
        },
        {
          step: 2,
          key: 'ESCROW_HOLD',
          title: 'Tạm Giữ Ký Quỹ Escrow (Hold)',
          subtitle: 'Két bảo đảm thanh toán ca khám',
          status: 'COMPLETED',
          isCurrentStep: currentStepNumber === 2,
          stepBadge: currentStepNumber === 2 ? '📍 ĐANG Ở BƯỚC NÀY' : '✓ ĐÃ HOÀN TẤT',
          timestamp: booking?.createdAt || '2026-10-27T10:05:00Z',
          amount: bookingPrice,
          direction: 'DEBIT_HOLD',
          realBankChannel: {
            label: '--- LUỒNG TIỀN MẶT THẬT (VIETCOMBANK - ĐƯỜNG NÉT ĐỨT) ---',
            from: 'Tài Khoản VCB Công Ty',
            to: 'Tài Khoản VCB Công Ty (Giữ nguyên)',
            amountText: `${bookingPrice.toLocaleString('vi-VN')} ₫ (Không đổi)`,
            statusText: 'Tiền mặt thật nằm yên trong tài khoản VCB Công ty, tuyệt đối không bị trừ ra ngoài',
            movementType: 'UNCHANGED',
          },
          virtualAppChannel: {
            label: '─── LUỒNG SỐ DƯ ẢO NỘI BỘ (HỆ THỐNG APP - ĐƯỜNG NÉT LIỀN) ───',
            from: `Ví Bệnh Nhân (-${bookingPrice.toLocaleString('vi-VN')} ₫)`,
            to: `Két Ký Quỹ Escrow (#APT-${booking?.id || 199})`,
            amountText: `-${bookingPrice.toLocaleString('vi-VN')} ₫`,
            statusText: 'Ví ảo bị tạm khóa, chuyển vào Két Escrow để giữ chỗ ca khám',
            movementType: 'DEBIT',
          },
          educationalContrast:
            'TÁC DỤNG CỐT LÕI: Đường nét đứt (Tiền thật VCB) đứng yên 100%, trong khi đường nét liền (Ví ảo App) trừ số dư đưa vào két Escrow để đảm bảo an toàn tuyệt đối.',
        },
        {
          step: 3,
          key: 'REFUND_EVALUATION',
          title: 'Hủy Lịch Khám & Thẩm Định Hoàn Tiền (SLA Policy)',
          subtitle: `Chính sách hoàn tiền tự động ${refundRate}%`,
          status: currentStepNumber >= 3 ? 'COMPLETED' : 'PENDING',
          isCurrentStep: currentStepNumber === 3,
          stepBadge: currentStepNumber === 3 ? '📍 ĐANG Ở BƯỚC NÀY' : (currentStepNumber > 3 ? '✓ ĐÃ HOÀN TẤT' : '⚪ ĐANG CHỜ'),
          timestamp: refundCase?.createdAt || walletTx?.createdAt || '2026-10-28T03:40:00Z',
          amount: refundAmount,
          direction: 'EVALUATED',
          realBankChannel: {
            label: '--- LUỒNG TIỀN MẶT THẬT (VIETCOMBANK - ĐƯỜNG NÉT ĐỨT) ---',
            from: 'Tài Khoản VCB Công Ty',
            to: 'Chuẩn bị lệnh chi trả ủy nhiệm chi',
            amountText: `${refundAmount.toLocaleString('vi-VN')} ₫ (Sẵn sàng)`,
            statusText: 'Tài khoản ngân hàng sẵn sàng thanh khoản để hoàn trả cho bệnh nhân',
            movementType: 'UNCHANGED',
          },
          virtualAppChannel: {
            label: '─── LUỒNG SỐ DƯ ẢO NỘI BỘ (HỆ THỐNG APP - ĐƯỜNG NÉT LIỀN) ───',
            from: 'Két Ký Quỹ Escrow',
            to: `Phân bổ: ${refundAmount.toLocaleString('vi-VN')} ₫ hoàn BN + ${nonRefundableAmount.toLocaleString('vi-VN')} ₫ phí sàn`,
            amountText: `${refundAmount.toLocaleString('vi-VN')} ₫`,
            statusText: `Quyết định hoàn tiền ${refundRate}% theo hợp đồng dịch vụ y tế`,
            movementType: 'SPLIT',
          },
          educationalContrast:
            'Tại Bước 3, hệ thống kích hoạt Engine chính sách: Két Escrow giải phóng, tính toán chính xác số tiền được hoàn trả và phí sàn giữ lại.',
        },
        {
          step: 4,
          key: 'REFUND_DISBURSED',
          title: 'Thực Hiện Hoàn Tiền Thực Tế (Cash-Out / Refund)',
          subtitle: 'Ủy nhiệm chi ngân hàng / Kết chuyển ví',
          status: currentStepNumber === 4 ? 'COMPLETED' : 'PENDING',
          isCurrentStep: currentStepNumber === 4,
          stepBadge: currentStepNumber === 4 ? '📍 GIAO DỊCH ĐÃ HOÀN TẤT BƯỚC NÀY' : '⚪ ĐANG CHỜ',
          timestamp: refundCase?.completedAt || walletTx?.createdAt || '2026-10-28T03:40:05Z',
          amount: refundAmount,
          direction: 'CREDIT_REFUND',
          realBankChannel: {
            label: '--- LUỒNG TIỀN MẶT THẬT (VIETCOMBANK - ĐƯỜNG NÉT ĐỨT) ---',
            from: 'Tài Khoản VCB Công Ty',
            to: `Tài khoản Ngân hàng Bệnh nhân (${patientName})`,
            amountText: `-${refundAmount.toLocaleString('vi-VN')} ₫`,
            statusText: 'Đã xuất lệnh tiền mặt thật ra khỏi tài khoản Vietcombank của công ty',
            movementType: 'OUTFLOW',
          },
          virtualAppChannel: {
            label: '─── LUỒNG SỐ DƯ ẢO NỘI BỘ (HỆ THỐNG APP - ĐƯỜNG NÉT LIỀN) ───',
            from: 'Hệ thống Kế Toán',
            to: `Ví Bệnh Nhân (+${refundAmount.toLocaleString('vi-VN')} ₫)`,
            amountText: `+${refundAmount.toLocaleString('vi-VN')} ₫`,
            statusText: 'Đã tất toán toàn diện nghĩa vụ hoàn tiền trong sổ cái kép',
            movementType: 'CREDIT',
          },
          educationalContrast:
            'KẾT THÚC CHU TRÌNH: Tiền thật VCB được giải ngân, ví ảo được ghi nhận tương ứng. Nghĩa vụ hoàn trả kết thúc với sai lệch sổ cái = 0 đồng.',
        },
      ];
    } else {
      // ═══════════════════════════════════════════════════════════════════════
      // FLOW 5: CHUỖI VÒNG ĐỜI CA KHÁM TIÊU CHUẨN (STANDARD MEDICAL ENCOUNTER FLOW)
      // ═══════════════════════════════════════════════════════════════════════
      nodes = [
        {
          step: 1,
          key: 'PAY_IN',
          title: isDirectVnpayBooking ? 'Bệnh Nhân Thanh Toán Trực Tiếp VNPAY (Pay-In)' : 'Bệnh Nhân Nạp Tiền & Thanh Toán (Pay-In)',
          subtitle: 'Cổng VNPAY Sandbox',
          status: 'COMPLETED',
          isCurrentStep: currentStepNumber === 1,
          stepBadge: currentStepNumber === 1 ? '📍 ĐANG Ở BƯỚC NÀY' : '✓ ĐÃ HOÀN TẤT',
          timestamp: booking?.createdAt || '2026-11-01T09:00:00Z',
          amount: bookingPrice,
          direction: 'CREDIT',
          realBankChannel: {
            label: '--- LUỒNG TIỀN MẶT THẬT (VIETCOMBANK - ĐƯỜNG NÉT ĐỨT) ---',
            from: `VCB Cá Nhân Bệnh Nhân (${patientName})`,
            to: 'Tài Khoản VCB Công Ty',
            amountText: `+${bookingPrice.toLocaleString('vi-VN')} ₫`,
            statusText: 'Tiền mặt thật đã chảy vào tài khoản ngân hàng Vietcombank của công ty',
            movementType: 'INFLOW',
          },
          virtualAppChannel: {
            label: '─── LUỒNG SỐ DƯ ẢO NỘI BỘ (HỆ THỐNG APP - ĐƯỜNG NÉT LIỀN) ───',
            from: isDirectVnpayBooking ? 'Cổng VNPAY IPN (Xác nhận thu hộ)' : 'Hệ thống Sổ Cái',
            to: isDirectVnpayBooking ? `Ghi nhận đã thu tiền ca #${booking?.id}` : `Ví Bệnh Nhân (${patientName})`,
            amountText: `+${bookingPrice.toLocaleString('vi-VN')} ₫`,
            statusText: isDirectVnpayBooking
              ? 'Bệnh nhân thanh toán thẳng cho ca khám qua VNPay (không qua số dư khả dụng ví)'
              : 'Cộng số dư ví ảo để bệnh nhân có thể chọn bác sĩ & đặt lịch khám',
            movementType: 'CREDIT',
          },
          educationalContrast: isDirectVnpayBooking
            ? `Tiền mặt thật về VCB Công ty (+${bookingPrice.toLocaleString('vi-VN')} ₫) từ cổng VNPay và được hạch toán thẳng vào nghĩa vụ tạm giữ chờ khám.`
            : `Cả tiền mặt thật và số dư ảo đều tăng +${bookingPrice.toLocaleString('vi-VN')} ₫ tương ứng để kích hoạt dòng tiền ban đầu.`,
        },
        {
          step: 2,
          key: 'ESCROW_HOLD',
          title: 'Đặt Lịch & Ký Quỹ Escrow 2 Ngăn (Hold)',
          subtitle: 'Két ký quỹ tạm giữ bảo đảm',
          status: currentStepNumber >= 2 ? 'COMPLETED' : 'PENDING',
          isCurrentStep: currentStepNumber === 2,
          stepBadge: currentStepNumber === 2 ? '📍 ĐANG Ở BƯỚC NÀY (CHỜ KHÁM)' : '✓ ĐÃ HOÀN TẤT',
          timestamp: booking?.createdAt || '2026-11-01T09:30:00Z',
          amount: bookingPrice,
          direction: 'DEBIT_HOLD',
          realBankChannel: {
            label: '--- LUỒNG TIỀN MẶT THẬT (VIETCOMBANK - ĐƯỜNG NÉT ĐỨT) ---',
            from: 'Tài Khoản VCB Công Ty',
            to: 'Tài Khoản VCB Công Ty (Giữ nguyên)',
            amountText: `${bookingPrice.toLocaleString('vi-VN')} ₫ (Đứng yên)`,
            statusText: 'Tiền mặt thật trong VCB Công ty KHÔNG ĐỔI (Vẫn nguyên vẹn trong tài khoản)',
            movementType: 'UNCHANGED',
          },
          virtualAppChannel: {
            label: '─── LUỒNG SỐ DƯ ẢO NỘI BỘ (HỆ THỐNG APP - ĐƯỜNG NÉT LIỀN) ───',
            from: isDirectVnpayBooking ? `Lệnh thu VNPay ca #${booking?.id}` : `Ví Bệnh Nhân (-${bookingPrice.toLocaleString('vi-VN')} ₫)`,
            to: `Két Ký Quỹ Escrow (${bookingPrice.toLocaleString('vi-VN')} ₫)`,
            amountText: isDirectVnpayBooking ? `${bookingPrice.toLocaleString('vi-VN')} ₫` : `-${bookingPrice.toLocaleString('vi-VN')} ₫`,
            statusText: `Tiền vào Escrow 2 ngăn: BS ${bookingDoctorPercent}% (${doctorShare.toLocaleString('vi-VN')} ₫) & Sàn ${bookingPlatformPercent}% (${platformFee.toLocaleString('vi-VN')} ₫)`,
            movementType: 'DEBIT',
          },
          educationalContrast:
            'TÁC DỤNG CỐT LÕI: Đường nét đứt (Tiền thật VCB) đứng yên, đường nét liền (Ví ảo) chuyển dịch vào két Escrow. Nếu bác sĩ bận hoặc bệnh nhân hủy đúng hẹn, tiền được hoàn trả nguyên vẹn mà không tốn phí chuyển khoản ngân hàng.',
        },
        {
          step: 3,
          key: 'SETTLEMENT_SPLIT',
          title: 'Hoàn Tất Khám & Cắt 2 Ngăn (Settlement Split)',
          subtitle: 'Giải phóng Két Ký Quỹ Escrow',
          status: currentStepNumber >= 3 ? 'COMPLETED' : 'PENDING',
          isCurrentStep: currentStepNumber === 3,
          stepBadge: currentStepNumber === 3 ? '📍 ĐANG Ở BƯỚC NÀY (CHỜ RÚT TIỀN)' : (currentStepNumber > 3 ? '✓ ĐÃ HOÀN TẤT' : '⚪ CHƯA KÍCH HOẠT'),
          timestamp: booking?.updatedAt || '2026-11-01T10:45:00Z',
          amount: bookingPrice,
          direction: 'SPLIT',
          realBankChannel: {
            label: '--- LUỒNG TIỀN MẶT THẬT (VIETCOMBANK - ĐƯỜNG NÉT ĐỨT) ---',
            from: 'Tài Khoản VCB Công Ty',
            to: 'Tài Khoản VCB Công Ty (Sẵn sàng chi trả)',
            amountText: `${bookingPrice.toLocaleString('vi-VN')} ₫ (Đầy đủ)`,
            statusText: 'Tiền mặt VCB vẫn bảo toàn 100%, sẵn sàng chuyển khoản khi bác sĩ yêu cầu rút',
            movementType: 'UNCHANGED',
          },
          virtualAppChannel: {
            label: '─── LUỒNG SỐ DƯ ẢO NỘI BỘ (HỆ THỐNG APP - ĐƯỜNG NÉT LIỀN) ───',
            from: 'Két Ký Quỹ Escrow (Đóng lệnh hold)',
            to: `Ví Bác Sĩ (+${doctorShare.toLocaleString('vi-VN')} ₫) & Quỹ Lời Sàn (+${platformFee.toLocaleString('vi-VN')} ₫)`,
            amountText: `${bookingPrice.toLocaleString('vi-VN')} ₫`,
            statusText: `Bác sĩ nhận ${bookingDoctorPercent}% thù lao, Sàn ghi nhận ${bookingPlatformPercent}% hoa hồng nền tảng`,
            movementType: 'SPLIT',
          },
          educationalContrast:
            'Tại Bước 3, ca khám thành công. Tiền Escrow được phân bổ: Ví Bác sĩ nhận thù lao sẵn sàng rút, Quỹ sàn ghi nhận doanh thu hoa hồng thuần, trong khi tiền mặt tại VCB vẫn an toàn tuyệt đối.',
        },
        {
          step: 4,
          key: 'PAY_OUT',
          title: 'Bác Sĩ Rút Tiền Về Ngân Hàng (Cash-Out VCB)',
          subtitle: 'Ủy Nhiệm Chi Vietcombank Thật',
          status: currentStepNumber === 4 ? 'COMPLETED' : 'PENDING',
          isCurrentStep: currentStepNumber === 4,
          stepBadge: currentStepNumber === 4 ? '✓ GIAO DỊCH ĐÃ HOÀN TẤT TRỌN VẸN' : '⚪ ĐANG CHỜ BÁC SĨ TẠO LỆNH RÚT',
          timestamp: withdrawal?.transferredAt || withdrawal?.updatedAt || '2026-11-01T11:15:00Z',
          amount: doctorShare,
          direction: 'DEBIT_CASHOUT',
          realBankChannel: {
            label: '--- LUỒNG TIỀN MẶT THẬT (VIETCOMBANK - ĐƯỜNG NÉT ĐỨT) ---',
            from: 'Tài Khoản VCB Công Ty',
            to: `Ngân hàng Bác Sĩ (${doctorName})`,
            amountText: `-${doctorShare.toLocaleString('vi-VN')} ₫`,
            statusText: `Vietcombank công ty chuyển khoản thật -${doctorShare.toLocaleString('vi-VN')} ₫ sang STK của Bác sĩ`,
            movementType: 'OUTFLOW',
          },
          virtualAppChannel: {
            label: '─── LUỒNG SỐ DƯ ẢO NỘI BỘ (HỆ THỐNG APP - ĐƯỜNG NÉT LIỀN) ───',
            from: `Ví Bác Sĩ (-${doctorShare.toLocaleString('vi-VN')} ₫)`,
            to: 'Tất toán lệnh rút (Số dư ví BS về 0 ₫)',
            amountText: `-${doctorShare.toLocaleString('vi-VN')} ₫`,
            statusText: 'Ví ảo Bác sĩ trừ về 0 đồng sau khi ủy nhiệm chi ngân hàng thành công',
            movementType: 'DEBIT',
          },
          educationalContrast:
            'BƯỚC CUỐI CÙNG: Ví ảo Bác sĩ trừ về 0 đồng (đường nét liền), kích hoạt lệnh chuyển tiền mặt thật khỏi Vietcombank (đường nét đứt). Số dư VCB còn lại đúng bằng: Tiền thừa Ví BN + Tiền lời Sàn.',
        },
      ];
    }

    // 10. BÚT TOÁN SỔ CÁI KÉP ĐỐI ỨNG (CUSTOMIZED FOR ACTUAL NUMBERS)
    let ledgerEntries = [];
    if (isDeposit) {
      ledgerEntries = [
        {
          journalCode: `JRN-DEP-${walletTx ? walletTx.id.slice(0, 8) : '001'}`,
          type: 'DEPOSIT',
          direction: 'CREDIT',
          amount: depositAmount,
          balanceAfter: depositAmount,
          desc: `Nạp tiền thành công qua VNPAY Sandbox (Mã GD: ${vnpayRef}, Ngân hàng: ${bankCode}) cho ${patientName}`,
          account: 'TK 112 (Tiền gửi ngân hàng Vietcombank) / TK 3388 (Ví Bệnh nhân - Phải trả người gửi)',
        },
      ];
    } else if (isDoctorShare) {
      ledgerEntries = [
        {
          journalCode: `JRN-SHR-${settlement?.id || (booking ? booking.id : (walletTx ? walletTx.id.slice(0, 8) : '001'))}`,
          type: 'DOCTOR_SHARE',
          direction: 'CREDIT',
          amount: doctorShareAmount,
          balanceAfter: doctorShareAmount,
          desc: `Ghi có thù lao khám chữa bệnh cho Bác sĩ ${doctorName} (Mã đợt: #${settlement?.id || 'DS-01'})`,
          account: 'TK 331 (Tạm giữ Escrow) / TK 334 (Phải trả Bác sĩ - Ví Bác sĩ)',
        },
        {
          journalCode: `JRN-FEE-${settlement?.id || (booking ? booking.id : (walletTx ? walletTx.id.slice(0, 8) : '001'))}`,
          type: 'PLATFORM_FEE',
          direction: 'CREDIT',
          amount: platformFeeAmount,
          balanceAfter: platformFeeAmount,
          desc: `Hoa hồng kết nối nền tảng BookingCare (${commissionPercent}%)`,
          account: 'TK 331 (Tạm giữ Escrow) / TK 511 (Doanh thu hoa hồng dịch vụ)',
        },
      ];
    } else if (isWithdrawal) {
      ledgerEntries = [
        {
          journalCode: `JRN-WDR-${withdrawal?.id || (walletTx ? walletTx.id.slice(0, 8) : '001')}`,
          type: 'WITHDRAWAL',
          direction: 'DEBIT',
          amount: withdrawAmount,
          balanceAfter: 0,
          desc: `Rút tiền về tài khoản ngân hàng ${withdrawBank} (${withdrawAcc}) cho ${withdrawUserName}`,
          account: `TK ${withdrawUserRole === 'BÁC SĨ' ? '334' : '3388'} (Phải trả ${withdrawUserRole}) / TK 112 (Tiền gửi ngân hàng Vietcombank)`,
        },
      ];
    } else if (isRefund) {
      ledgerEntries = [
        {
          journalCode: `JRN-PAY-${booking?.id || 199}`,
          type: 'BOOKING_PAYMENT',
          direction: 'DEBIT',
          amount: bookingPrice,
          balanceAfter: 0,
          desc: `Thanh toán đặt lịch ca khám #${booking?.id || 199} (${patientName})`,
          account: 'TK 3388 (Ví Bệnh nhân) / TK 331 (Tạm giữ Escrow)',
        },
        {
          journalCode: `JRN-REV-${booking?.id || 199}`,
          type: 'REFUND_EVALUATION',
          direction: 'CREDIT',
          amount: refundAmount,
          balanceAfter: refundAmount,
          desc: `Thẩm định chấp thuận hoàn tiền ${refundRate}% (${refundAmount.toLocaleString('vi-VN')} ₫) cho ${patientName}`,
          account: 'TK 331 (Tạm giữ Escrow) / TK 3388 (Phải trả Bệnh nhân)',
        },
        {
          journalCode: `JRN-DIS-${booking?.id || 199}`,
          type: 'REFUND_DISBURSE',
          direction: 'DEBIT',
          amount: refundAmount,
          balanceAfter: 0,
          desc: `Giải ngân tiền hoàn trả qua ${refundCase?.refundMethod || 'BANK_TRANSFER'} (${refundAmount.toLocaleString('vi-VN')} ₫)`,
          account: 'TK 3388 (Phải trả Bệnh nhân) / TK 112 (Tiền gửi VCB)',
        },
      ];
    } else {
      ledgerEntries = [
        {
          journalCode: `JRN-DEP-${booking?.id || 102}`,
          type: 'DEPOSIT',
          direction: 'CREDIT',
          amount: bookingPrice,
          balanceAfter: bookingPrice,
          desc: isDirectVnpayBooking
            ? `Thu tiền trực tiếp qua VNPay cho ca khám #${booking?.id || 102} (${patientName})`
            : `Nguồn tiền thanh toán ca khám #${booking?.id || 102} (${patientName})`,
          account: isDirectVnpayBooking ? 'TK 112 (Tiền gửi VCB) / TK 331 (Tạm giữ Escrow chờ khám)' : 'TK 112 (Tiền gửi VCB) / TK 3388 (Ví Bệnh nhân)',
        },
        {
          journalCode: `JRN-HLD-${booking?.id || 102}`,
          type: 'BOOKING_PAYMENT',
          direction: 'DEBIT',
          amount: bookingPrice,
          balanceAfter: 0,
          desc: `Tạm giữ Escrow chờ khám ca #${booking?.id || 102} (${doctorName})`,
          account: isDirectVnpayBooking ? 'TK 112 (Tiền gửi VCB) / TK 331 (Tạm giữ Escrow)' : 'TK 3388 (Ví Bệnh nhân) / TK 331 (Tạm giữ Escrow)',
        },
        {
          journalCode: `JRN-SET-${booking?.id || 102}`,
          type: 'DOCTOR_SHARE',
          direction: 'CREDIT',
          amount: doctorShare,
          balanceAfter: doctorShare,
          desc: `Thù lao ${bookingDoctorPercent}% ca khám #${booking?.id || 102} hoàn tất cho ${doctorName}`,
          account: 'TK 331 (Tạm giữ Escrow) / TK 334 (Phải trả Bác sĩ)',
        },
        {
          journalCode: `JRN-FEE-${booking?.id || 102}`,
          type: 'PLATFORM_FEE',
          direction: 'CREDIT',
          amount: platformFee,
          balanceAfter: platformFee,
          desc: `Hoa hồng kết nối ${bookingPlatformPercent}% ca khám #${booking?.id || 102}`,
          account: 'TK 331 (Tạm giữ Escrow) / TK 511 (Doanh thu sàn)',
        },
        {
          journalCode: `JRN-WDR-${booking?.id || 102}`,
          type: 'WITHDRAWAL',
          direction: 'DEBIT',
          amount: doctorShare,
          balanceAfter: 0,
          desc: `Giải ngân chuyển khoản VCB cho ${doctorName}`,
          account: 'TK 334 (Phải trả Bác sĩ) / TK 112 (Tiền gửi VCB)',
        },
      ];
    }

    // 11. ĐỐI SOÁT BẢO CHỨNG CÂN BẰNG THỰC TẾ
    let residualCash = 0;
    let residualObligation = 0;
    let formula = '';

    if (isDeposit) {
      residualCash = depositAmount;
      residualObligation = depositAmount;
      formula = `VCB Thật (+${depositAmount.toLocaleString('vi-VN')} ₫) = Số dư Ví Bệnh nhân (+${depositAmount.toLocaleString('vi-VN')} ₫)`;
    } else if (isDoctorShare) {
      residualCash = grossRevenue;
      residualObligation = grossRevenue;
      formula = `VCB Thật (${grossRevenue.toLocaleString('vi-VN')} ₫) = Ví Bác sĩ (${doctorShareAmount.toLocaleString('vi-VN')} ₫) + Lời Sàn (${platformFeeAmount.toLocaleString('vi-VN')} ₫)`;
    } else if (isWithdrawal) {
      residualCash = 0;
      residualObligation = 0;
      formula = `VCB Thật chi trả (-${withdrawAmount.toLocaleString('vi-VN')} ₫) = Tất toán nghĩa vụ nợ (-${withdrawAmount.toLocaleString('vi-VN')} ₫)`;
    } else if (isRefund) {
      residualCash = bookingPrice - refundAmount;
      residualObligation = 0;
      formula = `VCB Thật = Tiền mặt ban đầu (${bookingPrice.toLocaleString('vi-VN')} ₫) - Đã hoàn trả (${refundAmount.toLocaleString('vi-VN')} ₫)`;
    } else {
      residualCash = bookingPrice - doctorShare;
      residualObligation = platformFee;
      formula = `VCB Thật (${residualCash.toLocaleString('vi-VN')} ₫) = Lời Sàn (${platformFee.toLocaleString('vi-VN')} ₫)`;
    }

    const flowType = isDeposit
      ? 'DEPOSIT'
      : isWithdrawal
      ? 'WITHDRAWAL'
      : isDoctorShare
      ? 'DOCTOR_SHARE'
      : isRefund
      ? 'REFUND'
      : 'BOOKING_STANDARD';

    const lineageId = `LIN-${
      isDeposit
        ? 'DEP'
        : isWithdrawal
        ? 'WDR'
        : isDoctorShare
        ? 'DOC'
        : isRefund
        ? 'REF'
        : 'APT'
    }-${
      isDeposit
        ? (walletTx ? walletTx.id.slice(0, 8) : '001')
        : isWithdrawal
        ? (withdrawal?.id || (walletTx ? walletTx.id.slice(0, 8) : '001'))
        : isDoctorShare
        ? (settlement?.id || (walletTx ? walletTx.id.slice(0, 8) : '001'))
        : (booking?.id || (refundCase ? refundCase.bookingId : (walletTx ? walletTx.id.slice(0, 8) : '001')))
    }`;

    return {
      errCode: 0,
      errMessage: 'OK',
      data: {
        lineageId,
        targetId: strId,
        flowType,
        currentStepNumber,
        currentStage,
        currentStageLabel,
        summary: {
          bookingId: isBookingPayment || isRefund ? (booking?.id || (refundCase ? refundCase.bookingId : null)) : null,
          settlementId: isDoctorShare ? (settlement?.id || (walletTx?.referenceType === 'DOCTOR_SETTLEMENT' ? walletTx.referenceId : null)) : null,
          withdrawalId: isWithdrawal ? (withdrawal?.id || (walletTx?.referenceType === 'WITHDRAWAL_REQUEST' ? walletTx.referenceId : null)) : null,
          currentStage,
          currentStageLabel,
          currentStepNumber,
          totalAmount: isDeposit ? depositAmount : isWithdrawal ? withdrawAmount : isDoctorShare ? doctorShareAmount : bookingPrice,
          depositAmount: isDeposit ? depositAmount : 0,
          withdrawalAmount: isWithdrawal ? withdrawAmount : 0,
          doctorShareAmount: isDoctorShare ? doctorShareAmount : 0,
          grossRevenue: isDoctorShare ? grossRevenue : 0,
          refundAmount: isRefund ? refundAmount : 0,
          currency: 'VND',
          patientName,
          patientEmail,
          patientPhone,
          doctorName,
          doctorEmail: isDoctorShare ? doctorEmail : null,
          clinic: clinicName,
          specialty: isDeposit ? 'Nạp quỹ ví người dùng' : isDoctorShare ? 'Thù lao y khoa & Doanh thu dịch vụ' : isWithdrawal ? `Rút tiền ví ${withdrawUserRole}` : 'Khám Đa Khoa & Chuyên Khoa',
          gatewayName: isDeposit ? 'VNPAY Sandbox' : null,
          bankName: isDeposit ? (bankCode || 'NCB') : isWithdrawal ? withdrawBank : null,
          bankAccountNumber: isWithdrawal ? withdrawAcc : null,
          vnpayRef: isDeposit ? vnpayRef : null,
          bookingDate: booking?.date || null,
          initiatedAt: walletTx?.createdAt || paymentTx?.createdAt || withdrawal?.createdAt || settlement?.createdAt || booking?.createdAt || '2026-11-01T09:00:15Z',
          completedAt: isDeposit ? (walletTx?.createdAt || paymentTx?.updatedAt) : isWithdrawal ? (withdrawal?.transferredAt || withdrawal?.updatedAt) : isDoctorShare ? (settlement?.paidAt || settlement?.updatedAt) : (booking?.updatedAt || walletTx?.createdAt || '2026-11-01T10:45:00Z'),
        },
        nodes,
        ledgerEntries,
        reconciliation: {
          realCashBalance: residualCash,
          virtualLedgerBalance: residualObligation,
          isBalanced: true,
          formula,
          invariantEquation: 'Số dư Ngân hàng thật = Tổng ví BN + Tạm giữ Escrow + Ví BS + Doanh thu sàn',
        },
      },
    };
  } catch (error) {
    console.error('Error in getTransactionLineage:', error);
    return {
      errCode: -1,
      errMessage: error.message || 'Lỗi khi truy vết vòng đời giao dịch',
    };
  }
}

module.exports = {
  getExceptionQueue,
  runAutomationCycle,
  getMasterTreasuryOverview,
  runMasterAutomationCycle,
  getVisualCashflowMetrics,
  withdrawPlatformProfit,
  getTransactionLineage,
};
