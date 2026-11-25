// Local-only checks for Phase 9 Service Requests. No hosted writes, no .env access.

export async function runPhase9ServiceRequestsTests({ as, su, cust, ok, U }) {
  const freshClaims = (uid, extra = {}) => ({
    sub: uid,
    aal: 'aal2',
    amr: [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }],
    ...extra,
  });

  // Helper to parse tuple rows from set-returning functions
  const parseTupleRow = (row, cols) => {
    if (!row || typeof row !== 'object') return null;
    const key = Object.keys(row)[0];
    const val = row[key];
    if (typeof val !== 'string') return null;
    // Parse tuple string: "(val1,val2,...)" or "(val1,"val2",...)"
    const cleaned = val.replace(/^\(|\)$/g, '');
    const parts = [];
    let current = '';
    let inQuotes = false;
    for (const ch of cleaned) {
      if (ch === '"') {
        inQuotes = !inQuotes;
        current += ch;
      } else if (ch === ',' && !inQuotes) {
        parts.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    parts.push(current);
    const obj = {};
    cols.forEach((col, i) => {
      let v = parts[i]?.trim();
      if (v === '' || v === 'NULL') v = null;
      else if (v?.startsWith('"') && v?.endsWith('"')) v = v.slice(1, -1);
      obj[col] = v;
    });
    return obj;
  };

  const srCols = ['id', 'user_id', 'type', 'details', 'status', 'staff_note', 'reference', 'created_at', 'updated_at'];

  // ---- 1. Table and RLS basics ----------------------------------------------------
  let r = await cust(U.A, `select count(*)::int n from service_requests`);
  ok('9 service_requests: table exists and is readable by customer', !r.err, r.err);

  r = await cust(U.A, `insert into service_requests(user_id, type, reference) values($1,'statement','DB-TEST-1234')`, [U.A]);
  ok('9 RLS: customer cannot insert directly', !!r.err, r.err || 'inserted unexpectedly');

  r = await cust(U.B, `select count(*)::int n from service_requests where user_id=$1`, [U.A]);
  ok('9 RLS: B cannot read A requests', !r.err && Number(r.rows?.[0]?.n || 0) === 0, r.err || JSON.stringify(r.rows));

  r = await cust(U.A, `update service_requests set status='completed' where user_id=$1`, [U.A]);
  ok('9 RLS: customer cannot update status directly', !!r.err || (r.rows || []).length === 0, r.err || JSON.stringify(r.rows));

  r = await cust(U.A, `delete from service_requests where user_id=$1`, [U.A]);
  ok('9 RLS: customer cannot delete directly', !!r.err || (r.rows || []).length === 0, r.err || JSON.stringify(r.rows));

  r = await as('anon', null, `select * from service_requests`);
  ok('9 RLS: anon cannot read service_requests', !!r.err, r.err);

  // ---- 2. create_service_request validation ---------------------------------------
  r = await cust(U.A, `select create_service_request('statement', '{"account_id":"x","start_date":"2026-01-01","end_date":"2026-01-31"}')`);
  ok('9 create: statement with valid details succeeds', !r.err && r.rows?.[0]?.create_service_request?.reference?.startsWith('DB-'), r.err || JSON.stringify(r.rows));

  r = await cust(U.A, `select create_service_request('certificate', '{"purpose":"visa"}')`);
  ok('9 create: certificate with valid details succeeds', !r.err && r.rows?.[0]?.create_service_request?.reference?.startsWith('DB-'), r.err || JSON.stringify(r.rows));

  r = await cust(U.A, `select create_service_request('card_replacement', '{"reason":"lost","last4":"1234"}')`);
  ok('9 create: card_replacement with valid details succeeds', !r.err && r.rows?.[0]?.create_service_request?.reference?.startsWith('DB-'), r.err || JSON.stringify(r.rows));

  r = await cust(U.A, `select create_service_request('account_update', '{"field":"email","new_value":"new@example.com"}')`);
  ok('9 create: account_update email with valid details succeeds', !r.err && r.rows?.[0]?.create_service_request?.reference?.startsWith('DB-'), r.err || JSON.stringify(r.rows));

  r = await cust(U.A, `select create_service_request('account_update', '{"field":"phone_number","new_value":"+639123456789"}')`);
  ok('9 create: account_update phone with valid details succeeds', !r.err && r.rows?.[0]?.create_service_request?.reference?.startsWith('DB-'), r.err || JSON.stringify(r.rows));

  r = await cust(U.A, `select create_service_request('remit_status', '{"reference":"DB-ABCD-EFGH"}')`);
  ok('9 create: remit_status with valid details succeeds', !r.err && r.rows?.[0]?.create_service_request?.reference?.startsWith('DB-'), r.err || JSON.stringify(r.rows));

  // Invalid type
  r = await cust(U.A, `select create_service_request('invalid_type', '{}')`);
  ok('9 create: invalid type rejected', !!r.err && /Invalid request type/i.test(r.err), r.err);

  // statement missing required fields
  r = await cust(U.A, `select create_service_request('statement', '{}')`);
  ok('9 create: statement missing account_id rejected', !!r.err && /account_id/i.test(r.err), r.err);
  r = await cust(U.A, `select create_service_request('statement', '{"account_id":"x"}')`);
  ok('9 create: statement missing dates rejected', !!r.err && /start_date and end_date/i.test(r.err), r.err);

  // certificate missing purpose
  r = await cust(U.A, `select create_service_request('certificate', '{}')`);
  ok('9 create: certificate missing purpose rejected', !!r.err && /purpose/i.test(r.err), r.err);

  // card_replacement missing reason
  r = await cust(U.A, `select create_service_request('card_replacement', '{}')`);
  ok('9 create: card_replacement missing reason rejected', !!r.err && /reason/i.test(r.err), r.err);
  r = await cust(U.A, `select create_service_request('card_replacement', '{"reason":"lost","last4":"12"}')`);
  ok('9 create: card_replacement invalid last4 rejected', !!r.err && /last4.*4 digits/i.test(r.err), r.err);

  // account_update invalid field
  r = await cust(U.A, `select create_service_request('account_update', '{"field":"password","new_value":"x"}')`);
  ok('9 create: account_update invalid field rejected', !!r.err && /field must be email or phone_number/i.test(r.err), r.err);
  r = await cust(U.A, `select create_service_request('account_update', '{"field":"email","new_value":"not-an-email"}')`);
  ok('9 create: account_update invalid email format rejected', !!r.err && /valid email format/i.test(r.err), r.err);
  r = await cust(U.A, `select create_service_request('account_update', '{"field":"phone_number","new_value":"abc"}')`);
  ok('9 create: account_update invalid phone format rejected', !!r.err && /valid phone number format/i.test(r.err), r.err);

  // remit_status invalid reference format
  r = await cust(U.A, `select create_service_request('remit_status', '{"reference":"invalid"}')`);
  ok('9 create: remit_status invalid reference format rejected', !!r.err && /DB-XXXX-XXXX/i.test(r.err), r.err);

  // Extra key in details rejected
  r = await cust(U.A, `select create_service_request('statement', '{"account_id":"x","start_date":"2026-01-01","end_date":"2026-01-31","extra":"bad"}')`);
  ok('9 create: extra key in details rejected', !!r.err && /Invalid key/i.test(r.err), r.err);

// ---- 3. Rate limiting -----------------------------------------------------------
  // Superuser: insert 10 requests for user A with far-future created_at (bypasses RLS)
  // This ensures they're counted regardless of PGlite's broken timezone.
  for (let i = 1; i <= 10; i++) {
    const ref = `DB-TEST-${i.toString().padStart(4, '0')}-${(i+1000).toString().padStart(4, '0')}`;
    await su(`
      insert into public.service_requests (user_id, type, details, reference, created_at)
      values ($1, 'statement', '{"account_id":"acc","start_date":"2026-01-01","end_date":"2026-01-31"}', $2, '2099-01-01 00:00:00+00')
    `, [U.A, ref]);
  }
  // Customer: 11th request should be rejected (rate limit sees 10 existing with created_at >= dayStart)
  r = await cust(U.A, `select create_service_request('statement', '{"account_id":"acc","start_date":"2026-01-01","end_date":"2026-01-31"}')`);
  ok('9 rate limit: 11th request in same day rejected', !!r.err && /Daily service request limit reached/i.test(r.err), r.err);

  // ---- 4. get_my_service_requests -------------------------------------------------
  r = await cust(U.A, `select get_my_service_requests()`);
  ok('9 get_my_service_requests: returns all requests for caller', !r.err && Array.isArray(r.rows) && r.rows.length >= 10, r.err || `got ${r.rows?.length} rows`);

  // Check structure by parsing tuple
  const first = parseTupleRow(r.rows?.[0], ['id', 'type', 'details', 'status', 'staff_note', 'reference', 'created_at', 'updated_at']);
  ok('9 get_my_service_requests: row has id, type, details, status, reference, created_at, updated_at',
    first && first.id && first.type && first.details && first.status && first.reference && first.created_at && first.updated_at,
    JSON.stringify(first));

  // B sees only B's requests (none)
  r = await cust(U.B, `select get_my_service_requests()`);
  ok('9 get_my_service_requests: B sees only own (empty)', !r.err && Array.isArray(r.rows) && r.rows.length === 0, r.err || JSON.stringify(r.rows));

  // Anon rejected
  r = await as('anon', null, `select get_my_service_requests()`);
  ok('9 get_my_service_requests: anon rejected', !!r.err && /permission denied/i.test(r.err), r.err);

  // ---- 5. cancel_service_request --------------------------------------------------
  // Get a submitted request ID from A
  const reqA = await cust(U.A, `select id, status from service_requests where user_id=$1 and status='submitted' limit 1`, [U.A]);
  const reqId = reqA.rows?.[0]?.id;

  r = await cust(U.A, `select cancel_service_request($1)`, [reqId]);
  ok('9 cancel: owner can cancel submitted request', !r.err && r.rows?.[0]?.cancel_service_request?.success === true, r.err || JSON.stringify(r.rows));

  // Verify status changed
  const reqAfter = await su(`select status from service_requests where id=$1`, [reqId]);
  ok('9 cancel: status updated to cancelled', reqAfter[0]?.status === 'cancelled', JSON.stringify(reqAfter[0]));

  // Cannot cancel again (not submitted)
  r = await cust(U.A, `select cancel_service_request($1)`, [reqId]);
  ok('9 cancel: cannot cancel non-submitted request', !!r.err && /Only submitted requests can be cancelled/i.test(r.err), r.err);

  // B cannot cancel A's request
  const reqA2 = await cust(U.A, `select id from service_requests where user_id=$1 and status='submitted' limit 1`, [U.A]);
  r = await cust(U.B, `select cancel_service_request($1)`, [reqA2.rows?.[0]?.id]);
  ok('9 cancel: B cannot cancel A request', !!r.err && /not found/i.test(r.err), r.err);

  // Anon rejected
  r = await as('anon', null, `select cancel_service_request($1)`, [reqId]);
  ok('9 cancel: anon rejected', !!r.err && /permission denied/i.test(r.err), r.err);

  // ---- 6. Admin RPCs --------------------------------------------------------------
  // Customer cannot call admin RPCs
  r = await cust(U.A, `select admin_list_service_requests()`);
  ok('9 admin_list: customer rejected', !!r.err && /Admin privilege|STEP_UP_REQUIRED|permission denied/i.test(r.err), r.err);

  r = await cust(U.A, `select admin_update_service_request($1,'in_review')`, [reqId]);
  ok('9 admin_update: customer rejected', !!r.err && /Admin privilege|STEP_UP_REQUIRED|permission denied/i.test(r.err), r.err);

  // Admin at aal1 rejected
  const aal1 = { sub: U.ADM, aal: 'aal1', amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }] };
  r = await as('authenticated', U.ADM, `select admin_list_service_requests()`, [], aal1);
  ok('9 admin_list: admin aal1 rejected', !!r.err && /STEP_UP_REQUIRED/i.test(r.err), r.err);

  r = await as('authenticated', U.ADM, `select admin_update_service_request($1,'in_review')`, [reqId], aal1);
  ok('9 admin_update: admin aal1 rejected', !!r.err && /STEP_UP_REQUIRED/i.test(r.err), r.err);

  // Admin at aal2 can list - use explicit column selection to avoid tuple parsing issues
  r = await as('authenticated', U.ADM, `select * from admin_list_service_requests()`, [], freshClaims(U.ADM));
  ok('9 admin_list: admin aal2 succeeds', !r.err && Array.isArray(r.rows) && r.rows.length >= 10, r.err || `got ${r.rows?.length} rows`);

  // Admin can filter by status
  r = await as('authenticated', U.ADM, `select * from admin_list_service_requests('submitted')`, [], freshClaims(U.ADM));
  ok('9 admin_list: filter by submitted', !r.err && r.rows.every(x => x.status === 'submitted'), r.err || JSON.stringify(r.rows));

  r = await as('authenticated', U.ADM, `select * from admin_list_service_requests('cancelled')`, [], freshClaims(U.ADM));
  ok('9 admin_list: filter by cancelled', !r.err && r.rows.every(x => x.status === 'cancelled'), r.err || JSON.stringify(r.rows));

  // Admin update: pick a submitted request and move to in_review
  const submittedReq = (await su(`select id from service_requests where status='submitted' limit 1`))[0]?.id;
  r = await as('authenticated', U.ADM, `select admin_update_service_request($1,'in_review','staff note')`, [submittedReq], freshClaims(U.ADM));
  ok('9 admin_update: admin can set in_review', !r.err && r.rows?.[0]?.admin_update_service_request?.success === true, r.err || JSON.stringify(r.rows));

  // Verify status changed
  const updatedReq = await su(`select status, staff_note from service_requests where id=$1`, [submittedReq]);
  ok('9 admin_update: status updated and note set', updatedReq[0]?.status === 'in_review' && updatedReq[0]?.staff_note === 'staff note', JSON.stringify(updatedReq[0]));

  // Admin update: move to completed
  r = await as('authenticated', U.ADM, `select admin_update_service_request($1,'completed','done')`, [submittedReq], freshClaims(U.ADM));
  ok('9 admin_update: admin can set completed', !r.err && r.rows?.[0]?.admin_update_service_request?.success === true, r.err || JSON.stringify(r.rows));

  // Cannot set same status again
  r = await as('authenticated', U.ADM, `select admin_update_service_request($1,'completed')`, [submittedReq], freshClaims(U.ADM));
  ok('9 admin_update: duplicate status rejected', !!r.err && /already completed/i.test(r.err), r.err);

  // Invalid status rejected
  r = await as('authenticated', U.ADM, `select admin_update_service_request($1,'invalid')`, [submittedReq], freshClaims(U.ADM));
  ok('9 admin_update: invalid status rejected', !!r.err && /Invalid status/i.test(r.err), r.err);

  // Not found rejected
  r = await as('authenticated', U.ADM, `select admin_update_service_request($1,'in_review')`, ['00000000-0000-0000-0000-000000000000'], freshClaims(U.ADM));
  ok('9 admin_update: not found rejected', !!r.err && /not found/i.test(r.err), r.err);

  // ---- 7. Notifications on status change ------------------------------------------
  // Check that notifications were created for A's requests
  const notifRows = await su(`
    select message from notifications
    where user_id = $1 and type = 'service_request'
    order by created_at desc
  `, [U.A]);

  const hasSubmitted = notifRows.some(n => /has been submitted/i.test(n.message));
  const hasInReview = notifRows.some(n => /under review/i.test(n.message));
  const hasCompleted = notifRows.some(n => /is ready/i.test(n.message));

  ok('9 notifications: submitted notification exists', hasSubmitted, `messages: ${JSON.stringify(notifRows.map(x=>x.message).slice(0,5))}`);
  ok('9 notifications: in_review notification exists', hasInReview, `messages: ${JSON.stringify(notifRows.map(x=>x.message).slice(0,5))}`);
  ok('9 notifications: completed notification exists', hasCompleted, `messages: ${JSON.stringify(notifRows.map(x=>x.message).slice(0,5))}`);

  // No raw IDs or staff reasons in notifications
  const badNotifs = notifRows.filter(n =>
    /[0-9a-f]{8}-[0-9a-f]{4}-|staff note/i.test(n.message)
  );
  ok('9 notifications: no UUIDs or staff reasons in messages', badNotifs.length === 0, JSON.stringify(badNotifs));

  // ---- 8. Audit logs --------------------------------------------------------------
  const auditCreated = await su(`
    select count(*)::int n from audit_logs
    where action = 'service_request_created'
  `);
  ok('9 audit: service_request_created entries exist', auditCreated[0]?.n > 0, String(auditCreated[0]?.n));

  const auditUpdated = await su(`
    select count(*)::int n from audit_logs
    where action = 'service_request_updated'
  `);
  ok('9 audit: service_request_updated entries exist', auditUpdated[0]?.n > 0, String(auditUpdated[0]?.n));

  const auditCancelled = await su(`
    select count(*)::int n from audit_logs
    where action = 'service_request_cancelled'
  `);
  ok('9 audit: service_request_cancelled entries exist', auditCancelled[0]?.n > 0, String(auditCancelled[0]?.n));

  // ---- 9. Internal helpers not callable by customers ------------------------------
  r = await cust(U.A, `select _validate_service_request_details('statement','{}')`);
  ok('9 internal: _validate_service_request_details not callable by customer', !!r.err && /permission denied/i.test(r.err), r.err);

  r = await cust(U.A, `select _generate_service_reference()`);
  ok('9 internal: _generate_service_reference not callable by customer', !!r.err && /permission denied/i.test(r.err), r.err);

  r = await cust(U.A, `select _notify_service_request_status($1,$2,'t','s','c','r')`, [U.A, reqId]);
  ok('9 internal: _notify_service_request_status not callable by customer', !!r.err && /permission denied/i.test(r.err), r.err);
}