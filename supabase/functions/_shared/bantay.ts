/**
 * Deno-side barrel for Stage 8E.
 *
 * The shared modules have no imports of their own so they can be loaded directly
 * by the Supabase Edge runtime without sloppy-import flags.
 */
export {
  BANTAY_EVENT_KINDS,
  buildMaskedFacts,
  type BantaySecurityEvent,
} from '../../../packages/shared/src/bantay/facts.ts';
export { bantayTemplate } from '../../../packages/shared/src/bantay/templates.ts';
export {
  BANTAY_SYSTEM_PROMPT,
  GEMINI_API_URL,
  GEMINI_MODEL_ID,
  GEMINI_TIMEOUT_MS,
  explainBantayEvent,
} from '../../../packages/shared/src/bantay/gemini.ts';
