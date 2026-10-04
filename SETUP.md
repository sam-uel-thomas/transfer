# Setup

Every manual step needed to run Transfer, locally and on Vercel. Allow about
30 minutes. You need accounts with Supabase, Cloudflare, Resend and Vercel,
and Node.js 20 or newer.

The order matters a little: Supabase and R2 first, then Resend, then run it
locally, then deploy.

- [1. Environment file](#1-environment-file)
- [2. Supabase](#2-supabase)
- [3. Cloudflare R2](#3-cloudflare-r2)
- [4. Resend](#4-resend)
- [5. Run locally](#5-run-locally)
- [6. Deploy to Vercel](#6-deploy-to-vercel)
- [7. Check that it works](#7-check-that-it-works)
- [Troubleshooting](#troubleshooting)
- [Behaviour worth knowing](#behaviour-worth-knowing)

---

## 1. Environment file

Copy the example file. You will fill it in as you go.

```bash
cp .env.example .env.local
```

Generate the two secrets the app needs and paste one into `COOKIE_SECRET` and
the other into `CRON_SECRET`. Run this twice:

```bash
openssl rand -base64 32
```

Set `ALLOWED_EMAIL` to the email address you will sign in with. Your account
is created for that address in step 2.4. Leave
`APP_URL=http://localhost:3000` for now.

| Variable | Where it comes from |
| --- | --- |
| `APP_URL` | The origin you open in the browser. No trailing slash. |
| `ALLOWED_EMAIL` | The email address of your account (step 2.4). |
| `SUPABASE_URL` | Supabase, step 2.3 |
| `SUPABASE_ANON_KEY` | Supabase, step 2.3 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase, step 2.3 |
| `R2_ACCOUNT_ID` | Cloudflare, step 3.3 |
| `R2_ACCESS_KEY_ID` | Cloudflare, step 3.3 |
| `R2_SECRET_ACCESS_KEY` | Cloudflare, step 3.3 |
| `R2_BUCKET` | The bucket name from step 3.1 |
| `RESEND_API_KEY` | Resend, step 4.2 |
| `EMAIL_FROM` | An address on your verified Resend domain |
| `COOKIE_SECRET` | Generated above. At least 32 characters. |
| `CRON_SECRET` | Generated above. |

None of these reach the browser. There is no `NEXT_PUBLIC_` variable.

---

## 2. Supabase

### 2.1 Create the project

Create a new project at <https://supabase.com/dashboard>. Any region; pick
the one closest to your Vercel region.

### 2.2 Run the migration

The schema is in `supabase/migrations/20261005000000_init.sql`. It creates
the `transfers` and `files` tables, enables Row Level Security on both, and
adds two small functions.

**Option A, SQL editor.** Open **SQL Editor** in the dashboard, paste the
whole file, and run it.

**Option B, Supabase CLI.** Link the project, then push:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

```bash
npx supabase db push
```

Afterwards, **Table Editor** should show `transfers` and `files`, both
marked as RLS enabled with no policies. That is intended: with RLS on and no
policies, the public API keys can read and write nothing. Only the server,
using the service role key, touches these tables.

### 2.3 Copy the keys

**Project Settings > API** (or **API Keys**):

- Project URL → `SUPABASE_URL`
- `anon` key (or the publishable key) → `SUPABASE_ANON_KEY`
- `service_role` key (or a secret key) → `SUPABASE_SERVICE_ROLE_KEY`

The service role key bypasses RLS. It is only ever read on the server.

### 2.4 Create your account

There is no sign-up page and no sign-in email. Your account is created once,
from your own machine, with a password you choose.

Fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `ALLOWED_EMAIL` in
`.env.local`, install dependencies if you have not yet:

```bash
npm install
```

Then run:

```bash
npm run create-user
```

It asks for a password twice (at least 12 characters; nothing is shown as
you type) and creates a confirmed account for `ALLOWED_EMAIL`. The password
is sent straight to Supabase and is not written to any file.

This password is the only thing protecting uploads to your storage, so make
it long and unique. A password manager's generated one is ideal.

**To change or reset the password**, run the same command again. It updates
the existing account. One account serves both local development and
production, as long as both use the same Supabase project.

Prefer the dashboard? **Authentication > Users > Add user > Create new
user**, enter the same email as `ALLOWED_EMAIL` and a password, and tick
**Auto Confirm User**.

The email provider must stay enabled under **Authentication > Sign In /
Providers > Email** (it is by default). No SMTP or email template setup is
needed, because Supabase never sends you anything.

### 2.5 Turn off sign-ups

Now that your account exists, nobody else needs one. Under
**Authentication > Sign In / Providers**, turn off **Allow new users to sign
up**.

The app does not depend on this: it has no sign-up page, and every page and
API route checks that the session belongs to `ALLOWED_EMAIL`, so any other
Supabase user is refused everywhere. Turning sign-ups off removes the
possibility altogether.

---

## 3. Cloudflare R2

### 3.1 Create the bucket

**R2 Object Storage > Create bucket**. Name it (for example `transfer`),
leave location on Automatic and storage class on Standard.

Keep it private. Do not enable the `r2.dev` public URL and do not attach a
custom domain; every upload and download goes through a presigned URL.

### 3.2 CORS rule

The browser uploads to and downloads from R2 directly, so the bucket must
allow your origins. **Bucket > Settings > CORS Policy > Edit**, then paste
this with your own domain:

```json
[
  {
    "AllowedOrigins": ["https://transfer.example.com", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

What each line is for:

- `PUT` uploads files and multipart parts. `GET` lets "Download" fetch files
  to build the zip in the browser.
- `ExposeHeaders: ["ETag"]` is essential. After each part uploads, the
  browser must read R2's `ETag` response header to finish a multipart
  upload. Without it, large uploads stall at the end.
- `AllowedHeaders: ["Content-Type"]` is the only request header the app sends.
- Origins must match exactly: scheme, host and port, no trailing slash. If
  you use Vercel preview deployments, add those origins too.

### 3.3 API token

**R2 > Manage R2 API Tokens > Create API token**:

- Permissions: **Object Read & Write**
- Specify bucket: apply to the one bucket from step 3.1 only
- TTL: forever, or rotate on your own schedule

Copy the values shown once on the confirmation screen:

- Access Key ID → `R2_ACCESS_KEY_ID`
- Secret Access Key → `R2_SECRET_ACCESS_KEY`

`R2_ACCOUNT_ID` is the 32-character ID shown on the R2 overview page. It is
also the first part of the S3 endpoint,
`https://<account-id>.r2.cloudflarestorage.com`.

### 3.4 Recommended: lifecycle rules as a safety net

The daily cron deletes expired files. These two rules catch anything it
could miss, such as a transfer cancelled at exactly the wrong moment.
**Bucket > Settings > Object lifecycle rules**:

1. **Abort incomplete multipart uploads** after `2` days.
2. **Delete objects** after `10` days. The longest expiry is 7 days, so
   nothing live is ever older than that.

---

## 4. Resend

Resend sends two emails: the link to the recipient when an upload completes,
and a note to you the first time a transfer is downloaded.

### 4.1 Verify a domain

**Domains > Add Domain** at <https://resend.com/domains>. Add the DNS records
it lists (DKIM, SPF, and optionally DMARC) at your DNS provider and wait for
the status to turn **Verified**. A subdomain such as `mail.example.com`
keeps this separate from your normal email.

### 4.2 API key

**API Keys > Create API Key** with **Sending access**, restricted to that
domain. Copy it into `RESEND_API_KEY`.

Set `EMAIL_FROM` to an address on the verified domain:

```
EMAIL_FROM="Transfer <transfer@mail.example.com>"
```

Without a verified domain, Resend only lets you send from
`onboarding@resend.dev` to your own account address. That is enough to test
the first-download email, but not the one to recipients.

---

## 5. Run locally

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:3000>. You are sent to `/login`. Sign in with
`ALLOWED_EMAIL` and the password from step 2.4, and you land on the upload
screen.

The cron job does not run locally. Trigger it by hand when you want to test
expiry (use the value of `CRON_SECRET` from `.env.local`):

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/cleanup
```

---

## 6. Deploy to Vercel

### 6.1 Create the project

Push this folder to a Git repository and import it at
<https://vercel.com/new>. If it lives in a subfolder of a larger repository,
set **Root Directory** to that subfolder. The framework is detected as
Next.js; no build settings need changing.

### 6.2 Environment variables

**Project > Settings > Environment Variables**. Add every variable from
`.env.example` for the Production environment, with one change:

- `APP_URL` is your production origin, for example
  `https://transfer.example.com`.

Use different `COOKIE_SECRET` and `CRON_SECRET` values from your local ones.
Redeploy after adding or changing variables.

### 6.3 Domain

**Project > Settings > Domains**. Add your domain, then make sure the same
origin appears in both places:

1. `APP_URL` in Vercel
2. The R2 CORS rule (step 3.2)

### 6.4 Cron

`vercel.json` already declares the job:

```json
{ "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 3 * * *" }] }
```

It runs once a day at about 03:00 UTC. Nothing else needs configuring:
because the project has a `CRON_SECRET` variable, Vercel sends it as an
`Authorization: Bearer` header, and the route rejects any request without
it. After the first production deploy, the job is listed under
**Project > Settings > Cron Jobs**, where you can also run it by hand.

Cron jobs only run on production deployments. On the Hobby plan they run
once a day and may start any time within the scheduled hour, which is fine
here: the download page checks the expiry time itself, so a transfer stops
working the moment it expires, whether or not the cron has run yet.

---

## 7. Check that it works

Run through this once on production:

1. Sign in at `/login`. A wrong password is refused, and so is any other
   email address.
2. Send a small file. The link opens in a private window and downloads with
   its original filename.
3. Send a file over 100 MB. This uses multipart upload; watch the
   percentage climb, then try **Pause** and **Resume**.
4. Send two or more files with a message, a recipient email and a password.
   The recipient gets an email. The link asks for the password, a wrong one
   is refused, the right one shows the files, and **Download** saves a zip.
5. You receive a "Downloaded" email after the first download from a browser
   where you are not signed in.
6. `/transfers` lists everything with size, expiry and download count.
   **Copy** and **Delete** work.
7. Run the cron from the Vercel dashboard. It returns something like
   `{"expired":0,"abandoned":0,"failed":0}`.

---

## Troubleshooting

**Uploads fail immediately with a CORS error in the console.** The page's
origin is not in the R2 CORS rule, or does not match exactly. Check scheme
and port. CORS changes can take a minute to apply.

**Large uploads reach the end, then fail or hang.** `ETag` is missing from
`ExposeHeaders`. The console shows "Could not read the ETag header".

**Uploads return 403 `SignatureDoesNotMatch`.** Almost always wrong R2
credentials or account ID, or a token without write access to this bucket.

**"Wrong email or password."** The page says this for every failed sign-in,
on purpose. Check that the email you type is exactly `ALLOWED_EMAIL` in the
environment you are using (local and Vercel are set separately), and that
the account exists under **Authentication > Users** in Supabase. If in
doubt, run `npm run create-user` again to set a fresh password. The real
reason for a failure is in the server log (the terminal locally, **Logs**
on Vercel).

**Forgot the password.** There is no reset email. Run
`npm run create-user` again.

**"Too many attempts."** Supabase rate-limits sign-ins. Wait a minute.

**No recipient email.** The "Sent" screen says when sending failed. Check
that `EMAIL_FROM` uses a verified domain, then look at the Resend dashboard
logs.

**"Missing environment variable X".** The variable is not set for the
environment you are running. On Vercel, redeploy after adding it.

**"Download" refuses to make a zip.** See the next section. Individual files
always download.

---

## Behaviour worth knowing

- **Limits.** 10 GB per transfer (decimal, 10,000,000,000 bytes) and 500
  files. The total is checked when the transfer is created, again against
  the real object sizes in R2 before it goes live, and by a database
  constraint. Empty files are skipped.
- **Folders.** Dropping a folder uploads everything in it and keeps the
  paths, so the zip a recipient downloads has the same structure.
- **Expiry clock.** It starts when the upload finishes, not when it begins.
- **Download count.** One download is one browser fetching files. The same
  browser coming back within two hours, or fetching several files one by
  one, counts once. Your own downloads while signed in are not counted and
  do not trigger the email.
- **Zip downloads.** A single-file transfer downloads the file directly.
  For several files, Chrome and Edge on desktop stream the zip straight to
  disk at any size. Safari, Firefox and phones have to build it in memory
  first, so there the zip is offered up to 1 GB (300 MB on phones); above
  that the page asks the recipient to save files one by one.
- **Signing in.** Email and password, checked by Supabase Auth. The session
  cookie is httpOnly and you stay signed in on that browser until you sign
  out. There is no
  sign-up page, no reset email and no lockout beyond Supabase's own rate
  limit on sign-in attempts, so the strength of your password matters.
- **Transfer passwords.** Stored as a bcrypt hash and never emailed; share
  the password yourself. Eight wrong attempts in a row lock a transfer for 15
  minutes. A correct password is remembered for 30 minutes.
- **Delete now.** Removes the files from R2 and the transfer from the
  database. The link then shows the not-found page.
- **Abandoned uploads.** An upload that never finishes is removed by the
  cron after 48 hours.
- **Uppy version.** `@uppy/core` and `@uppy/aws-s3` are pinned to version 5.
  Version 6 of the S3 plugin uploads a file's parts one at a time; version 5
  uploads them in parallel, which is what makes large uploads fast. Do not
  bump the major version without checking that.
