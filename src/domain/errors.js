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

class AccountNotFoundError extends DomainError {
  constructor(accountId) {
    super('ACCOUNT_NOT_FOUND', `Conta não encontrada: ${accountId}`);
  }
}

class DocumentRejectedError extends DomainError {
  constructor() {
    super('DOCUMENT_REJECTED', 'Situação cadastral irregular para o documento informado');
  }
}

class DocumentAlreadyRegisteredError extends DomainError {
  constructor() {
    super('DOCUMENT_ALREADY_REGISTERED', 'Já existe uma conta para o documento informado');
  }
}

module.exports = {
  DomainError,
  ValidationError,
  InsufficientFundsError,
  AccountNotFoundError,
  DocumentRejectedError,
  DocumentAlreadyRegisteredError,
};
