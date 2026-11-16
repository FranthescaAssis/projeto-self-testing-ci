function toAccount(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    ownerName: row.owner_name,
    document: row.document,
    balance: row.balance,
    createdAt: row.created_at,
  };
}

class AccountRepository {
  constructor(db) {
    this.statements = {
      insert: db.prepare(
        `INSERT INTO accounts (id, owner_name, document, balance, created_at)
         VALUES (@id, @ownerName, @document, @balance, @createdAt)`,
      ),
      findById: db.prepare('SELECT * FROM accounts WHERE id = ?'),
      findByDocument: db.prepare('SELECT * FROM accounts WHERE document = ?'),
      updateBalance: db.prepare('UPDATE accounts SET balance = ? WHERE id = ?'),
    };
  }

  insert(account) {
    this.statements.insert.run(account);
  }

  findById(id) {
    return toAccount(this.statements.findById.get(id));
  }

  findByDocument(document) {
    return toAccount(this.statements.findByDocument.get(document));
  }

  updateBalance(id, balance) {
    this.statements.updateBalance.run(balance, id);
  }
}

module.exports = { AccountRepository };
