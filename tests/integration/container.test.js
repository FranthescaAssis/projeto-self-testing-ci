const request = require('supertest');
const { buildContainer } = require('../../src/container');
const { HttpFraudGateway, DisabledFraudGateway } = require('../../src/services/fraud-gateway');
const { createFraudGatewayMock, createRegistryValidatorStub } = require('../support/test-doubles');

const baseConfig = {
  port: 0,
  databaseFile: ':memory:',
  antifraudWebhookUrl: null,
  antifraudTimeoutMs: 2000,
};

describe('buildContainer (raiz de composição)', () => {
  let container;

  afterEach(() => {
    container.close();
  });

  it('desativa o anti-fraude quando nenhuma URL de webhook está configurada', () => {
    container = buildContainer(baseConfig);

    expect(container.fraudGateway).toBeInstanceOf(DisabledFraudGateway);
  });

  it('usa o cliente HTTP quando a URL do webhook está configurada', () => {
    container = buildContainer({ ...baseConfig, antifraudWebhookUrl: 'http://antifraude.local/webhook' });

    expect(container.fraudGateway).toBeInstanceOf(HttpFraudGateway);
    expect(container.fraudGateway.url).toBe('http://antifraude.local/webhook');
    expect(container.fraudGateway.timeoutMs).toBe(2000);
  });

  it('permite substituir as dependências externas por test doubles', async () => {
    const fraudGateway = createFraudGatewayMock();
    container = buildContainer(baseConfig, {
      fraudGateway,
      registryValidator: createRegistryValidatorStub('REGULAR'),
    });
    const api = request(container.app);

    const ana = await api.post('/accounts').send({ ownerName: 'Ana Souza', document: '52998224725', initialBalance: 900 });
    const bruno = await api.post('/accounts').send({ ownerName: 'Bruno Lima', document: '11144477735' });
    await api
      .post('/transfers')
      .set('Idempotency-Key', 'container-1')
      .send({ sourceAccountId: ana.body.id, targetAccountId: bruno.body.id, amount: 400 })
      .expect(201);

    expect(fraudGateway.notifyTransfer).toHaveBeenCalledTimes(1);
    expect(fraudGateway.notifyTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ sourceAccountId: ana.body.id, targetAccountId: bruno.body.id, amount: 400 }),
    );
  });

  it('responde 500 genérico e registra o erro quando ocorre uma falha inesperada', async () => {
    const logger = { error: jest.fn() };
    const registryValidator = {
      validate: jest.fn().mockRejectedValue(new Error('serviço cadastral fora do ar')),
    };
    container = buildContainer(baseConfig, { registryValidator, logger });

    const response = await request(container.app)
      .post('/accounts')
      .send({ ownerName: 'Ana Souza', document: '52998224725' });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno inesperado' } });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
