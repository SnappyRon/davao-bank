import { NextResponse } from 'next/server';
import { createAdminCookieServerClient } from '@/lib/supabase-cookies';

export async function GET() {
  try {
    const supabase = await createAdminCookieServerClient();

    // Verify admin
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.role !== 'admin') {
      return new NextResponse('Forbidden: Admin access required', { status: 403 });
    }

    // Fetch transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('id, type, status, initiated_by, reference, idempotency_key, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return new NextResponse(`Error querying transactions: ${error.message}`, {
        status: 500,
      });
    }

    // Fetch all ledger entries to map amounts
    const { data: ledgerEntries } = await supabase
      .from('ledger_entries')
      .select('transaction_id, direction, amount');

    const amountMap: Record<string, number> = {};
    for (const entry of ledgerEntries || []) {
      // Pick positive volume (credit for deposit/transfer) or debit for withdrawal
      if (!amountMap[entry.transaction_id]) {
        amountMap[entry.transaction_id] = Number(entry.amount);
      }
    }

    // Build CSV Content
    const headers = [
      'Transaction ID',
      'Type',
      'Status',
      'Amount (PHP)',
      'Reference',
      'Initiated By',
      'Created At',
    ];

    const escapeCsv = (str: string | null | undefined) => {
      if (!str) return '""';
      const clean = str.replace(/"/g, '""');
      return `"${clean}"`;
    };

    const rows = (transactions || []).map((tx) => {
      const centavos = amountMap[tx.id] || 0;
      const php = (centavos / 100).toFixed(2);
      return [
        escapeCsv(tx.id),
        escapeCsv(tx.type),
        escapeCsv(tx.status),
        escapeCsv(php),
        escapeCsv(tx.reference),
        escapeCsv(tx.initiated_by),
        escapeCsv(new Date(tx.created_at).toISOString()),
      ].join(',');
    });

    const csvData = [headers.join(','), ...rows].join('\n');

    return new Response(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="davao-bank-transactions-${Date.now()}.csv"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Export failed: ${message}`, { status: 500 });
  }
}
