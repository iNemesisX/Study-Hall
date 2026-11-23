-- Study Hall: accounts and notebook sharing.
-- Run once in your Supabase project: Dashboard › SQL Editor › New query › paste › Run.
-- Safe to run again (it skips what already exists).
--
-- Who can see what (enforced by Postgres row-level security, not by the app):
--   - a notebook's owner: everything, and only the owner can share, invite or remove people
--   - invited editors: read and change pages and files
--   - invited viewers: read only
--   - anyone with a view-only link: read only, and only while the owner keeps the link on

create extension if not exists pgcrypto;

/* ---------- tables ---------- */
create table if not exists public.notebooks (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null default auth.uid() references auth.users on delete cascade,
  owner_email   text not null default (auth.jwt() ->> 'email'),
  name          text not null check (char_length(name) between 1 and 200),
  color         text,
  meta          jsonb not null default '{}'::jsonb,       -- sections and page order
  link_token    text unique,                               -- view-only link (null = never made)
  link_enabled  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.members (
  notebook_id   uuid not null references public.notebooks on delete cascade,
  email         text not null check (email = lower(email)),
  role          text not null check (role in ('viewer', 'editor')),
  invited_at    timestamptz not null default now(),
  primary key (notebook_id, email)
);

create table if not exists public.pages (
  notebook_id   uuid not null references public.notebooks on delete cascade,
  page_id       text not null check (char_length(page_id) <= 40),
  data          jsonb not null,
  version       integer not null default 1,
  updated_at    timestamptz not null default now(),
  updated_by    text default (auth.jwt() ->> 'email'),
  primary key (notebook_id, page_id)
);
create index if not exists pages_updated on public.pages (notebook_id, updated_at);

/* ---------- who may do what ---------- */
create or replace function public.my_email() returns text language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.can_read(nb uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from notebooks n where n.id = nb and n.owner = auth.uid())
      or exists (select 1 from members m where m.notebook_id = nb and m.email = public.my_email())
$$;
create or replace function public.can_edit(nb uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from notebooks n where n.id = nb and n.owner = auth.uid())
      or exists (select 1 from members m where m.notebook_id = nb and m.email = public.my_email() and m.role = 'editor')
$$;
create or replace function public.link_open(nb uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from notebooks n where n.id = nb and n.link_enabled and n.link_token is not null)
$$;

alter table public.notebooks enable row level security;
alter table public.members   enable row level security;
alter table public.pages     enable row level security;

drop policy if exists nb_read on public.notebooks;
create policy nb_read on public.notebooks for select using (public.can_read(id));
drop policy if exists nb_insert on public.notebooks;
create policy nb_insert on public.notebooks for insert with check (owner = auth.uid() and lower(owner_email) = public.my_email());
drop policy if exists nb_update on public.notebooks;
create policy nb_update on public.notebooks for update using (public.can_edit(id)) with check (public.can_edit(id));
drop policy if exists nb_delete on public.notebooks;
create policy nb_delete on public.notebooks for delete using (owner = auth.uid());

-- Editors may rename and reorganise, but only the owner controls ownership and the link.
create or replace function public.guard_notebook() returns trigger language plpgsql as $$
begin
  if new.owner is distinct from old.owner or new.owner_email is distinct from old.owner_email then
    raise exception 'The owner can''t be changed';
  end if;
  if (new.link_token is distinct from old.link_token or new.link_enabled is distinct from old.link_enabled) and old.owner <> auth.uid() then
    raise exception 'Only the owner can change the view-only link';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists guard_notebook on public.notebooks;
create trigger guard_notebook before update on public.notebooks for each row execute function public.guard_notebook();

drop policy if exists m_read on public.members;
create policy m_read on public.members for select using (public.can_read(notebook_id));
drop policy if exists m_owner on public.members;
create policy m_owner on public.members for all
  using (exists (select 1 from public.notebooks n where n.id = notebook_id and n.owner = auth.uid()))
  with check (exists (select 1 from public.notebooks n where n.id = notebook_id and n.owner = auth.uid()));
-- People can take themselves off a notebook shared with them.
drop policy if exists m_leave on public.members;
create policy m_leave on public.members for delete using (email = public.my_email());

drop policy if exists p_read on public.pages;
create policy p_read on public.pages for select using (public.can_read(notebook_id));
drop policy if exists p_write on public.pages;
create policy p_write on public.pages for insert with check (public.can_edit(notebook_id));
drop policy if exists p_update on public.pages;
create policy p_update on public.pages for update using (public.can_edit(notebook_id)) with check (public.can_edit(notebook_id));
drop policy if exists p_delete on public.pages;
create policy p_delete on public.pages for delete using (public.can_edit(notebook_id));

create or replace function public.touch_page() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.jwt() ->> 'email';
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  return new;
end $$;
drop trigger if exists touch_page on public.pages;
create trigger touch_page before insert or update on public.pages for each row execute function public.touch_page();

/* ---------- view-only links (no sign-in needed) ---------- */
create or replace function public.shared_by_link(token text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', n.id, 'name', n.name, 'color', n.color, 'meta', n.meta, 'owner', n.owner_email, 'updated_at', n.updated_at,
    'pages', coalesce((select jsonb_agg(jsonb_build_object('page_id', p.page_id, 'data', p.data, 'updated_at', p.updated_at)) from pages p where p.notebook_id = n.id), '[]'::jsonb))
  from notebooks n where n.link_token = token and n.link_enabled and char_length(token) >= 20
$$;
grant execute on function public.shared_by_link(text) to anon, authenticated;

/* ---------- photos, documents and recordings ---------- */
-- Cost controls: each file at most 25 MB, and each person at most 100 MB of shared files
-- (change storage_quota() below to adjust). Recordings stay on the device; only their
-- transcripts are shared.
insert into storage.buckets (id, name, public, file_size_limit)
values ('notebook-files', 'notebook-files', false, 26214400)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

create or replace function public.storage_quota() returns bigint language sql immutable as $$ select 100 * 1024 * 1024::bigint $$;
create or replace function public.storage_used(uid uuid) returns bigint language sql stable security definer set search_path = public, storage as $$
  select coalesce(sum((o.metadata ->> 'size')::bigint), 0) from storage.objects o where o.bucket_id = 'notebook-files' and o.owner = uid
$$;
-- What the Share window shows: { used, quota } in bytes for the signed-in person.
create or replace function public.my_storage() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('used', public.storage_used(auth.uid()), 'quota', public.storage_quota())
$$;
grant execute on function public.my_storage() to authenticated;

-- Files live at <notebook id>/<file name>.
drop policy if exists f_read on storage.objects;
create policy f_read on storage.objects for select using (
  bucket_id = 'notebook-files' and (public.can_read(((storage.foldername(name))[1])::uuid) or public.link_open(((storage.foldername(name))[1])::uuid)));
drop policy if exists f_insert on storage.objects;
create policy f_insert on storage.objects for insert with check (
  bucket_id = 'notebook-files' and public.can_edit(((storage.foldername(name))[1])::uuid)
  and public.storage_used(auth.uid()) < public.storage_quota()
  and lower(name) !~ '\.(wav|mp3|m4a|mp4|aac|ogg|oga|webm|flac)$');
drop policy if exists f_update on storage.objects;
create policy f_update on storage.objects for update using (
  bucket_id = 'notebook-files' and public.can_edit(((storage.foldername(name))[1])::uuid));
drop policy if exists f_delete on storage.objects;
create policy f_delete on storage.objects for delete using (
  bucket_id = 'notebook-files' and public.can_edit(((storage.foldername(name))[1])::uuid));

/* ---------- live updates for collaborators ---------- */
do $$ begin
  alter publication supabase_realtime add table public.pages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notebooks;
exception when duplicate_object then null; end $$;
