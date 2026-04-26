## [2026-04-26] – Estabilização, UX e Operação

### UI / UX
- Reorganização da tela `reservas.html`.
- Separação em:
  - `ANTES DA FNRH`
  - `DEPOIS DA FNRH`
- Remoção de formulário de hóspede principal da tela.
- Simplificação do fluxo de reserva.

### FNRH
- Fluxo sem hóspede validado.
- Geração de link e QR funcionando.
- Uso do mesmo link para múltiplos hóspedes confirmado.
- Correção de erro de logradouro via preenchimento por CEP.

### Check-in / Check-out
- Mantidos no sistema.
- Dependem de `fnrh_hospede_id`.
- Limitação da API documentada (sem retorno de status de preenchimento).

### Busca
- Busca dinâmica por:
  - número da reserva
  - nome/referência
  - código OTA
- Normalização:
  - case insensitive
  - ignore acentos

### Filtros por data
- Entradas.
- Hospedados.
- Saídas.
- Todas.

### Funcionalidades internas
- Checklist manual de hóspedes (`localStorage`).
- Campo de telefone (WhatsApp) por reserva (`localStorage`).
- Abertura direta do WhatsApp com link + mensagem.
- Máscara de telefone no input.

### Operação
- Mensagem padrão de WhatsApp criada.
- Fluxo de uso validado com recepção.
- Uso de roomlist como apoio operacional.

### Infra
- Frontend servido pelo backend (`express.static`).
- `start-local.bat` criado.
- Execução sem Live Server.

### Backup
- Script `backup-sqlite.bat` existente.
- Backup automatizado via Agendador do Windows (configuração manual).

---

## [2026-04-25] Beta local operacional + fluxo duplo FNRH validado

### Contexto
- O produto passou a operar em dois modos reais e complementares:
  - fluxo sem hóspede para geração rápida do link oficial da FNRH
  - fluxo com hóspede para controle completo, incluindo check-in e check-out
- O foco da recepção agora é operacional: criar reserva, enviar para FNRH, compartilhar link oficial e só cadastrar hóspede localmente quando precisar de controle direto no painel.

### Correções funcionais do dia
- Corrigido o bug de carregamento inicial da lista de reservas em `frontend/reservas.html`.
- Causa raiz encontrada: a inicialização da tela quebrava antes de `loadStays()` por causa do acesso ao `qrModal` antes do elemento existir no DOM.
- A tela agora inicializa via `DOMContentLoaded` e carrega a lista automaticamente ao abrir ou dar refresh, sem depender do botão `Atualizar lista`.
- Corrigido o erro real da FNRH `logradouro é obrigatório` no fluxo com hóspede.
- O bloco opcional de hóspede passou a incluir `CEP` e `logradouro`, com reaproveitamento da resolução de `cidade_id` e `estado_id` via CEP.

### Evolução da interface
- A UI operacional foi reorganizada em dois blocos:
  - `ANTES DA FNRH`
  - `DEPOIS DA FNRH`
- A ficha completa obrigatória deixou de ser o fluxo principal.
- Foi criado um bloco colapsável para hóspede opcional, discreto, usado apenas quando a recepção quiser habilitar fluxo com hóspede e check-in/check-out pelo sistema.
- O bloco opcional foi reduzido ao mínimo funcional do momento:
  - nome completo
  - CPF
  - data de nascimento
  - CEP
  - logradouro
- Textos visíveis e trechos com encoding quebrado foram ajustados na tela principal da recepção.

### Validações reais e descoberta de produto
- Foi validado em ambiente real que a FNRH aceita criar reserva sem hóspede e retorna `link_precheckin`.
- Foi validado também o fluxo com hóspede quando o payload contém os campos mínimos aceitos pela FNRH.
- Descoberta crítica: `1 link oficial != múltiplos hóspedes estruturados`.
- O link oficial pode ser reutilizado, mas cada pessoa preenche individualmente no portal da FNRH.
- `quantidade_hospede_adulto` e `quantidade_hospede_menor` funcionam como informação de capacidade/contexto, não como garantia de vínculo estruturado dos hóspedes.
- Conclusão operacional:
  - fluxo sem hóspede = velocidade para gerar link
  - fluxo com hóspedes no payload = controle real de grupo e disponibilidade de check-in/check-out

### Infra local beta
- O backend passou a servir também os arquivos do frontend.
- A dependência de Live Server foi removida do fluxo local beta.
- Foi criado `scripts/start-local.bat` para subir o sistema de forma simples no Windows.
- O acesso local passa a ser feito pelo navegador via backend, em `http://localhost:3000`.

### Observações FNRH importantes
- `GET /hospedes/pre-checkins` continua não confiável como fonte operacional de status.
- Quando há `dados_hospede`, `logradouro` precisa estar presente para evitar erro `400`.
- Check-in e check-out continuam dependendo de `fnrh_hospede_id`.

## [2026-04-24] Wrap-up: Checkout real, UX operacional e backup versionado

### Contexto
- Check-out individual foi implementado e validado com sucesso real na FNRH.
- Endpoint local usado: `POST /guests/:id/fnrh-checkout`.
- Endpoint FNRH chamado: `PATCH /hospedes/{hospede_id}/checkout`.
- Resposta real confirmada: HTTP `200` com `situacao_id = CHECKOUT_REALIZADO`.
- Ciclo validado no hospede testado: `PRECHECKIN_PENDENTE -> CHECKIN_REALIZADO -> CHECKOUT_REALIZADO`.

### Ajustes operacionais
- UX da `reservas.html` deixou de depender operacionalmente de `GET /hospedes/pre-checkins`.
- Motivo: o endpoint retornou `{}` em testes reais de producao e nao serviu como fonte confiavel de status.
- Texto principal ajustado para: `Preenchimento do pré-check-in deve ser conferido no portal oficial da FNRH.`
- Lista de hospedes ajustada para exibir `Conferir no portal`.
- Botao de check-out foi criado e validado no frontend.
- Botao de envio passa a exibir `Reenviar para FNRH` quando ja existe link oficial.

### Backup operacional
- Sistema simples de backup versionado do SQLite foi criado em `scripts/`.
- Banco original continua em `backend/database.sqlite`.
- Caminho configurado para backup no Google Drive: `G:\Meu Drive\fnrh-integration-vivamar-backups`.

### Quantidade de hospedes
- Foi identificado que `quantidade_hospede_adulto` e `quantidade_hospede_menor` controlam quantas pessoas podem preencher no link oficial da FNRH.
- Implementacao inicial foi adicionada no frontend/backend sem alteracao de schema.
- No estado atual, os valores sao enviados no request e usados no payload FNRH, com fallback operacional para `1` adulto e `0` menores.
- Persistencia em banco ainda nao foi feita.

### Pendencias
- Amanhã: testar reserva real controlada com `2` adultos e `0` menores.
- Se o link oficial aceitar `2` adultos, planejar persistencia de `quantidade_hospede_adulto` e `quantidade_hospede_menor` em `stays`.
- Futuro: configurar Agendador de Tarefas do Windows para backup automatico.

## [2026-04-24] UX: Remove pre-checkin status dependency from FNRH endpoint

### Contexto
- O endpoint oficial `GET /hospedes/pre-checkins` retornou `{}` em testes reais de producao.
- Leitura de status de pre-check-in por esse endpoint foi considerada nao confiavel para uso operacional no painel.
- Ajuste aplicado apenas no frontend, sem alteracao de backend ou banco.

### Mudancas realizadas
- Bloco de pre-check-in deixou de interpretar status com base na API da FNRH.
- Texto principal atualizado para: `Preenchimento do pré-check-in deve ser conferido no portal oficial da FNRH.`
- Lista de hospedes passou a exibir `Conferir no portal` para cada hospede.
- Botoes de check-in e check-out passam a desabilitar automaticamente apos execucao na sessao.
- Tooltips adicionados: `Check-in já realizado` e `Check-out já realizado`.
- Botao `Enviar para FNRH` passa a exibir `Reenviar para FNRH` quando ja existe link oficial.

### Impacto
- Painel deixa de exibir informacao incorreta sobre confirmacao de pre-check-in oficial.
- Operacao passa a depender de conferencia direta no portal oficial da FNRH para esse status.

## [2026-04-24] Validation: Check-out individual FNRH real

### Contexto
- Endpoint experimental `POST /guests/:id/fnrh-checkout` testado contra a FNRH real.
- Teste executado de forma controlada em um hospede especifico ja existente na FNRH.
- Estado anterior confirmado no fluxo real: `CHECKIN_REALIZADO`.

### Evidencia
- Retorno HTTP `200`.
- Timestamp enviado e retornado: `2026-04-24T12:01:01.956Z`.
- Resposta FNRH trouxe `situacao_id = CHECKOUT_REALIZADO`.
- `hospede_id` validado no retorno: `8a4804f1-f16c-4515-a6c9-a56f1a666bbd`.

### Resultado
- Fluxo individual de check-out validado tecnicamente em caso real controlado.
- Ciclo completo confirmado: `PRECHECKIN_PENDENTE -> CHECKIN_REALIZADO -> CHECKOUT_REALIZADO`.

### Proximos passos recomendados
- Criar botao de check-out no frontend.
- Testar fluxo completo com reserva real controlada.

## [2026-04-23] Validation: Check-in individual FNRH real

### Contexto
- Endpoint experimental `POST /guests/:id/fnrh-checkin` testado contra a FNRH real.
- Teste executado de forma controlada em um hospede especifico ja existente na FNRH.

### Evidencia
- Retorno HTTP `200`.
- Timestamp enviado e retornado: `2026-04-23T15:15:11.541Z`.
- Resposta FNRH trouxe `situacao_id = CHECKIN_REALIZADO`.
- `hospede_id` validado no retorno: `f069d046-cc02-46dd-bbdf-342901ca1964`.

### Resultado
- Fluxo individual de check-in validado tecnicamente em pelo menos um caso real.

### Proximos passos recomendados
- Fazer mais 1 ou 2 testes reais controlados.
- Nao expor botao no frontend ainda.
- Avaliar uso operacional no painel somente depois desses testes.

## [2026-04-18] Fix: Stay selection reset + guest save reload

### Problema
- Após salvar stay ou editar hóspede, a interface voltava para a stay inicial (stay 7)
- `data_entrada` não persistia corretamente
- fluxo de guest causava reload completo da página

### Causas
- input de `data_entrada` não era populado no formulário
- `selectedStayId` e `selectedStayDetails` eram perdidos durante o save
- fluxo `addGuestToSelectedStay` disparava reload (`beforeunload`)
- ausência de persistência da stay ativa entre ciclos
- fallback automático para `stays[0]` mascarava o problema

### Correções
- `populateStayForm` agora preenche `data_entrada`
- preservação explícita do `stayId` durante save
- ajuste de `loadStays` para respeitar `preferredStayId`
- bloqueio de resets indevidos durante save
- correção do fluxo de guest para evitar reload
- persistência da stay ativa via `sessionStorage`
- diferenciação mínima de UX entre salvar stay e salvar hóspede

### Resultado
- stay atual permanece selecionada após qualquer ação local
- `data_entrada` persiste corretamente
- fluxo de guest não recarrega mais a página
- fallback só ocorre quando necessário

### Testes manuais realizados
- salvar stay mantém stay atual
- editar hóspede mantém stay atual
- alternar entre stays continua consistente
- múltiplos testes com stays diferentes

## [2026-04-18] Feature: Precheck-in completo com dados FNRH

### Contexto
- o precheck-in público coletava apenas dados básicos de hóspede
- o painel interno exigia complementação manual antes do envio para FNRH
- havia divergência entre a UX pública e o modelo de dados usado internamente

### Problema
- hóspedes chegavam incompletos para FNRH
- havia necessidade de preenchimento manual no painel interno
- faltavam endereço e dados demográficos no fluxo público

### Evoluções aplicadas

#### 1. Expansão do formulário público
- adição de:
  - `birth_date`
  - endereço completo:
    - `cep`
    - `logradouro`
    - `numero`
    - `complemento`
    - `bairro`
    - cidade/estado

#### 2. Auto-preenchimento por CEP
- integração com ViaCEP no frontend
- preenchimento automático de:
  - `logradouro`
  - `bairro`
  - cidade em formato humano
  - estado em formato humano
- preenchimento interno de:
  - `cidade_id` com código IBGE
  - `estado_id` com UF

#### 3. Ajuste de UX de cidade/estado
- remoção da exposição de `cidade_id` técnico para o hóspede
- exibição de cidade e estado em formato humano
- manutenção de compatibilidade com o backend e com o save atual

#### 4. Inclusão de campos FNRH no pré-check-in
- `genero_id`
- `raca_id`
- `deficiencia_id`

#### 5. Validação no fluxo público
- `birth_date` obrigatório
- `genero_id` obrigatório
- `raca_id` obrigatório
- `deficiencia_id` opcional com default

### Resultado
- hóspedes criados via precheck-in já chegam completos para FNRH
- redução do trabalho manual no painel interno
- consistência entre fluxo público e modelo de dados interno
- melhoria significativa na qualidade dos dados coletados

### Testes manuais realizados
- múltiplos hóspedes por stay
- CEPs de cidades diferentes
- validação de campos obrigatórios
- verificação no painel interno:
  - status FNRH completo

### Observações
- endereço ainda é opcional nesta etapa
- `cidade_id` depende do CEP para preenchimento automático
- o fluxo público permanece simples, sem sobrecarregar o usuário
