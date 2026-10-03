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
    report.remainingExceptions = queueRes?.data?.summary?.totalCount || 0;
    report.executionTimeMs = Date.now() - t0;

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

module.exports = {
  getExceptionQueue,
  runAutomationCycle,
};
