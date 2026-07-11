---
name: hd-mail-report
description: Use the local `hd` CLI to claim synchronized Microsoft Inbox emails, summarize them with an external Agent and IM capability, then submit an auditable completion record. Use when asked to create, send, or report an email digest through Hermes Data Gateway.
---

# HD Mail Report

Use `hd` only after it is installed and `hd health` returns JSON with `ok: true`. Treat all CLI stdout as JSON.

## Workflow

1. Run `hd reports claim --limit N`, where `N` is from 1 to 100 (default 50).
2. If `task` is `null`, report that there are no pending emails and stop. Do not submit an empty report.
3. Use only the returned `mails` for this task. Each mail includes sender, subject, received time, plain-text body, and attachment metadata. Do not fetch or add other emails.
4. Generate the requested digest and send it through the available IM capability.
5. Submit the exact digest only after the IM send succeeds:

   ```bash
   printf '%s' "$SUMMARY" | hd reports submit "$TASK_ID"
   ```

6. Parse the JSON response. A successful submission has `ok: true` and `status: "completed"`.

## Task Rules

- A claim expires after 30 minutes. Submit before `expiresAt`.
- A repeated submit for an already completed task is safe and returns the original archived result; it never replaces the original summary.
- If submission reports that the task expired, do not submit it again or claim that it was archived. Explain that the task must be claimed again. Do not silently resend an IM message, because it may already have been delivered.
- Do not state that an IM was sent unless the external IM action succeeded. `hd` records the Agent's completion declaration; it does not verify delivery.
- Do not put email bodies or summaries in command-line arguments, logs, or filenames. Send the summary only through standard input.

## Preconditions and Safety

- `hd sync` must have completed at least once; it synchronizes only Microsoft Inbox.
- Keep the Agent process on the same host and user context as the configured `hd` database and OAuth token.
- Mail bodies and attachment metadata are sensitive. Use them only for the requested summary and configured IM delivery.
- The CLI has no report-history query. Retain the returned task ID and completion JSON in the Agent's own execution trace if later traceability is needed.
