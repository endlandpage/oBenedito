-- Curated site choices share the gallery lock and optimistic revision.
begin;
alter table public.bene_gallery_state
 add column hero_model text not null default 'bene-cheddar'
  check(hero_model in ('bene-cheddar','hamburguer-o-benedito','smash-duplo','menu','verrine-o-benedito')),
 add column feature_one_id text references public.bene_gallery_photos(id) on delete set null
  check(feature_one_id is null or feature_one_id ~ '^(bene-[1-9][0-9]?|[0-9a-f-]{36})$'),
 add column feature_two_id text references public.bene_gallery_photos(id) on delete set null
  check(feature_two_id is null or feature_two_id ~ '^(bene-[1-9][0-9]?|[0-9a-f-]{36})$');

-- The only newly readable state is the three public choices, never revision.
grant select(hero_model,feature_one_id,feature_two_id) on public.bene_gallery_state to anon,authenticated;
create policy bene_site_choices_read on public.bene_gallery_state for select to anon,authenticated using(true);
create view public.bene_site_settings_public with(security_invoker=true) as
select hero_model,
 case when exists(select 1 from public.bene_gallery_photos p where p.id=s.feature_one_id and p.visible) then feature_one_id else null end as feature_one_id,
 case when exists(select 1 from public.bene_gallery_photos p where p.id=s.feature_two_id and p.visible) then feature_two_id else null end as feature_two_id
from public.bene_gallery_state s;
revoke all on public.bene_site_settings_public from public,anon,authenticated;
grant select on public.bene_site_settings_public to anon,authenticated;

create or replace function public.bene_admin_snapshot(p_actor uuid,p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.bene_assert_admin(p_actor,p_session);
 select jsonb_build_object('revision',s.revision,
  'settings',jsonb_build_object('heroModel',s.hero_model,'featureOneId',s.feature_one_id,'featureTwoId',s.feature_two_id),
  'photos',coalesce((select jsonb_agg(to_jsonb(p) order by p.position,p.id) from public.bene_gallery_photos p),'[]'::jsonb))
 into result from public.bene_gallery_state s where singleton;
 return result;
end $$;

-- Five arguments deliberately have no default, keeping the legacy RPC
-- unambiguous. SQL NULL is internal omission; JSON null is an invalid object.
create function public.bene_admin_save(p_actor uuid,p_session uuid,p_revision bigint,p_photos jsonb,p_settings jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare current_revision bigint; item jsonb; idx integer:=0; item_id text; choice_key text; choice_id text;
begin
 perform public.bene_assert_admin(p_actor,p_session);
 select revision into current_revision from public.bene_gallery_state where singleton for update;
 if current_revision is distinct from p_revision then raise exception using errcode='P0001',message='revision_conflict';end if;
 if p_settings is not null then
  if jsonb_typeof(p_settings) is distinct from 'object' then raise exception 'invalid settings';end if;
  if not(p_settings ?& array['heroModel','featureOneId','featureTwoId']) or (p_settings-array['heroModel','featureOneId','featureTwoId'])<>'{}'::jsonb then raise exception 'invalid settings';end if;
  if jsonb_typeof(p_settings->'heroModel') is distinct from 'string' or p_settings->>'heroModel' not in ('bene-cheddar','hamburguer-o-benedito','smash-duplo','menu','verrine-o-benedito') then raise exception 'invalid settings';end if;
  foreach choice_key in array array['featureOneId','featureTwoId'] loop
   if jsonb_typeof(p_settings->choice_key) not in ('string','null') then raise exception 'invalid settings';end if;
   choice_id:=p_settings->>choice_key;
   if choice_id is not null and choice_id !~ '^(bene-[1-9][0-9]?|[0-9a-f-]{36})$' then raise exception 'invalid settings';end if;
  end loop;
 end if;
 if jsonb_typeof(p_photos) is distinct from 'array' then raise exception 'invalid photos';end if;
 if jsonb_array_length(p_photos)>100 then raise exception 'invalid photos';end if;
 if exists(select 1 from jsonb_array_elements(p_photos) p group by p->>'id' having count(*)>1) then raise exception 'duplicate photos';end if;
 for item in select value from jsonb_array_elements(p_photos) loop
  item_id:=item->>'id';
  if not exists(select 1 from public.bene_gallery_photos where id=item_id) then raise exception 'unknown photo';end if;
  if jsonb_typeof(item->'visible') is distinct from 'boolean' then raise exception 'invalid visible';end if;
  update public.bene_gallery_photos set title=item->>'title',caption=item->>'caption',alt=item->>'alt',
  category=item->>'category',visible=(item->>'visible')::boolean,position=idx,
  crop=case when item ? 'crop' then nullif(item->'crop','null'::jsonb) else crop end,
  public_path=case when seed_src is null and (item->>'visible')::boolean then item->>'public_path' else null end where id=item_id;
  idx:=idx+1;
 end loop;
 delete from public.bene_gallery_photos where id not in(select value->>'id' from jsonb_array_elements(p_photos));
 if p_settings is not null then
  foreach choice_key in array array['featureOneId','featureTwoId'] loop
   choice_id:=p_settings->>choice_key;
   if choice_id is not null and not exists(select 1 from public.bene_gallery_photos where id=choice_id and visible) then raise exception 'invalid settings';end if;
  end loop;
  update public.bene_gallery_state set hero_model=p_settings->>'heroModel',feature_one_id=p_settings->>'featureOneId',feature_two_id=p_settings->>'featureTwoId' where singleton;
 end if;
 -- Legacy saves preserve valid choices, but cannot keep a hidden/deleted photo
 -- selected. The public view independently filters visibility as defense in depth.
 update public.bene_gallery_state s set revision=revision+1,
  feature_one_id=case when exists(select 1 from public.bene_gallery_photos p where p.id=s.feature_one_id and p.visible) then s.feature_one_id else null end,
  feature_two_id=case when exists(select 1 from public.bene_gallery_photos p where p.id=s.feature_two_id and p.visible) then s.feature_two_id else null end
 where singleton;
 return public.bene_admin_snapshot(p_actor,p_session);
end $$;

create or replace function public.bene_admin_save(p_actor uuid,p_session uuid,p_revision bigint,p_photos jsonb) returns jsonb
language sql security definer set search_path='' as $$
 select public.bene_admin_save(p_actor,p_session,p_revision,p_photos,null::jsonb);
$$;
revoke all on function public.bene_admin_snapshot(uuid,uuid),public.bene_admin_save(uuid,uuid,bigint,jsonb),public.bene_admin_save(uuid,uuid,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.bene_admin_snapshot(uuid,uuid),public.bene_admin_save(uuid,uuid,bigint,jsonb),public.bene_admin_save(uuid,uuid,bigint,jsonb,jsonb) to service_role;
commit;
