# Submissions API (User Submit)

Guides the user-facing submission flow: create/view/update submissions with link + notes. Organizer review/ranking is documented separately in `manage-submission.md`.

## Table Fields (relevant)

| Column             | Notes                                                |
| ------------------ | ---------------------------------------------------- |
| `bounty_id`        | FK → bounties.id (required)                          |
| `user_id`          | FK → users.id (required)                             |
| `submission_link`  | Required                                             |
| `notes`            | Optional                                             |
| `status`           | `submitted` \| `rejected` \| `selected` (default `submitted`) |
| `created_at`       | Timestamp                                            |

## Endpoints

| Method | Path                               | Purpose                             |
| ------ | ---------------------------------- | ----------------------------------- |
| `GET`  | `/api/submissions`                 | List submissions (filterable)       |
| `GET`  | `/api/submissions/username/:slug`  | List submissions for a username     |
| `POST` | `/api/submissions`                 | Create a submission                 |
| `GET`  | `/api/submissions/:id`             | Fetch a submission                  |

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

### GET `/api/submissions/username/:slug`

Use when the client only knows a contributor's public username and needs every submission they filed.

Path params:

| Param | Description                         |
| ----- | ----------------------------------- |
| `slug`| Username (case-insensitive string)  |

Query params (optional):

| Param    | Description                    |
| -------- | ------------------------------ |
| `status` | Narrow to `submitted` \| `rejected` \| `selected` |
| `limit`  | Max 200 (default 50)           |
| `offset` | Pagination offset (default 0)  |

Example:

```bash
curl "http://localhost:3000/api/submissions/username/satoshi?status=submitted" \
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
| `status`         | No       | Defaults to `submitted`                      |

Example:

```bash
curl -X POST "http://localhost:3000/api/submissions" \
  -H "Content-Type: application/json" \
  -d '{
        "bountyId": "<bounty-uuid>",
        "submissionLink": "https://github.com/org/repo",
        "notes": "Workflow and decisions in README"
      }'
```

Returns `{ ok: true, submission: {...} }` (`201`). Validation errors → `400`.

### GET `/api/submissions/:id`

```bash
curl "http://localhost:3000/api/submissions/<id>" -H "Accept: application/json"
```

### PATCH `/api/submissions/:id`

- Owner có thể sửa `submissionLink` và `notes` khi bounty chưa ở trạng thái `in_review`.
- `status` chỉ organizer (hoặc bypass) mới cập nhật; schema hiện tại chỉ lưu `submission_link`, `notes`, `status`.

Example (owner chỉnh link/notes):
```bash
curl -X PATCH "http://localhost:3000/api/submissions/<id>" \
  -H "Content-Type: application/json" \
  -d '{ "submissionLink": "https://github.com/org/repo-updated", "notes": "Added demo video" }'
```
