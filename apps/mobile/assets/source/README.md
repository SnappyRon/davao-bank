# Asset sources

Originals and full-resolution cutouts for the in-app assets. Nothing in this folder is
bundled: Metro only bundles files that code `require()`s, and nothing here should be.

The originals are JPEGs generated for this project (2026-10-23 and 2026-11-03). Each has a
transparency checkerboard painted into the pixels, so none can be used directly. Every
in-app PNG was derived from them by removing the checkerboard (border-connected neutral
pixels only; artwork untouched). Baked drop shadows were turned into real semi-transparent
shadows. The `*.cutout.png` files are those 1024 px RGBA masters.

## In use (derivatives exist)

| Source                                | Shows                  | App file                                                 | Size   | Intended use                                                                                                  |
| ------------------------------------- | ---------------------- | -------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| `mascots/duri-empty-state.*`          | Duri sleeping ("zzz")  | `illustrations/duri-empty-state(@2x,@3x).png`            | 120 pt | Empty states: Inbox all caught up, Activity with no transactions                                              |
| `mascots/duri-error-state.*`          | Duri confused ("?")    | `illustrations/duri-error-state(@2x,@3x).png`            | 120 pt | Recoverable errors: load failed, offline, no search results                                                   |
| `mascots/kada-not-found.*`            | Kada confused ("?")    | `illustrations/kada-not-found(@2x,@3x).png`              | 120 pt | Account not found, empty Saved recipients                                                                     |
| `mascots/kada-not-found.cutout.png`   | Kada, no question mark | `illustrations/bantay-kada(@2x,@3x).png`                 | 120 pt | Interim Bantay face: security center header, risk challenge, lock, timeline, Home indicator and Bantay alerts |
| `icons/biller-category-electricity.*` | Patterned light bulb   | `icons/billers/biller-category-electricity(@2x,@3x).png` | 48 pt  | Pay Bills category: Electricity                                                                               |
| `icons/biller-category-water.*`       | Patterned water drop   | `icons/billers/biller-category-water(@2x,@3x).png`       | 48 pt  | Pay Bills category: Water                                                                                     |
| `icons/biller-category-internet.*`    | Patterned Wi-Fi        | `icons/billers/biller-category-internet(@2x,@3x).png`    | 48 pt  | Pay Bills category: Internet                                                                                  |

There is no artwork yet for the Mobile/telco biller category. Keep the Lucide icon for it.

### Interim Bantay mascot (`bantay-kada`)

Source: `mascots/kada-not-found.cutout.png` (the 1024 px RGBA master of the approved Kada
character). The two alpha-connected components forming the question mark in the top right
(curve x 784–929/y 93–264 and dot x 796–852/y 270–325) were made fully transparent; the
whole bird was left untouched, then the remaining artwork was centred on a transparent
square canvas and downscaled with Lanczos to the same 120/240/360 pt ladder as
`kada-not-found*`. `kada-not-found*` itself is unchanged and still serves its empty-state
uses. Intended use: **interim until the guard poses from
`docs/design/phase-8-bantay-mascot-spec.md` exist** — one static, decorative image stands in
for P1–P4 everywhere. All meaning stays in live text, and there is no animation, so Reduce
Motion needs no special case. Do not add it to money-flow amounts, review, processing or
result screens, above the balance, or in the tab bar.

## Kept as source only (do not use in the app)

| Source                                        | Why not                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `mascots/duri-running.source.jpg`             | Suggests hurry; processing states must read as calm                    |
| `mascots/duri-trophy.source.jpg`              | Gamifies banking and implies a reward the app does not give            |
| `mascots/duri-kada-success-banner.source.jpg` | "SUCCESS!" lettering is baked in; too celebratory for payment results  |
| `mascots/duri-kada-error-banner.source.jpg`   | "Oops!" / "SOMETHING WENT WRONG!" lettering is baked in; alarming tone |

The AI-redrawn Kadayawan logo from the same batch was deliberately not added. Use only the
official logo files from the City Tourism Operations Office in `packages/shared/assets/brand/`.

## Rules

- Illustrations are decorative: render them with `accessible={false}`. The message under
  them is live text.
- Never use them in money flows (amount, review, processing, result), above the balance,
  in the tab bar, or as buttons.
- To regenerate a derivative, start from the `*.cutout.png` master, not from a derivative.
