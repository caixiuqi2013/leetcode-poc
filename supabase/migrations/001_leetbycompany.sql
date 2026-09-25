-- All application data is private by default. Only server-side service-role RPCs
-- expose authorized projections; browser roles have no direct table privileges.
create extension if not exists pgcrypto;
create table public.invited_emails (
 email text primary key check (email = lower(email)), active boolean not null default true
);
create table public.companies (
 id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null
);
create table public.problems (
 id uuid primary key default gen_random_uuid(), leetcode_id text not null unique,
 frontend_id text, slug text not null
);
create table public.company_datasets (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies,
 recency_key text not null check (recency_key in ('thirty-days','three-months','six-months','more-than-six-months','all')),
 latest_snapshot_id uuid, unique(company_id, recency_key)
);
create table public.import_snapshots (
 id uuid primary key default gen_random_uuid(), dataset_id uuid not null references public.company_datasets,
 uploaded_by uuid not null references auth.users, extraction_id uuid not null,
 extracted_at timestamptz not null, imported_at timestamptz not null default now(),
 schema_version text not null, extractor_version text not null, source_metadata jsonb not null,
 content_hash text not null, request_hash text not null,
 unique(uploaded_by, extraction_id), unique(id, dataset_id)
);
alter table public.company_datasets add constraint latest_in_dataset
 foreign key(latest_snapshot_id,id) references public.import_snapshots(id,dataset_id);
create table public.snapshot_problems (
 snapshot_id uuid not null references public.import_snapshots, problem_id uuid not null references public.problems,
 position integer not null check(position>0), title text not null, slug text not null, frontend_id text,
 difficulty text not null check(difficulty in ('Easy','Medium','Hard')), topics text[] not null,
 frequency jsonb, source_rank integer check(source_rank>0),
 primary key(snapshot_id,problem_id), unique(snapshot_id,position)
);
create table public.user_lists (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users,
 dataset_id uuid not null references public.company_datasets, current_snapshot_id uuid not null,
 unique(user_id,dataset_id), unique(id,dataset_id),
 foreign key(current_snapshot_id,dataset_id) references public.import_snapshots(id,dataset_id)
);
create table public.user_list_versions (
 id uuid primary key default gen_random_uuid(), user_list_id uuid not null,
 dataset_id uuid not null, snapshot_id uuid not null, selected_at timestamptz not null default now(),
 selection_source text not null check(selection_source in ('import','refresh')),
 foreign key(user_list_id,dataset_id) references public.user_lists(id,dataset_id),
 foreign key(snapshot_id,dataset_id) references public.import_snapshots(id,dataset_id)
);
create table public.import_receipts (
 snapshot_id uuid primary key references public.import_snapshots, result jsonb not null
);
create table public.user_progress (
 user_id uuid not null references auth.users, problem_id uuid not null references public.problems,
 completed_at timestamptz not null default now(), primary key(user_id,problem_id)
);
create index on public.user_list_versions(user_list_id,selected_at desc);
create index on public.import_snapshots(dataset_id,extracted_at desc);
create index on public.snapshot_problems(problem_id);

-- Snapshot rows are immutable even if a later service implementation attempts updates.
create function public.reject_snapshot_mutation() returns trigger language plpgsql as $$
begin raise exception 'immutable-snapshot'; end $$;
create trigger immutable_snapshot before update or delete on public.import_snapshots
 for each row execute function public.reject_snapshot_mutation();
create trigger immutable_snapshot_problems before update or delete on public.snapshot_problems
 for each row execute function public.reject_snapshot_mutation();

create function public.require_member(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if p_user is null or not exists (
  select 1 from auth.users u join public.invited_emails i on i.email=lower(u.email)
  where u.id=p_user and u.email_confirmed_at is not null and i.active
 ) then raise exception 'invitation-required' using errcode='42501'; end if;
end $$;

-- Optional Auth hook blocks account creation too. API membership checks remain mandatory.
create function public.before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.invited_emails where email=lower(event->'user'->>'email') and active) then
  return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','An invitation is required.'));
 end if;
 return '{}'::jsonb;
end $$;

-- One RPC invocation is one PostgreSQL transaction. User lock serializes retries;
-- dataset row lock serializes freshness comparisons across different uploaders.
create function public.import_list(p_user uuid, p_payload jsonb, p_key text, p_content_hash text, p_request_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 s public.import_snapshots; current_s public.import_snapshots; c uuid; d uuid; sid uuid;
 lid uuid; pid uuid; row jsonb; n integer:=0; outcome text; result jsonb;
begin
 perform public.require_member(p_user);
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into s from public.import_snapshots where uploaded_by=p_user and extraction_id=(p_payload->>'extractionId')::uuid;
 if found then
  if s.request_hash<>p_request_hash then raise exception 'idempotency-conflict' using errcode='23505'; end if;
  return (select r.result from public.import_receipts r where r.snapshot_id=s.id);
 end if;
 if p_payload->>'completeness'<>'complete' or
    (p_payload->>'expectedTotal')::integer<>jsonb_array_length(p_payload->'problems') then
  raise exception 'incomplete-import' using errcode='22023';
 end if;
 insert into public.companies(slug,name) values(p_payload->'company'->>'slug',p_payload->'company'->>'name')
 on conflict(slug) do update set name=excluded.name returning id into c;
 insert into public.company_datasets(company_id,recency_key) values(c,p_key) on conflict do nothing;
 select id into d from public.company_datasets where company_id=c and recency_key=p_key for update;
 select s0.* into current_s from public.import_snapshots s0 join public.company_datasets cd on cd.latest_snapshot_id=s0.id where cd.id=d;
 insert into public.import_snapshots(dataset_id,uploaded_by,extraction_id,extracted_at,schema_version,extractor_version,source_metadata,content_hash,request_hash)
 values(d,p_user,(p_payload->>'extractionId')::uuid,(p_payload->>'extractedAt')::timestamptz,
 p_payload->>'schemaVersion',p_payload->>'extractorVersion',p_payload-'problems',p_content_hash,p_request_hash) returning id into sid;
 for row in select value from jsonb_array_elements(p_payload->'problems') loop
  n:=n+1;
  insert into public.problems(leetcode_id,frontend_id,slug) values(row->>'leetcodeId',row->>'frontendId',row->>'slug')
  on conflict(leetcode_id) do update set frontend_id=excluded.frontend_id,slug=excluded.slug returning id into pid;
  insert into public.snapshot_problems(snapshot_id,problem_id,position,title,slug,frontend_id,difficulty,topics,frequency,source_rank)
  values(sid,pid,n,row->>'title',row->>'slug',row->>'frontendId',row->>'difficulty',
  array(select jsonb_array_elements_text(row->'topics')),row->'frequency',(row->>'rank')::integer);
 end loop;
 if current_s.id is null or (p_payload->>'extractedAt')::timestamptz>current_s.extracted_at then
  update public.company_datasets set latest_snapshot_id=sid where id=d; outcome:='updated';
 elsif (p_payload->>'extractedAt')::timestamptz=current_s.extracted_at then
  outcome:=case when current_s.content_hash=p_content_hash then 'equivalent' else 'version-conflict' end;
 else outcome:='older'; end if;
 insert into public.user_lists(user_id,dataset_id,current_snapshot_id) values(p_user,d,sid)
 on conflict(user_id,dataset_id) do update set current_snapshot_id=excluded.current_snapshot_id returning id into lid;
 insert into public.user_list_versions(user_list_id,dataset_id,snapshot_id,selection_source) values(lid,d,sid,'import');
 result:=jsonb_build_object('importId',sid,'snapshotId',sid,'listId',lid,'sharedOutcome',outcome,
 'warnings',case when outcome='version-conflict' then '["Equal extraction timestamp with different content; existing shared version retained."]'::jsonb else '[]'::jsonb end);
 insert into public.import_receipts values(sid,result);
 return result;
end $$;

create function public.refresh_list(p_user uuid,p_list uuid,p_target uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.user_lists; old_time timestamptz; target public.import_snapshots;
begin
 perform public.require_member(p_user);
 -- Same per-user lock as imports avoids races between a refresh and a direct import.
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into l from public.user_lists where id=p_list and user_id=p_user for update;
 if not found then raise exception 'not-found' using errcode='42501'; end if;
 if l.current_snapshot_id=p_target then return jsonb_build_object('snapshotId',p_target,'changed',false); end if;
 select * into target from public.import_snapshots where id=p_target and dataset_id=l.dataset_id;
 select extracted_at into old_time from public.import_snapshots where id=l.current_snapshot_id;
 -- Only the current offered shared winner may be accepted. A stale offer must
 -- be fetched again; never silently substitute a different target.
 if target.id is null or target.extracted_at<=old_time or not exists(
  select 1 from public.company_datasets where id=l.dataset_id and latest_snapshot_id=p_target
 ) then raise exception 'refresh-conflict' using errcode='22023'; end if;
 update public.user_lists set current_snapshot_id=p_target where id=l.id;
 insert into public.user_list_versions(user_list_id,dataset_id,snapshot_id,selection_source)
 values(l.id,l.dataset_id,p_target,'refresh');
 return jsonb_build_object('snapshotId',p_target,'changed',true);
end $$;

create function public.set_progress(p_user uuid,p_problem uuid,p_completed boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform public.require_member(p_user);
 if not exists(select 1 from public.user_lists l join public.user_list_versions v on v.user_list_id=l.id
 join public.snapshot_problems sp on sp.snapshot_id=v.snapshot_id where l.user_id=p_user and sp.problem_id=p_problem) then
 raise exception 'not-found' using errcode='42501'; end if;
 if p_completed then insert into public.user_progress(user_id,problem_id) values(p_user,p_problem) on conflict do nothing;
 else delete from public.user_progress where user_id=p_user and problem_id=p_problem; end if;
 return jsonb_build_object('problemId',p_problem,'completed',p_completed);
end $$;

-- A single authorized projection feeds list, history and filtering endpoints.
-- It never exposes uploader identities, extraction ids or private source metadata.
create function public.read_list(p_user uuid,p_list uuid,p_snapshot uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.user_lists; s public.import_snapshots; newer public.import_snapshots; rows jsonb; history jsonb; company jsonb; range_key text;
begin
 perform public.require_member(p_user);
 select * into l from public.user_lists where id=p_list and user_id=p_user;
 if not found then raise exception 'not-found' using errcode='42501'; end if;
 if p_snapshot is not null and not exists(select 1 from public.user_list_versions where user_list_id=l.id and snapshot_id=p_snapshot) then
 raise exception 'not-found' using errcode='42501'; end if;
 select * into s from public.import_snapshots where id=coalesce(p_snapshot,l.current_snapshot_id);
 select jsonb_build_object('slug',c.slug,'name',c.name),d.recency_key into company,range_key
 from public.company_datasets d join public.companies c on c.id=d.company_id where d.id=l.dataset_id;
 select latest.* into newer from public.company_datasets d join public.import_snapshots latest on latest.id=d.latest_snapshot_id
 join public.import_snapshots personal on personal.id=l.current_snapshot_id
 where d.id=l.dataset_id and latest.extracted_at>personal.extracted_at;
 select coalesce(jsonb_agg(jsonb_build_object('problemId',sp.problem_id,'leetcodeId',p.leetcode_id,
 'frontendId',sp.frontend_id,'position',sp.position,'title',sp.title,'slug',sp.slug,
 'url','https://leetcode.com/problems/'||sp.slug||'/','difficulty',sp.difficulty,'topics',sp.topics,
 'frequency',sp.frequency,'rank',sp.source_rank,'completed',pr.problem_id is not null) order by sp.position),'[]'::jsonb)
 into rows from public.snapshot_problems sp join public.problems p on p.id=sp.problem_id
 left join public.user_progress pr on pr.problem_id=sp.problem_id and pr.user_id=p_user where sp.snapshot_id=s.id;
 select coalesce(jsonb_agg(jsonb_build_object('snapshotId',v.snapshot_id,'selectedAt',v.selected_at,'selectionSource',v.selection_source,
 'extractedAt',vs.extracted_at) order by v.selected_at desc),'[]'::jsonb)
 into history from public.user_list_versions v join public.import_snapshots vs on vs.id=v.snapshot_id where v.user_list_id=l.id;
 return jsonb_build_object('listId',l.id,'company',company,'recencyKey',range_key,'snapshotId',s.id,
 'currentSnapshotId',l.current_snapshot_id,'extractedAt',s.extracted_at,'problems',rows,'versions',history,
 'newerVersion',case when newer.id is null then null else jsonb_build_object('snapshotId',newer.id,'extractedAt',newer.extracted_at) end);
end $$;

create function public.my_companies(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 perform public.require_member(p_user);
 return coalesce((select jsonb_agg(company order by company->>'name') from (
 select jsonb_build_object('slug',c.slug,'name',c.name,'recencies',jsonb_agg(jsonb_build_object(
 'key',d.recency_key,'listId',l.id,'total',(select count(*) from public.snapshot_problems sp where sp.snapshot_id=l.current_snapshot_id),
 'completed',(select count(*) from public.snapshot_problems sp join public.user_progress p on p.problem_id=sp.problem_id and p.user_id=p_user where sp.snapshot_id=l.current_snapshot_id)
 ) order by d.recency_key)) as company from public.user_lists l join public.company_datasets d on d.id=l.dataset_id
 join public.companies c on c.id=d.company_id where l.user_id=p_user group by c.id
 ) grouped),'[]'::jsonb);
end $$;

-- Defense in depth: no browser role can read or mutate tables or invoke privileged
-- functions with someone else's UUID. Only verified-session server routes use RPCs.
do $$ declare t text; begin
 foreach t in array array['invited_emails','companies','problems','company_datasets','import_snapshots','snapshot_problems','user_lists','user_list_versions','import_receipts','user_progress'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 end loop;
end $$;
revoke all on function public.require_member(uuid), public.import_list(uuid,jsonb,text,text,text), public.refresh_list(uuid,uuid,uuid),
 public.set_progress(uuid,uuid,boolean),public.read_list(uuid,uuid,uuid),public.my_companies(uuid),public.before_user_created(jsonb),public.reject_snapshot_mutation() from public,anon,authenticated;
grant execute on function public.require_member(uuid), public.import_list(uuid,jsonb,text,text,text),public.refresh_list(uuid,uuid,uuid),
 public.set_progress(uuid,uuid,boolean),public.read_list(uuid,uuid,uuid),public.my_companies(uuid) to service_role;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
