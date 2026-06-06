# Supabase setup for Ogbara Labs

One Supabase project serves all four apps: one shared user account
("Ogbara Labs account"), one state table, one photo bucket. ~10 minutes.

## 1. Create the project

1. supabase.com → New project (free plan is fine — this counts as 1 of your 2 free projects).
2. Once it's ready: **Project Settings → API** and copy two values:
   - Project URL (e.g. `https://abcdefgh.supabase.co`)
   - `anon` / `public` API key

## 2. Paste the keys into the apps

Each app folder has a `supabase-config.js`. Put the same two values in **all four**
(howmany, lifegrid, couples, supersnakes):

```js
window.SUPABASE_URL = "https://abcdefgh.supabase.co";
window.SUPABASE_ANON_KEY = "eyJ...";
```

Until these are filled in, the apps run exactly as before — fully local, no
cloud button. Once filled in, a ☁️ button appears bottom-left in every app.
(The anon key is designed to be public — security comes from the RLS policies below.)

## 3. Create the state table (SQL Editor → New query → paste → Run)

```sql
-- One row per user per app holding that app's synced state as JSON
create table public.app_state (
  user_id    uuid not null references auth.users(id) on delete cascade,
  app        text not null,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, app)
);

alter table public.app_state enable row level security;

create policy "users manage own state"
  on public.app_state
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

## 4. Create the photo bucket + policies

Dashboard → **Storage → New bucket** → name it exactly `photos`, keep it **Private**.

Then run this SQL so each user can only touch files under their own folder
(`{user_id}/{app}/{photo}.jpg`):

```sql
create policy "own photos select" on storage.objects for select
  using (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "own photos insert" on storage.objects for insert
  with check (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "own photos update" on storage.objects for update
  using (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "own photos delete" on storage.objects for delete
  using (bucket_id = 'photos' and auth.uid()::text = (storage.foldername(name))[1]);
```

## 5. Auth settings

Dashboard → **Authentication → URL Configuration**:
- Site URL: `https://ogbaralabs.xyz`
- Redirect URLs — add all of:
  - `https://howmany.ogbaralabs.xyz`
  - `https://lifegrid.ogbaralabs.xyz`
  - `https://couples.ogbaralabs.xyz`
  - `https://supersnakes.ogbaralabs.xyz`

Email+password is used, so no OAuth setup is needed. By default Supabase
requires email confirmation on sign-up (user gets a confirmation email, then
signs in). To skip that during testing: Authentication → Sign In / Providers →
Email → turn off "Confirm email".

## 6. Push and test

Commit the filled-in `supabase-config.js` files and push. In any app:
tap ☁️ → Create account → sign in → make some progress → open the same app
on another device and sign in: progress follows you.

## How the sync behaves

- Apps stay **local-first**: everything works offline and without an account.
- Signed in: changes push automatically (debounced ~2s); opening an app pulls
  the cloud copy if it's newer than this device's last change (last-write-wins).
- "Sync now" in the ☁️ menu forces a pull + push.
- Photos (Life Grid) and avatars (Couples, Super Snakes) upload to the private
  `photos` bucket and download automatically on new devices.
- One login works in every app, but each subdomain asks you to sign in once
  (browser sessions are per-subdomain).

## Free-tier notes

- 500 MB database + 1 GB file storage + 50,000 monthly active users — plenty here.
- Free projects pause after ~1 week with **no traffic at all**; any app sync
  keeps it awake. If it ever pauses, restore it from the Supabase dashboard.
- No automatic backups on the free plan — if Life Grid journals become precious,
  that's the reason to upgrade to Pro ($25/mo) or export periodically.


## Background music hosting (How Many?)

The "Kids Happy Music" track (Pixabay Content License, by MFCC — free for this use, no
attribution required) is streamed at runtime rather than bundled, to keep the app small.
Host it in your own Supabase storage:

1. Dashboard → **Storage** → **New bucket** → name it exactly `assets` → toggle **Public bucket ON** → Create.
   (Public buckets are readable by anyone without policies — correct for music.)
2. Open the bucket → **Upload file** → upload the music file and name it exactly
   `kids-happy-music.mp3` (the repo zip includes `kids-happy-64k.mp3`, a 577 KB compressed
   copy — rename it on upload, or upload the original 2.3 MB file under that name).
3. Done — the app looks for:
   `https://qfjudxzxyvqraogwskwc.supabase.co/storage/v1/object/public/assets/kids-happy-music.mp3`

If the file is missing or unreachable, the app automatically falls back to its built-in
synthesised melody, so nothing breaks in the meantime.
