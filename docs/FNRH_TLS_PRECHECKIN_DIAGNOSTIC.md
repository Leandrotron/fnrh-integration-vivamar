# Diagnóstico TLS dos pré-check-ins FNRH

Data: 29/08/2026
Escopo: diagnóstico local e uma reprodução controlada por `GET`, sem importação, vínculo, check-in, checkout ou escrita na FNRH.

Dados pessoais eventualmente retornados durante o teste foram omitidos deste relatório.

## 1. Sintoma observado

Após o reinício do backend, a interface informou:

- “Não foi possível iniciar o atendimento. Tente novamente.”;
- “Não foi possível consultar a FNRH. Verifique a conexão segura do backend.”

Os dois sintomas atingem o mesmo mecanismo de leitura de pré-check-ins. No momento deste diagnóstico, porém, o endpoint local voltou a responder com sucesso: o `GET` controlado retornou HTTP `200`, com dois registros `PRECHECKIN_NAOVINCULADO`. Portanto, a falha relatada não permaneceu reproduzível no processo backend que estava ativo durante a coleta.

Um teste de controle executado com outro processo Node, no ambiente normal do terminal e sem credenciais, falhou ainda durante o handshake TLS com o mesmo código já documentado anteriormente: `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

## 2. Fluxos afetados

### Iniciar atendimento sem Gov.br

Fluxo exato:

```text
#startFnrhReceptionSessionBtn
  → listener registrado no carregamento da página
  → startFnrhReceptionSession()
  → validateFnrhReceptionStart()
  → fetchFnrhPrecheckinsForPeriod()
  → GET /fnrh/precheckins
  → GET oficial /hospedes/pre-checkins
```

A ação não possui endpoint próprio de inicialização. Ela primeiro consulta a FNRH para montar um baseline de `hospede_id`. Somente depois de um GET bem-sucedido cria a sessão no `sessionStorage` do navegador. Não grava sessão no backend nem no banco.

Se a consulta falhar, o baseline não é salvo e `startFnrhReceptionSession()` mostra a mensagem genérica de falha.

### Buscar fichas

Fluxo exato:

```text
#fnrhPrecheckinSearchForm / #searchFnrhPrecheckinsBtn
  → listener submit
  → searchFnrhPrecheckins()
  → fetchFnrhPrecheckinsForPeriod()
  → GET /fnrh/precheckins
  → GET oficial /hospedes/pre-checkins
```

Depois do retorno, o frontend mantém somente itens cujo `situacao_hospede_id` seja exatamente `PRECHECKIN_NAOVINCULADO`. A filtragem ocorre após a comunicação TLS e não pode causar o erro de conexão observado.

“Buscar novos preenchimentos”, dentro de uma sessão sem Gov.br já iniciada, também reutiliza a mesma função e o mesmo GET; a diferença é apenas a comparação com o baseline salvo no navegador.

## 3. Endpoints locais

Os dois fluxos usam:

```http
GET /fnrh/precheckins?data_inicio=AAAA-MM-DD&data_fim=AAAA-MM-DD&exibir_vinculado=false
```

Comportamento da rota em `backend/server.js`:

- HTTP `400` para período ausente ou `exibir_vinculado` inválido;
- encaminha a consulta por `fetchFnrhPreCheckins()`;
- HTTP `502` quando a FNRH responde com status HTTP não bem-sucedido;
- HTTP `500` quando `fetch()` lança erro de rede/TLS;
- HTTP `200` quando a leitura oficial é bem-sucedida.

O frontend só apresenta a mensagem detalhada do backend para HTTP `400`. Para HTTP `500` ou `502`, `fetchFnrhPrecheckinsForPeriod()` produz um erro genérico, posteriormente mostrado como falha de atendimento ou de conexão segura, conforme a ação de origem.

## 4. Endpoints oficiais envolvidos

Configuração local encontrada:

```text
FNRH_MODE=real
FNRH_BASE_URL=https://fnrh.turismo.serpro.gov.br/FNRH_API/rest/v2
```

Consulta final:

```http
GET https://fnrh.turismo.serpro.gov.br/FNRH_API/rest/v2/hospedes/pre-checkins
    ?data_inicio=AAAA-MM-DD
    &data_fim=AAAA-MM-DD
    &exibir_vinculado=false
```

O backend usa o `fetch` nativo do Node, sem agente HTTPS customizado e sem `rejectUnauthorized: false`. Os cabeçalhos são:

- `Content-Type: application/json`;
- `Authorization: Basic ...`;
- `cpf_solicitante: ...`.

Os valores de autenticação não foram exibidos nem registrados neste relatório.

## 5. Erro real capturado

### Endpoint local atual

Reprodução controlada:

```text
GET http://localhost:3000/fnrh/precheckins?...&exibir_vinculado=false
status local: 200
resultado: 2 registros elegíveis
```

Nenhum dado pessoal retornado é reproduzido aqui. Esse resultado comprova que o backend ativo no instante do diagnóstico conseguiu completar a chamada externa.

### Controle com Node sem configuração adicional

O mesmo host oficial, acessado por um processo Node comum no ambiente atual, falhou antes de receber resposta HTTP:

```text
TypeError: fetch failed
cause.code: UNABLE_TO_VERIFY_LEAF_SIGNATURE
cause.message: unable to verify the first certificate
```

Trecho relevante da stack:

```text
TypeError: fetch failed
    at node:internal/deps/undici/undici:13510:13
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
Caused by: Error: unable to verify the first certificate
    at TLSSocket.onConnectSecure (node:_tls_wrap:1679:34)
```

Quando essa exceção ocorre dentro de `fetchFnrhPreCheckins()`, a rota local a captura e responde HTTP `500`, normalmente com `error: "fetch failed"` e sem status externo. Esse é o caminho compatível com as mensagens apresentadas pela interface.

## 6. Configuração TLS atual

Resultado da inspeção segura:

| Local | `NODE_EXTRA_CA_CERTS` |
|---|---|
| `backend/.env` | ausente |
| ambiente do terminal de diagnóstico | ausente |
| ambiente persistente do usuário | ausente |
| ambiente persistente da máquina | ausente |
| `scripts/start-local.bat` | não definido |

Também não foram encontrados no projeto:

- arquivo `.pem`, `.crt`, `.cer` ou pacote equivalente de CA;
- variável própria `FNRH_CA_CERT`;
- `SSL_CERT_FILE`;
- `NODE_USE_SYSTEM_CA`;
- `NODE_OPTIONS` configurando trust store;
- código com `rejectUnauthorized: false`;
- código com `NODE_TLS_REJECT_UNAUTHORIZED=0`.

O processo que escutava a porta `3000` era o PID `11212`, iniciado às 08:41:53. As permissões locais não permitiram ler sua linha de comando ou seu bloco de ambiente. Essa restrição é intencionalmente preservada porque o ambiente completo também poderia conter credenciais.

Como esse processo respondeu HTTP `200`, ele possui algum contexto efetivo diferente do terminal de controle ou a cadeia servida variou entre conexões. As evidências disponíveis não permitem distinguir com segurança entre:

- CA extra definida apenas na sessão que iniciou o processo;
- uso ainda ativo do bypass temporário naquela sessão;
- outra configuração de trust store não persistida;
- variação de cadeia/certificado entre conexões ao serviço oficial.

Não é possível confirmar que o processo atual esteja usando uma CA segura. É possível confirmar que **não existe configuração segura persistente no projeto ou nos escopos de ambiente inspecionados**.

O procedimento documentado de inicialização é `scripts/start-local.bat`, que apenas entra em `backend` e executa `node server.js`. `backend/package.json` também oferece `npm start`, que executa o mesmo comando. Não foi encontrada configuração do aplicativo no Agendador de Tarefas; as referências existentes ao Agendador tratam de backup. A tentativa de consultar tarefas/processos detalhados no Windows foi limitada por acesso negado.

## 7. Comparação com incidente anterior

O diagnóstico anterior em `docs/FNRH_RESERVATION_GUESTS_DIAGNOSTIC.md` registrou:

- falha do `fetch` nativo do Node;
- código `UNABLE_TO_VERIFY_LEAF_SIGNATURE`;
- funcionamento do host por ferramentas que usam a confiança do Windows;
- teste temporário com `NODE_TLS_REJECT_UNAUTHORIZED=0`;
- recomendação de configurar `NODE_EXTRA_CA_CERTS`.

O controle atual reproduziu exatamente o mesmo código e a mesma causa TLS. O endpoint externo agora é `/hospedes/pre-checkins`, enquanto o teste histórico usou `/reservas/{id}/hospedes`, mas ambos pertencem ao mesmo host e falham na etapa de certificado, antes da regra funcional do endpoint.

Assim, não há evidência de problema específico do fluxo sem Gov.br, do filtro `PRECHECKIN_NAOVINCULADO`, de estrangeiro, CPF ou passaporte. O incidente de cadeia de certificado continua presente no ambiente Node padrão.

## 8. Causa raiz provável/confirmada

Confirmado:

- o Node iniciado sem configuração TLS adicional não consegue validar a cadeia apresentada pelo host FNRH;
- o código exato é `UNABLE_TO_VERIFY_LEAF_SIGNATURE`;
- os dois fluxos afetados compartilham a mesma função e a mesma chamada externa;
- não existe configuração persistente de CA no repositório, no script usual ou nos escopos de ambiente consultados;
- o endpoint local estava funcionando no instante final do diagnóstico.

Causa raiz mais provável do erro observado após o reinício: o processo que falhou foi iniciado sem o contexto TLS que permitia ao processo anterior acessar a FNRH. Isso é compatível com a perda de uma variável definida apenas em outro terminal.

Entretanto, como o processo ativo durante a coleta respondeu `200`, não é possível afirmar que ele seja exatamente o mesmo estado de processo que exibiu a falha. Também deve ser conferido no navegador o valor efetivo de `API_BASE`: quando a página não é aberta por `localhost`, `127.0.0.1` ou `file:`, a configuração padrão pode direcionar chamadas ao backend hospedado, não ao backend local.

## 9. Solução segura mínima recomendada

Sem implementar nesta tarefa:

1. obter da fonte responsável a CA intermediária/raiz correta para a cadeia apresentada pelo host oficial;
2. salvar a cadeia em arquivo PEM numa localização operacional estável e com permissões de leitura restritas ao necessário;
3. definir `NODE_EXTRA_CA_CERTS` com caminho absoluto **antes de iniciar o Node**;
4. colocar essa definição no procedimento real de inicialização, preferencialmente em `scripts/start-local.bat` ou em ambiente persistente controlado;
5. iniciar o backend em terminal novo e confirmar que nenhuma variável de bypass está presente;
6. executar um único GET local e registrar apenas status, contagem e código técnico em caso de falha;
7. confirmar no navegador que `API_BASE` aponta para o backend que acabou de ser validado.

Somente adicionar `NODE_EXTRA_CA_CERTS` ao `.env` carregado pela aplicação não deve ser tratado como garantia suficiente: a configuração de confiança do processo precisa estar disponível no momento em que o Node é iniciado.

## 10. O que NÃO deve ser feito

Não usar como solução permanente:

- `NODE_TLS_REJECT_UNAUTHORIZED=0`;
- `rejectUnauthorized: false`;
- agente HTTPS que aceite certificado inválido;
- supressão genérica de erros TLS;
- gravação de chave, CPF solicitante ou token em logs;
- mudança de CPF/passaporte para contornar falha de transporte;
- repetição de POST/PATCH enquanto o GET não estiver confiável.

Nenhum desses mecanismos foi adicionado ao código ou configurado por esta tarefa.

## 11. Próximo teste controlado

Depois de instalar a CA de forma segura:

1. encerrar somente o backend local conhecido;
2. abrir um terminal novo, sem bypass TLS;
3. iniciar pelo procedimento que define `NODE_EXTRA_CA_CERTS`;
4. verificar que o processo novo escuta a porta `3000`;
5. executar `GET /fnrh/precheckins` para um período máximo de um dia;
6. registrar somente HTTP local, quantidade e eventual código técnico;
7. iniciar o atendimento sem Gov.br e confirmar a criação do baseline no navegador;
8. usar “Buscar fichas” e confirmar que apenas `PRECHECKIN_NAOVINCULADO` é exibido;
9. não importar, vincular, fazer check-in ou checkout nesse primeiro teste.

Critério de sucesso: o GET deve funcionar em um processo recém-iniciado, sem depender do terminal anterior e sem qualquer aviso de TLS desabilitado.
