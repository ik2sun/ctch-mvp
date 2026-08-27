-- 경쟁사 모니터링 키워드에 자동 체크 주기 설정 추가
-- Supabase SQL Editor에서 1회 실행

alter table public.competitor_keywords
  add column if not exists check_interval_hours integer; -- null = 수동(자동 체크 안 함), 6/12/24/168 = 시간 단위 주기

-- 기존에는 select/insert/delete만 있었는데, 주기 변경을 위해 update 정책이 필요하다
drop policy if exists "competitor_keywords_update_own" on public.competitor_keywords;
create policy "competitor_keywords_update_own"
  on public.competitor_keywords for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
