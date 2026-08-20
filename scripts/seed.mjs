// Importa a lista de servidores (Ordem, CPF, MATR., NOME, CLASSE, DATA) para
// o banco Postgres. Rode uma vez por CSV atualizado:
//
//   DATABASE_URL="postgres://..." node scripts/seed.mjs caminho/para/lista.csv
//
// Idempotente: roda de novo sem duplicar (upsert por matrícula). Se o CPF
// vier vazio numa linha, um CPF já cadastrado antes para aquela matrícula
// NÃO é apagado.

import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { neon } from '@neondatabase/serverless';

const caminhoCsv = process.argv[2];
if (!caminhoCsv) {
  console.error('Uso: node scripts/seed.mjs caminho/para/lista.csv');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('Defina DATABASE_URL (ou POSTGRES_URL) antes de rodar este script.');
  process.exit(1);
}

const sql = neon(connectionString);

function normalizarCpf(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  return digitos.length === 11 ? digitos : null;
}

function normalizarChave(nome) {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Aceita "12/03/2024", "12/03/2024 14:30" ou "12/03/2024 14:30:00" (formato
// brasileiro dd/MM/yyyy) e monta o Date explicitamente por partes — nunca via
// `new Date(string)`, que pode reinterpretar dd/MM como MM/dd.
function parseDataBR(valor) {
  const texto = String(valor || '').trim();
  const m = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, dia, mes, ano, hora = '00', minuto = '00', segundo = '00'] = m;
  const data = new Date(
    Number(ano),
    Number(mes) - 1,
    Number(dia),
    Number(hora),
    Number(minuto),
    Number(segundo)
  );
  return Number.isNaN(data.getTime()) ? null : data;
}

function acharColuna(registro, candidatos) {
  const chaves = Object.keys(registro);
  for (const candidato of candidatos) {
    const alvo = normalizarChave(candidato);
    const chave = chaves.find((k) => normalizarChave(k) === alvo);
    if (chave) return registro[chave];
  }
  return '';
}

async function main() {
  const conteudo = readFileSync(caminhoCsv, 'utf8');
  const registros = parse(conteudo, { columns: true, skip_empty_lines: true, trim: true, bom: true });

  let inseridos = 0;
  let semData = 0;

  for (const registro of registros) {
    const matricula = String(acharColuna(registro, ['MATR.', 'MATR', 'Matrícula', 'Matricula'])).trim();
    const nome = String(acharColuna(registro, ['NOME', 'Nome'])).trim();
    if (!matricula || !nome) {
      console.warn('Linha ignorada (sem matrícula ou nome):', registro);
      continue;
    }

    const cpf = normalizarCpf(acharColuna(registro, ['CPF']));
    const classe = String(acharColuna(registro, ['CLASSE', 'Classe'])).trim() || null;
    const ordem = String(acharColuna(registro, ['Ordem', 'ORDEM'])).trim() || null;
    const dataTexto = acharColuna(registro, ['DATA', 'Data']);
    const dataRequerimento = parseDataBR(dataTexto);
    if (dataTexto && !dataRequerimento) semData += 1;

    await sql`
      insert into servidores (matricula, nome, cpf, classe, ordem, data_requerimento, status)
      values (${matricula}, ${nome}, ${cpf}, ${classe}, ${ordem}, ${dataRequerimento}, 'Pendente')
      on conflict (matricula) do update
      set nome = excluded.nome,
          cpf = coalesce(excluded.cpf, servidores.cpf),
          classe = excluded.classe,
          ordem = excluded.ordem,
          data_requerimento = excluded.data_requerimento
    `;
    inseridos += 1;
  }

  console.log(`Pronto: ${inseridos} linha(s) importada(s)/atualizada(s).`);
  if (semData > 0) {
    console.warn(`Atenção: ${semData} linha(s) com DATA em formato não reconhecido (esperado dd/MM/yyyy [HH:mm[:ss]]) — data_requerimento ficou em branco para elas.`);
  }
}

main().catch((err) => {
  console.error('Erro ao importar:', err);
  process.exit(1);
});
