# Transfer

A private, self-hosted file transfer app. One person uploads; recipients
download from a link, with no account.

**Setup is in [SETUP.md](SETUP.md).** It lists every manual step for
Supabase, Cloudflare R2, Resend and Vercel.

## What it does

- Files go straight from the browser to Cloudflare R2 through presigned
  URLs. They never pass through the Next.js server.
- Files over 100 MB use multipart upload with parallel parts, automatic
  retry, pause and resume.
- Up to 10 GB per transfer, with an optional message, recipient email and
  password, expiring after 1, 3 or 7 days.
- Each transfer gets an unguessable 10-character link at `/t/[id]`.
- Recipients download single files or everything as a zip built in the
  browser.
- You are emailed the first time a transfer is downloaded.
- A daily cron deletes expired files from R2.
- `/transfers` lists what you have sent, with copy-link and delete-now.

## Stack

Next.js 16 (App Router), TypeScript, Tailwind CSS 4, Supabase (Postgres and
email/password Auth), Cloudflare R2 through the S3 API, headless Uppy,
Resend, motion, client-zip. Deploys to Vercel.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm run create-user` | Create your account, or set a new password |

## Where things are

| Path | Contents |
| --- | --- |
| `src/app/page.tsx` | Upload screen (uploader only) |
| `src/app/t/[id]/` | Public download page, password gate, unlock action |
| `src/app/transfers/` | Dashboard |
| `src/app/api/uploads/route.ts` | The one route that issues upload URLs |
| `src/app/api/transfers/` | Create, complete and delete a transfer |
| `src/app/api/t/[id]/download/` | Issues download URLs, counts downloads |
| `src/app/api/cron/cleanup/` | Daily expiry job |
| `src/components/uploader/` | Upload UI and the Uppy session |
| `src/lib/r2.ts` | All R2 calls and presigning |
| `src/lib/auth.ts` | Session and `ALLOWED_EMAIL` check |
| `src/app/login/` | Sign-in page and action |
| `scripts/create-user.mjs` | Account creation and password reset |
| `src/lib/access.ts` | Signed cookies for password access |
| `src/app/globals.css` | Design tokens and type scale |
| `supabase/migrations/` | Database schema |

## Security model

- One account, created with `npm run create-user`, signs in with an email
  and password. There is no sign-up page. Every uploader page and API route
  verifies the session and that it belongs to `ALLOWED_EMAIL` on the server.
- Both tables have Row Level Security enabled with no policies, so the
  public Supabase keys can read nothing. The server uses the service role
  key, which is never sent to the browser.
- The R2 bucket is private. Upload URLs are issued only for files in a
  pending transfer owned by the uploader; download URLs last 10 minutes and
  are issued only after the expiry and password checks pass.
- Sizes are validated when a transfer is created and again against the
  stored objects before it goes live.
