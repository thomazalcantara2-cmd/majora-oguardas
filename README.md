# Resposta ao Recurso — Majoração de Jornada 40h

Aplicação web (Next.js, hospedada no Vercel) para que os **7 servidores que
apresentaram recurso** contra a decisão sobre sua manifestação (classificação
prévia da majoração de jornada, 30h → 40h) consultem a resposta da SEGEP a
esse recurso.

Esta é uma fase somente de consulta: o app não recebe mais texto de recurso
nem anexos — quem apresentou recurso já o fez antes; agora só falta entregar
a resposta da SEGEP a cada um deles.

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
| Banco de dados | A própria Planilha Google — lida através de um Web App do Apps Script |
| Controle de acesso | Lista fixa de 7 nomes em `lib/db.js` (`SERVIDORES_COM_ACESSO`) — só quem está nessa lista consegue entrar, mesmo que o CPF/senha estejam certos |
| Resposta ao recurso | PDF colocado manualmente pela SEGEP na pasta do próprio servidor no Drive, com "RESPOSTA" em algum lugar do nome do arquivo; o Apps Script localiza esse arquivo dinamicamente |

Como o repositório já está conectado ao Vercel, **qualquer push nesta branch
gera um novo deploy automaticamente**.

## Arquivos deste projeto

| Caminho | Função |
|---|---|
| `app/page.js` | Página única com o fluxo (CPF → senha → resposta ao recurso) |
| `app/layout.js`, `app/globals.css` | Layout raiz e estilos |
| `app/api/buscar-cpf/route.js` | Etapa 1 — localizar servidor pelo CPF (só entre os 7 com acesso) |
| `app/api/validar-senha/route.js` | Etapa 2 — validar senha e retornar o link da resposta ao recurso |
| `lib/sheets.js` | Cliente HTTP do Web App do Apps Script |
| `lib/db.js` | Camada fina sobre `lib/sheets.js`; também guarda a lista de nomes com acesso |
| `apps-script/Code.gs` | O Web App em si — cole no editor Apps Script vinculado à planilha |
| `apps-script/appsscript.json` | Manifesto do projeto Apps Script |
| `public/logo-pmjg.png` | Brasão da Prefeitura, usado no cabeçalho da página web |

---

## 1. Quem tem acesso

Só estes 7 nomes (exatamente como estão na coluna `NOME` da planilha, ver
`SERVIDORES_COM_ACESSO` em `lib/db.js`) conseguem passar da etapa de CPF:

- REINALDO BURGOS JUNIOR
- ROSA MARIA FERREIRA DO NASCIMENTO
- JAILSON RODRIGUES DA SILVA
- NATAN DA SILVA DE SANTANA JUNIOR
- MARIA JUSELY DOS SANTOS
- AGENILDA MERENCIO RAMOS NASCIMENTO
- RONALDO FRANCISCO DA SILVA

Qualquer outro CPF da planilha recebe a mesma mensagem genérica de "CPF não
encontrado" — não há diferença visível entre "CPF não existe" e "CPF existe
mas não está na lista de acesso", para não vazar essa informação.

Para adicionar ou remover alguém dessa lista, edite o array
`SERVIDORES_COM_ACESSO` em `lib/db.js` e faça um novo deploy (push).

## 2. Onde colocar o PDF da resposta

Cada um dos 7 servidores já tem uma subpasta no Drive (mesmo lugar onde
ficam o Requerimento, o Anexo e a Minuta de Voto originais), com o nome
**idêntico** ao da coluna `NOME` na planilha.

**Coloque o PDF da resposta ao recurso dentro da subpasta do servidor
correspondente**, com **"RESPOSTA" em algum lugar do nome do arquivo** — por
exemplo:

```
RESPOSTA_RECURSO_REINALDO_BURGOS_JUNIOR.pdf
```

O Apps Script procura, dentro da pasta do servidor, o PDF mais recente cujo
nome contenha "RESPOSTA" (sem diferenciar maiúsculas/minúsculas) e devolve o
link dele para o app assim que o servidor faz login. Não precisa avisar o
app nem rodar nada — o arquivo aparece disponível assim que for colocado na
pasta certa. Enquanto não houver nenhum PDF com "RESPOSTA" no nome naquela
pasta, o app mostra "resposta ainda não disponível" para aquele servidor.

---

## 3. Estrutura da planilha

Nenhuma coluna nova é necessária nesta fase — as colunas já criadas nas
fases anteriores continuam na planilha (histórico), mas só M e N (controle
de tentativas de senha) seguem sendo escritas pelo app:

| Coluna | Nome | Observações |
|---|---|---|
| A | `CPF` | Pode ter perdido zeros à esquerda por estar numa célula numérica — o app sempre normaliza para 11 dígitos. **É por esta coluna que o Apps Script identifica automaticamente a aba certa** (não importa como a aba se chama) |
| B | `MATR.` | Matrícula, mostrada na tela |
| C | `NOME` | Nome completo — usado tanto para o controle de acesso (seção 1) quanto para achar a subpasta no Drive (seção 2) |
| D-J | — | Não usadas por esta fase do app |
| K, L, O | `Recurso`, `Data_Recurso`, `Anexo_Recurso` | Histórico da fase anterior (recurso apresentado pelo próprio servidor) — não usadas nem escritas por esta fase |
| M | `Tentativas_Falhas` | **Escrita pelo app**: controle de tentativas de senha — não edite manualmente |
| N | `Bloqueado_Até` | **Escrita pelo app**: bloqueio temporário após 5 tentativas erradas — não edite manualmente |

Uma segunda aba, **`Log_Eventos`**, registra para auditoria cada acesso à
resposta (`Timestamp | Matrícula | Tipo`).

---

## 4. Passo a passo de configuração

### 4.1 Implantar o Web App do Apps Script

1. Abra a planilha `RECURSOS_-_PREENCHIDA_ajustada` → **Extensões → Apps
   Script**.
2. Apague o `Code.gs` atual e cole o conteúdo de `apps-script/Code.gs`
   deste repositório.
3. Abra o arquivo de manifesto (ícone de engrenagem → "Mostrar arquivo de
   manifesto `appsscript.json`") e cole o conteúdo de
   `apps-script/appsscript.json`.
4. No menu suspenso de funções (ao lado do botão "Executar"), escolha
   **`definirToken`** e clique em **Executar**. Autorize o script quando
   solicitado. Depois, abra **Ver → Registros de execução** e copie o token
   gerado (uma string longa) — vai precisar dele no passo 4.2.
5. Escolha **`inicializarPlanilha`** no mesmo menu e clique em **Executar**
   (idempotente — se as colunas já existirem, não faz nada).
6. **Implantar → Gerenciar implantações → editar (ícone de lápis) → Nova
   versão**, se já existir uma implantação anterior; ou **Implantar → Nova
   implantação → App da Web** se for a primeira vez:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
7. Copie a **URL do app da Web** (termina em `/exec`) — vai precisar dela no
   passo 4.2 (só se for a primeira implantação; se já existia, a URL não
   muda ao criar uma nova versão).

### 4.2 Variáveis de ambiente no Vercel

Aba **Settings → Environment Variables** do projeto `majora-oguardas`:

| Nome | Valor |
|---|---|
| `APPS_SCRIPT_URL` | a URL copiada no passo 4.1.7 (termina em `/exec`) |
| `APPS_SCRIPT_TOKEN` | o token copiado no passo 4.1.4 |

Marque ambas para Production e Preview, e redeploy (ou aguarde o próximo
push) para valerem.

### 4.3 Deploy

Sem passo manual além do acima: cada push nesta branch gera um deploy novo.

---

## 5. Fluxo funcional (como implementado)

1. **Identificação por CPF** (`POST /api/buscar-cpf`): o Next.js pede ao
   Apps Script todas as linhas, localiza a que bate com o CPF completo
   digitado e confere se o nome está na lista de acesso (seção 1). Se
   passar nos dois critérios, revela **apenas o nome**.
2. **Senha** (`POST /api/validar-senha`): últimos 4 dígitos do CPF. 5
   tentativas erradas bloqueiam o registro por 15 minutos (gravado nas
   colunas M/N pelo Apps Script). Em caso de sucesso, registra o acesso na
   aba `Log_Eventos` e retorna nome, matrícula e o link da resposta ao
   recurso — o Apps Script procura um PDF com "RESPOSTA" no nome dentro da
   pasta do servidor no Drive (seção 2).
3. **Resposta ao Recurso**: mostra matrícula e nome (somente leitura) e um
   botão para baixar a resposta em PDF; se a SEGEP ainda não colocou o
   arquivo na pasta, mostra uma mensagem de "ainda não disponível" em vez
   de um link quebrado.

Não há mais sessão/token entre a etapa 2 e a 3 — a URL da resposta já vem
na própria resposta de `/api/validar-senha`, então não é preciso guardar
nem verificar nada depois disso.

---

## 6. Segurança e LGPD

- **A planilha é o dado.** Qualquer pessoa com acesso de edição/visualização
  à planilha já vê tudo que o app vê (e mais: CPF completo, matrícula,
  todas as colunas). Restringir o compartilhamento da planilha é, na
  prática, o principal controle de acesso aos dados — mais até do que
  qualquer coisa no código.
- **A lista de 7 nomes (`SERVIDORES_COM_ACESSO` em `lib/db.js`) é o
  controle de acesso desta fase** — mesmo alguém com um CPF/senha corretos
  da planilha (um dos outros ~23 servidores) não consegue passar da etapa
  de CPF se o nome não estiver na lista.
- **O token do Apps Script (`APPS_SCRIPT_TOKEN`) é a única coisa que protege
  o Web App.** Ele é implantado com acesso "Qualquer pessoa" porque o
  Vercel precisa chamá-lo sem login do Google — então esse token faz o
  papel de senha da API. Trate-o como um segredo (mesmo nível de cuidado de
  uma senha de banco de dados). Se precisar trocá-lo, rode `definirToken()`
  de novo e atualize `APPS_SCRIPT_TOKEN` no Vercel.
- **Sem limite global de consultas por CPF/minuto nesta fase.** Como o
  universo de usuários é fechado e pequeno (7 pessoas), a proteção prática
  contra tentativas automatizadas é o bloqueio por registro (5 tentativas →
  15 min), que continua valendo.
- **Resposta em PDF (Google Drive)**: o link é gerado com compartilhamento
  "qualquer pessoa com o link pode visualizar" — URL longa e imprevisível,
  sem autenticação adicional para quem já tiver o link exato (mas para
  chegar até ele é preciso primeiro passar por CPF + senha no app).
- **Nome da subpasta precisa bater exatamente com a coluna `NOME`.** Se a
  SEGEP renomear uma pasta de servidor ou o nome na planilha for digitado
  de forma diferente do nome da pasta, a busca pela resposta falha (o Apps
  Script devolve um erro específico avisando isso).

---

## 7. Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha APPS_SCRIPT_URL e APPS_SCRIPT_TOKEN
npm run dev                   # http://localhost:3000
```

O Web App do Apps Script (seção 4.1) precisa já estar implantado — não tem
"modo local" para ele, o `npm run dev` na sua máquina já chama a mesma URL
de produção do Apps Script.

---

## 8. Limitações conhecidas / decisões de design

- **Concorrência**: o Apps Script processa uma requisição por vez por
  padrão, mas não há transação de verdade entre "ler o contador de
  tentativas" e "escrever o incremento". Para 7 usuários conhecidos, o
  risco prático é desprezível.
- **Latência**: cada etapa faz pelo menos uma chamada HTTP ao Apps Script
  (mais lento que um banco dedicado, e o primeiro request após um tempo
  ocioso pode ter um "cold start" de alguns segundos).
- Não existe uma tela autenticada para a SEGEP acompanhar quem já acessou a
  resposta — o acompanhamento é direto pela aba `Log_Eventos` da planilha.
- **Fase anterior removida**: o recurso escrito pelo próprio servidor
  (texto → PDF via `pdfkit`, com anexo opcional) não é mais uma
  funcionalidade deste app — os 7 servidores já apresentaram seu recurso
  antes, e essa parte do código (`lib/pdf.js`, `lib/logoBase64.js`,
  `lib/session.js`, `app/api/recurso/`) foi removida junto com as
  dependências `pdfkit` e `jose`. O histórico desses recursos (colunas
  `Recurso`/`Data_Recurso`/`Anexo_Recurso`) continua na planilha, só não é
  mais lido nem escrito pelo app.
- **Identidade visual**: a página segue o padrão visual da marca Prefeitura
  do Jaboatão dos Guararapes (Archivo, azul institucional `#0A32B4`, hero em
  degradê laranja/amarelo).
