/**
 * Dedicated accounts for automated live suites and Playwright admin flows.
 *
 * Tests must never sign in as the presenter's demo accounts (customer1,
 * customer2, admin), which may have real authenticators attached. These
 * accounts are provisioned by `npm run seed` with SEED_PASSWORD; no new secret
 * or env var is required. The optional *_EMAIL vars allow an alternate seeded
 * environment to use different addresses.
 */

export const TEST_CUSTOMER_A =
  process.env.TEST_CUSTOMER_A_EMAIL || 'test-customer-a@davaobank.ph';
export const TEST_CUSTOMER_B =
  process.env.TEST_CUSTOMER_B_EMAIL || 'test-customer-b@davaobank.ph';
export const TEST_ADMIN = process.env.TEST_ADMIN_EMAIL || 'test-admin@davaobank.ph';
