# 🤖 Eve GitHub Implementer Bot

An autonomous **issue-to-PR implementer** built on [Eve](https://github.com/vercel/eve), Vercel's open-source, filesystem-first agent framework. Give it a GitHub issue and it reads the requirement, **writes the code and runs the tests in an isolated sandbox until they pass**, then — after **human approval** — opens a real pull request that closes the issue.

It combines three of Eve's strongest primitives in one small agent: **sandboxed code execution**, **human-in-the-loop approval**, and the **GitHub integration**.

> Built as a proof-of-concept. Runs locally, as a GitHub Action (label an issue → it implements), or deployed to Vercel as a GitHub-App webhook bot.

---

## What it actually does

Given an issue like *"Implement `add(a,b)` in `src/math.js` so the tests pass,"* the agent:

1. **Reads the issue** (`get_issue` tool).
2. **Implements it in a sandbox** — clones the repo, writes the code, runs `node --test`, and **iterates until the tests are green**. It refuses to open a PR with failing tests.
3. **Opens a real PR** (`open_pull_request`). By default it opens autonomously — opening a PR is reversible. Set `HUMAN_REVIEW=true` to make the session **pause for approval** before opening (merging is always a human action on GitHub).

A **real** PR this bot opened during testing:

> **Implement add(a,b) function in src/math.js**
> Implements `add(a, b)` to replace the placeholder that threw "not implemented". All 3 tests pass:
> `✔ add(2,3)→5  ✔ add(0,5)→5  ✔ add(-1,-2)→-3   tests 3 / pass 3 / fail 0`
> Closes #1

---

## How it works

In Eve, **an agent is a directory**:

```
agent/
  agent.ts                    # the model (Claude Haiku 4.5 via @ai-sdk/anthropic)
  instructions.md             # the implementer workflow: read → implement → test → approve → PR
  tools/
    get_issue.ts              # GET the issue title + body          (uses GITHUB_TOKEN)
    open_pull_request.ts      # clone→write→test→push→PR in a SANDBOX, gated on approval
  channels/
    eve.ts                    # the HTTP session API + route auth (fail-closed)
    github.ts                 # OPTIONAL: GitHub App webhook (label an issue → implement)
.github/workflows/eve-implement.yml  # run as a GitHub Action on the "eve-implement" label
implement-issue.mjs                  # CLI: drive the bot against any issue
examples/target-repo/                # a tiny repo + issue to try it on
```

The optional approval gate is one line — Eve handles the pause/resume:

```ts
// agent/tools/open_pull_request.ts (abridged)
export default defineTool({
  description: "…clone, commit, push, and open a pull request. Requires human approval.",
  inputSchema: z.object({ /* owner, repo, branch_name, file_path, file_content, … */ }),
  needsApproval: () => process.env.HUMAN_REVIEW === "true",  // ← opt-in pause; default opens autonomously
  async execute({ owner, repo, file_path, file_content, branch_name, … }, ctx) {
    const token = process.env.GITHUB_TOKEN;       // ← from env, never hardcoded
    const sandbox = await ctx.getSandbox();       // ← code runs ISOLATED, not in the app
    await sandbox.run({ command: `git clone …; node --test` });
    // …push branch, POST /repos/{owner}/{repo}/pulls
  },
});
```

---

## Quick start (local)

**Prerequisites:** Node 24+, an [Anthropic API key](https://console.anthropic.com/settings/keys), and a [GitHub token](https://github.com/settings/tokens) with `repo` scope (or fine-grained *Contents + Pull requests: read & write, Issues: read*).

```bash
git clone https://github.com/dennisonbertram/eve-poc-gh-implementer-bot.git
cd eve-poc-gh-implementer-bot
npm install
cp .env.example .env.local        # fill in your keys (see table below)
```

**Try it end-to-end** against your own throwaway repo:

```bash
# 1. Create a target repo from the example and file the issue
cp -r examples/target-repo /tmp/target && cd /tmp/target
git init -b main && git add -A && git commit -m "stub + failing tests"
gh repo create my-target --private --source=. --push
gh issue create --title "Implement add(a,b) in src/math.js" \
  --body "Implement add so the tests pass. Closes when the PR merges."
cd -

# 2. Run the bot and point it at the issue
npm run build && npm start &      # serves the HTTP session API on :3000
# Default: the bot implements, tests, and opens the PR autonomously.
ROUTE_AUTH_BASIC_PASSWORD=… node implement-issue.mjs <you> my-target 1
# With HUMAN_REVIEW=true it pauses for approval; pass --auto-approve to approve from the CLI.
```

Or just `npm run dev` for the interactive TUI and type: *"implement issue #1 in <you>/my-target"*.

### Environment variables

| Variable | Required | What it's for |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | the model. `sk-ant-…` from console.anthropic.com |
| `GITHUB_TOKEN` | ✅ | read the issue, push the branch, open the PR |
| `ROUTE_AUTH_BASIC_PASSWORD` | ✅ (deployed) | HTTP Basic password guarding the session routes |
| `HUMAN_REVIEW` | optional (default `false`) | `true` → pause for human approval before opening a PR; default opens autonomously |
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_WEBHOOK_SECRET` | optional | only for the GitHub-App webhook channel |

> ⚠️ **Model auth:** a *string* model id (`"anthropic/claude-haiku-4-5"`) routes through the Vercel AI Gateway and needs `AI_GATEWAY_API_KEY`. To run on a bare `ANTHROPIC_API_KEY`, `agent/agent.ts` passes a **provider object** — `anthropic("claude-haiku-4-5")`.

---

## Run it as a GitHub Action

`.github/workflows/eve-implement.yml` triggers when you add the **`eve-implement`** label to an issue. It calls the deployed bot and verifies the PR (and, if you run with `HUMAN_REVIEW=true`, auto-approves the gate so CI isn't blocked). Set these repo secrets:

| Secret | Value |
|---|---|
| `EVE_AGENT_URL` | your deployed bot URL, e.g. `https://your-bot.vercel.app` |
| `EVE_BASIC_PASSWORD` | the `ROUTE_AUTH_BASIC_PASSWORD` you deployed with |
| `EVE_IMPL_GH_TOKEN` | a fine-grained PAT with write access to the target repo |

---

## Deploy to Vercel

```bash
VERCEL=1 npx eve build
vercel link --yes --project eve-implementer-bot
printf '%s' "$ANTHROPIC_API_KEY"         | vercel env add ANTHROPIC_API_KEY production
printf '%s' "$GITHUB_TOKEN"              | vercel env add GITHUB_TOKEN production
printf '%s' "$ROUTE_AUTH_BASIC_PASSWORD" | vercel env add ROUTE_AUTH_BASIC_PASSWORD production
vercel deploy --prebuilt --prod --yes
```

**Route auth:** Eve **fails closed** — `agent/channels/eve.ts` accepts a Vercel OIDC caller or HTTP Basic (`operator` / `ROUTE_AUTH_BASIC_PASSWORD`); `GET /eve/v1/health` stays public. New Vercel projects enable *Vercel SSO* on all routes by default; disable it (Project → Settings → Deployment Protection) for external callers — Eve's route auth still guards the session endpoints.

> **Note on the sandbox + git push in production.** On Vercel, the sandbox runs on Vercel Sandbox infrastructure and egress auth is brokered at the firewall. Pushing a branch from the deployed sandbox may need additional credential brokering. Running locally (the sandbox uses your environment) is the simplest way to see the full clone→test→push→PR flow.

---

## Production form: a GitHub App webhook bot

For *label an issue → the bot implements it automatically*, use `agent/channels/github.ts` (Eve's GitHub channel takes App webhooks at `/eve/v1/github` and checks the repo out into the sandbox):

1. Create a GitHub App → https://github.com/settings/apps/new
2. Subscribe to the `issues` event; webhook URL `https://<your-deployment>/eve/v1/github`
3. Set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (PEM), `GITHUB_WEBHOOK_SECRET`
4. Install the App on your repo

---

## Security

- **No secrets in this repo.** Every credential is read from `process.env`; `.env.local` is gitignored; `.env.example` holds only placeholders.
- The bot pushes branches and opens PRs with your `GITHUB_TOKEN` — scope it to the target repo with a fine-grained PAT.
- PR creation is autonomous by default (opening a PR is reversible). Set `HUMAN_REVIEW=true` to require human approval before opening — and rely on **branch protection / required reviews on GitHub to gate *merges***, which is the action that actually changes your default branch.
- Session routes are **fail-closed** (HTTP Basic / Vercel OIDC).

## Built with

[Eve](https://github.com/vercel/eve) · [Vercel AI SDK](https://ai-sdk.dev) · Anthropic Claude · [Vercel](https://vercel.com)

## License

MIT — see [LICENSE](./LICENSE).
