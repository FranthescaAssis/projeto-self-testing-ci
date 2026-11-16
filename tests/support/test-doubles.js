/**
 * Test doubles compartilhados pelas suítes de integração e E2E.
 *
 * STUB: devolve respostas fixas para alimentar o teste com dados controlados.
 *       Os testes NÃO fazem verificações sobre o stub.
 * MOCK: registra as chamadas recebidas para que o teste verifique a interação
 *       de saída (quantas vezes foi chamado e com quais parâmetros).
 */

// Stub do serviço de validação cadastral: sempre responde a situação informada.
function createRegistryValidatorStub(status = 'REGULAR') {
  return {
    async validate(document) {
      return { document, status };
    },
  };
}

// Relógio controlado: o teste decide que horas são.
function createFixedClock(initialIso = '2026-11-10T12:00:00.000Z') {
  let current = new Date(initialIso);
  const clock = () => new Date(current);
  clock.set = (iso) => {
    current = new Date(iso);
  };
  return clock;
}

module.exports = { createRegistryValidatorStub, createFixedClock };
