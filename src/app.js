const express = require('express');
const { createAccountsRouter } = require('./controllers/accounts-controller');
const { createTransfersRouter } = require('./controllers/transfers-controller');
const { createErrorHandler } = require('./controllers/error-handler');

/**
 * Monta a aplicação Express a partir dos serviços já construídos.
 * Não abre porta nem banco: isso permite subir a API dentro dos testes.
 */
function createApp({ accountService, transferService, statementService, logger }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/accounts', createAccountsRouter({ accountService, statementService }));
  app.use('/transfers', createTransfersRouter({ transferService }));

  app.use((req, res) => {
    res.status(404).json({
      error: { code: 'ROUTE_NOT_FOUND', message: `Rota não encontrada: ${req.method} ${req.path}` },
    });
  });
  app.use(createErrorHandler({ logger }));

  return app;
}

module.exports = { createApp };
