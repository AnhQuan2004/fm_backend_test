# OTP Mail Auth Backend

Next.js (App Router) backend that handles email OTP authentication, user profiles, and Supabase-backed bounty management.

## Prerequisites

- Node.js 18+
- npm
- A Supabase project (Postgres database)
- SMTP credentials for sending OTP emails

## Getting Started

```bash
git clone <repository-url>
cd fm_backend
npm install
cp .env.example .env # then fill in the values below
npm run dev
```

### Environment Variables

```
# Supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=your-anon-key
# Optional: backend privileged key
# SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT
JWT_SECRET=replace-me

# OTP
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASS=your-app-password
SMTP_FROM=you@example.com
```

Restart the dev server whenever you change `.env`.

### Supabase Schema

Run the SQL below in the Supabase SQL editor to provision the required tables:

```sql
create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  username text unique,
  first_name text,
  last_name text,
  location text,
  skills text[] default '{}',
  socials text,
  github text,
  display_name text,
  bio text,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.otp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts_left int not null default 5,
  status text not null check (status in ('PENDING','USED','EXPIRED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type if not exists bounty_category as enum ('dev','content','design','research');
create type if not exists bounty_status as enum ('open','in_review','closed');

create table if not exists public.bounties (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category bounty_category not null,
  reward_amount numeric not null,
  reward_token text not null,
  deadline timestamptz not null,
  status bounty_status not null default 'open',
  created_by uuid not null references public.users(id) on delete cascade,
  creator_email text,
  creator_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists otp_tokens_user_idx on public.otp_tokens(user_id);
create index if not exists otp_tokens_status_idx on public.otp_tokens(status);
create index if not exists bounties_status_idx on public.bounties(status);
create index if not exists bounties_category_idx on public.bounties(category);
create index if not exists bounties_created_by_idx on public.bounties(created_by);
```

Enable Row Level Security (RLS) as needed. If RLS is enabled, supply a `SUPABASE_SERVICE_ROLE_KEY` in `.env` so the backend can bypass policies.

## API Reference

Unless stated otherwise, all responses follow the shape:

```json
{ "ok": true, "...": "..." }
```

Errors use HTTP `4xx/5xx` and return:

```json
{ "ok": false, "error": "message" }
```

For endpoints that require authentication, include the `session` cookie returned by `POST /api/auth/verify-otp`.

### Authentication & Session

#### `POST /api/auth/request-otp`
- **Purpose:** Issue a 6-digit OTP and send it via email.
- **Body:**
  ```json
  { "email": "user@example.com" }
  ```
- **Success (200):**
  ```json
  { "ok": true, "tokenId": "uuid" }
  ```
  Use `tokenId` together with the OTP code to verify the session.
- **Errors:** `400` for invalid email payload or mail delivery issues.

#### `POST /api/auth/verify-otp`
- **Purpose:** Validate OTP, set `session` cookie (JWT) on success.
- **Body:**
  ```json
  {
    "email": "user@example.com",
    "otp": "123456",
    "tokenId": "uuid-from-request"
  }
  ```
- **Success (200):**
  ```json
  {
    "ok": true,
    "user": {
      "email": "user@example.com",
      "userId": "uuid",
      "username": null,
      "firstName": null,
      "lastName": null,
      "location": null,
      "skills": [],
      "socials": null,
      "github": null,
      "displayName": null,
      "bio": null,
      "role": "user"
    }
  }
  ```
  Response includes session cookie header (`Set-Cookie: session=...; HttpOnly; ...`).
- **Errors:** `400` for invalid OTP/token, `401` if expired or misused.

#### `GET /api/auth/me`
- **Purpose:** Inspect current session via cookie.
- **Auth:** Requires `session` cookie.
- **Success (200):**
  ```json
  { "ok": true, "user": { "userId": "uuid", "email": "user@example.com" } }
  ```
- **Errors:** `401` if cookie missing/invalid.

### Profile

#### `GET /api/auth/profile`
- **Purpose:** Retrieve profile fields.
- **Auth:** Provide either `?email=...` query or rely on `session` cookie.
- **Success (200):**
  ```json
  {
    "ok": true,
    "profile": {
      "email": "user@example.com",
      "username": "",
      "firstName": "",
      "lastName": "",
      "location": "",
      "skills": [],
      "socials": "",
      "github": "",
      "displayName": "",
      "bio": "",
      "role": "user",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  }
  ```
- **Errors:** `400` if email missing, `404` when user not found.

#### `POST /api/auth/profile`
- **Purpose:** Create or update a profile.
- **Body:**
  ```json
  {
    "email": "user@example.com",
    "username": "user-name",
    "firstName": "First",
    "lastName": "Last",
    "location": "City",
    "skills": ["TypeScript", "Design"],
    "socials": "https://twitter.com/...",
    "github": "user",
    "displayName": "Display Name",
    "bio": "Short bio"
  }
  ```
- **Success (200):** Same shape as `GET /api/auth/profile`.
- **Validation:** Fields trimmed and sanitized; `skills` limited to 25 entries.
- **Errors:** `400` with field error map, `500` if Supabase upsert fails.

#### `PATCH /api/auth/profile/role`
- **Purpose:** Update a user's role (currently any authenticated user can call this).
- **Auth:** Requires a valid `session` cookie.
- **Body:**
  ```json
  {
    "email": "user@example.com",
    "role": "partner"
  }
  ```
- **Allowed roles:** `user`, `partner`, `admin`.
- **Success (200):**
  ```json
  {
    "ok": true,
    "user": {
      "email": "user@example.com",
      "role": "partner",
      "updatedAt": "2025-01-05T12:00:00.000Z"
    }
  }
  ```
- **Errors:** `401` if session missing/invalid, `404` if email not found, `400` for validation issues.
- **Note:** Because any authenticated user can update roles, lock this down (e.g. admin-only) before shipping to production.

### Bounties

#### `GET /api/bounties`
- **Purpose:** List available bounties.
- **Query Params (optional):**
  - `status`: `open | in_review | closed`
  - `category`: `dev | content | design | research`
  - `createdBy`: UUID of creator
  - `creatorUsername`: Username of creator
- **Success (200):**
  ```json
  {
    "ok": true,
    "bounties": [
      {
        "id": "uuid",
        "title": "Design landing page",
        "description": "...",
        "category": "design",
        "rewardAmount": 250,
        "rewardToken": "USDC",
        "deadline": "2025-02-01T00:00:00Z",
        "status": "open",
        "createdBy": "uuid",
        "creatorEmail": "user@example.com",
        "creatorUsername": "username",
        "createdAt": "2025-01-05T12:00:00Z",
        "updatedAt": "2025-01-05T12:00:00Z"
      }
    ]
  }
  ```

#### `POST /api/bounties`
- **Purpose:** Create a bounty.
- **Auth:** Requires `session` cookie (creator inferred from JWT).
- **Body:**
  ```json
  {
    "title": "Design landing page",
    "description": "Longer markdown or plain text",
    "category": "design",
    "rewardAmount": 250,
    "rewardToken": "USDC",
    "deadline": "2025-02-01T00:00:00Z",
    "status": "open",
    "creatorEmail": "user@example.com",
    "creatorUsername": "username"
  }
  ```
- **Success (201):** Returns created bounty object.
- **Errors:** `401` without session; `400` for invalid payload; `500` if Supabase insert fails.

#### `GET /api/bounties/:id`
- **Purpose:** Fetch a single bounty by ID.
- **Success (200):** Same shape as list item.
- **Errors:** `404` if not found.

#### `PATCH /api/bounties/:id`
- **Purpose:** Update selected fields on a bounty.
- **Auth:** `session` cookie; only creator may update.
- **Body:** Any subset of `title`, `description`, `category`, `rewardAmount`, `rewardToken`, `deadline`, `status`, `creatorEmail`, `creatorUsername`.
  ```json
  { "status": "in_review", "rewardAmount": 300, "creatorEmail": "new@example.com", "creatorUsername": "newusername" }
  ```
- **Success (200):** Updated bounty.
- **Errors:** `401` no session; `403` not creator; `404` missing; `400` when no fields provided.

#### `DELETE /api/bounties/:id`
- **Purpose:** Permanently remove a bounty.
- **Auth:** `session` cookie; only creator may delete.
- **Success (200):** `{ "ok": true }`
- **Errors:** `401`, `403`, `404`, or `500` for delete failures.

## Useful Commands

- `npm run dev` – start dev server (http://localhost:3000).  
- `npm run lint` – run ESLint against the project.  
- `npm run build` / `npm run start` – production build & start.

Deploy to Vercel by connecting the repository, setting the environment variables, and triggering a build. Supabase migrations can be managed via the SQL editor or the CLI.
