# Review Dispatch Policy

Load this file before dispatching any Review Squad panel.

## Determine the Dispatch Mode

Auto-dispatch the proposed panel only when all of the following are true:

- The user or an already approved workflow explicitly requested the review.
- The review is read-only. Required report artifacts are allowed.
- The target and scope are unambiguous.
- The panel contains only relevant default reviewers, standard lanes, or
  strongly matched additions.
- The panel stays within the normal 4-8 reviewer envelope and any stricter
  mode-specific limit.
- No reviewer materially expands product, delivery, repository, data-access,
  or operational scope.
- No production access, external private data, irreversible action, or
  product, legal, license, compliance, or privacy decision is required.

Request explicit approval before dispatch when any condition above is not
satisfied. Also require approval when:

- Review Squad introduced the review without a user request or prior workflow
  approval.
- The user explicitly requested panel approval.
- Reasonable panel alternatives would materially affect cost, scope, or the
  delivery plan.

Ask the appropriate decision owner to approve or customize the panel. Product
Owner approval is required only for product scope, semantics, acceptance
criteria, user impact, or delivery-priority decisions.

## Present the Decision

Always show the proposed panel before dispatch for transparency.

For autonomous dispatch, show:

```text
Status: panel proposal — auto-approved
Dispatch decision: proceeding without a pause
Reason: [concise evidence that every autonomous-dispatch condition is met]
```

Then dispatch immediately. Do not ask the user to reply before continuing.

For approval-required dispatch, show:

```text
Status: panel proposal — approval required
Approval reason: [specific condition requiring a human decision]
```

Then pause and ask the appropriate decision owner to approve or customize the
panel.

Use this closing instruction where a panel proposal needs one:

```text
If approval is required, reply approve or customize the panel.
If the panel is auto-approved, review dispatch continues immediately.
```

## Preserve the Post-Review Decision Gate

After the review, stop on findings that require Product Owner or another human
decision. Clearly separate decision-required findings from patchable findings,
identify the appropriate decision owner, and do not assume a resolution in an
implementation plan or fix.
