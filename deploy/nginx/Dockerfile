FROM node:22-alpine AS sdk
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json vite.config.ts ./
COPY src ./src
RUN pnpm build

FROM nginx:alpine
COPY deploy/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/demo/ /usr/share/nginx/html/
COPY --from=sdk /app/dist/ /usr/share/nginx/html/sdk/
