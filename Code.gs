/**
 * Sistema de Confirmação de Dados Cadastrais de Servidores — Majoração de Jornada 40h
 *
 * Backend Google Apps Script (Web App) vinculado a uma Planilha Google.
 * Consulte README.md para estrutura das abas e passo a passo de implantação.
 *
 * Fluxo de identificação: o servidor digita o próprio CPF completo, o sistema
 * localiza o registro e revela o nome correspondente; em seguida o servidor
 * digita a senha (últimos 4 dígitos do CPF) para confirmar identidade antes
 * de ver qualquer outro dado.
 */

// ===================== CONFIGURAÇÃO =====================

var SHEET_CADASTRO = 'Cadastro';
var SHEET_LOG = 'Log_Alterações';
var SHEET_REQUERIMENTOS = 'Requerimentos';

// Colunas da aba Cadastro (1-based)
var COL_MATRICULA = 1;
var COL_NOME = 2;
var COL_CPF = 3;
var COL_CLASSE = 4;
var COL_ORDEM = 5;
var COL_DATA_REQUERIMENTO = 6;
var COL_REQUEREU_40H = 7;
var COL_STATUS_CONFIRMACAO = 8;
var COL_DATA_CONFIRMACAO = 9;
// Colunas de controle do sistema (não fazem parte da lista original, usadas para
// limitar tentativas de senha — ver README.md, seção "Colunas de controle").
var COL_TENTATIVAS_FALHAS = 10;
var COL_BLOQUEADO_ATE = 11;

var MAX_TENTATIVAS = 5;
var BLOQUEIO_MINUTOS = 15;
var SESSAO_TTL_SEGUNDOS = 15 * 60; // duração do token de sessão pós-senha válida
var MAX_ANEXO_BYTES = 10 * 1024 * 1024; // 10MB
var MENSAGEM_ERRO_SENHA = 'Não foi possível confirmar sua identidade. Verifique a senha e tente novamente.';
var MENSAGEM_ERRO_CPF = 'Não encontramos esse CPF na base de servidores que requereram a majoração. Verifique os números digitados.';

// Mitigação simples (não é um rate-limit robusto, ver README.md — Apps Script
// não expõe IP do cliente) contra tentativas automatizadas de descobrir nomes
// testando CPFs em sequência: limita o total de consultas por CPF, somando
// todos os usuários, dentro de uma janela curta.
var LIMITE_GLOBAL_JANELA_SEGUNDOS = 60;
var LIMITE_GLOBAL_MAX_CONSULTAS = 40;

var MIME_PERMITIDOS = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'
};


// ===================== WEB APP ENTRY POINTS =====================

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Confirmação de Dados Cadastrais — Majoração de Jornada')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// O app usa google.script.run (canal RPC do HtmlService) para toda a comunicação
// cliente-servidor, não requisições HTTP diretas. doPost existe apenas como
// fallback caso algo faça POST na URL do Web App diretamente.
function doPost(e) {
  return doGet(e);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ===================== INICIALIZAÇÃO DA PLANILHA =====================

/**
 * Execute manualmente uma vez pelo editor do Apps Script (menu "Executar")
 * para criar as abas de controle e garantir os cabeçalhos corretos.
 * Não apaga dados já existentes na aba Cadastro.
 */
function inicializarPlanilha() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var cadastro = ss.getSheetByName(SHEET_CADASTRO);
  if (!cadastro) {
    throw new Error('Aba "Cadastro" não encontrada. Crie-a e importe os dados antes de rodar esta função.');
  }
  var cabecalhoCadastro = [
    'Matrícula', 'Nome', 'CPF', 'Classe', 'Ordem', 'Data_Requerimento',
    'Requereu_40h', 'Status_Confirmação', 'Data_Confirmação',
    'Tentativas_Falhas', 'Bloqueado_Até'
  ];
  cadastro.getRange(1, 1, 1, cabecalhoCadastro.length).setValues([cabecalhoCadastro]);
  cadastro.setFrozenRows(1);

  var log = ss.getSheetByName(SHEET_LOG) || ss.insertSheet(SHEET_LOG);
  log.getRange(1, 1, 1, 6).setValues([[
    'Timestamp', 'Matrícula', 'Campo_Alterado', 'Valor_Anterior', 'Valor_Novo', 'Tipo'
  ]]);
  log.setFrozenRows(1);

  var req = ss.getSheetByName(SHEET_REQUERIMENTOS) || ss.insertSheet(SHEET_REQUERIMENTOS);
  req.getRange(1, 1, 1, 6).setValues([[
    'Timestamp', 'Matrícula', 'Nome', 'Texto_Requerimento', 'Link_Anexo', 'Status_Análise'
  ]]);
  req.setFrozenRows(1);

  SpreadsheetApp.getUi().alert('Planilha inicializada com sucesso.');
}

/**
 * A lista de origem (Ordem, CPF, MATR., NOME, CLASSE, DATA) não traz uma
 * coluna "Requereu_40h" porque toda a lista, por definição, é composta por
 * quem já requereu a majoração. Execute manualmente uma vez, depois de colar
 * os dados na aba Cadastro, para preencher "Sim" em todas as linhas em que
 * essa coluna estiver vazia.
 */
function preencherRequereu40hSeVazio() {
  var sheet = getSheet_(SHEET_CADASTRO);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var range = sheet.getRange(2, COL_REQUEREU_40H, lastRow - 1, 1);
  var valores = range.getValues();
  var alterou = false;
  for (var i = 0; i < valores.length; i++) {
    if (!valores[i][0]) {
      valores[i][0] = 'Sim';
      alterou = true;
    }
  }
  if (alterou) range.setValues(valores);
  SpreadsheetApp.getUi().alert('Coluna Requereu_40h preenchida com "Sim" onde estava vazia.');
}

// ===================== IDENTIFICAÇÃO POR CPF (ETAPA 1) =====================

/**
 * Localiza o servidor pelo CPF completo e revela apenas o nome correspondente
 * — nenhum outro dado (matrícula, classe, status etc.) é retornado nesta
 * etapa. A senha (últimos 4 dígitos) ainda é exigida no passo seguinte antes
 * de exibir o restante dos dados.
 */
function buscarPorCpf(cpf) {
  var cpfDigitos = String(cpf || '').replace(/\D/g, '');
  if (cpfDigitos.length !== 11) {
    return { ok: false, message: MENSAGEM_ERRO_CPF };
  }

  if (!consultaDentroDoLimiteGlobal_()) {
    return { ok: false, message: 'Muitas consultas em um curto intervalo. Aguarde um momento e tente novamente.' };
  }

  var sheet = getSheet_(SHEET_CADASTRO);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: false, message: MENSAGEM_ERRO_CPF };

  var dados = sheet.getRange(2, 1, lastRow - 1, COL_CPF).getValues();

  for (var i = 0; i < dados.length; i++) {
    var cpfCelula = String(dados[i][COL_CPF - 1] || '').replace(/\D/g, '');
    if (!cpfCelula || cpfCelula !== cpfDigitos) continue;

    var row = i + 2;
    var bloqueadoAte = sheet.getRange(row, COL_BLOQUEADO_ATE).getValue();
    if (bloqueadoAte && new Date(bloqueadoAte).getTime() > Date.now()) {
      return { ok: false, message: 'Muitas tentativas incorretas. Tente novamente mais tarde.' };
    }

    return { ok: true, id: row, nome: dados[i][COL_NOME - 1] };
  }

  return { ok: false, message: MENSAGEM_ERRO_CPF };
}

function consultaDentroDoLimiteGlobal_() {
  var cache = CacheService.getScriptCache();
  var chave = 'cpf_lookup_global';
  var atual = Number(cache.get(chave)) || 0;
  if (atual >= LIMITE_GLOBAL_MAX_CONSULTAS) return false;
  cache.put(chave, String(atual + 1), LIMITE_GLOBAL_JANELA_SEGUNDOS);
  return true;
}

// ===================== VALIDAÇÃO DE SENHA (ETAPA 2) =====================

/**
 * Valida a senha (últimos 4 dígitos do CPF) contra o registro identificado por
 * "id" (o número de linha retornado por buscarPorCpf). Em caso de sucesso,
 * retorna um token de sessão de curta duração e os dados (não sensíveis /
 * mascarados) do servidor. Em caso de falha, retorna sempre a mesma mensagem
 * genérica.
 */
function validarSenha(id, senha) {
  var row = parseInt(id, 10);
  var sheet = getSheet_(SHEET_CADASTRO);
  if (!row || row < 2 || row > sheet.getLastRow()) {
    return { ok: false, message: MENSAGEM_ERRO_SENHA };
  }

  var valores = sheet.getRange(row, 1, 1, COL_BLOQUEADO_ATE).getValues()[0];
  var matricula = valores[COL_MATRICULA - 1];
  var nome = valores[COL_NOME - 1];
  var cpf = valores[COL_CPF - 1];
  var ordem = valores[COL_ORDEM - 1];
  var dataRequerimento = valores[COL_DATA_REQUERIMENTO - 1];
  var status = valores[COL_STATUS_CONFIRMACAO - 1];
  var dataConfirmacao = valores[COL_DATA_CONFIRMACAO - 1];
  var tentativas = Number(valores[COL_TENTATIVAS_FALHAS - 1]) || 0;
  var bloqueadoAte = valores[COL_BLOQUEADO_ATE - 1];

  var agora = new Date();
  if (bloqueadoAte && new Date(bloqueadoAte).getTime() > agora.getTime()) {
    return { ok: false, message: 'Muitas tentativas incorretas. Tente novamente mais tarde.' };
  }

  if (!matricula) {
    return { ok: false, message: MENSAGEM_ERRO_SENHA };
  }

  var cpfDigitos = String(cpf).replace(/\D/g, '');
  var ultimos4 = cpfDigitos.slice(-4);
  var senhaDigitos = String(senha || '').replace(/\D/g, '');

  if (!cpfDigitos || senhaDigitos.length !== 4 || senhaDigitos !== ultimos4) {
    tentativas += 1;
    if (tentativas >= MAX_TENTATIVAS) {
      var bloqueio = new Date(agora.getTime() + BLOQUEIO_MINUTOS * 60000);
      sheet.getRange(row, COL_TENTATIVAS_FALHAS).setValue(tentativas);
      sheet.getRange(row, COL_BLOQUEADO_ATE).setValue(bloqueio);
      return { ok: false, message: 'Muitas tentativas incorretas. Acesso bloqueado temporariamente.' };
    }
    sheet.getRange(row, COL_TENTATIVAS_FALHAS).setValue(tentativas);
    return { ok: false, message: MENSAGEM_ERRO_SENHA };
  }

  // Sucesso: zera contador de tentativas e bloqueio
  sheet.getRange(row, COL_TENTATIVAS_FALHAS, 1, 2).setValues([[0, '']]);

  var token = Utilities.getUuid();
  CacheService.getScriptCache().put(
    'sess_' + token,
    JSON.stringify({ row: row, matricula: matricula }),
    SESSAO_TTL_SEGUNDOS
  );

  return {
    ok: true,
    token: token,
    dados: {
      matricula: matricula,
      nome: nome,
      cpfMascarado: 'XXX.XXX.XXX-**',
      ordem: ordem,
      dataRequerimento: formatarData_(dataRequerimento, true),
      status: status || 'Pendente',
      dataConfirmacao: dataConfirmacao ? formatarData_(dataConfirmacao) : ''
    }
  };
}

// ===================== CONFIRMAÇÃO / REQUERIMENTO (ETAPAS 6-8) =====================

/**
 * Todos os dados exibidos (Matrícula, Nome, CPF, Ordem, Data/hora do
 * requerimento) são somente leitura — não há mais correção de campo pelo
 * autoatendimento. Se algo estiver errado, o servidor descreve no
 * Requerimento (texto/anexo); a correção em si é feita manualmente pela
 * SEGEP na aba Cadastro.
 *
 * payload = {
 *   requerimentoTexto: string,
 *   anexo: { base64, mimeType, filename } | null
 * }
 */
function registrarConfirmacao(token, payload) {
  var sessao = obterSessao_(token);
  if (!sessao) {
    return { ok: false, message: 'Sessão expirada. Refaça a identificação por CPF e a validação de senha.' };
  }

  payload = payload || {};
  var sheet = getSheet_(SHEET_CADASTRO);
  var row = sessao.row;
  var valores = sheet.getRange(row, 1, 1, COL_DATA_CONFIRMACAO).getValues()[0];
  var matricula = valores[COL_MATRICULA - 1];
  var nomeAtual = valores[COL_NOME - 1];

  var agora = new Date();
  var logSheet = getSheet_(SHEET_LOG);
  logSheet.appendRow([agora, matricula, '(confirmação integral)', '', '', 'Confirmação']);
  sheet.getRange(row, COL_STATUS_CONFIRMACAO).setValue('Confirmado');
  sheet.getRange(row, COL_DATA_CONFIRMACAO).setValue(agora);

  var requerimentoRecebido = false;
  var texto = String(payload.requerimentoTexto || '').trim();
  var anexo = payload.anexo;

  if (texto || (anexo && anexo.base64)) {
    var linkAnexo = '';
    if (anexo && anexo.base64) {
      linkAnexo = salvarAnexo_(anexo, matricula);
    }
    getSheet_(SHEET_REQUERIMENTOS).appendRow([agora, matricula, nomeAtual, texto, linkAnexo, 'Pendente']);
    requerimentoRecebido = true;
  }

  CacheService.getScriptCache().remove('sess_' + token);

  return {
    ok: true,
    timestamp: formatarData_(agora, true),
    requerimentoRecebido: requerimentoRecebido
  };
}

// ===================== ANEXOS =====================

function salvarAnexo_(anexo, matricula) {
  if (!anexo.mimeType || !MIME_PERMITIDOS[anexo.mimeType]) {
    throw new Error('Tipo de arquivo não permitido. Envie PDF, JPG, PNG ou DOCX.');
  }

  var bytes = Utilities.base64Decode(anexo.base64);
  if (bytes.length > MAX_ANEXO_BYTES) {
    throw new Error('Arquivo excede o tamanho máximo permitido (10MB).');
  }

  var folderId = getPastaAnexosId_();
  var folder = DriveApp.getFolderById(folderId);
  var nomeSanitizado = sanitizarNomeArquivo_(anexo.filename || ('anexo' + MIME_PERMITIDOS[anexo.mimeType]));
  var blob = Utilities.newBlob(bytes, anexo.mimeType, nomeSanitizado);

  var nomeFinal = matricula + '_' + Utilities.formatDate(new Date(), getFusoHorario_(), 'yyyyMMdd_HHmmss') + '_' + nomeSanitizado;
  var file = folder.createFile(blob);
  file.setName(nomeFinal);

  return file.getUrl();
}

function sanitizarNomeArquivo_(nome) {
  return String(nome).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
}

function getPastaAnexosId_() {
  var id = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID');
  if (!id) {
    throw new Error('Configuração ausente: defina a propriedade de script DRIVE_FOLDER_ID com o ID da pasta do Drive para anexos (veja README.md).');
  }
  return id;
}

// ===================== HELPERS =====================

function getSheet_(nome) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!sheet) {
    throw new Error('Aba "' + nome + '" não encontrada. Rode inicializarPlanilha() primeiro.');
  }
  return sheet;
}

function obterSessao_(token) {
  if (!token) return null;
  var raw = CacheService.getScriptCache().get('sess_' + token);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function getFusoHorario_() {
  return Session.getScriptTimeZone() || 'America/Recife';
}

function formatarData_(valor, comHora) {
  if (!valor) return '';
  // Só reformata objetos Date reais (célula formatada como data no Sheets).
  // Uma string já digitada (ex: "12/03/2024") é devolvida como está, para não
  // arriscar reinterpretar dd/MM/yyyy como MM/dd/yyyy ao reconstruir um Date.
  if (!(valor instanceof Date)) return String(valor);
  var padrao = comHora ? 'dd/MM/yyyy HH:mm:ss' : 'dd/MM/yyyy';
  return Utilities.formatDate(valor, getFusoHorario_(), padrao);
}
