# projeto-self-testing-ci

Wallet API: microsserviço financeiro simplificado (carteira digital) com suíte de
self-testing multinível, pipeline de integração contínua e estratégia de branching.

Projeto Capstone da Atividade Prática Avaliativa. A documentação formal de requisitos,
arquitetura e resultados está em [RELATORIO_TECNICO.md](RELATORIO_TECNICO.md).

## Requisitos

- Node.js 22 ou superior
- npm

## Como executar

```bash
npm install
cp .env.example .env
npm start
```

A API sobe em `http://localhost:3000`. Por padrão o banco é um SQLite em memória;
para manter os dados entre execuções, defina `DATABASE_FILE=./data/wallet.db` no `.env`.

## Exemplos de uso

Os valores monetários são sempre inteiros em centavos (R$ 10,50 = `1050`).

```bash
# Criar duas contas
curl -X POST http://localhost:3000/accounts -H "Content-Type: application/json" \
  -d '{"ownerName": "Ana Souza", "document": "529.982.247-25", "initialBalance": 100000}'

curl -X POST http://localhost:3000/accounts -H "Content-Type: application/json" \
  -d '{"ownerName": "Bruno Lima", "document": "111.444.777-35", "initialBalance": 0}'

# Transferir R$ 250,00 (troque os ids pelos devolvidos acima)
curl -X POST http://localhost:3000/transfers -H "Content-Type: application/json" \
  -H "Idempotency-Key: pedido-001" \
  -d '{"sourceAccountId": "ID_DA_ANA", "targetAccountId": "ID_DO_BRUNO", "amount": 25000}'

# Consultar saldo e extrato
curl http://localhost:3000/accounts/ID_DA_ANA
curl "http://localhost:3000/accounts/ID_DA_ANA/statement?type=debit&from=2026-11-01&to=2026-11-30"
```

## Testes

| Comando | O que executa |
|---|---|
| `npm test` | Toda a suíte (unitários, integração e E2E) |
| `npm run test:unit` | Testes unitários das regras de domínio |
| `npm run test:integration` | Testes de integração com SQLite em memória, mocks e stubs |
| `npm run test:e2e` | Testes de ponta a ponta com requisições HTTP reais |
| `npm run test:coverage` | Suíte completa com relatório de cobertura em `coverage/` |
| `npm run lint` | Análise estática com ESLint |

## Estrutura

```text
.github/workflows/ci.yml   Pipeline de integração contínua
src/domain                 Regras de negócio puras
src/services               Casos de uso e clientes de serviços externos
src/repositories           Acesso ao SQLite
src/controllers            Rotas HTTP e tratamento de erros
tests/unit                 Testes unitários (TDD)
tests/integration          Testes com banco em memória, mocks e stubs
tests/e2e                  Testes de ponta a ponta
tests/support              Test doubles e utilitários compartilhados
```
