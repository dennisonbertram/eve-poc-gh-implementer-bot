/**
 * Drive the Eve GitHub Implementer Bot against an issue.
 *
 * Usage:
 *   node implement-issue.mjs <owner> <repo> <issue-number> [--auto-approve]
 *
 * Env:
 *   BOT_URL                    base URL of the running bot (default http://localhost:3000)
 *   ROUTE_AUTH_BASIC_PASSWORD  HTTP Basic password the bot was started with
 *
 * The bot reads the issue, implements + tests the change in a sandbox, then
 * PAUSES for human approval before opening the PR. This script streams the
 * events; pass --auto-approve to approve automatically (e.g. in CI).
 */
const args = process.argv.slice(2);
const auto = args.includes("--auto-approve");
const [owner, repo, issueNumber] = args.filter((a) => !a.startsWith("--"));
if (!owner || !repo || !issueNumber) {
  console.error("usage: node implement-issue.mjs <owner> <repo> <issue-number> [--auto-approve]");
  process.exit(1);
}

const BOT_URL = process.env.BOT_URL ?? "http://localhost:3000";
const PASS = process.env.ROUTE_AUTH_BASIC_PASSWORD;
if (!PASS) throw new Error("ROUTE_AUTH_BASIC_PASSWORD is required");
const auth = "Basic " + Buffer.from(`operator:${PASS}`).toString("base64");
const headers = { "Content-Type": "application/json", Authorization: auth };

const message = `Implement GitHub issue #${issueNumber} in ${owner}/${repo} (owner: ${owner}, repo: ${repo}, issue_number: ${issueNumber}). Run the tests, then open a pull request.`;

const res = await fetch(`${BOT_URL}/eve/v1/session`, { method: "POST", headers, body: JSON.stringify({ message }) });
if (!(res.status === 200 || res.status === 202)) throw new Error(`session create failed: ${res.status} ${await res.text()}`);
const { sessionId } = await res.json();
console.log(`session ${sessionId} — streaming…\n`);

async function stream() {
  const s = await fetch(`${BOT_URL}/eve/v1/session/${sessionId}/stream`, { headers });
  for await (const chunk of s.body) {
    for (const line of Buffer.from(chunk).toString().split("\n").filter(Boolean)) {
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.type === "actions.requested") console.log("→ tool call:", e.data.actions?.map((a) => a.toolName).join(", "));
      else if (e.type === "action.result" && e.data.result?.output?.pr_url) console.log("✓ PR opened:", e.data.result.output.pr_url);
      else if (e.type === "input.requested") {
        console.log("\n⏸  approval requested:", e.data?.prompt ?? "(open the pull request?)");
        const requestId = e.data?.requestId ?? e.requestId ?? e.data?.id;
        if (auto) { await approve(requestId); return stream(); }
        console.log("   re-run with --auto-approve, or approve via POST /eve/v1/session/" + sessionId + "/continue");
        process.exit(0);
      } else if (e.type === "message.completed") console.log("\n💬", e.data.message);
      else if (e.type === "session.waiting" || e.type === "session.completed") process.exit(0);
    }
  }
}
async function approve(requestId) {
  console.log("   approving…");
  await fetch(`${BOT_URL}/eve/v1/session/${sessionId}/continue`, {
    method: "POST", headers,
    body: JSON.stringify({ inputResponses: [{ requestId, optionId: "approve" }] }),
  });
}
await stream();
