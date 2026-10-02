create extension if not exists pgcrypto;

create type public.task_priority as enum ('low', 'med', 'high');
create type public.task_status as enum ('todo', 'in-progress', 'done');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  description text not null default '',
  color text not null default '#6d5efc' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position double precision not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create unique index projects_one_default_per_user
  on public.projects (user_id) where is_default;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 240),
  description text not null default '',
  priority public.task_priority not null default 'med',
  status public.task_status not null default 'todo',
  due_at timestamptz,
  reminder_at timestamptz,
  position double precision not null default 0,
  recurrence_rule jsonb,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes between 1 and 10080),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);

create index tasks_user_project_position_idx on public.tasks (user_id, project_id, position);
create index tasks_user_due_idx on public.tasks (user_id, due_at) where status <> 'done';
create index tasks_user_updated_idx on public.tasks (user_id, updated_at desc);

create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 240),
  is_done boolean not null default false,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade
);

create index subtasks_task_position_idx on public.subtasks (task_id, position);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  color text not null default '#8b86a6' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table public.task_tags (
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (task_id, tag_id),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  foreign key (tag_id, user_id) references public.tags (id, user_id) on delete cascade
);

create index task_tags_tag_idx on public.task_tags (tag_id);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null check (feature in ('quick-add', 'breakdown', 'prioritize', 'summary', 'assistant', 'auto-tag')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now()
);

create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects
for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();
create trigger subtasks_set_updated_at before update on public.subtasks
for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  insert into public.projects (user_id, name, is_default)
  values (new.id, 'My tasks', true);

  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.tags enable row level security;
alter table public.task_tags enable row level security;
alter table public.ai_usage enable row level security;

create policy "Users can read their profile" on public.profiles
for select to authenticated using ((select auth.uid()) = id);
create policy "Users can update their profile" on public.profiles
for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Users manage their projects" on public.projects
for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage their tasks" on public.tasks
for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage their subtasks" on public.subtasks
for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage their tags" on public.tags
for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage their task tags" on public.task_tags
for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users read their AI usage" on public.ai_usage
for select to authenticated using ((select auth.uid()) = user_id);
create function public.reorder_tasks(p_tasks jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  task_entry jsonb;
begin
  if jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) > 500 then
    raise exception 'Invalid task order payload';
  end if;

  for task_entry in select value from jsonb_array_elements(p_tasks)
  loop
    update public.tasks
    set status = (task_entry ->> 'status')::public.task_status,
        position = (task_entry ->> 'position')::double precision,
        completed_at = case when (task_entry ->> 'status') = 'done' then coalesce(completed_at, now()) else null end
    where id = (task_entry ->> 'id')::uuid
      and user_id = (select auth.uid());

    if not found then
      raise exception 'Task not found or not owned by current user';
    end if;
  end loop;
end;
$$;

revoke all on function public.reorder_tasks(jsonb) from public;
grant execute on function public.reorder_tasks(jsonb) to authenticated;

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.projects, public.tasks, public.subtasks, public.tags, public.task_tags to authenticated;
grant select on public.ai_usage to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.tasks;
  exception when duplicate_object then
    null;
  end;
  begin
    alter publication supabase_realtime add table public.subtasks;
  exception when duplicate_object then
    null;
  end;
end;
$$;

alter table public.tasks replica identity full;
alter table public.subtasks replica identity full;

create function public.create_task_with_tags(
  p_project_id uuid,
  p_title text,
  p_description text,
  p_priority public.task_priority,
  p_due_at timestamptz,
  p_reminder_at timestamptz,
  p_recurrence_rule jsonb,
  p_estimated_minutes integer,
  p_tags text[]
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_task_id uuid;
  tag_name text;
  new_tag_id uuid;
  next_position double precision;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  select coalesce(max(position), 0) + 1 into next_position
  from public.tasks where project_id = p_project_id and user_id = current_user_id;

  insert into public.tasks (user_id, project_id, title, description, priority, due_at, reminder_at, recurrence_rule, estimated_minutes, position)
  values (current_user_id, p_project_id, trim(p_title), coalesce(p_description, ''), p_priority, p_due_at, p_reminder_at, p_recurrence_rule, p_estimated_minutes, next_position)
  returning id into new_task_id;

  foreach tag_name in array coalesce(p_tags, array[]::text[])
  loop
    tag_name := lower(trim(tag_name));
    if tag_name = '' then continue; end if;
    if char_length(tag_name) > 40 then raise exception 'Tag name is too long'; end if;
    insert into public.tags (user_id, name) values (current_user_id, tag_name)
    on conflict (user_id, name) do update set name = excluded.name
    returning id into new_tag_id;
    insert into public.task_tags (user_id, task_id, tag_id)
    values (current_user_id, new_task_id, new_tag_id)
    on conflict (task_id, tag_id) do nothing;
  end loop;

  return new_task_id;
end;
$$;

create function public.update_task_details(
  p_task_id uuid,
  p_title text,
  p_description text,
  p_priority public.task_priority,
  p_due_at timestamptz,
  p_reminder_at timestamptz,
  p_recurrence_rule jsonb,
  p_estimated_minutes integer,
  p_tags text[]
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  tag_name text;
  new_tag_id uuid;
begin
  update public.tasks
  set title = trim(p_title),
      description = coalesce(p_description, ''),
      priority = p_priority,
      due_at = p_due_at,
      reminder_at = p_reminder_at,
      recurrence_rule = p_recurrence_rule,
      estimated_minutes = p_estimated_minutes
  where id = p_task_id and user_id = current_user_id;
  if not found then raise exception 'Task not found or not owned by current user'; end if;

  delete from public.task_tags where task_id = p_task_id and user_id = current_user_id;
  foreach tag_name in array coalesce(p_tags, array[]::text[])
  loop
    tag_name := lower(trim(tag_name));
    if tag_name = '' then continue; end if;
    if char_length(tag_name) > 40 then raise exception 'Tag name is too long'; end if;
    insert into public.tags (user_id, name) values (current_user_id, tag_name)
    on conflict (user_id, name) do update set name = excluded.name
    returning id into new_tag_id;
    insert into public.task_tags (user_id, task_id, tag_id)
    values (current_user_id, p_task_id, new_tag_id)
    on conflict (task_id, tag_id) do nothing;
  end loop;
end;
$$;

create function public.create_next_recurring_task()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  recurrence_frequency text;
  recurrence_interval integer;
  next_due_at timestamptz;
  next_task_id uuid;
begin
  if old.status = 'done' or new.status <> 'done' or new.recurrence_rule is null then return new; end if;
  recurrence_frequency := new.recurrence_rule ->> 'frequency';
  if recurrence_frequency is null or recurrence_frequency not in ('daily', 'weekly', 'monthly') then return new; end if;
  recurrence_interval := case
    when coalesce(new.recurrence_rule ->> 'interval', '') ~ '^[0-9]{1,3}$'
      then greatest(1, least(365, (new.recurrence_rule ->> 'interval')::integer))
    else 1
  end;

  next_due_at := coalesce(new.due_at, now());
  for attempt in 1..366 loop
    next_due_at := case recurrence_frequency
      when 'daily' then next_due_at + make_interval(days => recurrence_interval)
      when 'weekly' then next_due_at + make_interval(days => recurrence_interval * 7)
      else next_due_at + make_interval(months => recurrence_interval)
    end;
    exit when next_due_at > now();
  end loop;

  insert into public.tasks (user_id, project_id, title, description, priority, status, due_at, reminder_at, recurrence_rule, position)
  select new.user_id, new.project_id, new.title, new.description, new.priority, 'todo',
         case when new.due_at is null then null else next_due_at end,
         case when new.reminder_at is null or new.due_at is null then null else next_due_at - (new.due_at - new.reminder_at) end,
         new.recurrence_rule,
         coalesce((select max(position) + 1 from public.tasks where project_id = new.project_id and user_id = new.user_id), 1)
  returning id into next_task_id;

  insert into public.subtasks (user_id, task_id, title, position)
  select new.user_id, next_task_id, title, position
  from public.subtasks where task_id = new.id and user_id = new.user_id;

  insert into public.task_tags (user_id, task_id, tag_id)
  select new.user_id, next_task_id, tag_id
  from public.task_tags where task_id = new.id and user_id = new.user_id;

  return new;
end;
$$;

create trigger tasks_create_next_recurrence
after update of status on public.tasks
for each row execute function public.create_next_recurring_task();

revoke all on function public.create_task_with_tags(uuid, text, text, public.task_priority, timestamptz, timestamptz, jsonb, integer, text[]) from public;
revoke all on function public.update_task_details(uuid, text, text, public.task_priority, timestamptz, timestamptz, jsonb, integer, text[]) from public;
grant execute on function public.create_task_with_tags(uuid, text, text, public.task_priority, timestamptz, timestamptz, jsonb, integer, text[]) to authenticated;
grant execute on function public.update_task_details(uuid, text, text, public.task_priority, timestamptz, timestamptz, jsonb, integer, text[]) to authenticated;

create function public.create_subtasks(p_task_id uuid, p_titles text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  starting_position double precision;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if coalesce(array_length(p_titles, 1), 0) < 1 or array_length(p_titles, 1) > 12 then
    raise exception 'Invalid subtask list';
  end if;
  if not exists (select 1 from public.tasks where id = p_task_id and user_id = current_user_id) then
    raise exception 'Task not found or not owned by current user';
  end if;

  select coalesce(max(position), 0) into starting_position
  from public.subtasks where task_id = p_task_id and user_id = current_user_id;

  insert into public.subtasks (user_id, task_id, title, position)
  select current_user_id, p_task_id, trim(title), starting_position + item_position
  from unnest(p_titles) with ordinality as items(title, item_position)
  where char_length(trim(title)) between 1 and 240;
end;
$$;

revoke all on function public.create_subtasks(uuid, text[]) from public;
grant execute on function public.create_subtasks(uuid, text[]) to authenticated;

create function public.reserve_ai_usage(p_feature text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  usage_count integer;
  usage_id bigint;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_feature not in ('quick-add', 'breakdown', 'prioritize', 'summary', 'assistant', 'auto-tag') then
    raise exception 'Invalid AI feature';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  select count(*) into usage_count
  from public.ai_usage
  where user_id = current_user_id and created_at >= now() - interval '1 hour';
  if usage_count >= 20 then raise exception 'AI_RATE_LIMIT'; end if;

  insert into public.ai_usage (user_id, feature) values (current_user_id, p_feature)
  returning id into usage_id;
  return usage_id;
end;
$$;

create function public.complete_ai_usage(p_usage_id bigint, p_input_tokens integer, p_output_tokens integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if p_input_tokens < 0 or p_output_tokens < 0 then raise exception 'Invalid token usage'; end if;
  update public.ai_usage
  set input_tokens = p_input_tokens, output_tokens = p_output_tokens
  where id = p_usage_id and user_id = (select auth.uid());
  if not found then raise exception 'AI usage record not found'; end if;
end;
$$;

revoke all on function public.reserve_ai_usage(text) from public;
revoke all on function public.complete_ai_usage(bigint, integer, integer) from public;
grant execute on function public.reserve_ai_usage(text) to authenticated;
grant execute on function public.complete_ai_usage(bigint, integer, integer) to authenticated;
