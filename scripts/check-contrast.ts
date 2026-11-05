import { colors } from '../packages/shared/src/theme/colors';

function luminance(hex: string) {
  const rgb = hex.match(/[a-f\d]{2}/gi)!.map((v) => {
    const n = parseInt(v, 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
const pairs: [keyof typeof colors, keyof typeof colors, number][] = [];
for (const foreground of [
  'ink',
  'textSecondary',
  'textMuted',
  'primary',
  'redText',
  'orangeText',
  'blueText',
] as const) {
  for (const background of ['surface', 'canvas', 'surfaceSubtle'] as const)
    pairs.push([foreground, background, 4.5]);
}
pairs.push(
  ['textInverse', 'primary', 4.5],
  ['textInverse', 'redText', 4.5],
  ['ink', 'yellow', 4.5]
);
let failures = 0;
for (const [fg, bg, minimum] of pairs) {
  const a = luminance(colors[fg]);
  const b = luminance(colors[bg]);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const pass = ratio >= minimum;
  if (!pass) failures++;
  console.log(
    `${pass ? 'PASS' : 'FAIL'} ${fg}/${bg}: ${ratio.toFixed(2)}:1 (requires ${minimum}:1)`
  );
}
console.log(
  `${pairs.length - failures}/${pairs.length} token pairs pass. Rendered screens still require device review.`
);
process.exitCode = failures ? 1 : 0;
