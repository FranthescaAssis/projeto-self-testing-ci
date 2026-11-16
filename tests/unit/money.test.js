const { assertValidAmount, assertValidBalance, formatCents, MAX_AMOUNT } = require('../../src/domain/money');
const { ValidationError } = require('../../src/domain/errors');

describe('assertValidAmount', () => {
  it.each([1, 1050, MAX_AMOUNT])('aceita valor inteiro positivo em centavos (%p)', (amount) => {
    expect(() => assertValidAmount(amount)).not.toThrow();
  });

  it.each([0, -1, -1050])('rejeita valor menor ou igual a zero (%p)', (amount) => {
    expect(() => assertValidAmount(amount)).toThrow(ValidationError);
    expect(() => assertValidAmount(amount)).toThrow('amount deve ser maior que zero');
  });

  it.each([10.5, '100', null, undefined, NaN, Infinity, {}])(
    'rejeita valor que não seja inteiro em centavos (%p)',
    (amount) => {
      expect(() => assertValidAmount(amount)).toThrow(ValidationError);
      expect(() => assertValidAmount(amount)).toThrow('amount deve ser um número inteiro em centavos');
    },
  );

  it('rejeita valor acima do limite por operação', () => {
    expect(() => assertValidAmount(MAX_AMOUNT + 1)).toThrow('amount excede o limite permitido');
  });

  it('usa o nome do campo informado na mensagem de erro', () => {
    expect(() => assertValidAmount(0, 'valor')).toThrow('valor deve ser maior que zero');
  });
});

describe('assertValidBalance', () => {
  it.each([0, 1, 250000])('aceita saldo inteiro maior ou igual a zero (%p)', (balance) => {
    expect(() => assertValidBalance(balance)).not.toThrow();
  });

  it('rejeita saldo negativo', () => {
    expect(() => assertValidBalance(-1)).toThrow('initialBalance não pode ser negativo');
  });

  it.each([99.9, '0', null, undefined])('rejeita saldo que não seja inteiro em centavos (%p)', (balance) => {
    expect(() => assertValidBalance(balance)).toThrow('initialBalance deve ser um número inteiro em centavos');
  });

  it('rejeita saldo acima do limite', () => {
    expect(() => assertValidBalance(MAX_AMOUNT + 1)).toThrow('initialBalance excede o limite permitido');
  });
});

describe('formatCents', () => {
  it.each([
    [0, 'R$ 0,00'],
    [5, 'R$ 0,05'],
    [1050, 'R$ 10,50'],
    [123456789, 'R$ 1.234.567,89'],
    [-2599, '-R$ 25,99'],
  ])('formata %p centavos como %p', (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });
});
