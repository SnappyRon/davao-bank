'use client';

import React from 'react';
import styles from './Table.module.css';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (item: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyState?: React.ReactNode;
  className?: string;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyState,
  className,
}: TableProps<T>) {
  if (data.length === 0 && emptyState) {
    return <div className={styles.tableContainer}>{emptyState}</div>;
  }

  return (
    <div className={`${styles.tableContainer} ${className || ''}`}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => {
              const alignClass =
                col.align === 'right'
                  ? styles.alignRight
                  : col.align === 'center'
                    ? styles.alignCenter
                    : '';

              return (
                <th key={col.key} className={`${alignClass} ${col.className || ''}`}>
                  {col.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {data.map((item, idx) => (
            <tr
              key={keyExtractor(item)}
              onClick={() => onRowClick && onRowClick(item)}
              className={onRowClick ? styles.clickable : ''}
            >
              {columns.map((col) => {
                const alignClass =
                  col.align === 'right'
                    ? styles.alignRight
                    : col.align === 'center'
                      ? styles.alignCenter
                      : '';

                return (
                  <td
                    key={col.key}
                    className={`${alignClass} ${col.align === 'right' ? 'tabular-nums' : ''} ${col.className || ''}`}
                  >
                    {col.render(item, idx)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
