/**
 * Sistema de Confirmação de Dados Cadastrais de Servidores — Majoração de Jornada 40h
 *
 * Backend Google Apps Script (Web App) vinculado a uma Planilha Google.
 * Consulte README.md para estrutura das abas e passo a passo de implantação.
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
var COL_REGIONAL = 5;
var COL_REQUEREU_40H = 6;
var COL_DATA_REQUERIMENTO = 7;
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
var MENSAGEM_ERRO_GENERICA = 'Não foi possível confirmar sua identidade. Verifique o nome selecionado e a senha e tente novamente.';

var MIME_PERMITIDOS = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'
};

var CAMPOS_EDITAVEIS = {
  nome: { rotulo: 'Nome' },
  classe: { rotulo: 'Classe' },
  regional: { rotulo: 'Regional' },
  requereu40h: { rotulo: 'Requereu_40h' },
  dataRequerimento: { rotulo: 'Data_Requerimento' }
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
    'Matrícula', 'Nome', 'CPF', 'Classe', 'Regional', 'Requereu_40h',
    'Data_Requerimento', 'Status_Confirmação', 'Data_Confirmação',
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

// ===================== BUSCA (ETAPA 1) =====================

/**
 * Busca parcial por nome, sem diferenciar maiúsculas/acentos.
 * Retorna APENAS nome + dado de desambiguação (Classe/Regional) — nunca
 * matrícula, CPF ou qualquer outro dado sensível.
 */
function buscarServidores(termo) {
  var termoNorm = normalizarTexto(termo);
  if (termoNorm.length < 2) return [];

  var sheet = getSheet_(SHEET_CADASTRO);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var dados = sheet.getRange(2, 1, lastRow - 1, COL_REGIONAL).getValues();
  var resultados = [];

  for (var i = 0; i < dados.length; i++) {
    var nome = dados[i][COL_NOME - 1];
    if (!nome) continue;
    if (normalizarTexto(nome).indexOf(termoNorm) === -1) continue;

    resultados.push({
      id: i + 2, // número da linha na planilha (linha 1 = cabeçalho)
      nome: nome,
      info: [dados[i][COL_CLASSE - 1], dados[i][COL_REGIONAL - 1]].filter(String).join(' — ')
    });
    if (resultados.length >= 25) break;
  }

  return resultados;
}

// ===================== VALIDAÇÃO DE SENHA (ETAPA 2) =====================

/**
 * Valida a senha (últimos 4 dígitos do CPF) contra o registro identificado por "id"
 * (o número de linha retornado por buscarServidores — nunca a matrícula).
 * Em caso de sucesso, retorna um token de sessão de curta duração e os dados
 * (não sensíveis / mascarados) do servidor. Em caso de falha, retorna sempre
 * a mesma mensagem genérica, sem indicar se o problema foi o nome ou a senha.
 */
function validarSenha(id, senha) {
  var row = parseInt(id, 10);
  var sheet = getSheet_(SHEET_CADASTRO);
  if (!row || row < 2 || row > sheet.getLastRow()) {
    return { ok: false, message: MENSAGEM_ERRO_GENERICA };
  }

  var valores = sheet.getRange(row, 1, 1, COL_BLOQUEADO_ATE).getValues()[0];
  var matricula = valores[COL_MATRICULA - 1];
  var nome = valores[COL_NOME - 1];
  var cpf = valores[COL_CPF - 1];
  var classe = valores[COL_CLASSE - 1];
  var regional = valores[COL_REGIONAL - 1];
  var requereu40h = valores[COL_REQUEREU_40H - 1];
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
    return { ok: false, message: MENSAGEM_ERRO_GENERICA };
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
    return { ok: false, message: MENSAGEM_ERRO_GENERICA };
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
      classe: classe,
      regional: regional,
      requereu40h: requereu40h,
      dataRequerimento: formatarData_(dataRequerimento),
      status: status || 'Pendente',
      dataConfirmacao: dataConfirmacao ? formatarData_(dataConfirmacao) : ''
    }
  };
}

// ===================== CONFIRMAÇÃO / CORREÇÃO / REQUERIMENTO (ETAPAS 6-8) =====================

/**
 * payload = {
 *   acao: 'confirmar' | 'corrigir',
 *   camposEditados: { nome, classe, regional, requereu40h, dataRequerimento },
 *   requerimentoTexto: string,
 *   anexo: { base64, mimeType, filename } | null
 * }
 */
function registrarConfirmacao(token, payload) {
  var sessao = obterSessao_(token);
  if (!sessao) {
    return { ok: false, message: 'Sessão expirada. Refaça a busca pelo nome e a validação de senha.' };
  }

  payload = payload || {};
  var sheet = getSheet_(SHEET_CADASTRO);
  var row = sessao.row;
  var valores = sheet.getRange(row, 1, 1, COL_DATA_CONFIRMACAO).getValues()[0];
  var matricula = valores[COL_MATRICULA - 1];
  var nomeAtual = valores[COL_NOME - 1];

  var atual = {
    nome: valores[COL_NOME - 1],
    classe: valores[COL_CLASSE - 1],
    regional: valores[COL_REGIONAL - 1],
    requereu40h: valores[COL_REQUEREU_40H - 1],
    dataRequerimento: valores[COL_DATA_REQUERIMENTO - 1]
  };

  var agora = new Date();
  var acao = payload.acao === 'corrigir' ? 'corrigir' : 'confirmar';
  var logSheet = getSheet_(SHEET_LOG);
  var houveAlteracao = false;

  if (acao === 'corrigir') {
    var editados = payload.camposEditados || {};
    Object.keys(CAMPOS_EDITAVEIS).forEach(function (campo) {
      if (!(campo in editados)) return;
      var def = CAMPOS_EDITAVEIS[campo];
      var valorAnterior = atual[campo];
      var valorAnteriorStr = (valorAnterior instanceof Date ? formatarData_(valorAnterior) : String(valorAnterior || '')).trim();
      var valorNovoStr = String(editados[campo] || '').trim();

      if (valorNovoStr === '' || valorNovoStr === valorAnteriorStr) return;

      // Importante: NÃO sobrescreve a aba Cadastro. Apenas registra a proposta
      // de correção no Log_Alterações para checagem humana da SEGEP.
      logSheet.appendRow([agora, matricula, def.rotulo, valorAnteriorStr, valorNovoStr, 'Correção']);
      houveAlteracao = true;
    });

    if (houveAlteracao) {
      sheet.getRange(row, COL_STATUS_CONFIRMACAO).setValue('Corrigido — aguardando validação da SEGEP');
    }
  } else {
    logSheet.appendRow([agora, matricula, '(confirmação integral)', '', '', 'Confirmação']);
    sheet.getRange(row, COL_STATUS_CONFIRMACAO).setValue('Confirmado');
  }

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
    acao: acao,
    correcaoRegistrada: houveAlteracao,
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

function normalizarTexto(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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
