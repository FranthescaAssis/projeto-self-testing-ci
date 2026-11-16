/**
 * Erros de negócio. Cada erro carrega um código estável, que a camada HTTP
 * traduz para um status de resposta.
 */
class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

class ValidationError extends DomainError {
  constructor(message) {
    super('VALIDATION_ERROR', message);
  }
}

class InsufficientFundsError extends DomainError {
  constructor(message) {
    super('INSUFFICIENT_FUNDS', message);
  }
}

module.exports = { DomainError, ValidationError, InsufficientFundsError };
