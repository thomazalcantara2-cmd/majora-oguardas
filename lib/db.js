import { neon } from '@neondatabase/serverless';

let sqlClient = null;

// Neon (conectado via aba "Storage" do Vercel) injeta DATABASE_URL
// automaticamente; POSTGRES_URL é o nome usado por integrações antigas.
function getConnectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
}

export function sql(strings, ...values) {
  if (!sqlClient) {
    const connectionString = getConnectionString();
    if (!connectionString) {
      throw new Error(
        'Configuração ausente: defina DATABASE_URL (conecte um banco Postgres/Neon na aba Storage do projeto no Vercel). Veja README.md.'
      );
    }
    sqlClient = neon(connectionString);
  }
  return sqlClient(strings, ...values);
}

export const MAX_TENTATIVAS = 5;
export const BLOQUEIO_MINUTOS = 15;
export const LIMITE_GLOBAL_MAX_CONSULTAS_POR_MINUTO = 40;

export function normalizarCpf(valor) {
  return String(valor || '').replace(/\D/g, '');
}

/**
 * Mitigação simples (não substitui um rate-limit de verdade) contra
 * tentativas automatizadas de descobrir nomes testando CPFs em sequência:
 * conta consultas de TODOS os usuários dentro do minuto corrente.
 */
export async function consultaDentroDoLimiteGlobal() {
  const bucketMinuto = Math.floor(Date.now() / 60000);
  const linhas = await sql`
    insert into cpf_lookup_rate_limit (bucket_minuto, contagem)
    values (${bucketMinuto}, 1)
    on conflict (bucket_minuto) do update
      set contagem = cpf_lookup_rate_limit.contagem + 1
    returning contagem
  `;
  const contagem = linhas[0] ? Number(linhas[0].contagem) : 1;
  return contagem <= LIMITE_GLOBAL_MAX_CONSULTAS_POR_MINUTO;
}

/**
 * Localiza o servidor pelo CPF completo. Retorna apenas { id, nome } —
 * nenhum outro dado (matrícula, classe, status etc.) sai daqui.
 */
export async function buscarServidorPorCpf(cpfDigitos) {
  const linhas = await sql`
    select id, nome, bloqueado_ate
    from servidores
    where cpf = ${cpfDigitos}
    limit 1
  `;
  return linhas[0] || null;
}

export async function obterServidorPorId(id) {
  const linhas = await sql`
    select id, matricula_key, matricula, nome, cpf, classe, status,
           recurso_texto, recurso_pdf_url, data_recurso,
           tentativas_falhas, bloqueado_ate
    from servidores
    where id = ${id}
    limit 1
  `;
  return linhas[0] || null;
}

export async function registrarTentativaFalha(id, tentativas) {
  if (tentativas >= MAX_TENTATIVAS) {
    await sql`
      update servidores
      set tentativas_falhas = ${tentativas},
          bloqueado_ate = now() + (${BLOQUEIO_MINUTOS} || ' minutes')::interval
      where id = ${id}
    `;
  } else {
    await sql`
      update servidores set tentativas_falhas = ${tentativas} where id = ${id}
    `;
  }
}

export async function zerarTentativas(id) {
  await sql`
    update servidores
    set tentativas_falhas = 0, bloqueado_ate = null
    where id = ${id}
  `;
}

export async function registrarAcessoResposta(matricula) {
  await sql`insert into log_eventos (matricula, tipo) values (${matricula}, 'Acesso à resposta')`;
}

export async function registrarRecurso({ id, matricula, texto, pdfUrl }) {
  await sql`
    update servidores
    set recurso_texto = ${texto}, recurso_pdf_url = ${pdfUrl}, data_recurso = now()
    where id = ${id}
  `;
  await sql`insert into log_eventos (matricula, tipo) values (${matricula}, 'Recurso apresentado')`;
}
