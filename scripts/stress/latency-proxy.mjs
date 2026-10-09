/**
 * Proxy TCP que agrega latencia de red entre la app y un Postgres LOCAL, para
 * que la prueba de estrés se parezca a producción: las funciones de Vercel
 * corren en iad1 (Virginia) y la base Neon en us-east-2 (Ohio), ~11 ms de ida
 * y vuelta por consulta. Cada transacción con lock paga esa latencia por cada
 * consulta mientras mantiene el lock, así que el cuello de botella real solo
 * aparece con la latencia puesta.
 *
 *   node scripts/stress/latency-proxy.mjs --listen=5434 --target=5433 --one-way-ms=6
 *   DATABASE_URL=postgresql://postgres@localhost:5434/erp_stress …
 */
import net from 'node:net';

function arg(name, fallback) {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

const listen = Number(arg('listen', '5434'));
const target = Number(arg('target', '5433'));
const delay = Number(arg('one-way-ms', '6'));

function pipeWithDelay(from, to) {
  from.on('data', (chunk) => {
    setTimeout(() => {
      if (!to.destroyed) to.write(chunk);
    }, delay);
  });
  from.on('end', () => setTimeout(() => to.end(), delay));
  from.on('error', () => to.destroy());
}

net
  .createServer((client) => {
    const upstream = net.connect(target, '127.0.0.1');
    pipeWithDelay(client, upstream);
    pipeWithDelay(upstream, client);
  })
  .listen(listen, '127.0.0.1', () => console.log(`latency-proxy :${listen} → :${target} (+${delay} ms por sentido)`));
