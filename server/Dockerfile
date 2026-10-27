FROM node:22-alpine

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source code and prompts
COPY src/ ./src/
COPY prompts/ ./prompts/

# Create data directory placeholder
RUN mkdir -p /app/data/knowledge

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "src/server.js"]
