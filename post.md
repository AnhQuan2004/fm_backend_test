# Posts API

Server-side CRUD endpoints for Supabase table `posts`. Routes live under `src/app/api/posts` in the Next.js backend and can be invoked without authentication (front-end password flow handles gating).

## Table Schema

```sql
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NULL,
  content_md text NOT NULL,
  thumnail_image text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

- `slug` is optional; when `NULL` the post is only addressable by `id`.
- `thumnail_image` stores any absolute/relative URL and is nullable.
- `status` controls visibility (`published` vs `draft`).
- `published_at` is automatically set/cleared when status changes.

## Base URL

```
https://fm-backend-test.vercel.app/api/posts
```

Swap with `http://localhost:3000` when running locally.

## Endpoints & cURL Samples

### List Posts — `GET /api/posts`

Query params:

| Param | Type | Description |
| --- | --- | --- |
| `status` | `draft` or `published` | Defaults to `published`. |
| `search` | string | Case-insensitive match on `title` or `slug`. |
| `limit` | number | Default 20, max 100. |
| `offset` | number | Pagination offset, default 0. |

```bash
curl -X GET 'http://localhost:3000/api/posts?search=bootcamp&limit=5'
```

Response:

```json
{
  "ok": true,
  "posts": [
    {
      "id": "8f485368-7f51-48f0-a128-efacda7db8ce",
      "title": "Seal Workshop Recap",
      "slug": "seal-workshop-recap",
      "contentMd": "# Highlights",
      "thumnailImage": "https://cdn.fm/thumbs/seal.png",
      "status": "published",
      "publishedAt": "2025-02-15T00:00:00Z",
      "createdAt": "2025-02-10T02:04:41.586Z",
      "updatedAt": "2025-02-10T02:04:41.586Z"
    }
  ]
}
```

### Create Post — `POST /api/posts`

```bash
curl -X POST http://localhost:3000/api/posts \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Seal Workshop Recap",
    "slug": "seal-workshop-recap",
    "contentMd": "# Seal Workshop Highlights",
    "thumnailImage": "https://cdn.fm/thumbs/seal.png",
    "status": "published",
    "publishedAt": "2025-02-15T00:00:00Z"
  }'
```

Notes:

- Omit `slug` or set to `null` to create slugless posts (accessed via `id`).
- `thumnailImage` accepts `null` or any non-empty string; pass `null` to remove it.
- `status` defaults to `draft`. When set to `published` without `publishedAt`, the API uses current time.

### Get Post — `GET /api/posts/{identifier}`

Identifier can be UUID `id` or `slug`.

```bash
curl -X GET http://localhost:3000/api/posts/seal-workshop-recap
```

### Patch Post — `PATCH /api/posts/{identifier}`

Send only fields you want to change.

```bash
curl -X PATCH http://localhost:3000/api/posts/seal-workshop-recap \
  -H 'Content-Type: application/json' \
  -d '{"title":"Seal Workshop Recap v2","status":"draft","slug":null,"thumnailImage":null}'
```

- Switching to `draft` clears `publishedAt`.
- Setting `publishedAt` to an ISO timestamp (or `null`) overrides the automatic behavior.

### Replace Post — `PUT /api/posts/{identifier}`

Full update (any missing optional field keeps its previous value).

```bash
curl -X PUT http://localhost:3000/api/posts/seal-workshop-recap \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Seal Workshop Recap Final",
    "slug": "seal-workshop-recap",
    "contentMd": "## Updated content",
    "thumnailImage": "https://cdn.fm/thumbs/seal-v2.png",
    "status": "published",
    "publishedAt": null
  }'
```

### Delete Post — `DELETE /api/posts/{identifier}`

```bash
curl -X DELETE http://localhost:3000/api/posts/seal-workshop-recap
```

## Errors

- `400`: Validation failure (payload details returned).
- `404`: Post not found.
- `409`: Duplicate slug (`23505`).
- `500`: Supabase/unknown error.

## Development Tips

- All endpoints are public; secure them via your FE admin password or add middleware if needed.
- When testing slugless posts, use the returned `id` in GET/PATCH/PUT/DELETE.
- Run `npm run lint` after editing route files to keep code quality consistent.
