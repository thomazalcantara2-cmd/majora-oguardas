import { JWT } from 'google-auth-library';

// Planilha "RECURSOS_-_PREENCHIDA_ajustada" como banco de dados. Colunas
// A-K já existem na planilha de origem; L-N são geridas por este app (ver
// scripts/inicializar-planilha.mjs).
const COLUNAS = [
  'CPF', // A
  'MATR.', // B
  'NOME', // C
  'CLASSE', // D
  'DATA 1º SOLICITAÇÃO', // E
  'DATA MANIFESTAÇÃO', // F
  'STATUS', // G
  'link do Requerimento', // H
  'link do Anexo', // I
  'link da minuta do voto', // J
  'Recurso', // K — link do PDF do recurso
  'Data_Recurso', // L
  'Tentativas_Falhas', // M
  'Bloqueado_Até' // N
];
const ULTIMA_COLUNA = 'N';
const PRIMEIRA_LINHA_DADOS = 2;
export const ABA_LOG = 'Log_Eventos';

let authClient = null;

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id) {
    throw new Error(
      'Configuração ausente: defina GOOGLE_SHEETS_SPREADSHEET_ID no projeto Vercel. Veja README.md.'
    );
  }
  return id;
}

function getAba() {
  const aba = process.env.GOOGLE_SHEETS_TAB_NAME;
  if (!aba) {
    throw new Error(
      'Configuração ausente: defina GOOGLE_SHEETS_TAB_NAME (o nome exato da aba na planilha) no projeto Vercel. Veja README.md.'
    );
  }
  return aba;
}

function getAuthClient() {
  if (authClient) return authClient;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const chave = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !chave) {
    throw new Error(
      'Configuração ausente: defina GOOGLE_SERVICE_ACCOUNT_EMAIL e GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY no projeto Vercel. Veja README.md.'
    );
  }
  authClient = new JWT({
    email,
    key: chave,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return authClient;
}

async function chamarSheetsApi(caminho, options = {}) {
  const auth = getAuthClient();
  const { token } = await auth.getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${getSpreadsheetId()}${caminho}`;
  const resposta = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Erro na Sheets API (${resposta.status}): ${corpo}`);
  }
  return resposta.json();
}

function aRange(a1) {
  return encodeURIComponent(`${getAba()}!${a1}`);
}

/** Lê todas as linhas de dados e devolve como objetos { CPF, 'MATR.', NOME, ... , _linha }. */
export async function lerLinhas() {
  const dados = await chamarSheetsApi(`/values/${aRange(`A${PRIMEIRA_LINHA_DADOS}:${ULTIMA_COLUNA}`)}`);
  const linhas = dados.values || [];
  return linhas.map((linha, indice) => {
    const cheia = COLUNAS.map((_, i) => (linha[i] !== undefined ? linha[i] : ''));
    const obj = { _linha: indice + PRIMEIRA_LINHA_DADOS };
    COLUNAS.forEach((nomeColuna, i) => {
      obj[nomeColuna] = cheia[i];
    });
    return obj;
  });
}

export async function lerLinha(numeroLinha) {
  const dados = await chamarSheetsApi(`/values/${aRange(`A${numeroLinha}:${ULTIMA_COLUNA}${numeroLinha}`)}`);
  const linha = (dados.values && dados.values[0]) || [];
  const obj = { _linha: numeroLinha };
  COLUNAS.forEach((nomeColuna, i) => {
    obj[nomeColuna] = linha[i] !== undefined ? linha[i] : '';
  });
  return obj;
}

/** Escreve valores em colunas específicas (por letra) de uma linha. valores = { M: '3', N: '' } */
export async function escreverCelulas(numeroLinha, valoresPorColuna) {
  const data = Object.entries(valoresPorColuna).map(([coluna, valor]) => ({
    range: `${getAba()}!${coluna}${numeroLinha}`,
    values: [[valor]]
  }));
  await chamarSheetsApi('/values:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data })
  });
}

export async function registrarEvento(matricula, tipo) {
  const caminho = `/values/${encodeURIComponent(`${ABA_LOG}!A:C`)}:append?valueInputOption=RAW`;
  await chamarSheetsApi(caminho, {
    method: 'POST',
    body: JSON.stringify({ values: [[new Date().toISOString(), matricula, tipo]] })
  });
}

// ===== Usadas só por scripts/inicializar-planilha.mjs =====

export async function obterMetadados() {
  return chamarSheetsApi('?fields=sheets.properties');
}

export async function criarAba(nomeAba, cabecalho) {
  await chamarSheetsApi(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: nomeAba } } }] })
  });
  await chamarSheetsApi(`/values/${encodeURIComponent(`${nomeAba}!A1`)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: [cabecalho] })
  });
}

export async function escreverCabecalhoPrincipal() {
  await chamarSheetsApi(`/values/${aRange(`A1:${ULTIMA_COLUNA}1`)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: [COLUNAS] })
  });
}

export async function lerCabecalhoPrincipal() {
  const dados = await chamarSheetsApi(`/values/${aRange(`A1:${ULTIMA_COLUNA}1`)}`);
  return (dados.values && dados.values[0]) || [];
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
