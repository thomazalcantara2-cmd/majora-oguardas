// Camada de acesso a dados — hoje a "base de dados" é a própria Planilha
// Google (ver lib/sheets.js), não um banco relacional. Este arquivo existe
// para as rotas de API não precisarem conhecer os detalhes da Sheets API.
import {
  lerLinhas,
  lerLinha,
  escreverCelulas,
  registrarEvento,
  obterLinkRespostaRecurso as obterLinkRespostaRecursoNoDrive,
  obterLinkRecursoApresentado as obterLinkRecursoApresentadoNoDrive,
  normalizarCpf,
  somenteDigitos,
  matriculaKey
} from './sheets';

export { normalizarCpf, somenteDigitos };

export const MAX_TENTATIVAS = 5;
export const BLOQUEIO_MINUTOS = 15;

// Nesta fase, só os servidores que apresentaram recurso têm acesso — a
// consulta é apenas à resposta da SEGEP a esse recurso. A lista é o nome
// exatamente como está na coluna NOME da planilha (maiúsculas, sem acento
// alterado — comparação normaliza para maiúsculas e remove espaços nas
// pontas, então pequenas diferenças de espaçamento não quebram o acesso).
const SERVIDORES_COM_ACESSO = [
  'REINALDO BURGOS JUNIOR',
  'ROSA MARIA FERREIRA DO NASCIMENTO',
  'JAILSON RODRIGUES DA SILVA',
  'NATAN DA SILVA DE SANTANA JUNIOR',
  'MARIA JUSELY DOS SANTOS',
  'AGENILDA MERENCIO RAMOS NASCIMENTO',
  'RONALDO FRANCISCO DA SILVA'
];

function temAcesso_(nome) {
  return SERVIDORES_COM_ACESSO.indexOf(String(nome || '').trim().toUpperCase()) !== -1;
}

/**
 * Localiza o servidor pelo CPF completo — só entre os que têm acesso nesta
 * fase (ver SERVIDORES_COM_ACESSO). Retorna apenas { id, nome } — nenhum
 * outro dado (matrícula, classe, status etc.) sai daqui. "id" é o número
 * da linha na planilha; sozinho, não expõe informação pessoal.
 */
export async function buscarServidorPorCpf(cpfDigitos) {
  const linhas = await lerLinhas();
  const alvo = linhas.find((l) => normalizarCpf(l.CPF) === cpfDigitos);
  if (!alvo || !alvo.NOME || !temAcesso_(alvo.NOME)) return null;
  return { id: alvo._linha, nome: alvo.NOME, bloqueado_ate: alvo['Bloqueado_Até'] || null };
}

export async function obterServidorPorId(id) {
  const numeroLinha = Number(id);
  if (!numeroLinha || numeroLinha < 2) return null;
  const linha = await lerLinha(numeroLinha);
  if (!linha.NOME || !temAcesso_(linha.NOME)) return null;
  return {
    id: linha._linha,
    matricula_key: matriculaKey(linha['MATR.']),
    matricula: linha['MATR.'],
    nome: linha.NOME,
    cpf: linha.CPF,
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
  await registrarEvento(matricula, 'Acesso à resposta do recurso');
}

/**
 * Link do PDF com a resposta da SEGEP ao recurso apresentado, buscado na
 * pasta do próprio servidor no Drive. Devolve '' se a SEGEP ainda não
 * colocou o arquivo lá — o app mostra "ainda não disponível" nesse caso.
 */
export async function obterLinkRespostaRecurso(nome) {
  return obterLinkRespostaRecursoNoDrive(nome);
}

/**
 * Link do PDF do recurso que o próprio servidor apresentou, buscado na
 * mesma pasta. Se o servidor mandou mais de um, o Apps Script já devolve
 * só o mais recente. Devolve '' se não existir.
 */
export async function obterLinkRecursoApresentado(nome) {
  return obterLinkRecursoApresentadoNoDrive(nome);
}
