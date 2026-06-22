---
name: project-context
description: Crash Game fullstack challenge — monorepo structure, tech stack, current stage
metadata:
  type: project
---

Monorepo `fullstack-challenge` com serviços `games` e `wallets` + pacote `contracts`.
Stack: Bun + TypeScript strict + NestJS. Testes com `bun:test`.
Money usa `bigint` (centavos), sem `number` para lógica financeira.
DDD por camadas: domain / application / infrastructure / presentation.

Branch `feature/provably-fair` implementou: CrashPoint VO, RoundSeeds VO, computeCrashPoint (HMAC-SHA256),
verifyRound, GetRoundVerificationUseCase, GET /rounds/:id/verification, InMemoryRoundRepository em infra.
Round recebeu constructor opcional com seeds + crashPoint (backward-compatible).

**Why:** etapa de provably fair do desafio técnico.
**How to apply:** próxima etapa é documentação final ou review. Não abrir novas frentes grandes.
