function toTransfer(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    sourceAccountId: row.source_account_id,
    targetAccountId: row.target_account_id,
    amount: row.amount,
    createdAt: row.created_at,
  };
}

class TransferRepository {
  constructor(db) {
    this.statements = {
      insert: db.prepare(
        `INSERT INTO transfers (id, source_account_id, target_account_id, amount, created_at)
         VALUES (@id, @sourceAccountId, @targetAccountId, @amount, @createdAt)`,
      ),
      findById: db.prepare('SELECT * FROM transfers WHERE id = ?'),
    };
  }

  insert(transfer) {
    this.statements.insert.run(transfer);
  }

  findById(id) {
    return toTransfer(this.statements.findById.get(id));
  }
}

module.exports = { TransferRepository };
