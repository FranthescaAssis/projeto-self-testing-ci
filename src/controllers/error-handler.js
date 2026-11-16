const { DomainError } = require('../domain/errors');

const STATUS_BY_CODE = Object.freeze({
  VALIDATION_ERROR: 400,
  ACCOUNT_NOT_FOUND: 404,
  DOCUMENT_ALREADY_REGISTERED: 409,
  IDEMPOTENCY_CONFLICT: 409,
  DOCUMENT_REJECTED: 422,
  INSUFFICIENT_FUNDS: 422,
});

function errorBody(code, message) {
  return { error: { code, message } };
}

/**
 * Traduz um erro da aplicação para status e corpo HTTP.
 * Erros inesperados nunca expõem detalhes internos ao cliente.
 */
function toHttpError(error) {
  if (error instanceof DomainError) {
    return {
      status: STATUS_BY_CODE[error.code] ?? 400,
      body: errorBody(error.code, error.message),
    };
  }
  if (error.type === 'entity.parse.failed') {
    return {
      status: 400,
      body: errorBody('INVALID_JSON', 'O corpo da requisição não é um JSON válido'),
    };
  }
  return {
    status: 500,
    body: errorBody('INTERNAL_ERROR', 'Erro interno inesperado'),
  };
}

function createErrorHandler({ logger = console } = {}) {
  // O Express identifica o middleware de erro pelos quatro parâmetros.
  return (error, _req, res, _next) => {
    const { status, body } = toHttpError(error);
    if (status >= 500) {
      logger.error(error);
    }
    res.status(status).json(body);
  };
}

module.exports = { toHttpError, createErrorHandler };
