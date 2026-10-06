-- =====================================================================
-- WAB Fit Survey — database setup (Supabase / Postgres 15+)
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- Safe to re-run: it only creates what is missing and replaces functions.
--
-- How it protects the survey:
--   * Visitors (the "anon" key used by the web page) can NOT read or write
--     any table directly. Row Level Security is on with no policies.
--   * The page can only call 3 functions: survey_start, survey_answer,
--     survey_finish. Those functions enforce the rules:
--       - a link only works if WAB created it
--       - each question can be answered once (no going back, no changing)
--       - once finished, the link is closed for good
--       - results are calculated here, on the server, and shown once
--   * Only WAB (logged-in dashboard / service key) can create links and
--     read answers.
-- © 2026 We Are Benefits, LLC. All rights reserved. Proprietary and confidential.
-- =====================================================================

-- ---------- Tables ----------
create table if not exists public.survey_links (
  token         text primary key,
  survey_type   text not null check (survey_type in ('owner','partner')),
  label         text,                       -- internal note: who it was sent to
  created_by    text,                       -- 'Shmuel' / 'Ted'
  created_at    timestamptz not null default now(),
  opened_at     timestamptz,
  completed_at  timestamptz
);

create table if not exists public.survey_answers (
  token        text not null references public.survey_links(token) on delete cascade,
  question_id  text not null,
  answer       jsonb not null,
  answered_at  timestamptz not null default now(),
  primary key (token, question_id)
);

create table if not exists public.survey_results (
  token        text primary key references public.survey_links(token) on delete cascade,
  result       jsonb not null,
  computed_at  timestamptz not null default now()
);

-- Settings WAB can change without touching code.
-- owner_min_fulltime: PLACEHOLDER (Unknown) until PTA and Ignite confirm minimums.
-- include_part_time:  PLACEHOLDER (Unknown) until providers confirm.
create table if not exists public.survey_settings (
  key   text primary key,
  value jsonb not null
);
insert into public.survey_settings(key, value) values
  ('owner_min_fulltime', '10'::jsonb),
  ('include_part_time',  'false'::jsonb)
on conflict (key) do nothing;

alter table public.survey_links    enable row level security;
alter table public.survey_answers  enable row level security;
alter table public.survey_results  enable row level security;
alter table public.survey_settings enable row level security;
-- No policies on purpose: the web page cannot read or write tables directly.
revoke all on public.survey_links, public.survey_answers, public.survey_results, public.survey_settings from anon, authenticated;

-- ---------- Question list (the server is the source of truth) ----------
create or replace function public.survey_questions(p_type text)
returns text[] language sql immutable as $$
  select case p_type
    when 'owner'   then array['name','contact','state','industry','ft_w2','pt_w2','contractors','over_50k','payroll_freq','benefits','priority']
    when 'partner' then array['name','contact','role','licensed','owners_per_month','business_size','states']
    else array[]::text[] end;
$$;

-- Returns true if the answer is allowed for that question.
create or replace function public.survey_valid_answer(p_type text, p_q text, p_a jsonb)
returns boolean language plpgsql immutable as $$
declare
  t text := jsonb_typeof(p_a);
begin
  if not (p_q = any(public.survey_questions(p_type))) then return false; end if;

  -- number questions: a whole number 0..100000, or "not_sure"
  if p_q in ('ft_w2','pt_w2','over_50k') then
    if t = 'number' then
      return (p_a::numeric >= 0 and p_a::numeric <= 100000 and p_a::numeric = trunc(p_a::numeric));
    end if;
    return p_a = '"not_sure"'::jsonb;
  end if;

  -- multi-select questions: non-empty array of allowed strings
  if p_q = 'benefits' then
    return t = 'array' and jsonb_array_length(p_a) between 1 and 5
      and not exists (select 1 from jsonb_array_elements_text(p_a) v
                      where v not in ('medical','dental_vision','retirement','none','not_sure'));
  end if;
  if p_q = 'states' then
    return t = 'array' and jsonb_array_length(p_a) between 1 and 60
      and not exists (select 1 from jsonb_array_elements_text(p_a) v where v !~ '^([A-Z]{2}|not_sure)$');
  end if;

  -- contact: {"email": required, "phone": optional, "consent_calls_texts": true/false}
  if p_q = 'contact' then
    return t = 'object'
      and (p_a->>'email') ~* '^[^@\s]{1,64}@[^@\s]+\.[a-z]{2,}$' and length(p_a->>'email') <= 254
      and (p_a->>'phone' is null or p_a->>'phone' = '' or regexp_replace(p_a->>'phone', '\D', '', 'g') ~ '^\d{10,15}$')
      and jsonb_typeof(p_a->'consent_calls_texts') = 'boolean'
      and (select count(*) from jsonb_object_keys(p_a)) <= 3;
  end if;

  if t <> 'string' then return false; end if;

  -- their name: 2 to 80 characters after trimming
  if p_q = 'name' then
    return length(btrim(p_a #>> '{}')) between 2 and 80;
  end if;

  return case p_q
    when 'state'            then (p_a #>> '{}') ~ '^[A-Z]{2}$'
    when 'industry'         then (p_a #>> '{}') in ('restaurants','construction','healthcare','retail','professional','manufacturing','transportation','other')
    when 'contractors'      then (p_a #>> '{}') in ('yes','no','not_sure')
    when 'payroll_freq'     then (p_a #>> '{}') in ('weekly','biweekly','semimonthly','monthly','not_sure')
    when 'priority'         then (p_a #>> '{}') in ('costs','benefits')          -- one plan only, no "both"
    when 'role'             then (p_a #>> '{}') in ('cpa','payroll_hr','agent','owner','other')
    when 'licensed'         then (p_a #>> '{}') in ('yes','no')
    when 'owners_per_month' then (p_a #>> '{}') in ('0_5','6_20','21_50','50_plus')
    when 'business_size'    then (p_a #>> '{}') in ('under_10','10_49','50_199','200_plus','not_sure')
    else false end;
end $$;

-- ---------- 1) Open a link ----------
-- Tells the page which survey to show and which questions are already
-- locked (ids only, never the answers). Finished links return "completed".
create or replace function public.survey_start(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l public.survey_links;
  answered text[];
begin
  select * into l from public.survey_links where token = p_token;
  if not found then return jsonb_build_object('status','invalid'); end if;
  if l.completed_at is not null then return jsonb_build_object('status','completed'); end if;

  update public.survey_links set opened_at = coalesce(opened_at, now()) where token = p_token;
  select coalesce(array_agg(question_id), array[]::text[]) into answered
    from public.survey_answers where token = p_token;

  return jsonb_build_object('status','active','type', l.survey_type, 'answered', to_jsonb(answered));
end $$;

-- ---------- 2) Lock in one answer ----------
-- Saves an answer only if that question has never been answered on this
-- link. Answers can never be changed afterwards.
create or replace function public.survey_answer(p_token text, p_question text, p_answer jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l public.survey_links;
  qs text[];
  expected text;
begin
  select * into l from public.survey_links where token = p_token for update;
  if not found then return jsonb_build_object('ok',false,'reason','invalid'); end if;
  if l.completed_at is not null then return jsonb_build_object('ok',false,'reason','completed'); end if;
  if not public.survey_valid_answer(l.survey_type, p_question, p_answer) then
    return jsonb_build_object('ok',false,'reason','bad_answer');
  end if;

  -- Questions must be answered in order: the next one is the first unanswered.
  qs := public.survey_questions(l.survey_type);
  select q into expected from unnest(qs) with ordinality as x(q, n)
    where q not in (select question_id from public.survey_answers where token = p_token)
    order by n limit 1;
  if exists (select 1 from public.survey_answers where token = p_token and question_id = p_question) then
    return jsonb_build_object('ok',false,'reason','already_answered');
  end if;
  if expected is distinct from p_question then
    return jsonb_build_object('ok',false,'reason','out_of_order');
  end if;

  insert into public.survey_answers(token, question_id, answer) values (p_token, p_question, p_answer)
    on conflict do nothing;
  if not found then return jsonb_build_object('ok',false,'reason','already_answered'); end if;
  return jsonb_build_object('ok',true);
end $$;

-- ---------- Results (calculated on the server) ----------
create or replace function public.survey_compute(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l public.survey_links;
  a jsonb;
  min_ft int;
  incl_pt boolean;
  ft int; pt int; eligible int;
  fit text; plan text; note text;
  st jsonb; opm text; sz text;
begin
  select * into l from public.survey_links where token = p_token;
  select coalesce(jsonb_object_agg(question_id, answer), '{}'::jsonb) into a
    from public.survey_answers where token = p_token;

  if l.survey_type = 'owner' then
    select (value)::text::int into min_ft from public.survey_settings where key = 'owner_min_fulltime';
    select (value)::text::boolean into incl_pt from public.survey_settings where key = 'include_part_time';
    ft := case when jsonb_typeof(a->'ft_w2') = 'number' then (a->>'ft_w2')::int end;
    pt := case when jsonb_typeof(a->'pt_w2') = 'number' then (a->>'pt_w2')::int end;
    plan := case a->>'priority' when 'costs' then 'A' else 'B' end;

    if a->>'state' <> 'CA' then
      fit := 'not_yet'; note := 'outside_ca';
    elsif ft is null then
      fit := 'possible'; note := 'headcount_unknown';
    elsif ft >= min_ft then
      fit := 'strong';
    elsif ft >= 1 then
      fit := 'possible'; note := 'below_minimum';
    else
      fit := 'not_yet'; note := 'no_fulltime';
    end if;

    eligible := case when ft is null then null
                     else ft + case when incl_pt and pt is not null then pt else 0 end end;

    return jsonb_build_object('type','owner','name',a->>'name','fit',fit,'plan',plan,'eligible',eligible,'note',note);
  else
    opm := a->>'owners_per_month';
    sz  := a->>'business_size';
    st  := a->'states';
    if not (st ? 'CA') and not (st ? 'not_sure') then
      fit := 'later'; note := 'outside_ca';
    elsif opm in ('6_20','21_50','50_plus') and sz in ('10_49','50_199','200_plus') then
      fit := 'strong';
    else
      fit := 'good';
    end if;
    return jsonb_build_object('type','partner','name',a->>'name','fit',fit,'licensed',a->>'licensed','note',note);
  end if;
end $$;

-- ---------- 3) Finish ----------
-- Closes the link for good and returns the results ONE time.
create or replace function public.survey_finish(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l public.survey_links;
  missing int;
  r jsonb;
begin
  select * into l from public.survey_links where token = p_token for update;
  if not found then return jsonb_build_object('ok',false,'reason','invalid'); end if;
  if l.completed_at is not null then return jsonb_build_object('ok',false,'reason','completed'); end if;

  select count(*) into missing from unnest(public.survey_questions(l.survey_type)) q
    where q not in (select question_id from public.survey_answers where token = p_token);
  if missing > 0 then return jsonb_build_object('ok',false,'reason','incomplete'); end if;

  r := public.survey_compute(p_token);
  insert into public.survey_results(token, result) values (p_token, r);
  update public.survey_links set completed_at = now() where token = p_token;
  return jsonb_build_object('ok',true,'result',r);
end $$;

-- ---------- For WAB only: make a link ----------
-- In Supabase SQL Editor:  select public.survey_create_link('owner', 'Ada - uncle''s company', 'Shmuel');
-- Returns the token. The link is:  https://YOUR-SITE/fit-survey.html?t=<token>
create or replace function public.survey_create_link(p_type text, p_label text default null, p_created_by text default null)
returns text language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  if p_type not in ('owner','partner') then raise exception 'type must be owner or partner'; end if;
  tok := replace(gen_random_uuid()::text, '-', '');
  insert into public.survey_links(token, survey_type, label, created_by) values (tok, p_type, p_label, p_created_by);
  return tok;
end $$;

-- ---------- For WAB only: see everything in one place ----------
drop view if exists public.survey_responses;
create view public.survey_responses as
  select l.created_at, l.created_by, l.label,
         (select a.answer #>> '{}' from public.survey_answers a where a.token = l.token and a.question_id = 'name') as name,
         (select a.answer->>'email' from public.survey_answers a where a.token = l.token and a.question_id = 'contact') as email,
         (select a.answer->>'phone' from public.survey_answers a where a.token = l.token and a.question_id = 'contact') as phone,
         (select (a.answer->>'consent_calls_texts')::boolean from public.survey_answers a where a.token = l.token and a.question_id = 'contact') as ok_to_call_text,
         l.survey_type, l.opened_at, l.completed_at,
         (select jsonb_object_agg(a.question_id, a.answer) from public.survey_answers a where a.token = l.token) as answers,
         r.result, l.token
  from public.survey_links l left join public.survey_results r on r.token = l.token
  order by l.created_at desc;
revoke all on public.survey_responses from anon, authenticated;

-- ---------- Permissions ----------
revoke all on function public.survey_create_link(text,text,text) from public, anon, authenticated;
revoke all on function public.survey_compute(text)             from public, anon, authenticated;
grant execute on function public.survey_start(text)                to anon;
grant execute on function public.survey_answer(text,text,jsonb)    to anon;
grant execute on function public.survey_finish(text)               to anon;
