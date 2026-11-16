import { z } from 'zod';

export const conversationIdParamSchema = z.object({
  id: z.string().uuid('Conversation ID must be a valid UUID.'),
});

export const createConversationSchema = z.object({
  id: z.string().uuid('Conversation ID must be a valid UUID.').optional(),
  title: z.string().trim().min(1, 'Title cannot be empty.').max(120, 'Title is too long.').optional().default('New conversation'),
});

export const updateConversationSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(120, 'Title is too long.'),
});

export const appendMessageSchema = z.object({
  id: z.string().uuid('Message ID must be a valid UUID.').optional(),
  role: z.enum(['user', 'assistant'], {
    errorMap: () => ({ message: 'Message role must be user or assistant.' }),
  }),
  text: z.string().trim().min(1, 'Message content is required.').max(10000, 'Message content is too long.'),
  toolName: z.string().trim().max(100).nullable().optional().default(null),
  result: z.any().nullable().optional().default(null),
  sources: z.array(z.any()).optional().default([]),
});
