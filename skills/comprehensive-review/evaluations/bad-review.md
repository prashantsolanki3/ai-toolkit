# Example: an unacceptable review

Use this as a contrast — these are the failure modes the comprehensive-review skill should avoid.

---

**Bad #1 — generic praise + handwaving**

> LGTM 👍 great work, nothing to add.

Why it fails: no concrete observation; reviewer adds no signal.

---

**Bad #2 — surface-only**

> Looks good. Nit: extra blank line at the end of `handler.ts`. Approve.

Why it fails: only catches whitespace; ignores substantive design.

---

**Bad #3 — design rant divorced from the diff**

> This whole module should be a hexagonal architecture with ports and adapters and event sourcing. Strongly suggest a complete rewrite.

Why it fails: not actionable in the scope of the diff; doesn't help the author make the next decision.

---

**Bad #4 — ungrounded speculation**

> I think this might leak memory under load. Not sure where though.

Why it fails: no specific reference to a frame, allocation, or measurement. Speculation without evidence forces the author to disprove a vague claim.

A good review names a specific line or function and either makes a falsifiable claim or asks a falsifiable question.
