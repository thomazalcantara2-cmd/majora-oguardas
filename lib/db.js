// Camada de acesso a dados — hoje a "base de dados" é a própria Planilha
// Google (ver lib/sheets.js), não um banco relacional. Este arquivo existe
// para as rotas de API não precisarem conhecer os detalhes da Sheets API.
import {
  lerLinhas,
  lerLinha,
  escreverCelulas,
  registrarEvento,
  normalizarCpf,
  somenteDigitos,
  matriculaKey
} from './sheets';

export { normalizarCpf, somenteDigitos };

export const MAX_TENTATIVAS = 5;
export const BLOQUEIO_MINUTOS = 15;

function formatarStatus(valor) {
  const v = String(valor || '').trim().toUpperCase();
  if (v === 'DEFERIDO') return 'Deferido';
  if (v === 'INDEFERIDO') return 'Indeferido';
  return String(valor || '').trim();
}

/**
 * Localiza o servidor pelo CPF completo. Retorna apenas { id, nome } —
 * nenhum outro dado (matrícula, classe, status etc.) sai daqui. "id" é o
 * número da linha na planilha; sozinho, não expõe informação pessoal.
 */
export async function buscarServidorPorCpf(cpfDigitos) {
  const linhas = await lerLinhas();
  const alvo = linhas.find((l) => normalizarCpf(l.CPF) === cpfDigitos);
  if (!alvo || !alvo.NOME) return null;
  return { id: alvo._linha, nome: alvo.NOME, bloqueado_ate: alvo['Bloqueado_Até'] || null };
}

export async function obterServidorPorId(id) {
  const numeroLinha = Number(id);
  if (!numeroLinha || numeroLinha < 2) return null;
  const linha = await lerLinha(numeroLinha);
  if (!linha.NOME) return null;
  return {
    id: linha._linha,
    matricula_key: matriculaKey(linha['MATR.']),
    matricula: linha['MATR.'],
    nome: linha.NOME,
    cpf: linha.CPF,
    classe: linha.CLASSE,
    status: formatarStatus(linha.STATUS),
    recurso_pdf_url: linha.Recurso || '',
    data_recurso: linha.Data_Recurso || '',
    tentativas_falhas: Number(linha.Tentativas_Falhas) || 0,
    bloqueado_ate: linha['Bloqueado_Até'] || null
  };
}

export async function registrarTentativaFalha(id, tentativas) {
  if (tentativas >= MAX_TENTATIVAS) {
    const bloqueio = new Date(Date.now() + BLOQUEIO_MINUTOS * 60000).toISOString();
    await escreverCelulas(id, { Tentativas_Falhas: tentativas, 'Bloqueado_Até': bloqueio });
  } else {
    await escreverCelulas(id, { Tentativas_Falhas: tentativas });
  }
}

export async function zerarTentativas(id) {
  await escreverCelulas(id, { Tentativas_Falhas: 0, 'Bloqueado_Até': '' });
}

export async function registrarAcessoResposta(matricula) {
  await registrarEvento(matricula, 'Acesso à resposta');
}

export async function registrarRecurso({ id, matricula, pdfUrl }) {
  await escreverCelulas(id, { Recurso: pdfUrl, Data_Recurso: new Date().toISOString() });
  await registrarEvento(matricula, 'Recurso apresentado');
}
