const { ValidationError, InsufficientFundsError } = require('./errors');
const { assertValidAmount, formatCents } = require('./money');

/**
 * Calcula os saldos resultantes de uma transferência.
 * Função pura: não acessa banco de dados nem serviços externos.
 */
function calculateTransfer({ sourceBalance, targetBalance, amount }) {
  assertValidAmount(amount);

  if (sourceBalance < amount) {
    throw new InsufficientFundsError(
      `Saldo insuficiente: disponível ${formatCents(sourceBalance)}, solicitado ${formatCents(amount)}`,
    );
  }

  return {
    sourceBalance: sourceBalance - amount,
    targetBalance: targetBalance + amount,
  };
}

function validateTransferRequest({ sourceAccountId, targetAccountId, amount }) {
  if (typeof sourceAccountId !== 'string' || sourceAccountId.trim() === '') {
    throw new ValidationError('sourceAccountId é obrigatório');
  }
  if (typeof targetAccountId !== 'string' || targetAccountId.trim() === '') {
    throw new ValidationError('targetAccountId é obrigatório');
  }
  if (sourceAccountId === targetAccountId) {
    throw new ValidationError('Conta de origem e conta de destino devem ser diferentes');
  }
  assertValidAmount(amount);
}

module.exports = { calculateTransfer, validateTransferRequest };
