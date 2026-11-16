/**
 * Porta de saída para o serviço externo (fictício) de anti-fraude.
 * Contrato: notifyTransfer({ transferId, sourceAccountId, targetAccountId, amount, occurredAt }).
 */
class HttpFraudGateway {
  constructor({ url, timeoutMs, fetchImpl = fetch }) {
    this.url = url;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  async notifyTransfer(notification) {
    const response = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'transfer.completed', data: notification }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Anti-fraude respondeu com status ${response.status}`);
    }
  }
}

// Usado quando nenhuma URL de webhook está configurada.
class DisabledFraudGateway {
  async notifyTransfer() {}
}

module.exports = { HttpFraudGateway, DisabledFraudGateway };
