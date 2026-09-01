create table if not exists public.tmp_pdf_import(
  id bigserial primary key,
  num text, title text, theme text, grp text, descriptor text, origin text, pubdate date, applic text
);
grant all on public.tmp_pdf_import to service_role;
alter table public.tmp_pdf_import enable row level security;
create policy "admins manage tmp_pdf_import" on public.tmp_pdf_import for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));