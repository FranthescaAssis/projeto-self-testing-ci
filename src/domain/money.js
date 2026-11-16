const { ValidationError } = require('./errors');

// Limite por operação: R$ 100.000.000,00, expresso em centavos.
const MAX_AMOUNT = 10_000_000_000;

function assertValidAmount(amount, field = 'amount') {
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) {
    throw new ValidationError(`${field} deve ser um número inteiro em centavos`);
  }
  if (amount <= 0) {
    throw new ValidationError(`${field} deve ser maior que zero`);
  }
  if (amount > MAX_AMOUNT) {
    throw new ValidationError(`${field} excede o limite permitido`);
  }
}

function assertValidBalance(balance, field = 'initialBalance') {
  if (typeof balance !== 'number' || !Number.isSafeInteger(balance)) {
    throw new ValidationError(`${field} deve ser um número inteiro em centavos`);
  }
  if (balance < 0) {
    throw new ValidationError(`${field} não pode ser negativo`);
  }
  if (balance > MAX_AMOUNT) {
    throw new ValidationError(`${field} excede o limite permitido`);
  }
}

function formatCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const reais = String(Math.trunc(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centavos = String(absolute % 100).padStart(2, '0');
  return `${sign}R$ ${reais},${centavos}`;
}

module.exports = { MAX_AMOUNT, assertValidAmount, assertValidBalance, formatCents };
