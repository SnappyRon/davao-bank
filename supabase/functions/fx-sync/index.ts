/**
 * Davao Bank — Supabase Edge Function: fx-sync (§E.1)
 *
 * Daily synchronization of European Central Bank (ECB) reference rates via Frankfurter API.
 * Securely writes to public.fx_rates using service_role credentials.
 * Scheduled via pg_cron daily at 04:00 UTC (following ECB daily fixing at 16:00 CET).
 *
 * Source Documentation: https://frankfurter.dev
 * API Endpoint: https://api.frankfurter.dev/v1/
 * Attribution: Source: ECB reference rates via Frankfurter
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FRANKFURTER_BASE_URL = 'https://api.frankfurter.dev/v1';
const PAIRS = [
  { base: 'USD', quote: 'PHP' },
  { base: 'EUR', quote: 'PHP' },
  { base: 'JPY', quote: 'PHP' },
];

interface FrankfurterResponse {
  amount: number;
  base: string;
  start_date?: string;
  end_date?: string;
  date?: string;
  rates: Record<string, Record<string, number> | number>;
}

Deno.serve(async (req: Request) => {
  // Only accept POST requests from authorized cron or admin runners
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Secure authorization check (§0.5): require valid x-fx-sync-secret header
  const expectedSecret = Deno.env.get('FX_SYNC_SECRET');
  const incomingSecret = req.headers.get('x-fx-sync-secret');

  if (!expectedSecret || incomingSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({
        error: 'Unauthorized: missing or invalid x-fx-sync-secret header',
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    let body: { backfill?: boolean; days?: number } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is acceptable for cron triggers
    }

    const isBackfill = body.backfill === true;
    const recordsToUpsert: Array<{
      base: string;
      quote: string;
      rate_date: string;
      rate: number;
      source: string;
    }> = [];

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    for (const pair of PAIRS) {
      let url = `${FRANKFURTER_BASE_URL}/latest?base=${pair.base}&symbols=${pair.quote}`;

      if (isBackfill) {
        const oneYearAgo = new Date(today);
        oneYearAgo.setDate(oneYearAgo.getDate() - (body.days || 365));
        const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];
        url = `${FRANKFURTER_BASE_URL}/${oneYearAgoStr}..${todayStr}?base=${pair.base}&symbols=${pair.quote}`;
      }

      console.log(`[fx-sync] Fetching ${pair.base}/${pair.quote} from ${url}...`);
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'DavaoBank-FXSync/1.0',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[fx-sync] Frankfurter API error (${response.status}): ${errText}`);
        continue;
      }

      const data: FrankfurterResponse = await response.json();

      if (isBackfill && data.rates) {
        // Multi-date response: rates is { "YYYY-MM-DD": { "PHP": 58.95 } }
        for (const [dateStr, quoteObj] of Object.entries(data.rates)) {
          const rateVal =
            typeof quoteObj === 'object' && quoteObj !== null
              ? (quoteObj as Record<string, number>)[pair.quote]
              : Number(quoteObj);

          if (rateVal && !isNaN(rateVal) && rateVal > 0) {
            recordsToUpsert.push({
              base: pair.base,
              quote: pair.quote,
              rate_date: dateStr,
              rate: rateVal,
              source: 'Frankfurter / European Central Bank',
            });
          }
        }
      } else if (data.rates) {
        // Latest single date response: rates is { "PHP": 58.95 } and date is "YYYY-MM-DD"
        const rateVal = (data.rates as Record<string, number>)[pair.quote];
        const dateStr = data.date || todayStr;

        if (rateVal && !isNaN(rateVal) && rateVal > 0) {
          recordsToUpsert.push({
            base: pair.base,
            quote: pair.quote,
            rate_date: dateStr,
            rate: rateVal,
            source: 'Frankfurter / European Central Bank',
          });
        }
      }
    }

    if (recordsToUpsert.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No rate records retrieved from Frankfurter API',
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Call stored procedure public.upsert_fx_rates for atomic idempotent upsert
    const { data: upsertCount, error: upsertError } = await supabase.rpc(
      'upsert_fx_rates',
      { p_rates: recordsToUpsert }
    );

    if (upsertError) {
      console.error('[fx-sync] DB Upsert error:', upsertError);
      return new Response(
        JSON.stringify({ error: 'Database upsert failed', details: upsertError }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        upserted: upsertCount || recordsToUpsert.length,
        isBackfill,
        timestamp: new Date().toISOString(),
        attribution:
          'Source: ECB reference rates via Frankfurter (https://frankfurter.dev)',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[fx-sync] Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
