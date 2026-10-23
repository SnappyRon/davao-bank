'use client';

import React, { useState } from 'react';
import { Eye, Code } from 'lucide-react';
import { type AuditLog } from '@davao-bank/shared';
import {
  Table,
  FilterBar,
  Input,
  Select,
  Badge,
  Button,
  Drawer,
  Card,
} from '@/components/ui';

interface AuditClientProps {
  initialLogs: AuditLog[];
}

export function AuditClient({ initialLogs }: AuditClientProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const distinctActions = Array.from(new Set(initialLogs.map((l) => l.action))).sort();

  const filteredLogs = initialLogs.filter((log) => {
    const metaStr = log.metadata ? JSON.stringify(log.metadata).toLowerCase() : '';
    const matchesSearch =
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.entity || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.entity_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.actor_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      metaStr.includes(searchTerm.toLowerCase());

    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    const matchesRole =
      roleFilter === 'all' || (log.actor_role || 'system') === roleFilter;

    return matchesSearch && matchesAction && matchesRole;
  });

  const columns = [
    {
      key: 'action',
      header: 'Action',
      render: (log: AuditLog) => (
        <span
          style={{
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8125rem',
          }}
        >
          {log.action}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor & Role',
      render: (log: AuditLog) => (
        <div>
          <Badge
            label={log.actor_role || 'system'}
            variant={log.actor_role === 'admin' ? 'info' : 'neutral'}
          />
          {log.actor_id ? (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                color: 'var(--color-text-muted)',
                marginTop: 2,
              }}
            >
              {log.actor_id.substring(0, 8)}...
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'entity',
      header: 'Entity / Target',
      render: (log: AuditLog) => (
        <div>
          <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>
            {log.entity || 'General'}
          </div>
          {log.entity_id ? (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                color: 'var(--color-text-muted)',
              }}
            >
              {log.entity_id.substring(0, 8)}...
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'created_at',
      header: 'Timestamp',
      align: 'right' as const,
      render: (log: AuditLog) => (
        <span className="tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
          {new Date(log.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Payload',
      align: 'right' as const,
      render: (log: AuditLog) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSelectedLog(log)}
          icon={<Code size={14} />}
        >
          JSON
        </Button>
      ),
    },
  ];

  return (
    <>
      <FilterBar>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Input
            placeholder="Search action, actor, entity ID, metadata..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div style={{ width: 180 }}>
          <Select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Actions' },
              ...distinctActions.map((a) => ({ value: a, label: a })),
            ]}
          />
        </div>

        <div style={{ width: 140 }}>
          <Select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Roles' },
              { value: 'admin', label: 'Admin Only' },
              { value: 'customer', label: 'Customer Only' },
              { value: 'system', label: 'System Only' },
            ]}
          />
        </div>
      </FilterBar>

      <Table
        columns={columns}
        data={filteredLogs}
        keyExtractor={(l) => l.id}
        onRowClick={(l) => setSelectedLog(l)}
      />

      {/* JSON Payload Drawer */}
      <Drawer
        isOpen={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title="Audit Log Payload"
      >
        {selectedLog && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}
          >
            <Card variant="subtle">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--space-sm)',
                  fontSize: '0.875rem',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    ACTION
                  </div>
                  <strong style={{ fontFamily: 'var(--font-mono)' }}>
                    {selectedLog.action}
                  </strong>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    ACTOR ROLE
                  </div>
                  <strong style={{ textTransform: 'uppercase' }}>
                    {selectedLog.actor_role}
                  </strong>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    ENTITY
                  </div>
                  <strong>{selectedLog.entity}</strong>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    TIMESTAMP
                  </div>
                  <span className="tabular-nums">
                    {new Date(selectedLog.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            </Card>

            <div>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  marginBottom: 'var(--space-xs)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                Immutable Metadata JSON:
              </div>
              <pre
                style={{
                  backgroundColor: 'var(--color-surface-subtle)',
                  color: 'var(--color-ink)',
                  border: '1px solid var(--color-border)',
                  padding: 'var(--space-md)',
                  borderRadius: 'var(--radius-md)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8125rem',
                  overflowX: 'auto',
                  maxHeight: '360px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {selectedLog.metadata
                  ? JSON.stringify(selectedLog.metadata, null, 2)
                  : '// No additional metadata payload'}
              </pre>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
