// Prepara a planilha para o app: garante o cabeçalho das colunas L-N
// (Data_Recurso, Tentativas_Falhas, Bloqueado_Até) na aba principal e cria a
// aba "Log_Eventos", se ainda não existirem. Rode uma vez, com as mesmas
// variáveis de ambiente do app:
//
//   GOOGLE_SHEETS_SPREADSHEET_ID=... \
//   GOOGLE_SHEETS_TAB_NAME=... \
//   GOOGLE_SERVICE_ACCOUNT_EMAIL=... \
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=... \
//   node scripts/inicializar-planilha.mjs
//
// Idempotente — pode rodar de novo sem duplicar nada.

import {
  obterMetadados,
  criarAba,
  escreverCabecalhoPrincipal,
  lerCabecalhoPrincipal,
  ABA_LOG
} from '../lib/sheets.js';

async function main() {
  const cabecalhoAtual = await lerCabecalhoPrincipal();
  if (cabecalhoAtual.length < 14 || !cabecalhoAtual[10] || cabecalhoAtual[10] !== 'Recurso') {
    console.log('Cabeçalho da aba principal incompleto ou inesperado — escrevendo cabeçalho completo (A-N).');
    await escreverCabecalhoPrincipal();
  } else {
    console.log('Cabeçalho da aba principal já está OK.');
  }

  const metadados = await obterMetadados();
  const abas = (metadados.sheets || []).map((s) => s.properties.title);
  if (abas.includes(ABA_LOG)) {
    console.log(`Aba "${ABA_LOG}" já existe.`);
  } else {
    console.log(`Criando aba "${ABA_LOG}"...`);
    await criarAba(ABA_LOG, ['Timestamp', 'Matrícula', 'Tipo']);
  }

  console.log('Planilha pronta.');
}

main().catch((err) => {
  console.error('Erro ao inicializar a planilha:', err);
  process.exit(1);
});
