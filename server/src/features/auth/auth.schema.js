import { z } from 'zod';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const userRoleSchema = z.object({
  userId: z.string().regex(uuidPattern, 'Invalid user UUID.'),
  role: z.enum(['user', 'admin'], {
    errorMap: () => ({ message: 'Role must be either "user" or "admin".' }),
  }),
});
