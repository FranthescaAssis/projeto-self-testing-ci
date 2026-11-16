const { parseStatementFilters } = require('../../src/domain/statement-filters');
const { ValidationError } = require('../../src/domain/errors');

describe('parseStatementFilters', () => {
  it('devolve filtros vazios quando nada é informado', () => {
    expect(parseStatementFilters({})).toEqual({ from: null, to: null, type: null });
    expect(parseStatementFilters()).toEqual({ from: null, to: null, type: null });
  });

  it('converte as datas do período para instantes em UTC', () => {
    const filters = parseStatementFilters({ from: '2026-11-01', to: '2026-11-30' });

    expect(filters.from).toBe('2026-11-01T00:00:00.000Z');
    expect(filters.to).toBe('2026-11-30T00:00:00.000Z');
  });

  it('aceita apenas a data inicial ou apenas a data final', () => {
    expect(parseStatementFilters({ from: '2026-11-10' })).toEqual({
      from: '2026-11-10T00:00:00.000Z',
      to: null,
      type: null,
    });
    expect(parseStatementFilters({ to: '2026-11-10' }).from).toBeNull();
  });

  it.each([
    ['debit', 'DEBIT'],
    ['credit', 'CREDIT'],
    ['DEBIT', 'DEBIT'],
    ['Credit', 'CREDIT'],
  ])('converte o tipo %p para %p', (type, expected) => {
    expect(parseStatementFilters({ type }).type).toBe(expected);
  });

  it.each(['pix', 'debito', '', ['debit', 'credit']])('rejeita tipo de lançamento inválido (%p)', (type) => {
    const attempt = () => parseStatementFilters({ type });

    expect(attempt).toThrow(ValidationError);
    expect(attempt).toThrow('type deve ser "debit" ou "credit"');
  });

  it.each(['01/11/2026', '2026-13-01', '2026-02-30', 'ontem', '', ['2026-11-01']])(
    'rejeita data inicial fora do formato AAAA-MM-DD (%p)',
    (from) => {
      expect(() => parseStatementFilters({ from })).toThrow('from deve ser uma data válida no formato AAAA-MM-DD');
    },
  );

  it('rejeita data final inválida', () => {
    expect(() => parseStatementFilters({ to: '2026-11-31' })).toThrow(
      'to deve ser uma data válida no formato AAAA-MM-DD',
    );
  });

  it('rejeita período em que a data inicial é posterior à final', () => {
    const attempt = () => parseStatementFilters({ from: '2026-11-20', to: '2026-11-10' });

    expect(attempt).toThrow(ValidationError);
    expect(attempt).toThrow('from não pode ser posterior a to');
  });

  it('aceita período de um único dia', () => {
    expect(() => parseStatementFilters({ from: '2026-11-10', to: '2026-11-10' })).not.toThrow();
  });
});
