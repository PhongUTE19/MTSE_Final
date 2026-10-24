import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { initVectorStore, getVectorStoreCount } from './features/knowledgeBase/vectorStore.js';
import adminRouter from './routes/adminRoute.js';
import chatRouter from './features/chat/chat.routes.js';
import expenseRouter from './features/expenses/expenses.routes.js';
import expenseAgentRouter from './features/expenseAgent/expenseAgent.routes.js';
import { STATUS_KEYS, HTTP_STATUS } from './constants/index.js';
import {
  errorHandler,
  notFoundHandler,
  apiRateLimiter,
} from './shared/middleware/index.js';

const app = express();

// Security headers and request parsing middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Apply general rate limiter across API routes
app.use('/api', apiRateLimiter);

// Mounted API routes
app.use('/api/admin', adminRouter);
app.use('/api/user', chatRouter);
app.use('/api', expenseRouter);
app.use('/api/expense-agent', expenseAgentRouter);

// Health check endpoint (queries vector database count)
app.get('/api/health', async (req, res) => {
  try {
    const indexedChunks = await getVectorStoreCount();
    res.json({
      status: STATUS_KEYS.OK,
      indexedChunks,
    });
  } catch (error) {
    console.error('[Server] Health check error:', error.message);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      status: STATUS_KEYS.ERROR,
      detail: error.message,
    });
  }
});

// 404 handler for unmatched API routes
app.use(notFoundHandler);

// Centralized Express error handler
app.use(errorHandler);


// Ensure vector store is initialized on server startup
initVectorStore()
  .then(async () => {
    const count = await getVectorStoreCount();
    console.log(`[Server] Connected to Qdrant vector database at ${config.qdrantUrl}. Loaded ${count} indexed chunks in collection "${config.qdrantCollection}".`);
  })
  .catch((err) => {
    console.warn('[Server] Qdrant initialization warning:', err.message);
  });

app.listen(config.port, () => {
  console.log(`[Server] Student Handbook Assistant running at http://localhost:${config.port}`);
});
