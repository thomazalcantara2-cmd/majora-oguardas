-- Sistema de Recursos — Manifestações dos Servidores (Guarda Municipal)
-- Fase 2: o servidor consulta a resposta à sua manifestação (Minuta de Voto)
-- e, se quiser, apresenta recurso contra o deferimento/indeferimento.
--
-- Rode este script uma vez no seu banco Postgres (Neon, via Vercel Storage)
-- antes do primeiro deploy desta fase. Substitui o schema da fase anterior
-- (confirmação de dados de majoração 30h->40h) — veja README.md.

drop table if exists requerimentos;
drop table if exists log_confirmacoes;
drop table if exists servidores;

create table servidores (
  id serial primary key,
  matricula_key text unique not null, -- só os dígitos da matrícula; também é o nome do PDF em /public/respostas
  matricula text not null,             -- matrícula como consta na planilha de origem (ex: "0.0195308.1")
  nome text not null,
  cpf text unique not null,            -- somente dígitos (11 caracteres, com zeros à esquerda)
  classe text,
  status text not null,                -- 'Deferido' ou 'Indeferido' (decisão sobre a manifestação)
  recurso_texto text,
  recurso_pdf_url text,
  data_recurso timestamptz,
  tentativas_falhas integer not null default 0,
  bloqueado_ate timestamptz
);

create index idx_servidores_cpf on servidores (cpf);

-- Log de acessos/ações (auditoria).
create table log_eventos (
  id serial primary key,
  criado_em timestamptz not null default now(),
  matricula text not null,
  tipo text not null -- 'Acesso à resposta' ou 'Recurso apresentado'
);

-- Mesmo contador de limite global de consultas por CPF/minuto da fase
-- anterior (mitigação simples contra tentativas automatizadas de descobrir
-- nomes testando CPFs em sequência — ver README.md).
create table if not exists cpf_lookup_rate_limit (
  bucket_minuto bigint primary key,
  contagem integer not null default 0
);
