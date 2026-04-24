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
