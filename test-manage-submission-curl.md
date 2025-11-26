# Test Manage Submissions APIs - cURL Commands

Replace placeholders:
- `<submission-id>`: UUID của submission
- `<organizer-session>`: Session cookie của organizer
- `<owner-session>`: Session cookie của owner
- `<owner-submission-id>`: UUID của submission thuộc owner

Base URL: `http://localhost:3000`

---

## 1. GET Single Submission

```bash
curl -X GET "http://localhost:3000/api/submissions/<submission-id>" \
  -H "Accept: application/json"
```

---

## 2. PATCH - Organizer: Select submission and set rank

```bash
curl -X PATCH "http://localhost:3000/api/submissions/<submission-id>" \
  -H "Content-Type: application/json" \
  -H "Cookie: <organizer-session>" \
  -d '{
    "status": "selected",
    "rank": 1,
    "proofOfWork": ["https://i.imgur.com/proof.png"]
  }'
```

---

## 3. PATCH - Organizer: Reject submission

```bash
curl -X PATCH "http://localhost:3000/api/submissions/<submission-id>" \
  -H "Content-Type: application/json" \
  -H "Cookie: <organizer-session>" \
  -d '{
    "status": "rejected"
  }'
```

---

## 4. PATCH - Organizer: Update rank only

```bash
curl -X PATCH "http://localhost:3000/api/submissions/<submission-id>" \
  -H "Content-Type: application/json" \
  -H "Cookie: <organizer-session>" \
  -d '{
    "rank": 2
  }'
```

---

## 5. PATCH - Organizer: Clear rank (set to null)

```bash
curl -X PATCH "http://localhost:3000/api/submissions/<submission-id>" \
  -H "Content-Type: application/json" \
  -H "Cookie: <organizer-session>" \
  -d '{
    "rank": null
  }'
```

---

## 6. PATCH - Organizer: Update proofOfWork

```bash
curl -X PATCH "http://localhost:3000/api/submissions/<submission-id>" \
  -H "Content-Type: application/json" \
  -H "Cookie: <organizer-session>" \
  -d '{
    "proofOfWork": [
      "https://i.imgur.com/proof1.png",
      "https://i.imgur.com/proof2.png"
    ]
  }'
```

---

## 7. PATCH - Organizer: Update notes during review

```bash
curl -X PATCH "http://localhost:3000/api/submissions/<submission-id>" \
  -H "Content-Type: application/json" \
  -H "Cookie: <organizer-session>" \
  -d '{
    "notes": "Updated notes by organizer during review"
  }'
```

---

## 8. PATCH - Owner: Update notes (before in_review)

```bash
curl -X PATCH "http://localhost:3000/api/submissions/<submission-id>" \
  -H "Content-Type: application/json" \
  -H "Cookie: <owner-session>" \
  -d '{
    "notes": "Updated notes by owner"
  }'
```

---

## 9. PATCH - Owner: Update submissionLink (before in_review)

```bash
curl -X PATCH "http://localhost:3000/api/submissions/<submission-id>" \
  -H "Content-Type: application/json" \
  -H "Cookie: <owner-session>" \
  -d '{
    "submissionLink": "https://github.com/org/repo-updated"
  }'
```

---

## 10. PATCH - Owner: Try to update status (should fail with 403)

```bash
curl -X PATCH "http://localhost:3000/api/submissions/<submission-id>" \
  -H "Content-Type: application/json" \
  -H "Cookie: <owner-session>" \
  -d '{
    "status": "selected"
  }'
```

Expected: `403 Forbidden` - "Only organizer cập nhật status"

---

## 11. DELETE - Organizer: Delete submission

```bash
curl -X DELETE "http://localhost:3000/api/submissions/<submission-id>" \
  -H "Cookie: <organizer-session>"
```

---

## 12. DELETE - Owner: Delete own submission (before in_review)

```bash
curl -X DELETE "http://localhost:3000/api/submissions/<owner-submission-id>" \
  -H "Cookie: <owner-session>"
```

---

## 13. PATCH - Multiple fields update (organizer)

```bash
curl -X PATCH "http://localhost:3000/api/submissions/<submission-id>" \
  -H "Content-Type: application/json" \
  -H "Cookie: <organizer-session>" \
  -d '{
    "status": "selected",
    "rank": 1,
    "notes": "Winner submission",
    "proofOfWork": ["https://i.imgur.com/winner.png"]
  }'
```

---

## 14. PATCH - Error: Try to revert status to submitted during in_review

```bash
curl -X PATCH "http://localhost:3000/api/submissions/<submission-id>" \
  -H "Content-Type: application/json" \
  -H "Cookie: <organizer-session>" \
  -d '{
    "status": "submitted"
  }'
```

Expected: `400 Bad Request` - "Under review, không revert về submitted"

---

## 15. PATCH - Error: Owner try to update submissionLink during in_review

```bash
curl -X PATCH "http://localhost:3000/api/submissions/<submission-id>" \
  -H "Content-Type: application/json" \
  -H "Cookie: <owner-session>" \
  -d '{
    "submissionLink": "https://github.com/org/repo-new"
  }'
```

Expected: `403 Forbidden` - "Bounty under review, không sửa submissionLink"

---

## Notes

- Tất cả requests đều support CORS (OPTIONS được handle tự động)
- Response format: `{ ok: true, submission: {...} }` hoặc `{ ok: false, error: "..." }`
- Status codes: `200` (success), `400` (validation), `401` (unauthorized), `403` (forbidden), `404` (not found), `500` (server error)

