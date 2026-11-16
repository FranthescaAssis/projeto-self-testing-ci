const { createTestContext } = require('../support/test-context');
const {
  ValidationError,
  InsufficientFundsError,
  AccountNotFoundError,
  IdempotencyConflictError,
} = require('../../src/domain/errors');

describe('TransferService (SQLite em memória + mock do anti-fraude)', () => {
  let context;
  let ana;
  let bruno;
  let keySequence;

  // Monta uma requisição válida com uma chave de idempotência nova a cada chamada.
  function transferRequest(overrides = {}) {
    keySequence += 1;
    return {
      sourceAccountId: ana.id,
      targetAccountId: bruno.id,
      amount: 3000,
      idempotencyKey: `chave-${keySequence}`,
      ...overrides,
    };
  }

  beforeEach(async () => {
    keySequence = 0;
    context = createTestContext();
    ana = await context.openAccount('Ana Souza', 10000);
    bruno = await context.openAccount('Bruno Lima', 2500);
  });

  afterEach(() => {
    context.close();
  });

  describe('transferência concluída', () => {
    it('debita a origem e credita o destino no banco de dados', async () => {
      await context.transferService.transfer(transferRequest({ amount: 3000 }));

      expect(context.accountRepository.findById(ana.id).balance).toBe(7000);
      expect(context.accountRepository.findById(bruno.id).balance).toBe(5500);
    });

    it('devolve os dados da transferência registrada', async () => {
      context.clock.set('2026-11-12T09:30:00.000Z');

      const { transfer } = await context.transferService.transfer(transferRequest({ amount: 3000 }));

      expect(transfer).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        sourceAccountId: ana.id,
        targetAccountId: bruno.id,
        amount: 3000,
        createdAt: '2026-11-12T09:30:00.000Z',
      });
      expect(context.transferRepository.findById(transfer.id)).toEqual(transfer);
    });

    it('gera um lançamento de débito na origem e um de crédito no destino', async () => {
      const { transfer } = await context.transferService.transfer(transferRequest({ amount: 3000 }));

      const [, debit] = context.transactionRepository.listByAccount(ana.id);
      const [, credit] = context.transactionRepository.listByAccount(bruno.id);

      expect(debit).toMatchObject({
        type: 'DEBIT',
        amount: 3000,
        balanceAfter: 7000,
        transferId: transfer.id,
        counterpartyAccountId: bruno.id,
        description: 'Transferência enviada',
      });
      expect(credit).toMatchObject({
        type: 'CREDIT',
        amount: 3000,
        balanceAfter: 5500,
        transferId: transfer.id,
        counterpartyAccountId: ana.id,
        description: 'Transferência recebida',
      });
    });

    it('mantém o saldo de cada conta igual à soma dos seus lançamentos (conciliação, RN06)', async () => {
      await context.transferService.transfer(transferRequest({ amount: 1234 }));
      await context.transferService.transfer(
        transferRequest({ sourceAccountId: bruno.id, targetAccountId: ana.id, amount: 99 }),
      );

      for (const account of [ana, bruno]) {
        const entries = context.transactionRepository.listByAccount(account.id);
        const ledgerBalance = entries.reduce(
          (total, entry) => total + (entry.type === 'CREDIT' ? entry.amount : -entry.amount),
          0,
        );
        expect(ledgerBalance).toBe(context.accountRepository.findById(account.id).balance);
      }
    });
  });

  describe('notificação ao anti-fraude (mock)', () => {
    it('notifica o anti-fraude exatamente uma vez por transferência concluída', async () => {
      await context.transferService.transfer(transferRequest());

      expect(context.fraudGateway.notifyTransfer).toHaveBeenCalledTimes(1);
    });

    it('envia ao anti-fraude o identificador, as contas, o valor e a data da transferência', async () => {
      context.clock.set('2026-11-12T09:30:00.000Z');

      const { transfer } = await context.transferService.transfer(transferRequest({ amount: 4500 }));

      expect(context.fraudGateway.notifyTransfer).toHaveBeenCalledWith({
        transferId: transfer.id,
        sourceAccountId: ana.id,
        targetAccountId: bruno.id,
        amount: 4500,
        occurredAt: '2026-11-12T09:30:00.000Z',
      });
    });

    it('envia uma notificação para cada transferência, na ordem em que ocorreram', async () => {
      await context.transferService.transfer(transferRequest({ amount: 100 }));
      await context.transferService.transfer(transferRequest({ amount: 200 }));

      expect(context.fraudGateway.notifyTransfer).toHaveBeenCalledTimes(2);
      expect(context.fraudGateway.notifyTransfer).toHaveBeenNthCalledWith(1, expect.objectContaining({ amount: 100 }));
      expect(context.fraudGateway.notifyTransfer).toHaveBeenNthCalledWith(2, expect.objectContaining({ amount: 200 }));
    });

    it('só notifica depois que a transferência já está gravada no banco', async () => {
      let balanceSeenByGateway;
      context.fraudGateway.notifyTransfer.mockImplementation(async () => {
        balanceSeenByGateway = context.accountRepository.findById(ana.id).balance;
      });

      await context.transferService.transfer(transferRequest({ amount: 3000 }));

      expect(balanceSeenByGateway).toBe(7000);
    });
  });

  describe('transferência recusada', () => {
    it('recusa por saldo insuficiente sem alterar saldos nem gerar lançamentos', async () => {
      await expect(context.transferService.transfer(transferRequest({ amount: 10001 }))).rejects.toThrow(
        InsufficientFundsError,
      );

      expect(context.accountRepository.findById(ana.id).balance).toBe(10000);
      expect(context.accountRepository.findById(bruno.id).balance).toBe(2500);
      expect(context.transactionRepository.listByAccount(ana.id)).toHaveLength(1);
      expect(context.transactionRepository.listByAccount(bruno.id)).toHaveLength(1);
    });

    it('não notifica o anti-fraude quando a transferência é recusada', async () => {
      await expect(context.transferService.transfer(transferRequest({ amount: 10001 }))).rejects.toThrow();

      expect(context.fraudGateway.notifyTransfer).not.toHaveBeenCalled();
    });

    it('recusa quando a conta de origem não existe', async () => {
      const attempt = context.transferService.transfer(transferRequest({ sourceAccountId: 'inexistente' }));

      await expect(attempt).rejects.toThrow(AccountNotFoundError);
      await expect(attempt).rejects.toThrow('Conta não encontrada: inexistente');
    });

    it('recusa quando a conta de destino não existe e preserva o saldo da origem', async () => {
      await expect(
        context.transferService.transfer(transferRequest({ targetAccountId: 'inexistente' })),
      ).rejects.toThrow(AccountNotFoundError);

      expect(context.accountRepository.findById(ana.id).balance).toBe(10000);
    });

    it.each([
      ['valor zero', { amount: 0 }, 'amount deve ser maior que zero'],
      ['valor com casas decimais', { amount: 10.5 }, 'amount deve ser um número inteiro em centavos'],
      ['conta de origem ausente', { sourceAccountId: undefined }, 'sourceAccountId é obrigatório'],
    ])('recusa requisição inválida: %s', async (_caso, overrides, message) => {
      const attempt = context.transferService.transfer(transferRequest(overrides));

      await expect(attempt).rejects.toThrow(ValidationError);
      await expect(attempt).rejects.toThrow(message);
    });

    it('recusa transferência para a própria conta', async () => {
      await expect(context.transferService.transfer(transferRequest({ targetAccountId: ana.id }))).rejects.toThrow(
        'Conta de origem e conta de destino devem ser diferentes',
      );
    });
  });

  describe('atomicidade (RNF02)', () => {
    it('desfaz o débito e o crédito se a gravação dos lançamentos falhar', async () => {
      jest.spyOn(context.transactionRepository, 'insert').mockImplementationOnce(() => {
        throw new Error('falha simulada de gravação');
      });

      await expect(context.transferService.transfer(transferRequest({ amount: 3000 }))).rejects.toThrow(
        'falha simulada de gravação',
      );

      expect(context.accountRepository.findById(ana.id).balance).toBe(10000);
      expect(context.accountRepository.findById(bruno.id).balance).toBe(2500);
      expect(context.fraudGateway.notifyTransfer).not.toHaveBeenCalled();
    });
  });

  describe('idempotência (RF07)', () => {
    it('informa que a primeira execução não é uma repetição', async () => {
      const result = await context.transferService.transfer(transferRequest());

      expect(result.replayed).toBe(false);
    });

    it('devolve a transferência original quando a mesma chave é reenviada', async () => {
      const request = transferRequest({ amount: 3000 });

      const first = await context.transferService.transfer(request);
      const second = await context.transferService.transfer(request);

      expect(second.replayed).toBe(true);
      expect(second.transfer).toEqual(first.transfer);
    });

    it('debita a origem uma única vez mesmo com a requisição repetida', async () => {
      const request = transferRequest({ amount: 3000 });

      await context.transferService.transfer(request);
      await context.transferService.transfer(request);
      await context.transferService.transfer(request);

      expect(context.accountRepository.findById(ana.id).balance).toBe(7000);
      expect(context.accountRepository.findById(bruno.id).balance).toBe(5500);
      expect(context.transactionRepository.listByAccount(ana.id)).toHaveLength(2);
    });

    it('não notifica o anti-fraude novamente em requisições repetidas', async () => {
      const request = transferRequest();

      await context.transferService.transfer(request);
      await context.transferService.transfer(request);

      expect(context.fraudGateway.notifyTransfer).toHaveBeenCalledTimes(1);
    });

    it('recusa o reuso da chave com dados diferentes dos originais', async () => {
      const request = transferRequest({ amount: 3000 });
      await context.transferService.transfer(request);

      const attempt = context.transferService.transfer({ ...request, amount: 3001 });

      await expect(attempt).rejects.toThrow(IdempotencyConflictError);
      await expect(attempt).rejects.toThrow('A chave de idempotência já foi usada com dados diferentes');
      expect(context.accountRepository.findById(ana.id).balance).toBe(7000);
    });

    it('trata chaves diferentes como transferências diferentes', async () => {
      const first = await context.transferService.transfer(transferRequest({ amount: 1000 }));
      const second = await context.transferService.transfer(transferRequest({ amount: 1000 }));

      expect(second.transfer.id).not.toBe(first.transfer.id);
      expect(context.accountRepository.findById(ana.id).balance).toBe(8000);
    });

    it('não registra a chave quando a transferência é recusada, permitindo nova tentativa', async () => {
      const request = transferRequest({ amount: 10001 });
      await expect(context.transferService.transfer(request)).rejects.toThrow(InsufficientFundsError);

      context.accountRepository.updateBalance(ana.id, 20000);
      const retry = await context.transferService.transfer(request);

      expect(retry.replayed).toBe(false);
      expect(context.accountRepository.findById(ana.id).balance).toBe(9999);
    });

    it.each([undefined, '', '   '])('exige a chave de idempotência (%p)', async (idempotencyKey) => {
      const attempt = context.transferService.transfer(transferRequest({ idempotencyKey }));

      await expect(attempt).rejects.toThrow(ValidationError);
      await expect(attempt).rejects.toThrow('O cabeçalho Idempotency-Key é obrigatório');
    });
  });
});
