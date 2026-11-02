'use client';

import React, { useState } from 'react';
import { Code } from 'lucide-react';
import { AuditLog } from '@davao-bank/shared';
import {
  Table,
  Button,
  Badge,
  Drawer,
  Card,
  Input,
  Select,
  FilterBar,
} from '@/components/ui';
import styles from './Audit.module.css';

interface AuditClientProps {
  initialLogs: AuditLog[];
}

export function AuditClient({ initialLogs }: AuditClientProps) {
  const [logs] = useState<AuditLog[]>(initialLogs);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Selected JSON payload drawer
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Derive distinct actions
  const distinctActions = Array.from(new Set(logs.map((l) => l.action))).sort();

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      log.action.toLowerCase().includes(term) ||
      (log.entity && log.entity.toLowerCase().includes(term)) ||
      (log.entity_id && log.entity_id.toLowerCase().includes(term)) ||
      (log.actor_id && log.actor_id.toLowerCase().includes(term)) ||
      (log.metadata && JSON.stringify(log.metadata).toLowerCase().includes(term));

    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    const matchesRole =
      roleFilter === 'all' || (log.actor_role || 'system') === roleFilter;

    return matchesSearch && matchesAction && matchesRole;
  });

  const columns = [
    {
      key: 'action',
      header: 'Action',
      render: (log: AuditLog) => <span className={styles.actionText}>{log.action}</span>,
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
            <div className={styles.monoMutedSmall}>{log.actor_id.substring(0, 8)}...</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'entity',
      header: 'Entity / Target',
      render: (log: AuditLog) => (
        <div>
          <div className={styles.entityText}>{log.entity || 'General'}</div>
          {log.entity_id ? (
            <div className={styles.monoMutedSmall}>
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
        <span className={`${styles.timestamp} tabular-nums`}>
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
        <div className={styles.filterSearch}>
          <Input
            placeholder="Search action, actor, entity ID, metadata..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className={styles.filterSelectEntity}>
          <Select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Actions' },
              ...distinctActions.map((a) => ({ value: a, label: a })),
            ]}
          />
        </div>

        <div className={styles.filterSelectRole}>
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
          <div className={styles.drawerStack}>
            <Card variant="subtle">
              <div className={styles.metaGrid}>
                <div>
                  <div className={styles.metaLabel}>ACTION</div>
                  <strong className={styles.metaMono}>{selectedLog.action}</strong>
                </div>
                <div>
                  <div className={styles.metaLabel}>ACTOR ROLE</div>
                  <strong className={styles.metaRole}>{selectedLog.actor_role}</strong>
                </div>
                <div>
                  <div className={styles.metaLabel}>ENTITY</div>
                  <strong>{selectedLog.entity}</strong>
                </div>
                <div>
                  <div className={styles.metaLabel}>TIMESTAMP</div>
                  <span className="tabular-nums">
                    {new Date(selectedLog.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            </Card>

            <div>
              <div className={styles.jsonHeader}>Immutable Metadata JSON:</div>
              <pre className={styles.jsonPre}>
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
