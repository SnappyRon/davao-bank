import React from 'react';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius,
  className,
  style,
}: SkeletonProps) {
  const customStyle: React.CSSProperties = {
    width,
    height,
    borderRadius,
    ...style,
  };

  return <div className={`${styles.skeleton} ${className || ''}`} style={customStyle} />;
}
