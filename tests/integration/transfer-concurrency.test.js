const { setImmediate: nextTick } = require('node:timers/promises');
const { createTestContext } = require('../support/test-context');
const { InsufficientFundsError } = require('../../src/domain/errors');

describe('Transferências concorrentes (RF08)', () => {
  let context;
  let ana;
  let bruno;

  function totalBalance() {
    return context.accountRepository.findById(ana.id).balance + context.accountRepository.findById(bruno.id).balance;
  }

  beforeEach(async () => {
    context = createTestContext();
    // O anti-fraude responde de forma assíncrona, o que intercala as requisições.
    context.fraudGateway.notifyTransfer.mockImplementation(() => nextTick());
    ana = await context.openAccount('Ana Souza', 10000);
    bruno = await context.openAccount('Bruno Lima', 0);
  });

  afterEach(() => {
    context.close();
  });

  it('aceita apenas as transferências que cabem no saldo quando 20 chegam ao mesmo tempo', async () => {
    const requests = Array.from({ length: 20 }, (_, index) =>
      context.transferService.transfer({
        sourceAccountId: ana.id,
        targetAccountId: bruno.id,
        amount: 1000,
        idempotencyKey: `simultanea-${index}`,
      }),
    );

    const results = await Promise.allSettled(requests);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(10);
    expect(rejected).toHaveLength(10);
    expect(rejected.every((result) => result.reason instanceof InsufficientFundsError)).toBe(true);
  });

  it('nunca deixa o saldo negativo nem altera a soma total dos saldos', async () => {
    const requests = Array.from({ length: 50 }, (_, index) =>
      context.transferService.transfer({
        sourceAccountId: ana.id,
        targetAccountId: bruno.id,
        amount: 700,
        idempotencyKey: `carga-${index}`,
      }),
    );

    await Promise.allSettled(requests);

    const anaBalance = context.accountRepository.findById(ana.id).balance;
    expect(anaBalance).toBe(200); // 14 transferências de 700 cabem em 10000
    expect(anaBalance).toBeGreaterThanOrEqual(0);
    expect(totalBalance()).toBe(10000);
    expect(context.fraudGateway.notifyTransfer).toHaveBeenCalledTimes(14);
  });

  it('executa uma única vez quando a mesma chave chega em 20 requisições simultâneas', async () => {
    const request = {
      sourceAccountId: ana.id,
      targetAccountId: bruno.id,
      amount: 1000,
      idempotencyKey: 'mesma-chave',
    };

    const results = await Promise.all(Array.from({ length: 20 }, () => context.transferService.transfer(request)));

    const transferIds = new Set(results.map((result) => result.transfer.id));
    expect(transferIds.size).toBe(1);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(context.accountRepository.findById(ana.id).balance).toBe(9000);
    expect(context.fraudGateway.notifyTransfer).toHaveBeenCalledTimes(1);
  });

  it('conclui transferências cruzadas simultâneas sem travar', async () => {
    context.accountRepository.updateBalance(bruno.id, 10000);

    const requests = Array.from({ length: 40 }, (_, index) => {
      const fromAna = index % 2 === 0;
      return context.transferService.transfer({
        sourceAccountId: fromAna ? ana.id : bruno.id,
        targetAccountId: fromAna ? bruno.id : ana.id,
        amount: 250,
        idempotencyKey: `cruzada-${index}`,
      });
    });

    const results = await Promise.all(requests);

    expect(results).toHaveLength(40);
    expect(context.accountRepository.findById(ana.id).balance).toBe(10000);
    expect(context.accountRepository.findById(bruno.id).balance).toBe(10000);
  });
});
