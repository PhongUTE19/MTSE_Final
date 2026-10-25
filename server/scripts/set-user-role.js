import { setUserRole } from '../src/features/auth/index.js';

const [userId, requestedRole] = process.argv.slice(2);

if (!userId || !requestedRole) {
  console.error('Usage: npm run set-role -- <Supabase-user-UUID> <user|admin>');
  process.exit(1);
}

try {
  await setUserRole(userId, requestedRole);
  console.log(`Role updated to "${requestedRole}" for user ${userId}. Ask the user to sign out and sign in again to refresh the JWT.`);
} catch (error) {
  console.error(error.message || 'Unable to update user role.');
  process.exit(1);
}
