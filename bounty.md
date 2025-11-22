# Bounties API

APIs that manage bounty programs backed by the `bounties` table.

## Table Snapshot

| Column               | Type                  | Notes                                              |
| -------------------- | --------------------- | -------------------------------------------------- |
| `id`                 | uuid                  | Primary key                                        |
| `title`              | text                  | Required                                           |
| `description`        | text                  | Required                                           |
| `category`           | text                  | Enum (`dev`, `content`, `design`, `research`)      |
| `reward_amount`      | numeric               | Required                                           |
| `reward_token`       | text                  | Required                                           |
| `deadline`           | timestamptz           | Required                                           |
| `status`             | text                  | Enum (`open`, `in_review`, `in-progress`, `closed`)|
| `created_by`         | uuid                  | Creator user ID (required)                         |
| `creator_email`      | text                  | Optional                                           |
| `creator_username`   | text                  | Optional                                           |
| `organizer_id`       | uuid                  | Optional                                           |
| `slug`               | text                  | Optional unique slug per bounty                    |
| `xp_reward`          | integer               | Defaults to `0`                                    |
| `type`               | text                  | Optional (e.g. challenge, hackathon)               |
| `complexity`         | text                  | Optional (e.g. beginner, intermediate, advanced)   |
| `winners_count`      | integer               | Defaults to `1`                                    |
| `submission_template`| text                  | Optional instructions                              |
| `created_at`         | timestamptz           | Auto timestamp                                     |
| `updated_at`         | timestamptz           | Auto timestamp                                     |

## Endpoints

| Method | Path                        | Description                          |
| ------ | --------------------------- | ------------------------------------ |
| `GET`  | `/api/bounties`             | List bounties with filters           |
| `POST` | `/api/bounties`             | Create a bounty                      |
| `GET`  | `/api/bounties/:id`         | Fetch a single bounty                |
| `PATCH`| `/api/bounties/:id`         | Update partial fields                |
| `PUT`  | `/api/bounties/:id`         | Replace all mutable fields           |
| `DELETE` | `/api/bounties/:id`       | Delete bounty (creator only)         |

### GET `/api/bounties`

Query parameters (all optional):

| Param            | Description                                  |
| ---------------- | -------------------------------------------- |
| `status`         | Filter by status enum                        |
| `category`       | Filter by category enum                      |
| `createdBy`      | Creator user UUID                            |
| `creatorUsername`| Creator username                             |
| `organizerId`    | Organizer UUID                               |
| `slug`           | Exact slug match                             |
| `type`           | Bounty type                                  |
| `complexity`     | Complexity string                            |

Example:

```bash
curl "http://localhost:3000/api/bounties?status=open&category=dev&slug=ai-agents" \
  -H "Accept: application/json"
```

Success response:

```json
{
  "ok": true,
  "bounties": [
    {
      "id": "bounty-uuid",
      "title": "AI Agents Quest",
      "description": "Ship an agent on Sui.",
      "category": "dev",
      "rewardAmount": 500,
      "rewardToken": "USDC",
      "deadline": "2024-12-31T23:59:59Z",
      "status": "open",
      "createdBy": "creator-uuid",
      "creatorEmail": "founder@example.com",
      "creatorUsername": "founder",
      "organizerId": "organizer-uuid",
      "slug": "ai-agents",
      "xpReward": 250,
      "type": "challenge",
      "complexity": "intermediate",
      "winnersCount": 3,
      "submissionTemplate": "## Deliverables ...",
      "createdAt": "2024-05-01T08:00:00Z",
      "updatedAt": "2024-05-01T08:00:00Z"
    }
  ]
}
```

### POST `/api/bounties`

Body schema:

| Field             | Type     | Required | Notes                                         |
| ----------------- | -------- | -------- | --------------------------------------------- |
| `title`           | string   | Yes      | ≥ 3 chars                                     |
| `description`     | string   | Yes      | ≥ 10 chars                                    |
| `category`        | enum     | Yes      | `dev`, `content`, `design`, `research`        |
| `rewardAmount`    | number   | Yes      | > 0                                           |
| `rewardToken`     | string   | Yes      | Non-empty                                     |
| `deadline`        | ISO date | Yes      | Valid datetime                                |
| `status`          | enum     | No       | Defaults to `open`                            |
| `createdBy`       | UUID     | No       | Inferred from session if omitted              |
| `creatorEmail`    | email    | No       | Fallback to session / DB                      |
| `creatorUsername` | string   | No       | Optional                                      |
| `organizerId`     | UUID     | No       | Optional                                      |
| `slug`            | string   | No       | Trimmed optional                              |
| `xpReward`        | integer  | No       | ≥ 0                                           |
| `type`            | string   | No       | Optional                                      |
| `complexity`      | string   | No       | Optional                                      |
| `winnersCount`    | integer  | No       | ≥ 1                                           |
| `submissionTemplate` | string | No       | Optional                                      |

Example:

```bash
curl -X POST "http://localhost:3000/api/bounties" \
  -H "Content-Type: application/json" \
  -d '{
        "title": "AI Agents Quest",
        "description": "Build an agent.",
        "category": "dev",
        "rewardAmount": 500,
        "rewardToken": "USDC",
        "deadline": "2024-12-31T23:59:59Z",
        "status": "open",
        "creatorEmail": "founder@example.com",
        "creatorUsername": "founder",
        "organizerId": "0f66fcd3-7d4e-44ad-8a7d-9f599a6cb6f5",
        "slug": "ai-agents-quest",
        "xpReward": 250,
        "type": "challenge",
        "complexity": "intermediate",
        "winnersCount": 3,
        "submissionTemplate": "## Deliverables\n- Repo\n- Demo"
      }'
```

Returns `201` with the stored bounty object. Errors are returned as `{ ok: false, error: ... }` with `400` for validation or `500` when Supabase insert fails.

### GET `/api/bounties/:id`

```bash
curl "http://localhost:3000/api/bounties/<bountyId>" -H "Accept: application/json"
```

Returns `{ ok: true, bounty: {...} }` or `404` when the ID is not found.

### PATCH `/api/bounties/:id`

Allows partial updates. Same field names as POST but all optional; request must include at least one field. Requires session (creator) unless bypass env is enabled.

Example:

```bash
curl -X PATCH "http://localhost:3000/api/bounties/<id>" \
  -H "Content-Type: application/json" \
  -d '{ "status": "in_review", "winnersCount": 5 }'
```

### PUT `/api/bounties/:id`

Replace all mutable fields; same schema as POST (title, description, etc.). Requires session or bypass.

### DELETE `/api/bounties/:id`

Deletes a bounty. Only the creator (or bypass mode) is allowed.

```bash
curl -X DELETE "http://localhost:3000/api/bounties/<id>"
```

## Auth Notes

- `GET /api/bounties` and `GET /api/bounties/:id` are public.
- `POST`, `PATCH`, `PUT`, `DELETE` require a valid session cookie unless `ALLOW_UNAUTHENTICATED=true` and bypass credentials are configured. The API will attempt to infer `createdBy`/`creatorEmail` from the session when not provided.

## Local Testing Tips

1. Fill `.env` with Supabase credentials and `JWT_SECRET`.
2. Start the dev server via `npm run dev`.
3. Use the curl commands above alongside valid session cookies to exercise the endpoints.
