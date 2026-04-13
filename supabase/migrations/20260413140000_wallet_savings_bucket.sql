-- Wallet savings bucket: internal sub-balance + atomic transfers.

alter table public.wallets
  add column if not exists savings_balance numeric(12, 2) not null default 0.00;

alter table public.wallets
  drop constraint if exists wallets_savings_balance_non_negative;
alter table public.wallets
  add constraint wallets_savings_balance_non_negative check (savings_balance >= 0);

create index if not exists wallets_savings_user_id_idx on public.wallets (user_id);

-- Atomic wallet -> savings transfer (service_role only).
create or replace function public.transfer_wallet_to_savings(
  p_user_id uuid,
  p_amount numeric,
  p_description text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_before numeric;
  v_after numeric;
  v_s_before numeric;
  v_s_after numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if v_wallet.id is null then
    raise exception 'wallet not found';
  end if;
  if v_wallet.is_locked then
    raise exception 'wallet locked';
  end if;
  if v_wallet.balance < p_amount then
    raise exception 'insufficient wallet balance';
  end if;

  v_before := v_wallet.balance;
  v_after := v_wallet.balance - p_amount;
  v_s_before := v_wallet.savings_balance;
  v_s_after := v_wallet.savings_balance + p_amount;

  update public.wallets
  set balance = v_after,
      savings_balance = v_s_after,
      updated_at = now()
  where id = v_wallet.id;

  insert into public.transactions (
    wallet_id, user_id, type, amount, fee, balance_before, balance_after,
    description, initiated_by, status, completed_at, metadata
  ) values (
    v_wallet.id, p_user_id, 'savings_deposit', p_amount, 0, v_before, v_after,
    coalesce(nullif(trim(p_description), ''), 'Move to savings'),
    'user', 'completed', now(),
    jsonb_build_object('savings_before', v_s_before, 'savings_after', v_s_after)
  );

  return jsonb_build_object(
    'success', true,
    'wallet_balance', v_after,
    'savings_balance', v_s_after
  );
end;
$$;

create or replace function public.transfer_savings_to_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_description text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_before numeric;
  v_after numeric;
  v_s_before numeric;
  v_s_after numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select * into v_wallet from public.wallets where user_id = p_user_id for update;
  if v_wallet.id is null then
    raise exception 'wallet not found';
  end if;
  if v_wallet.is_locked then
    raise exception 'wallet locked';
  end if;
  if v_wallet.savings_balance < p_amount then
    raise exception 'insufficient savings balance';
  end if;

  v_before := v_wallet.balance;
  v_after := v_wallet.balance + p_amount;
  v_s_before := v_wallet.savings_balance;
  v_s_after := v_wallet.savings_balance - p_amount;

  update public.wallets
  set balance = v_after,
      savings_balance = v_s_after,
      updated_at = now()
  where id = v_wallet.id;

  insert into public.transactions (
    wallet_id, user_id, type, amount, fee, balance_before, balance_after,
    description, initiated_by, status, completed_at, metadata
  ) values (
    v_wallet.id, p_user_id, 'savings_withdraw', p_amount, 0, v_before, v_after,
    coalesce(nullif(trim(p_description), ''), 'Move to wallet'),
    'user', 'completed', now(),
    jsonb_build_object('savings_before', v_s_before, 'savings_after', v_s_after)
  );

  return jsonb_build_object(
    'success', true,
    'wallet_balance', v_after,
    'savings_balance', v_s_after
  );
end;
$$;

revoke all on function public.transfer_wallet_to_savings(uuid, numeric, text) from public;
revoke all on function public.transfer_savings_to_wallet(uuid, numeric, text) from public;
grant execute on function public.transfer_wallet_to_savings(uuid, numeric, text) to service_role;
grant execute on function public.transfer_savings_to_wallet(uuid, numeric, text) to service_role;

