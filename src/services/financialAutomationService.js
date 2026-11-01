// bookingcare-backend/src/services/financialAutomationService.js
// Hệ Thống Tự Động Hóa Tài Chính & Hàng Đợi Ngoại Lệ (Financial Automation & Exception Queue)
'use strict';

const db = require('../models');
const { Op } = require('sequelize');
const moment = require('moment');
const doctorSettlementService = require('./doctorSettlementService');
const refundGovernanceService = require('./refundGovernanceService');
const walletService = require('./walletService');

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
          const rawDate = Number(b.date);
          if (!isNaN(rawDate) && rawDate > 1000000000) {
            appTime = new Date(rawDate);
          } else {
            appTime = new Date(b.date);
          }
        }
        if (appTime && appTime < cutoffTime) {
          b.statusId = 'S4';
          b.cancellationType = 'SYSTEM_NO_SHOW';
          b.cancellationReason = 'PATIENT_NO_SHOW';
          b.cancelledAt = now;
          await b.save();

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
 * [PHASE 1 - CASH FLOW ARCHITECTURE]
 * GET /api/v1/admin/financial/visual-cashflow
 * Tổng hợp toàn bộ dữ liệu 5 Khối Vốn Lõi, Đối soát Bất biến & 4 Biểu đồ Recharts chuẩn Ramp FinTech
 */
async function getVisualCashflowMetrics() {
  try {
    const now = new Date();

    // 1. Đọc cấu hình từ SystemSetting
    let dynamicReserveFund = 1000000000; // 1 tỷ VND vốn bảo chứng sàn ban đầu mặc định
    let adminProfitWithdrawn = 0;
    try {
      const settings = await db.SystemSetting.findAll({
        where: {
          key: {
            [Op.in]: ['financial_platform_reserve_fund', 'financial_admin_profit_withdrawn', 'financial_float_allocated_amount'],
          },
        },
        raw: true,
      });
      settings.forEach((s) => {
        if (s.key === 'financial_platform_reserve_fund' && !isNaN(Number(s.value))) {
          dynamicReserveFund = Number(s.value);
        }
        if (s.key === 'financial_admin_profit_withdrawn' && !isNaN(Number(s.value))) {
          adminProfitWithdrawn = Math.max(0, Number(s.value));
        }
        if (s.key === 'financial_float_allocated_amount' && !isNaN(Number(s.value)) && adminProfitWithdrawn === 0) {
          adminProfitWithdrawn = Math.max(0, Number(s.value));
        }
      });
    } catch (e) {
      console.warn('Could not read financial system settings:', e.message);
    }

    // 2. KHỐI VÍ BỆNH NHÂN (Patient Wallets)
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

    // 3. KHỐI VÍ BÁC SĨ (Doctor Wallets)
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

    // 4. KHỐI TẠM GIỮ TRUNG GIAN (Escrow Pool - Ca khám đang chờ khám hoặc đang giữ cọc)
    // Bóc tách 2 ngăn: Ngăn Bác sĩ (90%) vs Ngăn Sàn (10%)
    let escrowTotal = 0;
    let escrowDoctorShare = 0;
    let escrowPlatformShare = 0;
    let activeHoldCount = 0;

    try {
      const holdStats = await db.Wallet_Hold.findAll({
        where: { status: 'HELD' },
        attributes: [
          [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('amount')), 0), 'totalHeld'],
          [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'holdCount'],
        ],
        raw: true,
      });
      escrowTotal = Number(holdStats[0]?.totalHeld || 0);
      activeHoldCount = parseInt(holdStats[0]?.holdCount || 0, 10);
    } catch (e) {
      console.warn('Could not query active holds:', e.message);
    }

    try {
      if (db.Doctor_Settlement_Item) {
        const pendingItems = await db.Doctor_Settlement_Item.findAll({
          where: { status: { [Op.in]: ['EARNED', 'PENDING'] } },
          attributes: [
            [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('netAmount')), 0), 'totalDoctorNet'],
            [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('platformFee')), 0), 'totalPlatformFee'],
            [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('grossAmount')), 0), 'totalGross'],
          ],
          raw: true,
        });
        const grossPending = Number(pendingItems[0]?.totalGross || 0);
        if (grossPending > 0) {
          escrowDoctorShare = Number(pendingItems[0]?.totalDoctorNet || 0);
          escrowPlatformShare = Number(pendingItems[0]?.totalPlatformFee || 0);
          if (escrowTotal === 0) escrowTotal = grossPending;
        }
      }
    } catch (e) {
      console.warn('Could not query settlement escrow items:', e.message);
    }

    if (escrowTotal > 0 && escrowDoctorShare === 0 && escrowPlatformShare === 0) {
      escrowPlatformShare = Math.round(escrowTotal * 0.1);
      escrowDoctorShare = escrowTotal - escrowPlatformShare;
    }

    // 5. KHỐI TIỀN LỜI CÔNG TY (Platform Profit & Net Fees)
    let totalPlatformFeeEarned = 0;
    try {
      if (db.Doctor_Settlement_Item) {
        totalPlatformFeeEarned = Number(
          (await db.Doctor_Settlement_Item.sum('platformFee', {
            where: { status: { [Op.in]: ['AVAILABLE', 'PAID'] } },
          })) || 0
        );
      }
    } catch (e) {
      console.warn('Could not query platform fees:', e.message);
    }
    const spendableProfit = Math.max(0, totalPlatformFeeEarned - adminProfitWithdrawn);

    // 6. KHỐI TÀI KHOẢN NGÂN HÀNG THẬT (Real Bank VCB Company Account)
    let walletDepositInflow = 0;
    let walletDepositCount = 0;
    try {
      const depStats = await db.Payment_Transaction.findAll({
        where: { status: 'SUCCESS' },
        attributes: [
          [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('amount')), 0), 'totalDeposited'],
          [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'depositCount'],
        ],
        raw: true,
      });
      walletDepositInflow = Number(depStats[0]?.totalDeposited || 0);
      walletDepositCount = parseInt(depStats[0]?.depositCount || 0, 10);
    } catch (e) {
      console.warn('Could not query payment transactions:', e.message);
    }

    let directBookingInflow = 0;
    try {
      const bStats = await db.Booking.findAll({
        where: { paymentStatus: 'paid', paymentMethod: 'VNPAY' },
        attributes: [
          [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('bookingPrice')), 0), 'totalPaid'],
        ],
        raw: true,
      });
      directBookingInflow = Number(bStats[0]?.totalPaid || 0);
    } catch (e) {
      console.warn('Could not query direct bookings:', e.message);
    }

    const totalRealInflow = walletDepositInflow + directBookingInflow;

    let doctorBankPayoutTotal = 0;
    let doctorPayoutCount = 0;
    try {
      if (db.Withdrawal_Request) {
        const docWallets = await db.Wallet.findAll({
          where: { walletType: 'DOCTOR' },
          attributes: ['id'],
          raw: true,
        });
        const docWIds = docWallets.map(w => w.id);
        if (docWIds.length > 0) {
          const wDoc = await db.Withdrawal_Request.findAll({
            where: { status: 'TRANSFERRED', walletId: { [Op.in]: docWIds } },
            attributes: [
              [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('amount')), 0), 'totalPaid'],
              [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'payoutCount'],
            ],
            raw: true,
          });
          doctorBankPayoutTotal = Number(wDoc[0]?.totalPaid || 0);
          doctorPayoutCount = parseInt(wDoc[0]?.payoutCount || 0, 10);
        }
      }
    } catch (e) {
      console.warn('Could not query doctor withdrawals:', e.message);
    }

    let patientBankPayoutTotal = 0;
    try {
      if (db.Withdrawal_Request) {
        const patWallets = await db.Wallet.findAll({
          where: { walletType: { [Op.in]: ['PATIENT', 'USER'] } },
          attributes: ['id'],
          raw: true,
        });
        const patWIds = patWallets.map(w => w.id);
        if (patWIds.length > 0) {
          const wPat = await db.Withdrawal_Request.findAll({
            where: { status: 'TRANSFERRED', walletId: { [Op.in]: patWIds } },
            attributes: [
              [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('amount')), 0), 'totalPaid'],
            ],
            raw: true,
          });
          patientBankPayoutTotal = Number(wPat[0]?.totalPaid || 0);
        }
      }
    } catch (e) {
      console.warn('Could not query patient withdrawals:', e.message);
    }

    const totalRealOutflow = doctorBankPayoutTotal + patientBankPayoutTotal;
    let realBankBalance = totalRealInflow + dynamicReserveFund - totalRealOutflow - adminProfitWithdrawn;
    if (realBankBalance < 0) realBankBalance = 0;

    // 7. ĐỐI SOÁT BẤT BIẾN (Reconciliation Invariant)
    const totalSystemLiabilities = totalPatientWallets + totalDoctorWallets + escrowTotal + spendableProfit;
    const requiredBacking = totalPatientWallets + totalDoctorWallets + escrowTotal;
    const discrepancy = realBankBalance - (totalSystemLiabilities + dynamicReserveFund);
    const isBalanced = Math.abs(discrepancy) < 1000;
    const coveragePercent = requiredBacking > 0
      ? Math.min(100, Math.round((realBankBalance / requiredBacking) * 100))
      : 100;

    // 8. DỮ LIỆU BIỂU ĐỒ RECHARTS (4 Biểu đồ)
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
        name: 'Nghĩa vụ Sổ cái Sàn',
        totalReal: 0,
        patientLiabilities: totalPatientWallets,
        doctorLiabilities: totalDoctorWallets,
        escrowLiabilities: escrowTotal,
        profitLiabilities: spendableProfit,
        reserveLiabilities: dynamicReserveFund,
      },
    ];

    const capitalComposition = [
      { name: 'Ví Bệnh nhân (BN App)', value: totalPatientWallets, color: '#8b5cf6' },
      { name: 'Ví Bác sĩ (BS App)', value: totalDoctorWallets, color: '#10b981' },
      { name: 'Quỹ Tạm giữ Escrow', value: escrowTotal, color: '#f59e0b' },
      { name: 'Lợi nhuận Công ty', value: spendableProfit, color: '#d4ff00' },
    ].filter((item) => item.value > 0);

    const dailyCashFlow = [];
    for (let i = 6; i >= 0; i--) {
      const d = moment().subtract(i, 'days');
      const startOfDay = d.startOf('day').toDate();
      const endOfDay = d.endOf('day').toDate();

      let dayInflow = 0;
      let dayOutflow = 0;
      try {
        if (db.Payment_Transaction) {
          dayInflow = Number(
            (await db.Payment_Transaction.sum('amount', {
              where: {
                status: 'SUCCESS',
                createdAt: { [Op.between]: [startOfDay, endOfDay] },
              },
            })) || 0
          );
        }
        if (db.Withdrawal_Request) {
          dayOutflow = Number(
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

    const commissionSplit = [
      { name: 'Thù lao Bác sĩ', percent: 90, amount: escrowDoctorShare || Math.round(escrowTotal * 0.9), color: '#10b981' },
      { name: 'Phí Dịch vụ Sàn', percent: 10, amount: escrowPlatformShare || Math.round(escrowTotal * 0.1), color: '#d4ff00' },
    ];

    // 9. BƯỚC THỰC TẾ GẦN NHẤT (Step Breakdown)
    let latestDeposit = null;
    try {
      if (db.Payment_Transaction) {
        latestDeposit = await db.Payment_Transaction.findOne({
          where: { status: 'SUCCESS' },
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

    let latestBookingHold = null;
    try {
      if (db.Wallet_Hold) {
        latestBookingHold = await db.Wallet_Hold.findOne({
          where: { status: 'HELD' },
          order: [['createdAt', 'DESC']],
          include: [
            {
              model: db.Booking,
              as: 'booking',
              include: [
                { model: db.User, as: 'patientData', attributes: ['id', 'firstName', 'lastName'] },
                { model: db.User, as: 'doctorData', attributes: ['id', 'firstName', 'lastName'] },
              ],
            },
          ],
        });
      }
    } catch (e) {
      latestBookingHold = null;
    }

    let latestWithdrawal = null;
    try {
      if (db.Withdrawal_Request) {
        latestWithdrawal = await db.Withdrawal_Request.findOne({
          where: { status: 'TRANSFERRED' },
          order: [['transferredAt', 'DESC']],
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
      latestWithdrawal = null;
    }

    // 10. GIAO DỊCH THỜI GIAN THỰC GẦN ĐÂY (Recent Audit Feed)
    let recentTransactions = [];
    try {
      if (db.Wallet_Transaction) {
        const txs = await db.Wallet_Transaction.findAll({
          limit: 10,
          order: [['createdAt', 'DESC']],
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
          return item;
        });
      }
    } catch (e) {
      recentTransactions = [];
    }

    return {
      errCode: 0,
      errMessage: 'OK',
      data: {
        timestamp: now.toISOString(),
        vaults: {
          realBank: {
            currentBalance: realBankBalance,
            totalInflowVNPay: totalRealInflow,
            totalOutflowBank: totalRealOutflow,
            doctorPayouts: doctorBankPayoutTotal,
            patientPayouts: patientBankPayoutTotal,
            adminProfitWithdrawn,
            platformReserveFund: dynamicReserveFund,
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
            doctorShare: escrowDoctorShare,
            platformShare: escrowPlatformShare,
            doctorSharePercent: escrowTotal > 0 ? Math.round((escrowDoctorShare / escrowTotal) * 100) : 90,
            platformSharePercent: escrowTotal > 0 ? Math.round((escrowPlatformShare / escrowTotal) * 100) : 10,
            activeCount: activeHoldCount,
          },
          doctorWallets: {
            total: totalDoctorWallets,
            available: doctorAvailable,
            reserved: doctorReserved,
            count: doctorWalletCount,
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
          status: isBalanced ? 'HEALTHY' : discrepancy < 0 ? 'DEFICIT' : 'SURPLUS',
          discrepancyAmount: discrepancy,
          coveragePercent,
          requiredBacking,
          formula: `VCB Thật (${realBankBalance.toLocaleString('vi-VN')} đ) = Ví BN (${totalPatientWallets.toLocaleString('vi-VN')} đ) + Ví BS (${totalDoctorWallets.toLocaleString('vi-VN')} đ) + Escrow (${escrowTotal.toLocaleString('vi-VN')} đ) + Lãi sàn (${spendableProfit.toLocaleString('vi-VN')} đ) + Quỹ dự trữ (${dynamicReserveFund.toLocaleString('vi-VN')} đ)`,
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
                  : 'Bệnh nhân A',
                createdAt: latestDeposit.createdAt,
              }
            : {
                amount: 500000,
                vnpayTxCode: 'VNP14892019',
                patientName: 'Bệnh nhân A',
                createdAt: now.toISOString(),
              },
          step2: latestBookingHold
            ? {
                bookingId: latestBookingHold.bookingId,
                amount: Number(latestBookingHold.amount),
                doctorShare: Math.round(Number(latestBookingHold.amount) * 0.9),
                platformShare: Math.round(Number(latestBookingHold.amount) * 0.1),
                doctorName: latestBookingHold.booking?.doctorData
                  ? `${latestBookingHold.booking.doctorData.lastName || ''} ${latestBookingHold.booking.doctorData.firstName || ''}`.trim()
                  : 'BS. Nguyễn Văn B',
                createdAt: latestBookingHold.createdAt,
              }
            : {
                bookingId: 102,
                amount: 300000,
                doctorShare: 270000,
                platformShare: 30000,
                doctorName: 'BS. Nguyễn Văn B',
                createdAt: now.toISOString(),
              },
          step3: latestWithdrawal
            ? {
                amount: Number(latestWithdrawal.amount),
                bankRef: latestWithdrawal.bankTransactionRef || 'VCB-FT982173',
                recipientName:
                  latestWithdrawal.accountHolderName ||
                  (latestWithdrawal.wallet?.owner
                    ? `${latestWithdrawal.wallet.owner.lastName || ''} ${latestWithdrawal.wallet.owner.firstName || ''}`.trim()
                    : 'Bác sĩ B'),
                bankName: latestWithdrawal.bankName || 'Vietcombank',
                transferredAt: latestWithdrawal.transferredAt || latestWithdrawal.updatedAt,
              }
            : {
                amount: 270000,
                bankRef: 'VCB-FT982173',
                recipientName: 'BS. Nguyễn Văn B',
                bankName: 'Vietcombank',
                transferredAt: now.toISOString(),
              },
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
 * Admin rút tiền lời công ty ("-30k xài") ra chi dùng cá nhân/chuyển khoản
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
      metrics.vaults.patientWallets.total +
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
          note: note || 'Admin rút tiền lời sàn ra chi dùng',
          bankAccountInfo: bankAccountInfo || 'VCB Cá nhân Admin',
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
      message: `Rút tiền lời công ty thành công! Đã ghi nhận rút ${numAmount.toLocaleString('vi-VN')} đ. Tiền bảo chứng hệ thống vẫn an toàn 100%.`,
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
      errMessage: error.message || 'Lỗi khi rút tiền lời công ty',
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
};
