export const meta = {
  name: 'vuln-remediate-loop',
  description:
    'For one apps/vuln-lab finding the user already reproduced themselves: find the root cause and draft the journal entry, then implement + verify the fix and complete the journal entry. Entirely inside an isolated sandbox, scoped to apps/vuln-lab only.',
  phases: [
    { title: 'Investigate', detail: 'find the root cause in the code and draft the journal entry (discovery + cause)' },
    { title: 'Fix', detail: 'implement + test the fix, verify (scoped to apps/vuln-lab), then complete the journal entry' },
  ],
}

const MAX_INVESTIGATE_ATTEMPTS = 2
const MAX_FIX_ATTEMPTS = 3

const INVESTIGATE_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    approved: {
      type: 'boolean',
      description:
        'true if the root cause is concretely tied to the reported finding (specific file:line, quoted code) and the journal draft follows the template structure',
    },
    blocking_questions: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Genuine ambiguities only the human who reported the finding could resolve (e.g. the reported symptom does not match anything found in the code). Non-empty means STOP regardless of approved.',
    },
    issues: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concrete, fixable problems for the next draft attempt (used only when approved=false and blocking_questions is empty)',
    },
  },
  required: ['approved', 'blocking_questions', 'issues'],
}

const FIX_VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    blocking_questions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Genuine ambiguities only a human could resolve, discovered during the fix (e.g. a real behavior-vs-security tradeoff)',
    },
    issues: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concrete, fixable problems for the next fix attempt (used only when pass=false and blocking_questions is empty)',
    },
    summary: {
      type: 'string',
      description: 'One paragraph describing the root cause and the fix, for the human reviewer',
    },
  },
  required: ['pass', 'blocking_questions', 'issues', 'summary'],
}

const { finding, slug, sandboxPath, journalPath } = args || {}
if (!finding || !slug || !sandboxPath || !journalPath) {
  throw new Error('vuln-remediate-loop requires args: {finding, slug, sandboxPath, journalPath}')
}

const SANDBOX_NOTE =
  `All work happens inside the sandbox at ${sandboxPath} — a full, isolated copy of the repo. ` +
  `The real project directory is NEVER touched by this workflow. Before running any Bash command, cd into ${sandboxPath} first. ` +
  `Use only absolute paths under ${sandboxPath} for Read/Write/Edit.`

const SCOPE_NOTE =
  `Scope is strictly ${sandboxPath}/apps/vuln-lab — this is a follow-up remediation for a SPECIFIC finding the user already reproduced themselves, not a general security sweep. ` +
  `Read ${sandboxPath}/apps/vuln-lab/CLAUDE.md first: it lists this app's OTHER intentional vulnerabilities (IDOR, SQLi, XSS, auth/session, CSRF, misconfiguration, design weaknesses) — ` +
  `do NOT touch, "fix", or even flag any of those while working this finding; only the one finding described below is in scope. ` +
  `Key files for orientation (read only what's relevant to this finding, don't blindly explore the whole app): ` +
  `${sandboxPath}/apps/vuln-lab/src/lib/db.ts (schema + seed data), ${sandboxPath}/apps/vuln-lab/src/lib/session.ts (auth), ` +
  `${sandboxPath}/apps/vuln-lab/src/lib/crypto.ts (hashing), ${sandboxPath}/apps/vuln-lab/src/app/api/**/route.ts (mutating endpoints), ` +
  `${sandboxPath}/apps/vuln-lab/src/app/**/page.tsx (pages, some server-rendered with direct db queries).`

const FINDING_NOTE = `The finding, as reported by the user (their own words/evidence — trust it as ground truth for what happened, but verify the root cause in the actual code):\n${finding}`

phase('Investigate')

let investigateIssues = []
let investigateApproved = false
let investigateAttempt = 0

while (investigateAttempt < MAX_INVESTIGATE_ATTEMPTS && !investigateApproved) {
  investigateAttempt++

  await agent(
    `${SANDBOX_NOTE}\n\n${SCOPE_NOTE}\n\n${FINDING_NOTE}\n\n` +
      `Find the concrete root cause in the code for this finding, then write (or revise) the journal entry at ${journalPath}, ` +
      `following the section structure and frontmatter in ${sandboxPath}/docs/journal-drafts/_template.md exactly (same headings, same order, same frontmatter keys). ` +
      `Fill in 概要, 発見方法 (from the finding as reported), and 原因 (cite the exact file:line and quote the vulnerable code). ` +
      `Leave 修正（TODO） and 学んだこと（TODO） as placeholders — those are filled in during the Fix phase, not now. Set a first-pass severity estimate in the frontmatter.` +
      (investigateIssues.length
        ? `\n\nThe previous draft had these problems — fix them:\n${investigateIssues.map((i) => `- ${i}`).join('\n')}`
        : ''),
    { phase: 'Investigate', label: `investigate:draft-${investigateAttempt}` },
  )

  const review = await agent(
    `${SANDBOX_NOTE}\n\n${SCOPE_NOTE}\n\n${FINDING_NOTE}\n\n` +
      `Adversarially review the journal draft at ${journalPath} against ${sandboxPath}/docs/journal-drafts/_template.md and the real code under ${sandboxPath}/apps/vuln-lab. Check: ` +
      `every template section is present; 原因 cites real, currently-existing code (verify the file:line and quoted snippet actually exist) and genuinely explains the reported symptom, not a plausible-sounding guess; ` +
      `the draft does not silently expand scope to other vulnerability categories.`,
    { phase: 'Investigate', label: `investigate:review-${investigateAttempt}`, schema: INVESTIGATE_REVIEW_SCHEMA },
  )

  if (review.blocking_questions.length) {
    return { status: 'blocked_on_investigation', slug, journalPath, sandboxPath, questions: review.blocking_questions }
  }

  if (review.approved) {
    investigateApproved = true
  } else {
    investigateIssues = review.issues
    log(`Investigate attempt ${investigateAttempt} rejected: ${review.issues.join('; ')}`)
  }
}

if (!investigateApproved) {
  return { status: 'investigation_failed', slug, journalPath, sandboxPath, issues: investigateIssues }
}

phase('Fix')

let fixIssues = []
let fixPass = false
let fixAttempt = 0
let lastSummary = ''

while (fixAttempt < MAX_FIX_ATTEMPTS && !fixPass) {
  fixAttempt++

  await agent(
    `${SANDBOX_NOTE}\n\n${SCOPE_NOTE}\n\n` +
      `Implement a fix for the root cause described in ${journalPath}'s 原因 section. Follow the codebase's existing conventions. ` +
      `Add a focused regression test that fails without the fix and passes with it. Keep the change scoped to this one finding — no unrelated refactors, ` +
      `and do not touch any of this app's other intentional vulnerabilities (see apps/vuln-lab/CLAUDE.md).` +
      (fixIssues.length
        ? `\n\nThe previous attempt failed verification with these problems — fix them:\n${fixIssues.map((i) => `- ${i}`).join('\n')}`
        : ''),
    { phase: 'Fix', label: `fix:attempt-${fixAttempt}` },
  )

  const verify = await agent(
    `${SANDBOX_NOTE}\n\n${SCOPE_NOTE}\n\n` +
      `Verify the fix. This app is isolated from the rest of the monorepo (own package, no shared deps, excluded from CI/build/deploy per its CLAUDE.md), ` +
      `so verification is scoped to it — run, inside ${sandboxPath}, ALL of: ` +
      `\`npx biome check apps/vuln-lab\`, \`pnpm --filter vuln-lab typecheck\`, \`pnpm --filter vuln-lab test\`. ` +
      `Do NOT run a repo-wide pnpm check/typecheck/test/build — that wastes tokens re-verifying untouched packages. ` +
      `Also review the diff itself for correctness bugs, unnecessary complexity, and scope creep beyond this one finding. ` +
      `If everything passes, complete the journal entry at ${journalPath}: replace 修正（TODO） with the actual fix (what changed, why this approach vs alternatives, what regression test was added) ` +
      `and 学んだこと（TODO） with generalized lessons (not just a summary of what happened). Update the frontmatter: ` +
      `\`status: "fixed"\`, a final severity, and \`fixed_at\` (get today's date by running \`date +%F\` inside the sandbox — never guess it). ` +
      `If you find a genuine ambiguity only a human could resolve — not decidable from the code or the journal draft — report it as a blocking_question instead of guessing.`,
    { phase: 'Fix', label: `verify:attempt-${fixAttempt}`, schema: FIX_VERIFY_SCHEMA },
  )

  lastSummary = verify.summary

  if (verify.blocking_questions.length) {
    return {
      status: 'blocked_on_fix',
      slug,
      journalPath,
      sandboxPath,
      questions: verify.blocking_questions,
      summary: lastSummary,
    }
  }

  if (verify.pass) {
    fixPass = true
  } else {
    fixIssues = verify.issues
    log(`Fix attempt ${fixAttempt} failed verification: ${verify.issues.join('; ')}`)
  }
}

if (!fixPass) {
  return { status: 'fix_failed', slug, journalPath, sandboxPath, issues: fixIssues, summary: lastSummary }
}

return { status: 'ready_for_review', slug, journalPath, sandboxPath, summary: lastSummary }
