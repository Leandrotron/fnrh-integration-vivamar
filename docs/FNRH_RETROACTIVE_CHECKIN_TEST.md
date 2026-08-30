# Teste real de check-in retroativo na FNRH

Data do teste: 30/08/2026

## 1. Reserva testada

- Número comercial da reserva: `3044392461884`.
- `fnrh_reserva_id` oficial persistido localmente: `f1489f05-b857-4a6d-b3d6-b8c3e2aca660`.
- O GET solicitado inicialmente com o número comercial, `GET /reservas/3044392461884/hospedes`, retornou HTTP `400`, com a mensagem sanitizada `Parâmetros de entrada inválidos.`
- O mecanismo existente no backend usa o `fnrh_reserva_id` UUID. A consulta repetida somente para leitura com esse UUID retornou HTTP `200` e confirmou uma única correspondência oficial.

## 2. Stay local

- `stay_id`: `146`.
- `reservation_id`: `3044392461884`.
- `sub_reservation_id`: `3044392461884`.
- Entrada prevista: `2026-08-26`.
- Saída prevista: `2026-08-30`.
- Quantidade de hóspedes locais vinculados: `1`.

## 3. Hóspede testado

- `guest_id` local: `96`.
- `fnrh_hospede_id`: `4013ad9a-ebb3-41bf-8d5c-6b9affac78c7`.
- `pessoa_id` oficial: `1f7040b4-a38f-41a4-b72b-4eab4b72565e`.
- A correlação foi feita pelo `fnrh_hospede_id` já persistido, não apenas pelo nome.
- O GET oficial pelo UUID da reserva retornou exatamente uma correspondência para esse hóspede.

## 4. Situação oficial antes

- HTTP do GET oficial: `200`.
- `situacao_hospede`: `Pré-check-in realizado`.
- `situacao_hospede_id`: `PRECHECKIN_REALIZADO`.
- `checkin_em`: `null`.
- `checkout_em`: `null`.

As pré-condições foram satisfeitas: associação única à reserva alvo, UUID válido, ausência de check-in e checkout oficiais e situação ainda anterior ao check-in.

## 5. Timestamp enviado

- Horário efetivo pretendido na pousada: `26/08/2026 14:00`, `America/Sao_Paulo`.
- Instante UTC enviado: `2026-08-26T17:00:00.000Z`.
- Endpoint: `PATCH /hospedes/4013ad9a-ebb3-41bf-8d5c-6b9affac78c7/checkin`.
- `Content-Type`: `text/plain`.
- Body: `2026-08-26T17:00:00.000Z`.

Foi executado exatamente um `PATCH`, sem repetição automática.

## 6. HTTP status

- HTTP `200`.
- A resposta foi considerada sucesso pela API.

## 7. Resposta sanitizada

```json
{
  "situacao_id": "CHECKIN_REALIZADO",
  "timestamp_retornado": "2026-08-26T17:00:00Z",
  "hospede_id": "4013ad9a-ebb3-41bf-8d5c-6b9affac78c7"
}
```

O coletor sanitizado normalizou o campo temporal da resposta, que poderia estar exposto como `checkin_em` ou `data_hora`; por isso o relatório usa o nome neutro `timestamp_retornado`. Nenhuma credencial, header de autorização, CPF ou segredo foi registrado.

## 8. Situação oficial depois

Foi executado um novo GET somente leitura pelo `fnrh_reserva_id` UUID, localizando exatamente o mesmo `fnrh_hospede_id`:

- HTTP: `200`.
- quantidade de correspondências: `1`.
- `situacao_hospede`: `Check-in realizado`.
- `situacao_hospede_id`: `CHECKIN_REALIZADO`.
- `checkout_em`: `null`.

## 9. `checkin_em` oficial depois

- `checkin_em`: `2026-08-26T17:00:00Z`.

A FNRH removeu apenas a precisão explícita de milissegundos `.000`; o instante é exatamente equivalente a `2026-08-26T17:00:00.000Z`.

## 10. Classificação

**A. ACEITO E PRESERVADO.**

O endpoint individual aceitou o check-in enviado em 30/08/2026 com data/hora efetiva retroativa de 26/08/2026 às 14:00 no horário da pousada e preservou o instante correspondente, `17:00 UTC`.

## 11. Divergência local

Conforme exigido, nenhum `UPDATE` foi feito no SQLite. Após o sucesso oficial, o hóspede local permaneceu temporariamente com:

- `fnrh_situacao_hospede_id`: `PRECHECKIN_REALIZADO`;
- `fnrh_checkin_at`: `null`;
- `fnrh_checkout_at`: `null`.

O fluxo existente **Atualizar situações no painel**, por `POST /stays/:stayId/fnrh/sincronizar-situacoes`, pode reconciliar a situação para `CHECKIN_REALIZADO` e atualizar `fnrh_situacao_synced_at`. Ele não preenche `fnrh_checkin_at`, pois a sincronização atual persiste somente situação e horário da consulta.

O endpoint local normal de check-in também consulta a situação oficial antes de operar; ao encontrar `CHECKIN_REALIZADO`, responde de forma idempotente sem novo PATCH. Esse caminho igualmente não reconstrói o timestamp local ausente. Portanto, a situação pode ser reconciliada pelo fluxo atual, mas o horário efetivo retroativo continuará ausente localmente sem uma evolução específica futura.

## 12. Conclusão sobre check-in retroativo

Neste caso real controlado, o endpoint individual `PATCH /hospedes/{hospede_id}/checkin` aceitou body `text/plain` com timestamp anterior ao momento da requisição e preservou o instante na consulta oficial posterior.

O resultado comprova a aceitação para este caso e este intervalo; não demonstra limites máximos de retroatividade, tratamento de datas futuras, correção de check-in já confirmado ou comportamento de endpoints em lote.

Limites respeitados:

- um único PATCH de check-in;
- nenhuma repetição;
- nenhum checkout;
- nenhuma operação em lote;
- nenhuma escrita em outro hóspede ou reserva;
- nenhuma alteração manual no banco;
- nenhuma alteração em backend, frontend ou configuração.
