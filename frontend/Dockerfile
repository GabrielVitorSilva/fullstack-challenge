FROM node:22-alpine AS builder

# Build-time args for Vite env vars (baked into the static bundle)
ARG VITE_OIDC_AUTHORITY=http://localhost:8080/realms/crash-game
ARG VITE_OIDC_CLIENT_ID=crash-game-client
ARG VITE_OIDC_REDIRECT_URI=http://localhost:3000/auth/callback
ARG VITE_API_BASE_URL=http://localhost:8000

ENV VITE_OIDC_AUTHORITY=$VITE_OIDC_AUTHORITY
ENV VITE_OIDC_CLIENT_ID=$VITE_OIDC_CLIENT_ID
ENV VITE_OIDC_REDIRECT_URI=$VITE_OIDC_REDIRECT_URI
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage: serve with nginx
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
