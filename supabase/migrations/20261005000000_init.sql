-- Transfer: schema for a single-uploader file transfer app.
--
-- Access model: Row Level Security is enabled on both tables and NO policies
-- are defined, so the `anon` and `authenticated` roles can read and write
-- nothing. Every query goes through the Next.js server using the service role
-- key, which bypasses RLS. The browser never talks to Postgres.

create table public.transfers (
  id               text primary key check (id ~ '^[A-Za-z0-9_-]{10}$'),
  owner_id         uuid not null references auth.users (id) on delete cascade,
  status           text not null default 'pending'
                     check (status in ('pending', 'ready', 'expired')),
  message          text check (char_length(message) <= 2000),
  recipient_email  text check (char_length(recipient_email) <= 320),
  password_hash    text,
  expires_in_days  smallint not null check (expires_in_days in (1, 3, 7)),
  expires_at       timestamptz not null,
  -- 10 GB cap, enforced here as well as in the API.
  total_bytes      bigint not null check (total_bytes > 0 and total_bytes <= 10000000000),
  file_count       integer not null check (file_count > 0),
  download_count   integer not null default 0,
  first_downloaded_at timestamptz,
  failed_unlocks   integer not null default 0,
  locked_until     timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz not null default now()
);

create index transfers_owner_created_idx on public.transfers (owner_id, created_at desc);
create index transfers_status_expires_idx on public.transfers (status, expires_at);

create table public.files (
  id            uuid primary key default gen_random_uuid(),
  transfer_id   text not null references public.transfers (id) on delete cascade,
  position      integer not null,
  name          text not null check (char_length(name) between 1 and 1024),
  size          bigint not null check (size > 0),
  content_type  text not null default 'application/octet-stream',
  storage_key   text not null unique,
  upload_id     text,
  uploaded      boolean not null default false,
  created_at    timestamptz not null default now()
);

create index files_transfer_position_idx on public.files (transfer_id, position);

alter table public.transfers enable row level security;
alter table public.files enable row level security;

revoke all on table public.transfers from anon, authenticated;
revoke all on table public.files from anon, authenticated;

-- Counts a download atomically and reports whether it was the first one, so
-- the "first download" email is sent exactly once even under concurrency.
create function public.record_download(p_transfer_id text)
returns table (new_count integer, is_first boolean)
language sql
set search_path = ''
as $$
  update public.transfers t
     set download_count = t.download_count + 1,
         first_downloaded_at = coalesce(t.first_downloaded_at, now())
   where t.id = p_transfer_id
     and t.status = 'ready'
     and t.expires_at > now()
  returning t.download_count, (t.download_count = 1);
$$;

-- Registers a wrong password. After 8 consecutive failures the transfer is
-- locked for 15 minutes. Returns the lock expiry (null when not locked).
create function public.record_failed_unlock(p_transfer_id text)
returns timestamptz
language sql
set search_path = ''
as $$
  update public.transfers t
     set failed_unlocks = case when t.failed_unlocks + 1 >= 8 then 0 else t.failed_unlocks + 1 end,
         locked_until   = case when t.failed_unlocks + 1 >= 8 then now() + interval '15 minutes' else t.locked_until end
   where t.id = p_transfer_id
  returning t.locked_until;
$$;

revoke execute on function public.record_download(text) from public, anon, authenticated;
revoke execute on function public.record_failed_unlock(text) from public, anon, authenticated;
grant execute on function public.record_download(text) to service_role;
grant execute on function public.record_failed_unlock(text) to service_role;
