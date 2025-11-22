# Submissions API (User Submit)

Guides the user-facing submission flow: create/view submissions with link + notes + proof. Organizer review/ranking is documented separately in `manage-submission.md`.

## Table Fields (relevant)

| Column             | Notes                                                |
| ------------------ | ---------------------------------------------------- |
| `bounty_id`        | FK → bounties.id (required)                          |
| `user_id`          | FK → users.id (required)                             |
| `submission_link`  | Required                                             |
| `notes`            | Optional                                             |
| `proof_links`      | Optional text[] (screenshots/docs links)             |
| `status`           | `submitted` \| `rejected` \| `selected` (default `submitted`) |
| `rank`             | Integer, only organizer assigns during review        |
| `created_at`       | Timestamp                                            |

## Endpoints

| Method | Path                   | Purpose                          |
| ------ | ---------------------- | -------------------------------- |
| `GET`  | `/api/submissions`     | List submissions (filterable)    |
| `POST` | `/api/submissions`     | Create a submission              |
| `GET`  | `/api/submissions/:id` | Fetch a submission               |

> Editing/deleting and organizer controls are covered in `manage-submission.md`.

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

### POST `/api/submissions`

Body schema:

| Field            | Required | Notes                                        |
| ---------------- | -------- | -------------------------------------------- |
| `bountyId`       | Yes      | UUID                                         |
| `userId`         | No       | Inferred from session/bypass if omitted      |
| `username`       | No       | Trimmed; auto-fetched if missing             |
| `userEmail`      | No       | Trimmed; auto-fetched if missing             |
| `submissionLink` | Yes      | Link to work (Doc/GitHub/Tweet/Notion/…)     |
| `notes`          | No       | Optional description for organizers          |
| `proofOfWork`    | No       | Array of proof links (screenshots, etc.), max 10 |
| `status`         | No       | Defaults to `submitted`                      |
| `rank`           | No       | Leave empty; organizer sets during review    |

Example:

```bash
curl -X POST "http://localhost:3000/api/submissions" \
  -H "Content-Type: application/json" \
  -d '{
        "bountyId": "<bounty-uuid>",
        "submissionLink": "https://github.com/org/repo",
        "notes": "Workflow and decisions in README",
        "proofOfWork": ["https://i.imgur.com/screenshot.png"]
      }'
```

Returns `{ ok: true, submission: {...} }` (`201`). Validation errors → `400`.

### GET `/api/submissions/:id`

```bash
curl "http://localhost:3000/api/submissions/<id>" -H "Accept: application/json"
```

