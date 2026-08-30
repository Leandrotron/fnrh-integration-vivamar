# Diagnóstico de reaproveitamento do pré-check-in próprio

Data: 29/08/2026

Escopo: auditoria estática do repositório atual. Nenhuma rota foi executada, nenhuma chamada foi feita à FNRH e nenhum código funcional, banco ou configuração foi alterado.

## 1. Resumo executivo

Há uma base reaproveitável, mas não existe hoje um fluxo moderno completo e seguro de “link próprio → dados locais → pessoa/hóspede oficial em reserva FNRH já existente”.

- `frontend/precheckin.html` existe e é uma prova de conceito pública multipessoa. Ela carrega uma stay por `token` ou por ID, coleta dados de brasileiros e cria registros em `guests`.
- `frontend/stays.html` existe e é o painel administrativo legado que gera o link próprio, mantém stays e hóspedes e aciona o envio inicial à FNRH.
- As duas telas ainda usam endpoints existentes e podem funcionar tecnicamente para cadastro local de brasileiro quando todas as validações do backend são atendidas.
- O formulário público não suporta estrangeiro: CPF é obrigatório, não há passaporte, tipo de documento, nacionalidade nem país de residência.
- O formulário próprio não envia diretamente à FNRH. Ele somente grava `guests`; um operador precisa depois usar o envio da stay.
- `POST /stays/:id/send-fnrh` consegue registrar a hospedagem inicial com hóspedes e persistir os IDs oficiais retornados, mas recusa a operação quando já existe `fnrh_reserva_id`.
- Os fluxos atuais de vínculo exigem um `fnrh_hospede_id` que já exista na FNRH. Não há criação/atualização autônoma de pessoa oficial a partir dos dados locais nem adição dessa nova pessoa a uma reserva oficial já criada.
- O token atual é aleatório e melhor que um ID sequencial, mas não protege o fluxo completo: após resolvê-lo, a página lê e grava usando o ID numérico em rotas sem autenticação. A API também permite listar stays e seus tokens.
- `frontend/reservas.html` deve permanecer como painel principal e o link oficial FNRH deve continuar sendo o caminho padrão. O formulário próprio só é recomendável como opção adicional após fechar a fronteira pública e completar o modelo de documento/nacionalidade.

Conclusão: reaproveitar componentes e validações pontuais; não reativar `precheckin.html` e `stays.html` como fluxo público/operacional sem adaptação.

## 2. `precheckin.html`

### Existência, finalidade e estado

O arquivo existe em `frontend/precheckin.html`. Foi criado historicamente como prova de conceito pública para o hóspede preencher dados ligados a uma stay. O histórico em `docs/DEV_LOG.md` registra a primeira versão como `precheckin.html?stay=ID`; o código atual prioriza `?token=` e ainda aceita `?stay=` como fallback.

Ele não é usado por `reservas.html` nem pelo fluxo principal descrito no README. Continua acessível porque todo o diretório `frontend` é publicado pelo Express e é alcançável a partir do link próprio gerado por `stays.html`. Portanto, é uma tela legada/incompleta, mas não totalmente órfã.

### Contexto esperado na URL

`getStayAccessFromUrl()` aceita:

| Parâmetro | Leitura inicial | Observação |
|---|---|---|
| `token` | `GET /stays/public/:token` | Preferido pelo código atual |
| `stay` | `GET /stays/:id` | Fallback legado com ID sequencial |

Depois da leitura inicial, ambos os caminhos extraem `data.id` e passam a usar o ID numérico em `GET /stays/:id/guests` e `POST /guests`.

### Campos exibidos e enviados

| Campo | UI | Obrigatório no frontend | Enviado a `POST /guests` | Observação |
|---|---:|---:|---:|---|
| Nome completo | sim | sim | sim | obrigatório também no backend |
| CPF | sim | sim, 11 dígitos | sim | backend valida os dígitos verificadores |
| E-mail | sim | não | sim | opcional |
| Telefone | sim | não | sim | opcional; normalizado no backend |
| Data de nascimento | sim | sim | sim | obrigatório também no backend |
| Gênero | sim | sim | sim | enum atual: `HOMEM`, `MULHER`, `OUTRO` |
| Raça/cor | sim | sim | sim | enum atual da aplicação |
| Deficiência | sim | não; default `NAO` | sim | não coleta tipo de deficiência |
| Titular/acompanhante | sim | exige ao menos um titular se a stay ainda não tiver | sim | permite múltiplos titulares no lote |
| CEP | sim | não diretamente | sim | ViaCEP alimenta IDs necessários ao backend |
| Logradouro | sim | não | sim | pode ser necessário no envio FNRH posterior |
| Número | sim | não | sim | opcional localmente |
| Complemento | sim | não | sim | opcional |
| Bairro | sim | não | sim | opcional |
| Cidade visível | sim | não | não | texto digitado não é persistido |
| Estado/UF visível | sim | não | indiretamente | atualiza o `estado_id` oculto |
| `cidade_id` | oculto | não validado na tela | sim | backend exige; normalmente vem do ViaCEP |
| `estado_id` | oculto | não validado na tela | sim | backend exige |
| Placa do veículo | sim | não | sim | não equivale ao domínio FNRH de meio de transporte |
| Adulto | não configurável | fixo em `1` | sim | não há fluxo real de menor |

Campos inexistentes: brasileiro/estrangeiro, tipo de documento, passaporte, país emissor, nacionalidade, país de residência, motivo da viagem, meio de transporte FNRH e consentimento/aceite.

Existe uma inconsistência: CEP/endereço não são declarados obrigatórios no frontend, mas `POST /guests` exige `cidade_id` e `estado_id`. Sem retorno válido do ViaCEP ou preenchimento técnico compatível, o envio falha no backend. A cidade digitada manualmente não resolve isso, pois o texto não é enviado.

### Múltiplos hóspedes e papel

- A tela adiciona e remove vários cards antes do envio.
- Cada card é enviado sequencialmente em um `POST /guests` independente.
- Há resultado total, parcial ou de erro; não existe transação do lote.
- A validação impede repetir CPF apenas dentro do lote corrente. O backend impede CPF duplicado na stay.
- A tela considera titulares já existentes, mas não impede mais de um novo titular.
- Depois do sucesso ela permite continuar cadastrando os demais; registros anteriores não são preenchidos novamente na tela.

### Endpoints e funcionamento atual

| Chamada | Existe | Efeito | FNRH |
|---|---:|---|---:|
| `GET /stays/public/:token` | sim | lê metadados da stay por token | não |
| `GET /stays/:id` | sim | lê metadados da stay por ID | não |
| `GET /stays/:id/guests` | sim | devolve todos os campos dos hóspedes locais | não |
| `POST /guests` | sim | valida e insere um guest no SQLite | não |
| `GET https://viacep.com.br/ws/:cep/json/` | externo | auxilia endereço e código IBGE | não |

O fluxo é compatível com o backend atual para o caso brasileiro, mas é inseguro como fronteira pública e não completa a integração oficial.

## 3. `stays.html`

### Finalidade e estado

`frontend/stays.html` é uma interface interna/administrativa antiga para:

- listar, criar em lote e editar stays;
- gerar/copiar o link próprio de pré-check-in;
- cadastrar, editar e remover hóspedes;
- conferir prontidão local;
- registrar uma stay inicialmente na FNRH;
- exibir o link oficial e o resultado do último envio.

O README e `docs/architecture.md` a classificam explicitamente como interface legada. Ela ainda chama rotas existentes, mas não deve voltar a ser o painel principal. Não há autenticação que imponha tecnicamente seu caráter interno.

### Campos de stay

- `reservation_id`;
- `sub_reservation_id`;
- data de entrada e saída;
- criação em lote com referência;
- quantidades e metadados carregados da stay;
- `public_token`, usado indiretamente para montar o link próprio;
- `fnrh_reserva_id`, link oficial e estados do último envio, recebidos nas leituras.

### Campos de hóspede

- nome completo;
- CPF;
- telefone e e-mail;
- nascimento;
- `cidade_id` e `estado_id` expostos como campos técnicos;
- gênero, raça/cor e deficiência;
- CEP, logradouro, número, complemento e bairro;
- placa do veículo;
- titular/acompanhante;
- adulto fixado como verdadeiro no salvamento.

A tela permite edição e exclusão de hóspedes, recursos que `precheckin.html` não oferece. Em contrapartida, o formulário público oferece cidade/UF amigáveis e vários hóspedes na mesma tela. Nenhuma delas possui documento alternativo, passaporte, nacionalidade, país de residência, motivo da viagem ou meio de transporte FNRH.

O texto de `stays.html` afirma que gênero, raça e deficiência seriam apenas preparatórios, mas o JavaScript atual envia esses três campos e o backend os persiste. A nota visual está desatualizada.

### Endpoints usados

| Endpoint | Operação da tela | Estado atual | Efeito |
|---|---|---:|---|
| `GET /stays` | listar | existe | SQLite; também expõe `public_token` |
| `POST /stays` | criar uma ou várias | existe | SQLite e geração de token |
| `GET /stays/:id` | carregar detalhe | existe | SQLite |
| `PUT /stays/:id` | editar reserva/datas | existe | SQLite |
| `GET /stays/:id/guests` | listar hóspedes | existe | SQLite |
| `POST /guests` | criar hóspede | existe | SQLite |
| `PUT /guests/:id` | editar hóspede | existe | SQLite |
| `DELETE /guests/:id` | remover hóspede | existe | SQLite |
| `POST /stays/:id/send-fnrh` | registrar hospedagem inicial | existe | chama a FNRH e persiste retorno |
| ViaCEP | completar endereço | existe externamente | não FNRH |

O bloco visual do link próprio possui um erro de apresentação: `updateDetailActions()` chama `getPrecheckinLink(stay?.id)`, embora a função espere o objeto stay e leia `public_token`. Por isso o valor mostrado pode permanecer vazio. Os botões de copiar/abrir recalculam o link com o objeto correto e podem continuar funcionando. Isto foi somente diagnosticado, não corrigido.

## 4. Endpoints utilizados

### Cadastro local

`POST /guests` e `PUT /guests/:id` exigem atualmente:

- nome;
- CPF válido;
- nascimento válido;
- papel titular/acompanhante;
- `cidade_id`;
- `estado_id`.

Gênero, raça e deficiência são opcionais no backend, mas validados contra enums quando informados. E-mail, telefone, CEP e componentes de endereço são persistidos, porém não são todos obrigatórios na rota.

### Registro inicial na FNRH

`POST /stays/:id/send-fnrh`:

1. lê a stay e todos os guests locais;
2. bloqueia novo registro se já houver `fnrh_reserva_id` ou guest com `fnrh_hospede_id`;
3. monta `reserva + dados_hospede`;
4. envia ao caminho configurado, documentado como `/hospedagem/registrar`;
5. persiste `fnrh_reserva_id`, link oficial, `fnrh_hospede_id` e `fnrh_pessoa_id` retornados.

O payload completo fixa `PaisNacionalidade_id = BR`, `PaisResidencia_id = BR` e documento `CPF`. Ele não envia motivo da viagem ou meio de transporte FNRH.

### Outros endpoints atuais que não completam a lacuna

- `POST /stays/:stayId/fnrh/vincular-precheckin`: associa à reserva um `fnrh_hospede_id` oficial já existente e grava esse ID em guest local existente.
- `POST /stays/:stayId/fnrh/importar-vincular-precheckin`: associa ficha oficial já existente e cria o guest local mínimo.
- `POST /stays/:stayId/fnrh/importar-hospede-vinculado`: importa para o painel alguém que já pertence oficialmente à reserva.
- `POST /guests/:id/fnrh-checkin` e `/fnrh-checkout`: alteram situação operacional, não dados pessoais.

Não existem no backend atual rotas próprias para criar pessoa FNRH, atualizar dados de pessoa FNRH ou criar um novo hóspede oficial a partir de dados locais dentro de uma reserva FNRH já registrada.

## 5. Persistência local existente

O modelo atual `stays + guests` é a base correta a preservar.

### `stays`

Já guarda contexto comercial, datas, ocupação, token público, `fnrh_reserva_id`, link oficial e resumo do último envio.

### `guests`

Já guarda:

- nome, CPF, e-mail, telefone e nascimento;
- gênero, raça/cor e deficiência;
- cidade/UF, CEP e endereço;
- papel, adulto, placa e estados locais;
- `fnrh_hospede_id`, `fnrh_pessoa_id`;
- situação oficial e timestamps operacionais.

Não guarda tipo/número genérico de documento, passaporte, país emissor, nacionalidade, país de residência, motivo da viagem, meio de transporte FNRH, consentimento nem estado específico de revisão do formulário público.

A tabela histórica `checkins` não deve ser retomada; a própria arquitetura atual define `stays + guests` como direção vigente.

## 6. Integração FNRH existente

Separação por capacidade:

| Capacidade | Estado atual |
|---|---|
| A. Capturar dados no frontend próprio | existe para brasileiros em `precheckin.html` |
| B. Persistir hóspedes localmente | existe em `POST /guests` e `PUT /guests/:id` |
| C. Criar pessoa na FNRH | somente de forma implícita no registro inicial com `dados_hospede`; não há operação autônoma |
| D. Criar/adicionar hóspede na reserva FNRH | existe no registro inicial; vínculo posterior só aceita hóspede oficial já existente |
| E. Atualizar pessoa/hóspede na FNRH | não existe para dados cadastrais; existem somente check-in/checkout e leituras/sincronização de situação |

Não se deve interpretar o formulário completo como prova de envio completo à FNRH. O preenchimento termina no SQLite; o envio oficial é uma ação posterior e tem restrições próprias.

## 7. Brasileiro x estrangeiro

### Brasileiro

O fluxo próprio atual foi desenhado exclusivamente para brasileiro:

- `precheckin.html`, `stays.html`, `reservas.html`, `POST /guests` e `PUT /guests/:id` exigem CPF nos caminhos de cadastro manual;
- o payload inicial fixa nacionalidade e residência em `BR`;
- documento oficial é sempre montado como `CPF`;
- cidade/UF seguem modelo brasileiro e o ViaCEP.

### Estrangeiro

O cadastro próprio quebra para estrangeiro porque:

- CPF é obrigatório no frontend e no backend;
- não há tipo de documento nem passaporte no schema ou payload local;
- não há nacionalidade, país de residência ou país emissor;
- endereço depende de `cidade_id` IBGE e UF;
- o payload força `BR` mesmo que a pessoa seja estrangeira.

O suporte de `reservas.html` a `PASSAPORTE/PASSPORT` existe somente na leitura e apresentação de fichas já retornadas pela FNRH. Ele não torna o cadastro local compatível com estrangeiros. O fluxo sem Gov.br validado recentemente também parte de uma ficha oficial já criada, situação diferente do formulário próprio.

## 8. Componentes reutilizáveis

| Parte | Classificação | Justificativa |
|---|---|---|
| Formulário público como fluxo completo | legado demais / não reaproveitar como está | fronteira pública insegura e exclusivamente brasileira |
| Estrutura mobile e cards de hóspedes | reutilizável com pequena adaptação | UI multipessoa simples e já testada historicamente |
| Máscaras de CPF/telefone/CEP | reutilizável com pequena adaptação | úteis para brasileiro; precisam ser condicionais por nacionalidade/documento |
| ViaCEP e preenchimento de endereço | reutilizável com pequena adaptação | bom para residência BR; precisa fallback seguro e persistência coerente |
| Campos pessoais brasileiros | reutilizável com pequena adaptação | existem na UI, rota e SQLite |
| Múltiplos hóspedes | reutilizável com pequena adaptação | UI existe; submissão sequencial e papel precisam robustez |
| Titular/acompanhante | reutilizável com pequena adaptação | campo e regras existem, mas múltiplos titulares ainda são possíveis |
| Persistência `stays + guests` | reutilizável sem mudança para o subconjunto atual | é o modelo operacional vigente |
| `public_token` aleatório | reutilizável com pequena adaptação | entropia e índice existem; todas as operações públicas precisam ser vinculadas ao token |
| Registro inicial `/send-fnrh` | reutilizável sem mudança apenas antes do registro oficial | já monta payload e persiste IDs retornados |
| Vínculo de ficha oficial existente | reutilizável sem mudança no cenário próprio | não cria pessoa; útil somente quando já há `fnrh_hospede_id` |
| Criação autônoma de pessoa FNRH | inexistente | precisa contrato e operação específica |
| Adição por dados locais a reserva já oficial | inexistente | fluxo atual bloqueia novo registro e vínculo exige ID oficial |
| Estrangeiro no formulário próprio | inexistente | faltam UI, modelo, validação e payload |

## 9. Componentes que não devem ser reaproveitados

- O fallback público `precheckin.html?stay=ID`.
- Leitura pública de `GET /stays/:id/guests`, que devolve `SELECT *` com dados pessoais.
- `POST /guests` exposto diretamente ao navegador público apenas com `stay_id`.
- `GET /stays` e `GET /stays/:id` como fontes públicas; eles expõem tokens e metadados operacionais.
- A suposição fixa de CPF, nacionalidade BR e residência BR para todos.
- A cidade textual que não é enviada nem persistida.
- O envio sequencial sem idempotência por submissão pública como única proteção contra duplicidade.
- O log integral de payload FNRH contendo dados pessoais; um fluxo público moderno precisa minimização e redação de logs.
- A tela `stays.html` como painel principal.
- A tabela legada `checkins` como novo modelo de dados.

## 10. Lacunas para um pré-check-in próprio

1. Endpoint público realmente limitado por token para leitura mínima e gravação.
2. Remoção do fallback por ID e não exposição do `stay_id` como autorização.
3. Expiração, revogação/rotação, rate limit e auditoria do token.
4. Idempotência para evitar duplicidade em repetição/rede instável.
5. Estado de submissão e revisão antes de qualquer escrita oficial.
6. Tipo e número de documento genéricos; passaporte e país emissor.
7. Nacionalidade e país de residência.
8. Endereço internacional sem obrigar CEP/IBGE/UF.
9. Definição dos campos FNRH de motivo da viagem e meio de transporte, se exigidos pelo contrato escolhido.
10. Consentimento/ciência de tratamento de dados e orientação de privacidade.
11. Criação/atualização de pessoa oficial com revalidação e persistência de `fnrh_pessoa_id`.
12. Adição do hóspede criado a uma reserva que já possui `fnrh_reserva_id`.
13. Tratamento de conflito entre CPF/passaporte, pessoa já existente e guest local.
14. Testes de autorização, corrida, duplicidade e falha parcial.

## 11. Risco do link público atual

O código gera token de 16 bytes aleatórios (32 caracteres hexadecimais) e mantém índice único. A entropia é adequada como ponto de partida para um link-capability.

Entretanto, o token protege apenas a primeira leitura:

1. `GET /stays/public/:token` retorna o ID numérico e o próprio token;
2. a página usa esse ID em `GET /stays/:id/guests` e `POST /guests`;
3. `GET /stays/:id/guests` não exige token e devolve todos os campos dos hóspedes;
4. `POST /guests` não exige token e aceita `stay_id` fornecido pelo cliente;
5. `GET /stays` e `GET /stays/:id` não têm autenticação e expõem `public_token`;
6. CORS está configurado como `origin: *`;
7. o fallback `?stay=ID` permite usar diretamente um identificador sequencial.

Assim, o risco não é somente adivinhar o token: a API interna exposta permite contornar sua finalidade, enumerar contexto e acessar/gravar dados por IDs. Também não há expiração, revogação visível, rate limit, escopo por operação ou confirmação de titularidade.

O link próprio não deve ser redistribuído antes de uma tarefa específica de segurança. Esta auditoria não alterou autenticação ou tokens.

## 12. Arquitetura mínima recomendada

Preservar:

- `reservas.html` como painel principal;
- link/QR oficial FNRH como caminho padrão;
- `stays + guests`, backend Express e SQLite;
- formulário próprio apenas como opção excepcional/adicional.

Fluxo mínimo conceitual:

```text
reservas.html
  → operador habilita link próprio para uma stay específica
  → backend gera/rotaciona token com validade e escopo
  → formulário público carrega somente metadados mínimos pelo token
  → brasileiro escolhe CPF; estrangeiro escolhe passaporte/outro tipo permitido
  → POST público vinculado ao token valida e salva submissão idempotente
  → painel mostra “dados recebidos / aguardando revisão”
  → operador confirma pessoa, papel e reserva
  → se a reserva ainda não existe na FNRH: reutiliza o registro inicial atual
  → se já existe: cria/localiza/atualiza pessoa pela API oficial e adiciona o hóspede à reserva
  → backend confirma a associação e persiste fnrh_pessoa_id/fnrh_hospede_id
  → reservas.html acompanha normalmente check-in e checkout
```

Fronteira pública mínima sugerida conceitualmente:

- uma leitura por token que não devolva `public_token`, IDs internos ou hóspedes existentes;
- uma escrita por token que derive a stay no servidor, sem aceitar `stay_id` como autorização;
- payload permitido explícito, limite de tamanho/quantidade, rate limit e idempotency key;
- resposta sem dados de outros hóspedes;
- logs redigidos.

Para brasileiros, grande parte das colunas atuais pode ser reutilizada. Para estrangeiros e reprocessamento seguro, o SQLite provavelmente precisará de uma extensão pequena e explícita para documento genérico, nacionalidade/residência e estado da submissão; tentar encaixar passaporte em `cpf` não é aceitável.

## 13. Próximo passo sugerido

Antes de implementar UI, fazer uma tarefa curta de contrato e segurança:

1. confirmar na documentação/API usada pelo projeto as operações exatas para localizar/criar/atualizar pessoa e adicionar hóspede a reserva existente;
2. definir o conjunto mínimo brasileiro e estrangeiro e os campos realmente obrigatórios;
3. desenhar o endpoint público token-bound e seu modelo de ameaça;
4. decidir a extensão mínima de `guests` ou uma entidade de submissão, com retenção e LGPD;
5. só então criar um protótipo pequeno integrado a `reservas.html`, sem reativar `stays.html` como painel.

Não é recomendado corrigir isoladamente o botão/link de `stays.html` e publicar o formulário antigo: isso restauraria a aparência do fluxo sem resolver a autorização pública nem a lacuna FNRH posterior.
