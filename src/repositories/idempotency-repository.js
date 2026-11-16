function toRecord(row) {
  if (!row) {
    return null;
  }
  return {
    key: row.key,
    fingerprint: row.fingerprint,
    transferId: row.transfer_id,
    createdAt: row.created_at,
  };
}

/**
 * Chaves de idempotência já processadas e a transferência gerada por cada uma.
 */
class IdempotencyRepository {
  constructor(db) {
    this.statements = {
      insert: db.prepare(
        `INSERT INTO idempotency_keys (key, fingerprint, transfer_id, created_at)
         VALUES (@key, @fingerprint, @transferId, @createdAt)`,
      ),
      findByKey: db.prepare('SELECT * FROM idempotency_keys WHERE key = ?'),
    };
  }

  insert(record) {
    this.statements.insert.run(record);
  }

  findByKey(key) {
    return toRecord(this.statements.findByKey.get(key));
  }
}

module.exports = { IdempotencyRepository };
