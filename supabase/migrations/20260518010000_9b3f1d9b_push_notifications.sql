create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  push_token text not null unique,
  platform text not null,
  app_version text null,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_device_push_tokens_user_id
  on public.device_push_tokens (user_id);

create index if not exists idx_device_push_tokens_active
  on public.device_push_tokens (is_active);

alter table public.device_push_tokens enable row level security;

drop policy if exists "Users can manage own push tokens" on public.device_push_tokens;
create policy "Users can manage own push tokens"
on public.device_push_tokens
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.update_device_push_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_device_push_tokens_updated_at on public.device_push_tokens;
create trigger trg_device_push_tokens_updated_at
before update on public.device_push_tokens
for each row
execute function public.update_device_push_tokens_updated_at();

create or replace function public.build_notification_route(
  p_related_type text,
  p_related_id uuid
)
returns text
language plpgsql
immutable
as $$
begin
  if p_related_type = 'certificate' and p_related_id is not null then
    return '/student/certificates/' || p_related_id::text || '/download';
  elsif p_related_type = 'payment' then
    return '/student/payments';
  end if;

  return '/notifications';
end;
$$;

create or replace function public.dispatch_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://fteosxivqodhnaikesht.supabase.co/functions/v1/dispatch-notification-push',
    body := jsonb_build_object(
      'notificationId', new.id,
      'userId', new.user_id,
      'title', new.title,
      'message', new.message,
      'type', new.type,
      'route', public.build_notification_route(new.related_type, new.related_id),
      'relatedId', new.related_id,
      'relatedType', new.related_type
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_dispatch_notification_push on public.notifications;
create trigger trg_dispatch_notification_push
after insert on public.notifications
for each row
execute function public.dispatch_notification_push();
