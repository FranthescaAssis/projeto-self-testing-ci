require('dotenv').config({ quiet: true });

const { loadConfig } = require('./config');
const { buildContainer } = require('./container');

const config = loadConfig();
const container = buildContainer(config);

const server = container.app.listen(config.port, () => {
  console.log(`Wallet API ouvindo na porta ${config.port}`);
});

function shutdown() {
  server.close(() => {
    container.close();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
