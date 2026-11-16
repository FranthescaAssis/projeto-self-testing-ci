const { toHttpError, createErrorHandler } = require('../../src/controllers/error-handler');
const {
  DomainError,
  ValidationError,
  InsufficientFundsError,
  AccountNotFoundError,
  DocumentRejectedError,
  DocumentAlreadyRegisteredError,
  IdempotencyConflictError,
} = require('../../src/domain/errors');

describe('toHttpError', () => {
  it.each([
    [new ValidationError('amount deve ser maior que zero'), 400, 'VALIDATION_ERROR'],
    [new AccountNotFoundError('conta-1'), 404, 'ACCOUNT_NOT_FOUND'],
    [new DocumentAlreadyRegisteredError(), 409, 'DOCUMENT_ALREADY_REGISTERED'],
    [new IdempotencyConflictError(), 409, 'IDEMPOTENCY_CONFLICT'],
    [new DocumentRejectedError(), 422, 'DOCUMENT_REJECTED'],
    [new InsufficientFundsError('Saldo insuficiente'), 422, 'INSUFFICIENT_FUNDS'],
  ])('mapeia %p para o status %i', (error, status, code) => {
    expect(toHttpError(error)).toEqual({
      status,
      body: { error: { code, message: error.message } },
    });
  });

  it('usa 400 para erro de negócio sem mapeamento específico', () => {
    const result = toHttpError(new DomainError('REGRA_NOVA', 'Regra ainda não mapeada'));

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('REGRA_NOVA');
  });

  it('mapeia JSON malformado para 400', () => {
    const parseError = Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed' });

    expect(toHttpError(parseError)).toEqual({
      status: 400,
      body: { error: { code: 'INVALID_JSON', message: 'O corpo da requisição não é um JSON válido' } },
    });
  });

  it('esconde os detalhes de erros inesperados atrás de um 500 genérico', () => {
    const result = toHttpError(new Error('senha do banco: 123'));

    expect(result).toEqual({
      status: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'Erro interno inesperado' } },
    });
  });
});

describe('createErrorHandler', () => {
  function createResponse() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  it('responde com o status e o corpo padronizados', () => {
    const res = createResponse();
    const handler = createErrorHandler({ logger: { error: jest.fn() } });

    handler(new AccountNotFoundError('conta-1'), {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'ACCOUNT_NOT_FOUND', message: 'Conta não encontrada: conta-1' },
    });
  });

  it('registra em log apenas os erros inesperados', () => {
    const logger = { error: jest.fn() };
    const handler = createErrorHandler({ logger });
    const unexpected = new Error('falha inesperada');

    handler(new ValidationError('dado inválido'), {}, createResponse(), jest.fn());
    handler(unexpected, {}, createResponse(), jest.fn());

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(unexpected);
  });

  it('usa o console como logger padrão', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    createErrorHandler()(new Error('falha'), {}, createResponse(), jest.fn());

    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
