# Resposta à Manifestação e Recurso — Majoração de Jornada 40h

Aplicação web (Next.js, hospedada no Vercel) para que os servidores que
apresentaram manifestação contra a classificação prévia da majoração de
jornada (30h → 40h) consultem a resposta da SEGEP e, se quiserem, apresentem
recurso.

> Esta é a segunda fase do projeto. Na primeira fase, servidores confirmavam
> dados de requerimento e podiam enviar uma manifestação. Trinta
> manifestações foram enviadas e analisadas, resultando em 30 decisões
> (deferido/indeferido) com sua respectiva Minuta de Voto. Esta fase reaproveita
> a mesma base técnica (Next.js + Postgres/Neon + Vercel Blob), mudando o
> propósito da página: em vez de confirmar dados, o servidor agora consulta
> sua resposta e pode apresentar recurso.

## Arquitetura

| Peça | Tecnologia |
|---|---|
| Framework | Next.js (App Router), hospedado no Vercel |
| Banco de dados | Postgres — integração Neon, conectada pela aba **Storage** do projeto no Vercel |
| Resposta (Minuta de Voto) | Arquivo estático em `public/respostas/<matricula_key>.pdf` — não depende de banco nem de armazenamento externo |
| Recurso (gerado pelo servidor) | PDF gerado em tempo real (`pdfkit`) e enviado ao Vercel Blob |
| Sessão pós-senha | Token assinado (JWT), sem estado guardado no servidor |

Como o repositório já está conectado ao Vercel, **qualquer push nesta branch
gera um novo deploy automaticamente**.

## Arquivos deste projeto

| Caminho | Função |
|---|---|
| `app/page.js` | Página única com as 4 etapas do fluxo (componente cliente React) |
| `app/layout.js`, `app/globals.css` | Layout raiz e estilos (mobile-first) |
| `app/api/buscar-cpf/route.js` | Etapa 1 — localizar servidor pelo CPF |
| `app/api/validar-senha/route.js` | Etapa 2 — validar senha, emitir token, retornar status + link da resposta |
| `app/api/recurso/route.js` | Etapa 3 — gera o PDF do recurso a partir do texto digitado e grava no banco |
| `lib/db.js` | Acesso ao Postgres (Neon) |
| `lib/session.js` | Emissão/verificação do token de sessão (JWT) |
| `lib/pdf.js` | Geração do PDF do recurso (`pdfkit`) |
| `lib/format.js` | Utilitário de formatação de data |
| `scripts/schema.sql` | Estrutura das tabelas — rode uma vez no banco |
| `scripts/seed.mjs` | Importa os 30 servidores (dados já embutidos no script) |
| `public/respostas/*.pdf` | As 30 respostas (Minuta de Voto), uma por servidor |

---

## 1. De onde vêm os dados

Fonte: planilha **RECURSOS_-_PREENCHIDA_ajustada** (pasta *MANIFESTAÇÕES -
SERVIDORES* da SEGEP), colunas `CPF | MATR. | NOME | CLASSE | ... | STATUS`.
Cada servidor também tem uma subpasta própria nessa mesma pasta do Drive,
contendo seu `Minuta_Voto_<Nome>.docx` — o documento de resposta.

Isso foi processado uma única vez (não é algo que a aplicação repete
sozinha):

1. Os 30 registros (CPF, matrícula, nome, classe, status) foram extraídos da
   planilha e embutidos diretamente em `scripts/seed.mjs`.
2. Cada `Minuta_Voto_*.docx` foi baixado da subpasta do respectivo servidor e
   convertido para PDF (LibreOffice headless), salvo em
   `public/respostas/<matricula_key>.pdf`, onde `matricula_key` é a matrícula
   só com os dígitos (ex: matrícula `0.0195308.1` → chave `001953081`).

**Se a planilha ou alguma Minuta de Voto for corrigida depois**, esse
processo precisa ser refeito manualmente para a(s) pessoa(s) afetada(s):
atualize a linha correspondente em `scripts/seed.mjs` (e rode `npm run seed`
de novo) e/ou substitua o PDF correspondente em `public/respostas/`.

### Tabela `servidores`

| Coluna | Observações |
|---|---|
| `matricula_key` | Matrícula só com dígitos — também é o nome do arquivo em `public/respostas/` |
| `matricula` | Matrícula como consta na planilha de origem, para exibição |
| `nome` | Nome completo |
| `cpf` | Só dígitos (11 caracteres, com zeros à esquerda) — é a chave de busca e também a fonte da senha (últimos 4 dígitos) |
| `classe` | Ex: GM I, GM II, Inspetor, Subinspetor, Subinspetora |
| `status` | `Deferido` ou `Indeferido` — decisão sobre a manifestação |
| `recurso_texto`, `recurso_pdf_url`, `data_recurso` | Preenchidos quando o servidor envia um recurso |
| `tentativas_falhas`, `bloqueado_ate` | Controle de tentativas de senha — não edite manualmente |

A aba `log_eventos` registra, para auditoria, cada vez que alguém acessa a
resposta ou apresenta um recurso.

---

## 2. Passo a passo de configuração

### 2.1 Conectar o banco (Postgres via Neon)

1. No [dashboard do Vercel](https://vercel.com/dashboard), abra o projeto
   `majora-oguardas` → aba **Storage**.
2. **Create Database → Postgres (Neon)** → conecte ao projeto. Isso injeta
   `DATABASE_URL` automaticamente.
3. Abra o **SQL Editor** da Neon e rode o conteúdo de `scripts/schema.sql`
   uma vez, para criar as tabelas (isso apaga tabelas de uma fase anterior
   deste projeto, se existirem — veja o `drop table` no topo do script).

### 2.2 Conectar o armazenamento de anexos (Vercel Blob)

1. Aba **Storage** → **Create Database → Blob** → conecte ao projeto. Isso
   injeta `BLOB_READ_WRITE_TOKEN` automaticamente. É usado só para os PDFs de
   recurso gerados em tempo real — as respostas (Minutas de Voto) já vêm
   junto com o código, em `public/respostas/`.

### 2.3 Definir o segredo da sessão

1. Aba **Settings → Environment Variables** do projeto.
2. Adicione `SESSION_SECRET` com uma string aleatória longa (gere uma com
   `openssl rand -base64 32`). Marque para os ambientes Production e Preview.
3. Redeploy (ou aguarde o próximo push) para a variável valer.

### 2.4 Importar os 30 servidores

```bash
npm install
DATABASE_URL="postgres://...-a-mesma-connection-string-da-Neon" npm run seed
```

Idempotente — pode rodar de novo sem duplicar (upsert por `matricula_key`).

### 2.5 Deploy

Sem passo manual: cada push nesta branch gera um deploy novo. Depois de
configurar as variáveis acima e rodar a importação, a próxima visita a
`https://majora-oguardas.vercel.app` já funciona com dados reais.

---

## 3. Fluxo funcional (como implementado)

1. **Identificação por CPF** (`POST /api/buscar-cpf`): o servidor digita o
   CPF completo. O sistema localiza o registro e revela **apenas o nome**.
   Limite global de consultas por minuto contra tentativas automatizadas de
   descobrir nomes testando CPFs em sequência.
2. **Senha** (`POST /api/validar-senha`): últimos 4 dígitos do CPF. Mesma
   lógica de tentativas/bloqueio (5 tentativas, 15 min) da fase anterior. Em
   caso de sucesso, emite um token de sessão (JWT, 15 min) e retorna nome,
   matrícula, classe, status e o link da resposta em PDF
   (`/respostas/<matricula_key>.pdf`, servido como arquivo estático).
3. **Sua manifestação**: mostra a decisão (`Deferido`/`Indeferido`) e um
   botão para baixar a resposta completa. Se um recurso já tiver sido
   enviado antes, mostra a data e o link para baixá-lo, com a opção de
   enviar um novo (substitui o anterior).
4. **Recurso** (`POST /api/recurso`): o texto digitado é transformado em PDF
   (`lib/pdf.js`, layout com cabeçalho, dados do servidor e o texto) — o
   mesmo princípio usado para gerar as manifestações originais (texto
   digitado vira documento, não fica solto). O PDF é enviado ao Vercel Blob
   e o link é salvo em `recurso_pdf_url`; a linha em `log_eventos` registra
   o evento.
5. **Tela final**: confirma o registro com data/hora e link para baixar o
   recurso gerado.

---

## 4. Segurança e LGPD

Mesma base de risco e mesmos controles da fase anterior (identificação por
CPF completo + senha de 4 dígitos é baixa fricção, não autenticação forte —
ver histórico do projeto). Pontos específicos desta fase:

- **Dados reais de 30 servidores** (nome, CPF, decisão administrativa)
  ficam no banco e nos 30 PDFs de resposta. Trate o banco e o repositório
  (que contém os PDFs de resposta) com o mesmo cuidado de acesso que a
  planilha e a pasta do Drive originais.
- **Resposta em PDF como arquivo estático**: qualquer pessoa com a URL exata
  (`/respostas/<matricula_key>.pdf`) consegue baixar o arquivo, sem
  autenticação — a URL não é adivinhável a partir da interface (só aparece
  depois de CPF + senha corretos), mas também não está tecnicamente
  protegida por autenticação no servidor. Isso é aceitável para o mesmo
  padrão de exposição já usado no projeto (mesmo modelo de "quem tem o link
  acessa"), mas é uma decisão consciente — avise se quiser uma versão que
  exija o token de sessão também para baixar o PDF.
- **Recurso em PDF (Blob público)**: mesmo modelo — URL aleatória e
  imprevisível, não protegida por autenticação adicional.
- **Nenhuma correção de dado cadastral acontece por aqui** — esta tela não
  edita nome, matrícula, classe ou status; ela só exibe a decisão e recebe o
  texto do recurso.

---

## 5. Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha DATABASE_URL, BLOB_READ_WRITE_TOKEN, SESSION_SECRET
npm run dev                   # http://localhost:3000
```

---

## 6. Limitações conhecidas / decisões de design

- As respostas em PDF (`public/respostas/`) são um retrato estático do
  momento em que foram exportadas de Minuta_Voto do Drive. Se a SEGEP
  corrigir uma Minuta de Voto depois, é preciso substituir o PDF
  correspondente manualmente (não há sincronização automática com o Drive —
  ver seção 1).
- Assim como a fase anterior, não existe hoje uma tela autenticada para a
  SEGEP consultar recursos recebidos — o acesso é direto pelo SQL Editor da
  Neon e pelo painel do Vercel Blob.
- A geração de PDF (`pdfkit`) foi validada localmente; ainda não foi testada
  em uma execução real no Vercel. Se o download do recurso falhar em
  produção (raro, mas possível por causa de como funções serverless
  empacotam dependências), a causa mais provável são os arquivos de fonte
  do `pdfkit` não incluídos no bundle — nesse caso, adicionar
  `outputFileTracingIncludes` no `next.config.mjs` apontando para
  `node_modules/pdfkit/js/standard-fonts/**` resolve.
