const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDatabase, createTransactionRunner } = require('../../src/repositories/database');
const { AccountRepository } = require('../../src/repositories/account-repository');

const account = {
  id: 'conta-1',
  ownerName: 'Ana Souza',
  document: '52998224725',
  balance: 1000,
  createdAt: '2026-11-10T12:00:00.000Z',
};

describe('Banco de dados SQLite', () => {
  describe('em memória', () => {
    let db;

    beforeEach(() => {
      db = createDatabase();
    });

    afterEach(() => {
      db.close();
    });

    it('isola os dados entre conexões diferentes', () => {
      new AccountRepository(db).insert(account);
      const otherDb = createDatabase(':memory:');

      expect(new AccountRepository(otherDb).findById(account.id)).toBeNull();
      otherDb.close();
    });

    it('desfaz todas as gravações quando ocorre erro dentro da transação', () => {
      const repository = new AccountRepository(db);
      const runInTransaction = createTransactionRunner(db);

      expect(() =>
        runInTransaction(() => {
          repository.insert(account);
          throw new Error('falha simulada');
        }),
      ).toThrow('falha simulada');

      expect(repository.findById(account.id)).toBeNull();
    });

    it('confirma as gravações quando a transação termina sem erro', () => {
      const repository = new AccountRepository(db);

      const result = createTransactionRunner(db)(() => {
        repository.insert(account);
        return 'ok';
      });

      expect(result).toBe('ok');
      expect(repository.findById(account.id)).toEqual(account);
    });

    it('impede saldo negativo por restrição do próprio banco (RN04)', () => {
      const repository = new AccountRepository(db);
      repository.insert(account);

      expect(() => repository.updateBalance(account.id, -1)).toThrow(/CHECK constraint failed/);
      expect(repository.findById(account.id).balance).toBe(1000);
    });

    it('impede CPF duplicado por restrição do próprio banco (RF03)', () => {
      const repository = new AccountRepository(db);
      repository.insert(account);

      expect(() => repository.insert({ ...account, id: 'conta-2' })).toThrow(/UNIQUE constraint failed/);
    });
  });

  describe('em arquivo', () => {
    let directory;

    beforeEach(() => {
      directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-db-'));
    });

    afterEach(() => {
      fs.rmSync(directory, { recursive: true, force: true });
    });

    it('cria a pasta do banco e mantém os dados entre conexões', () => {
      const filename = path.join(directory, 'data', 'wallet.db');

      const firstConnection = createDatabase(filename);
      new AccountRepository(firstConnection).insert(account);
      firstConnection.close();

      const secondConnection = createDatabase(filename);
      expect(new AccountRepository(secondConnection).findById(account.id)).toEqual(account);
      expect(secondConnection.pragma('journal_mode', { simple: true })).toBe('wal');
      secondConnection.close();
    });
  });
});
