import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type CopyRule = 'uppercase-copy' | 'php-currency' | 'exclamation-mark' | 'raw-uuid';

interface AllowlistEntry {
  file: string;
  rule: CopyRule;
  match: string;
  reason: string;
}

interface CopyViolation {
  file: string;
  line: number;
  column: number;
  rule: CopyRule;
  message: string;
  snippet: string;
}

interface ScanSourceResult {
  violations: CopyViolation[];
  allowlistedCount: number;
}

const SCRIPT_PATH = path.resolve(__dirname, '../../../../scripts/check-copy.mjs');
const ALLOWLIST_PATH = path.resolve(
  __dirname,
  '../../../../scripts/check-copy.allow.json'
);
const SCRIPT_URL = pathToFileURL(SCRIPT_PATH).href;

/**
 * Jest runs inside a Node vm context without `--experimental-vm-modules`, so we
 * execute `scripts/check-copy.mjs` in native Node ESM via `process.execPath`.
 */
function scanFixture(
  sourceText: string,
  filePath: string,
  allowlist: AllowlistEntry[] = []
): ScanSourceResult {
  const runner = `
    import { scanSource } from ${JSON.stringify(SCRIPT_URL)};
    const payload = JSON.parse(process.env.CHECK_COPY_PAYLOAD);
    const out = scanSource(payload.sourceText, payload.filePath, {
      allowlist: payload.allowlist,
    });
    process.stdout.write(JSON.stringify({
      violations: out.violations,
      allowlistedCount: out.allowlistedCount,
    }));
  `;
  const proc = spawnSync(process.execPath, ['--input-type=module', '-e', runner], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CHECK_COPY_PAYLOAD: JSON.stringify({ sourceText, filePath, allowlist }),
    },
  });
  if (proc.status !== 0) {
    throw new Error(`scanFixture failed: ${proc.stderr || proc.stdout}`);
  }
  return JSON.parse(proc.stdout) as ScanSourceResult;
}

function runValidateAllowlist(entries: unknown): { ok: boolean; error?: string } {
  const runner = `
    import { validateAllowlist } from ${JSON.stringify(SCRIPT_URL)};
    try {
      validateAllowlist(JSON.parse(process.env.CHECK_COPY_ALLOW));
      process.stdout.write(JSON.stringify({ ok: true }));
    } catch (err) {
      process.stdout.write(JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  `;
  const proc = spawnSync(process.execPath, ['--input-type=module', '-e', runner], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CHECK_COPY_ALLOW: JSON.stringify(entries),
    },
  });
  if (proc.status !== 0) {
    throw new Error(`validateAllowlist runner failed: ${proc.stderr}`);
  }
  return JSON.parse(proc.stdout) as { ok: boolean; error?: string };
}

describe('check-copy scanner (Stage 7B.8)', () => {
  it('passes clean sentence-case copy, formatted references, and non-UI syntax', () => {
    const cleanFixture = `
      import React from 'react';
      import { formatReferenceId } from '@davao-bank/shared';

      type CurrencyPair = 'USD/PHP' | 'PHP ';

      function sentenceCase(value: string) {
        return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
      }

      export function CleanReceipt({ tx, method }: { tx: { id: string; status: string }; method: string }) {
        if (method.toUpperCase() === 'POST') {
          console.log('PHP 500.00 debug!', tx.id);
        }
        const html = \`<!DOCTYPE html><html><body><p>Statement ready</p></body></html>\`;
        return (
          <div data-testid={tx.id}>
            <span title={tx.id}>{formatReferenceId(tx.id)}</span>
            <p>{sentenceCase(tx.status)} · You sent ₱500.00 to •• 7943.</p>
            <p>{html.slice(0, 0)}</p>
          </div>
        );
      }
    `;

    const result = scanFixture(cleanFixture, 'apps/mobile/src/screens/CleanReceipt.tsx');
    expect(result.violations).toEqual([]);
  });

  it('flags .toUpperCase() and .toLocaleUpperCase() applied to UI copy', () => {
    const fixture = `
      import React from 'react';
      export function BadBadges({ status, type }: { status: string; type: string }) {
        return (
          <View>
            <Badge label={status.toUpperCase()} />
            <Text>{type.toLocaleUpperCase('en-US')}</Text>
          </View>
        );
      }
    `;

    const { violations } = scanFixture(fixture, 'apps/mobile/src/screens/BadBadges.tsx');
    expect(violations).toHaveLength(2);
    expect(violations[0].rule).toBe('uppercase-copy');
    expect(violations[0].snippet).toContain('status.toUpperCase()');
    expect(violations[1].rule).toBe('uppercase-copy');
    expect(violations[1].snippet).toContain("type.toLocaleUpperCase('en-US')");
  });

  it("flags 'PHP ' currency strings in user-facing copy", () => {
    const fixture = `
      import React from 'react';
      export function BadCurrency() {
        const notice = 'Minimum transfer is PHP 100.00.';
        return <Text>You sent PHP 500.00. {notice}</Text>;
      }
    `;

    const { violations } = scanFixture(
      fixture,
      'apps/mobile/src/screens/BadCurrency.tsx'
    );
    expect(violations.map((v) => v.rule)).toEqual(['php-currency', 'php-currency']);
  });

  it('flags exclamation marks in user-facing strings and props', () => {
    const fixture = `
      import React from 'react';
      export function BadExclamations({ name }: { name: string }) {
        const msg = \`Welcome back, \${name}!\`;
        return (
          <View>
            <Text>Request sent!</Text>
            <Button title="Try again!" onPress={() => {}} />
            <Text>{msg}</Text>
          </View>
        );
      }
    `;

    const { violations } = scanFixture(
      fixture,
      'apps/mobile/src/screens/BadExclamations.tsx'
    );
    expect(violations.map((v) => v.rule)).toEqual([
      'exclamation-mark',
      'exclamation-mark',
      'exclamation-mark',
    ]);
  });

  it('flags literal and dynamic raw UUIDs not passed through formatReferenceId', () => {
    const fixture = `
      import React from 'react';
      export function BadUuids({ tx }: { tx: { id: string; transaction_id: string } }) {
        const concat = 'Ref: ' + tx.id;
        return (
          <View>
            <Text>ID: 8f043910-1234-4567-8901-123456789012</Text>
            <Text>{tx.transaction_id.slice(0, 8)}...</Text>
            <ConfirmDialog description={\`Reverse transfer \${tx.id}?\`} />
            <Text>{concat}</Text>
          </View>
        );
      }
    `;

    const { violations } = scanFixture(fixture, 'apps/mobile/src/screens/BadUuids.tsx');
    expect(violations).toHaveLength(4);
    expect(violations.every((v) => v.rule === 'raw-uuid')).toBe(true);
  });

  it('supports allowlist entries with reasons and rejects entries missing a reason', () => {
    const fixture = `
      import React from 'react';
      export function EyebrowAndBadStatus({ section, status }: { section: string; status: string }) {
        return (
          <View>
            <Text>{section.toLocaleUpperCase('en-US')}</Text>
            <Badge label={status.toUpperCase()} />
          </View>
        );
      }
    `;

    const allowlist: AllowlistEntry[] = [
      {
        file: 'apps/mobile/src/screens/ActivityScreen.tsx',
        rule: 'uppercase-copy',
        match: 'section.toLocaleUpperCase',
        reason: 'Spec 7B.7 allows uppercase on small section eyebrows.',
      },
    ];

    const res = scanFixture(
      fixture,
      'apps/mobile/src/screens/ActivityScreen.tsx',
      allowlist
    );
    expect(res.allowlistedCount).toBe(1);
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0].snippet).toBe('status.toUpperCase()');

    const badAllow = runValidateAllowlist([
      {
        file: 'apps/mobile/src/screens/ActivityScreen.tsx',
        rule: 'uppercase-copy',
        match: 'section.toLocaleUpperCase',
        reason: '',
      },
    ]);
    expect(badAllow.ok).toBe(false);
    expect(badAllow.error).toMatch(/reason/);

    const repoAllowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8')) as unknown;
    expect(runValidateAllowlist(repoAllowlist)).toEqual({ ok: true });
  });

  it('scans a workspace directory via CLI and exits non-zero on violations, zero when clean', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'davao-copy-check-'));
    try {
      const mobileDir = path.join(tmpRoot, 'apps/mobile/src');
      const adminDir = path.join(tmpRoot, 'apps/admin/src');
      const scriptsDir = path.join(tmpRoot, 'scripts');
      fs.mkdirSync(mobileDir, { recursive: true });
      fs.mkdirSync(adminDir, { recursive: true });
      fs.mkdirSync(scriptsDir, { recursive: true });

      const allowPath = path.join(scriptsDir, 'check-copy.allow.json');
      fs.writeFileSync(allowPath, '[]\n', 'utf8');

      const mobileFile = path.join(mobileDir, 'TransferScreen.tsx');
      fs.writeFileSync(
        mobileFile,
        `export function S() { return <Text>Sent PHP 200.00!</Text>; }\n`,
        'utf8'
      );
      const adminFile = path.join(adminDir, 'Page.tsx');
      fs.writeFileSync(
        adminFile,
        `export function P() { return <span>All good · ₱200.00</span>; }\n`,
        'utf8'
      );

      const failRun = spawnSync(
        process.execPath,
        [SCRIPT_PATH, '--root', tmpRoot, '--allowlist', allowPath],
        { encoding: 'utf8' }
      );
      expect(failRun.status).toBe(1);
      expect(failRun.stdout).toContain('[php-currency]');
      expect(failRun.stdout).toContain('[exclamation-mark]');

      fs.writeFileSync(
        mobileFile,
        `export function S() { return <Text>Sent ₱200.00.</Text>; }\n`,
        'utf8'
      );
      const passRun = spawnSync(
        process.execPath,
        [SCRIPT_PATH, '--root', tmpRoot, '--allowlist', allowPath],
        { encoding: 'utf8' }
      );
      expect(passRun.status).toBe(0);
      expect(passRun.stdout).toContain('PASS Copy audit clean across 2 files');
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('warns about unused allowlist entries and exits non-zero for stale entries', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'davao-copy-allow-'));
    try {
      const mobileDir = path.join(tmpRoot, 'apps/mobile/src');
      const scriptsDir = path.join(tmpRoot, 'scripts');
      fs.mkdirSync(mobileDir, { recursive: true });
      fs.mkdirSync(scriptsDir, { recursive: true });

      fs.writeFileSync(
        path.join(mobileDir, 'CleanScreen.tsx'),
        `export function S() { return <Text>Sent ₱200.00.</Text>; }\n`,
        'utf8'
      );
      const allowPath = path.join(scriptsDir, 'check-copy.allow.json');
      fs.writeFileSync(
        allowPath,
        JSON.stringify(
          [
            {
              file: 'apps/mobile/src/CleanScreen.tsx',
              rule: 'uppercase-copy',
              match: 'status.toUpperCase()',
              reason: 'Stale justification retained after the copy was fixed.',
            },
          ],
          null,
          2
        ),
        'utf8'
      );

      const staleRun = spawnSync(
        process.execPath,
        [SCRIPT_PATH, '--root', tmpRoot, '--allowlist', allowPath],
        { encoding: 'utf8' }
      );
      expect(staleRun.status).toBe(1);
      expect(staleRun.stdout).toContain(
        'WARN unused allowlist entry: apps/mobile/src/CleanScreen.tsx uppercase-copy status.toUpperCase()'
      );
      expect(staleRun.stdout).toContain('1 unused allowlist entry(ies)');

      fs.writeFileSync(allowPath, '[]\n', 'utf8');
      const cleanRun = spawnSync(
        process.execPath,
        [SCRIPT_PATH, '--root', tmpRoot, '--allowlist', allowPath],
        { encoding: 'utf8' }
      );
      expect(cleanRun.status).toBe(0);
      expect(cleanRun.stdout).not.toContain('WARN unused allowlist entry');
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
