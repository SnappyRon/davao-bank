# Davao Bank prototype limitations

- Academic demonstration using simulated balances, cash-in, cash-out and billers. It does not hold or move real bank funds.
- No payment-network settlement, bank integration, deposit insurance, production identity verification, AML monitoring or dispute operations.
- Demo users and privileged administration require private credentials, rotation, access review and production-grade MFA before any real deployment.
- Browser auth cookies are accessible to JavaScript by design; CSP still allows inline scripts/styles. A production threat model must address XSS and session theft.
- Mobile sessions are encrypted using device-protected keys, but compromised/rooted devices remain a risk. Secure-store restart and app-switcher behavior still require device evidence.
- Transfer network recovery retries a captured request with the same key in the current mounted flow. It is not a durable outbox across process termination; check transaction history after an interrupted restart before creating a new transfer.
- Scheduled tasks depend on hosted cron, Edge Functions and external rate data; FX rates are informational and not tradable quotes.
- The historical demo password remains in git history. Removing literals does not replace rotating hosted credentials.
- Full VoiceOver/TalkBack, large-text, reduced-motion, touch-target, device-performance and physical QR acceptance is pending. See UAT_CHECKLIST.md.
- Production use would require independent security testing, monitoring/alerting, backup and disaster-recovery exercises, reconciliation operations, privacy controls, compliance review and incident response.
