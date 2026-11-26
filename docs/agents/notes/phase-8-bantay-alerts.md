# Phase 8 · Bantay alerts — implementation notes

Worktree: `davao-bank-bantay-alerts`, branch `phase-8-bantay-alerts`, base `0229a2e`.
Scope: 8F item 5 (Realtime high-severity toast + Inbox note + state-aware Home
indicator) and the captain-addition interim Kada-as-Bantay art. No hosted writes.

## Migration

`supabase/migrations/20261128100000_phase8_bantay_alerts.sql` (new; no applied
migration edited):

1. A guarded `DO` block adds `public.security_events` to publication
   `supabase_realtime` only when the publication exists and the table is not
   already a member. PGlite has no publication, so `npm run test:db` is clean.
   Row visibility is unchanged: RLS policy `security_events_select_own`
   (`user_id = auth.uid() or public.is_admin()`) plus the client's
   `user_id=eq.<caller>` channel filter. **NOT VERIFIED — reason:** actual
   Realtime delivery on hosted Supabase cannot be checked locally (no hosted
   access; no `supabase_realtime` publication in PGlite). Migration needs
   **Security review**; the **captain applies it** after review.
2. `public._bantay_event` is re-created from the latest definition in
   `20261127000000_phase8_bantay_risk.sql` with exactly one addition: a single
   `public.notifications` row (`type = 'account_alert'`) when severity is
   `high`, or the kind is `account_locked` / `account_unlocked` at any severity
   (the lock helper logs those as `info`). Copy is curated sentence case with
   no ids, no JSON facts and masked `•• 1234` for the payee. `_transfer_core`,
   the ledger, idempotency keys and `run_due_scheduled_payments` are untouched.

### Byte diff of the re-created `_bantay_event`

Real `diff -u` of the function text extracted from the two migrations:

```diff
--- 20261127000000_phase8_bantay_risk.sql (function only)
+++ 20261128100000_phase8_bantay_alerts.sql (function only)
@@ -24,6 +24,53 @@
     (p_user_id, p_kind, p_severity, p_score, coalesce(p_facts, '{}'::jsonb), p_related_transaction_id)
   returning id into v_id;

+  -- ONE ADDITION: high events (and lock/unlock events at any severity) also
+  -- leave a calm Inbox note. Lock/unlock are always worth telling the customer
+  -- about, even though the lock helper logs them as 'info'.
+  if p_severity = 'high' or p_kind in ('account_locked', 'account_unlocked') then
+    insert into public.notifications (user_id, type, message)
+    values (
+      p_user_id,
+      'account_alert',
+      case p_kind
+        when 'risky_payment_challenged' then
+          'A payment to ' || coalesce(
+            '•• ' || nullif(right(coalesce(
+              nullif(p_facts ->> 'payee_suffix', 'none'),
+              p_facts ->> 'to_account_number', ''), 4), ''),
+            'a payee'
+          ) || ' needed extra confirmation. No money was sent until you confirmed it.'
+        when 'risky_payment_confirmed' then
+          'You confirmed a payment to ' || coalesce(
+            '•• ' || nullif(right(coalesce(
+              nullif(p_facts ->> 'payee_suffix', 'none'),
+              p_facts ->> 'to_account_number', ''), 4), ''),
+            'a payee'
+          ) || ' after an extra check. No further action is needed.'
+        when 'risky_payment_warning' then
+          'A payment looked unusual and Bantay showed a warning.'
+        when 'new_device' then
+          'A new device signed in to your account. If this wasn’t you, lock your account in Bantay.'
+        when 'signin_failures' then
+          'Several sign-in attempts failed. If these weren’t yours, change your password in Profile.'
+        when 'code_failures' then
+          'Several verification codes were entered incorrectly. If this wasn’t you, review your security settings.'
+        when 'mfa_changed' then
+          'Your two-step verification settings changed. If this wasn’t you, lock your account in Bantay.'
+        when 'password_changed' then
+          'Your password changed. If this wasn’t you, lock your account in Bantay.'
+        when 'limit_changed' then
+          'Your daily transfer limit changed. If this wasn’t you, review your limits in Bantay.'
+        when 'account_locked' then
+          'Your account is locked for outgoing money. You can still sign in and unlock it in Bantay.'
+        when 'account_unlocked' then
+          'Your account is unlocked. Outgoing money is available again.'
+        else
+          'Bantay recorded a security event on your account. Review it in Bantay.'
+      end
+    );
+  end if;
+
   return v_id;
 end;
 $$;
```

## App

- One `supabase.channel('security_events:<caller>')` for `INSERT` events,
  filtered by `user_id=eq.<caller>`; removed on sign-out/unmount and after a
  transport failure. Failed channels retry once with backoff and never run in
  parallel. A changing callback does not resubscribe (held in a ref).
- A high event shows `Bantay: <sentence-case title>` with a decorative Kada
  avatar and an `Open Bantay` action. `ToastProvider` sits above
  `NavigationContainer`, so the action uses a navigation container ref; the
  Inbox badge refresh reads the real count from the server (no optimistic +1).
- Home shows exactly one state-aware Bantay row under the balance card, which
  replaces the old locked banner: watching / locked / new alert. It has no
  balance information and opens BantaySecurity.
- Interim image derivative: `bantay-kada(@2x,@3x).png` from
  `kada-not-found.cutout.png`; see `apps/mobile/assets/source/README.md`.
  Static and decorative (`accessible={false}`) everywhere: 120 pt in the
  Bantay header, 32 pt in the challenge and lock sheets, 24 pt on timeline
  explanations, 28 pt on Home and Bantay toasts. No animation, so Reduce
  Motion needs no special case. **NOT VERIFIED — reason:** this model cannot
  display PNGs, so visual inspection of the output was not possible; the
  silhouette, erased `?` region, transparency and square scaling were checked
  at pixel level with Pillow instead. `kada-not-found*` is untouched.

## Copy audit

Two justified allowlist entries in `scripts/check-copy.allow.json` cover the
Realtime channel name and row filter: protocol identifiers containing the
caller's own id, never user-facing copy.
