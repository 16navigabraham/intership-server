# Passkey Management API

This document outlines all passkey-related endpoints for intern authentication and management.

---

## `POST /passkey/register/options` — Start passkey registration

**Public.** Initiates the WebAuthn registration process for a new intern passkey.

### Headers
| Header | Value |
|---|---|
| `Content-Type` | `application/json` |

### Body
| Field | Type | Required | Notes |
|---|---|---|---|
| `Matriculation_Number` | string | yes | Intern's unique matric number |
| `allowReplace` | boolean | no | If `true`, allows replacing existing passkey. Defaults to `false` |

### Responses

**200** — Success
```json
{
  "challenge": "<base64-encoded-challenge>",
  "rp": {
    "name": "Web3Nova Internship",
    "id": "web3nova.org"
  },
  "user": {
    "id": "<user-id-buffer>",
    "name": "IFT/18/1234",
    "displayName": "Jane Doe"
  },
  "pubKeyCredParams": [...],
  "timeout": 60000,
  "attestation": "none",
  "authenticatorSelection": {
    "residentKey": "preferred",
    "userVerification": "required"
  }
}
```

**400** — Missing or invalid matric
```json
{ "error": "Matriculation_Number required" }
```

**404** — Intern not found
```json
{ "error": "intern not found" }
```

**409** — Passkey already exists (and `allowReplace` is not true)
```json
{ "error": "passkey already registered for this intern" }
```

### Example — browser `fetch`
```js
const res = await fetch('https://<api-url>/passkey/register/options', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    Matriculation_Number: 'IFT/18/1234'
  })
});
const options = await res.json();
// Pass options to WebAuthn API for credential registration
```

---

## `POST /passkey/register/verify` — Complete passkey registration

**Public.** Verifies the WebAuthn credential and stores it.

### Headers
| Header | Value |
|---|---|
| `Content-Type` | `application/json` |

### Body
| Field | Type | Required | Notes |
|---|---|---|---|
| `Matriculation_Number` | string | yes | Intern's matric number (must match the one used in `/register/options`) |
| `response` | object | yes | WebAuthn attestation response from the authenticator |

### Responses

**200** — Success
```json
{
  "verified": true
}
```

**400** — Verification failed or challenge expired
```json
{ "error": "passkey verification failed" }
```
or
```json
{ "error": "challenge expired — try again" }
```

**404** — Intern not found
```json
{ "error": "intern not found" }
```

**409** — Credential already registered elsewhere
```json
{ "error": "this credential is already registered" }
```

### Example — browser `fetch`
```js
// After user completes WebAuthn registration ceremony
const attestationResponse = await navigator.credentials.create(options);

const res = await fetch('https://<api-url>/passkey/register/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    Matriculation_Number: 'IFT/18/1234',
    response: attestationResponse
  })
});
const result = await res.json();
console.log('Passkey registered:', result.verified);
```

---

## `POST /passkey/auth/options` — Start passkey authentication

**Public.** Initiates WebAuthn authentication for check-in/check-out.

### Headers
| Header | Value |
|---|---|
| `Content-Type` | `application/json` |

### Body
| Field | Type | Required | Notes |
|---|---|---|---|
| `Matriculation_Number` | string | yes | Intern's matric number |

### Responses

**200** — Success
```json
{
  "challenge": "<base64-encoded-challenge>",
  "timeout": 60000,
  "rpId": "web3nova.org",
  "userVerification": "required",
  "allowCredentials": [
    {
      "type": "public-key",
      "id": "<credential-id>",
      "transports": ["internal"]
    }
  ]
}
```

**404** — Intern not found or no passkey registered
```json
{ "error": "intern not found" }
```
or
```json
{ "error": "no passkey registered for this intern" }
```

---

## `POST /passkey/auth/verify` — Complete passkey authentication

**Public.** Verifies the WebAuthn assertion and returns a short-lived check-in token.

### Headers
| Header | Value |
|---|---|
| `Content-Type` | `application/json` |

### Body
| Field | Type | Required | Notes |
|---|---|---|---|
| `Matriculation_Number` | string | yes | Intern's matric number |
| `response` | object | yes | WebAuthn assertion response from the authenticator |

### Responses

**200** — Success
```json
{
  "verified": true,
  "token": "<jwt-token>",
  "expiresIn": 60
}
```

**400** — Verification failed or challenge expired
```json
{ "error": "passkey auth failed" }
```
or
```json
{ "error": "challenge expired — try again" }
```

**404** — Intern or credential not found
```json
{ "error": "intern not found" }
```
or
```json
{ "error": "credential not recognized" }
```

### Token Details
- **Type:** JWT
- **TTL:** 60 seconds
- **Claims:** `{ kind: 'checkin', internId, matric }`
- **Use:** For attendance check-in/check-out within the hub network

---

## `POST /passkey/update` — Update/replace passkey (matric-based)

**Public.** Allows an intern to quickly update their passkey using only their matric number.

**This endpoint:**
1. Takes the matric number only (no extra verification)
2. Deletes any existing passkey
3. Returns fresh registration options
4. Intern then completes registration with `/passkey/register/verify`

### Headers
| Header | Value |
|---|---|
| `Content-Type` | `application/json` |

### Body
| Field | Type | Required | Notes |
|---|---|---|---|
| `Matriculation_Number` | string | yes | Intern's matric number |

### Responses

**200** — Success
```json
{
  "options": { ... },
  "Matriculation_Number": "IFT/18/1234",
  "message": "old passkey cleared, register new one"
}
```

**404** — Intern not found
```json
{ "error": "intern not found" }
```

**400** — Missing matric
```json
{ "error": "Matriculation_Number required" }
```

### Example — Complete Update Flow
```js
// Step 1: Request passkey update (clears old one, gets options)
const updateRes = await fetch('https://<api-url>/passkey/update', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    Matriculation_Number: 'IFT/18/1234'
  })
});
const { options, Matriculation_Number } = await updateRes.json();

// Step 2: User registers new credential via WebAuthn
const newCredential = await navigator.credentials.create(options);

// Step 3: Verify new credential
const verifyRes = await fetch('https://<api-url>/passkey/register/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    Matriculation_Number,
    response: newCredential
  })
});
const result = await verifyRes.json();
console.log('New passkey registered:', result.verified);
```

---

## `DELETE /passkey/:internId` — Delete intern passkey (admin only)

**Protected.** Admin endpoint to remove an intern's passkey (usually to force re-registration or recovery).

### Headers
| Header | Value |
|---|---|
| `x-api-key` | `<API_KEY>` |

### URL Parameters
| Param | Type | Required | Notes |
|---|---|---|---|
| `internId` | number | yes | Intern's database ID |

### Responses

**200** — Success
```json
{
  "cleared": 1
}
```

**400** — Invalid intern ID
```json
{ "error": "invalid intern id" }
```

### Example — cURL
```bash
curl -X DELETE https://<api-url>/passkey/123 \
  -H "x-api-key: your-api-key"
```

---

## `POST /passkey/recovery/start` — Email-based recovery

**Public.** Initiates passkey recovery via email. Used when admin has already deleted the intern's passkey.

### Headers
| Header | Value |
|---|---|
| `Content-Type` | `application/json` |

### Body
| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | yes | Intern's email address |

### Responses

**200** — Success
```json
{
  "options": { ... },
  "Matriculation_Number": "IFT/18/1234"
}
```

**400** — Email not found or intern still has passkey
```json
{ "error": "cannot proceed with this email" }
```

---

## Workflow Examples

### Scenario 1: Intern Registers First Passkey
```
1. POST /passkey/register/options
   { "Matriculation_Number": "IFT/18/1234" }
   ↓ (returns options)
2. WebAuthn ceremony on client
3. POST /passkey/register/verify
   { "Matriculation_Number": "IFT/18/1234", "response": {...} }
   ✅ Passkey created
```

### Scenario 2: Intern Updates Passkey (New Endpoint)
```
1. POST /passkey/update
   { "Matriculation_Number": "IFT/18/1234" }
   ↓ (old passkey deleted, returns new options)
2. WebAuthn ceremony on client
3. POST /passkey/register/verify
   { "Matriculation_Number": "IFT/18/1234", "response": {...} }
   ✅ New passkey created
```

### Scenario 3: Admin Deletes & Intern Re-registers
```
1. Admin: DELETE /passkey/123
   ✅ Passkey deleted
2. Intern: POST /passkey/register/options
   { "Matriculation_Number": "IFT/18/1234", "allowReplace": true }
   ↓ (returns options)
3. WebAuthn ceremony on client
4. POST /passkey/register/verify
   { "Matriculation_Number": "IFT/18/1234", "response": {...} }
   ✅ New passkey created
```

### Scenario 4: Admin Deletes & Intern Uses Email Recovery
```
1. Admin: DELETE /passkey/123
   ✅ Passkey deleted
2. Intern: POST /passkey/recovery/start
   { "email": "jane@example.com" }
   ↓ (returns options + matric)
3. WebAuthn ceremony on client
4. POST /passkey/register/verify
   { "Matriculation_Number": "IFT/18/1234", "response": {...} }
   ✅ New passkey created
```

---

## Error Handling

| Status | Error | Cause | Action |
|---|---|---|---|
| 400 | Missing field | Request lacks required field | Add missing field and retry |
| 400 | Challenge expired | Too long between `/options` and `/verify` | Call `/options` again |
| 404 | Intern not found | Matric/email doesn't exist | Verify matric/email spelling |
| 404 | No passkey registered | Trying to auth without registered passkey | Call `/register/options` first |
| 409 | Passkey already registered | Trying to register without `allowReplace` | Use `allowReplace: true` or call `/update` |
| 409 | Credential already registered | Authenticator used elsewhere | Use different authenticator or recover |
| 500 | Server error | DB/config issue | Contact admin |

---

## Security Notes

- **Challenges** are short-lived (2 minutes)
- **Check-in tokens** expire after 60 seconds
- **No email enumeration** — recovery endpoint returns generic error
- **Credential counter** updated on each auth to prevent cloning
- **User verification** always required
- **Matric-based update** relies on matric uniqueness — no additional verification needed
