/**
 * Davao Bank — compiled, curated Bantay chat help (Stage 8N).
 *
 * Source of truth: docs/specs/bantay-help/*.md. Only `status: approved` articles
 * are compiled here; at build time this file is imported directly by the Edge
 * Function (no runtime file reads, embeddings, training or web grounding).
 */

import {
  BANTAY_CHAT_CACHE_MAX,
  BANTAY_CHAT_CACHE_TTL_MS,
  type BantayChatActionId,
} from './chatConfig.ts';
import type { ChatLanguage } from './chatRedact.ts';

export interface ChatHelpArticle {
  id: string;
  version: number;
  title: string;
  intents: readonly string[];
  action: BantayChatActionId;
  text: string;
  taglish?: string;
}

export const BANTAY_CHAT_ARTICLES: readonly ChatHelpArticle[] = [
  {
    id: 'lock-account',
    version: 1,
    title: 'Lock your account',
    intents: [
      'lock account',
      'lock my account',
      'how do i lock my account',
      'freeze my account',
      'stop payments',
      'i think someone has my account',
      'unsaon pag lock sa account',
    ],
    action: 'open_bantay',
    text: 'Open Bantay and tap Lock my account, then confirm. Outgoing money stops right away and scheduled payments are paused. You can still sign in to see what happened. Nothing is moved or deleted.',
    taglish:
      'Ablihi ang Bantay ug i-tap ang Lock my account, dayon confirm. Ang outgoing money mohunong dayon ug ang scheduled payments ma-pause. Makasign in ka gihapon aron makita kung unsay nahitabo. Wala kwarta nga molihok o mawala.',
  },
  {
    id: 'unlock-account',
    version: 1,
    title: 'Unlock your account',
    intents: ['unlock', 'unblock', 'how long until i can send money again'],
    action: 'open_bantay',
    text: 'In Bantay, request an unlock with your password and authenticator code. You can unlock one hour after the request. Return to Bantay and confirm with your password and code again. Paused schedules stay paused until you resume them one by one.',
    taglish:
      'Sa Bantay, mangayo og unlock gamit ang imong password ug authenticator code. Mahimo ka mag-unlock usa ka oras human sa request. Balik sa Bantay ug confirm pag-usab gamit ang password ug code. Ang paused schedules magpabilin hangtod imong i-resume matag usa.',
  },
  {
    id: 'daily-limit',
    version: 1,
    title: 'Your daily transfer limit',
    intents: [
      'daily limit',
      'transfer limit',
      'change limit',
      'how much can i send',
      'whats my daily limit',
    ],
    action: 'open_profile_security',
    text: 'You can see your limit and how much is left today in Bantay. Lowering a limit takes effect right away. Raising a limit takes effect after 12 hours. Bantay chat can tell you which band your limit is in, but it cannot change it for you.',
    taglish:
      'Makita nimo ang imong limit ug kung pila pa ang nahabilin karon sa Bantay. Ang pagpaubos sa limit molihok dayon. Ang pagpataas molihok human sa 12 ka oras. Ang Bantay chat makatells lang kung unsang banda ang limit, dili kini mausab ang limit.',
  },
  {
    id: 'risk-challenge',
    version: 1,
    title: 'Why a payment needs confirmation',
    intents: [
      'why was my payment challenged',
      'why was my payment checked',
      'confirmation required',
      'payment check',
    ],
    action: 'open_activity',
    text: 'Bantay asks for extra confirmation when a payment looks unusual, for example a new payee, a larger amount than usual, several quick payments, a new device, or a late hour. No money is sent until you confirm with your password and authenticator code. If you do not recognise the payment, lock your account in Bantay.',
    taglish:
      'Nangayo ang Bantay og dugang confirmation kung ang payment daw dili kasagaran, pananglitan bag-ong payee, mas dako nga amount, daghang payments, bag-ong device, o hapon na. Wala kwarta nga ipadala hangtod dili ka mo-confirm gamit ang password ug authenticator code. Kung dili nimo kila ang payment, i-lock ang account sa Bantay.',
  },
  {
    id: 'new-device',
    version: 1,
    title: 'A new device signed in',
    intents: ['new device', 'unknown device', 'device i dont know'],
    action: 'open_bantay',
    text: 'Bantay records a new device when you sign in on a phone you have not used before. Open Bantay to review the event. Choose It was me to trust the device, or Not me to lock your account and open a case. Bantay never shows full device details in chat.',
    taglish:
      'Nagrekord ang Bantay og bag-ong device kung mag-sign in ka sa phone nga wala pa nimo gigamit kaniadto. Ablihi ang Bantay aron makita ang event. Pilia ang It was me kung imo kini, o Not me kung i-lock ang account ug magbukas og case. Wala full device details nga ipakita sa chat.',
  },
  {
    id: 'hide-balance',
    version: 1,
    title: 'Hide balances',
    intents: ['hide balance', 'privacy', 'show balance', 'how do i hide my balance'],
    action: 'open_profile_security',
    text: 'In Profile, open Settings and turn on Hide balances. Amounts are masked across the app. You can turn it off at any time in the same place. Bantay chat only uses bands, so it never shows an exact balance.',
    taglish:
      'Sa Profile, ablihi ang Settings ug i-on ang Hide balances. Matago ang amounts sa tibuok app. Mahimo nimo kining i-off pag-usab sa samang dapit. Ang Bantay chat naggamit lang og bands, busa wala kini magpakita og exact balance.',
  },
  {
    id: 'report-not-me',
    version: 1,
    title: 'Report an event as not mine',
    intents: ['not me', 'i didnt do this', 'report suspicious event'],
    action: 'open_bantay',
    text: 'In Bantay, open the security timeline and choose Not me on the event. Confirm to lock your account and open a security case for staff to review. Choose It was me only if you recognise the event. Chat cannot change the event status for you.',
    taglish:
      'Sa Bantay, ablihi ang security timeline ug pilia ang Not me sa event. I-confirm aron ma-lock ang account ug maablihan ang security case alang sa staff. Pilia ang It was me kung kila nimo ang event. Ang chat dili makausab sa status sa event.',
  },
  {
    id: 'two-step',
    version: 1,
    title: 'Turn on two-step verification',
    intents: [
      'two step',
      'two-step',
      'mfa',
      'authenticator',
      'otp setup',
      'how do i turn on two-step',
    ],
    action: 'open_profile_security',
    text: 'In Profile, open Security and set up two-step verification with an authenticator app. After setup, every payment asks for a code from the app as well as your password. Keep your setup key private. Bantay never asks you for a code in chat.',
    taglish:
      'Sa Profile, ablihi ang Security ug i-set up ang two-step verification gamit ang authenticator app. Human sa setup, matag payment mangayo og code gikan sa app dugang sa imong password. Itago ang setup key. Ang Bantay dili mangayo og code sa chat.',
  },
  {
    id: 'safety-tips',
    version: 1,
    title: 'Safety tips',
    intents: ['safety tips', 'safety tip', 'stay safe', 'keep my account safe'],
    action: 'open_bantay',
    text: 'Never share your password, code or card number with anyone. Review new devices in Bantay and choose It was me or Not me. Keep two-step verification on. Before you confirm a payment, check the masked ending of the payee. Bantay never asks for a code in chat.',
    taglish:
      'Ayaw ipaambit ang password, code, o card number bisan kang kinsa. Susiha ang bag-ong device sa Bantay ug pilia ang It was me o Not me. I-on ang two-step verification. Sa dili pa mo-confirm, susiha ang masked ending sa payee. Ang Bantay dili mangayo og code sa chat.',
  },
];

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Deterministic alias match. A tie or a weak match is treated as no match. */
export function findChatArticle(
  message: string,
  language: ChatLanguage = 'english'
): ChatHelpArticle | null {
  const text = normalise(message);
  if (!text) return null;
  const scored = BANTAY_CHAT_ARTICLES.map((article) => {
    let score = 0;
    for (const intent of article.intents) {
      const needle = normalise(intent);
      if (needle && text.includes(needle)) score += needle.length;
    }
    if (text.includes(normalise(article.id.replace(/-/g, ' ')))) score += 8;
    if (language === 'taglish' && article.taglish) {
      for (const sentence of article.taglish.split(/[.!?]/)) {
        const needle = normalise(sentence);
        if (needle.length > 8 && text.includes(needle)) score += needle.length;
      }
    }
    return { article, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 4) return null;
  if (scored[1] && scored[1].score === best.score) return null;
  return best.article;
}

export function chatArticleText(
  article: ChatHelpArticle,
  language: ChatLanguage
): string {
  return language === 'taglish' && article.taglish ? article.taglish : article.text;
}

export function chatArticleCacheKey(
  article: ChatHelpArticle,
  language: ChatLanguage,
  contextVersion: string
): string {
  return `${article.id}:${article.version}:${language}:${contextVersion}`;
}

export interface ChatArticleCache {
  get(key: string): string | null;
  set(key: string, value: string): void;
  readonly size: number;
}

/** In-memory article answers only; user-specific model replies are never cached. */
export function createChatArticleCache(
  now: () => number = Date.now,
  ttlMs = BANTAY_CHAT_CACHE_TTL_MS,
  max = BANTAY_CHAT_CACHE_MAX
): ChatArticleCache {
  const entries = new Map<string, { value: string; expires: number }>();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expires <= now()) {
        entries.delete(key);
        return null;
      }
      return entry.value;
    },
    set(key, value) {
      if (entries.has(key)) entries.delete(key);
      while (entries.size >= max) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      entries.set(key, { value, expires: now() + ttlMs });
    },
    get size() {
      return entries.size;
    },
  };
}
