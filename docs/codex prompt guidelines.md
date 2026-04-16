# Codex Prompt Guidelines — FNRH Project

## Objetivo

Padronizar a forma de escrever prompts para o Codex, garantindo:

- mudanças pequenas e seguras
- zero refactor acidental
- respeito ao estado atual do projeto
- previsibilidade no resultado

---

## Regra principal

> O Codex NÃO é responsável por decidir arquitetura.
> Ele apenas executa tarefas específicas e delimitadas.

---

## Estrutura obrigatória de prompt

Todo prompt deve seguir esta estrutura:

### 1. Objetivo
Descrever em UMA frase o que será feito.

Exemplo:
- Melhorar logs
- Ajustar builder
- Adicionar campo
- Corrigir validação

---

### 2. Contexto
Explicar o mínimo necessário:

- o que já existe
- o que já funciona
- o estado atual do sistema

Sem história longa.

---

### 3. Problema
Descrever claramente:

- o que está faltando
- ou o que não está visível
- ou o que precisa ser melhorado

---

### 4. Instruções passo a passo

Sempre numeradas.

Sempre específicas.

Sempre locais (ex: “dentro da função X”).

Nunca abertas.

---

### 5. Restrições (OBRIGATÓRIO)

Sempre incluir:

- NÃO refatorar
- NÃO alterar arquitetura
- NÃO mudar contratos existentes
- NÃO criar endpoints desnecessários
- NÃO mexer em partes fora do escopo

---

### 6. Resultado esperado

Descrever o comportamento final observável.

---

## Regras críticas

### ❌ Nunca fazer

- "melhorar código"
- "refatorar"
- "organizar melhor"
- "reestruturar"
- "otimizar"

Essas palavras fazem o Codex sair do controle.

---

### ✅ Sempre fazer

- indicar exatamente onde mexer
- indicar exatamente o que adicionar
- limitar escopo ao máximo
- trabalhar incrementalmente

---

## Escopo controlado

Sempre deixar claro:

- qual função será alterada
- qual arquivo será alterado
- o que NÃO deve ser alterado

---

## Regra de ouro

> Se o prompt permitir múltiplas interpretações,
> o Codex vai escolher a pior possível.

---

## Padrão de instrução técnica

Sempre usar instruções assim:

- "Dentro da função X"
- "Adicionar após Y"
- "Não alterar Z"
- "Criar variável chamada X"
- "Adicionar console.log com formato Y"

---

## Exemplo correto

```txt
Objetivo:
Melhorar debug do builder FNRH sem alterar comportamento.

Contexto:
- buildFNRHPayload já existe
- payload já é enviado corretamente

Problema:
Não é possível identificar origem dos dados (guest vs fallback).

Instrução:

1. Dentro da função buildFNRHPayload, criar:
   const debugInfo = []

2. Para cada guest, criar objeto guestDebug

3. Registrar origem dos campos:
   genero_id, raca_id, deficiencia_id...

4. Adicionar console.log estruturado no final

Restrições:
- NÃO alterar payload
- NÃO alterar envio
- NÃO refatorar

Resultado esperado:
Log claro com origem dos campos