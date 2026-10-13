import { resolve } from 'node:path';
import { isIP } from 'node:net';
import { existsSync } from 'node:fs';

export function loadEnvironment(root) { const path=resolve(root,'.env'); if(existsSync(path)) process.loadEnvFile(path); }
export function configuration(root, env=process.env) {
  const production=env.NODE_ENV==='production';
  const port=Number(env.PORT||3000);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT muss zwischen 1 und 65535 liegen.');
  let publicUrl=null;
  if(env.PUBLIC_BASE_URL) {
    const u=new URL(env.PUBLIC_BASE_URL);
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error('PUBLIC_BASE_URL muss eine HTTP(S)-Adresse ohne Pfad sein.');
    publicUrl=u.origin;
  }
  if(production && !publicUrl?.startsWith('https://'))throw new Error('Produktionsbetrieb benötigt PUBLIC_BASE_URL mit HTTPS.');
  const trustedProxies=(env.TRUSTED_PROXIES||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(trustedProxies.some(ip=>!isIP(ip)))throw new Error('TRUSTED_PROXIES akzeptiert nur einzelne IP-Adressen, keine Wildcards.');
  if(production&&!trustedProxies.length)throw new Error('Produktionsbetrieb benötigt einen ausdrücklich vertrauenswürdigen HTTPS-Proxy.');
  return { production, publicUrl, trustedProxies, port, host:env.HOST||'127.0.0.1', dataDir:resolve(root,env.DATA_DIR||'data'), secureCookie:production||env.SECURE_COOKIE==='1'||publicUrl?.startsWith('https://')||false };
}
export function clientAddress(req,trustedProxies=[]) {
  const remote=(req.socket.remoteAddress||'').replace(/^::ffff:/,'');
  if(trustedProxies.includes(remote)) {
    const forwarded=req.headers['x-forwarded-for'];
    // The configured proxy must overwrite this header with one address.
    if(typeof forwarded==='string' && isIP(forwarded.trim()))return forwarded.trim();
  }
  return remote;
}
