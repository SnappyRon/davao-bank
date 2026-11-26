/** Deno-side barrel for the hashed sign-in signal helpers (Stage 8E). */
export {
  buildSigninFailureFacts,
  deriveSigninHashes,
  shouldEmitSigninEvent,
  SIGNIN_FAILURE_THRESHOLD,
  SIGNIN_SIGNAL_RESPONSE,
  SIGNIN_WINDOW_MINUTES,
} from '../../../packages/shared/src/bantay/signin.ts';
