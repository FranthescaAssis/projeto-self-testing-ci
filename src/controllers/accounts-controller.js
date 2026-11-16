const express = require('express');

function createAccountsRouter({ accountService, statementService }) {
  const router = express.Router();

  router.post('/', async (req, res) => {
    const { ownerName, document, initialBalance } = req.body ?? {};
    const account = await accountService.createAccount({ ownerName, document, initialBalance });
    res.status(201).location(`/accounts/${account.id}`).json(account);
  });

  router.get('/:id', (req, res) => {
    res.json(accountService.getAccount(req.params.id));
  });

  router.get('/:id/statement', (req, res) => {
    const { from, to, type } = req.query;
    res.json(statementService.getStatement(req.params.id, { from, to, type }));
  });

  return router;
}

module.exports = { createAccountsRouter };
