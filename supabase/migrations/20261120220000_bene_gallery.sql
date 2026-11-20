-- Review before applying. No user is an administrator until explicitly allowed.
create table public.bene_gallery_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.bene_gallery_state (
  singleton boolean primary key default true check(singleton),
  revision bigint not null default 0 check(revision >= 0)
);
insert into public.bene_gallery_state(singleton) values(true);
create table public.bene_gallery_photos (
  id text primary key,
  seed_src text check(seed_src is null or seed_src ~ '^assets/[a-z0-9-]+\.webp$'),
  private_path text unique check(private_path is null or private_path ~ '^[0-9a-f-]{36}\.webp$'),
  public_path text unique check(public_path is null or public_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'),
  title text not null check(char_length(btrim(title)) between 1 and 70),
  caption text not null default '' check(char_length(caption)<=240),
  alt text not null check(char_length(btrim(alt)) between 1 and 300),
  category text not null check(category in ('comida','drinks','sobremesa','ambiente','identidade')),
  visible boolean not null default false,
  position integer not null check(position between 0 and 99),
  created_at timestamptz not null default now(),
  check((seed_src is null) <> (private_path is null)),
  check(not visible or seed_src is not null or public_path is not null),
  check(seed_src is null or public_path is null)
);
create table public.bene_gallery_rates (
  actor uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  window_start timestamptz not null,
  amount integer not null,
  primary key(actor,operation)
);
alter table public.bene_gallery_admins enable row level security;
alter table public.bene_gallery_state enable row level security;
alter table public.bene_gallery_photos enable row level security;
alter table public.bene_gallery_rates enable row level security;
revoke all on public.bene_gallery_admins, public.bene_gallery_state, public.bene_gallery_photos, public.bene_gallery_rates from public,anon,authenticated;
grant all on public.bene_gallery_admins, public.bene_gallery_state, public.bene_gallery_photos, public.bene_gallery_rates to service_role;
create policy bene_published_read on public.bene_gallery_photos for select to anon,authenticated using(visible);
-- Only the columns needed by the invoker view can be read directly. Private
-- object paths, rates, revisions and the allowlist are never client-readable.
grant select(id,seed_src,public_path,title,caption,alt,category,visible,position) on public.bene_gallery_photos to anon,authenticated;
create view public.bene_gallery_public with(security_invoker=true) as
select id,case when seed_src is not null then seed_src else
 'https://hzjfcsedzqjwwkvutwvm.supabase.co/storage/v1/object/public/bene-gallery-public/'||public_path end as src,
 title,caption,alt,category,visible,position from public.bene_gallery_photos where visible;
revoke all on public.bene_gallery_public from public,anon,authenticated;
grant select on public.bene_gallery_public to anon,authenticated;

create function public.bene_assert_admin(p_actor uuid,p_session uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.bene_gallery_admins where user_id=p_actor and active)
 or not exists(select 1 from auth.sessions where id=p_session and user_id=p_actor and (not_after is null or not_after>now()))
 then raise exception using errcode='42501',message='forbidden'; end if;
end $$;

create function public.bene_admin_snapshot(p_actor uuid,p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.bene_assert_admin(p_actor,p_session);
 select jsonb_build_object('revision',s.revision,'photos',coalesce((select jsonb_agg(to_jsonb(p) order by p.position,p.id) from public.bene_gallery_photos p),'[]'::jsonb))
 into result from public.bene_gallery_state s where singleton;
 return result;
end $$;

create function public.bene_admin_rate(p_actor uuid,p_session uuid,p_operation text) returns void
language plpgsql security definer set search_path='' as $$
declare cap integer; span interval; amount_now integer;
begin
 perform public.bene_assert_admin(p_actor,p_session);
 case p_operation when 'read' then cap:=60;span:=interval '1 minute';
 when 'save' then cap:=12;span:=interval '1 minute';
 when 'upload' then cap:=6;span:=interval '1 minute';
 when 'upload_day' then cap:=120;span:=interval '1 day';
 else raise exception 'invalid operation'; end case;
 insert into public.bene_gallery_rates(actor,operation,window_start,amount) values(p_actor,p_operation,now(),1)
 on conflict(actor,operation) do update set
 amount=case when bene_gallery_rates.window_start+span<=now() then 1 else bene_gallery_rates.amount+1 end,
 window_start=case when bene_gallery_rates.window_start+span<=now() then now() else bene_gallery_rates.window_start end
 returning amount into amount_now;
 if amount_now>cap then raise exception using errcode='P0001',message='rate_limit';end if;
end $$;

create function public.bene_admin_insert(p_actor uuid,p_session uuid,p_id uuid,p_path text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.bene_assert_admin(p_actor,p_session);
 perform 1 from public.bene_gallery_state where singleton for update;
 if (select count(*) from public.bene_gallery_photos)>=100 then raise exception using errcode='P0001',message='photo_limit';end if;
 if p_path<>p_id::text||'.webp' then raise exception 'invalid path';end if;
 insert into public.bene_gallery_photos(id,private_path,title,caption,alt,category,visible,position)
 values(p_id::text,p_path,'Nova foto','','Nova foto do Benedito','comida',false,(select count(*) from public.bene_gallery_photos));
 update public.bene_gallery_state set revision=revision+1 where singleton;
 return public.bene_admin_snapshot(p_actor,p_session);
end $$;

-- p_photos is assembled by the trusted Edge Function; never exposed to clients.
-- Ordering is the JSON array order, and missing IDs are deleted atomically.
create function public.bene_admin_save(p_actor uuid,p_session uuid,p_revision bigint,p_photos jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_revision bigint; item jsonb; idx integer:=0; item_id text;
begin
 perform public.bene_assert_admin(p_actor,p_session);
 select revision into current_revision from public.bene_gallery_state where singleton for update;
 if current_revision<>p_revision then raise exception using errcode='P0001',message='revision_conflict';end if;
 if jsonb_typeof(p_photos) is distinct from 'array' then raise exception 'invalid photos';end if;
 if jsonb_array_length(p_photos)>100 then raise exception 'invalid photos';end if;
 if exists(select 1 from jsonb_array_elements(p_photos) p group by p->>'id' having count(*)>1) then raise exception 'duplicate photos';end if;
 for item in select value from jsonb_array_elements(p_photos) loop
  item_id:=item->>'id';
  if not exists(select 1 from public.bene_gallery_photos where id=item_id) then raise exception 'unknown photo';end if;
  if jsonb_typeof(item->'visible')<>'boolean' then raise exception 'invalid visible';end if;
  update public.bene_gallery_photos set title=item->>'title',caption=item->>'caption',alt=item->>'alt',
  category=item->>'category',visible=(item->>'visible')::boolean,position=idx,
  public_path=case when seed_src is null and (item->>'visible')::boolean then item->>'public_path' else null end where id=item_id;
  idx:=idx+1;
 end loop;
 delete from public.bene_gallery_photos where id not in(select value->>'id' from jsonb_array_elements(p_photos));
 update public.bene_gallery_state set revision=revision+1 where singleton;
 return public.bene_admin_snapshot(p_actor,p_session);
end $$;

revoke all on function public.bene_assert_admin(uuid,uuid),public.bene_admin_snapshot(uuid,uuid),public.bene_admin_rate(uuid,uuid,text),public.bene_admin_insert(uuid,uuid,uuid,text),public.bene_admin_save(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.bene_assert_admin(uuid,uuid),public.bene_admin_snapshot(uuid,uuid),public.bene_admin_rate(uuid,uuid,text),public.bene_admin_insert(uuid,uuid,uuid,text),public.bene_admin_save(uuid,uuid,bigint,jsonb) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('bene-gallery-private','bene-gallery-private',false,4194304,array['image/webp']),
 ('bene-gallery-public','bene-gallery-public',true,4194304,array['image/webp']);
-- Explicit restrictive policies guard these buckets even if another permissive
-- policy is introduced later. Service role bypasses RLS, browser roles do not.
create policy bene_no_client_insert on storage.objects as restrictive for insert to anon,authenticated
 with check(bucket_id not in ('bene-gallery-private','bene-gallery-public'));
create policy bene_no_client_update on storage.objects as restrictive for update to anon,authenticated
 using(bucket_id not in ('bene-gallery-private','bene-gallery-public')) with check(bucket_id not in ('bene-gallery-private','bene-gallery-public'));
create policy bene_no_client_delete on storage.objects as restrictive for delete to anon,authenticated
 using(bucket_id not in ('bene-gallery-private','bene-gallery-public'));
create policy bene_no_private_read on storage.objects as restrictive for select to anon,authenticated
 using(bucket_id<>'bene-gallery-private');
