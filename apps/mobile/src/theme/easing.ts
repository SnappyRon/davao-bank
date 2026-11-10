import { Easing } from 'react-native-reanimated';
import { motion } from '@davao-bank/shared';

type EasingName = keyof typeof motion.easing;

/** Parses a `cubic-bezier(x1, y1, x2, y2)` token into its four numbers. */
function bezierPoints(token: string): [number, number, number, number] {
  const match = /cubic-bezier\(([^)]+)\)/.exec(token);
  const points = match ? match[1].split(',').map((n) => Number(n.trim())) : [];
  if (points.length !== 4 || points.some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid easing token: ${token}`);
  }
  return points as [number, number, number, number];
}

function fromToken(name: EasingName) {
  const [x1, y1, x2, y2] = bezierPoints(motion.easing[name]);
  return Easing.bezier(x1, y1, x2, y2);
}

/**
 * Reanimated easing curves built from the shared `motion.easing` tokens, so the
 * mobile app and the admin CSS use the same numbers.
 */
export const easing = {
  standard: fromToken('standard'),
  enter: fromToken('enter'),
  exit: fromToken('exit'),
} as const;
