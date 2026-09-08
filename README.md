# Resposta à Manifestação e Recurso — Majoração de Jornada 40h

Aplicação web (Next.js, hospedada no Vercel) para que os servidores que
apresentaram manifestação contra a classificação prévia da majoração de
jornada (30h → 40h) consultem a resposta da SEGEP e, se quiserem, apresentem
recurso.

> **O "banco de dados" é a própria Planilha Google** `RECURSOS_-_PREENCHIDA_ajustada`
> — a SEGEP continua trabalhando nela normalmente. A ponte entre o Vercel e a
> planilha é um pequeno **Web App do Google Apps Script** (pasta
> `apps-script/`): ele roda com as permissões de quem o implantou, então não
> é preciso Google Cloud Console, conta de serviço, nem compartilhar a
> planilha com mais ninguém.

## Arquitetura

| Peça | Tecnologia |
|---|---|
| Framework | Next.js (App Router), hospedado no Vercel |
| Banco de dados | A própria Planilha Google — lida/escrita através de um Web App do Apps Script |
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
| `lib/sheets.js` | Cliente HTTP do Web App do Apps Script |
| `lib/db.js` | Camada fina sobre `lib/sheets.js` com os nomes de função que as rotas usam |
| `lib/session.js` | Emissão/verificação do token de sessão (JWT) |
| `lib/pdf.js` | Geração do PDF do recurso (`pdfkit`) |
| `apps-script/Code.gs` | O Web App em si — cole no editor Apps Script vinculado à planilha |
| `apps-script/appsscript.json` | Manifesto do projeto Apps Script |
| `public/respostas/*.pdf` | As 30 respostas (Minuta de Voto), uma por servidor |

---

## 1. Estrutura da planilha

Colunas A-K já existem na planilha de origem; L-N são criadas pelo
`inicializarPlanilha()` do Apps Script (seção 2.2):

| Coluna | Nome | Observações |
|---|---|---|
| A | `CPF` | Pode ter perdido zeros à esquerda por estar numa célula numérica — o app sempre normaliza para 11 dígitos. **É por esta coluna que o Apps Script identifica automaticamente a aba certa** (não importa como a aba se chama) |
| B | `MATR.` | Matrícula como está na planilha (ex: `0.0195308.1`). Só os dígitos formam a `matricula_key`, usada para achar o PDF em `public/respostas/` |
| C | `NOME` | Nome completo |
| D | `CLASSE` | Ex: GM I, GM II, Inspetor, Subinspetor, Subinspetora |
| E, F | `DATA 1º SOLICITAÇÃO`, `DATA MANIFESTAÇÃO` | Não usadas pelo app |
| G | `STATUS` | `DEFERIDO` ou `INDEFERIDO` (qualquer capitalização) — decisão sobre a manifestação |
| H, I, J | `link do Requerimento`, `link do Anexo`, `link da minuta do voto` | Não usadas pelo app |
| K | `Recurso` | **Escrita pelo app**: link do PDF do recurso, quando o servidor envia um |
| L | `Data_Recurso` | **Escrita pelo app**: data/hora do envio (ISO 8601) |
| M | `Tentativas_Falhas` | **Escrita pelo app**: controle de tentativas de senha — não edite manualmente |
| N | `Bloqueado_Até` | **Escrita pelo app**: bloqueio temporário após 5 tentativas erradas — não edite manualmente |

Uma segunda aba, **`Log_Eventos`**, registra para auditoria cada acesso à
resposta e cada recurso apresentado (`Timestamp | Matrícula | Tipo`).

O texto do recurso em si **não** é gravado na planilha (só o link do PDF) —
seguindo o mesmo padrão que a planilha já usa para a manifestação original
(que também guarda só o nome do arquivo, não o texto).

---

## 2. Passo a passo de configuração

### 2.1 Implantar o Web App do Apps Script

1. Abra a planilha `RECURSOS_-_PREENCHIDA_ajustada` → **Extensões → Apps
   Script**.
2. Apague o `Code.gs` padrão e cole o conteúdo de `apps-script/Code.gs`
   deste repositório.
3. Abra o arquivo de manifesto (ícone de engrenagem → "Mostrar arquivo de
   manifesto `appsscript.json`") e cole o conteúdo de
   `apps-script/appsscript.json`.
4. No menu suspenso de funções (ao lado do botão "Executar"), escolha
   **`definirToken`** e clique em **Executar**. Autorize o script quando
   solicitado. Depois, abra **Ver → Registros de execução** e copie o token
   gerado (uma string longa) — vai precisar dele no passo 2.3.
5. Escolha **`inicializarPlanilha`** no mesmo menu e clique em **Executar**.
   Isso cria as colunas L-N e a aba `Log_Eventos`, sem mexer nas colunas
   originais.
6. **Implantar → Nova implantação → App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
7. Copie a **URL do app da Web** gerada (termina em `/exec`) — vai precisar
   dela no passo 2.3.

### 2.2 Conectar o Vercel Blob (para os PDFs de recurso)

Aba **Storage** do projeto no Vercel → **Create Database → Blob** → conectar
ao projeto. Sem configuração adicional — injeta `BLOB_READ_WRITE_TOKEN`
automaticamente.

### 2.3 Variáveis de ambiente no Vercel

Aba **Settings → Environment Variables** do projeto `majora-oguardas`:

| Nome | Valor |
|---|---|
| `APPS_SCRIPT_URL` | a URL copiada no passo 2.1.7 (termina em `/exec`) |
| `APPS_SCRIPT_TOKEN` | o token copiado no passo 2.1.4 |
| `SESSION_SECRET` | uma string aleatória longa (`openssl rand -base64 32`) |

Marque todas para Production e Preview, e redeploy (ou aguarde o próximo
push) para valerem.

### 2.4 Deploy

Sem passo manual além do acima: cada push nesta branch gera um deploy novo.
Depois de configurar as variáveis, a próxima visita a
`https://majora-oguardas.vercel.app` já funciona com dados reais — os 30
registros já estão na planilha, não há "importação" a fazer.

### 2.5 Atualizações futuras do Apps Script

Se `apps-script/Code.gs` mudar depois da primeira implantação, use
**Implantar → Gerenciar implantações → editar (ícone de lápis) → Nova
versão** no editor Apps Script para que a URL já configurada no Vercel passe
a rodar o código atualizado (a URL em si não muda).

---

## 3. Fluxo funcional (como implementado)

1. **Identificação por CPF** (`POST /api/buscar-cpf`): o Next.js pede ao
   Apps Script todas as linhas, localiza a que bate com o CPF completo
   digitado e revela **apenas o nome**.
2. **Senha** (`POST /api/validar-senha`): últimos 4 dígitos do CPF. 5
   tentativas erradas bloqueiam o registro por 15 minutos (gravado nas
   colunas M/N pelo Apps Script). Em caso de sucesso, emite um token de
   sessão (JWT, 15 min) e retorna nome, matrícula, classe, status e o link
   da resposta em PDF (`/respostas/<matricula_key>.pdf`, arquivo estático).
3. **Sua manifestação**: mostra a decisão (`Deferido`/`Indeferido`) e um
   botão para baixar a resposta completa. Se um recurso já tiver sido
   enviado antes (coluna `Recurso` preenchida), mostra a data e o link para
   baixá-lo, com a opção de enviar um novo (substitui o anterior).
4. **Recurso** (`POST /api/recurso`): o texto digitado é transformado em PDF
   (`lib/pdf.js`) e enviado ao Vercel Blob; o Next.js pede ao Apps Script
   para gravar o link e a data nas colunas `Recurso`/`Data_Recurso`, e uma
   linha é adicionada à aba `Log_Eventos`.
5. **Tela final**: confirma o registro com data/hora e link para baixar o
   recurso gerado.

---

## 4. Segurança e LGPD

Mesma base de risco e mesmos controles de identificação das fases
anteriores (CPF completo + senha de 4 dígitos é baixa fricção, não
autenticação forte). Pontos específicos desta fase:

- **A planilha é o dado.** Qualquer pessoa com acesso de edição/visualização
  à planilha já vê tudo que o app vê (e mais: CPF completo, matrícula,
  todas as colunas). Restringir o compartilhamento da planilha é, na
  prática, o principal controle de acesso aos dados — mais até do que
  qualquer coisa no código.
- **O token do Apps Script (`APPS_SCRIPT_TOKEN`) é a única coisa que protege
  o Web App.** Ele é implantado com acesso "Qualquer pessoa" porque o
  Vercel precisa chamá-lo sem login do Google — então esse token faz o
  papel de senha da API. Trate-o como um segredo (mesmo nível de cuidado de
  uma senha de banco de dados). Se precisar trocá-lo, rode `definirToken()`
  de novo e atualize `APPS_SCRIPT_TOKEN` no Vercel.
- **Sem limite global de consultas por CPF/minuto nesta fase.** Como o
  universo de usuários é fechado e conhecido (30 CPFs), a proteção prática
  contra tentativas automatizadas é o bloqueio por registro (5 tentativas →
  15 min), que continua valendo.
- **Resposta em PDF como arquivo estático**: a URL não é adivinhável a
  partir da interface, mas também não exige autenticação para quem já tiver
  o link exato.
- **Recurso em PDF (Blob público)**: mesmo modelo — URL aleatória e
  imprevisível, não protegida por autenticação adicional.
- **O texto do recurso não fica na planilha** — só o link do PDF gerado.

---

## 5. Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha APPS_SCRIPT_URL, APPS_SCRIPT_TOKEN, BLOB_READ_WRITE_TOKEN, SESSION_SECRET
npm run dev                   # http://localhost:3000
```

O Web App do Apps Script (passo 2.1) precisa já estar implantado — não tem
"modo local" para ele, o `npm run dev` na sua máquina já chama a mesma URL
de produção do Apps Script.

---

## 6. Limitações conhecidas / decisões de design

- **Concorrência**: o Apps Script processa uma requisição por vez por
  padrão, mas não há transação de verdade entre "ler o contador de
  tentativas" e "escrever o incremento". Para 30 usuários conhecidos, o
  risco prático é desprezível.
- **Latência**: cada etapa faz pelo menos uma chamada HTTP ao Apps Script
  (mais lento que um banco dedicado, e o primeiro request após um tempo
  ocioso pode ter um "cold start" de alguns segundos). Para 30 usuários
  acessando esporadicamente, isso não chega a ser um problema.
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
- Não existe uma tela autenticada para a SEGEP consultar recursos — o
  acesso é direto pela própria planilha (coluna `Recurso`) e pela aba
  `Log_Eventos`.
- A geração de PDF (`pdfkit`) foi validada localmente; ainda não foi testada
  numa execução real no Vercel. Se o download do recurso falhar em
  produção, a causa mais provável são arquivos de fonte do `pdfkit` não
  incluídos no bundle serverless — nesse caso, adicionar
  `outputFileTracingIncludes` no `next.config.mjs` apontando para
  `node_modules/pdfkit/js/standard-fonts/**` resolve.
