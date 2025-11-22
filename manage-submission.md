# Manage Submissions (Organizer)

Guide for organizers reviewing and ranking submissions of a bounty.


- When bounty status is `in_review`, users cannot submit new work; only organizer (or bypass) may update/delete submissions.
- Organizer-only actions:
  - Change `status` (reject/select).
  - Assign/clear `rank`.
  - Edit proof links/notes while in review.
- Owners can edit/delete their submission only while bounty is **not** `in_review`. They cannot change `status` or `rank`.

## Endpoints (same base as submissions API)

| Method | Path                        | Purpose                                        |
| ------ | --------------------------- | ---------------------------------------------- |
| `PATCH`| `/api/submissions/:id`      | Update status/rank/proof/notes (organizer)     |
| `DELETE` | `/api/submissions/:id`    | Delete submission (organizer or owner)         |

### PATCH `/api/submissions/:id`

Allowed fields:

| Field            | Who                    | Notes                                      |
| ---------------- | ---------------------- | ------------------------------------------ |
| `status`         | Organizer/bypass       | Cannot revert to `submitted` while in_review |
| `rank`           | Organizer/bypass       | Integer ≥ 1 or null                        |
| `proofOfWork`    | Organizer/bypass       | Array of links (max 10)                    |
| `notes`          | Organizer or owner\*   | Owner only before in_review                |
| `submissionLink` | Owner (pre-review)     | Organizer cannot change link in review     |

Example (organizer select + rank):

```bash
curl -X PATCH "http://localhost:3000/api/submissions/<id>" \
  -H "Content-Type: application/json" \
  -H "Cookie: session=<organizer-session>" \
  -d '{ "status": "selected", "rank": 1, "proofOfWork": ["https://i.imgur.com/proof.png"] }'
```

### DELETE `/api/submissions/:id`

- Organizer can delete any time.
- Owner can delete only before bounty is `in_review`.

```bash
curl -X DELETE "http://localhost:3000/api/submissions/<id>" \
  -H "Cookie: session=<organizer-or-owner-session>"
```

## Additional Notes

- If you want stricter guarantees, enforce RLS or DB triggers to mirror these rules server-side.
- Status options are limited to `submitted`, `rejected`, `selected`. Clearing rank is done via `rank: null`.
