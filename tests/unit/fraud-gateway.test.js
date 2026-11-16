const { HttpFraudGateway, DisabledFraudGateway } = require('../../src/services/fraud-gateway');

const notification = {
  transferId: 'transferencia-1',
  sourceAccountId: 'conta-a',
  targetAccountId: 'conta-b',
  amount: 1500,
  occurredAt: '2026-11-12T09:30:00.000Z',
};

describe('HttpFraudGateway (mock de fetch)', () => {
  function createGateway(fetchMock, options = {}) {
    return new HttpFraudGateway({
      url: 'http://antifraude.local/webhook',
      timeoutMs: 2000,
      fetchImpl: fetchMock,
      ...options,
    });
  }

  it('envia um POST para a URL configurada do webhook', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 202 });

    await createGateway(fetchMock).notifyTransfer(notification);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://antifraude.local/webhook');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('envia o evento transfer.completed com os dados da transferência no corpo', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    await createGateway(fetchMock).notifyTransfer(notification);

    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      event: 'transfer.completed',
      data: notification,
    });
  });

  it('limita o tempo de espera com um sinal de cancelamento', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    await createGateway(fetchMock, { timeoutMs: 500 }).notifyTransfer(notification);

    const [, options] = fetchMock.mock.calls[0];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('lança erro quando o anti-fraude responde com status de falha', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 503 });

    await expect(createGateway(fetchMock).notifyTransfer(notification)).rejects.toThrow(
      'Anti-fraude respondeu com status 503',
    );
  });

  it('propaga a falha de rede', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(createGateway(fetchMock).notifyTransfer(notification)).rejects.toThrow('ECONNREFUSED');
  });

  it('usa o fetch nativo quando nenhuma implementação é injetada', () => {
    const gateway = new HttpFraudGateway({ url: 'http://antifraude.local/webhook', timeoutMs: 2000 });

    expect(gateway.fetchImpl).toBe(fetch);
  });
});

describe('DisabledFraudGateway', () => {
  it('não faz nada quando o anti-fraude está desativado', async () => {
    await expect(new DisabledFraudGateway().notifyTransfer(notification)).resolves.toBeUndefined();
  });
});
