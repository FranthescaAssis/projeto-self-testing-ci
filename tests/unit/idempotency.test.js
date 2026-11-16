const { assertValidIdempotencyKey, fingerprintTransfer } = require('../../src/domain/idempotency');
const { ValidationError } = require('../../src/domain/errors');

describe('assertValidIdempotencyKey', () => {
  it.each(['a', 'pedido-123', 'a'.repeat(128)])('aceita chave com 1 a 128 caracteres (%p)', (key) => {
    expect(() => assertValidIdempotencyKey(key)).not.toThrow();
  });

  it.each([undefined, null, '', '   ', 42])('exige a chave de idempotência (%p)', (key) => {
    const attempt = () => assertValidIdempotencyKey(key);

    expect(attempt).toThrow(ValidationError);
    expect(attempt).toThrow('O cabeçalho Idempotency-Key é obrigatório');
  });

  it('rejeita chave com mais de 128 caracteres', () => {
    expect(() => assertValidIdempotencyKey('a'.repeat(129))).toThrow(
      'Idempotency-Key deve ter no máximo 128 caracteres',
    );
  });
});

describe('fingerprintTransfer', () => {
  const request = { sourceAccountId: 'conta-a', targetAccountId: 'conta-b', amount: 1500 };

  it('gera a mesma impressão digital para requisições idênticas', () => {
    expect(fingerprintTransfer(request)).toBe(fingerprintTransfer({ ...request }));
  });

  it('gera um hash SHA-256 em hexadecimal', () => {
    expect(fingerprintTransfer(request)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['valor', { amount: 1501 }],
    ['conta de origem', { sourceAccountId: 'conta-c' }],
    ['conta de destino', { targetAccountId: 'conta-c' }],
  ])('gera impressão digital diferente quando muda %s', (_campo, change) => {
    expect(fingerprintTransfer({ ...request, ...change })).not.toBe(fingerprintTransfer(request));
  });

  it('diferencia origem e destino invertidos', () => {
    const inverted = { sourceAccountId: 'conta-b', targetAccountId: 'conta-a', amount: 1500 };

    expect(fingerprintTransfer(inverted)).not.toBe(fingerprintTransfer(request));
  });
});
