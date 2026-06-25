FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
COPY tsconfig.json index.html vite.config.ts ./
COPY src ./src/

ARG VITE_API_URL=
ARG VITE_PRINT_AGENT_URL=http://127.0.0.1:9101

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_PRINT_AGENT_URL=$VITE_PRINT_AGENT_URL

RUN npm install
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
