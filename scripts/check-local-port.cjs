const { createServer } = require('node:net');

function checkLocalPort(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', error => reject(error.code === 'EADDRINUSE'
      ? new Error(`El puerto ${port} ya está ocupado. Detén el servidor anterior de esa terminal con Ctrl+C y vuelve a ejecutar el comando. Si Financia ya está abierta, no necesitas iniciar un segundo servidor.`)
      : error));
    server.listen({ port, host, exclusive: true }, () => server.close(error => error ? reject(error) : resolve()));
  });
}

module.exports = { checkLocalPort };
