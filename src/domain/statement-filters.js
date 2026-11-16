const { ValidationError } = require('./errors');

const TRANSACTION_TYPES = Object.freeze({ DEBIT: 'DEBIT', CREDIT: 'CREDIT' });

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const START_OF_DAY = 'T00:00:00.000Z';
const END_OF_DAY = 'T23:59:59.999Z';

function parseDate(value, field, timeOfDay) {
  const message = `${field} deve ser uma data válida no formato AAAA-MM-DD`;
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    throw new ValidationError(message);
  }

  const date = new Date(`${value}${timeOfDay}`);
  // Datas como 2026-02-30 são "corrigidas" pelo JavaScript; a comparação detecta esse caso.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(message);
  }
  return date.toISOString();
}

function parseType(value) {
  const type = typeof value === 'string' ? TRANSACTION_TYPES[value.toUpperCase()] : undefined;
  if (!type) {
    throw new ValidationError('type deve ser "debit" ou "credit"');
  }
  return type;
}

/**
 * Converte os parâmetros de consulta do extrato em filtros validados.
 * As datas são interpretadas em UTC e o período é inclusivo nas duas pontas:
 * "from" vale desde o primeiro instante do dia e "to" até o último.
 */
function parseStatementFilters({ from, to, type } = {}) {
  const filters = {
    from: from === undefined ? null : parseDate(from, 'from', START_OF_DAY),
    to: to === undefined ? null : parseDate(to, 'to', END_OF_DAY),
    type: type === undefined ? null : parseType(type),
  };

  if (filters.from && filters.to && filters.from > filters.to) {
    throw new ValidationError('from não pode ser posterior a to');
  }
  return filters;
}

module.exports = { TRANSACTION_TYPES, parseStatementFilters };
