const http = require('node:http');

/**
 * Servidor HTTP local que faz o papel do serviço externo de anti-fraude nos
 * testes E2E. Guarda cada webhook recebido para inspeção.
 */
async function startFakeAntifraudServer() {
  const requests = [];
  let statusCode = 202;

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      requests.push({ method: req.method, path: req.url, headers: req.headers, body: JSON.parse(raw) });
      res.statusCode = statusCode;
      res.end();
    });
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  return {
    url: `http://127.0.0.1:${server.address().port}/webhooks/antifraude`,
    requests,
    respondWith(newStatusCode) {
      statusCode = newStatusCode;
    },
    close() {
      server.closeAllConnections();
      return new Promise((resolve) => {
        server.close(resolve);
      });
    },
  };
}

module.exports = { startFakeAntifraudServer };
