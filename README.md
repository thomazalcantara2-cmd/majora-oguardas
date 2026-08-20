# Sistema de Confirmação de Dados Cadastrais — Majoração de Jornada 40h

Aplicação web (Next.js, hospedada no Vercel) para que servidores confirmem os
próprios dados de requerimento de majoração de jornada semanal de 30h para
40h, e registrem um requerimento em texto com anexo, se precisarem relatar
algo.

> Este projeto já foi implementado como Google Apps Script + Google Sheets
> numa versão anterior. Esta é a versão que roda no Vercel: banco de dados
> Postgres (via integração Neon) no lugar da Planilha Google, e Vercel Blob
> no lugar do Google Drive para os anexos.

## Arquitetura

| Peça | Tecnologia |
|---|---|
| Framework | Next.js (App Router), hospedado no Vercel |
| Banco de dados | Postgres — integração Neon, conectada pela aba **Storage** do projeto no Vercel |
| Anexos | Vercel Blob, conectado pela mesma aba **Storage** |
| Sessão pós-senha | Token assinado (JWT), sem estado guardado no servidor |

Como o repositório já está conectado ao Vercel, **qualquer push nesta branch
gera um novo deploy automaticamente** — não há um passo manual de "publicar".
O que falta configurar é só o banco e os anexos (seção 2).

## Arquivos deste projeto

| Caminho | Função |
|---|---|
| `app/page.js` | Página única com as 4 etapas do fluxo (componente cliente React) |
| `app/layout.js`, `app/globals.css` | Layout raiz e estilos (mobile-first) |
| `app/api/buscar-cpf/route.js` | Etapa 1 — localizar servidor pelo CPF |
| `app/api/validar-senha/route.js` | Etapa 2 — validar senha e emitir token de sessão |
| `app/api/confirmar/route.js` | Etapas 3-4 — confirmar dados, gravar requerimento/anexo |
| `lib/db.js` | Acesso ao Postgres (Neon) |
| `lib/session.js` | Emissão/verificação do token de sessão (JWT) |
| `lib/format.js`, `lib/anexo.js` | Utilitários |
| `scripts/schema.sql` | Estrutura das tabelas — rode uma vez no banco |
| `scripts/seed.mjs` | Importa a lista de servidores (CSV) para o banco |

---

## 1. Estrutura dos dados (Postgres)

Sua lista de origem vem como `Ordem | CPF | MATR. | NOME | CLASSE | DATA`.
Isso vira a tabela `servidores` (ver `scripts/schema.sql` para o SQL exato):

| Coluna | Vem de | Observações |
|---|---|---|
| `matricula` | `MATR.` | Identificador único (chave do upsert na importação) |
| `nome` | `NOME` | Nome completo |
| `cpf` | `CPF` | Só dígitos (11 caracteres) ou `NULL` até o cruzamento com a base da SEGEP — só passa a valer como senha de acesso quando estiver preenchido |
| `classe` | `CLASSE` | Ex: GM I, GM II, Inspetor, Subinspetor, Subinspetora, Inspetora. **Não aparece na página** — fica só no banco, para uso interno da SEGEP |
| `ordem` | `Ordem` | Número de ordem do protocolo original. Exibido na página, mas **somente leitura** |
| `data_requerimento` | `DATA` | Data/hora do requerimento original de majoração. Exibido na página, mas **somente leitura** |
| `status` | *(gerado pelo sistema)* | `Pendente` ou `Confirmado` |
| `data_confirmacao` | *(gerado pelo sistema)* | Preenchida no momento em que o servidor confirma |
| `tentativas_falhas`, `bloqueado_ate` | *(controle do sistema)* | Usadas só para limitar tentativas de senha — não edite manualmente |

Duas tabelas adicionais registram a atividade (equivalentes às antigas abas
`Log_Alterações` e `Requerimentos`):

- **`log_confirmacoes`** — uma linha a cada vez que um servidor confirma os
  dados (auditoria).
- **`requerimentos`** — uma linha só quando o servidor preenche texto e/ou
  anexo. `status_analise` começa sempre `Pendente`; cabe à SEGEP atualizar
  manualmente conforme o requerimento for analisado.

Nenhum campo da tela é editável pelo autoatendimento (nem `Nome`). Se algo
estiver errado, o relato vai pelo campo Requerimento, e a correção em si é
feita manualmente pela SEGEP direto no banco (ver seção 3).

---

## 2. Passo a passo de configuração

### 2.1 Conectar o banco (Postgres via Neon)

1. No [dashboard do Vercel](https://vercel.com/dashboard), abra o projeto
   `majora-oguardas` → aba **Storage**.
2. **Create Database → Postgres (Neon)** → siga o assistente e conecte ao
   projeto. Isso injeta automaticamente a variável de ambiente
   `DATABASE_URL` (ou `POSTGRES_URL`) nos deploys.
3. Abra o **SQL Editor** da Neon (link disponível na própria aba Storage do
   Vercel, ou direto no console da Neon) e rode o conteúdo de
   `scripts/schema.sql` uma vez, para criar as tabelas.

### 2.2 Conectar o armazenamento de anexos (Vercel Blob)

1. Ainda na aba **Storage** → **Create Database → Blob** → conecte ao
   projeto. Isso injeta `BLOB_READ_WRITE_TOKEN` automaticamente.

### 2.3 Definir o segredo da sessão

1. Aba **Settings → Environment Variables** do projeto.
2. Adicione `SESSION_SECRET` com uma string aleatória longa (gere uma com
   `openssl rand -base64 32`, por exemplo). Marque para os ambientes
   Production e Preview.
3. Faça um redeploy (ou aguarde o próximo push) para as variáveis passarem a
   valer.

### 2.4 Importar a lista de servidores

Isso roda do seu computador (não é um passo dentro do Vercel):

```bash
npm install
DATABASE_URL="postgres://...-a-mesma-connection-string-da-Neon" \
  npm run seed -- caminho/para/lista.csv
```

O CSV precisa ter cabeçalho com as colunas `Ordem`, `CPF`, `MATR.`, `NOME`,
`CLASSE`, `DATA` (nessa grafia ou parecida — o script tenta casar variações
comuns). Rodar de novo com uma lista atualizada não duplica linhas: o
`matricula` é a chave, e um CPF já preenchido antes nunca é apagado por uma
linha nova sem CPF.

A connection string da Neon fica em **Storage → (seu banco) → .env.local**
no dashboard do Vercel, ou rodando `vercel env pull` na raiz do projeto.

### 2.5 Deploy

Não tem passo manual: o projeto já está conectado a este repositório
GitHub, então cada push nesta branch (ou merge na branch de produção) gera
um deploy novo automaticamente. Depois de configurar as três variáveis de
ambiente acima e rodar a importação, a próxima visita a
`https://majora-oguardas.vercel.app` já funciona com dados reais.

---

## 3. Fluxo funcional (como implementado)

1. **Identificação por CPF** (`POST /api/buscar-cpf`): o servidor digita o
   CPF completo (11 dígitos, com ou sem pontuação). O sistema localiza o
   registro e revela **apenas o nome** — nenhum outro dado (matrícula,
   classe, status etc.) é retornado nesta etapa. Como o CPF é único por
   pessoa, essa etapa identifica a linha certa sem precisar de busca por
   nome nem de campo de desambiguação.
   Como mitigação simples contra tentativas automatizadas de descobrir
   nomes testando CPFs em sequência, há um limite global (todas as sessões
   somadas) de consultas por minuto, contado direto no Postgres
   (`consultaDentroDoLimiteGlobal`).
2. **Senha** (`POST /api/validar-senha`): compara os últimos 4 dígitos do
   CPF armazenado com o valor digitado. Sempre retorna a mesma mensagem
   genérica em caso de erro. Após 5 tentativas erradas naquele registro,
   bloqueia novas tentativas por 15 minutos (contador e bloqueio
   persistidos na própria tabela `servidores`). Em caso de sucesso, emite um
   **token de sessão assinado** (JWT, 15 minutos de validade) — o backend
   não guarda nenhum estado de sessão; o próprio token, assinado com
   `SESSION_SECRET`, carrega o id do servidor e expira sozinho.
3. **Exibição dos dados**: o CPF nunca é enviado ao cliente em texto — o
   servidor só vê o placeholder fixo `XXX.XXX.XXX-**`, mesmo sendo o dono do
   registro (ver seção "LGPD" abaixo). Todos os campos aparecem desabilitados:
   nada nessa tela é editável pelo autoatendimento.
4. **Confirmar** (`POST /api/confirmar`): grava `status = 'Confirmado'` e
   `data_confirmacao = agora`, e uma linha em `log_confirmacoes`. Se o
   servidor preencheu texto de requerimento e/ou anexo, uma linha também é
   criada em `requerimentos` e o arquivo é enviado para o Vercel Blob — esse
   requerimento é o canal para relatar qualquer dado incorreto; a correção
   em si é feita manualmente pela SEGEP no banco, depois de ler o
   requerimento.
5. **Tela final**: confirma o registro com data/hora e menciona se o
   requerimento foi recebido.

---

## 4. Segurança e LGPD

**Por que a identificação por CPF + senha de 4 dígitos é fraca — e por que
isso é aceitável aqui, com os controles certos:**

O CPF é dado pessoal (LGPD, art. 5º, I). Como o fluxo usa o CPF completo
como chave de busca (etapa 1) e os últimos 4 dígitos do próprio CPF como
"senha" (etapa 2), vale deixar claro, sem rodeios, o que isso significa na
prática: **quem já sabe o CPF completo de alguém também sabe, por
definição, os últimos 4 dígitos.** A etapa de senha não é um segundo fator
independente — funciona como uma segunda digitação de confirmação, não como
barreira contra quem já tem o CPF em mãos. O controle de acesso real deste
sistema é, na prática, "só quem sabe o CPF de alguém consegue ver o nome e
os dados dessa pessoa" — baixa fricção para autoconfirmação de dados já sob
custódia da administração, não autenticação forte. Controles compensatórios:

- **A etapa de CPF revela só o nome, nada além disso.**
- **Limite global de consultas por minuto** na etapa de CPF, para dificultar
  — sem eliminar — tentativas automatizadas de descobrir nomes testando
  CPFs em sequência.
- **Mascaramento total do CPF na tela de dados** — nem o próprio servidor vê
  o CPF completo.
- **Mensagem de erro genérica** na etapa de senha.
- **Limite de tentativas de senha** (5) com bloqueio temporário (15 min) por
  registro.
- **Nenhum campo é editável pelo autoatendimento** — toda a tela de dados é
  somente leitura. Correções vão pelo Requerimento e são feitas manualmente
  pela SEGEP no banco, nunca automaticamente a partir do que o servidor
  digitou.
- **Token de sessão de curta duração** (15 min), assinado e sem estado no
  servidor — depois de expirar, é preciso repetir CPF + senha.
- **Anexos**: enviados como blobs públicos (URL de acesso é um caminho
  aleatório e imprevisível — mesmo modelo de exposição de um link do Google
  Drive só com "quem tem o link"). Se precisar de controle de acesso mais
  forte (blob privado com URL assinada por requisição), é possível trocar
  `access: 'public'` por `access: 'private'` em
  `app/api/confirmar/route.js`, mas isso exige montar também uma tela
  autenticada para a SEGEP baixar os anexos — fora do escopo desta entrega.
- **HTTPS**: nativo do Vercel.

**Sobre IP (auditoria):** diferente da versão anterior (Google Apps Script,
que não expõe IP nenhum), rodando no Vercel o backend **tem acesso ao IP do
cliente** via cabeçalho `x-forwarded-for`. Isso não está sendo registrado
hoje (só é usado, de forma agregada, no limite de consultas por CPF/minuto);
se a SEGEP quiser auditoria por IP por confirmação, é uma mudança pequena em
`app/api/confirmar/route.js` e `log_confirmacoes` — avise se quiser que eu
adicione.

---

## 5. Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha DATABASE_URL, BLOB_READ_WRITE_TOKEN, SESSION_SECRET
npm run dev                   # http://localhost:3000
```

Use a mesma `DATABASE_URL` do banco de desenvolvimento/produção da Neon
(ou crie um banco Neon separado só para testes locais).

---

## 6. Limitações conhecidas / decisões de design

- O limite de consultas por CPF/minuto é global (soma de todos os usuários),
  não por IP — uma pessoa mal-intencionada com muitas requisições em
  paralelo ainda consome a cota de todo mundo antes de ser bloqueada. Um
  limite por IP é possível (já temos acesso ao IP, diferente da versão
  Apps Script) mas não foi implementado nesta entrega.
- Nenhum campo é editável pelo próprio servidor nesta tela — toda a tela de
  dados (Matrícula, Nome, CPF, Ordem, Data/hora do requerimento) é somente
  leitura. Qualquer correção deve ser tratada diretamente com a SEGEP,
  normalmente a partir do que o servidor descrever no campo Requerimento.
- Não existe hoje uma tela autenticada para a SEGEP consultar
  `requerimentos`/`servidores` — o acesso é direto pelo SQL Editor da Neon
  (dashboard do Vercel) e pelo painel do Vercel Blob, equivalente a como a
  versão anterior usava a própria Planilha Google e a pasta do Drive.
