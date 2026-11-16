const { calculateTransfer, validateTransferRequest } = require('../../src/domain/transfer');
const { ValidationError, InsufficientFundsError } = require('../../src/domain/errors');

describe('calculateTransfer', () => {
  it('debita a origem e credita o destino pelo mesmo valor', () => {
    const result = calculateTransfer({ sourceBalance: 10000, targetBalance: 2500, amount: 3000 });

    expect(result).toEqual({ sourceBalance: 7000, targetBalance: 5500 });
  });

  it('permite transferir exatamente todo o saldo da origem', () => {
    const result = calculateTransfer({ sourceBalance: 3000, targetBalance: 0, amount: 3000 });

    expect(result).toEqual({ sourceBalance: 0, targetBalance: 3000 });
  });

  it('preserva a soma dos saldos das duas contas', () => {
    const before = { sourceBalance: 98765, targetBalance: 4321 };

    const after = calculateTransfer({ ...before, amount: 12345 });

    expect(after.sourceBalance + after.targetBalance).toBe(before.sourceBalance + before.targetBalance);
  });

  it('recusa a transferência quando o saldo é insuficiente', () => {
    const attempt = () => calculateTransfer({ sourceBalance: 2999, targetBalance: 0, amount: 3000 });

    expect(attempt).toThrow(InsufficientFundsError);
    expect(attempt).toThrow('Saldo insuficiente: disponível R$ 29,99, solicitado R$ 30,00');
  });

  it('informa o código de erro INSUFFICIENT_FUNDS', () => {
    expect.assertions(1);
    try {
      calculateTransfer({ sourceBalance: 0, targetBalance: 0, amount: 1 });
    } catch (error) {
      expect(error.code).toBe('INSUFFICIENT_FUNDS');
    }
  });

  it.each([0, -100, 10.5])('recusa valor de transferência inválido (%p)', (amount) => {
    expect(() => calculateTransfer({ sourceBalance: 5000, targetBalance: 0, amount })).toThrow(ValidationError);
  });
});

describe('validateTransferRequest', () => {
  const valid = { sourceAccountId: 'conta-a', targetAccountId: 'conta-b', amount: 1500 };

  it('aceita uma requisição válida', () => {
    expect(() => validateTransferRequest(valid)).not.toThrow();
  });

  it.each([undefined, null, '', '   ', 123])('exige a conta de origem (%p)', (sourceAccountId) => {
    expect(() => validateTransferRequest({ ...valid, sourceAccountId })).toThrow('sourceAccountId é obrigatório');
  });

  it.each([undefined, null, '', 456])('exige a conta de destino (%p)', (targetAccountId) => {
    expect(() => validateTransferRequest({ ...valid, targetAccountId })).toThrow('targetAccountId é obrigatório');
  });

  it('recusa transferência para a própria conta', () => {
    const attempt = () => validateTransferRequest({ ...valid, targetAccountId: 'conta-a' });

    expect(attempt).toThrow(ValidationError);
    expect(attempt).toThrow('Conta de origem e conta de destino devem ser diferentes');
  });

  it('valida o valor da transferência', () => {
    expect(() => validateTransferRequest({ ...valid, amount: 0 })).toThrow('amount deve ser maior que zero');
  });
});
