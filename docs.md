# Crash Game — Documentação Técnica

> Referência interna para desenvolvimento, debug e onboarding.  
> Atualizada em: 2026-06-23

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura](#2-arquitetura)
3. [Modelo de Domínio](#3-modelo-de-domínio)
4. [Fluxos de Negócio](#4-fluxos-de-negócio)
5. [Contratos de Integração (Mensageria)](#5-contratos-de-integração-mensageria)
6. [Endpoints HTTP](#6-endpoints-http)
7. [Autenticação (OIDC / Keycloak)](#7-autenticação-oidc--keycloak)
8. [Frontend](#8-frontend)
9. [Infraestrutura e Serviços de Suporte](#9-infraestrutura-e-serviços-de-suporte)
10. [Como Rodar](#10-como-rodar)
11. [Como Testar](#11-como-testar)
12. [Como Debugar](#12-como-debugar)
13. [Decisões Técnicas](#13-decisões-técnicas)
14. [Glossário](#14-glossário)

---

## 1. Visão Geral

**Crash Game** é um jogo de cassino multiplayer em tempo real. Um multiplicador sobe a partir de `1.00x` e pode "crashar" a qualquer momento. Jogadores apostam antes da rodada e fazem cashout antes do crash para garantir o ganho — quem não saca perde a aposta.

O sistema é composto por:

| Camada | Responsabilidade |
|---|---|
| **Frontend** | UI do jogo (React + Vite) |
| **Kong** | API Gateway — roteamento, SSL termination |
| **Game Service** | Ciclo de vida da rodada, apostas, provably fair |
| **Wallet Service** | Saldo do jogador, crédito e débito |
| **RabbitMQ** | Mensageria assíncrona entre serviços |
| **PostgreSQL** | Persistência dos dois serviços |
| **Keycloak** | Identidade (OIDC / JWT) |

---

## 2. Arquitetura

### Diagrama geral

```
┌─────────────────────────────────────────────┐
│              Browser / Cliente              │
│          React + Vite (porta 5173)          │
│         nginx prod (porta 3000 →80)         │
└────────────┬──────────────────┬─────────────┘
         HTTP/REST          WebSocket (*)
             │                  │
┌────────────▼──────────────────▼─────────────┐
│                  Kong 3.9                   │
│          API Gateway  (porta 8000)          │
│   /games/* → games:4001                     │
│   /wallets/* → wallets:4002                 │
└────────────┬──────────────────┬─────────────┘
             │                  │
    ┌────────▼────────┐  ┌──────▼──────────┐
    │  Game Service   │  │ Wallet Service  │
    │  NestJS / Bun   │  │  NestJS / Bun   │
    │   porta 4001    │  │   porta 4002    │
    └────────┬──┬─────┘  └────────┬────────┘
             │  │                  │
        ┌────▼──┴──────────────────▼────┐
        │           RabbitMQ            │
        │   amqp://admin:admin@:5672    │
        │   UI: http://localhost:15672  │
        └───────────────────────────────┘
             │
        ┌────▼───────────────────────────┐
        │           PostgreSQL           │
        │   DB: games  (porta 5432)      │
        │   DB: wallets                  │
        └────────────────────────────────┘

   ┌──────────────────────┐
   │       Keycloak       │
   │  realm: crash-game   │
   │   porta 8080         │
   └──────────────────────┘
```

> (*) WebSocket ainda não implementado — previsto para a próxima etapa.

### Camadas de cada serviço (DDD)

```
src/
├── domain/          # Entidades, value objects, portas, erros de domínio
├── application/     # Use cases, portas de aplicação (IOutbox, IInbox)
├── infrastructure/  # Implementações: repositórios, publishers, outbox
└── presentation/    # Controllers NestJS, DTOs
```

Os serviços **não compartilham banco de dados**. Toda comunicação cross-service passa pelo RabbitMQ via contratos do pacote `@crash/contracts`.

---

## 3. Modelo de Domínio

### 3.1 Game Service

#### Round (Agregado raiz)

Gerencia o ciclo de vida completo de uma rodada.

```
BETTING ──► IN_PROGRESS ──► CRASHED
    │
    └──────────────────────► CANCELLED
```

| Estado | Significado |
|---|---|
| `BETTING` | Janela de apostas aberta |
| `IN_PROGRESS` | Multiplicador subindo, apostas fechadas |
| `CRASHED` | Rodada encerrada; `serverSeed` revelado |
| `CANCELLED` | Rodada cancelada; apostas confirmadas recebem reembolso |

**Invariantes:**
- Um jogador pode ter no máximo uma aposta por rodada (`DuplicateBetError`)
- Apostas só são aceitas em `BETTING` (`BettingClosedError`)
- Cashout só é permitido em `IN_PROGRESS` (`CashoutNotAllowedError`)
- Transições inválidas lançam `InvalidStateTransitionError`

#### Bet

Aposta de um jogador em uma rodada.

```
PENDING_DEBIT ──► CONFIRMED ──► CASHED_OUT
      │               │
      │               └──────► LOST
      │
      ├──────────────────────► DEBIT_FAILED
      │
      └──────────────────────► VOIDED ──► VOIDED_COMPENSATED
```

| Estado | Significado |
|---|---|
| `PENDING_DEBIT` | Comando enviado à Wallet; aguardando confirmação |
| `CONFIRMED` | Débito confirmado; aposta ativa |
| `DEBIT_FAILED` | Saldo insuficiente ou carteira não encontrada |
| `CASHED_OUT` | Jogador sacou antes do crash |
| `LOST` | Rodada crashou enquanto a aposta estava `CONFIRMED` |
| `VOIDED` | Rodada encerrou enquanto o débito ainda era assíncrono |
| `VOIDED_COMPENSATED` | Refund emitido via outbox para aposta `VOIDED` |

**`VOIDED_COMPENSATED` é persistido como coluna de status.** Isso garante idempotência após reinício de processo: ao reprocessar um `WalletDebitedEvent`, o use case verifica esse status e descarta o evento sem emitir um segundo crédito.

#### CrashPoint

Value object que representa o multiplicador de encerramento da rodada. Armazenado internamente em centésimos de multiplicador (`bigint`) para evitar aritmética de ponto flutuante:

```
100n = 1.00x   |   150n = 1.50x   |   25000n = 250.00x
```

#### Money (Game e Wallet)

Ambos os serviços possuem sua própria classe `Money` com a mesma semântica: valor em centavos como `bigint`. Nunca use `number` para valores monetários.

```typescript
Money.ofCents(500n)   // R$ 5,00
money.toCents()       // bigint
money.add(other)      // Money (imutável)
```

### 3.2 Wallet Service

#### Wallet

Agregado raiz do Wallet Service.

```typescript
wallet.credit(amount)  // sempre permitido
wallet.debit(amount)   // lança InsufficientFundsError se saldo < amount
```

O saldo é um `Money` (bigint em centavos). Nunca fica negativo — `debit` rejeita a operação com erro de domínio antes de alterar o estado.

---

## 4. Fluxos de Negócio

### 4.1 Fluxo de Aposta (Place Bet)

```
Frontend          Kong          Game Service          RabbitMQ         Wallet Service
   │                │                │                    │                  │
   │─POST /bet─────►│───────────────►│                    │                  │
   │                │                │ PlaceBetUseCase     │                  │
   │                │                │  round.placeBet()  │                  │
   │                │                │  (bet → PENDING)   │                  │
   │                │                │──outbox.saveAndEmit►│                  │
   │                │                │   [DebitWalletCmd] │──────────────────►│
   │◄──── 201 ──────│◄───────────────│                    │  ProcessDebit     │
   │                │                │                    │   wallet.debit()  │
   │                │                │                    │◄──WalletDebited──│
   │                │                │◄───────────────────│                  │
   │                │          HandleWalletDebited         │                  │
   │                │          round.confirmBet()          │                  │
   │                │          (bet → CONFIRMED)           │                  │
```

### 4.2 Fluxo de Cashout

```
Frontend          Kong          Game Service          RabbitMQ         Wallet Service
   │                │                │                    │                  │
   │─POST /cashout─►│───────────────►│                    │                  │
   │                │                │ CashoutUseCase      │                  │
   │                │                │  round.cashoutBet()│                  │
   │                │                │  (bet → CASHED_OUT)│                  │
   │                │                │──outbox.saveAndEmit►│                  │
   │◄──── 200 ──────│◄───────────────│   [CreditWalletCmd]│──────────────────►│
   │                │                │                    │  ProcessCredit    │
   │                │                │                    │   wallet.credit() │
   │                │                │                    │◄──WalletCredited─│
```

### 4.3 Cenário de Consistência Assíncrona (Late Arrival)

**Problema:** o débito ainda está em trânsito no broker quando a rodada crasha.

```
Round crasha → bet → VOIDED
     ↓
WalletDebitedEvent chega tarde
     ↓
HandleWalletDebitedUseCase detecta VOIDED
     ↓
bet.issueCompensation() → VOIDED_COMPENSATED
     ↓
outbox emite CreditWalletCommand (refund atômico)
     ↓
Wallet credita o jogador
```

**Idempotência:** Se o mesmo `WalletDebitedEvent` chegar novamente (at-least-once delivery), o use case vê `VOIDED_COMPENSATED` e descarta sem emitir segundo crédito.

### 4.4 Provably Fair

Algoritmo que permite ao jogador verificar, após a rodada, que o resultado não foi manipulado.

```
Antes das apostas:
  serverSeed = random(32 bytes hex)
  hashedServerSeed = SHA-256(serverSeed)
  → publicar hashedServerSeed para todos os jogadores

Cálculo do crash point:
  hash = HMAC-SHA256(key=serverSeed, data=nonce)
  h    = BigInt("0x" + hash.slice(0, 13))   // 52 bits
  e    = 2n ** 52n

  if (h % 101n === 0n):
    crash = 1.00x    // ~1% house edge
  else:
    crash = floor(100 * e / (e - h)) / 100

Após o crash:
  → revelar serverSeed via GET /games/rounds/:id/verify

Verificação pelo jogador:
  1. SHA-256(serverSeed) === hashedServerSeed  ✓  (não foi trocado)
  2. HMAC-SHA256(serverSeed, nonce) → recompute crash point  ✓
```

---

## 5. Contratos de Integração (Mensageria)

Pacote `packages/contracts` (`@crash/contracts`). Todos os tipos compartilhados entre serviços ficam aqui — **nunca importar de um serviço para outro diretamente.**

### Envelope base

```typescript
interface MessageEnvelope {
  correlationId: string;  // betId — une comando ao evento de resposta
  occurredAt: string;     // ISO-8601
}
```

### Comandos (Game → Wallet)

#### `wallet.debit`

Emitido quando um jogador faz uma aposta. Wallet deve debitar e responder.

```typescript
interface DebitWalletCommand extends MessageEnvelope {
  type: "wallet.debit";
  betId: string;
  roundId: string;
  playerId: string;
  amountCents: string;   // string de bigint para sobreviver ao JSON
}
```

#### `wallet.credit`

Emitido quando um jogador saca (cashout) ou quando um refund é necessário.

```typescript
interface CreditWalletCommand extends MessageEnvelope {
  type: "wallet.credit";
  betId: string;
  roundId: string;
  playerId: string;
  amountCents: string;
}
```

### Eventos (Wallet → Game)

#### `wallet.debited`

Débito efetuado com sucesso — aposta pode avançar para `CONFIRMED`.

```typescript
interface WalletDebitedEvent extends MessageEnvelope {
  type: "wallet.debited";
  betId: string;
  roundId: string;
  playerId: string;
  amountCents: string;
}
```

#### `wallet.debit_failed`

Débito rejeitado — aposta vai para `DEBIT_FAILED`.

```typescript
interface WalletDebitFailedEvent extends MessageEnvelope {
  type: "wallet.debit_failed";
  betId: string;
  roundId: string;
  playerId: string;
  reason: "INSUFFICIENT_FUNDS" | "WALLET_NOT_FOUND";
}
```

#### `wallet.credited`

Crédito confirmado (cashout pago ou refund efetuado).

```typescript
interface WalletCreditedEvent extends MessageEnvelope {
  type: "wallet.credited";
  betId: string;
  roundId: string;
  playerId: string;
  amountCents: string;
}
```

### Padrão Outbox / Inbox

**Outbox (`IOutbox`):** garante que estado do domínio e mensagem de saída são escritos atomicamente. A implementação de produção usa uma tabela `outbox` na mesma transação do `UPDATE rounds`. Um relay daemon lê e publica no broker.

```typescript
interface IOutbox {
  saveAndEmit(round: Round, events: ReadonlyArray<MessageEnvelope>): Promise<void>;
}
```

**Inbox (`IInbox`):** guarda-chave de mensagens já processadas, evitando efeitos duplicados por redelivery. Chave recomendada: `${event.type}:${event.correlationId}`.

```typescript
interface IInbox {
  hasProcessed(messageKey: string): Promise<boolean>;
  markProcessed(messageKey: string): Promise<void>;
}
```

---

## 6. Endpoints HTTP

Todos os endpoints são acessados via Kong: `http://localhost:8000`.

### 6.1 Wallet Service — `/wallets`

| Método | Endpoint | Auth | Status |
|---|---|---|---|
| `POST` | `/wallets` | ✅ Bearer | ⚠️ Não implementado |
| `GET` | `/wallets/me` | ✅ Bearer | ⚠️ Não implementado |
| `GET` | `/wallets/health` | ❌ | ✅ |

**`GET /wallets/me` — Resposta esperada:**
```json
{
  "id": "uuid",
  "userId": "uuid",
  "balanceCents": 10000
}
```

> Crédito e débito **não são endpoints REST** — acontecem via mensageria.

### 6.2 Game Service — `/games`

| Método | Endpoint | Auth | Status |
|---|---|---|---|
| `GET` | `/games/health` | ❌ | ✅ |
| `GET` | `/games/rounds/:roundId/verify` | ❌ | ✅ |
| `GET` | `/games/rounds/current` | ❌ | ⚠️ Não implementado |
| `GET` | `/games/rounds/history` | ❌ | ⚠️ Não implementado |
| `POST` | `/games/bet` | ✅ Bearer | ⚠️ Não implementado |
| `POST` | `/games/bet/cashout` | ✅ Bearer | ⚠️ Não implementado |
| `GET` | `/games/bets/me` | ✅ Bearer | ⚠️ Não implementado |

**`GET /games/rounds/:roundId/verify` — Resposta:**
```json
{
  "roundId": "uuid",
  "nonce": "round-nonce",
  "serverSeed": "hex-64-chars",
  "hashedServerSeed": "sha256-hex",
  "crashMultiplier": "2.47"
}
```

O cliente pode verificar independentemente:
```bash
# 1. Confirmar compromisso
echo -n "<serverSeed>" | sha256sum
# deve ser igual a hashedServerSeed

# 2. Recomputar crash point
# HMAC-SHA256(key=serverSeed, data=nonce) → primeiros 52 bits → fórmula
```

### 6.3 Acesso direto (sem Kong)

| Serviço | URL direta | Uso |
|---|---|---|
| Game Service | `http://localhost:4001` | Debug / healthcheck |
| Wallet Service | `http://localhost:4002` | Debug / healthcheck |

---

## 7. Autenticação (OIDC / Keycloak)

### Configuração do realm

| Parâmetro | Valor |
|---|---|
| Realm | `crash-game` |
| Client ID | `crash-game-client` |
| Tipo | Public (sem client secret) |
| Flow | Authorization Code + PKCE S256 |
| Redirect URIs | `http://localhost:3000/*`, `http://localhost:5173/*` |
| Discovery | `http://localhost:8080/realms/crash-game/.well-known/openid-configuration` |
| Admin UI | `http://localhost:8080` → `admin` / `admin` |
| Usuário de teste | `player` / `player123` |

### Fluxo OIDC no frontend

```
Usuário clica "Sign in"
    ↓
signinRedirect() → Keycloak (:8080)
    ↓
Keycloak autentica, redireciona para /auth/callback?code=...&state=...
    ↓
react-oidc-context troca code por tokens (PKCE)
    ↓
onSigninCallback() limpa params da URL
    ↓
Tokens salvos em sessionStorage (WebStorageStateStore)
    ↓
RequireAuth libera acesso → /game
```

### Storage de tokens

Tokens de acesso e refresh ficam em `sessionStorage`:
- **Sobrevivem** a recarregamentos de página dentro da mesma aba
- **São apagados** quando a aba é fechada
- **Não propagam** entre abas (diferente de `localStorage`)

Essa escolha é intencional para contextos de jogo: uma sessão por aba, sem persistência cross-session.

### Uso do token nas chamadas à API

```typescript
// O hook useAuth() expõe o access token diretamente
const auth = useAuth();
const token = auth.user?.access_token;

// O cliente HTTP injeta o Bearer token automaticamente
api.get("/wallets/me", token);
// → Authorization: Bearer <jwt>
```

---

## 8. Frontend

### Stack

| Camada | Tecnologia |
|---|---|
| Framework | React 18 + Vite 6 |
| Linguagem | TypeScript strict |
| Roteamento | React Router v6 |
| Autenticação | react-oidc-context + oidc-client-ts |
| Estilo | CSS Modules + CSS custom properties |
| Testes | Vitest + Testing Library |
| Produção | nginx 1.27 (multi-stage Docker) |

### Estrutura de pastas

```
frontend/src/
├── auth/
│   ├── oidcConfig.ts      # Configuração OIDC (authority, client_id, userStore)
│   ├── useAuth.ts         # Re-export de useAuth de react-oidc-context
│   └── RequireAuth.tsx    # Guard de rota — redireciona para /login
├── components/
│   ├── layout/
│   │   ├── AppLayout.tsx  # Shell: Header + Outlet
│   │   └── Header.tsx     # Barra superior com user info e logout
│   └── ui/
│       ├── LoadingSpinner.tsx
│       └── ErrorMessage.tsx
├── hooks/
│   └── useWallet.ts       # Busca saldo, gerencia loading/error/cancel
├── pages/
│   ├── LoginPage.tsx      # Tela de login com signinRedirect()
│   ├── CallbackPage.tsx   # Handler do callback OIDC
│   └── GamePage.tsx       # Shell do jogo (placeholder)
├── services/
│   ├── api.ts             # Cliente HTTP com Bearer token e ApiError
│   └── wallets.ts         # GET /wallets/me
├── utils/
│   └── money.ts           # centsToDisplay() — aritmética inteira
└── styles/
    └── global.css         # Design tokens, reset, utilitário .full-screen-center
```

### Variáveis de ambiente

```bash
# .env (desenvolvimento local)
VITE_OIDC_AUTHORITY=http://localhost:8080/realms/crash-game
VITE_OIDC_CLIENT_ID=crash-game-client
VITE_OIDC_REDIRECT_URI=http://localhost:5173/auth/callback
VITE_API_BASE_URL=http://localhost:8000
```

As variáveis `VITE_*` são **embutidas no bundle em build-time** pelo Vite. Para Docker, são passadas via `build.args` no `docker-compose.yml`.

### Proxy de desenvolvimento

O Vite proxeia chamadas de `/api/*` para o Kong em desenvolvimento, evitando problemas de CORS:

```
/api/games/*   → http://localhost:8000/games/*
/api/wallets/* → http://localhost:8000/wallets/*
```

---

## 9. Infraestrutura e Serviços de Suporte

### Mapa de portas

| Serviço | Porta | Protocolo | Descrição |
|---|---|---|---|
| Frontend (dev) | `5173` | HTTP | Vite dev server |
| Frontend (prod) | `3000` | HTTP | nginx via Docker |
| Kong Proxy | `8000` | HTTP | API Gateway — ponto de entrada da API |
| Kong Admin | `8001` | HTTP | API de administração do Kong |
| Game Service | `4001` | HTTP | NestJS direto (sem gateway) |
| Wallet Service | `4002` | HTTP | NestJS direto (sem gateway) |
| Keycloak | `8080` | HTTP | IdP — login, tokens |
| RabbitMQ AMQP | `5672` | AMQP | Broker de mensagens |
| RabbitMQ UI | `15672` | HTTP | Management UI |
| PostgreSQL | `5432` | TCP | Banco de dados |

### Bancos de dados

Dois bancos isolados no mesmo servidor PostgreSQL:

| Banco | Dono | Criado por |
|---|---|---|
| `games` | Game Service | `docker/postgres/init-databases.sh` |
| `wallets` | Wallet Service | `docker/postgres/init-databases.sh` |

Credenciais: `admin` / `admin` (apenas para desenvolvimento local).

### Roteamento Kong (declarativo)

```yaml
# docker/kong/kong.yml
services:
  - name: games-service
    url: http://games:4001
    routes:
      - paths: [/games]   # strip_path: true

  - name: wallets-service
    url: http://wallets:4002
    routes:
      - paths: [/wallets] # strip_path: true
```

Kong está em modo DB-less (declarativo). Mudanças no roteamento: editar `docker/kong/kong.yml` e reiniciar o container.

### Keycloak

Realm `crash-game` é importado automaticamente via `--import-realm` no startup. Arquivo: `docker/keycloak/realm-export.json`.

Para exportar o realm após alterações manuais:
```bash
docker exec -it <keycloak-container> \
  /opt/keycloak/bin/kc.sh export \
  --dir /opt/keycloak/data/import \
  --realm crash-game
```

---

## 10. Como Rodar

### Pré-requisitos

- Docker e Docker Compose
- Bun >= 1.x (para scripts do monorepo e serviços backend)
- Node.js >= 20 / npm (para o frontend)

### Subir tudo com Docker

```bash
# Clonar e instalar
git clone <repo-url>
cd fullstack-challenge
bun install

# Subir toda a stack
bun run docker:up

# Parar
bun run docker:down

# Destruir tudo (volumes, imagens, containers)
bun run docker:prune
```

Após `docker:up`, a aplicação estará disponível em `http://localhost:3000`.

### Rodar o frontend em modo desenvolvimento

```bash
# Opção 1: via script do monorepo
bun run frontend:dev

# Opção 2: diretamente
cd frontend
npm install
npm run dev
```

Acesse em `http://localhost:5173`. Login: `player` / `player123`.

### Rodar os serviços backend fora do Docker

```bash
# Pré-requisito: infraestrutura rodando
bun run docker:up

# Game Service
cd services/games
cp .env.example .env
# Editar DATABASE_URL e RABBITMQ_URL para apontar para localhost se necessário
bun run start:dev

# Wallet Service
cd services/wallets
cp .env.example .env
bun run start:dev
```

> Quando rodando fora do Docker, substitua `postgres` e `rabbitmq` por `localhost` nos `.env`.

### Ordem de healthcheck

O `docker-compose.yml` define dependências com `condition: service_healthy`. A ordem de prontidão é:

```
postgres ──► games
         ──► wallets

rabbitmq ──► games
         ──► wallets

postgres + rabbitmq ──► kong ──► frontend
keycloak            ──────────────► frontend
```

---

## 11. Como Testar

### Backend — Game Service

```bash
cd services/games

# Testes unitários (não requerem Docker)
bun test tests/unit

# Testes E2E (requerem docker:up)
bun test tests/e2e
```

Cobertura atual (`tests/unit`):

| Arquivo | O que testa |
|---|---|
| `round.spec.ts` | Ciclo de vida do Round, invariantes |
| `bet.spec.ts` | Máquina de estados da Bet |
| `bet-status.spec.ts` | Transições VALID_BET_TRANSITIONS |
| `provably-fair.spec.ts` | computeCrashPoint, hashServerSeed, verifyRound |
| `place-bet.use-case.spec.ts` | Fluxo de aposta, outbox, erros |
| `cashout.use-case.spec.ts` | Fluxo de cashout, outbox |
| `handle-wallet-debited.use-case.spec.ts` | Confirmação, late-arrival, idempotência |
| `handle-wallet-debit-failed.use-case.spec.ts` | Falha de débito, late-arrival |
| `idempotency.spec.ts` | VOIDED_COMPENSATED após restart |
| `get-round-verification.use-case.spec.ts` | Endpoint de verificação provably fair |

### Backend — Wallet Service

```bash
cd services/wallets
bun test tests/unit
```

| Arquivo | O que testa |
|---|---|
| `wallet.spec.ts` | Crédito, débito, saldo insuficiente |
| `money.spec.ts` | Aritmética de centavos, imutabilidade |
| `process-credit-command.use-case.spec.ts` | Crédito via mensagem |
| `process-debit-command.use-case.spec.ts` | Débito, INSUFFICIENT_FUNDS, WALLET_NOT_FOUND |

### Frontend

```bash
cd frontend
npm test         # execução única
npm run test:watch  # modo watch
```

| Arquivo | O que testa |
|---|---|
| `utils/money.test.ts` | centsToDisplay: zero, inteiros, frações, negativos |
| `services/api.test.ts` | Bearer header, ApiError, parse JSON |
| `services/wallets.test.ts` | Endpoint correto `/wallets/me`, tipagem |

### Contratos

```bash
cd packages/contracts
bun test
```

---

## 12. Como Debugar

### Verificar saúde dos serviços

```bash
# Game Service
curl http://localhost:8000/games/health
# → {"status":"ok","service":"games"}

# Wallet Service
curl http://localhost:8000/wallets/health
# → {"status":"ok","service":"wallets"}

# Via porta direta (sem Kong)
curl http://localhost:4001/health
curl http://localhost:4002/health
```

### Verificar uma rodada (provably fair)

```bash
curl http://localhost:8000/games/rounds/<roundId>/verify
```

### Logs dos containers

```bash
# Todos os serviços
docker compose logs -f

# Serviço específico
docker compose logs -f games
docker compose logs -f wallets
docker compose logs -f kong
docker compose logs -f keycloak

# Últimas 100 linhas
docker compose logs --tail=100 games
```

### RabbitMQ Management UI

Acesse `http://localhost:15672` — `admin` / `admin`.

Permite:
- Ver filas, exchanges e bindings
- Inspecionar mensagens presas na fila
- Publicar mensagens manualmente para simular eventos
- Ver taxa de throughput em tempo real

### Inspecionar tokens JWT

Com o frontend rodando, abra o DevTools (F12):

```javascript
// Token de acesso salvo em sessionStorage
const key = Object.keys(sessionStorage).find(k => k.includes('user'));
const user = JSON.parse(sessionStorage.getItem(key));
console.log(user.access_token);

// Decodificar (sem validar assinatura)
const [, payload] = user.access_token.split('.');
console.log(JSON.parse(atob(payload)));
```

Ou use `jwt.io` — cole o token para inspecionar claims.

### Testar endpoints autenticados com curl

```bash
# 1. Obter token (direct access grant — apenas em dev)
TOKEN=$(curl -s -X POST \
  http://localhost:8080/realms/crash-game/protocol/openid-connect/token \
  -d "grant_type=password&client_id=crash-game-client&username=player&password=player123" \
  | jq -r .access_token)

# 2. Usar o token
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/wallets/me
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/games/bets/me
```

### Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Frontend mostra "Unavailable" no saldo | `GET /wallets/me` não implementado no backend | Esperado; endpoint será implementado em próxima etapa |
| Kong retorna 502 | Serviço backend não subiu | `docker compose logs games` ou `wallets` |
| Keycloak lento na primeira inicialização | Import do realm na startup | Aguardar ~30s; `docker compose logs -f keycloak` |
| `invalid_grant` no login | Token expirado ou redirect_uri errado | Verificar `VITE_OIDC_REDIRECT_URI` no `.env` |
| RabbitMQ mostra mensagens acumulando | Consumer do serviço caído ou não implementado | `docker compose restart games` |
| `tsc --noEmit` falha no frontend | Algum tipo incorreto | `cd frontend && npx tsc --noEmit 2>&1` |
| Bun test falha com "cannot find module" | Workspace não instalado | `bun install` na raiz do monorepo |

### Recriar banco limpo

```bash
bun run docker:prune  # destrói volumes
bun run docker:up     # sobe do zero
```

---

## 13. Decisões Técnicas

### Dinheiro como bigint, não float

Toda aritmética monetária usa `BigInt` em centavos. `1234n = R$ 12,34`. Isso elimina erros de arredondamento de IEEE 754 que corromperiam saldos ao longo do tempo. O frontend usa `centsToDisplay()` com divisão inteira para o mesmo motivo.

### amountCents como string no contrato

`BigInt` não serializa em JSON (`JSON.stringify(1n)` lança erro). O contrato usa `amountCents: string` para sobreviver ao transporte; o receptor converte com `BigInt(amountCents)`.

### Outbox atômico

O padrão Outbox garante que o estado do domínio e a mensagem de saída são escritos juntos ou não escritos. Sem ele, um crash entre `save(round)` e `publish(event)` deixaria o sistema inconsistente (aposta confirmada no banco, débito nunca solicitado à Wallet).

A implementação de produção precisa de uma tabela `outbox` na mesma transação SQL do update do agregado. A `InMemoryOutbox` simula atomicidade em testes.

### VOIDED_COMPENSATED como status persistido

Em vez de um flag booleano separado `compensationDispatched`, o status `VOIDED_COMPENSATED` é um valor da máquina de estados. Vantagens:

1. Qualquer mapper que persiste `bet.status` persiste a compensação automaticamente
2. A máquina de estados (`VALID_BET_TRANSITIONS`) impede transição dupla
3. Sobrevive a reinício de processo: ao reprocessar mensagens do broker, o use case vê `VOIDED_COMPENSATED` e descarta

### Tokens em sessionStorage (não localStorage)

Sessão por aba: tokens somem ao fechar. Adequado para o contexto de jogo onde sessões abertas indefinidamente são indesejadas. `localStorage` propagaria a sessão entre abas, o que poderia resultar em estado inconsistente se um jogador mantivesse múltiplas abas abertas.

### Kong DB-less

Configuração declarativa em `docker/kong/kong.yml` — sem banco de dados para o gateway. Simples de versionar e reproduzível em qualquer ambiente.

### Frontend independente do workspace Bun

O frontend usa `npm` (não `bun`) para compatibilidade com o ecossistema Vite/React. Por isso não está nos `workspaces` do `package.json` raiz — os scripts `frontend:*` delegam com `npm --prefix frontend`.

---

## 14. Glossário

| Termo | Definição |
|---|---|
| **Aggregrate root** | Entidade que controla o acesso a um cluster de objetos de domínio (`Round`, `Wallet`) |
| **Bounded Context** | Limite explícito de responsabilidade: Game e Wallet são contextos separados |
| **Crash Point** | Multiplicador onde a rodada encerra, pré-determinado via provably fair |
| **House Edge** | Vantagem da casa; ~1% via `h % 101n === 0n` no algoritmo |
| **Idempotência** | Processar a mesma mensagem múltiplas vezes tem o mesmo efeito que processá-la uma vez |
| **Inbox** | Tabela de mensagens já processadas — evita efeitos duplicados por at-least-once |
| **Money** | Value object: `bigint` em centavos; nunca `number` |
| **Nonce** | Identificador público da rodada (ex: `roundId`); ligado ao `serverSeed` via HMAC |
| **OIDC** | OpenID Connect — protocolo de autenticação sobre OAuth 2.0 |
| **Outbox** | Tabela transacional de mensagens a publicar; garante entrega após crash do processo |
| **PKCE** | Proof Key for Code Exchange — extensão OAuth para clients públicos sem secret |
| **Provably Fair** | Técnica criptográfica que permite ao jogador verificar que o resultado não foi manipulado |
| **RTP** | Return to Player — retorno esperado ao jogador (~99% neste algoritmo) |
| **Saga** | Sequência de operações distribuídas com lógica de compensação em caso de falha |
| **serverSeed** | Seed secreta gerada antes das apostas; revelada após o crash |
| **Value Object** | Objeto sem identidade própria, definido por seus valores (`Money`, `CrashPoint`) |
| **VOIDED** | Bet em limbo: rodada encerrou enquanto o débito estava em trânsito |
| **VOIDED_COMPENSATED** | Refund foi emitido atomicamente via outbox para uma bet VOIDED |
