import React from 'react';
import styles from './Card.module.css';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'subtle';
  interactive?: boolean;
}

export function Card({
  children,
  variant = 'default',
  interactive = false,
  className,
  ...rest
}: CardProps) {
  const classNames = [
    styles.card,
    variant === 'subtle' ? styles.subtle : '',
    interactive ? styles.interactive : '',
    className || '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classNames} {...rest}>
      {children}
    </div>
  );
}
