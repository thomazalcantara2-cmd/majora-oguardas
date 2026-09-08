/**
 * Ponte entre a planilha "RECURSOS_-_PREENCHIDA_ajustada" e a aplicação
 * Next.js (Vercel). Cole este arquivo no editor Apps Script vinculado à
 * planilha (Extensões → Apps Script). Veja README.md do repositório para o
 * passo a passo completo de implantação.
 *
 * A aplicação Next.js chama este Web App via POST para ler/escrever a
 * planilha — o Apps Script roda com as permissões de quem implantou o
 * script, então não é preciso compartilhar a planilha com mais ninguém
 * (nem criar conta de serviço no Google Cloud).
 */

var COLUNAS = [
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
  'Recurso', // K — link do PDF do recurso, escrito pelo app
  'Data_Recurso', // L — escrito pelo app
  'Tentativas_Falhas', // M — escrito pelo app
  'Bloqueado_Até' // N — escrito pelo app
];
var ABA_LOG = 'Log_Eventos';

// ===================== WEB APP ENTRY POINT =====================

function doGet(e) {
  return ContentService.createTextOutput(
    'Este endpoint só responde a POST (usado pela aplicação Next.js).'
  );
}

function doPost(e) {
  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return responderJson_({ ok: false, erro: 'Corpo da requisição não é um JSON válido.' });
  }

  var tokenEsperado = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!tokenEsperado) {
    return responderJson_({ ok: false, erro: 'Token não configurado no servidor. Rode definirToken() pelo editor.' });
  }
  if (payload.token !== tokenEsperado) {
    return responderJson_({ ok: false, erro: 'Não autorizado.' });
  }

  try {
    switch (payload.acao) {
      case 'lerLinhas':
        return responderJson_({ ok: true, linhas: lerLinhas_() });
      case 'lerLinha':
        return responderJson_({ ok: true, linha: lerLinha_(Number(payload.linha)) });
      case 'escreverCelulas':
        escreverCelulas_(Number(payload.linha), payload.valores || {});
        return responderJson_({ ok: true });
      case 'registrarEvento':
        registrarEvento_(payload.matricula, payload.tipo);
        return responderJson_({ ok: true });
      default:
        return responderJson_({ ok: false, erro: 'Ação desconhecida: ' + payload.acao });
    }
  } catch (err) {
    return responderJson_({ ok: false, erro: String(err) });
  }
}

function responderJson_(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}

// ===================== ACESSO À PLANILHA =====================

/** Encontra a aba de dados pelo cabeçalho (A1 = "CPF"), não pelo nome —
 * assim não importa como a aba se chama. */
function getAbaDados_() {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var abas = planilha.getSheets();
  for (var i = 0; i < abas.length; i++) {
    var cabecalho = String(abas[i].getRange(1, 1).getValue() || '').trim().toUpperCase();
    if (cabecalho === 'CPF') return abas[i];
  }
  throw new Error('Nenhuma aba encontrada com cabeçalho "CPF" na primeira coluna.');
}

function lerLinhas_() {
  var aba = getAbaDados_();
  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];
  var valores = aba.getRange(2, 1, ultimaLinha - 1, COLUNAS.length).getValues();
  var linhas = [];
  for (var i = 0; i < valores.length; i++) {
    var obj = { _linha: i + 2 };
    for (var c = 0; c < COLUNAS.length; c++) obj[COLUNAS[c]] = valores[i][c];
    linhas.push(obj);
  }
  return linhas;
}

function lerLinha_(numeroLinha) {
  if (!numeroLinha || numeroLinha < 2) throw new Error('Número de linha inválido.');
  var aba = getAbaDados_();
  var valores = aba.getRange(numeroLinha, 1, 1, COLUNAS.length).getValues()[0];
  var obj = { _linha: numeroLinha };
  for (var c = 0; c < COLUNAS.length; c++) obj[COLUNAS[c]] = valores[c];
  return obj;
}

function escreverCelulas_(numeroLinha, valoresPorColuna) {
  if (!numeroLinha || numeroLinha < 2) throw new Error('Número de linha inválido.');
  var aba = getAbaDados_();
  Object.keys(valoresPorColuna).forEach(function (nomeColuna) {
    var indice = COLUNAS.indexOf(nomeColuna);
    if (indice === -1) throw new Error('Coluna desconhecida: ' + nomeColuna);
    aba.getRange(numeroLinha, indice + 1).setValue(valoresPorColuna[nomeColuna]);
  });
}

function registrarEvento_(matricula, tipo) {
  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  var aba = planilha.getSheetByName(ABA_LOG);
  if (!aba) {
    aba = planilha.insertSheet(ABA_LOG);
    aba.appendRow(['Timestamp', 'Matrícula', 'Tipo']);
  }
  aba.appendRow([new Date(), matricula, tipo]);
}

// ===================== SETUP (rodar pelo editor, uma vez cada) =====================

/**
 * Garante as colunas de controle (L-N) na aba de dados e cria a aba
 * Log_Eventos, se ainda não existirem. Não mexe nas colunas A-K originais.
 * Rode pelo menu suspenso de funções → Executar. Idempotente.
 */
function inicializarPlanilha() {
  var aba = getAbaDados_();
  var extras = ['Recurso', 'Data_Recurso', 'Tentativas_Falhas', 'Bloqueado_Até'];
  var colunaInicial = COLUNAS.indexOf('Recurso') + 1; // K = 11

  for (var i = 0; i < extras.length; i++) {
    var coluna = colunaInicial + i;
    var atual = String(aba.getRange(1, coluna).getValue() || '').trim();
    if (atual !== extras[i]) {
      aba.getRange(1, coluna).setValue(extras[i]);
    }
  }

  var planilha = SpreadsheetApp.getActiveSpreadsheet();
  if (!planilha.getSheetByName(ABA_LOG)) {
    var logAba = planilha.insertSheet(ABA_LOG);
    logAba.appendRow(['Timestamp', 'Matrícula', 'Tipo']);
  }

  SpreadsheetApp.getUi().alert('Planilha pronta: colunas de controle e aba Log_Eventos conferidas/criadas.');
}

/**
 * Gera e salva o token secreto que a aplicação Next.js vai usar para
 * autenticar as chamadas a este Web App. Rode pelo editor uma vez, depois
 * copie o valor mostrado (Ver → Registros de execução) para a variável de
 * ambiente APPS_SCRIPT_TOKEN no Vercel. Rodar de novo troca o token (e
 * invalida o anterior).
 */
function definirToken() {
  var token = Utilities.getUuid() + '-' + Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', token);
  Logger.log('Token gerado (copie este valor): ' + token);
  SpreadsheetApp.getUi().alert('Token gerado. Abra "Ver → Registros de execução" para copiar o valor.');
}
