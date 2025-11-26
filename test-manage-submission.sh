#!/bin/bash

# Test Manage Submissions APIs
# Replace <submission-id>, <bounty-id>, <session-cookie> with actual values

BASE_URL="http://localhost:3000"
SUBMISSION_ID="<submission-id>"
ORGANIZER_SESSION="<organizer-session-cookie>"
OWNER_SESSION="<owner-session-cookie>"

echo "=== 1. GET Single Submission ==="
curl -X GET "${BASE_URL}/api/submissions/${SUBMISSION_ID}" \
  -H "Accept: application/json" \
  -v

echo -e "\n\n=== 2. PATCH - Organizer: Select submission and set rank ==="
curl -X PATCH "${BASE_URL}/api/submissions/${SUBMISSION_ID}" \
  -H "Content-Type: application/json" \
  -H "Cookie: ${ORGANIZER_SESSION}" \
  -d '{
    "status": "selected",
    "rank": 1,
    "proofOfWork": ["https://i.imgur.com/proof.png"]
  }' \
  -v

echo -e "\n\n=== 3. PATCH - Organizer: Reject submission ==="
curl -X PATCH "${BASE_URL}/api/submissions/${SUBMISSION_ID}" \
  -H "Content-Type: application/json" \
  -H "Cookie: ${ORGANIZER_SESSION}" \
  -d '{
    "status": "rejected"
  }' \
  -v

echo -e "\n\n=== 4. PATCH - Organizer: Update rank only ==="
curl -X PATCH "${BASE_URL}/api/submissions/${SUBMISSION_ID}" \
  -H "Content-Type: application/json" \
  -H "Cookie: ${ORGANIZER_SESSION}" \
  -d '{
    "rank": 2
  }' \
  -v

echo -e "\n\n=== 5. PATCH - Organizer: Clear rank (set to null) ==="
curl -X PATCH "${BASE_URL}/api/submissions/${SUBMISSION_ID}" \
  -H "Content-Type: application/json" \
  -H "Cookie: ${ORGANIZER_SESSION}" \
  -d '{
    "rank": null
  }' \
  -v

echo -e "\n\n=== 6. PATCH - Organizer: Update proofOfWork ==="
curl -X PATCH "${BASE_URL}/api/submissions/${SUBMISSION_ID}" \
  -H "Content-Type: application/json" \
  -H "Cookie: ${ORGANIZER_SESSION}" \
  -d '{
    "proofOfWork": [
      "https://i.imgur.com/proof1.png",
      "https://i.imgur.com/proof2.png"
    ]
  }' \
  -v

echo -e "\n\n=== 7. PATCH - Organizer: Update notes during review ==="
curl -X PATCH "${BASE_URL}/api/submissions/${SUBMISSION_ID}" \
  -H "Content-Type: application/json" \
  -H "Cookie: ${ORGANIZER_SESSION}" \
  -d '{
    "notes": "Updated notes by organizer during review"
  }' \
  -v

echo -e "\n\n=== 8. PATCH - Owner: Update notes (before in_review) ==="
curl -X PATCH "${BASE_URL}/api/submissions/${SUBMISSION_ID}" \
  -H "Content-Type: application/json" \
  -H "Cookie: ${OWNER_SESSION}" \
  -d '{
    "notes": "Updated notes by owner"
  }' \
  -v

echo -e "\n\n=== 9. PATCH - Owner: Update submissionLink (before in_review) ==="
curl -X PATCH "${BASE_URL}/api/submissions/${SUBMISSION_ID}" \
  -H "Content-Type: application/json" \
  -H "Cookie: ${OWNER_SESSION}" \
  -d '{
    "submissionLink": "https://github.com/org/repo-updated"
  }' \
  -v

echo -e "\n\n=== 10. PATCH - Owner: Try to update status (should fail) ==="
curl -X PATCH "${BASE_URL}/api/submissions/${SUBMISSION_ID}" \
  -H "Content-Type: application/json" \
  -H "Cookie: ${OWNER_SESSION}" \
  -d '{
    "status": "selected"
  }' \
  -v

echo -e "\n\n=== 11. DELETE - Organizer: Delete submission ==="
curl -X DELETE "${BASE_URL}/api/submissions/${SUBMISSION_ID}" \
  -H "Cookie: ${ORGANIZER_SESSION}" \
  -v

echo -e "\n\n=== 12. DELETE - Owner: Delete own submission (before in_review) ==="
# Note: Use a different submission ID that belongs to owner and bounty is not in_review
curl -X DELETE "${BASE_URL}/api/submissions/<owner-submission-id>" \
  -H "Cookie: ${OWNER_SESSION}" \
  -v

echo -e "\n\n=== 13. PATCH - Multiple fields update ==="
curl -X PATCH "${BASE_URL}/api/submissions/${SUBMISSION_ID}" \
  -H "Content-Type: application/json" \
  -H "Cookie: ${ORGANIZER_SESSION}" \
  -d '{
    "status": "selected",
    "rank": 1,
    "notes": "Winner submission",
    "proofOfWork": ["https://i.imgur.com/winner.png"]
  }' \
  -v

echo -e "\n\n=== Test completed ==="

