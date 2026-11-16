const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const IN_MEMORY = ':memory:';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS accounts (
    id          TEXT PRIMARY KEY,
    owner_name  TEXT NOT NULL,
    document    TEXT NOT NULL UNIQUE,
    balance     INTEGER NOT NULL CHECK (balance >= 0),
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transfers (
    id                 TEXT PRIMARY KEY,
    source_account_id  TEXT NOT NULL REFERENCES accounts (id),
    target_account_id  TEXT NOT NULL REFERENCES accounts (id),
    amount             INTEGER NOT NULL CHECK (amount > 0),
    created_at         TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    seq                      INTEGER PRIMARY KEY AUTOINCREMENT,
    id                       TEXT NOT NULL UNIQUE,
    account_id               TEXT NOT NULL REFERENCES accounts (id),
    transfer_id              TEXT REFERENCES transfers (id),
    type                     TEXT NOT NULL CHECK (type IN ('DEBIT', 'CREDIT')),
    amount                   INTEGER NOT NULL CHECK (amount > 0),
    balance_after            INTEGER NOT NULL CHECK (balance_after >= 0),
    counterparty_account_id  TEXT,
    description              TEXT NOT NULL,
    created_at               TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_account
    ON transactions (account_id, created_at);

  CREATE TABLE IF NOT EXISTS idempotency_keys (
    key          TEXT PRIMARY KEY,
    fingerprint  TEXT NOT NULL,
    transfer_id  TEXT NOT NULL REFERENCES transfers (id),
    created_at   TEXT NOT NULL
  );
`;

/**
 * Abre o banco SQLite e garante o esquema.
 * Com ":memory:" o banco existe apenas enquanto a conexão estiver aberta,
 * o que isola cada teste de integração.
 */
function createDatabase(filename = IN_MEMORY) {
  if (filename !== IN_MEMORY) {
    fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }

  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  if (filename !== IN_MEMORY) {
    db.pragma('journal_mode = WAL');
  }
  db.exec(SCHEMA);
  return db;
}

/**
 * Devolve uma função que executa um bloco dentro de uma transação imediata:
 * o bloqueio de escrita é obtido no início, e qualquer exceção desfaz tudo.
 */
function createTransactionRunner(db) {
  return (work) => db.transaction(work).immediate();
}

module.exports = { createDatabase, createTransactionRunner };
