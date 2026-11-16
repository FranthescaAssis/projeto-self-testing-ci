// Gera uma tabela Markdown com o resumo de cobertura, usada no resumo do job
// do GitHub Actions. Lê o arquivo produzido pelo reporter "json-summary" do Jest.
const fs = require('node:fs');
const path = require('node:path');

const summaryFile = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');
const thresholds = require('../jest.config').coverageThreshold.global;

if (!fs.existsSync(summaryFile)) {
  console.log('Relatório de cobertura não encontrado.');
  process.exit(0);
}

const { total } = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
const labels = {
  statements: 'Statements',
  branches: 'Branches',
  functions: 'Funções',
  lines: 'Linhas',
};

const rows = Object.entries(labels).map(([metric, label]) => {
  const { pct, covered, total: count } = total[metric];
  const status = pct >= thresholds[metric] ? 'atingido' : 'NÃO atingido';
  return `| ${label} | ${pct}% (${covered}/${count}) | ${thresholds[metric]}% | ${status} |`;
});

console.log(
  ['## Cobertura de código', '', '| Métrica | Cobertura | Mínimo exigido | Resultado |', '|---|---|---|---|', ...rows].join(
    '\n',
  ),
);
