# Web3Nova Interns API

Base URL: `https://<your-render-url>` (dev: `http://localhost:3010`)

---

## `POST /form` — Submit intern registration

**Protected.** Used only by the internal registration form page.

### Headers
| Header | Value |
|---|---|
| `x-api-key` | `<API_KEY>` (provided separately, not in source) |

Do **not** set `Content-Type` manually — the browser/fetch sets it with the correct boundary when you pass a `FormData` object.

### Body — `multipart/form-data`

| Field | Type | Required | Notes |
|---|---|---|---|
| `Matriculation_Number` | text | yes | unique |
| `full_name` | text | yes | |
| `email` | text | yes | unique |
| `Department` | text | no | |
| `bio` | text | no | |
| `skills` | text | no | comma-separated string |
| `expectations` | text | no | |
| `ADDRESS` | text | no | |
| `phone_number` | text | no | |
| `Parent_contact` | text | no | |
| `photo` | file | no | image — stored on Cloudinary |

### Responses

**200**
```json
{ "message": "form submitted" }
```

> **Important:** submitting the form only **records the application**. The intern is saved with `is_active = 0` (pending admission). They do **not** appear on `GET /interns` until an admin admits them (see `PATCH /intern/:id/admit` below).
>
> The applicant-facing UI should reflect this — e.g. show "Application received. You'll be notified if admitted." rather than "You're now listed."

**401** — missing or wrong `x-api-key`
```json
{ "error": "invalid api key" }
```

**429** — rate limit exceeded (max 10 submissions per IP per minute)
```json
{ "error": "too many submissions, slow down" }
```

**500** — server/DB error (e.g. duplicate matric number or email)
```json
{ "error": "<message>" }
```

### Example — browser `fetch`

```js
const form = new FormData();
form.append('Matriculation_Number', 'IFT/18/1234');
form.append('full_name', 'Jane Doe');
form.append('email', 'jane@example.com');
form.append('Department', 'Information Technology');
form.append('bio', 'Frontend dev');
form.append('skills', 'react,typescript');
form.append('expectations', 'Ship real product.');
form.append('ADDRESS', 'Akure');
form.append('phone_number', '08012345678');
form.append('Parent_contact', '08098765432');
form.append('photo', fileInput.files[0]); // <input type="file" />

const res = await fetch('https://<api-url>/form', {
  method: 'POST',
  headers: { 'x-api-key': process.env.NEXT_PUBLIC_API_KEY },
  body: form,
});
const data = await res.json();
```

---

## `GET /applicants` — Admin applicant list

**Protected.** Admin-only. Returns applicants (pending + admitted) for a given cohort year. Includes email and `is_active` flag (unlike the public endpoint).

### Headers
| Header | Value |
|---|---|
| `x-api-key` | `<API_KEY>` |

### Query params
| Param | Notes |
|---|---|
| `year` | optional — e.g. `?year=2026`. Defaults to **current year** if omitted. |

### Response — `200`
```json
[
  {
    "id": 3,
    "Matriculation_Number": "IFT/18/1234",
    "full_name": "Jane Doe",
    "email": "jane@example.com",
    "Department": "Information Technology",
    "is_active": 0,
    "cohort_year": 2026,
    "created_at": "2026-04-21 10:22:18"
  }
]
```

`is_active` — `0` = pending, `1` = admitted.

---

## `PATCH /admit` — Admit or reject an applicant

**Protected.** Admin-only endpoint to flip an applicant's `is_active` flag using their matric number. Admitted interns (`is_active = 1`) appear on the public `GET /interns`; everyone else is hidden.

### Headers
| Header | Value |
|---|---|
| `x-api-key` | `<API_KEY>` |
| `Content-Type` | `application/json` |

### Body — JSON
```json
{ "Matriculation_Number": "IFT/18/1234", "admit": true }
```

| Field | Type | Notes |
|---|---|---|
| `Matriculation_Number` | string | required — identifies the applicant |
| `admit` | boolean | `true` → admit (shows on public page); `false` → reject/hide |

### Responses

**200**
```json
{ "Matriculation_Number": "IFT/18/1234", "is_active": 1 }
```

**400** — missing matric number in body
```json
{ "error": "Matriculation_Number required" }
```

**401** — missing or wrong `x-api-key`

**404** — no applicant with that matric number
```json
{ "error": "intern not found" }
```

### Example — admit flow

```js
// 1. Review the queue
const applicants = await fetch('https://<api-url>/applicants', {
  headers: { 'x-api-key': ADMIN_API_KEY },
}).then(r => r.json());

// 2. Admit one of them
await fetch('https://<api-url>/admit', {
  method: 'PATCH',
  headers: {
    'x-api-key': ADMIN_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    Matriculation_Number: 'IFT/18/1234',
    admit: true,
  }),
});
```

---

## `GET /interns` — Public intern listing

**Public.** Used by the landing page to display **admitted** interns only (`is_active = 1`) for a given cohort year. No auth header needed.

### Query params
| Param | Notes |
|---|---|
| `year` | optional — e.g. `?year=2025` to view a past cohort. Defaults to **current year** if omitted. |

### Response — `200`

Array of admitted interns for that cohort, newest first. Returns only public-safe fields.

```json
[
  {
    "id": 1,
    "full_name": "Adebanjo Abraham.I",
    "Department": "Information Technology",
    "bio": "Web3 Infrastructure Engineer",
    "photo_url": "https://res.cloudinary.com/.../interns/xyz.jpg",
    "expectations": "Get a full time job role...",
    "cohort_year": 2026
  }
]
```

Fields deliberately excluded for privacy: `email`, `phone_number`, `Matriculation_Number`, `ADDRESS`, `Parent_contact`.

### Example

```js
const res = await fetch('https://<api-url>/interns');
const interns = await res.json();
// interns.map(i => <Card photo={i.photo_url} name={i.full_name} ... />)
```

---

## CORS

Server allows requests from `https://web3nova.com` only. For local dev against a different origin, ping the backend dev to add it.
