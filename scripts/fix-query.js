const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/services/financialAutomationService.js');
let s = fs.readFileSync(file, 'utf8');

const target = `    let doctorBankPayoutTotal = 0;
    let doctorPayoutCount = 0;
    try {
      if (db.Withdrawal_Request) {
        const wDoc = await db.Withdrawal_Request.findAll({
          where: { status: 'TRANSFERRED' },
          include: [{ model: db.Wallet, as: 'wallet', where: { walletType: 'DOCTOR' }, attributes: ['id'] }],
          attributes: [
            [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('amount')), 0), 'totalPaid'],
            [db.sequelize.fn('COUNT', db.sequelize.col('Withdrawal_Request.id')), 'payoutCount'],
          ],
          raw: true,
        });
        doctorBankPayoutTotal = Number(wDoc[0]?.totalPaid || 0);
        doctorPayoutCount = parseInt(wDoc[0]?.payoutCount || 0, 10);
      }
    } catch (e) {
      console.warn('Could not query doctor withdrawals:', e.message);
    }

    let patientBankPayoutTotal = 0;
    try {
      if (db.Withdrawal_Request) {
        const wPat = await db.Withdrawal_Request.findAll({
          where: { status: 'TRANSFERRED' },
          include: [{ model: db.Wallet, as: 'wallet', where: { walletType: { [Op.in]: ['PATIENT', 'USER'] } }, attributes: ['id'] }],
          attributes: [
            [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('amount')), 0), 'totalPaid'],
          ],
          raw: true,
        });
        patientBankPayoutTotal = Number(wPat[0]?.totalPaid || 0);
      }
    } catch (e) {
      console.warn('Could not query patient withdrawals:', e.message);
    }`;

const replacement = `    let doctorBankPayoutTotal = 0;
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
    }`;

if (s.includes(target)) {
  s = s.replace(target, replacement);
  fs.writeFileSync(file, s, 'utf8');
  console.log('Query replaced successfully!');
} else {
  // Normalize \r\n and check
  const sNorm = s.replace(/\r\n/g, '\n');
  const tNorm = target.replace(/\r\n/g, '\n');
  const rNorm = replacement.replace(/\r\n/g, '\n');
  if (sNorm.includes(tNorm)) {
    const sUpdated = sNorm.replace(tNorm, rNorm).replace(/\n/g, '\r\n');
    fs.writeFileSync(file, sUpdated, 'utf8');
    console.log('Query replaced successfully with CRLF normalization!');
  } else {
    console.error('Target not found in file!');
  }
}

