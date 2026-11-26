import React from 'react';
import styles from './FilterBar.module.css';

export interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

export function FilterBar({ children, className }: FilterBarProps) {
  return <div className={`${styles.filterBar} ${className || ''}`}>{children}</div>;
}
