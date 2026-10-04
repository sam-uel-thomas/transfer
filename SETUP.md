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

Set `ALLOWED_EMAIL` to the one address that may sign in. Leave
`APP_URL=http://localhost:3000` for now.

| Variable | Where it comes from |
| --- | --- |
| `APP_URL` | The origin you open in the browser. No trailing slash. |
| `ALLOWED_EMAIL` | Your email address. |
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

### 2.4 Auth URLs

**Authentication > URL Configuration**:

- **Site URL**: your production URL, for example `https://transfer.example.com`
- **Redirect URLs**, add both:
  - `http://localhost:3000/auth/confirm`
  - `https://transfer.example.com/auth/confirm`

A magic link that redirects to a URL missing from this list fails.

### 2.5 Email provider

**Authentication > Sign In / Providers > Email** must be enabled (it is by
default).

Supabase's built-in mail server is for testing only: it is limited to a
couple of emails per hour and only delivers to members of your Supabase
organisation. Since you will have Resend anyway, point Supabase at it under
**Authentication > Emails > SMTP Settings** once step 4 is done:

| Field | Value |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your Resend API key |
| Sender email | an address on your verified domain |

### 2.6 Optional: links that work across devices

With Supabase's default email template, the sign-in link must be opened in
the same browser that requested it. To be able to request on one device and
open on another, change two templates under **Authentication > Emails**
(**Magic Link** and **Confirm signup**) so the link reads:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Sign in</a>
```

The app accepts both link styles, so this is optional.

### 2.7 Optional: close sign-ups after your first login

Your user is created the first time you sign in. After that you can turn off
**Allow new users to sign up** under **Authentication > Sign In / Providers**.

This is tidiness, not a security requirement. The app only ever requests a
magic link for `ALLOWED_EMAIL`, and every page and API route re-checks that
the session belongs to that address. A stranger who created a Supabase user
some other way would still be refused everywhere.

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

Open <http://localhost:3000>. You are sent to `/login`. Enter
`ALLOWED_EMAIL`, open the link from the email in the same browser, and you
land on the upload screen.

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
origin appears in three places:

1. `APP_URL` in Vercel
2. Supabase **Redirect URLs** (step 2.4), with `/auth/confirm`
3. The R2 CORS rule (step 3.2)

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

1. Sign in at `/login`. A different email address must not receive a link.
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

**"That sign-in link is invalid or has expired."** Either the link was
opened in a different browser from the one that requested it (see step
2.6), it was already used, or the `/auth/confirm` URL is missing from
Supabase's Redirect URLs.

**No sign-in email arrives.** Supabase's built-in mail server is heavily
rate limited. Set up SMTP through Resend (step 2.5) and check
**Authentication > Logs** in Supabase.

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
- **Passwords.** Stored as a bcrypt hash and never emailed; share the
  password yourself. Eight wrong attempts in a row lock a transfer for 15
  minutes. A correct password is remembered for 30 minutes.
- **Delete now.** Removes the files from R2 and the transfer from the
  database. The link then shows the not-found page.
- **Abandoned uploads.** An upload that never finishes is removed by the
  cron after 48 hours.
- **Uppy version.** `@uppy/core` and `@uppy/aws-s3` are pinned to version 5.
  Version 6 of the S3 plugin uploads a file's parts one at a time; version 5
  uploads them in parallel, which is what makes large uploads fast. Do not
  bump the major version without checking that.
