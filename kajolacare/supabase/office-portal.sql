-- Office-user sign-in for non support-worker staff (Admin / Coordinator / Finance).
-- These users live in payload.business.users (managed in Settings > Users & Roles).
-- They are NOT Supabase auth accounts; these RPCs (security definer) let them read
-- and write the owner's shared snapshot after validating their username + password.
--
-- Run this whole file in the Supabase SQL editor, then the /team login works.
-- Mirrors the existing employee_portal_login pattern.

-- 1) LOGIN: find the office user across snapshots, validate, return the org payload.
create or replace function public.office_portal_login(p_username text, p_password_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := lower(trim(coalesce(p_username, '')));
  v_owner_id text;
  v_payload jsonb;
  v_user jsonb;
begin
  if v_username = '' or coalesce(p_password_hash, '') = '' then
    return jsonb_build_object('ok', false, 'message', 'Enter your username and password.');
  end if;

  select s.id, s.payload, u.usr
    into v_owner_id, v_payload, v_user
  from public.app_snapshots s
  cross join lateral jsonb_array_elements(coalesce(s.payload->'business'->'users', '[]'::jsonb)) as u(usr)
  where lower(coalesce(u.usr->>'employeeUsername', u.usr->>'username', '')) = v_username
  limit 1;

  if v_user is null then
    return jsonb_build_object('ok', false, 'message', 'Username was not found.');
  end if;

  if coalesce((v_user->>'loginEnabled')::boolean, true) is not true then
    return jsonb_build_object('ok', false, 'message', 'This login is disabled.');
  end if;

  if coalesce(v_user->>'employeePasswordHash', '') <> p_password_hash then
    return jsonb_build_object('ok', false, 'message', 'Password is incorrect.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'owner_id', v_owner_id,
    'user_id', v_user->>'id',
    'name', v_user->>'name',
    'role', v_user->>'role',
    'payload', v_payload
  );
end;
$$;

-- 2) SAVE: re-validate the office user, then write the full payload to the owner's snapshot.
create or replace function public.office_portal_save(
  p_username text,
  p_password_hash text,
  p_owner_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := lower(trim(coalesce(p_username, '')));
  v_payload jsonb;
  v_user jsonb;
begin
  if v_username = '' or coalesce(p_password_hash, '') = '' or coalesce(p_owner_id, '') = '' then
    return jsonb_build_object('ok', false, 'message', 'Missing credentials.');
  end if;

  -- Re-validate against the CURRENT stored snapshot for this owner.
  select s.payload, u.usr
    into v_payload, v_user
  from public.app_snapshots s
  cross join lateral jsonb_array_elements(coalesce(s.payload->'business'->'users', '[]'::jsonb)) as u(usr)
  where s.id = p_owner_id
    and lower(coalesce(u.usr->>'employeeUsername', u.usr->>'username', '')) = v_username
  limit 1;

  if v_user is null then
    return jsonb_build_object('ok', false, 'message', 'Not authorised for this workspace.');
  end if;
  if coalesce((v_user->>'loginEnabled')::boolean, true) is not true then
    return jsonb_build_object('ok', false, 'message', 'This login is disabled.');
  end if;
  if coalesce(v_user->>'employeePasswordHash', '') <> p_password_hash then
    return jsonb_build_object('ok', false, 'message', 'Password is incorrect.');
  end if;

  update public.app_snapshots
     set payload = p_payload,
         updated_at = now()
   where id = p_owner_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.office_portal_login(text, text) to anon, authenticated;
grant execute on function public.office_portal_save(text, text, text, jsonb) to anon, authenticated;
