const { ValidationError } = require('./errors');

// Limite por operação: R$ 100.000.000,00, expresso em centavos.
const MAX_AMOUNT = 10_000_000_000;

function assertIntegerCents(value, field) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new ValidationError(`${field} deve ser um número inteiro em centavos`);
  }
}

function assertWithinLimit(value, field) {
  if (value > MAX_AMOUNT) {
    throw new ValidationError(`${field} excede o limite permitido`);
  }
}

function assertValidAmount(amount, field = 'amount') {
  assertIntegerCents(amount, field);
  if (amount <= 0) {
    throw new ValidationError(`${field} deve ser maior que zero`);
  }
  assertWithinLimit(amount, field);
}

function assertValidBalance(balance, field = 'initialBalance') {
  assertIntegerCents(balance, field);
  if (balance < 0) {
    throw new ValidationError(`${field} não pode ser negativo`);
  }
  assertWithinLimit(balance, field);
}

function formatCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const reais = String(Math.trunc(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centavos = String(absolute % 100).padStart(2, '0');
  return `${sign}R$ ${reais},${centavos}`;
}

module.exports = { MAX_AMOUNT, assertValidAmount, assertValidBalance, formatCents };
