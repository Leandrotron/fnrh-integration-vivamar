# Diagnostico: hospedes da reserva FNRH

Data do teste: 2026-07-08

## Rota criada

`GET /api/fnrh/debug/reserva/:id/hospedes`

A rota:

- localiza a stay local por `stays.id`;
- le `stays.fnrh_reserva_id`;
- chama `GET /reservas/{fnrh_reserva_id}/hospedes` na FNRH;
- retorna o JSON bruto recebido da FNRH;
- nao grava no banco;
- nao altera status local;
- nao interpreta regra de negocio.

## Campo local utilizado

O identificador da reserva na FNRH fica em:

`stays.fnrh_reserva_id`

O link oficial fica em:

`stays.fnrh_link_precheckin_oficial`

## Teste real controlado

Stay local testada: `106`

Endpoint FNRH chamado:

`GET /reservas/{fnrh_reserva_id}/hospedes`

Resultado:

- HTTP: `200`
- Tempo registrado no log local: `407 ms`
- Top-level retornado: `dados`
- Quantidade de hospedes retornada: `1`

## Campos encontrados

Cada item em `dados` veio com:

- `pessoa`
- `hospede`

Campos relevantes dentro de `pessoa`:

- `pessoa_id`
- `nome`
- `PaisNacionalidade_id`
- `genero_id`
- `genero`
- `data_nascimento`
- `numero`
- `tipo_documento_id`
- `tipo_documento`

Campos relevantes dentro de `hospede`:

- `hospede_id`
- `reserva_id`
- `pessoa_id`
- `situacao_hospede_id`
- `situacao_hospede`
- `situacao_cor`

## Status observado

O hospede retornou:

- `situacao_hospede_id`: `PRECHECKIN_REALIZADO`
- `situacao_hospede`: `Pre-check-in realizado`

Isso indica que este endpoint permite identificar, pelo menos neste caso real, que o hospede concluiu o pre-check-in/ficha.

## Datas de check-in/check-out

Nesta resposta real nao vieram campos de data/hora de check-in ou check-out.

## Limitacao encontrada

O `fetch` nativo do Node falhou inicialmente contra o host oficial da FNRH com:

`UNABLE_TO_VERIFY_LEAF_SIGNATURE`

O host respondeu normalmente via PowerShell/Windows. Para o teste unico, a instancia temporaria foi executada com `NODE_TLS_REJECT_UNAUTHORIZED=0`. Isso nao foi colocado no codigo.

Recomendacao antes de usar esta rota em rotina operacional: configurar a cadeia de certificados confiavel para o Node, por exemplo com `NODE_EXTRA_CA_CERTS`, em vez de desabilitar validacao TLS.

## Conclusao

O endpoint `GET /reservas/{fnrh_reserva_id}/hospedes` e promissor para diagnosticar preenchimento de ficha, porque retornou `situacao_hospede_id = PRECHECKIN_REALIZADO` e IDs oficiais de `hospede`/`pessoa`.

Ainda nao e recomendavel automatizar mudanca de status operacional com base nele sem mais testes controlados, especialmente com:

- reserva sem hospede enviada inicialmente;
- multiplos adultos;
- menores/dependentes;
- hospedes que ainda nao preencheram;
- hospedes com check-in/check-out ja realizados.
