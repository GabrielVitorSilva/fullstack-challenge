FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock ./
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY services/games/package.json ./services/games/package.json
COPY services/wallets/package.json ./services/wallets/package.json
RUN bun install --frozen-lockfile

COPY packages/contracts ./packages/contracts
COPY services/games ./services/games

WORKDIR /app/services/games

EXPOSE 4001

CMD ["bun", "run", "start"]
