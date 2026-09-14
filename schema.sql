-- 修正版：bge-m3 是 1024 维
-- 在 Supabase SQL Editor 执行（先删旧表）

drop table if exists memories;

create extension if not exists vector;

create table memories (
  id bigserial primary key,
  role text not null,
  content text not null,
  embedding vector(1024),
  created_at timestamptz default now()
);

create index if not exists memories_embedding_idx
  on memories
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table memories enable row level security;

create policy "允许 service_role 全量访问"
  on memories for all
  using (true)
  with check (true);

create or replace function match_memories(
  query_embedding vector(1024),
  match_count int default 10
)
returns table (
  id bigint,
  role text,
  content text,
  similarity float
)
language sql
stable
as $$
  select
    id,
    role,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from memories
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;
