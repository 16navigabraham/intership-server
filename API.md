# Web3Nova Interns API

Base URL: `https://<your-render-url>` (dev: `http://localhost:3010`)

---

## `POST /form` — Submit intern registration

**Public.** Used by applicants directly on the registration page. No auth header needed.

Protections in place: rate limit (10/min/IP), CORS (web3nova.com only), UNIQUE constraints on matric + email, Multer file limits (5MB, images only).

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

# Attendance

Attendance runs **Mon–Thu**. Interns must be **physically at the hub** (requests only accepted from the hub's Starlink IP — enforced server-side).

Applies to all `/attendance/*` endpoints except where noted: requests from outside the hub network return `403 { "error": "check-in only allowed from hub network" }`.

---

## `GET /attendance/status` — Check-in page status

**Hub-IP only.** Used by the `/checkin` page on load. Tells the UI what button to show.

### Query params
| Param | Notes |
|---|---|
| `matric` | required — intern's matric number |

### Response — `200`
```json
{
  "found": true,
  "admitted": true,
  "state": "not_checked_in",
  "time_in": null,
  "time_out": null,
  "is_workday": true
}
```

| Field | Notes |
|---|---|
| `found` | does a row with this matric exist? |
| `admitted` | `is_active === 1`? |
| `state` | one of `not_checked_in`, `checked_in`, `checked_out`, `not_admitted`, `unknown` |
| `time_in` / `time_out` | ISO strings if set today |
| `is_workday` | `false` on Fri/Sat/Sun — frontend should hide buttons |

### UI state machine

| state | what to render |
|---|---|
| `unknown` (not found) | "Matric not found" |
| `not_admitted` | "Not admitted to cohort" |
| `not_checked_in` + workday | Show **Check In** button |
| `checked_in` | Show `time_in` + **Check Out** button |
| `checked_out` | "Checked out at {time_out}. See you tomorrow." |
| `is_workday: false` | "Attendance only runs Mon–Thu" |

---

## `POST /attendance/check-in` — Clock in

**Hub-IP only.**

### Body — JSON
```json
{ "Matriculation_Number": "IFT/18/1234" }
```

### Responses

**200**
```json
{ "Matriculation_Number": "IFT/18/1234", "date": "2026-04-21", "time_in": "2026-04-21T10:03:12.451Z" }
```

**400** — not Mon–Thu, or missing matric
**403** — not on hub network, or not admitted
**404** — matric not found
**409** — already checked in today

---

## `PATCH /attendance/check-out` — Clock out

**Hub-IP only.**

### Body — JSON
```json
{ "Matriculation_Number": "IFT/18/1234" }
```

### Responses

**200**
```json
{ "Matriculation_Number": "IFT/18/1234", "date": "2026-04-21", "time_out": "2026-04-21T17:02:48.129Z", "hours": 7.0 }
```

**403** — not on hub network
**404** — no check-in found for today
**409** — already checked out

---

## `GET /attendance/me` — Intern's own history

**Public** — intern can view their attendance from anywhere.

### Query params
| Param | Notes |
|---|---|
| `matric` | required |

### Response — `200`
```json
[
  { "date": "2026-04-21", "time_in": "2026-04-21T10:03:12Z", "time_out": "2026-04-21T17:02:48Z", "hours": 7.0 },
  { "date": "2026-04-20", "time_in": "...", "time_out": "...", "hours": 7.5 }
]
```

---

## `GET /attendance/summary` — Admin totals per intern

**Protected** (`x-api-key`). Used at cert-generation time to compute total hours and days per intern.

### Query params
| Param | Notes |
|---|---|
| `year` | optional — defaults to current year |

### Response — `200`
```json
[
  {
    "Matriculation_Number": "IFT/18/1234",
    "full_name": "Jane Doe",
    "Department": "Information Technology",
    "days_present": 72,
    "total_hours": 504.5
  }
]
```

Sorted by `total_hours` descending.

---

## CORS

Server allows requests from `https://web3nova.com` only. For local dev against a different origin, ping the backend dev to add it.
