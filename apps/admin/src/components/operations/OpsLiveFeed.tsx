'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createAdminBrowserClient } from '@/lib/supabase-browser';
import {
  FEED_KIND_LABELS,
  formatMoney,
  formatTime,
  maskAccount,
  sentence,
  toNumber,
  type OpsFeedEvent,
  type WidgetState,
} from '@/lib/operations';
import { OpsCard, OpsEmpty, OpsError, OpsLink } from './OpsPrimitives';
import styles from './OperationsDashboard.module.css';

type FeedConnection =
  'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'denied';

const FEED_LIMIT = 200;
const VISIBLE_ROWS = 10;
const MAX_PAGES = 20;
const REFRESH_MS = 60_000;

function eventOrder(event: OpsFeedEvent): number {
  const time = new Date(event.occurred_at).getTime();
  return Number.isFinite(time) ? time : 0;
}

function mergeEvents(current: OpsFeedEvent[], incoming: OpsFeedEvent[]): OpsFeedEvent[] {
  const byId = new Map(current.map((event) => [String(event.id), event]));
  for (const event of incoming) byId.set(String(event.id), event);
  return Array.from(byId.values())
    .sort((a, b) => eventOrder(b) - eventOrder(a) || toNumber(b.id) - toNumber(a.id))
    .slice(0, VISIBLE_ROWS);
}

function lastFourFrom(event: OpsFeedEvent): string | null {
  const payload = event.payload as {
    account_last4?: unknown;
    account?: unknown;
    accountNumber?: unknown;
  } | null;
  const value = payload?.account_last4 ?? payload?.account ?? payload?.accountNumber;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const digits = String(value).replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

interface OpsLiveFeedProps {
  onActivity?: () => void;
}

export function OpsLiveFeed({ onActivity }: OpsLiveFeedProps) {
  const supabase = useMemo(() => createAdminBrowserClient(), []);
  const [state, setState] = useState<WidgetState<OpsFeedEvent[]>>({
    status: 'loading',
    data: null,
    error: null,
  });
  const [events, setEvents] = useState<OpsFeedEvent[]>([]);
  const [connection, setConnection] = useState<FeedConnection>('connecting');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const eventsRef = useRef<OpsFeedEvent[]>([]);
  const lastIdRef = useRef(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const listener = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener?.('change', listener);
    return () => query.removeEventListener?.('change', listener);
  }, []);

  const fetchFrom = useCallback(
    async (afterId: number, replace: boolean) => {
      const collected: OpsFeedEvent[] = [];
      let cursor = afterId;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const { data, error } = await supabase.rpc('admin_ops_live_feed', {
          p_after_id: cursor,
          p_limit: FEED_LIMIT,
        });
        if (error) throw error;
        const rows = (Array.isArray(data) ? data : []) as OpsFeedEvent[];
        collected.push(...rows);
        if (rows.length === 0 || rows.length < FEED_LIMIT) break;
        cursor = toNumber(rows[rows.length - 1].id);
      }
      const merged = mergeEvents(replace ? [] : eventsRef.current, collected);
      eventsRef.current = merged;
      setEvents(merged);
      setState({ status: merged.length ? 'ready' : 'empty', data: merged, error: null });
      const highest = collected.reduce(
        (max, event) => Math.max(max, toNumber(event.id)),
        cursor
      );
      lastIdRef.current = Math.max(lastIdRef.current, highest);
      setLastUpdated(new Date());
      return merged;
    },
    [supabase]
  );

  const ingest = useCallback((event: OpsFeedEvent) => {
    const merged = mergeEvents(eventsRef.current, [event]);
    eventsRef.current = merged;
    setEvents(merged);
    setState({ status: merged.length ? 'ready' : 'empty', data: merged, error: null });
    lastIdRef.current = Math.max(lastIdRef.current, toNumber(event.id));
    setLastUpdated(new Date());
  }, []);

  const connect = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || data?.currentLevel !== 'aal2') {
      setConnection('denied');
      return;
    }
    const channel = supabase
      .channel('admin-ops-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'staff_activity_events' },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            ingest(payload.new as OpsFeedEvent);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('connected');
          void fetchFrom(lastIdRef.current, false).catch(() => undefined);
          onActivityRef.current?.();
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          return;
        }
        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          setConnection('reconnecting');
          retryTimerRef.current = setTimeout(() => setConnection('disconnected'), 8000);
          return;
        }
        if (status === 'CLOSED') setConnection('disconnected');
      });
    channelRef.current = channel;
  }, [fetchFrom, ingest, supabase]);

  const load = useCallback(async () => {
    setState((previous) => ({ ...previous, status: 'loading', error: null }));
    try {
      await fetchFrom(0, true);
      await connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Feed unavailable';
      setState({ status: 'error', data: null, error: message });
      setConnection('disconnected');
    }
  }, [connect, fetchFrom]);

  useEffect(() => {
    void load();
    const onOffline = () => setConnection('disconnected');
    const onOnline = () => {
      setConnection('reconnecting');
      void fetchFrom(lastIdRef.current, false)
        .then(() => onActivityRef.current?.())
        .catch(() => undefined);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('offline', onOffline);
      window.addEventListener('online', onOnline);
    }
    const interval = setInterval(() => {
      void fetchFrom(lastIdRef.current, false)
        .then(() => onActivityRef.current?.())
        .catch(() => setConnection('disconnected'));
    }, REFRESH_MS);
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (typeof window !== 'undefined') {
        window.removeEventListener('offline', onOffline);
        window.removeEventListener('online', onOnline);
      }
      clearInterval(interval);
      channelRef.current?.unsubscribe();
      channelRef.current = null;
    };
  }, [fetchFrom, load]);

  const statusCopy: Record<FeedConnection, string> = {
    connecting: 'Connecting to the live feed…',
    connected: lastUpdated
      ? `Last updated ${formatTime(lastUpdated.toISOString())}`
      : 'Last updated',
    reconnecting: 'Reconnecting…',
    disconnected: "You're offline — the feed will refresh when you're back",
    denied: 'AAL2 denied — sign in again',
  };

  return (
    <OpsCard
      title="Live transaction feed"
      description="Ten newest sanitized events from real bank activity"
      action={<OpsLink href="/transactions">View all</OpsLink>}
      className={styles.feedCard}
    >
      <p className={styles.feedStatus} role="status" aria-live="polite">
        {statusCopy[connection]}
        {connection === 'denied' ? (
          <>
            {' '}
            <OpsLink href="/login">Staff sign in</OpsLink>
          </>
        ) : null}
      </p>

      {connection === 'denied' ? (
        <OpsEmpty message="Live data needs a verified staff session." />
      ) : null}
      {connection !== 'denied' && state.status === 'loading' ? (
        <ul className={styles.feedList} aria-label="Loading live transactions">
          {Array.from({ length: 5 }).map((_, index) => (
            <li key={index} className={styles.feedSkeleton} aria-hidden="true" />
          ))}
        </ul>
      ) : null}
      {connection !== 'denied' && state.status === 'error' ? (
        <OpsError
          message="The live feed could not be loaded."
          onRetry={() => void load()}
        />
      ) : null}
      {connection !== 'denied' &&
      (state.status === 'ready' || state.status === 'empty') &&
      events.length === 0 ? (
        <OpsEmpty message="No activity yet. The feed updates when real events arrive." />
      ) : null}
      {connection !== 'denied' && events.length > 0 ? (
        <ul className={styles.feedList} aria-live="polite" aria-relevant="additions text">
          {events.map((event) => {
            const payload = (event.payload || {}) as Record<string, unknown>;
            const last4 = lastFourFrom(event);
            const incoming =
              payload.direction === 'credit' ||
              (event.kind === 'transaction' && payload.category === 'deposit');
            const rawAmount = event.amount_centavos;
            const amount = toNumber(rawAmount);
            const status = typeof payload.status === 'string' ? payload.status : null;
            return (
              <li
                key={String(event.id)}
                className={`${styles.feedRow} ${reducedMotion ? '' : styles.newRow}`}
              >
                <span className={styles.feedTime}>{formatTime(event.occurred_at)}</span>
                <span
                  className={`${styles.feedDirection} ${incoming ? styles.incoming : styles.outgoing}`}
                >
                  <span aria-hidden="true">{incoming ? '↓' : '↑'}</span>{' '}
                  {incoming ? 'In' : 'Out'}
                </span>
                <span className={styles.feedMeta}>
                  {FEED_KIND_LABELS[event.kind] || sentence(event.kind)} ·{' '}
                  {sentence(event.label)}
                  {status ? ` · ${sentence(status)}` : ''}
                </span>
                <span
                  className={styles.feedAccount}
                  title={
                    last4
                      ? undefined
                      : 'Account details are not published in the live feed'
                  }
                >
                  {last4 ? maskAccount(last4) : '•• ----'}
                </span>
                <span className={`${styles.feedAmount} tabular-nums`}>
                  {rawAmount !== null && rawAmount !== undefined && amount > 0
                    ? formatMoney(amount)
                    : '—'}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </OpsCard>
  );
}
