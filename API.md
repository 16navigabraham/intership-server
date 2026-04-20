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

**401** — missing or wrong `x-api-key`
```json
{ "error": "invalid api key" }
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

## `GET /interns` — Public intern listing

**Public.** Used by the landing page to display current interns. No auth header needed.

### Response — `200`

Array of active interns, newest first. Returns only public-safe fields.

```json
[
  {
    "id": 1,
    "full_name": "Adebanjo Abraham.I",
    "Department": "Information Technology",
    "bio": "Web3 Infrastructure Engineer",
    "photo_url": "https://res.cloudinary.com/.../interns/xyz.jpg",
    "expectations": "Get a full time job role..."
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
