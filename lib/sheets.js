// Acesso à planilha "RECURSOS_-_PREENCHIDA_ajustada" via um Web App do
// Google Apps Script (ver apps-script/Code.gs) — não via Sheets API direta.
// O Apps Script já roda com as permissões de quem implantou o script, então
// não é preciso conta de serviço nem compartilhar a planilha com mais
// ninguém.

function getConfig_() {
  const url = process.env.APPS_SCRIPT_URL;
  const token = process.env.APPS_SCRIPT_TOKEN;
  if (!url || !token) {
    throw new Error(
      'Configuração ausente: defina APPS_SCRIPT_URL e APPS_SCRIPT_TOKEN no projeto Vercel. Veja README.md.'
    );
  }
  return { url, token };
}

async function chamarAppsScript(acao, parametros) {
  const { url, token } = getConfig_();
  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'follow',
    body: JSON.stringify({ token, acao, ...(parametros || {}) })
  });

  if (!resposta.ok) {
    throw new Error(`Erro ao chamar o Apps Script (HTTP ${resposta.status}).`);
  }

  const json = await resposta.json();
  if (!json.ok) {
    throw new Error(`Erro retornado pelo Apps Script: ${json.erro || 'desconhecido'}`);
  }
  return json;
}

/** Lê todas as linhas de dados: [{ CPF, 'MATR.', NOME, ..., _linha }, ...] */
export async function lerLinhas() {
  const { linhas } = await chamarAppsScript('lerLinhas');
  return linhas;
}

export async function lerLinha(numeroLinha) {
  const { linha } = await chamarAppsScript('lerLinha', { linha: numeroLinha });
  return linha;
}

/** Escreve valores em colunas específicas de uma linha, por NOME de coluna
 * (ex: { Recurso: url, Data_Recurso: iso }) — não por letra. */
export async function escreverCelulas(numeroLinha, valoresPorColuna) {
  await chamarAppsScript('escreverCelulas', { linha: numeroLinha, valores: valoresPorColuna });
}

export async function registrarEvento(matricula, tipo) {
  await chamarAppsScript('registrarEvento', { matricula, tipo });
}

/** Envia um PDF (Buffer) para ser salvo na pasta do servidor no Drive,
 * nomeado pelo próprio Apps Script; devolve a URL do arquivo. */
export async function salvarPdfRecurso(nome, bufferPdf) {
  const base64 = bufferPdf.toString('base64');
  const { url } = await chamarAppsScript('salvarPdfRecurso', { nome, base64 });
  return url;
}

/** Envia o anexo do recurso (Buffer) para ser salvo, com o mesmo nome-base
 * do PDF do recurso (ver salvarAnexoRecurso_ no Apps Script); devolve a URL
 * do arquivo. */
export async function salvarAnexoRecurso(nome, bufferAnexo, nomeArquivoOriginal, tipoMime) {
  const base64 = bufferAnexo.toString('base64');
  const { url } = await chamarAppsScript('salvarAnexoRecurso', {
    nome,
    base64,
    nomeArquivo: nomeArquivoOriginal,
    tipo: tipoMime
  });
  return url;
}

/** Procura o PDF da resposta (Minuta de Voto) na pasta do servidor.
 * Devolve '' se a pasta/arquivo ainda não existir (chamador decide o
 * fallback) em vez de lançar erro — essa busca é "best effort". */
export async function obterLinkResposta(nome) {
  try {
    const { url } = await chamarAppsScript('obterLinkResposta', { nome });
    return url || '';
  } catch (err) {
    return '';
  }
}

export function normalizarCpf(valor) {
  return String(valor || '').replace(/\D/g, '').padStart(11, '0');
}

// Sem padding — para valores que não são CPF (ex: a senha de 4 dígitos),
// onde completar com zeros à esquerda mudaria o valor digitado.
export function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

export function matriculaKey(valor) {
  return String(valor || '').replace(/\D/g, '');
}
