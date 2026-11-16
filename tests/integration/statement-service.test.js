const { createTestContext } = require('../support/test-context');
const { ValidationError, AccountNotFoundError } = require('../../src/domain/errors');

describe('StatementService (SQLite em memória)', () => {
  let context;
  let ana;
  let bruno;

  async function transferOn(isoDate, { from, to, amount }) {
    context.clock.set(isoDate);
    await context.transferService.transfer({
      sourceAccountId: from.id,
      targetAccountId: to.id,
      amount,
      idempotencyKey: `extrato-${isoDate}`,
    });
  }

  // Cenário: abertura em 01/11, envio em 05/11, recebimento em 10/11 e envio em 15/11.
  beforeEach(async () => {
    context = createTestContext();
    context.clock.set('2026-11-01T08:00:00.000Z');
    ana = await context.openAccount('Ana Souza', 10000);
    bruno = await context.openAccount('Bruno Lima', 5000);

    await transferOn('2026-11-05T14:00:00.000Z', { from: ana, to: bruno, amount: 2000 });
    await transferOn('2026-11-10T10:00:00.000Z', { from: bruno, to: ana, amount: 500 });
    await transferOn('2026-11-15T18:30:00.000Z', { from: ana, to: bruno, amount: 1500 });
  });

  afterEach(() => {
    context.close();
  });

  function summarize(statement) {
    return statement.entries.map((entry) => [entry.createdAt.slice(0, 10), entry.type, entry.amount, entry.balanceAfter]);
  }

  it('lista todos os lançamentos em ordem cronológica com o saldo após cada um', () => {
    const statement = context.statementService.getStatement(ana.id);

    expect(summarize(statement)).toEqual([
      ['2026-11-01', 'CREDIT', 10000, 10000],
      ['2026-11-05', 'DEBIT', 2000, 8000],
      ['2026-11-10', 'CREDIT', 500, 8500],
      ['2026-11-15', 'DEBIT', 1500, 7000],
    ]);
  });

  it('informa a conta, o saldo atual e os filtros aplicados', () => {
    const statement = context.statementService.getStatement(ana.id, { type: 'debit' });

    expect(statement.accountId).toBe(ana.id);
    expect(statement.balance).toBe(7000);
    expect(statement.filters).toEqual({ from: null, to: null, type: 'DEBIT' });
  });

  it('filtra apenas os débitos', () => {
    const statement = context.statementService.getStatement(ana.id, { type: 'debit' });

    expect(summarize(statement)).toEqual([
      ['2026-11-05', 'DEBIT', 2000, 8000],
      ['2026-11-15', 'DEBIT', 1500, 7000],
    ]);
  });

  it('filtra apenas os créditos', () => {
    const statement = context.statementService.getStatement(ana.id, { type: 'credit' });

    expect(summarize(statement)).toEqual([
      ['2026-11-01', 'CREDIT', 10000, 10000],
      ['2026-11-10', 'CREDIT', 500, 8500],
    ]);
  });

  it('filtra a partir da data inicial, incluindo o próprio dia', () => {
    const statement = context.statementService.getStatement(ana.id, { from: '2026-11-10' });

    expect(summarize(statement).map(([date]) => date)).toEqual(['2026-11-10', '2026-11-15']);
  });

  it('filtra até a data final', () => {
    const statement = context.statementService.getStatement(ana.id, { to: '2026-11-12' });

    expect(summarize(statement).map(([date]) => date)).toEqual(['2026-11-01', '2026-11-05', '2026-11-10']);
  });

  it('inclui os lançamentos feitos no próprio dia da data final', () => {
    const statement = context.statementService.getStatement(ana.id, { to: '2026-11-10' });

    expect(summarize(statement).map(([date]) => date)).toEqual(['2026-11-01', '2026-11-05', '2026-11-10']);
  });

  it('devolve os lançamentos de um único dia quando from e to são iguais', () => {
    const statement = context.statementService.getStatement(ana.id, { from: '2026-11-15', to: '2026-11-15' });

    expect(summarize(statement)).toEqual([['2026-11-15', 'DEBIT', 1500, 7000]]);
  });

  it('combina período e tipo de lançamento', () => {
    const statement = context.statementService.getStatement(ana.id, {
      from: '2026-11-02',
      to: '2026-11-20',
      type: 'debit',
    });

    expect(summarize(statement)).toEqual([
      ['2026-11-05', 'DEBIT', 2000, 8000],
      ['2026-11-15', 'DEBIT', 1500, 7000],
    ]);
  });

  it('devolve lista vazia quando nenhum lançamento atende aos filtros', () => {
    const statement = context.statementService.getStatement(ana.id, { from: '2026-12-01' });

    expect(statement.entries).toEqual([]);
    expect(statement.balance).toBe(7000);
  });

  it('mostra apenas os lançamentos da conta consultada', () => {
    const statement = context.statementService.getStatement(bruno.id);

    expect(statement.entries.every((entry) => entry.accountId === bruno.id)).toBe(true);
    expect(summarize(statement)).toEqual([
      ['2026-11-01', 'CREDIT', 5000, 5000],
      ['2026-11-05', 'CREDIT', 2000, 7000],
      ['2026-11-10', 'DEBIT', 500, 6500],
      ['2026-11-15', 'CREDIT', 1500, 8000],
    ]);
  });

  it('lança AccountNotFoundError para conta inexistente', () => {
    expect(() => context.statementService.getStatement('inexistente')).toThrow(AccountNotFoundError);
  });

  it.each([
    [{ type: 'pix' }, 'type deve ser "debit" ou "credit"'],
    [{ from: '10/11/2026' }, 'from deve ser uma data válida no formato AAAA-MM-DD'],
    [{ from: '2026-11-20', to: '2026-11-10' }, 'from não pode ser posterior a to'],
  ])('recusa filtros inválidos %p', (query, message) => {
    const attempt = () => context.statementService.getStatement(ana.id, query);

    expect(attempt).toThrow(ValidationError);
    expect(attempt).toThrow(message);
  });
});
