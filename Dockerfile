# Imagem de produção do RotaU: compila o site (Vite) e sobe a API Express,
# que serve o site e a API juntos na mesma porta.
FROM node:22-slim AS build
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
COPY ["Site para RotaU/package.json", "Site para RotaU/pnpm-lock.yaml", "Site para RotaU/pnpm-workspace.yaml", "./"]
RUN pnpm install --frozen-lockfile
COPY ["Site para RotaU/", "./"]
RUN pnpm build

FROM node:22-slim
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
ENV NODE_ENV=production
COPY ["Site para RotaU/package.json", "Site para RotaU/pnpm-lock.yaml", "Site para RotaU/pnpm-workspace.yaml", "./"]
RUN pnpm install --frozen-lockfile --prod
COPY ["Site para RotaU/server/", "./server/"]
COPY --from=build /app/dist ./dist
# O banco fica em /data: monte um volume (disco persistente) nessa pasta
# para não perder os cadastros a cada nova publicação.
ENV DB_PATH=/data/rotau.db
# A hospedagem informa a porta na variável PORT.
CMD ["sh", "-c", "API_PORT=${PORT:-3001} exec node --experimental-strip-types --no-warnings server/index.ts"]
