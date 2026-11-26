import {
  ALLOWED_TARGETS,
  TARGET_GUARD_MESSAGE,
  DrillStep,
  guardDrillTarget,
  manilaTime,
  parseCommand,
  parseIntensity,
  parseSteps,
  runDrillSteps,
  safeError,
  statusLabel,
  transition,
} from '../lib/drill-core';

const [A, B] = ALLOWED_TARGETS;

describe('Bantay drill target guard', () => {
  it('accepts only the two literal test addresses', () => {
    expect(guardDrillTarget(A, A, B)).toEqual({ ok: true, target: A });
    expect(guardDrillTarget(B, A, B)).toEqual({ ok: true, target: B });
  });

  it.each([
    ['customer1@davaobank.ph', A, B],
    ['customer2@davaobank.ph', A, B],
    ['test-admin@davaobank.ph', A, B],
    ['billers@davaobank.ph', A, B],
    [A.toUpperCase(), A, B],
    ['', A, B],
    [undefined, A, B],
    [A, 'customer1@davaobank.ph', B],
    [A, A, 'customer2@davaobank.ph'],
  ])('refuses non-test or overridden target %#', (requested, resolvedA, resolvedB) => {
    expect(guardDrillTarget(requested, resolvedA, resolvedB)).toEqual({
      ok: false,
      reason: TARGET_GUARD_MESSAGE,
    });
  });
});

describe('Bantay drill input and state validation', () => {
  it('parses steps, intensity and commands inside fixed allow-lists', () => {
    expect(parseSteps(undefined)).toEqual({ ok: true, value: [1, 2, 3, 4, 5] });
    expect(parseSteps(['5', 2, 2])).toEqual({ ok: true, value: [2, 5] });
    expect(parseSteps([0, 6])).toEqual({
      ok: false,
      reason: 'Steps must be a subset of 1..5.',
    });
    expect(parseSteps([1, 'all'])).toEqual({
      ok: false,
      reason: 'Steps must be a subset of 1..5.',
    });
    expect(parseIntensity('minimal')).toEqual({ ok: true, value: 'minimal' });
    expect(parseIntensity('unlimited')).toEqual({
      ok: false,
      reason: 'Intensity must be Standard or Minimal.',
    });
    expect(parseCommand('stop')).toEqual({ ok: true, value: 'stop' });
    expect(parseCommand('delete-all')).toEqual({
      ok: false,
      reason: 'Unknown console command.',
    });
  });

  it('allows Start only when idle, stopped or not verified, and Stop/Reset from an active run', () => {
    expect(transition('idle', 'start')).toEqual({ ok: true, value: 'running' });
    expect(transition('stopped', 'start')).toEqual({ ok: true, value: 'running' });
    expect(transition('frozen', 'start').ok).toBe(false);
    expect(transition('running', 'pause')).toEqual({ ok: true, value: 'paused' });
    expect(transition('paused', 'resume')).toEqual({ ok: true, value: 'running' });
    expect(transition('paused', 'stop')).toEqual({ ok: true, value: 'stopped' });
    expect(transition('frozen', 'reset')).toEqual({ ok: true, value: 'resetting' });
    expect(statusLabel('running', 3)).toBe('Attacking step 3 of 5');
    expect(statusLabel('frozen')).toBe('frozen');
    expect(manilaTime(new Date('2026-11-26T05:00:00Z'))).toContain('PM');
  });

  it('never returns raw backend text in safe errors', () => {
    expect(safeError(new Error('permission denied for table security_cases'))).toBe(
      'Permission denied.'
    );
    expect(safeError('SECRET=abc123 Stack trace at /srv/key')).toBe(
      'Request failed. Details withheld.'
    );
    expect(safeError('NOT VERIFIED — deployment absent')).toContain('NOT VERIFIED');
  });
});

describe('Bantay drill step runner', () => {
  const makeStep = (
    id: number,
    run: jest.Mock<Promise<{ status: 'attempted'; detail: string }>, []>,
    requests = 1
  ): DrillStep => ({ id, name: `Step ${id}`, requests, run });

  const control = (overrides: Record<string, unknown> = {}) => {
    const abortController = new AbortController();
    return {
      signal: abortController.signal,
      abortController,
      isStopped: () => false,
      maxTotalRequests: 25,
      maxRequestsPerStep: 10,
      now: () => '1:00:00 PM',
      ...overrides,
    };
  };

  it('runs steps sequentially in fixed numeric order', async () => {
    const order: string[] = [];
    const steps = [
      makeStep(
        2,
        jest.fn(async () => {
          order.push('2-end');
          return { status: 'attempted', detail: 'ok' };
        })
      ),
      makeStep(
        1,
        jest.fn(async () => {
          order.push('1-end');
          return { status: 'attempted', detail: 'ok' };
        })
      ),
    ];
    const outcomes = await runDrillSteps(steps, {
      ...control(),
      onStepStart: (step) => order.push(`${step.id}-start`),
    });
    expect(order).toEqual(['1-start', '1-end', '2-start', '2-end']);
    expect(outcomes.status).toBe('completed');
    expect(outcomes.results.map((row) => row.id)).toEqual([1, 2]);
  });

  it('waits while paused and honours Resume before the next step', async () => {
    let paused = true;
    let release: () => void = () => {};
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const second = jest.fn(async () => ({
      status: 'attempted' as const,
      detail: 'second',
    }));
    const runs = runDrillSteps(
      [
        makeStep(
          1,
          jest.fn(async () => ({ status: 'attempted', detail: 'first' }))
        ),
        makeStep(2, second),
      ],
      {
        ...control({ isPaused: () => paused, waitForResume: () => waiting }),
      }
    );
    await Promise.resolve();
    expect(second).not.toHaveBeenCalled();
    paused = false;
    release();
    const summary = await runs;
    expect(second).toHaveBeenCalledTimes(1);
    expect(summary.status).toBe('completed');
  });

  it('stops on AbortController and runs no further step or request', async () => {
    const abortController = new AbortController();
    const second = jest.fn(async () => ({
      status: 'attempted' as const,
      detail: 'never',
    }));
    const summary = await runDrillSteps(
      [
        makeStep(
          1,
          jest.fn(async () => {
            abortController.abort();
            return { status: 'attempted', detail: 'first' };
          })
        ),
        makeStep(2, second),
      ],
      control({ signal: abortController.signal })
    );
    expect(second).not.toHaveBeenCalled();
    expect(summary.status).toBe('stopped');
    expect(summary.results).toHaveLength(1);
  });

  it('refuses to exceed per-step or total request caps', async () => {
    const perStep = await runDrillSteps(
      [
        makeStep(
          1,
          jest.fn(async () => ({ status: 'attempted', detail: 'no' })),
          11
        ),
      ],
      control({ maxRequestsPerStep: 10 })
    );
    expect(perStep.status).toBe('cap-exceeded');
    expect(perStep.requests).toBe(0);

    const total = await runDrillSteps(
      [
        makeStep(
          1,
          jest.fn(async () => ({ status: 'attempted', detail: 'yes' })),
          20
        ),
        makeStep(
          2,
          jest.fn(async () => ({ status: 'attempted', detail: 'no' })),
          6
        ),
      ],
      control({ maxTotalRequests: 25, maxRequestsPerStep: 25 })
    );
    expect(total.status).toBe('cap-exceeded');
    expect(total.requests).toBe(20);
  });

  it('records a safe error and stops the sequence when a mock step fails', async () => {
    const later = jest.fn(async () => ({
      status: 'attempted' as const,
      detail: 'never',
    }));
    const summary = await runDrillSteps(
      [
        makeStep(
          1,
          jest.fn(async () => {
            throw new Error('secret token abc');
          })
        ),
        makeStep(2, later),
      ],
      control()
    );
    expect(later).not.toHaveBeenCalled();
    expect(summary.status).toBe('error');
    expect(summary.results[0].detail).toBe('Request failed. Details withheld.');
  });
});
