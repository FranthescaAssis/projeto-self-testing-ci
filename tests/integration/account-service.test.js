const { createDatabase, createTransactionRunner } = require('../../src/repositories/database');
const { AccountRepository } = require('../../src/repositories/account-repository');
const { TransactionRepository } = require('../../src/repositories/transaction-repository');
const { AccountService } = require('../../src/services/account-service');
const {
  ValidationError,
  AccountNotFoundError,
  DocumentRejectedError,
  DocumentAlreadyRegisteredError,
} = require('../../src/domain/errors');
const { createRegistryValidatorStub, createFixedClock } = require('../support/test-doubles');

const VALID_CPF = '529.982.247-25';

describe('AccountService (SQLite em memória + stub de validação cadastral)', () => {
  let db;
  let accountRepository;
  let transactionRepository;

  function buildService(registryValidator = createRegistryValidatorStub('REGULAR')) {
    return new AccountService({
      accountRepository,
      transactionRepository,
      registryValidator,
      runInTransaction: createTransactionRunner(db),
      clock: createFixedClock('2026-11-10T12:00:00.000Z'),
    });
  }

  beforeEach(() => {
    db = createDatabase(':memory:');
    accountRepository = new AccountRepository(db);
    transactionRepository = new TransactionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('createAccount', () => {
    it('cria a conta com saldo inicial e a persiste no banco', async () => {
      const service = buildService();

      const account = await service.createAccount({
        ownerName: 'Ana Souza',
        document: VALID_CPF,
        initialBalance: 150000,
      });

      expect(account).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        ownerName: 'Ana Souza',
        document: '52998224725',
        balance: 150000,
        createdAt: '2026-11-10T12:00:00.000Z',
      });
      expect(accountRepository.findById(account.id)).toEqual(account);
    });

    it('registra o saldo inicial como lançamento de crédito no extrato', async () => {
      const service = buildService();

      const account = await service.createAccount({ ownerName: 'Ana Souza', document: VALID_CPF, initialBalance: 5000 });

      const entries = transactionRepository.listByAccount(account.id);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        accountId: account.id,
        type: 'CREDIT',
        amount: 5000,
        balanceAfter: 5000,
        description: 'Saldo inicial',
        transferId: null,
      });
    });

    it('cria conta com saldo zero sem gerar lançamento', async () => {
      const service = buildService();

      const account = await service.createAccount({ ownerName: 'Ana Souza', document: VALID_CPF });

      expect(account.balance).toBe(0);
      expect(transactionRepository.listByAccount(account.id)).toEqual([]);
    });

    it('remove espaços excedentes do nome do titular', async () => {
      const account = await buildService().createAccount({ ownerName: '  Ana Souza  ', document: VALID_CPF });

      expect(account.ownerName).toBe('Ana Souza');
    });

    it('recusa a abertura quando o stub informa situação cadastral irregular', async () => {
      const service = buildService(createRegistryValidatorStub('IRREGULAR'));

      await expect(
        service.createAccount({ ownerName: 'Ana Souza', document: VALID_CPF, initialBalance: 1000 }),
      ).rejects.toThrow(DocumentRejectedError);

      expect(accountRepository.findByDocument('52998224725')).toBeNull();
    });

    it('recusa uma segunda conta para o mesmo CPF', async () => {
      const service = buildService();
      await service.createAccount({ ownerName: 'Ana Souza', document: VALID_CPF });

      await expect(service.createAccount({ ownerName: 'Ana S.', document: '52998224725' })).rejects.toThrow(
        DocumentAlreadyRegisteredError,
      );
    });

    it.each([
      ['nome ausente', { ownerName: undefined, document: VALID_CPF }, 'ownerName deve ter entre 3 e 120 caracteres'],
      ['nome curto', { ownerName: 'An', document: VALID_CPF }, 'ownerName deve ter entre 3 e 120 caracteres'],
      ['CPF inválido', { ownerName: 'Ana Souza', document: '529.982.247-24' }, 'document deve ser um CPF válido'],
      ['CPF ausente', { ownerName: 'Ana Souza' }, 'document deve ser um CPF válido'],
      [
        'saldo negativo',
        { ownerName: 'Ana Souza', document: VALID_CPF, initialBalance: -1 },
        'initialBalance não pode ser negativo',
      ],
      [
        'saldo com casas decimais',
        { ownerName: 'Ana Souza', document: VALID_CPF, initialBalance: 10.5 },
        'initialBalance deve ser um número inteiro em centavos',
      ],
    ])('recusa dados inválidos: %s', async (_caso, input, message) => {
      const attempt = buildService().createAccount(input);

      await expect(attempt).rejects.toThrow(ValidationError);
      await expect(attempt).rejects.toThrow(message);
    });

    it('não consulta a validação cadastral quando os dados são inválidos', async () => {
      const registryValidator = { validate: jest.fn() };

      await expect(
        buildService(registryValidator).createAccount({ ownerName: 'Ana Souza', document: '123' }),
      ).rejects.toThrow(ValidationError);

      expect(registryValidator.validate).not.toHaveBeenCalled();
    });
  });

  describe('getAccount', () => {
    it('devolve a conta existente', async () => {
      const service = buildService();
      const created = await service.createAccount({ ownerName: 'Ana Souza', document: VALID_CPF, initialBalance: 700 });

      expect(service.getAccount(created.id)).toEqual(created);
    });

    it('lança AccountNotFoundError quando a conta não existe', () => {
      const attempt = () => buildService().getAccount('conta-inexistente');

      expect(attempt).toThrow(AccountNotFoundError);
      expect(attempt).toThrow('Conta não encontrada: conta-inexistente');
    });
  });
});
