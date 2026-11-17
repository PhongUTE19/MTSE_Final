# Stage 1: Build React static assets
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

# Copy client source without requiring a developer-local .env file.
COPY . .

RUN npm run build

# Stage 2: Serve with lightweight Nginx and runtime public config injection
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.d/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
