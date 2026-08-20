-- Sistema de Confirmação de Dados Cadastrais — Majoração de Jornada 40h
-- Rode este script uma vez no seu banco Postgres (Neon, via Vercel Storage)
-- antes do primeiro deploy. Veja README.md para o passo a passo completo.

create table if not exists servidores (
  id serial primary key,
  matricula text unique not null,
  nome text not null,
  cpf text unique, -- somente dígitos (11 caracteres); NULL até o cruzamento com a SEGEP
  classe text,
  ordem text,
  data_requerimento timestamptz,
  status text not null default 'Pendente',
  data_confirmacao timestamptz,
  tentativas_falhas integer not null default 0,
  bloqueado_ate timestamptz
);

-- Log de confirmações (auditoria). Como nenhum campo é editável pelo
-- autoatendimento, só existem entradas do tipo 'Confirmação'.
create table if not exists log_confirmacoes (
  id serial primary key,
  criado_em timestamptz not null default now(),
  matricula text not null,
  tipo text not null default 'Confirmação'
);

-- Requerimentos (texto livre + anexo opcional), pendentes de análise da SEGEP.
create table if not exists requerimentos (
  id serial primary key,
  criado_em timestamptz not null default now(),
  matricula text not null,
  nome text not null,
  texto text,
  anexo_url text,
  status_analise text not null default 'Pendente'
);

-- Contador usado só para o limite global de consultas por CPF/minuto
-- (mitigação simples contra tentativas automatizadas de descobrir nomes
-- testando CPFs em sequência — ver README.md, seção "Segurança e LGPD").
create table if not exists cpf_lookup_rate_limit (
  bucket_minuto bigint primary key,
  contagem integer not null default 0
);

create index if not exists idx_servidores_cpf on servidores (cpf);
