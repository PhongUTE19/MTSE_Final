# ADR 0001: SpendWise Authentication and Expense Ownership Architecture

- **Status:** Accepted and Implemented in Milestone 1
- **Deciders:** SpendWise Engineering Team
- **Date:** 2026-10-23

---

## 1. Context

The initial SpendWise prototype operated with unauthenticated Express endpoints and shared in-memory/JSON mock data. To support real multi-tenant personal finance management, the application required secure user authentication, tenant data isolation, and role-based access control (RBAC) distinguishing standard users from system administrators.

Key requirements:
1. Standard users must only access and modify their own financial transactions.
2. The frontend must authenticate users without possessing elevated backend database credentials.
3. Administrative routes (`/api/admin/*`) must be strictly protected, allowing access only to verified `admin` roles.
4. Tenant isolation must be enforced directly at the database layer, defending against accidental application-level authorization omissions.

---

## 2. Alternatives Considered

### Alternative 1: Custom JWT Auth with Local Express Password Hashing (bcrypt)
* **Pros**: No external authentication service dependency.
* **Cons**: Requires building and maintaining user tables, password reset token lifecycles, email verification mailers, session refresh token rotation, and OAuth providers from scratch. Increases attack surface and operational burden.

### Alternative 2: Backend-Only Session Cookies with Service-Role Database Access
* **Pros**: Hides access tokens from browser storage.
* **Cons**: All database queries would execute through a privileged service-role key, bypassing PostgreSQL Row-Level Security (RLS). A missing `WHERE user_id = ?` clause in any route handler would expose one tenant's private financial data to another.

### Alternative 3: Managed Supabase Auth + Bearer JWT + Client-Scoped RLS (Selected)
* **Pros**: Delegates credential storage, email verification, and OAuth to Supabase GoTrue. Employs short-lived Bearer JWTs verified asynchronously on the backend. Enables PostgreSQL Row-Level Security (RLS) on `public.expense_transactions` so that database queries automatically restrict records to `auth.uid() = user_id`.
* **Cons**: Requires configuring public and service-role keys and running migrations in PostgreSQL.

---

## 3. Decision

The team adopted **Alternative 3: Managed Supabase Auth + Bearer JWT + Client-Scoped RLS**.

### 3.1. Client-Side Security Boundary
* The browser client uses the Supabase browser SDK initialized strictly with public configuration: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
* The client **never** receives or stores the backend `SUPABASE_SECRET_KEY` (service-role key).
* The client attaches the current session access token as `Authorization: Bearer <token>` to all protected API requests.

### 3.2. Asynchronous Server-Side Token Verification
* Express middleware (`server/src/shared/middleware/authenticate.js`) verifies incoming Bearer tokens with Supabase Auth (`getUser(token)`).
* Unverifiable, expired, or malformed tokens return `401 Unauthorized`.
* Decoded claims alone are never trusted; user identity `{ id, email, role }` is derived from verified token metadata.

### 3.3. Role-Based Access Control (RBAC)
* The active role derives strictly from verified `app_metadata.role`, constrained to `'user'` or `'admin'`. If missing, it defaults safely to `'user'`.
* Client state and `user_metadata` are never used as authorization inputs.
* Only the server-side role assignment workflow (`server/scripts/set-user-role.js`) executed with `SUPABASE_SECRET_KEY` can promote an account to `admin`.
* Administrative endpoints (`/api/admin/*`) require `authorize('admin')` middleware.

### 3.4. Database Row-Level Security (RLS) and Scoped Client
* The database stores transactions in `public.expense_transactions` with `user_id uuid not null references auth.users(id) on delete cascade`.
* RLS policies enforce `auth.uid() = user_id` for all `SELECT`, `INSERT`, `UPDATE`, and `DELETE` operations.
* For each verified request, the backend creates a short-lived Supabase client initialized with the caller's Bearer token (`createScopedSupabaseClient(token)`), ensuring PostgreSQL RLS actively guards every database query.
* The privileged singleton client using `SUPABASE_SECRET_KEY` is quarantined to server-only analytics persistence (`server/src/features/analytics/analytics.repository.js`) and administrative role management.

---

## 4. Rationale

1. **Defense-in-Depth**: Multi-tenant financial data isolation cannot rely solely on Express route parameters. Database-level RLS guarantees that queries never leak records across tenants even if an endpoint filter has an implementation bug.
2. **Reduced Operational Overhead**: Using Supabase Auth provides battle-tested password hashing, session refresh mechanisms, and OAuth without custom cryptography code.
3. **Strict Credential Segregation**: Keeping the service-role key out of the browser and user CRUD paths eliminates the risk of privilege escalation.

---

## 5. Consequences & Trade-offs

### Positive
* **Bulletproof Multi-Tenancy**: Tenant boundaries are enforced in PostgreSQL via `auth.uid() = user_id`.
* **Zero Client Secret Exposure**: Frontend bundles contain only public anonymous keys.
* **Separation of Concerns**: Authentication is managed by GoTrue, authorization by Express middleware and PostgreSQL policies.
* **Automated Test Coverage**: Validated by unit tests in `tests/unit/middleware.test.js`, `tests/unit/clientAuth.test.js`, and `tests/unit/authService.test.js`.

### Trade-offs / Limitations
* **External Cloud Dependency**: Requires active Supabase project credentials for user sign-in and token validation.
* **Per-Request Client Creation**: The backend instantiates a lightweight scoped Supabase client per request to pass caller credentials to PostgreSQL.
