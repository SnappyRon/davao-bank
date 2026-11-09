# Captain workflow — how work is delegated, reviewed and accepted

This file defines the multi-agent structure for Davao Bank. `AGENTS.md` (hard rules) always wins over this file.

## Roles

| Role                          | Who                                                     | Edits code?                                     | Defined in                                                         |
| ----------------------------- | ------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| **Captain** (boss / reviewer) | Claude Code                                             | Small fixes and docs only                       | `AGENTS.md`, this file                                             |
| **Implementer** (programmer)  | Codex, Antigravity or another agent the captain assigns | Yes, only the task it was given                 | the task brief + `AGENTS.md`                                       |
| **CI/CD Engineer**            | reviewer sub agent                                      | No (report only, unless the captain authorizes) | [`roles/ci-cd-engineer.md`](roles/ci-cd-engineer.md)               |
| **UI/UX Reviewer**            | reviewer sub agent                                      | No                                              | [`roles/ui-ux-reviewer.md`](roles/ui-ux-reviewer.md)               |
| **Security Reviewer**         | reviewer sub agent                                      | No                                              | [`roles/security-reviewer.md`](roles/security-reviewer.md)         |
| **Code Quality Reviewer**     | reviewer sub agent                                      | No                                              | [`roles/code-quality-reviewer.md`](roles/code-quality-reviewer.md) |
| **Owner**                     | Ron (human)                                             | Approves pushes, PRs, DB changes, scope changes | —                                                                  |

The role files in `docs/agents/roles/` are the **single source of truth**. The tool wrappers only point at them:

- Claude Code sub agents: `.claude/agents/<role>.md`
- Codex custom agents: `.codex/agents/<role>.toml`

Never copy role instructions into a wrapper. Change the role file instead.

## Lifecycle of one task

1. **Understand.** The captain reads the spec (`Phase-*.md`), `STATUS.md` and the affected code before delegating. If the task needs a decision outside the spec (a DB change, a new dependency, a scope change), the captain stops and asks the owner.
2. **Implement.** The captain gives one implementer one task with a written brief: goal, files in scope, files out of scope, invariants (money engine, step-up, prompt host), the checks to run, the exact commit title, and the report format. One implementer writes to a branch at a time. Parallel implementers each get their own git worktree and branch.
3. **Route reviews.** After the implementer commits, the captain picks reviewers with the routing table below. Not every task needs every reviewer.
4. **Review.** Reviewers run in parallel. They read the diff (`git show <hash>`) and the surrounding code, run read-only checks, and return a report in the format below. They do not edit files.
5. **Decide.** The captain verifies each finding against the code, resolves conflicts (rules below), and sorts accepted findings by severity.
6. **Fix.** Accepted findings go back to the implementer as a follow-up brief, or the captain fixes small ones. Blocker and High findings must be fixed before the task is accepted.
7. **Verify and accept.** The captain re-runs the checks itself, confirms each accepted finding is fixed in the code, updates `STATUS.md` and records the review in its Log. Device checks that were not run are written as "NOT VERIFIED — reason".

## Routing: which reviewers a change needs

| Change touches                                                                                                      | Reviewers                     |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Screens, components, navigation, copy, motion, theme tokens                                                         | UI/UX, Code Quality           |
| Auth, MFA/step-up, sessions, app lock, RLS, `supabase/migrations`, server functions, anything that moves money      | Security, Code Quality        |
| `.github/workflows`, `package.json` / lockfile, Babel/Metro/Expo/Next config, scripts, test harnesses, env handling | CI/CD, Code Quality           |
| A money flow screen (transfer, pay bills, cash in/out, requests, schedules)                                         | UI/UX, Security, Code Quality |
| Docs only                                                                                                           | none (captain reads it)       |

When in doubt, add Code Quality. Security is mandatory for anything in the second row.

## Required report format (every reviewer, every time)

```
## <Role> report — <task / commit hash>

**Task reviewed:** what was reviewed and against which spec section.
**Files inspected:** paths (and line ranges) actually opened.
**Checks run:** exact commands and their real result lines. "None" if none.

### Findings
| # | Severity | Location (file:line) | Issue | Evidence | Recommended fix |
|---|----------|----------------------|-------|----------|-----------------|

**Risks and dependencies:** what the fixes could break, what they depend on.
**Actions completed:** "None (read-only)" unless the captain authorized an action.
**Needs owner or captain decision:** items outside the reviewer's authority.
**Not verified:** what could not be checked, and why.
```

Severity: **Blocker** (must not merge: data loss, money error, auth bypass, broken build) · **High** (real bug or vulnerability users can hit) · **Medium** (likely bug, spec deviation, a11y failure) · **Low** (quality, consistency) · **Info** (suggestion).

### Report acceptance rules (captain)

- Reject a report that says "looks good" without listing the files inspected and the evidence.
- Every finding needs a `file:line` and evidence (a code quote, a command output, or a spec line). No evidence → treat as unverified.
- "No findings" is acceptable only with the files inspected and the checks run.
- The captain spot-checks findings in the code before acting on them. A reviewer's claim is not proof.

## Resolving conflicting recommendations

Apply in order, and record the decision in the `STATUS.md` Log:

1. **Hard rules in `AGENTS.md`** and the money engine invariants win over everything.
2. **Security over convenience.** A Security finding of High or above beats a UI/UX or Code Quality preference.
3. **The spec wins over taste.** The active `Phase-*.md` prompt decides UI/UX disputes; the design tokens decide visual ones.
4. **Smallest change that satisfies both.** Prefer the fix that keeps existing working code and touches the fewest files.
5. **Otherwise the owner decides.** The captain writes both options with their trade-offs and asks.

## Preventing overlap

- One writer per branch at a time. Reviewers never write.
- Each brief lists files in scope and files the implementer must not touch (for example, files the captain is editing).
- Commit with paths (`git commit -m … -- <paths>`) or stage by name, so one agent's staged files never end up in another agent's commit.
- A reviewer that finds a problem outside its role reports it under "Needs owner or captain decision" instead of reviewing it in depth.

## How the captain runs this (supported mechanisms)

- **Implementers run in Herdr tabs** (`herdr agent start <name> --kind codex|claude|agy`, `herdr agent prompt`, `herdr agent wait --until done --until blocked`, `herdr agent read`). Permission prompts inside an implementer are approved by the owner, not by the captain.
- **Reviewers run as Claude Code sub agents** (`.claude/agents/*.md`, started by the captain with the Agent tool, in parallel, read-only tools). This is the default.
- **Cross-model review (optional):** the same roles exist as Codex custom agents (`.codex/agents/*.toml`). A captain running in Codex can spawn them directly. From Claude Code, the captain can run one non-interactively in read-only mode:
  `codex exec -s read-only "Act as the security-reviewer agent defined in .codex/agents/security-reviewer.toml. Review commit <hash>. Return the report format in docs/agents/WORKFLOW.md."`
  This uses the owner's Codex quota, so use it for high-risk changes only.
