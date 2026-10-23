import type { Metadata } from 'next';
import React from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Davao Bank Admin — Management & Staff Portal',
  description:
    'Administrative portal for Davao Bank prototype — simulated mobile banking system rooted in Davao City culture.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
