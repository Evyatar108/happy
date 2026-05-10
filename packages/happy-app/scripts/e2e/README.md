# Happy App Manual E2E Scripts

## P4 Attachments And File Links

`p4-attachments.ts` is a manually-run validation for the P4 file links, changed-files refresh, attachment upload, and Codex patch approval slice. CI must not run it because it needs an authenticated web app, a real remote session, and operator-provided commands that mutate/read that remote session.

### Preconditions

- Start the web app with `pnpm --filter happy-app web` and sign in before running the script.
- Install or allow `npx agent-browser` to run; the script drives only browser DOM operations through that CLI and does not inspect the network panel.
- Pick an existing remote session with a working directory and a small text file that can be overwritten for AC15a/AC15b.
- Provide a command template that edits a remote file and a command template that performs a post-hoc `sessionReadFile`. The driver runs those commands outside the browser and checks their stdout.
- Provide commands that trigger a Codex patch approval and then mutate the producer-side live file-change map after the approval request is emitted.

### Run Command

From the repo root:

```bash
HAPPY_E2E_URL=http://localhost:8081 \
HAPPY_E2E_SESSION_ID=session-id \
HAPPY_E2E_EXISTING_FILE_PATH=src/p4-e2e.txt \
HAPPY_E2E_SESSION_READ_FILE_COMMAND='your-session-read-file-command --session {sessionId} --path {path}' \
HAPPY_E2E_EDIT_REMOTE_FILE_COMMAND='your-session-write-file-command --session {sessionId} --path {path} --content-base64 {contentBase64}' \
HAPPY_E2E_CODEX_APPROVAL_TRIGGER_COMMAND='your-command-that-opens-a-codex-patch-approval' \
HAPPY_E2E_CODEX_APPROVAL_MUTATION_COMMAND='your-command-that-mutates-the-live-file-change-map-after-emit' \
HAPPY_E2E_CODEX_EXPECTED_FILES='src/request-file-a.ts,src/request-file-b.ts' \
pnpm --filter happy-app e2e:p4-attachments
```

Optional selector overrides are available for local DOM differences: `HAPPY_E2E_CHAT_INPUT_SELECTOR`, `HAPPY_E2E_SEND_SELECTOR`, `HAPPY_E2E_NEW_SESSION_INPUT_SELECTOR`, `HAPPY_E2E_NEW_SESSION_SEND_SELECTOR`, `HAPPY_E2E_IN_CHAT_ATTACHMENT_ROOT_SELECTOR`, `HAPPY_E2E_NEW_SESSION_ATTACHMENT_ROOT_SELECTOR`, and `HAPPY_E2E_ATTACHMENT_CHIP_SELECTOR`.

### Artefacts

Each labelled step writes a screenshot and log under:

```text
packages/happy-app/scripts/e2e/artefacts/p4-attachments/
```

The expected step labels are `AC15a`, `AC15b`, `AC15c`, `AC15d`, and `AC15e`.
