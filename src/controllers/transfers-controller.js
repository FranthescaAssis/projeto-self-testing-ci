const express = require('express');

function createTransfersRouter({ transferService }) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const { sourceAccountId, targetAccountId, amount } = req.body ?? {};
    const { transfer, replayed } = await transferService.transfer({
      sourceAccountId,
      targetAccountId,
      amount,
      idempotencyKey: req.get('Idempotency-Key'),
    });

    // 201 na primeira execução; 200 quando a resposta é a repetição idempotente.
    res
      .status(replayed ? 200 : 201)
      .set('Idempotent-Replayed', String(replayed))
      .json(transfer);
  });

  return router;
}

module.exports = { createTransfersRouter };
