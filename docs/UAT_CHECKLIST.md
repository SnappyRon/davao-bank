# Phase 6 device acceptance checklist

Status: **NOT COMPLETE**. No row below is a device pass. Run on iPhone simulator and Android emulator with private test credentials. Record a screenshot path in each platform column, plus tester/date and any defect. Use a physical phone for camera scanning.

Prerequisites: rotate the seed password, fund customer accounts, create an incoming payment request, enable password confirmation, and display another customer's valid QR with an amount on a second screen. Maestro scenarios are authored but unexecuted; their selectors must be confirmed on-device.

| Feature / procedure                                   | Expected result                                                      | iOS result / screenshot | Android result / screenshot |
| ----------------------------------------------------- | -------------------------------------------------------------------- | ----------------------- | --------------------------- |
| Sign up, verify email, sign in, reset password        | Successful auth; invalid credentials show sanitized copy             | NOT TESTED              | NOT TESTED                  |
| Restart app while signed in                           | Encrypted session restores without another login                     | NOT TESTED              | NOT TESTED                  |
| Home and account selector                             | Balances match selected accounts; hide-balance masks amounts         | NOT TESTED              | NOT TESTED                  |
| Cash-in                                               | One credit; server receipt persists; reopening clears input          | NOT TESTED              | NOT TESTED                  |
| Cash-out                                              | Identity check, one debit, receipt persists                          | NOT TESTED              | NOT TESTED                  |
| Transfer to account and saved recipient               | Identity check, correct recipient and source balance now             | NOT TESTED              | NOT TESTED                  |
| QR with amount (physical phone)                       | Scan opens Review once; success remains visible after 3 seconds      | NOT TESTED              | NOT TESTED                  |
| Pay bill                                              | Server amount and transaction ID; replay message on repeat           | NOT TESTED              | NOT TESTED                  |
| Schedule transfer and bill                            | Once/weekly/monthly schedules display correctly; cancel works        | NOT TESTED              | NOT TESTED                  |
| Incoming payment request                              | Pay once; decline/cancel confirmation cannot double-open             | NOT TESTED              | NOT TESTED                  |
| Activity, filters and transaction detail              | Correct amounts, direction and transaction labels                    | NOT TESTED              | NOT TESTED                  |
| Statement export                                      | Correct period, opening/closing balances and rows                    | NOT TESTED              | NOT TESTED                  |
| Saved recipients                                      | Add/edit/remove; invalid inputs sanitized                            | NOT TESTED              | NOT TESTED                  |
| FX rates                                              | Currency and period changes update graph/history                     | NOT TESTED              | NOT TESTED                  |
| Inbox                                                 | Notifications display and read state updates                         | NOT TESTED              | NOT TESTED                  |
| Profile and personal details                          | Edits save; keyboard taps work                                       | NOT TESTED              | NOT TESTED                  |
| Biometrics/password fallback                          | Cancellation never authorizes money movement                         | NOT TESTED              | NOT TESTED                  |
| Form discard and in-flight backdrop                   | Dirty forms ask to discard on every step; in-flight sheets stay open | NOT TESTED              | NOT TESTED                  |
| Dropped response after transfer commit                | Checking status… then same-key retry; exactly one server transaction | NOT TESTED              | NOT TESTED                  |
| App switcher with Transfer Review open                | Root and native modal contain no visible banking details             | NOT TESTED              | NOT TESTED                  |
| VoiceOver/TalkBack: Home, Transfer, Activity, Profile | Labels, focus order and announced state understandable               | NOT TESTED              | NOT TESTED                  |
| Text size 130% and 200%                               | No clipped text or overlaps                                          | NOT TESTED              | NOT TESTED                  |
| Reduce Motion enabled                                 | No animations                                                        | NOT TESTED              | NOT TESTED                  |
| Touch targets                                         | All interactive targets at least 44 pt                               | NOT TESTED              | NOT TESTED                  |
| Cold start and tab switches                           | Measure each; target under 2 seconds                                 | NOT TESTED              | NOT TESTED                  |
| Sign out and full restart                             | No authenticated session restored                                    | NOT TESTED              | NOT TESTED                  |

## Evidence protocol

Record cold-start timing from launch to usable Home (not splash dismissal), and tab timing from tap to usable content. Record device model, OS, build type and three measurements per case. Automated unit timing is not a substitute.

For dropped-response proof, capture the request key privately, submit while a proxy drops only the response after the database commits, reconnect, and retry. Verify the same key on every request and one transaction plus balanced ledger entries on the server. The local recovery test uses a simulated committed-response loss; existing database tests separately verify same-key idempotency. This is not yet an end-to-end network-fault result.

Physical phone QR scanning: NOT TESTED; device availability not established.
