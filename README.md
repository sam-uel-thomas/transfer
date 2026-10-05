# Transfer

A private, self-hosted alternative to WeTransfer. You are the only uploader.
Recipients get a link and need no account, and the files sit in your own
storage until they expire.

![Sending a transfer: files are dropped onto the page, a message and password are added, the upload runs and the link is copied](docs/send.gif)

<p>
  <img src="docs/upload.png" width="49%" alt="The upload screen, with the words Send files in very large type" />
  <img src="docs/drop.png" width="49%" alt="The same screen inverted to white on black while files are dragged over it" />
</p>
<p>
  <img src="docs/progress.png" width="49%" alt="An upload at 42 percent, with speed, time left and the status of each file" />
  <img src="docs/transfers.png" width="49%" alt="The dashboard of sent transfers, with size, expiry and download count" />
</p>

## What the recipient sees

![Opening a password-protected link, unlocking it and downloading everything as one zip](docs/receive.gif)

## On a phone

<p>
  <img src="docs/phone-upload.png" width="32%" alt="The upload screen on a phone" />
  <img src="docs/phone-download.png" width="32%" alt="The download page on a phone" />
  <img src="docs/phone-transfers.png" width="32%" alt="The dashboard on a phone" />
</p>

<sub>Recorded with demo data against a local stand-in for the storage, so the speeds shown are illustrative.</sub>

## What it does

- Uploads go straight from the browser to Cloudflare R2 in parallel parts
  that pause, resume and retry. Up to 10 GB per transfer.
- Each transfer gets an unguessable link, with an optional message,
  password and email to the recipient.
- Recipients save single files, or everything as one zip built in their
  browser.
- Transfers expire after 1, 3 or 7 days, and a daily job deletes the files.
- You are emailed the first time a transfer is downloaded, and a dashboard
  lists everything you have sent.

## Built with

Next.js, TypeScript, Tailwind CSS, Supabase, Cloudflare R2, Uppy, Resend and
Motion. Deploys to Vercel.

## Run your own

[SETUP.md](SETUP.md) covers every step for Supabase, Cloudflare R2, Resend
and Vercel, and explains how the app is secured.

## Licence

[MIT](LICENSE)
