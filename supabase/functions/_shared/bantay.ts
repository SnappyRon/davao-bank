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
  extractGeminiText,
  isSafeExplanation,
  isValidExplanationForFacts,
} from '../../../packages/shared/src/bantay/gemini.ts';
export {
  BANTAY_CHAT_ACTION_IDS,
  BANTAY_CHAT_SYSTEM_PROMPT,
  isBantayChatActionId,
} from '../../../packages/shared/src/bantay/chatConfig.ts';
export {
  buildChatMaskedContext,
  NEUTRAL_CHAT_FACTS,
} from '../../../packages/shared/src/bantay/chatContext.ts';
export {
  BANTAY_CHAT_ARTICLES,
  chatArticleText,
  createChatArticleCache,
  findChatArticle,
} from '../../../packages/shared/src/bantay/chatHelp.ts';
export {
  checkChatMessage,
  checkChatSessionId,
  detectChatLanguage,
  detectChatPreRefusal,
  redactChatMessage,
} from '../../../packages/shared/src/bantay/chatRedact.ts';
export {
  handleBantayChat,
  type BantayChatDeps,
  type BantayChatResult,
  type ChatCallerClient,
  type ChatServiceClient,
} from '../../../packages/shared/src/bantay/chatService.ts';
export {
  isFaithfulToArticle,
  parseChatModelOutput,
  stripUnsafeChatText,
  validateChatModelOutput,
} from '../../../packages/shared/src/bantay/chatValidator.ts';
