# Submissions API

Manage bounty submissions backed by the `submissions` table.

## Table Snapshot

| Column           | Type      | Notes                                            |
| ---------------- | --------- | ------------------------------------------------ |
| `id`             | uuid      | Primary key                                      |
| `bounty_id`      | uuid      | FK → bounties.id (required)                      |
| `user_id`        | uuid      | FK → users.id (required)                         |
| `username`       | text      | Optional cached username                         |
| `user_email`     | text      | Optional cached email                            |
| `submission_link`| text      | Required                                         |
| `notes`          | text      | Optional                                         |
| `status`         | text      | `submitted`, `rejected`, `selected` (default `submitted`) |
| `rank`           | integer   | Optional; 1 = first prize, etc.; NULL = none     |
| `created_at`     | timestamptz | Auto timestamp                                |

## Endpoints

| Method | Path                        | Description                                |
| ------ | --------------------------- | ------------------------------------------ |
| `GET`  | `/api/submissions`          | List submissions with filters              |
| `POST` | `/api/submissions`          | Create a submission                        |
| `GET`  | `/api/submissions/:id`      | Fetch one submission                       |
| `PATCH`| `/api/submissions/:id`      | Update submission fields                   |
| `DELETE` | `/api/submissions/:id`    | Delete a submission                        |

### GET `/api/submissions`

Query params (optional):

| Param     | Description                    |
| --------- | ------------------------------ |
| `bountyId`| Filter by bounty UUID          |
| `userId`  | Filter by user UUID            |
| `status`  | `submitted` \| `rejected` \| `selected` |
| `limit`   | Max 200 (default 50)           |
| `offset`  | Pagination offset (default 0)  |

Example:

```bash
curl "http://localhost:3000/api/submissions?bountyId=<bounty-uuid>&status=submitted" \
  -H "Accept: application/json"
```

Response:

```json
{ "ok": true, "submissions": [ { "id": "...", "bountyId": "...", "userId": "...", "submissionLink": "...", "status": "submitted", "rank": null, "createdAt": "..." } ] }
```

### POST `/api/submissions`

Body schema:

| Field            | Type    | Required | Notes                                      |
| ---------------- | ------- | -------- | ------------------------------------------ |
| `bountyId`       | UUID    | Yes      |                                            |
| `userId`         | UUID    | No       | Inferred from session/bypass if omitted    |
| `username`       | string  | No       | Trimmed; auto-fetched if missing           |
| `userEmail`      | string  | No       | Trimmed; auto-fetched if missing           |
| `submissionLink` | string  | Yes      | ≥ 3 chars                                  |
| `notes`          | string  | No       | Optional                                   |
| `status`         | enum    | No       | Defaults to `submitted`                    |
| `rank`           | int     | No       | ≥ 1; omit/null when no prize               |

Example:

```bash
curl -X POST "http://localhost:3000/api/submissions" \
  -H "Content-Type: application/json" \
  -d '{
        "bountyId": "<bounty-uuid>",
        "userId": "<user-uuid>",
        "username": "builder01",
        "userEmail": "user@example.com",
        "submissionLink": "https://github.com/org/repo",
        "notes": "Demo video in README",
        "status": "submitted",
        "rank": 1
      }'
```

Returns `{ ok: true, submission: {...} }` with `201` on success. Validation errors return `400`.

### GET `/api/submissions/:id`

Fetch one submission:

```bash
curl "http://localhost:3000/api/submissions/<id>" -H "Accept: application/json"
```

### PATCH `/api/submissions/:id`

Partial update (must include at least one field): `submissionLink`, `notes`, `status`, `rank` (int ≥ 1 or null).

Example:

```bash
curl -X PATCH "http://localhost:3000/api/submissions/<id>" \
  -H "Content-Type: application/json" \
  -d '{ "status": "selected", "rank": 1, "notes": "Great work" }'
```

### DELETE `/api/submissions/:id`

Delete a submission:

```bash
curl -X DELETE "http://localhost:3000/api/submissions/<id>"
```

## Auth Notes

- Creation requires a session (or bypass env) or an explicit `userId`.
- PATCH/DELETE allowed for the owning user or when bypass mode is enabled.
- GET endpoints are open unless you add RLS.

## Local Testing

1. Ensure `.env` has Supabase keys and JWT settings.
2. Run `npm run dev` in `back_test/fm_backend_test`.
3. Use the curl snippets above; attach `Cookie: session=<token>` if your environment requires auth.
