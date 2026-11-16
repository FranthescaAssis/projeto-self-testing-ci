const { normalizeCpf, isValidCpf } = require('../../src/domain/cpf');

describe('normalizeCpf', () => {
  it('remove pontuação e mantém apenas os dígitos', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
  });

  it('mantém um CPF que já está somente com dígitos', () => {
    expect(normalizeCpf('11144477735')).toBe('11144477735');
  });

  it.each([undefined, null, 52998224725, {}])('devolve vazio quando o valor não é texto (%p)', (value) => {
    expect(normalizeCpf(value)).toBe('');
  });
});

describe('isValidCpf', () => {
  it.each(['529.982.247-25', '52998224725', '111.444.777-35'])(
    'aceita CPF com dígitos verificadores corretos (%s)',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(true);
    },
  );

  it.each(['529.982.247-24', '529.982.247-35', '111.444.777-05'])(
    'rejeita CPF com dígito verificador incorreto (%s)',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(false);
    },
  );

  it.each(['', '123', '5299822472', '529982247255'])('rejeita CPF com quantidade de dígitos errada (%p)', (cpf) => {
    expect(isValidCpf(cpf)).toBe(false);
  });

  it.each(['000.000.000-00', '111.111.111-11', '99999999999'])(
    'rejeita CPF com todos os dígitos iguais (%s)',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(false);
    },
  );

  it('rejeita valor que não é texto', () => {
    expect(isValidCpf(undefined)).toBe(false);
  });
});
