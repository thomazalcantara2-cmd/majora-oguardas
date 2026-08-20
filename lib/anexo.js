export const MAX_ANEXO_BYTES = 10 * 1024 * 1024; // 10MB

export const MIME_PERMITIDOS = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

export function sanitizarNomeArquivo(nome) {
  return String(nome || 'anexo').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
}
