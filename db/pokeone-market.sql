-- =============================================================================
-- Chợ trời PokéOne (games/pokeone/js/market.js) — đấu giá Pokémon giữa thành viên hub.
--
-- Chạy MỘT LẦN trong Supabase Dashboard → SQL Editor, sau schema.sql + policies.sql.
-- Chạy lại vô hại (create … if not exists / create or replace / drop policy if exists).
-- Thiết kế, giao thức và lý do từng ràng buộc: games/pokeone/NET.md §Chợ trời.
--
-- Nguyên tắc:
--   * Ai cũng ĐỌC được (anon + authenticated) — chợ là công khai.
--   * KHÔNG ai ghi thẳng vào bảng. Mọi thay đổi đi qua 4 hàm SECURITY DEFINER:
--       p1_list, p1_bid, p1_cancel, p1_claim
--   * Hết giờ xử lý lười: không có cron; phiên "đã kết thúc" khi ends_at <= giờ hiện tại.
--   * Mọi hàm ghi đều lặp lại được: p1_list/p1_bid nhận p_nonce (gọi lại cùng nonce trả kết quả cũ),
--     p1_claim nhận p_token (gọi lại cùng token trả lại đúng những thứ đã giao cho token đó).
--   * Không chống gian lận: tiền và Pokémon đến từ bản lưu của trình duyệt (như game_saves).
-- =============================================================================

create table if not exists public.p1_listings (
  id              bigint generated always as identity primary key,
  seller          uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  seller_name     text        not null check (char_length(seller_name) between 1 and 24),
  nonce           uuid        not null,
  mon             jsonb       not null check (jsonb_typeof(mon) = 'object' and octet_length(mon::text) <= 8192),
  card            jsonb       not null check (jsonb_typeof(card) = 'object' and octet_length(card::text) <= 2048),
  start_price     integer     not null check (start_price between 1 and 9999999),
  buyout          integer              check (buyout is null or (buyout > start_price and buyout <= 9999999)),
  ends_at         timestamptz not null,
  top_bid         integer,
  top_bidder      uuid,
  top_bidder_name text,
  top_bid_id      bigint,
  cancelled       boolean     not null default false,
  -- Thay cho seller_paid / mon_delivered kiểu boolean: null = chưa giao; khác null = đã giao trong lần
  -- p1_claim mang token này. Giữ token (không chỉ true/false) để gọi lại cùng token trả lại đúng món đó
  -- khi phản hồi lần trước bị mất trên đường về (NET.md §Nhận đồ lặp lại được).
  mon_claim       uuid,        -- Pokémon đã giao: cho người thắng, hoặc trả người bán nếu ế/huỷ
  money_claim     uuid,        -- tiền bán đã trả người bán
  created_at      timestamptz not null default now(),
  unique (seller, nonce)
);

create table if not exists public.p1_bids (
  id           bigint generated always as identity primary key,
  listing_id   bigint      not null references public.p1_listings (id) on delete cascade,
  bidder       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  bidder_name  text        not null check (char_length(bidder_name) between 1 and 24),
  nonce        uuid        not null,
  amount       integer     not null check (amount between 1 and 9999999),
  refund_claim uuid,         -- null = chưa hoàn; khác null = đã hoàn trong lần p1_claim mang token này
  created_at   timestamptz not null default now(),
  unique (bidder, nonce)
);

create index if not exists p1_listings_open_idx   on public.p1_listings (ends_at) where not cancelled;
create index if not exists p1_listings_seller_idx on public.p1_listings (seller);
create index if not exists p1_listings_won_idx    on public.p1_listings (top_bidder) where mon_claim is null;
create index if not exists p1_bids_bidder_idx     on public.p1_bids (bidder);
create index if not exists p1_bids_listing_idx    on public.p1_bids (listing_id);

-- ---------------------------------------------------------------- quyền: đọc công khai, không ghi thẳng

alter table public.p1_listings enable row level security;
alter table public.p1_bids     enable row level security;

drop policy if exists p1_listings_read on public.p1_listings;
create policy p1_listings_read on public.p1_listings for select to anon, authenticated using (true);
drop policy if exists p1_bids_read on public.p1_bids;
create policy p1_bids_read on public.p1_bids for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.p1_listings, public.p1_bids from anon, authenticated;
grant select on public.p1_listings, public.p1_bids to anon, authenticated;

-- ---------------------------------------------------------------- p1_list: đăng bán

create or replace function public.p1_list(
  p_nonce uuid, p_mon jsonb, p_card jsonb, p_name text,
  p_start_price integer, p_buyout integer, p_hours integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r   public.p1_listings;
begin
  if uid is null then raise exception 'p1:not_signed_in'; end if;
  -- Một người đăng tuần tự: giữ giới hạn 10 phiên mở đúng cả khi hai tab bấm cùng lúc.
  perform pg_advisory_xact_lock(hashtext('p1_list:' || uid::text));

  select * into r from public.p1_listings where seller = uid and nonce = p_nonce;
  if found then return to_jsonb(r); end if;

  if p_hours is null or p_hours not in (1, 6, 24) then raise exception 'p1:bad_duration'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 24 then raise exception 'p1:bad_name'; end if;
  if p_mon is null or jsonb_typeof(p_mon) <> 'object' or octet_length(p_mon::text) > 8192 then raise exception 'p1:bad_mon'; end if;
  if p_card is null or jsonb_typeof(p_card) <> 'object' or octet_length(p_card::text) > 2048 then raise exception 'p1:bad_mon'; end if;
  if jsonb_typeof(p_mon -> 'dex') <> 'number' or (p_mon ->> 'dex')::numeric <> (p_card ->> 'dex')::numeric then
    raise exception 'p1:bad_mon';
  end if;
  if p_start_price is null or p_start_price not between 1 and 9999999 then raise exception 'p1:bad_price'; end if;
  if p_buyout is not null and (p_buyout <= p_start_price or p_buyout > 9999999) then raise exception 'p1:bad_price'; end if;
  if (select count(*) from public.p1_listings
       where seller = uid and not cancelled and ends_at > now()) >= 10 then
    raise exception 'p1:too_many';
  end if;

  insert into public.p1_listings (seller, seller_name, nonce, mon, card, start_price, buyout, ends_at)
  values (uid, btrim(p_name), p_nonce, p_mon, p_card, p_start_price, p_buyout, now() + make_interval(hours => p_hours))
  returning * into r;
  return to_jsonb(r);
end $$;

-- ---------------------------------------------------------------- p1_bid: trả giá / mua đứt

create or replace function public.p1_bid(
  p_nonce uuid, p_listing bigint, p_amount integer, p_name text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  l    public.p1_listings;
  b    public.p1_bids;
  amt  integer := p_amount;
  low  integer;
  buy  boolean := false;
begin
  if uid is null then raise exception 'p1:not_signed_in'; end if;
  -- Khoá dòng phiên: mọi lượt trả giá cùng phiên xếp hàng, giá cao nhất không bao giờ bị ghi đè sai.
  select * into l from public.p1_listings where id = p_listing for update;
  if not found then raise exception 'p1:no_listing'; end if;

  -- Gọi lại cùng nonce (phản hồi lần trước bị mất): trả lượt đã ghi, không trừ lần hai.
  select * into b from public.p1_bids where bidder = uid and nonce = p_nonce;
  if found then
    return jsonb_build_object('bid_id', b.id, 'amount', b.amount, 'listing', b.listing_id,
                              'ended', l.ends_at <= clock_timestamp(), 'repeat', true);
  end if;

  if l.seller = uid then raise exception 'p1:own_listing'; end if;
  -- clock_timestamp chứ không now(): giao dịch có thể đã chờ khoá qua mốc hết giờ.
  if l.cancelled or l.ends_at <= clock_timestamp() or l.mon_claim is not null then raise exception 'p1:ended'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 24 then raise exception 'p1:bad_name'; end if;
  if amt is null or amt < 1 then raise exception 'p1:bid_low'; end if;

  if l.buyout is not null and amt >= l.buyout then
    amt := l.buyout;
    buy := true;
  else
    low := greatest(l.start_price, coalesce(l.top_bid + greatest(1, ceil(l.top_bid * 0.05)::integer), 0));
    if amt < low then raise exception 'p1:bid_low %', low; end if;
  end if;

  insert into public.p1_bids (listing_id, bidder, bidder_name, nonce, amount)
  values (l.id, uid, btrim(p_name), p_nonce, amt)
  returning * into b;

  update public.p1_listings
     set top_bid = amt, top_bidder = uid, top_bidder_name = btrim(p_name), top_bid_id = b.id,
         ends_at = case when buy then clock_timestamp() else ends_at end
   where id = l.id;

  return jsonb_build_object('bid_id', b.id, 'amount', amt, 'listing', l.id, 'ended', buy, 'repeat', false);
end $$;

-- ---------------------------------------------------------------- p1_cancel: rút phiên chưa ai trả giá

create or replace function public.p1_cancel(p_listing bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  l   public.p1_listings;
begin
  if uid is null then raise exception 'p1:not_signed_in'; end if;
  select * into l from public.p1_listings where id = p_listing for update;
  if not found then raise exception 'p1:no_listing'; end if;
  if l.seller <> uid then raise exception 'p1:not_yours'; end if;
  if l.cancelled then return jsonb_build_object('listing', l.id, 'cancelled', true); end if;
  if l.top_bid is not null then raise exception 'p1:has_bids'; end if;
  if l.ends_at <= clock_timestamp() then raise exception 'p1:ended'; end if;
  update public.p1_listings set cancelled = true where id = l.id;
  -- Pokémon về lại người bán qua p1_claim (một đường giao duy nhất).
  return jsonb_build_object('listing', l.id, 'cancelled', true);
end $$;

-- ---------------------------------------------------------------- p1_claim: nhận mọi thứ đang chờ

-- Trả mảng [{ kind:'mon'|'money', reason:'won'|'returned'|'sold'|'refund', listing, mon, amount }].
-- Đánh dấu và trả về trong CÙNG giao dịch. Mỗi UPDATE khoá dòng và (READ COMMITTED) xét lại điều kiện
-- trên bản mới nhất nếu dòng vừa bị giao dịch khác sửa, nên hai lần nhận song song không giao trùng.
create or replace function public.p1_claim(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  out jsonb;
begin
  if uid is null then raise exception 'p1:not_signed_in'; end if;
  if p_token is null then raise exception 'p1:bad_token'; end if;

  -- Pokémon thắng đấu giá.
  update public.p1_listings set mon_claim = p_token
   where mon_claim is null and top_bidder = uid and not cancelled and ends_at <= now();
  -- Pokémon ế (hết giờ không ai trả) hoặc đã huỷ: về lại người bán.
  update public.p1_listings set mon_claim = p_token
   where mon_claim is null and seller = uid and (cancelled or (ends_at <= now() and top_bidder is null));
  -- Tiền bán.
  update public.p1_listings set money_claim = p_token
   where money_claim is null and seller = uid and not cancelled and ends_at <= now() and top_bid is not null;
  -- Hoàn ký quỹ: mọi lượt trả giá không còn là giá cao nhất của phiên. Một lượt đã bị vượt thì không bao
  -- giờ lên lại đầu, nên hoàn ngay lúc này luôn đúng; lượt đang dẫn đầu thì chờ.
  update public.p1_bids b set refund_claim = p_token
    from public.p1_listings l
   where b.listing_id = l.id and b.bidder = uid and b.refund_claim is null and l.top_bid_id is distinct from b.id;

  select coalesce(jsonb_agg(x order by x.listing), '[]'::jsonb) into out from (
    select 'mon' as kind, case when l.top_bidder = uid then 'won' else 'returned' end as reason,
           l.id as listing, l.mon, 0 as amount
      from public.p1_listings l
     where l.mon_claim = p_token and (l.top_bidder = uid or l.seller = uid)
    union all
    select 'money', 'sold', l.id, null, l.top_bid
      from public.p1_listings l where l.money_claim = p_token and l.seller = uid
    union all
    select 'money', 'refund', b.listing_id, null, b.amount
      from public.p1_bids b where b.refund_claim = p_token and b.bidder = uid
  ) x;
  return out;
end $$;

revoke all on function public.p1_list(uuid, jsonb, jsonb, text, integer, integer, integer) from public, anon;
revoke all on function public.p1_bid(uuid, bigint, integer, text) from public, anon;
revoke all on function public.p1_cancel(bigint) from public, anon;
revoke all on function public.p1_claim(uuid) from public, anon;
grant execute on function public.p1_list(uuid, jsonb, jsonb, text, integer, integer, integer) to authenticated;
grant execute on function public.p1_bid(uuid, bigint, integer, text) to authenticated;
grant execute on function public.p1_cancel(bigint) to authenticated;
grant execute on function public.p1_claim(uuid) to authenticated;

-- PostgREST nạp lại lược đồ để thấy hàm mới ngay.
notify pgrst, 'reload schema';
