# Sistema de Confirmação de Dados Cadastrais — Majoração de Jornada 40h

Aplicação web (Google Apps Script + Google Sheets) para que servidores confirmem os
próprios dados de requerimento de majoração de jornada semanal de 30h para 40h, e
registrem um requerimento em texto com anexo, se precisarem relatar algo.

## Arquivos deste projeto

| Arquivo | Função |
|---|---|
| `Code.gs` | Backend (leitura/escrita na planilha, busca, autenticação, upload de anexos) |
| `Index.html` | Estrutura da página (as 4 etapas do fluxo) |
| `CSS.html` | Estilos (mobile-first) |
| `JS.html` | Lógica de cliente (chamadas `google.script.run`, validações) |
| `appsscript.json` | Manifesto do projeto Apps Script |

Todos esses arquivos vão para dentro do **mesmo** projeto Apps Script (vinculado à
planilha — "container-bound script").

---

## 1. Estrutura da Planilha Google

Crie (ou use) uma Planilha Google com as abas abaixo. Só a aba **Cadastro** precisa
ser pré-carregada manualmente por você; as abas **Log_Alterações** e
**Requerimentos** são criadas/preenchidas automaticamente pelo sistema (você pode
rodar `inicializarPlanilha()` uma vez para criar os cabeçalhos, ver seção 3).

### Aba `Cadastro` (pré-carregada por você)

Sua lista de origem vem como `Ordem | CPF | MATR. | NOME | CLASSE | DATA`. O
mapeamento para a aba `Cadastro` é:

| Coluna | Nome | Vem de | Observações |
|---|---|---|---|
| A | `Matrícula` | `MATR.` | Identificador único do servidor |
| B | `Nome` | `NOME` | Nome completo |
| C | `CPF` | `CPF` | Pode nascer vazio e ser preenchido depois, conforme o cruzamento com a base da SEGEP for avançando — só passa a valer como senha de acesso quando estiver preenchido naquela linha. Aceita com ou sem pontuação (o sistema normaliza) |
| D | `Classe` | `CLASSE` | Ex: GM I, GM II, Inspetor, Subinspetor, Subinspetora, Inspetora. **Não aparece na página** — fica só na planilha, para uso interno da SEGEP |
| E | `Ordem` | `Ordem` | Número de ordem do protocolo original. Exibido na página, mas **somente leitura** |
| F | `Data_Requerimento` | `DATA` | Data (e hora, se houver) do requerimento original de majoração. Exibido na página, mas **somente leitura** |
| G | `Requereu_40h` | *(não existe na lista de origem)* | A lista inteira é composta por quem já requereu a majoração, então esta coluna deve ser `Sim` em todas as linhas — rode `preencherRequereu40hSeVazio()` uma vez para preencher automaticamente onde estiver em branco. **Não aparece na página** |
| H | `Status_Confirmação` | *(gerado pelo sistema)* | Preenchido pelo sistema: vazio/`Pendente` ou `Confirmado` |
| I | `Data_Confirmação` | *(gerado pelo sistema)* | Preenchida pelo sistema no momento em que o servidor confirma |

**Colunas de controle do sistema (não fazem parte da lista original — são criadas e
usadas apenas para limitar tentativas de senha; não edite manualmente):**

| Coluna | Nome | Observações |
|---|---|---|
| J | `Tentativas_Falhas` | Contador de tentativas de senha incorretas para aquele registro |
| K | `Bloqueado_Até` | Timestamp até quando o acesso àquele registro fica bloqueado, após 5 tentativas erradas |

A primeira linha deve conter os cabeçalhos exatamente como acima (rode
`inicializarPlanilha()` para garantir isso automaticamente).

> `Classe` e `Requereu_40h` continuam na planilha (podem ser úteis para
> filtros e relatórios internos da SEGEP), mas não são exibidas nem
> perguntadas na página. Todos os dados exibidos — Matrícula, Nome, CPF
> mascarado, Ordem, Data/hora do requerimento e status — são **somente
> leitura**: o servidor confere, mas não edita nada por aqui (ver seção 3).
> Como não há mais coluna `Regional`/`Lotação`, a identificação também não
> depende de desambiguar nomes parecidos: o CPF completo, que é único por
> pessoa, já identifica a linha certa.

### Aba `Log_Alterações` (gerada pelo sistema)

| Timestamp | Matrícula | Campo_Alterado | Valor_Anterior | Valor_Novo | Tipo |
|---|---|---|---|---|---|

- Uma linha resumo (`Tipo = Confirmação`) é criada a cada vez que o servidor
  confirma os dados.
- Como nenhum campo é editável pelo autoatendimento, não há mais linhas de
  correção geradas automaticamente nesta aba — se o servidor perceber algo
  errado, ele relata no campo "Requerimento" (aba `Requerimentos`), e a
  correção em si é feita manualmente pela SEGEP direto na aba `Cadastro`.

### Aba `Requerimentos` (gerada pelo sistema, só ganha linha se o servidor preencher algo)

| Timestamp | Matrícula | Nome | Texto_Requerimento | Link_Anexo | Status_Análise |
|---|---|---|---|---|---|

- `Status_Análise` começa sempre como `Pendente`. Cabe à SEGEP atualizar
  manualmente conforme o requerimento for analisado.

---

## 2. Passo a passo de implantação

### 2.1 Preparar a planilha

1. Crie uma Planilha Google nova (ou use uma existente).
2. Crie a aba `Cadastro` com os cabeçalhos da seção 1 e importe/cole os dados de
   `Ordem`, `MATR.`, `NOME`, `CLASSE` e `DATA` da sua lista de origem, cada um
   na coluna correspondente. Deixe `CPF` vazio se ainda não tiver sido
   cruzado — ele pode ser preenchido depois, linha por linha, conforme o
   cruzamento com a base da SEGEP avançar.
3. Extensões → Apps Script para abrir o editor vinculado a essa planilha.

### 2.2 Colar o código

1. No editor Apps Script, apague o `Code.gs` padrão e cole o conteúdo do
   `Code.gs` deste projeto.
2. Crie os arquivos HTML: menu **+ → HTML**, nomeie exatamente `Index`, `CSS`,
   `JS` (sem a extensão `.html` — o Apps Script adiciona sozinho) e cole o
   conteúdo de `Index.html`, `CSS.html` e `JS.html` respectivamente.
3. Abra o arquivo de manifesto (ícone de engrenagem → "Mostrar arquivo de
   manifesto `appsscript.json`") e cole o conteúdo de `appsscript.json` deste
   projeto (ou ajuste `access`/`executeAs` conforme a política da prefeitura).

### 2.3 Criar a pasta de anexos no Google Drive

1. Crie uma pasta no Google Drive dedicada aos anexos dos requerimentos (ex:
   "Anexos — Majoração 40h"). Restrinja o compartilhamento dessa pasta a quem
   realmente precisa acessar (ex: apenas você e a equipe da SEGEP).
2. Copie o ID da pasta (a parte da URL depois de `/folders/`).
3. No editor Apps Script: ⚙️ **Configurações do projeto → Propriedades do
   script → Adicionar propriedade do script**. Nome: `DRIVE_FOLDER_ID`. Valor:
   o ID copiado.

### 2.4 Inicializar a planilha

1. No editor, selecione a função `inicializarPlanilha` no menu suspenso de
   funções (ao lado do botão "Executar") e clique em **Executar**.
2. Na primeira execução, o Google vai pedir autorização (escopos de
   Planilhas, Drive e serviço de UI) — revise e autorize com a conta que será
   a "dona" do script.
3. Isso cria/normaliza os cabeçalhos das abas `Cadastro` (incluindo as duas
   colunas de controle J/K), `Log_Alterações` e `Requerimentos`.
4. Rode também `preencherRequereu40hSeVazio` uma vez (mesmo processo: escolher
   a função no menu suspenso e clicar em **Executar**) para marcar `Sim` em
   toda linha cuja coluna `Requereu_40h` esteja em branco.

### 2.5 Publicar como Web App

1. **Implantar → Nova implantação**.
2. Tipo: **App da Web**.
3. Descrição: ex. "Confirmação 40h — v1".
4. **Executar como**: "Eu" (a conta dona do script — assim o script tem
   permissão de escrever na planilha e no Drive independentemente de quem
   acessa o link).
5. **Quem pode acessar**: "Qualquer pessoa" (ou "Qualquer pessoa com o link"),
   já que os servidores não necessariamente têm conta Google corporativa e não
   devem precisar fazer login para acessar — a autenticação é feita pela
   própria aplicação (CPF + senha = últimos 4 dígitos do CPF).
6. Clique em **Implantar** e autorize novamente se solicitado.
7. Copie a **URL do app da Web** gerada — esse é o link único a compartilhar
   com os servidores.

### 2.6 Atualizações futuras

Sempre que alterar o código depois da primeira implantação, use **Implantar →
Gerenciar implantações → editar (ícone de lápis) → Nova versão** para que a
URL já compartilhada passe a refletir o código atualizado (a URL em si não
muda).

---

## 3. Fluxo funcional (como implementado)

1. **Identificação por CPF** (`buscarPorCpf`): o servidor digita o CPF
   completo (11 dígitos, com ou sem pontuação). O sistema localiza a linha
   correspondente na aba `Cadastro` e revela **apenas o nome** — nenhum outro
   dado (matrícula, classe, status etc.) é retornado nesta etapa. O
   identificador devolvido ao cliente (`id`) é só o número da linha na
   planilha; sozinho, ele não expõe nenhuma informação pessoal. Como o CPF é
   único por pessoa, essa etapa substitui a antiga busca por nome com lista de
   sugestões — não há mais ambiguidade de homônimos a resolver.
   Como mitigação simples contra tentativas automatizadas de descobrir nomes
   testando CPFs em sequência, há também um limite global (todas as sessões
   somadas) de consultas por minuto (`consultaDentroDoLimiteGlobal_`). Isso
   **não substitui** um rate-limit por IP — o Apps Script não expõe o IP do
   cliente (ver seção "LGPD" abaixo) — é só uma segunda camada de fricção.
2. **Senha** (`validarSenha`): compara os últimos 4 dígitos do CPF armazenado
   (ignorando pontuação) com o valor digitado nesta etapa. Sempre retorna a
   mesma mensagem genérica em caso de erro. Após 5 tentativas erradas naquele
   registro, bloqueia novas tentativas por 15 minutos (contador e bloqueio
   persistidos nas colunas J/K da aba `Cadastro`, então sobrevivem a
   reinícios do script). Em caso de sucesso, gera um **token de sessão
   opaco** (UUID), válido por 15 minutos via `CacheService`, e nunca mais
   reenvia a senha nas chamadas seguintes.
3. **Exibição dos dados**: o CPF nunca é enviado ao cliente em texto — o
   servidor só vê o placeholder fixo `XXX.XXX.XXX-**`, mesmo sendo o dono do
   registro. Isso é deliberado (ver seção "LGPD" abaixo). A tela mostra
   Matrícula, Nome, CPF mascarado, Ordem, Data/hora do requerimento e status
   — `Classe` e `Requereu_40h` não são exibidas (ficam só na planilha). Todos
   os campos aparecem desabilitados: nada nessa tela é editável pelo
   autoatendimento.
4. **Confirmar** (`registrarConfirmacao`): grava `Status_Confirmação =
   Confirmado` e `Data_Confirmação = agora`, e uma linha resumo em
   `Log_Alterações`. Se o servidor preencheu texto de requerimento e/ou
   anexo, uma linha também é criada em `Requerimentos` (`Status_Análise =
   Pendente`) e o arquivo é salvo na pasta do Drive configurada — esse
   requerimento é o canal para relatar qualquer dado incorreto; a correção em
   si é feita manualmente pela SEGEP na aba `Cadastro`, depois de ler o
   requerimento.
5. **Tela final**: confirma o registro com data/hora e menciona se o
   requerimento foi recebido.

---

## 4. Segurança e LGPD

**Por que a identificação por CPF + senha de 4 dígitos é fraca — e por que
isso é aceitável aqui, com os controles certos:**

O CPF é dado pessoal (LGPD, art. 5º, I). Como o fluxo pedido usa o CPF
completo como chave de busca (etapa 1) e os últimos 4 dígitos do próprio CPF
como "senha" (etapa 2), é importante deixar claro, sem rodeios, o que isso
significa na prática: **quem já sabe o CPF completo de alguém também sabe,
por definição, os últimos 4 dígitos.** A etapa de senha não é um segundo
fator independente — ela funciona como uma segunda digitação de confirmação
("você tem certeza de que é você mesmo, e não digitou o CPF de outra pessoa
por engano"), não como uma barreira adicional contra quem já tem o CPF em
mãos. O controle de acesso real deste sistema é, na prática, **"só quem sabe
o CPF de alguém consegue ver o nome e os dados dessa pessoa"** — um
mecanismo de **baixa fricção para autoconfirmação de dados já sob custódia
da administração**, não uma autenticação forte. O sistema foi desenhado
assumindo isso, com controles compensatórios obrigatórios:

- **A etapa de CPF revela só o nome, nada além disso.** Matrícula, classe,
  status e demais dados só aparecem depois da senha confirmada.
- **Limite global de consultas por minuto** (todas as sessões somadas) na
  etapa de CPF, para dificultar — sem eliminar — tentativas automatizadas de
  descobrir nomes testando CPFs em sequência (ver limitação sobre IP abaixo).
- **Mascaramento total do CPF na tela de dados** — nem o próprio servidor vê
  o CPF completo (placeholder fixo `XXX.XXX.XXX-**`). Como ele já digitou o
  CPF completo para entrar, não há necessidade de reexibi-lo; mostrar de novo
  só aumentaria a superfície de exposição (ex.: print de tela,
  compartilhamento de tela, uso em local público).
- **Mensagem de erro genérica** na etapa de senha, para não ajudar tentativas
  de enumeração de quem já passou da etapa de CPF.
- **Limite de tentativas de senha** (5) com bloqueio temporário (15 min) por
  registro, persistido na própria planilha.
- **Nenhum campo é editável pelo autoatendimento** — toda a tela de dados é
  somente leitura. Se algo estiver errado, o relato vai pelo Requerimento e a
  correção em si é feita manualmente pela SEGEP na aba `Cadastro`, nunca
  automaticamente a partir do que o servidor digitou.
- **Token de sessão de curta duração** — depois da senha validada, as ações
  seguintes (confirmar dados / enviar requerimento) usam um token opaco de
  15 minutos, não a senha ou a matrícula.
- **Anexos** ficam em uma pasta do Drive controlada por você (não pública por
  padrão), e o link salvo na planilha `Requerimentos` só é visível a quem tem
  acesso à planilha.
- **HTTPS**: nativo do Google Apps Script Web App — todo tráfego, incluindo a
  senha digitada, é criptografado em trânsito.

**Sobre IP/user-agent (auditoria):** o Google Apps Script (HtmlService) **não
expõe o endereço IP do cliente** ao código do servidor — não há API para isso.
Por essa limitação técnica, este projeto não implementa registro de IP. Caso a
SEGEP precise de auditoria por IP, isso exigiria uma camada adicional fora do
Apps Script (ex.: proxy reverso ou serviço externo), o que está fora do
escopo desta entrega. Se desejar, é possível registrar o `user-agent` do
navegador (enviado pelo próprio cliente, portanto não é garantia de
integridade) — avise se quiser que essa coluna extra seja adicionada ao log.

---

## 5. Limitações conhecidas / decisões de design

- O identificador retornado pela busca (`id`) é o número da linha na
  planilha. Isso funciona bem para uma lista relativamente estática; se
  linhas forem reordenadas/excluídas manualmente na aba `Cadastro` **enquanto
  um servidor está no meio do fluxo**, a sessão dele pode ficar inválida (o
  pior caso é um erro de sessão expirada, nunca exposição de dado de
  outra pessoa).
- O token de sessão usa `CacheService` (memória temporária do Google, até 15
  min). Isso é intencional: nada de identidade fica "lembrado" além do tempo
  necessário para o servidor concluir o formulário.
- Nenhum campo é editável pelo próprio servidor nesta tela — toda a tela de
  dados (Matrícula, Nome, CPF, Ordem, Data/hora do requerimento) é somente
  leitura. Qualquer correção deve ser tratada diretamente com a SEGEP,
  normalmente a partir do que o servidor descrever no campo Requerimento.
