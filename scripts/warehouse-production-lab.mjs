/** Arranque de producción contra el PostgreSQL loopback del laboratorio. */
import { copyFileSync, createWriteStream, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { readFile as read, writeFile as write } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { SignJWT, decodeJwt } from 'jose';
import { spawn } from 'node:child_process';
const seed = JSON.parse(await read('.codex-audit/warehouse/browser-session.json', 'utf8'));
const secret = randomBytes(32).toString('hex');
const claims = decodeJwt(seed.token);
delete claims.iat; delete claims.exp;
const token = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('8h').sign(new TextEncoder().encode(secret));
await write('.codex-audit/warehouse/browser-session.json', JSON.stringify({ ...seed, token, userId: claims.id }));
const port = Number(process.env.WAREHOUSE_DB_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Indica WAREHOUSE_DB_PORT del laboratorio loopback activo');
// Un build selectivo de Next omite la ruta de metadatos del icono. Servimos
// exactamente sus bytes originales en el laboratorio, sin sustituir APIs.
const appPaths = JSON.parse(await read('.next/server/app-paths-manifest.json', 'utf8'));
let mirroredIcon = null;
if (!appPaths['/icon.png/route'] && !existsSync('public/icon.png')) {
  mirroredIcon = readFileSync('src/app/icon.png');
  copyFileSync('src/app/icon.png', 'public/icon.png');
}
process.on('exit', () => {
  if (mirroredIcon && existsSync('public/icon.png') && readFileSync('public/icon.png').equals(mirroredIcon)) unlinkSync('public/icon.png');
});
const env = { ...process.env, DATABASE_URL: `postgresql://postgres@127.0.0.1:${port}/postgres`, JWT_SECRET: secret, APP_URL: 'http://localhost:3102', SENTRY_DSN: '', SUPERSUITE_URL: '', SUPERSUITE_KEY: '' };
const log = createWriteStream('.codex-audit/warehouse/production.log');
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', '3102'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
child.stdout.pipe(log); child.stderr.pipe(log);
console.log('Servidor de prueba de producción: http://localhost:3102/bodega');
process.on('SIGINT', () => { child.kill(); process.exit(0); });
child.on('exit', (code) => process.exit(code ?? 1));
