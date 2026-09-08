// Importa os 30 servidores da planilha "RECURSOS_-_PREENCHIDA_ajustada" para
// o Postgres. Roda uma vez (idempotente — upsert por matrícula):
//
//   DATABASE_URL="postgres://..." node scripts/seed.mjs
//
// Os dados abaixo (CPF, matrícula, nome, classe, status) foram extraídos
// diretamente da planilha de origem. Se a planilha mudar (novo status, nome
// corrigido etc.), atualize a lista SERVIDORES abaixo e rode de novo.

import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('Defina DATABASE_URL (ou POSTGRES_URL) antes de rodar este script.');
  process.exit(1);
}

const sql = neon(connectionString);

// [cpfBruto, matricula, nome, classe, status]
const SERVIDORES = [
  ['3807844406', '0.0195308.1', 'JOSUEL GONZAGA DOS SANTOS', 'GM II', 'Indeferido'],
  ['2960690435', '0.0195464.1', 'REINALDO BURGOS JUNIOR', 'GM II', 'Indeferido'],
  ['46456791472', '0.089613.1', 'DIJAI EDUARDO DO ESPIRITO SANTO', 'SUBINSPETOR', 'Indeferido'],
  ['5230006420', '0.0195154.1', 'WANDERSON PONTES DE OLIVEIRA', 'GM II', 'Indeferido'],
  ['72026081468', '0.0141780.1', 'ROSA MARIA FERREIRA DO NASCIMENTO', 'SUBINSPETORA', 'Indeferido'],
  ['50159666449', '0.0140716.1', 'JANUNCIO DE ASSIS LOPES', 'SUBINSPETOR', 'Indeferido'],
  ['90690010478', '0.0142107.1', 'MONICA APRIGIO CARVALHO DOS SANTOS', 'SUBINSPETORA', 'Indeferido'],
  ['82222339472', '0.137545.1', 'JAILSON RODRIGUES DA SILVA', 'SUBINSPETOR', 'Indeferido'],
  ['5234919480', '0.0208477.1', 'PABLO DE MELO FREITAS', 'GM II', 'Indeferido'],
  ['5192496403', '0.0195413.1', 'PEDRO HENRIQUE COSME LINS MENDES', 'GM II', 'Indeferido'],
  ['9226566496', '0.0195421.1', 'PEDRO HENRIQUE XAVIER DA SILVA', 'GM II', 'Indeferido'],
  ['19203276491', '0.0142921.1', 'SAEL DA PAZ', 'SUBINSPETOR', 'Indeferido'],
  ['8521598467', '0.0208361.1', 'KELLY BARBOSA GOMES RAMOS', 'GM II', 'Indeferido'],
  ['6263350431', '0.0194670.1', 'AMANDA RODRIGUES DA SILVA', 'GM II', 'Indeferido'],
  ['2242186469', '0.0206156.1', 'FERNANDO MARIANO DA SILVA', 'GM II', 'Indeferido'],
  ['38901749491', '0.0141771.1', 'MARIA CRISTINA MENEZES', 'SUBINSPETORA', 'Indeferido'],
  ['10336586426', '0.0195251.1', 'JOAZ GONCALVES DA SILVA', 'GM II', 'Indeferido'],
  ['7899205492', '0.0195162.1', 'IDAIANA LIRA DO NASCIMENTO', 'GM II', 'Deferido'],
  ['61824305400', '0.0142174.1', 'NATAN DA SILVA DE SANTANA JUNIOR', 'SUBINSPETOR', 'Indeferido'],
  ['68353146487', '0.0142735.1', 'ALDO BEZERRA DE MELO COSTA', 'SUBINSPETOR', 'Deferido'],
  ['45990182449', '0.0142590.1', 'LUCIENE MARIA SILVA VILA NOVA', 'SUBINSPETORA', 'Indeferido'],
  ['55585256491', '0.128783.1', 'MARIA JUSELY DOS SANTOS', 'SUBINSPETORA', 'Indeferido'],
  ['40713270497', '0.128791.1', 'AGENILDA MERENCIO RAMOS NASCIMENTO', 'SUBINSPETORA', 'Indeferido'],
  ['27855236449', '0.0142956.1', 'SEVERINO JOSE DA SILVA', 'SUBINSPETOR', 'Indeferido'],
  ['8524812419', '0.0208620.1', 'WANESSA DA SILVA BARBOSA', 'GM II', 'Indeferido'],
  ['5105215419', '0.0194743.1', 'CARLA JANAINA ARAUJO DA SILVA', 'GM II', 'Indeferido'],
  ['50950509434', '0.0142506.1', 'RONALDO FRANCISCO DA SILVA', 'SUBINSPETOR', 'Indeferido'],
  ['79321607404', '0.0143014.1', 'JAILSON PEREIRA DA SILVA', 'SUBINSPETOR', 'Indeferido'],
  ['28122763472', '0.127701.1', 'UBIRAJARA GOMES DA FONSECA', 'INSPETOR', 'Deferido'],
  ['7424293427', '0.0195510.1', 'SAMUEL DE MOURA CANUTO', 'GM II', 'Deferido']
];

function normalizarCpf(valor) {
  return String(valor || '').replace(/\D/g, '').padStart(11, '0');
}

function matriculaKey(valor) {
  return String(valor || '').replace(/\D/g, '');
}

async function main() {
  let ok = 0;
  for (const [cpfBruto, matricula, nome, classe, status] of SERVIDORES) {
    const cpf = normalizarCpf(cpfBruto);
    const key = matriculaKey(matricula);
    await sql`
      insert into servidores (matricula_key, matricula, nome, cpf, classe, status)
      values (${key}, ${matricula}, ${nome}, ${cpf}, ${classe}, ${status})
      on conflict (matricula_key) do update
      set matricula = excluded.matricula,
          nome = excluded.nome,
          cpf = excluded.cpf,
          classe = excluded.classe,
          status = excluded.status
    `;
    ok += 1;
  }
  console.log(`Pronto: ${ok}/${SERVIDORES.length} servidor(es) importado(s)/atualizado(s).`);
}

main().catch((err) => {
  console.error('Erro ao importar:', err);
  process.exit(1);
});
