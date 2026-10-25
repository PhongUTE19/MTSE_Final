# Spendwise authentication, authorization, and demo guide

This is the authoritative guide for the Spendwise authentication feature. It consolidates the earlier UI-phase report, implementation report, and authentication ADR into one practical handoff document.

## What has been implemented

- Email/password **Sign Up**, email confirmation, **Sign In**, **Sign Out**, session restoration, and password recovery.
- Google OAuth sign-in through Supabase Auth.
- Accessible password show/hide controls, form validation, error states, and disabled submit controls while a request is pending.
- Vite multi-page authentication routes: `auth.html`, `auth-callback.html`, `reset-password.html`, `expense.html`, and `admin.html`.
- Frontend route gates: a guest is sent to Sign In; a normal user sent to the admin URL is returned to the expense workspace.
- Backend JWT verification with `Supabase Auth getUser(accessToken)`. The backend does not authorize users from a locally decoded JWT.
- Role-based authorization using trusted `app_metadata.role` only. `user_metadata` cannot make someone an administrator.
- Per-user expense access through a caller-token Supabase client and RLS, with server-side owner predicates as a second boundary.
- Protected legacy `/api/admin/*` routes. They require a verified administrator role.

## Local URLs and access rules

When Vite runs on its configured port, use these URLs:

| Visitor | `http://localhost:5173/auth.html` | `http://localhost:5173/expense.html` | `http://localhost:5173/admin.html` |
| --- | --- | --- | --- |
| Guest | Sign In / Sign Up page | Redirects to Sign In | Redirects to Sign In |
| Signed-in user | Redirects to Expense | Expense workspace | Redirects to Expense |
| Signed-in admin | Redirects to Expense | Expense workspace | Administrator workspace |

Other direct pages:

- `http://localhost:5173/auth-callback.html` — completes email-confirmation and Google OAuth returns.
- `http://localhost:5173/reset-password.html` — accepts a valid recovery link and sets a new password.

## Configuration required before the demo

### 1. Local environment files

Create or update local `.env` files. Never commit real values.

`client/.env`

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<matching-publishable-or-anon-key>
```

Root `.env` (used by the Express server)

```dotenv
SUPABASE_URL=https://<same-project-ref>.supabase.co
SUPABASE_ANON_KEY=<same-publishable-or-anon-key>
SUPABASE_SECRET_KEY=<server-only-service-role-or-secret-key>
```

The URL and anon/publishable key must come from the **same Supabase project**. Do not put `SUPABASE_SECRET_KEY` in the client environment.

### 2. Supabase Dashboard

In **Authentication → Providers**:

1. Enable Email. Enable confirmation emails if the demo includes email verification.
2. Enable Google and provide the Google OAuth client ID and secret.
3. In **Authentication → URL Configuration**, add these Redirect URLs exactly:

   ```text
   http://localhost:5173/auth-callback.html
   http://localhost:5173/reset-password.html
   ```

   Add matching HTTPS URLs before production deployment.
4. Set the local Site URL to `http://localhost:5173` for local testing, or ensure it is otherwise compatible with the redirect configuration.

In Google Cloud Console, the OAuth application's authorized redirect URI must be Supabase's callback endpoint, not the local Vite page:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

Supabase then returns the completed session to `auth-callback.html`.

### 3. Database and RLS

The ownership migration must already be applied to the intended Supabase project before claiming live expense isolation. It adds `expense_transactions.user_id`, owner-only RLS policies, and the `(user_id, transaction_date desc)` index. This guide does not authorize applying migrations.

## How authentication works

```text
Browser → Supabase Auth → session/access token
Browser → Authorization: Bearer <access token> → Express API
Express → Supabase auth.getUser(token) → verified user + app_metadata role
Express → short-lived anon-key Supabase client with caller token → RLS-protected data
```

- The browser persists and refreshes its Supabase session through the SDK.
- Protected API requests attach the current access token.
- An invalid, expired, or missing token produces `401`.
- A valid non-admin token calling `/api/admin/*` produces `403`.
- A user accessing another user's transaction receives `404`, rather than learning whether it exists.

## Creating an administrator

Every new account defaults to the least-privileged `user` role. Do **not** edit a client-side value, `user_metadata`, or a browser JWT to try to create an admin.

1. Create or identify the account in **Supabase Dashboard → Authentication → Users**.
2. Copy the user's UUID.
3. Ensure the root `.env` has the correct `SUPABASE_URL` and server-only `SUPABASE_SECRET_KEY`.
4. From the project root in PowerShell, run the command below. Do not type angle brackets around the UUID:

   ```powershell
   npm run set-role -- 11111111-2222-3333-4444-555555555555 admin
   ```

5. The user must **sign out and sign in again** (or refresh their session) so the newly issued JWT includes `app_metadata.role = "admin"`.
6. Open `http://localhost:5173/admin` or `http://localhost:5173/analytics`.

To revoke administrator access:

```powershell
npm run set-role -- 11111111-2222-3333-4444-555555555555 user
```

If PowerShell blocks `npm.ps1`, use `npm.cmd` as prefix. The command uses the server-only Supabase Admin API and preserves unrelated `app_metadata` fields.

## Demo script

### Start the project

Open two terminals from the project root:

```powershell
npm.cmd --prefix server run dev
```

```powershell
npm.cmd --prefix client run dev
```

Then open `http://localhost:5173/auth.html`.

### Demonstrate a normal user

1. Open `expense.html` while signed out. Show that it redirects to Sign In.
2. On Sign Up, demonstrate invalid email, a password shorter than eight characters, and mismatched confirmation. The page displays accessible validation messages.
3. Create a disposable account with email/password.
4. If email confirmation is enabled, open the confirmation email. It returns through `auth-callback.html`, then continues to `expense.html`.
5. Sign out from the Expense sidebar. Refresh or revisit `expense.html` to show that access is again blocked.
6. Sign in with the same account. Refresh `expense.html` to show session restoration.
7. Click **Forgot password?**, send a recovery email, open the link, use Show/Hide on the new-password controls, and submit a valid new password. The button is disabled while the update is in progress, then the page returns to Sign In.

### Demonstrate Google OAuth

1. From Sign In or Sign Up, select **Continue with Google**.
2. Complete Google consent with a disposable account.
3. Show the return through `auth-callback.html` and redirect to `expense.html`.
4. Sign out and sign in again with Google if desired.

### Demonstrate user versus admin access

1. With a normal user, open `admin.html`; show the redirect back to `expense.html`.
2. Promote a disposable account using the `set-role` command above.
3. Sign out and back in as that account.
4. Open `admin.html`; show the administrator workspace.
5. Optionally call a legacy admin action or inspect the network request: backend `/api/admin/*` is also protected, so the browser gate is not the only authorization check.

## Expected evidence for assessment

| Requirement | Evidence to show |
| --- | --- |
| Sign Up / Sign In / Sign Out | Account creation or confirmation, login to Expense, then sidebar sign-out and protected-page redirect. |
| OAuth2 / Google login | Google consent screen, callback page, and successful redirect to Expense. |
| JWT authentication | Protected API requests include a Bearer token; missing/invalid token is rejected with `401`. Do not display tokens in a presentation. |
| Authorization | User cannot keep `admin.html`; verified admin can open it. Non-admin `/api/admin/*` request gets `403`. |
| Password recovery | Reset email, password show/hide, disabled update button, redirect to Sign In after success. |
| Session restoration | Refresh `expense.html` while signed in and remain in the workspace. |

## Important security boundaries

- Browser code receives only the public Supabase key.
- The server-only secret/service key stays in root `.env`; never send it in chat, source code, screenshots, or a commit.
- Administrator role comes only from verified Supabase `app_metadata.role`.
- The UI redirect is for usability. Express authorization and database RLS are the real access boundaries.
- Use disposable test accounts for demonstrations. Do not present real passwords, reset links, access tokens, or secrets.

## Main implementation locations

| Area | Location |
| --- | --- |
| Sign In, Sign Up, Google, reset request | `client/src/components/auth/AuthPage.jsx` |
| OAuth/email callback | `client/src/components/auth/AuthCallbackPage.jsx` |
| Password update | `client/src/components/auth/ResetPasswordPage.jsx` |
| Session and token helper | `client/src/services/supabaseAuth.js` |
| Expense/admin route gates | `client/src/components/expense/ExpenseSessionGate.jsx`, `client/src/components/admin/AdminSessionGate.jsx` |
| JWT verification and role middleware | `server/src/shared/middleware/authenticate.js`, `server/src/shared/middleware/authorize.js` |
| Protected admin API mount | `server/src/routes/adminRoute.js` |
| Controlled role assignment | `server/scripts/set-user-role.js` |

## Verification status and limitations

Local builds and focused authentication/authorization tests have passed. Interactive email delivery, Google consent, and live RLS behavior depend on the configured Supabase project and must be demonstrated using the checklist above. No credential should be committed, and this document does not authorize deployment or remote database changes.
