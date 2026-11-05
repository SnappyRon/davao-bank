-- ==============================================================================
-- Davao Bank — Phase 2 Seed Data
-- 1 Admin and 2 Demo Customers with Confirmed Emails & Starting Balances
-- Local database only — each new user gets a random, undisclosed password.
-- For usable private demo credentials, run scripts/seed.ts with SEED_PASSWORD set.
-- ==============================================================================

do $$
declare
  v_admin_id uuid := 'a0000000-0000-0000-0000-000000000001';
  v_cust1_id uuid := 'c0000000-0000-0000-0000-000000000001';
  v_cust2_id uuid := 'c0000000-0000-0000-0000-000000000002';

  v_cust1_acc_id uuid;
  v_cust2_acc_id uuid;

  v_tx1_id uuid := gen_random_uuid();
  v_tx2_id uuid := gen_random_uuid();
begin
  -- 1. Create Admin User in auth.users
  if not exists (select 1 from auth.users where email = 'admin@davaobank.ph') then
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token
    ) values (
      v_admin_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'admin@davaobank.ph',
      crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Davao Bank Admin Staff"}'::jsonb,
      now(),
      now(),
      ''
    );
  end if;

  -- Ensure Admin profile has 'admin' role
  update public.profiles
  set role = 'admin', full_name = 'Davao Bank Admin Staff'
  where id = v_admin_id;

  -- 2. Create Customer 1 (Juan dela Cruz)
  if not exists (select 1 from auth.users where email = 'customer1@davaobank.ph') then
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token
    ) values (
      v_cust1_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'customer1@davaobank.ph',
      crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Juan dela Cruz","phone":"+639171234567"}'::jsonb,
      now(),
      now(),
      ''
    );
  end if;

  -- 3. Create Customer 2 (Maria Santos)
  if not exists (select 1 from auth.users where email = 'customer2@davaobank.ph') then
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token
    ) values (
      v_cust2_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'customer2@davaobank.ph',
      crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Maria Santos","phone":"+639189876543"}'::jsonb,
      now(),
      now(),
      ''
    );
  end if;

  -- Retrieve provisioned accounts
  select id into v_cust1_acc_id from public.accounts where user_id = v_cust1_id limit 1;
  select id into v_cust2_acc_id from public.accounts where user_id = v_cust2_id limit 1;

  -- 4. Seed Starting Balance for Customer 1 (PHP 50,000.00 = 5,000,000 centavos)
  if v_cust1_acc_id is not null and not exists (
    select 1 from public.transactions where reference = 'SEED-DEPOSIT-CUST1'
  ) then
    insert into public.transactions (id, type, status, initiated_by, reference)
    values (v_tx1_id, 'deposit', 'completed', v_cust1_id, 'SEED-DEPOSIT-CUST1');

    insert into public.ledger_entries (account_id, transaction_id, direction, amount)
    values (v_cust1_acc_id, v_tx1_id, 'credit', 5000000);
  end if;

  -- 5. Seed Starting Balance for Customer 2 (PHP 25,000.00 = 2,500,000 centavos)
  if v_cust2_acc_id is not null and not exists (
    select 1 from public.transactions where reference = 'SEED-DEPOSIT-CUST2'
  ) then
    insert into public.transactions (id, type, status, initiated_by, reference)
    values (v_tx2_id, 'deposit', 'completed', v_cust2_id, 'SEED-DEPOSIT-CUST2');

    insert into public.ledger_entries (account_id, transaction_id, direction, amount)
    values (v_cust2_acc_id, v_tx2_id, 'credit', 2500000);
  end if;

  -- 6. Seed Welcome Notifications
  insert into public.notifications (user_id, type, message)
  values
    (v_cust1_id, 'welcome', 'Mabuhay! Welcome to Davao Bank. Your account has been credited with starting funds.'),
    (v_cust2_id, 'welcome', 'Mabuhay! Welcome to Davao Bank. Your account has been credited with starting funds.')
  on conflict do nothing;

end;
$$;
