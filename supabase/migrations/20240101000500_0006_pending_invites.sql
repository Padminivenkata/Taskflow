-- ===========================================================================
-- 0006  Pending invitations
--
-- A browser client can never create a Supabase Auth user: that needs the
-- service_role key, which must not ship to users. So onboarding works as:
--
--   1. A System Admin records the intended email, role and department here.
--   2. The admin sends the new person the shared sign-up link.
--   3. The person signs up; the on_auth_user_created trigger looks their email
--      up here and applies the pre-assigned role and department.
--
-- Without this the admin's role and department choice was silently discarded,
-- because the signup trigger always created a plain EMPLOYOYEE.
-- ===========================================================================

create table if not exists public.pending_invites (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  full_name     text,
  role          app_role not null default 'EMPLOYEE',
  department_id uuid references public.departments(id) on delete set null,
  invited_by    uuid references public.profiles(id) on delete set null,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- One outstanding invitation per address, matched case-insensitively.
create unique index if not exists pending_invites_email_key
  on public.pending_invites (lower(email));

create index if not exists pending_invites_pending_idx
  on public.pending_invites (email) where accepted_at is null;

-- ---------------------------------------------------------------------------
-- Apply the invitation at signup time
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.pending_invites;
begin
  -- This is a server-side trigger on auth.users, so it runs with no JWT and
  -- auth.uid() is NULL. The profiles role-escalation guard would otherwise
  -- reject both the insert's role and promote_first_admin()'s later update,
  -- which would make signup itself impossible. Transaction-local (third
  -- argument true), so it cannot leak onto a pooled connection.
  perform set_config('taskflow.system_write', 'on', true);

  select * into v_invite
    from public.pending_invites
   where lower(email) = lower(coalesce(new.email, ''))
     and accepted_at is null
   order by created_at desc
   limit 1;

  insert into public.profiles (id, name, email, role, department_id, active)
  values (
    new.id,
    coalesce(
      nullif(v_invite.full_name, ''),
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    coalesce(new.email, ''),
    -- A pending invite wins over the EMPLOYEE default.
    coalesce(v_invite.role, 'EMPLOYEE'::app_role),
    v_invite.department_id,
    true
  )
  on conflict (id) do nothing;

  if v_invite.id is not null then
    update public.pending_invites
       set accepted_at = now()
     where id = v_invite.id;

    perform public.write_audit('INVITE_ACCEPTED', 'profile', new.id,
      null,
      jsonb_build_object('role', v_invite.role, 'department_id', v_invite.department_id));
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS: only System Admins may read or manage invitations.
-- No authenticated user may insert themselves as an admin.
-- ---------------------------------------------------------------------------
alter table public.pending_invites enable row level security;

drop policy if exists pending_invites_read on public.pending_invites;
create policy pending_invites_read on public.pending_invites for select to authenticated
  using (public.is_admin());

drop policy if exists pending_invites_write on public.pending_invites;
create policy pending_invites_write on public.pending_invites for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.pending_invites to authenticated;
