# Auditoria de UX de reservas e fichas FNRH não vinculadas

Data da auditoria: 24/08/2026

Escopo: diagnóstico local e somente leitura de `frontend/reservas.html`, `backend/server.js`, `backend/database/db.js` e documentação do projeto.

Fora do escopo: redesign, alteração funcional, migration, chamada real à FNRH, importação, vínculo, sincronização, check-in e checkout.

## Status de execução

- Auditoria concluída e preservada como referência técnica.
- Fase 1 de reorganização visual aplicada em `frontend/reservas.html` em 24/08/2026.
- A Fase 1 não alterou backend, banco, endpoints, payloads ou regras FNRH.
- CPF/passaporte e busca automática continuam não implementados e condicionados ao teste controlado descrito na seção 7.

## 1. Estado atual da interface

`reservas.html` concentra quatro funções operacionais diferentes na mesma tela:

1. localizar, criar e editar uma hospedagem local;
2. registrar a hospedagem na FNRH e distribuir o link de pré-check-in;
3. acompanhar/importar hóspedes oficiais e realizar check-in/checkout;
4. recuperar fichas avulsas ou não vinculadas, inclusive por atendimento sem Gov.br.

O fluxo principal validado continua coerente: criar stay → enviar à FNRH → compartilhar link → consultar hóspedes oficiais → check-in → checkout. O problema de UX não é falta de capacidade, mas a exposição simultânea de ações frequentes, correções excepcionais e diagnóstico técnico.

### Contagem adotada

Foram encontradas **30 intenções de ação visíveis distintas**: 23 controles estáticos com aparência de botão e 7 intenções geradas dinamicamente. A contagem considera uma intenção uma única vez mesmo quando o mesmo texto é renderizado em mais de um contexto. Não inclui campos de busca/data, seleção de um card de reserva nem os checkboxes da lista interna; esses comportamentos são documentados separadamente.

Há ainda ações automáticas: carregamento inicial, recarga de detalhes após mutações, recomposição das listas e consulta ViaCEP no preenchimento de endereço. Elas não entram nas 30 intenções visíveis.

## 2. Inventário de ações

Legenda:

- Banco: escrita no SQLite ou em armazenamento local do navegador.
- FNRH: chamada à API externa, não apenas ao backend local.
- Status: alteração de status operacional local ou oficial; mensagens de feedback não são consideradas status.
- Classe: A principal, B contextual, C excepcional, D técnica/diagnóstica.

| # | Ação visível | Elemento / comando | Função JavaScript | Endpoint interno | Banco / armazenamento | API FNRH e status | Disponibilidade e finalidade | Frequência | Classe |
|---:|---|---|---|---|---|---|---|---|:---:|
| 1 | Nova reserva | `#newStayBtn` | `enterCreateMode` | — | não | não; não altera status | sempre; abre formulário de criação | frequente | A |
| 2 | Atualizar lista | `#reloadListBtn` | `loadStays` | `GET /stays`, seguido de `GET /stays/:id` e `GET /stays/:id/guests` | não | não | sempre; relê reservas e a seleção atual | ocasional | B |
| 3 | Entradas | `[data-filter=checkin]` | listener → `renderStayList` | — | não | não | sempre; filtro local pela data de entrada | frequente | B |
| 4 | Hospedados | `[data-filter=inhouse]` | listener → `renderStayList` | — | não | não | sempre; filtro local por período vigente | frequente | B |
| 5 | Saídas | `[data-filter=checkout]` | listener → `renderStayList` | — | não | não | sempre; filtro local pela data de saída | frequente | B |
| 6 | Todas | `[data-filter=all]` | listener → `renderStayList` | — | não | não | sempre; remove filtro operacional | frequente | B |
| 7 | Salvar reserva | `#saveStayBtn` | `saveStay` | `POST /stays` ou `PUT /stays/:id` | sim, `stays`; também metadados de UI/telefone em `localStorage` | não; altera dados locais da reserva | criação/edição com campos válidos | frequente | A |
| 8 | Enviar para FNRH | `#sendFnrhBtn` | `sendSelectedStayToFNRH` | `POST /stays/:id/send-fnrh` | sim, IDs/link/resultado FNRH da stay e hóspedes enviados | `POST /hospedagem/registrar`; cria registro oficial e IDs | stay salva e ainda sem `fnrh_reserva_id`; envio inicial | uma vez por reserva | A |
| 9 | Salvar hóspede | `#saveGuestBtn` | `saveOptionalGuest` | `POST /guests` ou `PUT /guests/:id` | sim, `guests` | não; altera cadastro local | stay selecionada e formulário válido | frequente | A |
| 10 | Atualizar hóspedes da FNRH | `#refreshFnrhOfficialGuestsBtn` | `loadFnrhOfficialGuests` | `GET /stays/:stayId/fnrh/hospedes-oficiais` | não | `GET /reservas/{fnrh_reserva_id}/hospedes`; não altera status | reserva com ID FNRH; lê a lista oficial | frequente/contextual | B |
| 11 | Sincronizar situações no painel | `#syncFnrhGuestSituationsBtn` | `synchronizeFnrhGuestSituations` | `POST /stays/:stayId/fnrh/sincronizar-situacoes` | sim, somente situação e instante de sincronização dos hóspedes locais | faz `GET /reservas/{id}/hospedes`; copia status oficial para o painel, sem escrita externa | reserva FNRH com hóspedes locais identificados | ocasional | B |
| 12 | Copiar link | `#copyFnrhLinkBtn` | `copyOfficialLink` | — | clipboard apenas | não | link oficial existente; distribuição do pré-check-in | ocasional | B |
| 13 | Abrir link | `#openFnrhLinkBtn` | `openOfficialLink` | — | não | abre URL oficial no navegador, sem chamada controlada pelo backend | link oficial existente; conferência/preenchimento | ocasional | B |
| 14 | WhatsApp / Enviar WhatsApp / Copiar mensagem WhatsApp | `#copyWhatsappMessageBtn` | `copyWhatsappMessage` | — | clipboard ou navegação para WhatsApp | não altera FNRH | link existente; compartilha instrução com o hóspede | frequente | A |
| 15 | QR Code | `#showQrBtn` | `showOfficialQrCode` | — | não | não | link oficial existente; exibe o QR da reserva | contextual | B |
| 16 | Consultar status FNRH | `#checkFnrhGuestsStatusBtn` | `checkFnrhReservationGuestsStatus` | `GET /api/fnrh/debug/reserva/:id/hospedes` | não | `GET /reservas/{id}/hospedes`; não altera status | há link ou ID FNRH; exibe JSON/diagnóstico | excepcional | D |
| 17 | Abrir dados do hóspede | `#openGuestDetailsBtn` | listener abre formulário | — | não | não | hóspede selecionado; edição/conferência local | frequente/contextual | B |
| 18 | Iniciar atendimento sem Gov.br | `#startFnrhReceptionSessionBtn` | `startFnrhReceptionSession` | `GET /fnrh/precheckins` | `sessionStorage` com baseline | `GET /hospedes/pre-checkins`; não altera status | stay FNRH e período válido; inicia comparação temporal | excepcional | C |
| 19 | Buscar novos preenchimentos | `#searchFnrhReceptionNewBtn` | `searchFnrhReceptionNewCandidates` | `GET /fnrh/precheckins` | não | `GET /hospedes/pre-checkins`; não altera status | sessão de atendimento ativa; destaca IDs posteriores ao baseline | excepcional | C |
| 20 | Encerrar atendimento | `#endFnrhReceptionSessionBtn` | `endFnrhReceptionSession` | — | remove baseline do `sessionStorage` | não | sessão ativa; encerra o recorte temporal | excepcional | C |
| 21 | Buscar pré-check-ins | `#searchFnrhPrecheckinsBtn` / submit do formulário | `searchFnrhPrecheckins` | `GET /fnrh/precheckins` | não | `GET /hospedes/pre-checkins`; não altera status | stay FNRH e período válido; recuperação manual | excepcional | C |
| 22 | Salvar lista | `#saveInternalGuestChecklistBtn` | `saveInternalGuestChecklistFromTextarea` | — | sim, `localStorage` | não | stay selecionada; mantém lista informal de pessoas esperadas | ocasional | B |
| 23 | Fechar QR | botão sem ID / `onclick` | `closeQrModal` | — | não | não | modal aberto | contextual | B |
| 24 | Vincular à reserva | `[data-link-fnrh-guest-id]` | `linkFnrhPrecheckinToGuest` | `POST /stays/:stayId/fnrh/vincular-precheckin` | sim, grava `guests.fnrh_hospede_id` | `POST /reservas/{reserva_id}/vincular-hospede/{hospede_id}`; vincula oficialmente | uma única correspondência exata por CPF, candidato não vinculado e guest local sem ID FNRH | excepcional | C |
| 25 | Adicionar manualmente a esta reserva | `[data-open-manual-import-candidate-index]` | listener → expande escolha de papel | — | não | não | candidato não associado e reconhecido presencialmente; abre confirmação | excepcional | C |
| 26 | Adicionar como titular | `[data-*-import-role=main]` | `importFnrhCandidate` ou `importFnrhOfficialGuest` | `POST /stays/:stayId/fnrh/importar-vincular-precheckin` ou `/fnrh/importar-hospede-vinculado` | sim, cria `guest` local | no fluxo avulso: GET, possível POST de vínculo e GET de confirmação; no oficial: GET de revalidação | candidato elegível e nenhuma titular local | excepcional | C |
| 27 | Adicionar como acompanhante | `[data-*-import-role=companion]` | `importFnrhCandidate` ou `importFnrhOfficialGuest` | mesmos endpoints da linha anterior | sim, cria `guest` local | mesmas chamadas da linha anterior | candidato elegível; papel escolhido pela recepção | excepcional | C |
| 28 | Adicionar ao painel | `[data-open-official-import-index]` | listener → expande escolha de papel | — | não | não | hóspede oficial ainda ausente localmente; abre confirmação | contextual | B |
| 29 | Check-in FNRH | `[data-fnrh-checkin-guest-id]` | handler de operação FNRH do hóspede | `POST /guests/:id/fnrh-checkin` | sim, situação e timestamps locais | GET de verificação, no máximo um `PATCH /hospedes/{id}/checkin`, GET de confirmação; muda status oficial | hóspede identificado, pré-check-in concluído e operação permitida | frequente | A |
| 30 | Check-out FNRH | `[data-fnrh-checkout-guest-id]` | handler de operação FNRH do hóspede | `POST /guests/:id/fnrh-checkout` | sim, situação e timestamps locais | GET de verificação, no máximo um `PATCH /hospedes/{id}/checkout`, GET de confirmação; muda status oficial | hóspede em check-in e operação permitida | frequente | A |

### Ações automáticas e comandos sem botão próprio

| Gatilho | Comportamento confirmado | Efeito |
|---|---|---|
| Abertura da página | `initializeReservationsPage` chama `loadStays()` | leituras locais; nenhuma consulta FNRH automática |
| Clique em card de reserva | `loadStayDetails(stay.id)` | `GET /stays/:id` e `GET /stays/:id/guests` |
| Busca textual, mudança de data ou filtro | `renderStayList()` | filtragem somente no navegador |
| Após salvar reserva | `loadStays(id)` | atualiza lista e detalhes locais |
| Após salvar hóspede | `loadStayDetails(id)` | atualiza detalhes locais |
| Após envio, importação, vínculo, sincronização, check-in ou checkout | rotinas específicas recarregam os detalhes; algumas repetem a consulta que originou a ação | conciliação visual; chamadas FNRH adicionais estão descritas na ação correspondente |
| CEP completo no formulário | consulta `https://viacep.com.br/ws/{cep}/json/` | leitura externa para cidade/UF; não é FNRH nem grava banco por si só |
| Alteração dos checkboxes da lista interna | `updateInternalGuestChecklistItem` | grava somente `localStorage` |

## 3. Ações redundantes ou sobrepostas

Não foram encontrados dois botões estáticos diferentes ligados literalmente à mesma função principal. A sobreposição é **conceitual e de resultado**, não uma duplicação simples de handler.

### Sobreposições relevantes

| Grupo atual | Diferença real | Diagnóstico de UX |
|---|---|---|
| Atualizar lista | relê apenas o banco local e reabre a stay | o nome genérico não deixa claro o escopo |
| Atualizar hóspedes da FNRH | faz GET da lista oficial e a mantém em memória | é a atualização oficial mais compreensível para a recepção |
| Sincronizar situações no painel | faz GET oficial e persiste apenas situações nos hóspedes locais | parcialmente sobrepõe “Atualizar hóspedes”, mas tem efeito local adicional |
| Consultar status FNRH | faz GET oficial e mostra resposta de diagnóstico | consulta a mesma fonte conceitual dos dois itens anteriores; deveria ser ferramenta técnica |
| Importar | cria no painel local um hóspede que já está oficial ou uma ficha avulsa após vínculo | “importar” descreve mecanismo, não objetivo operacional |
| Vincular | associa na FNRH um `hospede_id` avulso à reserva e grava o ID no guest local | operação distinta de importar, embora o fluxo combinado faça ambos |

### Resultados semelhantes por caminhos diferentes

- `Adicionar como titular/acompanhante` usa dois fluxos: importar um hóspede **já oficial da reserva**, ou importar **e vincular** uma ficha avulsa. O mesmo rótulo esconde riscos externos diferentes.
- A lista oficial pode indicar hóspedes ausentes no painel; a busca de pré-check-ins também pode encontrar a mesma pessoa em outro estado. Ambas culminam em criar/identificar um guest local, mas com pré-condições diferentes.
- Depois de várias mutações, a tela já recarrega detalhes automaticamente. Isso reduz a necessidade de “Atualizar lista” como ação principal, mas não elimina sua utilidade de recuperação.
- A sincronização não ocorre automaticamente na abertura da página. Portanto, o botão não pode simplesmente desaparecer sem uma decisão funcional futura; pode apenas ser rebaixado ou agrupado nesta fase conceitual.
- `Consultar status FNRH` expõe uma resposta de diagnóstico e não acrescenta uma ação operacional que já não seja atendida pela lista oficial e pela sincronização.

Agrupamento possível sem alterar backend: um bloco “Atualizar dados da FNRH” pode apresentar a atualização oficial como ação visível e colocar “Copiar situações para o painel” e “Ver diagnóstico técnico” em opções secundárias. Isso é recomendação futura, não constatação de equivalência entre endpoints.

## 4. Classificação operacional

Distribuição das 30 intenções:

| Classe | Quantidade | Ações |
|---|---:|---|
| A — principal | **7** | Nova reserva; Salvar reserva; Enviar para FNRH; Salvar hóspede; WhatsApp; Check-in FNRH; Check-out FNRH |
| B — contextual | **14** | Atualizar lista; quatro filtros; Atualizar hóspedes da FNRH; Sincronizar situações; Copiar link; Abrir link; QR Code; Abrir dados do hóspede; Salvar lista; Fechar QR; Adicionar ao painel |
| C — excepcional | **8** | Iniciar/Buscar novos/Encerrar atendimento sem Gov.br; Buscar pré-check-ins; Vincular à reserva; recuperação manual; adicionar como titular/acompanhante |
| D — técnica/diagnóstica | **1** | Consultar status FNRH |

Observação: “Adicionar como titular/acompanhante” está contado uma vez por intenção visível, embora apareça em mais de um fluxo. “Adicionar ao painel” é contextual quando o hóspede já pertence oficialmente à reserva; as escolhas de papel foram classificadas como excepcionais porque criam registro local e, no fluxo avulso, podem também disparar vínculo externo.

## 5. Fluxo atual de fichas não vinculadas

### Consulta e normalização

1. A recepção escolhe um período e usa “Buscar pré-check-ins”, ou inicia uma sessão sem Gov.br.
2. O frontend chama `GET /fnrh/precheckins?data_inicio=...&data_fim=...&exibir_vinculado=false`.
3. O backend valida período e encaminha uma leitura para `GET /hospedes/pre-checkins` na API FNRH.
4. O frontend exige um objeto com array `dados` e mantém somente itens cuja `situacao_hospede_id` seja exatamente `PRECHECKIN_NAOVINCULADO`.
5. Cada item é normalizado para: `hospede_id`, nome, data de nascimento, tipo de documento, número de documento e situação.

### Identificação no painel

A associação é avaliada nesta ordem:

1. `hospede_id` oficial igual ao `fnrh_hospede_id` local → já identificado;
2. CPF normalizado com 11 dígitos e igualdade exata → correspondência exata;
3. nome normalizado **e** nascimento iguais → possível correspondência;
4. zero ou várias ocorrências → sem correspondência ou ambígua.

O frontend exibe nome, nascimento, situação, tipo de documento e documento mascarado. A interface só oferece vínculo direto com um guest existente quando há exatamente uma correspondência por CPF, o candidato continua `PRECHECKIN_NAOVINCULADO`, o guest ainda não tem ID FNRH e os CPFs normalizados continuam idênticos.

### Vínculo de um guest local existente

1. Clique explícito em “Vincular à reserva”.
2. Backend valida stay/reserva, guest local, ausência de vínculo anterior e unicidade global do `fnrh_hospede_id`.
3. Backend chama `POST /reservas/{fnrh_reserva_id}/vincular-hospede/{fnrh_hospede_id}`.
4. Em sucesso, persiste somente a identificação necessária no guest existente, principalmente `guests.fnrh_hospede_id`.
5. Frontend recarrega a stay e repete a consulta para refletir o novo estado.

### Recuperação manual de pessoa ainda inexistente no painel

1. Para candidato sem associação local, a recepção deve reconhecer pessoalmente que ele pertence à stay.
2. “Adicionar manualmente a esta reserva” apenas abre a escolha titular/acompanhante.
3. O backend de `importar-vincular-precheckin` repete o GET oficial, revalida situação e dados e bloqueia conflitos de titular, CPF e ID.
4. Se ainda estiver não vinculado, executa o POST de vínculo e confirma com GET dos hóspedes da reserva.
5. Só então insere um guest local com nome, nascimento, papel, identificadores FNRH e CPF quando o documento retornado é um CPF válido.

### Atendimento sem Gov.br

O início salva em `sessionStorage` o conjunto de `hospede_id` encontrado no período. “Buscar novos preenchimentos” repete o GET e destaca IDs que não existiam no baseline. Isso é uma heurística temporal; não prova por si só a qual reserva cada ficha pertence. A confirmação humana e as validações de documento continuam necessárias.

## 6. Dados disponíveis para identificação

### O que o código espera do GET de pré-check-ins

| Campo externo | Uso atual |
|---|---|
| `hospede_id` | identidade oficial, baseline temporal, prevenção de duplicidade e vínculo |
| `nome` | exibição e correspondência possível com nascimento |
| `data_nascimento` | exibição e correspondência possível com nome |
| `tipo_documento` | distingue CPF, passaporte ou tipo desconhecido |
| `numero_documento` | máscara na tela e igualdade exata quando é CPF |
| `situacao_hospede_id` | filtro obrigatório por `PRECHECKIN_NAOVINCULADO` |

O código reconhece CPF e passaporte, mas só CPF completo e válido habilita a correspondência exata automática. Nome+nascimento é deliberadamente tratado como “possível”, nunca como autorização automática para vínculo.

### Evidência já registrada

- O diagnóstico controlado em `docs/FNRH_RESERVATION_GUESTS_DIAGNOSTIC.md` comprova que o **GET dos hóspedes de uma reserva** retornou identificação de pessoa/documento, `pessoa_id`, `hospede_id`, nome e nascimento.
- `docs/FNRH_API_UPDATE_DIAGNOSTIC.md` registra a existência e a utilidade do **GET de pré-check-ins**, mas testes anteriores também produziram resposta vazia e não comprovam a forma de um candidato real não vinculado.
- O frontend e o backend atuais foram escritos para consumir `tipo_documento` e `numero_documento` no GET de pré-check-ins. Isso comprova o contrato assumido pela aplicação, não a presença de CPF completo em uma resposta real atual de produção.

Conclusão probatória: há evidência de documento no endpoint de hóspedes oficiais da reserva e suporte explícito no código do endpoint de pré-check-ins; não há, nos artefatos auditados, uma resposta controlada inequívoca de `PRECHECKIN_NAOVINCULADO` que prove CPF completo.

## 7. Viabilidade de busca por CPF

### Resposta explícita

**AINDA NÃO SABEMOS — precisa de teste real controlado.**

Se `numero_documento` vier com CPF completo e `tipo_documento` identificar CPF, a localização exata é tecnicamente viável e grande parte da lógica de comparação já existe. Se vier mascarado, truncado ou ausente, CPF não é uma chave segura para localização direta.

### GET necessário, sem executá-lo nesta auditoria

Chamada local de leitura:

```text
GET /fnrh/precheckins?data_inicio=AAAA-MM-DD&data_fim=AAAA-MM-DD&exibir_vinculado=false
```

Ela encaminha para a leitura oficial:

```text
GET /hospedes/pre-checkins?data_inicio=AAAA-MM-DD&data_fim=AAAA-MM-DD&exibir_vinculado=false
```

Teste controlado necessário:

1. criar deliberadamente uma única ficha via QR genérico, com documento conhecido e consentimento para o teste;
2. consultar um intervalo mínimo que contenha essa ficha;
3. confirmar que o item `PRECHECKIN_NAOVINCULADO` possui `hospede_id`, `tipo_documento`, `numero_documento`, nome e nascimento;
4. verificar localmente, sem registrar o valor em relatório/log, se `numero_documento` contém o CPF completo normalizável para exatamente 11 dígitos;
5. verificar se há múltiplos candidatos com o mesmo documento e como a API representa passaporte.

Resultado que comprovaria viabilidade: tipo CPF inequívoco e número completo idêntico ao valor controlado. Resultado mascarado, parcial ou ausente não permite vínculo seguro por CPF.

Risco do GET: exposição de dados pessoais de terceiros no período. Mitigações: janela mínima, ambiente controlado, saída não persistida, sem captura de valores pessoais e acesso restrito. Nenhum GET real foi feito nesta auditoria.

### Regra segura para uma implementação futura

Mesmo após a prova, o sistema deve apenas **oferecer** a correspondência quando houver unicidade exata dos dois lados. O vínculo deve continuar dependendo de confirmação humana explícita e das revalidações atuais do backend. Nunca vincular automaticamente ao encontrar um CPF.

## 8. Estrangeiros e passaporte

O frontend já reconhece `PASSAPORTE`/`PASSPORT`, normaliza documento estrangeiro para exibição mascarada e não o trata como CPF. Hoje, passaporte não habilita o vínculo exato com guest local; resta nome+nascimento como indicação manual, que pode gerar homônimos e não é identidade suficiente.

Recomendação futura:

- modelar a referência esperada como par `tipo_documento + documento_normalizado`, e não como um campo exclusivamente CPF;
- permitir CPF para brasileiros e passaporte/outro documento aceito pela FNRH para estrangeiros;
- exigir país emissor quando disponível, pois números de passaporte não são globalmente únicos sem contexto;
- manter nome+nascimento somente como pista;
- se a API devolver documento mascarado ou não devolver país/tipo confiável, exigir conferência presencial e usar o fluxo manual existente.

Não se deve guardar passaporte no campo `guests.cpf` nem transformar uma correspondência aproximada em vínculo automático.

## 9. Proposta de hierarquia visual

Sem remover capacidades ou alterar backend, a futura tela pode priorizar estado e próxima ação:

### 1. Reserva

- dados básicos, datas, origem e quantidade esperada;
- ações principais: “Nova reserva” e “Salvar reserva”;
- busca e filtros permanecem na coluna/lista, visualmente separados das ações da stay.

### 2. Pré-check-in FNRH

- estado resumido: não enviada, link disponível, quantidade oficial, quantidade no painel e pendências;
- ação principal por estado:
  - ainda não enviada → “Criar pré-check-in na FNRH”;
  - enviada → “Enviar link pelo WhatsApp”;
  - aguardando pessoas → “Ver hóspedes da FNRH”;
- Copiar link, Abrir link e QR Code agrupados como alternativas de compartilhamento;
- “Atualizar hóspedes da FNRH” como única ação de leitura oficial em evidência.

### 3. Hóspedes e hospedagem

- lista de hóspedes com papel e situação oficial;
- “Adicionar/editar hóspede” contextual;
- somente a próxima operação válida em destaque por hóspede: check-in ou checkout;
- importação de hóspede oficial ausente apresentada como pendência específica, não como ferramenta genérica.

### 4. Resolver pendências

- aparece apenas quando houver divergência: hóspede oficial fora do painel, ficha avulsa ou situação desatualizada;
- ações com consequências descritas antes da confirmação;
- atendimento sem Gov.br e busca de ficha avulsa ficam aqui.

### 5. Mais opções

- Atualizar lista local;
- Sincronizar situações no painel;
- lista interna de hóspedes;
- recuperação manual;
- diagnóstico técnico, idealmente atrás de modo técnico/permissão.

Nenhuma ação deve desaparecer apenas por parecer automática. Antes de ocultar “Atualizar lista” ou “Sincronizar”, é preciso garantir uma atualização automática equivalente, observável e recuperável.

## 10. Terminologia sugerida

| Termo atual | Significado técnico atual | Texto voltado à recepção |
|---|---|---|
| Atualizar lista | reler stays e guests locais | **Recarregar reservas** |
| Atualizar hóspedes da FNRH | buscar a lista oficial sem gravar situações | **Ver hóspedes da FNRH** ou **Atualizar dados da FNRH** |
| Sincronizar situações no painel | buscar status oficiais e copiá-los para guests locais | **Atualizar situações no painel** |
| Consultar status FNRH | mostrar leitura bruta/diagnóstica da reserva oficial | **Ver diagnóstico da FNRH** |
| Importar hóspede vinculado | criar no painel alguém que já pertence oficialmente à reserva | **Adicionar hóspede oficial ao painel** |
| Importar e vincular pré-check-in | associar ficha avulsa oficialmente e criar guest local | **Confirmar pessoa e vincular ficha** |
| Vincular à reserva | associar ficha oficial avulsa a esta reserva | **Vincular esta ficha à reserva** |
| Iniciar atendimento sem Gov.br | registrar baseline de fichas antes do preenchimento | **Iniciar acompanhamento de ficha avulsa** |
| Buscar novos preenchimentos | comparar novo GET com baseline | **Procurar ficha preenchida agora** |
| Enviar para FNRH | registrar hospedagem oficial e obter link | **Criar pré-check-in na FNRH** |

Não é seguro condensar atualização da lista oficial, persistência de situações e diagnóstico em um único clique sem alterar comportamento. Eles podem compartilhar um grupo visual, mas precisam manter consequência e feedback distintos.

## 11. Mudanças mínimas recomendadas

### UX, sem mudança de contrato

1. reorganizar os controles existentes nos cinco blocos da seção 9;
2. mostrar uma ação principal por estado e mover alternativas para menu secundário;
3. separar “ler a FNRH” de “gravar no painel” nos textos e confirmações;
4. colocar diagnóstico e recuperação manual em área recolhida;
5. exibir pendências em linguagem operacional: “1 hóspede oficial ainda não está no painel”.

### Referência operacional de documento, somente após teste positivo

Não é recomendável criar um `guest` incompleto apenas para guardar CPF: `guests.full_name` é obrigatório e a tabela representa uma pessoa já cadastrada, não uma expectativa. A alteração mínima semanticamente segura seria uma entidade própria, por exemplo `stay_expected_guests`, com:

- `id` e `stay_id`;
- tipo de documento;
- valor normalizado protegido;
- papel esperado opcional;
- timestamps e estado de consumo/expiração;
- unicidade por stay, tipo e documento.

O desenho definitivo precisa decidir criptografia ou hash indexável, retenção e auditoria antes de qualquer migration.

Backend mínimo futuro:

1. CRUD local restrito para referências esperadas;
2. consulta somente leitura dos não vinculados pelo fluxo existente;
3. comparação exata e única por tipo+documento;
4. resposta ao frontend sem devolver documento completo;
5. reutilização dos endpoints atuais de vínculo, mantendo revalidação e confirmação humana.

Frontend mínimo futuro:

1. ação excepcional “Registrar documento de pessoa esperada”;
2. tipo de documento explícito, valor mascarado após salvar e possibilidade de corrigir/remover;
3. estado “Ficha encontrada” sem expor o documento;
4. botão explícito “Vincular esta ficha à reserva”; nunca execução automática.

## 12. Riscos

| Risco | Consequência | Mitigação necessária antes de implementar |
|---|---|---|
| CPF não retornado ou mascarado | falso pressuposto de correspondência | teste controlado do GET antes de modelar banco/UI |
| CPF digitado errado | vínculo da pessoa errada ou nenhuma localização | validação, redigitação/conferência e confirmação explícita |
| duplicidade local ou candidato duplicado | associação ambígua | unicidade, bloqueio de ação e revisão manual |
| ficha de outra reserva no mesmo período | violação operacional e de privacidade | não usar apenas tempo/nome; exigir documento exato e contexto humano |
| corrida entre consulta e vínculo | estado externo mudou | manter revalidação do backend imediatamente antes do POST |
| armazenamento de CPF/passaporte | impacto LGPD e exposição em logs/backups | minimização, controle de acesso, proteção, retenção e auditoria |
| `localStorage`/`sessionStorage` em computador compartilhado | informação operacional persistente ou sessão confundida | expiração, limpeza visível e não armazenar documento nesses mecanismos |
| passaporte sem país emissor | colisão/identidade insuficiente | armazenar tipo e país quando suportado; confirmação presencial |
| nome+nascimento iguais | falso positivo | manter como “possível”, sem habilitar vínculo direto |
| rótulos iguais para importar e importar+vincular | usuário não percebe escrita externa | texto e confirmação específicos para cada consequência |
| esconder atualização manual cedo demais | painel fica desatualizado sem recuperação | só ocultar após atualização automática equivalente e observável |
| documentos em mensagens/telemetria | vazamento de dados pessoais | mascaramento integral e proibição de payloads em logs comuns |

## 13. Ordem recomendada de implementação

As fases abaixo são independentes, pequenas e reversíveis. Nenhuma foi executada nesta auditoria.

### Fase 1 — esclarecer sem mudar comportamento

1. criar testes de caracterização dos estados e da disponibilidade dos 30 controles;
2. ajustar, em tarefa própria, rótulos e textos auxiliares de “Atualizar/Consultar/Sincronizar/Importar/Vincular”;
3. manter os mesmos handlers e endpoints;
4. validar o vocabulário com a recepção.

### Fase 2 — reorganizar a hierarquia

1. separar Reserva, Pré-check-in, Hóspedes/Hospedagem, Pendências e Mais opções;
2. destacar uma próxima ação por estado;
3. recolher diagnóstico e recuperação excepcional;
4. testar todos os fluxos já validados sem remover controles.

### Fase 3 — reduzir sobreposição com segurança

1. unificar visualmente as leituras da FNRH, preservando endpoints e consequências;
2. tornar explícita a diferença entre leitura e persistência local;
3. avaliar atualização automática de lista/situações com feedback e botão de recuperação;
4. só então decidir quais controles podem deixar a superfície principal.

### Fase 4 — validar dados de ficha avulsa

1. aprovar um caso controlado e uma janela mínima;
2. executar somente o GET descrito na seção 7;
3. registrar apenas presença, formato e completude dos campos, sem valores pessoais;
4. encerrar a fase com decisão: CPF completo confiável, documento alternativo confiável ou fluxo manual obrigatório.

### Fase 5 — documento esperado, condicionada à Fase 4

1. fazer análise LGPD e definir retenção/proteção;
2. desenhar entidade local de pessoa esperada sem corromper a semântica de `guests`;
3. implementar comparação exata somente leitura e testes de duplicidade/corrida;
4. adicionar confirmação explícita e reutilizar o vínculo atual;
5. pilotar com poucos casos e trilha de auditoria, incluindo estrangeiros.

### Verificações desta auditoria

- `node --check backend/server.js`: aprovado.
- `node --check backend/database/db.js`: aprovado.
- Nenhuma chamada à FNRH foi executada.
- Nenhuma operação de banco foi executada.
- Nenhum arquivo funcional foi alterado.
- Este relatório é o único arquivo criado.
- Nenhum commit ou push foi realizado.
