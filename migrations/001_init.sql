create extension if not exists pgcrypto;

create table if not exists users (
    id uuid primary key,
    email text not null unique,
    name text not null,
    password_hash text not null,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists refresh_tokens (
    id uuid primary key,
    user_id uuid not null references users(id),
    token_hash text not null unique,
    expires_at timestamptz not null,
    revoked boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists videos (
    id uuid primary key,
    owner_id uuid not null references users(id),
    filename text not null,
    content_type text,
    size_bytes bigint not null,
    checksum text not null,
    storage_key text not null,
    created_at timestamptz not null default now(),
    unique(owner_id, checksum)
);

create table if not exists processing_jobs (
    id text primary key,
    owner_id uuid not null references users(id),
    video_id uuid not null references videos(id),
    status text not null,
    archive_storage_key text,
    error_code text,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists result_archives (
    id uuid primary key,
    job_id text not null unique references processing_jobs(id),
    storage_key text not null,
    size_bytes bigint not null,
    created_at timestamptz not null default now()
);

create table if not exists audit_logs (
    id uuid primary key,
    owner_id uuid,
    action text not null,
    correlation_id text not null,
    metadata_json jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_processing_jobs_owner_status_created
on processing_jobs(owner_id, status, created_at desc);

