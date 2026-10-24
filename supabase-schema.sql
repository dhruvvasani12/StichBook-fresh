-- StitchBook database schema. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;
create table if not exists public.profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null, worker_code text unique,
 role text not null check(role in ('admin','worker')), created_at timestamptz not null default now()
);
create table if not exists public.daily_work_records(
 id uuid primary key default gen_random_uuid(),
 worker_id uuid not null references public.profiles(id),
 worker_name text not null, worker_mobile text, machine_number text not null,
 work_date date not null, work_count integer not null check(work_count>=0),
 stitch_count bigint not null check(stitch_count>=0), machine_time text, placement text,
 fabric_length_metres numeric(12,2) not null check(fabric_length_metres>=0),
 created_at timestamptz not null default now()
);
create table if not exists public.daily_work_photos(
 id uuid primary key default gen_random_uuid(),
 work_record_id uuid not null references public.daily_work_records(id) on delete cascade,
 uploaded_by uuid not null references public.profiles(id), storage_path text not null unique,
 file_name text not null, content_type text not null, file_size bigint not null check(file_size>0),
 created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.daily_work_records enable row level security;
alter table public.daily_work_photos enable row level security;
create policy "profile_read_self_or_admin" on public.profiles for select to authenticated using(id=auth.uid() or exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='admin'));
create policy "records_insert_self" on public.daily_work_records for insert to authenticated with check(worker_id=auth.uid());
create policy "records_read_self_or_admin" on public.daily_work_records for select to authenticated using(worker_id=auth.uid() or exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='admin'));
create policy "photos_insert_self" on public.daily_work_photos for insert to authenticated with check(uploaded_by=auth.uid() and exists(select 1 from public.daily_work_records r where r.id=work_record_id and r.worker_id=auth.uid()));
create policy "photos_read_self_or_admin" on public.daily_work_photos for select to authenticated using(uploaded_by=auth.uid() or exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='admin'));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('machine-photos','machine-photos',false,10485760,array['image/jpeg','image/png','image/webp','image/gif']) on conflict(id) do update set public=false,file_size_limit=10485760;
create policy "machine_photos_upload_own_folder" on storage.objects for insert to authenticated with check(bucket_id='machine-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "machine_photos_read_own_folder_or_admin" on storage.objects for select to authenticated using(bucket_id='machine-photos' and ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.profiles me where me.id=auth.uid() and me.role='admin')));
-- Create auth users in Authentication first, then add profile rows with matching UUIDs.
-- Example: insert into public.profiles(id,full_name,worker_code,role) values('AUTH_USER_UUID','Admin Name','ADMIN001','admin');
