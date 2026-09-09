export const meta = {
  name: 'feature-loop',
  description:
    'Spec-then-implement pipeline for one /feature task: draft and adversarially review a spec, then implement and verify it, entirely inside an isolated sandbox. Bounded retries; stops and surfaces blocking questions to the human instead of guessing.',
  phases: [
    { title: 'Spec', detail: 'draft the spec, then adversarially review it against the template and codebase' },
    { title: 'Implement', detail: 'implement against the approved spec, then verify with checks plus a correctness/simplification review' },
  ],
}

const MAX_SPEC_ATTEMPTS = 3
const MAX_IMPL_ATTEMPTS = 3

const SPEC_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    approved: {
      type: 'boolean',
      description: 'true if the spec is complete, internally consistent, and ready to implement',
    },
    blocking_questions: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Questions ONLY a human product owner can answer. Non-empty means STOP regardless of approved. Must include, verbatim, anything already listed in the spec\'s own "Open questions" section.',
    },
    issues: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concrete, fixable problems for the next draft attempt (used only when approved=false and blocking_questions is empty)',
    },
  },
  required: ['approved', 'blocking_questions', 'issues'],
}

const IMPLEMENTATION_VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    blocking_questions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Genuine ambiguities only a human could resolve, discovered during implementation',
    },
    issues: {
      type: 'array',
      items: { type: 'string' },
      description: 'Concrete, fixable problems for the next implementation attempt (used only when pass=false and blocking_questions is empty)',
    },
    summary: {
      type: 'string',
      description: 'One paragraph describing what was implemented, for the human reviewer',
    },
  },
  required: ['pass', 'blocking_questions', 'issues', 'summary'],
}

const { task, slug, sandboxPath, specPath } = args || {}
if (!task || !slug || !sandboxPath || !specPath) {
  throw new Error('feature-loop requires args: {task, slug, sandboxPath, specPath}')
}

const SANDBOX_NOTE =
  `All work happens inside the sandbox at ${sandboxPath} — a full, isolated copy of the repo. ` +
  `The real project directory is NEVER touched by this workflow. Before running any Bash command, cd into ${sandboxPath} first. ` +
  `Use only absolute paths under ${sandboxPath} for Read/Write/Edit.`

phase('Spec')

let specIssues = []
let specApproved = false
let specAttempt = 0

while (specAttempt < MAX_SPEC_ATTEMPTS && !specApproved) {
  specAttempt++

  await agent(
    `${SANDBOX_NOTE}\n\n` +
      `Write (or revise) a feature spec at ${specPath}, following the section structure in ${sandboxPath}/docs/specs/_template.md exactly (same headings, same order). ` +
      `Feature to spec: ${task}.` +
      (specIssues.length
        ? `\n\nThe previous draft had these problems — fix them:\n${specIssues.map((i) => `- ${i}`).join('\n')}`
        : '') +
      `\n\nRead the existing codebase under ${sandboxPath} (including CLAUDE.md and README.md) as needed to ground requirements in what actually exists. Do not write any implementation code in this step — spec only.`,
    { phase: 'Spec', label: `spec:draft-${specAttempt}` },
  )

  const review = await agent(
    `${SANDBOX_NOTE}\n\n` +
      `Adversarially review the spec at ${specPath} against the template at ${sandboxPath}/docs/specs/_template.md and the real codebase under ${sandboxPath}. Check: ` +
      `every template section is present and either filled in or explicitly marked N/A; requirements are concrete and testable; acceptance criteria are checkable; ` +
      `the spec does not silently assume a product/business decision that isn't stated in the task description ("${task}") or derivable from the existing codebase — such assumptions belong in "Open questions", not guessed. ` +
      `Copy every entry already listed under the spec's own "Open questions" section into blocking_questions verbatim, in addition to anything else you find.`,
    { phase: 'Spec', label: `spec:review-${specAttempt}`, schema: SPEC_REVIEW_SCHEMA },
  )

  if (review.blocking_questions.length) {
    return { status: 'blocked_on_spec', slug, specPath, sandboxPath, questions: review.blocking_questions }
  }

  if (review.approved) {
    specApproved = true
  } else {
    specIssues = review.issues
    log(`Spec attempt ${specAttempt} rejected: ${review.issues.join('; ')}`)
  }
}

if (!specApproved) {
  return { status: 'spec_failed', slug, specPath, sandboxPath, issues: specIssues }
}

phase('Implement')

let implIssues = []
let implPass = false
let implAttempt = 0
let lastSummary = ''

while (implAttempt < MAX_IMPL_ATTEMPTS && !implPass) {
  implAttempt++

  await agent(
    `${SANDBOX_NOTE}\n\n` +
      `Implement the spec at ${specPath} inside ${sandboxPath}. Follow the codebase's existing conventions — read CLAUDE.md and README.md in ${sandboxPath} first. ` +
      `Keep the change scoped to the spec's requirements; no unrelated refactors.` +
      (implIssues.length
        ? `\n\nThe previous attempt failed verification with these problems — fix them:\n${implIssues.map((i) => `- ${i}`).join('\n')}`
        : ''),
    { phase: 'Implement', label: `impl:attempt-${implAttempt}` },
  )

  const verify = await agent(
    `${SANDBOX_NOTE}\n\n` +
      `Verify the implementation against the spec at ${specPath}. Run, inside ${sandboxPath}, ALL of: pnpm check, pnpm typecheck, pnpm test, pnpm build, pnpm test:e2e — ` +
      `always run test:e2e too, regardless of whether the spec looks user-facing; guessing at scope to skip a gate is exactly the risk this loop exists to remove. Also review the diff itself for correctness bugs and unnecessary complexity or scope creep beyond the spec. ` +
      `If you find a genuine ambiguity that only a human could resolve — not covered by the spec and not decidable from the existing codebase — report it as a blocking_question instead of guessing a resolution.`,
    { phase: 'Implement', label: `verify:attempt-${implAttempt}`, schema: IMPLEMENTATION_VERIFY_SCHEMA },
  )

  lastSummary = verify.summary

  if (verify.blocking_questions.length) {
    return {
      status: 'blocked_on_implementation',
      slug,
      specPath,
      sandboxPath,
      questions: verify.blocking_questions,
      summary: lastSummary,
    }
  }

  if (verify.pass) {
    implPass = true
  } else {
    implIssues = verify.issues
    log(`Implementation attempt ${implAttempt} failed verification: ${verify.issues.join('; ')}`)
  }
}

if (!implPass) {
  return { status: 'implementation_failed', slug, specPath, sandboxPath, issues: implIssues, summary: lastSummary }
}

return { status: 'ready_for_review', slug, specPath, sandboxPath, summary: lastSummary }
