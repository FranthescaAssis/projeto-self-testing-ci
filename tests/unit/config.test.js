const { loadConfig } = require('../../src/config');

describe('loadConfig', () => {
  it('usa valores padrão quando nenhuma variável de ambiente é informada', () => {
    const config = loadConfig({});

    expect(config).toEqual({
      port: 3000,
      databaseFile: ':memory:',
      antifraudWebhookUrl: null,
      antifraudTimeoutMs: 2000,
    });
  });

  it('lê os valores informados nas variáveis de ambiente', () => {
    const config = loadConfig({
      PORT: '8080',
      DATABASE_FILE: './data/wallet.db',
      ANTIFRAUD_WEBHOOK_URL: 'http://antifraude.local/webhook',
      ANTIFRAUD_TIMEOUT_MS: '500',
    });

    expect(config).toEqual({
      port: 8080,
      databaseFile: './data/wallet.db',
      antifraudWebhookUrl: 'http://antifraude.local/webhook',
      antifraudTimeoutMs: 500,
    });
  });

  it.each(['abc', '-1', '70000', '80.5'])('rejeita PORT inválida (%s)', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow('PORT inválida');
  });

  it('rejeita tempo limite do anti-fraude que não seja inteiro positivo', () => {
    expect(() => loadConfig({ ANTIFRAUD_TIMEOUT_MS: '0' })).toThrow('ANTIFRAUD_TIMEOUT_MS inválido');
  });
});
