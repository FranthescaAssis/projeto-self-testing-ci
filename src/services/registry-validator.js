const { normalizeCpf } = require('../domain/cpf');

/**
 * Implementação local (simulada) do serviço de validação cadastral.
 *
 * Em produção esta porta seria atendida por um serviço externo de consulta
 * de situação cadastral. O contrato é: validate(document) -> { document, status },
 * em que status é "REGULAR" ou "IRREGULAR".
 */
class LocalRegistryValidator {
  constructor({ irregularDocuments = [] } = {}) {
    this.irregularDocuments = new Set(irregularDocuments.map(normalizeCpf));
  }

  async validate(document) {
    const status = this.irregularDocuments.has(normalizeCpf(document)) ? 'IRREGULAR' : 'REGULAR';
    return { document, status };
  }
}

module.exports = { LocalRegistryValidator };
