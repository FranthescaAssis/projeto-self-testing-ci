function normalizeCpf(document) {
  if (typeof document !== 'string') {
    return '';
  }
  return document.replace(/\D/g, '');
}

// Dígito verificador do CPF: soma ponderada com pesos decrescentes até 2, módulo 11.
function calculateCheckDigit(digits) {
  const firstWeight = digits.length + 1;
  const sum = digits.reduce((total, digit, index) => total + digit * (firstWeight - index), 0);
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

function isValidCpf(document) {
  const cpf = normalizeCpf(document);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  const digits = [...cpf].map(Number);
  const firstCheckDigit = calculateCheckDigit(digits.slice(0, 9));
  const secondCheckDigit = calculateCheckDigit(digits.slice(0, 10));
  return firstCheckDigit === digits[9] && secondCheckDigit === digits[10];
}

module.exports = { normalizeCpf, isValidCpf };
