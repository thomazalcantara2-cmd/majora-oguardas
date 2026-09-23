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
 *
 * Nesta fase o app só consulta: CPF + senha (últimos 4 dígitos do CPF) dão
 * acesso à resposta da SEGEP ao recurso apresentado, para os poucos
 * servidores que enviaram um. Não há mais geração de PDF nem upload de
 * arquivo pelo app — quem coloca a resposta na pasta do servidor é a
 * própria SEGEP, manualmente.
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
  'Recurso', // K — histórico: link do recurso apresentado (fase anterior)
  'Data_Recurso', // L — histórico: data/hora do recurso apresentado
  'Tentativas_Falhas', // M — escrito pelo app (controle de tentativas de senha)
  'Bloqueado_Até', // N — escrito pelo app (bloqueio temporário)
  'Anexo_Recurso' // O — histórico: link do anexo do recurso apresentado
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
      case 'obterLinkRespostaRecurso':
        return responderJson_({ ok: true, url: obterLinkRespostaRecurso_(payload.nome) });
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

// ===================== ARQUIVOS (PASTA DE CADA SERVIDOR) =====================

/**
 * A pasta-mãe onde ficam as subpastas de cada servidor (mesma pasta onde
 * está a planilha) — ex: ".../MANIFESTAÇÕES - SERVIDORES/JOSUEL GONZAGA DOS
 * SANTOS/". Cada servidor já tem sua própria subpasta, com o nome exatamente
 * igual ao da coluna NOME.
 */
function getPastaMae_() {
  var arquivoDaPlanilha = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
  var pais = arquivoDaPlanilha.getParents();
  return pais.hasNext() ? pais.next() : DriveApp.getRootFolder();
}

function getPastaServidor_(nome) {
  var subpastas = getPastaMae_().getFoldersByName(nome);
  if (!subpastas.hasNext()) {
    throw new Error('Não encontrei a pasta do servidor "' + nome + '" (o nome da subpasta precisa ser idêntico ao da coluna NOME).');
  }
  return subpastas.next();
}

/** Acha, dentro de uma pasta, o PDF mais recente cujo nome contém um termo
 * (sem diferenciar maiúsculas/minúsculas). Devolve null se não achar. */
function localizarPdfNaPasta_(pasta, termo) {
  var termoNormalizado = termo.toUpperCase();
  var arquivos = pasta.getFilesByType(MimeType.PDF);
  var maisRecente = null;
  while (arquivos.hasNext()) {
    var arquivo = arquivos.next();
    if (arquivo.getName().toUpperCase().indexOf(termoNormalizado) !== -1) {
      if (!maisRecente || arquivo.getLastUpdated() > maisRecente.getLastUpdated()) {
        maisRecente = arquivo;
      }
    }
  }
  return maisRecente;
}

/**
 * Procura, na pasta do servidor, o PDF com a resposta da SEGEP ao recurso
 * apresentado — a SEGEP coloca esse arquivo manualmente na pasta do
 * servidor, com "RESPOSTA" em algum lugar do nome (ex:
 * "RESPOSTA_RECURSO_NOME_DO_SERVIDOR.pdf"). Devolve '' se ainda não
 * existir (o app mostra "ainda não disponível" nesse caso).
 */
function obterLinkRespostaRecurso_(nome) {
  var pasta = getPastaServidor_(nome);
  var arquivo = localizarPdfNaPasta_(pasta, 'RESPOSTA');
  if (!arquivo) return '';
  arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return arquivo.getUrl();
}

// ===================== SETUP (rodar pelo editor, uma vez cada) =====================

/**
 * Garante as colunas de controle (L-O) na aba de dados e cria a aba
 * Log_Eventos, se ainda não existirem. Não mexe nas colunas A-K originais.
 * Rode pelo menu suspenso de funções → Executar. Idempotente.
 */
function inicializarPlanilha() {
  var aba = getAbaDados_();
  var extras = ['Recurso', 'Data_Recurso', 'Tentativas_Falhas', 'Bloqueado_Até', 'Anexo_Recurso'];
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
