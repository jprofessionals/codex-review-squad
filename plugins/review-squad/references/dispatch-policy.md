# Dispatch and approval policy

Always show the proposed panel and decision. Continue without waiting only when
all automatic conditions pass.

## Automatic dispatch

Use:

```text
Status: panel proposal — auto-approved
Decision owner: Review Squad orchestrator
Reason: bounded read-only scope, explicit target, no private access or external write, and no more than five justified lanes
```

Automatic dispatch requires:

- explicit, bounded review scope
- local read-only access or a user-supplied public browser target
- three initial lanes, with at most five after evidence-based escalation
- no private credentials, external system access, mutation, destructive action,
  material scope expansion, or materially different panel alternatives

## Approval required

Use:

```text
Status: panel proposal — approval required
Decision owner: [user / Product Owner / security owner]
Reason: [specific boundary]
Decision needed: [approve, reject, or choose a bounded alternative]
```

Pause for approval when any applies:

- six or more lanes
- material scope or cost expansion
- private or new external access
- any external write, submission, purchase, signup, upload, account change, or
  destructive action
- competing panel choices with materially different assurance/cost

Approval for a panel does not authorize later implementation or a browser final
action. Those are separate boundaries.

## Escalation

Start ordinary expert reviews with three evidence-selected lanes. Add a lane or
stronger tier only for:

- security, privacy, data-integrity, reliability, or compliance risk
- ambiguous scope
- high-risk work left not verified
- material reviewer conflict
- a distinct uncovered risk
- explicit launch, compliance, or high-assurance depth

State each trigger and added lane. If a sixth lane appears necessary, present it
as an approval-required candidate rather than dispatching it.
