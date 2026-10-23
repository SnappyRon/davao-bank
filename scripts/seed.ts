/**
 * Davao Bank — Phase 2 Service-Role Seed Script
 * Uses Supabase Admin API (service-role key) to ensure users are created with confirmed emails,
 * profiles have correct roles, and starting balances are deposited into accounts.
 *
 * Run with: npm run seed
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'http://127.0.0.1:54321';

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error(
    'Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required to run seed script.'
  );
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface SeedUserConfig {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: 'admin' | 'customer';
  initialBalanceCentavos?: number;
}

const SEED_USERS: SeedUserConfig[] = [
  {
    email: 'admin@davaobank.ph',
    password: 'Password123!',
    fullName: 'Davao Bank Administrator',
    role: 'admin',
  },
  {
    email: 'customer1@davaobank.ph',
    password: 'Password123!',
    fullName: 'Juan dela Cruz',
    phone: '+639171234567',
    role: 'customer',
    initialBalanceCentavos: 5000000, // PHP 50,000.00
  },
  {
    email: 'customer2@davaobank.ph',
    password: 'Password123!',
    fullName: 'Maria Santos',
    phone: '+639189876543',
    role: 'customer',
    initialBalanceCentavos: 2500000, // PHP 25,000.00
  },
];

async function seed() {
  console.log('--- Starting Davao Bank Phase 2 Seeding ---');

  for (const userConfig of SEED_USERS) {
    console.log(`\nProcessing user: ${userConfig.email} (${userConfig.role})...`);

    // 1. Check if user already exists
    const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
    let userId = userList?.users?.find((u) => u.email === userConfig.email)?.id;

    if (!userId) {
      const { data: newUser, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email: userConfig.email,
          password: userConfig.password,
          email_confirm: true,
          user_metadata: {
            full_name: userConfig.fullName,
            phone: userConfig.phone,
          },
        });

      if (createError) {
        console.error(`Failed to create user ${userConfig.email}:`, createError.message);
        continue;
      }
      userId = newUser.user.id;
      console.log(`Created auth user: ${userId}`);
    } else {
      console.log(`Existing auth user found: ${userId}`);
    }

    // 2. Ensure profile exists and role is correct
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: userId,
      full_name: userConfig.fullName,
      phone: userConfig.phone,
      role: userConfig.role,
      status: 'active',
    });

    if (profileError) {
      console.error(`Profile error for ${userConfig.email}:`, profileError.message);
    } else {
      console.log(`Profile updated with role: ${userConfig.role}`);
    }

    // 3. Ensure default account exists
    const { data: existingAccount } = await supabaseAdmin
      .from('accounts')
      .select('id, account_number')
      .eq('user_id', userId)
      .maybeSingle();

    let accountId = existingAccount?.id;
    if (!accountId) {
      const randomAcc = '10' + Math.floor(10000000 + Math.random() * 90000000);
      const { data: newAcc, error: accError } = await supabaseAdmin
        .from('accounts')
        .insert({
          user_id: userId,
          account_number: randomAcc,
          type: 'savings',
          currency: 'PHP',
          status: 'active',
        })
        .select('id')
        .single();

      if (accError) {
        console.error(`Account creation error:`, accError.message);
      } else {
        accountId = newAcc.id;
        console.log(`Created savings account: ${randomAcc}`);
      }
    } else {
      console.log(`Found account: ${existingAccount.account_number}`);
    }

    // 4. Seed initial balance if specified
    if (accountId && userConfig.initialBalanceCentavos) {
      const reference = `SEED-DEP-${userConfig.email.split('@')[0]}`;
      const { data: existingTx } = await supabaseAdmin
        .from('transactions')
        .select('id')
        .eq('reference', reference)
        .maybeSingle();

      if (!existingTx) {
        const { data: tx, error: txError } = await supabaseAdmin
          .from('transactions')
          .insert({
            type: 'deposit',
            status: 'completed',
            initiated_by: userId,
            reference,
          })
          .select('id')
          .single();

        if (txError) {
          console.error(`Transaction insert error:`, txError.message);
        } else if (tx) {
          const { error: leError } = await supabaseAdmin.from('ledger_entries').insert({
            account_id: accountId,
            transaction_id: tx.id,
            direction: 'credit',
            amount: userConfig.initialBalanceCentavos,
          });

          if (leError) {
            console.error(`Ledger entry error:`, leError.message);
          } else {
            console.log(
              `Deposited initial balance of PHP ${(userConfig.initialBalanceCentavos / 100).toLocaleString()}`
            );
          }
        }
      }
    }
  }

  console.log('\n--- Seeding Completed Successfully ---');
}

seed().catch((err) => {
  console.error('Fatal seed script error:', err);
  process.exit(1);
});
