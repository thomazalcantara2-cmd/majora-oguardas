import { SignJWT, jwtVerify } from 'jose';

const SESSAO_TTL_SEGUNDOS = 15 * 60;

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      'Configuração ausente: defina a variável de ambiente SESSION_SECRET (uma string aleatória longa) no projeto Vercel. Veja README.md.'
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Token de sessão de curta duração emitido após a senha ser validada.
 * Substitui o CacheService do Apps Script: aqui o "servidor" (Vercel) não
 * guarda estado nenhum — o próprio token, assinado, carrega o id da linha
 * e expira sozinho.
 */
export async function emitirToken(servidorId) {
  return new SignJWT({ servidorId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSAO_TTL_SEGUNDOS}s`)
    .sign(getSecretKey());
}

export async function verificarToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload.servidorId || null;
  } catch (err) {
    return null;
  }
}
