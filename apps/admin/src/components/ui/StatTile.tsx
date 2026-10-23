import React from 'react';
import styles from './StatTile.module.css';

export interface StatTileProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  iconColor?: 'blue' | 'green' | 'orange' | 'red' | 'yellow';
}

export function StatTile({
  label,
  value,
  subtext,
  icon,
  iconColor = 'green',
}: StatTileProps) {
  const iconClass = styles[`icon-${iconColor}`] || styles['icon-green'];

  return (
    <div className={styles.tile}>
      <div className={styles.headerRow}>
        <span className={styles.label}>{label}</span>
        {icon ? <div className={`${styles.iconBadge} ${iconClass}`}>{icon}</div> : null}
      </div>
      <div className={`${styles.value} tabular-nums`}>{value}</div>
      {subtext ? <div className={styles.subtext}>{subtext}</div> : null}
    </div>
  );
}
