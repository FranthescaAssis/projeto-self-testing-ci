function parseInteger(rawValue, defaultValue) {
  if (rawValue === undefined || rawValue === '') {
    return defaultValue;
  }
  return Number(rawValue);
}

function loadConfig(env = process.env) {
  const port = parseInteger(env.PORT, 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT inválida: ${env.PORT}`);
  }

  const antifraudTimeoutMs = parseInteger(env.ANTIFRAUD_TIMEOUT_MS, 2000);
  if (!Number.isInteger(antifraudTimeoutMs) || antifraudTimeoutMs <= 0) {
    throw new Error(`ANTIFRAUD_TIMEOUT_MS inválido: ${env.ANTIFRAUD_TIMEOUT_MS}`);
  }

  return {
    port,
    databaseFile: env.DATABASE_FILE || ':memory:',
    antifraudWebhookUrl: env.ANTIFRAUD_WEBHOOK_URL || null,
    antifraudTimeoutMs,
  };
}

module.exports = { loadConfig };
