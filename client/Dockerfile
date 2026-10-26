# Stage 1: Build React static assets
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

# Copy client source and public build-time environment configuration.
COPY . .

# Validate required public Supabase configuration.
RUN grep -Eq '^VITE_SUPABASE_URL=.+$' .env \
    && grep -Eq '^VITE_SUPABASE_ANON_KEY=.+$' .env \
    || (echo "Error: client/.env must define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY." >&2; exit 1)

RUN npm run build

# Stage 2: Serve with lightweight Nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]