const crypto = require('node:crypto');
const { ValidationError } = require('./errors');

const MAX_KEY_LENGTH = 128;

function assertValidIdempotencyKey(key) {
  if (typeof key !== 'string' || key.trim() === '') {
    throw new ValidationError('O cabeçalho Idempotency-Key é obrigatório');
  }
  if (key.length > MAX_KEY_LENGTH) {
    throw new ValidationError(`Idempotency-Key deve ter no máximo ${MAX_KEY_LENGTH} caracteres`);
  }
}

/**
 * Impressão digital dos dados da transferência. Permite detectar o reuso de
 * uma chave de idempotência com um conteúdo diferente do original.
 */
function fingerprintTransfer({ sourceAccountId, targetAccountId, amount }) {
  const canonical = JSON.stringify([sourceAccountId, targetAccountId, amount]);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

module.exports = { assertValidIdempotencyKey, fingerprintTransfer };
