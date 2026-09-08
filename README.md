# Resposta à Manifestação e Recurso — Majoração de Jornada 40h

Aplicação web (Next.js, hospedada no Vercel) para que os servidores que
apresentaram manifestação contra a classificação prévia da majoração de
jornada (30h → 40h) consultem a resposta da SEGEP e, se quiserem, apresentem
recurso.

> **O "banco de dados" é a própria Planilha Google** `RECURSOS_-_PREENCHIDA_ajustada`
> — não Postgres, não Google Sheets exportado para outro lugar: a aplicação lê e
> escreve direto nessa planilha, em tempo real, via Google Sheets API. Essa foi
> uma decisão explícita para que a SEGEP continue trabalhando na planilha que já
> usa, sem precisar aprender outra ferramenta.

## Arquitetura

| Peça | Tecnologia |
|---|---|
| Framework | Next.js (App Router), hospedado no Vercel |
| Banco de dados | A própria Planilha Google, acessada via Sheets API com uma conta de serviço |
| Resposta (Minuta de Voto) | Arquivo estático em `public/respostas/<matricula_key>.pdf` — não depende da planilha nem de armazenamento externo |
| Recurso (gerado pelo servidor) | PDF gerado em tempo real (`pdfkit`) e enviado ao Vercel Blob; o link fica na coluna `Recurso` da planilha |
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
| `app/api/recurso/route.js` | Etapa 3 — gera o PDF do recurso a partir do texto digitado e grava o link na planilha |
| `lib/sheets.js` | Cliente da Google Sheets API (autenticação, leitura/escrita de células) |
| `lib/db.js` | Camada fina sobre `lib/sheets.js` com os nomes de função que as rotas usam |
| `lib/session.js` | Emissão/verificação do token de sessão (JWT) |
| `lib/pdf.js` | Geração do PDF do recurso (`pdfkit`) |
| `scripts/inicializar-planilha.mjs` | Garante as colunas de controle e a aba de log na planilha — rode uma vez |
| `public/respostas/*.pdf` | As 30 respostas (Minuta de Voto), uma por servidor |

---

## 1. Estrutura da planilha

Aba principal (nome definido por você em `GOOGLE_SHEETS_TAB_NAME`) — colunas
A-K já existem na planilha de origem; L-N são criadas pelo app:

| Coluna | Nome | Observações |
|---|---|---|
| A | `CPF` | Pode ter perdido zeros à esquerda por estar numa célula numérica — o app sempre normaliza para 11 dígitos |
| B | `MATR.` | Matrícula como está na planilha (ex: `0.0195308.1`). Só os dígitos formam a `matricula_key`, usada para achar o PDF em `public/respostas/` |
| C | `NOME` | Nome completo |
| D | `CLASSE` | Ex: GM I, GM II, Inspetor, Subinspetor, Subinspetora |
| E, F | `DATA 1º SOLICITAÇÃO`, `DATA MANIFESTAÇÃO` | Não usadas pelo app — mantidas por serem da planilha original |
| G | `STATUS` | `DEFERIDO` ou `INDEFERIDO` — decisão sobre a manifestação (o app aceita qualquer capitalização) |
| H, I, J | `link do Requerimento`, `link do Anexo`, `link da minuta do voto` | Não usadas pelo app — mantidas por serem da planilha original |
| K | `Recurso` | **Escrita pelo app**: link do PDF do recurso, quando o servidor envia um |
| L | `Data_Recurso` | **Escrita pelo app**: data/hora do envio (ISO 8601) |
| M | `Tentativas_Falhas` | **Escrita pelo app**: controle de tentativas de senha — não edite manualmente |
| N | `Bloqueado_Até` | **Escrita pelo app**: bloqueio temporário após 5 tentativas erradas — não edite manualmente |

Uma segunda aba, **`Log_Eventos`** (criada pelo `inicializarPlanilha`), registra
para auditoria cada acesso à resposta e cada recurso apresentado
(`Timestamp | Matrícula | Tipo`).

O texto do recurso em si **não** é gravado na planilha (só o link do PDF) —
seguindo o mesmo padrão que a planilha já usa para a manifestação original
(que também guarda só o nome do arquivo, não o texto).

---

## 2. Passo a passo de configuração

### 2.1 Criar a conta de serviço do Google

A aplicação precisa de credenciais próprias para ler/escrever na planilha
sem depender de login de uma pessoa. Isso é uma *conta de serviço* do Google
Cloud:

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) (pode
   usar a mesma conta Google que já tem acesso à planilha, ou qualquer
   conta — a conta de serviço é independente).
2. Crie um projeto (ou use um existente) → menu **APIs e Serviços →
   Biblioteca** → busque **Google Sheets API** → **Ativar**.
3. **APIs e Serviços → Credenciais → Criar credenciais → Conta de serviço**.
   Dê um nome (ex: "majora-recursos-app") e crie.
4. Abra a conta de serviço criada → aba **Chaves → Adicionar chave → Criar
   nova chave → JSON**. Isso baixa um arquivo `.json` — guarde-o com
   cuidado, ele não pode ser baixado de novo (só recriado).
5. Copie o campo `"client_email"` do JSON — é um endereço parecido com
   `algo@seu-projeto.iam.gserviceaccount.com`.

### 2.2 Compartilhar a planilha com a conta de serviço

1. Abra a planilha `RECURSOS_-_PREENCHIDA_ajustada` no Google Sheets.
2. **Compartilhar** → cole o e-mail da conta de serviço (`client_email`) →
   permissão **Editor**.
3. Confira o nome exato da aba onde estão os dados (a etiqueta na parte de
   baixo da planilha) — você vai precisar dele no próximo passo.

### 2.3 Configurar as variáveis de ambiente no Vercel

Aba **Settings → Environment Variables** do projeto `majora-oguardas`:

| Nome | Valor |
|---|---|
| `GOOGLE_SHEETS_SPREADSHEET_ID` | `1DK-qyKKTYoQn56BIWVXyVnp0JwJhJi0vCtc0uAR9I-E` |
| `GOOGLE_SHEETS_TAB_NAME` | o nome exato da aba (passo 2.2) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | o `client_email` do JSON |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | o `private_key` do JSON, colado como veio (com as quebras de linha) |
| `SESSION_SECRET` | uma string aleatória longa (`openssl rand -base64 32`) |

Marque todas para Production e Preview. Também é preciso conectar o
**Vercel Blob** (aba **Storage → Create Database → Blob**, sem configuração
adicional — injeta `BLOB_READ_WRITE_TOKEN` sozinho) para os PDFs de recurso.

### 2.4 Preparar a planilha (rodar uma vez)

```bash
npm install
GOOGLE_SHEETS_SPREADSHEET_ID="1DK-qyKKTYoQn56BIWVXyVnp0JwJhJi0vCtc0uAR9I-E" \
GOOGLE_SHEETS_TAB_NAME="nome-da-aba" \
GOOGLE_SERVICE_ACCOUNT_EMAIL="..." \
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="..." \
  npm run inicializar-planilha
```

Isso garante o cabeçalho das colunas L-N e cria a aba `Log_Eventos`, se
ainda não existirem. Idempotente — pode rodar de novo sem duplicar nada.
Não precisa de nenhum passo de "importação" além disso — os 30 registros já
estão na planilha.

### 2.5 Deploy

Sem passo manual: cada push nesta branch gera um deploy novo. Depois de
configurar as variáveis acima e rodar a preparação da planilha, a próxima
visita a `https://majora-oguardas.vercel.app` já funciona com dados reais.

---

## 3. Fluxo funcional (como implementado)

1. **Identificação por CPF** (`POST /api/buscar-cpf`): o servidor digita o
   CPF completo. O sistema lê a planilha inteira, localiza a linha
   correspondente e revela **apenas o nome**.
2. **Senha** (`POST /api/validar-senha`): últimos 4 dígitos do CPF. 5
   tentativas erradas bloqueiam o registro por 15 minutos (gravado nas
   colunas M/N da própria planilha). Em caso de sucesso, emite um token de
   sessão (JWT, 15 min) e retorna nome, matrícula, classe, status e o link
   da resposta em PDF (`/respostas/<matricula_key>.pdf`, arquivo estático).
3. **Sua manifestação**: mostra a decisão (`Deferido`/`Indeferido`) e um
   botão para baixar a resposta completa. Se um recurso já tiver sido
   enviado antes (coluna `Recurso` preenchida), mostra a data e o link para
   baixá-lo, com a opção de enviar um novo (substitui o anterior).
4. **Recurso** (`POST /api/recurso`): o texto digitado é transformado em PDF
   (`lib/pdf.js`) e enviado ao Vercel Blob; o link e a data são gravados nas
   colunas `Recurso`/`Data_Recurso` da planilha, e uma linha é adicionada à
   aba `Log_Eventos`.
5. **Tela final**: confirma o registro com data/hora e link para baixar o
   recurso gerado.

---

## 4. Segurança e LGPD

Mesma base de risco e mesmos controles de identificação das fases
anteriores (CPF completo + senha de 4 dígitos é baixa fricção, não
autenticação forte). Pontos específicos desta fase:

- **A planilha é o dado.** Qualquer pessoa com acesso de edição/visualização
  à planilha já vê tudo que o app vê (e mais: CPF completo, matrícula,
  todas as colunas). Isso não é diferente do que já acontecia antes de
  existir este app — mas vale lembrar que restringir o compartilhamento da
  planilha é, agora, o principal controle de acesso aos dados, mais até do
  que qualquer coisa no código.
- **A conta de serviço tem permissão de Editor na planilha inteira** — o
  código só lê/escreve as colunas descritas acima, mas a credencial em si
  poderia escrever em qualquer célula. Trate
  `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` como um segredo tão sensível quanto
  uma senha de banco de dados.
- **Sem limite global de consultas por CPF/minuto nesta fase** (existia na
  versão com Postgres). Como a Sheets API não tem uma forma simples de
  contador atômico, e o universo de usuários é fechado e conhecido (30
  CPFs), a proteção prática contra tentativas automatizadas passa a ser só
  o bloqueio por registro (5 tentativas → 15 min), que continua valendo.
- **Resposta em PDF como arquivo estático**: mesma observação das fases
  anteriores — a URL não é adivinhável a partir da interface, mas também
  não exige autenticação para quem já tiver o link exato.
- **Recurso em PDF (Blob público)**: mesmo modelo — URL aleatória e
  imprevisível, não protegida por autenticação adicional.
- **O texto do recurso não fica na planilha** — só o link do PDF gerado.
  Isso evita colunas gigantes na planilha e mantém o texto integral só no
  PDF (que é, ele mesmo, o documento oficial do recurso).

---

## 5. Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha as variáveis do Google e a SESSION_SECRET
npm run dev                   # http://localhost:3000
```

---

## 6. Limitações conhecidas / decisões de design

- **Concorrência**: a Sheets API não oferece transações. Se dois servidores
  errarem a senha na mesma fração de segundo, é teoricamente possível uma
  leitura-e-escrita do contador de tentativas se sobrepor (um "perde" um
  incremento). Para 30 usuários conhecidos, o risco prático é desprezível;
  não há bloqueio incorreto de sessões alheias, só um cenário raro em que o
  contador de tentativas fica levemente atrasado.
- **Latência**: cada etapa faz pelo menos uma chamada à Sheets API (mais
  lenta que uma consulta a um banco dedicado). Para 30 usuários acessando
  esporadicamente, isso não é perceptível.
- **Sem limite global de consultas por CPF/minuto** — ver seção 4.
- As respostas em PDF (`public/respostas/`) são um retrato estático do
  momento em que foram exportadas dos `Minuta_Voto_*.docx` do Drive. Se a
  SEGEP corrigir uma Minuta de Voto depois, o PDF correspondente precisa ser
  substituído manualmente (sem sincronização automática com o Drive).
- `public/respostas/01277011.pdf` (Ubirajara Gomes da Fonseca) é uma
  exceção: o `.docx` original tem 12,3MB (provavelmente por imagens
  digitalizadas em alta resolução) e não pôde ser baixado diretamente. O
  conteúdo foi conferido e está completo (relatório, fundamentação,
  conclusão, data e assinaturas), mas o PDF foi reconstruído a partir do
  texto — a tabela "DADOS DO PROCESSO" no topo quebra linha de forma um
  pouco estranha (cosmético, não afeta a informação).
- Assim como nas fases anteriores, não existe uma tela autenticada para a
  SEGEP consultar recursos — o acesso é direto pela própria planilha (coluna
  `Recurso`) e pela aba `Log_Eventos`.
- A geração de PDF (`pdfkit`) foi validada localmente; ainda não foi testada
  numa execução real no Vercel. Se o download do recurso falhar em
  produção, a causa mais provável são arquivos de fonte do `pdfkit` não
  incluídos no bundle serverless — nesse caso, adicionar
  `outputFileTracingIncludes` no `next.config.mjs` apontando para
  `node_modules/pdfkit/js/standard-fonts/**` resolve.
