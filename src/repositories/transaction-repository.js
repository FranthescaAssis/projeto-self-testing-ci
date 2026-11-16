function toEntry(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    transferId: row.transfer_id,
    type: row.type,
    amount: row.amount,
    balanceAfter: row.balance_after,
    counterpartyAccountId: row.counterparty_account_id,
    description: row.description,
    createdAt: row.created_at,
  };
}

/**
 * Lançamentos (débitos e créditos) que compõem o extrato de cada conta.
 */
class TransactionRepository {
  constructor(db) {
    this.statements = {
      insert: db.prepare(
        `INSERT INTO transactions
           (id, account_id, transfer_id, type, amount, balance_after, counterparty_account_id, description, created_at)
         VALUES
           (@id, @accountId, @transferId, @type, @amount, @balanceAfter, @counterpartyAccountId, @description, @createdAt)`,
      ),
      listByAccount: db.prepare('SELECT * FROM transactions WHERE account_id = ? ORDER BY seq'),
    };
  }

  insert(entry) {
    this.statements.insert.run(entry);
  }

  listByAccount(accountId) {
    return this.statements.listByAccount.all(accountId).map(toEntry);
  }
}

module.exports = { TransactionRepository };
