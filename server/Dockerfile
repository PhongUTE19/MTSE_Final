FROM node:22-alpine

WORKDIR /app

# Install production dependencies
COPY server/package*.json ./
RUN npm install --omit=dev

# Copy application source code, canonical prompts, and canonical Knowledge Base documents
COPY server/src/ ./src/
COPY server/prompts/ ./prompts/
COPY data/knowledge/ ./data/knowledge/

ENV NODE_ENV=production
ENV KNOWLEDGE_DIR=/app/data/knowledge

EXPOSE 3000

CMD ["node", "src/server.js"]
