'use client';

import React, { useState } from 'react';
import { colors, type AuditLog } from '@davao-bank/shared';

interface AuditClientProps {
  initialLogs: AuditLog[];
}

export function AuditClient({ initialLogs }: AuditClientProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Extract distinct actions for filter dropdown
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Search & Filter Bar */}
      <div
        style={{
          backgroundColor: colors.surface,
          borderRadius: '12px',
          border: `1px solid ${colors.border}`,
          padding: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ flex: '1 1 300px' }}>
          <input
            type="text"
            placeholder="Search by action, actor, entity ID, or metadata keywords..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.65rem 1rem',
              borderRadius: '8px',
              border: `1px solid ${colors.border}`,
              fontSize: '0.875rem',
              outline: 'none',
              backgroundColor: colors.background,
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Action Filter */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            style={{
              padding: '0.65rem 1rem',
              borderRadius: '8px',
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              fontSize: '0.85rem',
              fontWeight: 600,
              color: colors.textPrimary,
              cursor: 'pointer',
            }}
          >
            <option value="all">All Actions</option>
            {distinctActions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>

          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{
              padding: '0.65rem 1rem',
              borderRadius: '8px',
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surface,
              fontSize: '0.85rem',
              fontWeight: 600,
              color: colors.textPrimary,
              cursor: 'pointer',
            }}
          >
            <option value="all">All Actor Roles</option>
            <option value="admin">Admin</option>
            <option value="customer">Customer</option>
            <option value="system">System</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div
        style={{
          backgroundColor: colors.surface,
          borderRadius: '12px',
          border: `1px solid ${colors.border}`,
          overflowX: 'auto',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
            fontSize: '0.875rem',
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: colors.surfaceSubtle,
                borderBottom: `1px solid ${colors.border}`,
                color: colors.textSecondary,
                textTransform: 'uppercase',
                fontSize: '0.75rem',
                letterSpacing: '0.5px',
              }}
            >
              <th style={{ padding: '0.875rem 1.25rem' }}>Timestamp</th>
              <th style={{ padding: '0.875rem 1rem' }}>Action</th>
              <th style={{ padding: '0.875rem 1rem' }}>Actor</th>
              <th style={{ padding: '0.875rem 1rem' }}>Entity</th>
              <th style={{ padding: '0.875rem 1rem' }}>Entity ID</th>
              <th style={{ padding: '0.875rem 1.25rem', textAlign: 'right' }}>
                Metadata
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: '3rem',
                    textAlign: 'center',
                    color: colors.textMuted,
                  }}
                >
                  No audit log records found matching your filter criteria.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => {
                const isAdmin = log.actor_role === 'admin';

                return (
                  <tr
                    key={log.id}
                    style={{
                      borderBottom: `1px solid ${colors.border}`,
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = colors.background)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = 'transparent')
                    }
                  >
                    {/* Timestamp */}
                    <td
                      style={{
                        padding: '1rem 1.25rem',
                        color: colors.textSecondary,
                        fontSize: '0.8rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {new Date(log.created_at).toLocaleString('en-PH', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>

                    {/* Action */}
                    <td style={{ padding: '1rem' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          color: colors.textPrimary,
                          backgroundColor: colors.surfaceSubtle,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontFamily: 'monospace',
                        }}
                      >
                        {log.action}
                      </span>
                    </td>

                    {/* Actor Role & ID */}
                    <td style={{ padding: '1rem' }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                      >
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: isAdmin
                              ? colors.primaryLight
                              : colors.surfaceSubtle,
                            color: isAdmin ? colors.primary : colors.textSecondary,
                            textTransform: 'uppercase',
                          }}
                        >
                          {log.actor_role || 'system'}
                        </span>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            color: colors.textMuted,
                            fontFamily: 'monospace',
                          }}
                        >
                          {log.actor_id ? log.actor_id.substring(0, 8) + '...' : 'System'}
                        </span>
                      </div>
                    </td>

                    {/* Entity */}
                    <td
                      style={{
                        padding: '1rem',
                        color: colors.textSecondary,
                        textTransform: 'capitalize',
                      }}
                    >
                      {log.entity || '—'}
                    </td>

                    {/* Entity ID */}
                    <td
                      style={{
                        padding: '1rem',
                        color: colors.textMuted,
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                      }}
                    >
                      {log.entity_id ? log.entity_id.substring(0, 12) + '...' : '—'}
                    </td>

                    {/* Metadata Preview & Inspect Button */}
                    <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                      <button
                        onClick={() => setSelectedLog(log)}
                        style={{
                          backgroundColor: colors.surfaceSubtle,
                          border: `1px solid ${colors.border}`,
                          color: colors.primary,
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Inspect Payload
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: JSON Metadata Inspector */}
      {selectedLog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: colors.surface,
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: colors.textPrimary,
                }}
              >
                Audit Log Payload
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                  color: colors.textMuted,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                backgroundColor: colors.background,
                padding: '1rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.5rem',
              }}
            >
              <div>
                <span style={{ color: colors.textMuted }}>Action:</span>{' '}
                <strong style={{ fontFamily: 'monospace' }}>{selectedLog.action}</strong>
              </div>
              <div>
                <span style={{ color: colors.textMuted }}>Actor Role:</span>{' '}
                <strong style={{ textTransform: 'uppercase' }}>
                  {selectedLog.actor_role}
                </strong>
              </div>
              <div>
                <span style={{ color: colors.textMuted }}>Entity:</span>{' '}
                <strong>{selectedLog.entity}</strong>
              </div>
              <div>
                <span style={{ color: colors.textMuted }}>Log ID:</span>{' '}
                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  {selectedLog.id}
                </span>
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: colors.textPrimary,
                  textTransform: 'uppercase',
                  marginBottom: '0.4rem',
                }}
              >
                Immutable Metadata JSON:
              </div>
              <pre
                style={{
                  backgroundColor: '#1E293B',
                  color: '#F8FAFC',
                  padding: '1rem',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                  overflowX: 'auto',
                  maxHeight: '260px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {JSON.stringify(selectedLog.metadata, null, 2)}
              </pre>
            </div>

            <div
              style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}
            >
              <button
                onClick={() => setSelectedLog(null)}
                style={{
                  padding: '0.6rem 1.25rem',
                  borderRadius: '8px',
                  border: `1px solid ${colors.border}`,
                  backgroundColor: colors.surfaceSubtle,
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
