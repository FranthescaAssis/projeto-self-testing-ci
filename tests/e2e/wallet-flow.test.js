const request = require('supertest');
const { buildContainer } = require('../../src/container');
const { LocalRegistryValidator } = require('../../src/services/registry-validator');
const { startFakeAntifraudServer } = require('../support/fake-antifraud-server');

const CPF_ANA = '529.982.247-25';
const CPF_BRUNO = '111.444.777-35';
const CPF_IRREGULAR = '987.654.321-00';

describe('Wallet API de ponta a ponta (requisições HTTP reais)', () => {
  let antifraud;
  let container;
  let server;
  let api;

  beforeEach(async () => {
    antifraud = await startFakeAntifraudServer();
    container = buildContainer(
      {
        port: 0,
        databaseFile: ':memory:',
        antifraudWebhookUrl: antifraud.url,
        antifraudTimeoutMs: 1000,
      },
      {
        registryValidator: new LocalRegistryValidator({ irregularDocuments: [CPF_IRREGULAR] }),
        logger: { warn: jest.fn(), error: jest.fn() },
      },
    );
    await new Promise((resolve) => {
      server = container.app.listen(0, '127.0.0.1', resolve);
    });
    api = request(`http://127.0.0.1:${server.address().port}`);
  });

  afterEach(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
    });
    container.close();
    await antifraud.close();
  });

  async function openAccount(ownerName, document, initialBalance) {
    const response = await api.post('/accounts').send({ ownerName, document, initialBalance }).expect(201);
    return response.body;
  }

  function transfer(body, idempotencyKey = 'pedido-001') {
    return api.post('/transfers').set('Idempotency-Key', idempotencyKey).send(body);
  }

  describe('fluxo principal', () => {
    it('abre duas contas, transfere um valor e emite o extrato final', async () => {
      // 1. Registro das contas
      const ana = await openAccount('Ana Souza', CPF_ANA, 100000);
      const bruno = await openAccount('Bruno Lima', CPF_BRUNO, 0);
      expect(ana).toMatchObject({ ownerName: 'Ana Souza', document: '52998224725', balance: 100000 });

      // 2. Transferência de R$ 250,00
      const transferResponse = await transfer({
        sourceAccountId: ana.id,
        targetAccountId: bruno.id,
        amount: 25000,
      }).expect(201);
      expect(transferResponse.body).toMatchObject({
        sourceAccountId: ana.id,
        targetAccountId: bruno.id,
        amount: 25000,
      });
      expect(transferResponse.headers['idempotent-replayed']).toBe('false');

      // 3. Saldos atualizados
      const anaAfter = await api.get(`/accounts/${ana.id}`).expect(200);
      const brunoAfter = await api.get(`/accounts/${bruno.id}`).expect(200);
      expect(anaAfter.body.balance).toBe(75000);
      expect(brunoAfter.body.balance).toBe(25000);

      // 4. Extrato final da conta de origem
      const statement = await api.get(`/accounts/${ana.id}/statement`).expect(200);
      expect(statement.body.balance).toBe(75000);
      expect(statement.body.entries.map((entry) => [entry.type, entry.amount, entry.balanceAfter])).toEqual([
        ['CREDIT', 100000, 100000],
        ['DEBIT', 25000, 75000],
      ]);
      expect(statement.body.entries[1].transferId).toBe(transferResponse.body.id);
    });

    it('informa a localização da conta criada no cabeçalho Location', async () => {
      const response = await api
        .post('/accounts')
        .send({ ownerName: 'Ana Souza', document: CPF_ANA, initialBalance: 100 })
        .expect(201);

      expect(response.headers.location).toBe(`/accounts/${response.body.id}`);
    });

    it('envia o webhook ao anti-fraude quando a transferência é concluída', async () => {
      const ana = await openAccount('Ana Souza', CPF_ANA, 100000);
      const bruno = await openAccount('Bruno Lima', CPF_BRUNO, 0);

      const response = await transfer({ sourceAccountId: ana.id, targetAccountId: bruno.id, amount: 1500 }).expect(201);

      expect(antifraud.requests).toHaveLength(1);
      expect(antifraud.requests[0]).toMatchObject({
        method: 'POST',
        path: '/webhooks/antifraude',
        body: {
          event: 'transfer.completed',
          data: {
            transferId: response.body.id,
            sourceAccountId: ana.id,
            targetAccountId: bruno.id,
            amount: 1500,
            occurredAt: response.body.createdAt,
          },
        },
      });
    });

    it('filtra o extrato por tipo e por período na query string', async () => {
      const ana = await openAccount('Ana Souza', CPF_ANA, 100000);
      const bruno = await openAccount('Bruno Lima', CPF_BRUNO, 0);
      await transfer({ sourceAccountId: ana.id, targetAccountId: bruno.id, amount: 1000 }, 'pedido-1').expect(201);
      await transfer({ sourceAccountId: ana.id, targetAccountId: bruno.id, amount: 2000 }, 'pedido-2').expect(201);

      const debits = await api.get(`/accounts/${ana.id}/statement`).query({ type: 'debit' }).expect(200);
      const future = await api.get(`/accounts/${ana.id}/statement`).query({ from: '2999-01-01' }).expect(200);

      expect(debits.body.entries.map((entry) => entry.amount)).toEqual([1000, 2000]);
      expect(debits.body.filters.type).toBe('DEBIT');
      expect(future.body.entries).toEqual([]);
    });
  });

  describe('idempotência', () => {
    it('devolve a mesma transferência com status 200 ao repetir a Idempotency-Key', async () => {
      const ana = await openAccount('Ana Souza', CPF_ANA, 100000);
      const bruno = await openAccount('Bruno Lima', CPF_BRUNO, 0);
      const body = { sourceAccountId: ana.id, targetAccountId: bruno.id, amount: 30000 };

      const first = await transfer(body, 'pedido-repetido').expect(201);
      const second = await transfer(body, 'pedido-repetido').expect(200);

      expect(second.body).toEqual(first.body);
      expect(second.headers['idempotent-replayed']).toBe('true');
      const anaAfter = await api.get(`/accounts/${ana.id}`);
      expect(anaAfter.body.balance).toBe(70000);
      expect(antifraud.requests).toHaveLength(1);
    });

    it('responde 409 quando a chave é reutilizada com outro valor', async () => {
      const ana = await openAccount('Ana Souza', CPF_ANA, 100000);
      const bruno = await openAccount('Bruno Lima', CPF_BRUNO, 0);
      await transfer({ sourceAccountId: ana.id, targetAccountId: bruno.id, amount: 100 }, 'pedido-x').expect(201);

      const response = await transfer({ sourceAccountId: ana.id, targetAccountId: bruno.id, amount: 999 }, 'pedido-x');

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('responde 400 quando o cabeçalho Idempotency-Key não é enviado', async () => {
      const response = await api.post('/transfers').send({ sourceAccountId: 'a', targetAccountId: 'b', amount: 100 });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('O cabeçalho Idempotency-Key é obrigatório');
    });
  });

  describe('respostas de erro', () => {
    it('responde 422 por saldo insuficiente e mantém os saldos', async () => {
      const ana = await openAccount('Ana Souza', CPF_ANA, 1000);
      const bruno = await openAccount('Bruno Lima', CPF_BRUNO, 0);

      const response = await transfer({ sourceAccountId: ana.id, targetAccountId: bruno.id, amount: 1001 });

      expect(response.status).toBe(422);
      expect(response.body).toEqual({
        error: {
          code: 'INSUFFICIENT_FUNDS',
          message: 'Saldo insuficiente: disponível R$ 10,00, solicitado R$ 10,01',
        },
      });
      const anaAfter = await api.get(`/accounts/${ana.id}`);
      expect(anaAfter.body.balance).toBe(1000);
      expect(antifraud.requests).toHaveLength(0);
    });

    it('responde 404 para conta inexistente', async () => {
      const response = await api.get('/accounts/nao-existe');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('ACCOUNT_NOT_FOUND');
    });

    it('responde 404 no extrato de conta inexistente', async () => {
      await api.get('/accounts/nao-existe/statement').expect(404);
    });

    it('responde 404 quando a conta de destino da transferência não existe', async () => {
      const ana = await openAccount('Ana Souza', CPF_ANA, 1000);

      const response = await transfer({ sourceAccountId: ana.id, targetAccountId: 'nao-existe', amount: 100 });

      expect(response.status).toBe(404);
    });

    it('responde 400 para dados inválidos na abertura de conta', async () => {
      const response = await api.post('/accounts').send({ ownerName: 'Ana Souza', document: '123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toEqual({ code: 'VALIDATION_ERROR', message: 'document deve ser um CPF válido' });
    });

    it('responde 400 quando a abertura de conta não tem corpo', async () => {
      await api.post('/accounts').expect(400);
    });

    it('responde 400 quando a transferência não tem corpo', async () => {
      await api.post('/transfers').set('Idempotency-Key', 'sem-corpo').expect(400);
    });

    it('responde 422 para CPF com situação cadastral irregular', async () => {
      const response = await api.post('/accounts').send({ ownerName: 'Carla Dias', document: CPF_IRREGULAR });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('DOCUMENT_REJECTED');
    });

    it('responde 409 para CPF já cadastrado', async () => {
      await openAccount('Ana Souza', CPF_ANA, 0);

      const response = await api.post('/accounts').send({ ownerName: 'Ana S.', document: CPF_ANA });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('DOCUMENT_ALREADY_REGISTERED');
    });

    it('responde 400 para filtro de extrato inválido', async () => {
      const ana = await openAccount('Ana Souza', CPF_ANA, 0);

      const response = await api.get(`/accounts/${ana.id}/statement`).query({ type: 'pix' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('type deve ser "debit" ou "credit"');
    });

    it('responde 400 para JSON malformado', async () => {
      const response = await api.post('/accounts').set('Content-Type', 'application/json').send('{"ownerName": ');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_JSON');
    });

    it('responde 404 padronizado para rota desconhecida', async () => {
      const response = await api.get('/rota-que-nao-existe');

      expect(response.status).toBe(404);
      expect(response.body.error).toEqual({
        code: 'ROUTE_NOT_FOUND',
        message: 'Rota não encontrada: GET /rota-que-nao-existe',
      });
    });
  });

  describe('resiliência', () => {
    it('responde 201 e efetiva a transferência mesmo com o anti-fraude fora do ar', async () => {
      const ana = await openAccount('Ana Souza', CPF_ANA, 100000);
      const bruno = await openAccount('Bruno Lima', CPF_BRUNO, 0);
      antifraud.respondWith(503);

      await transfer({ sourceAccountId: ana.id, targetAccountId: bruno.id, amount: 5000 }).expect(201);

      const brunoAfter = await api.get(`/accounts/${bruno.id}`);
      expect(brunoAfter.body.balance).toBe(5000);
    });
  });

  describe('operação', () => {
    it('informa a saúde do serviço', async () => {
      const response = await api.get('/health').expect(200);

      expect(response.body).toEqual({ status: 'ok' });
    });

    it('não expõe o cabeçalho X-Powered-By', async () => {
      const response = await api.get('/health');

      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });
});
