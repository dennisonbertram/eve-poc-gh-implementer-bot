import { defineTool } from "eve/tools";
import { z } from "zod";

// Opens a pull request on GitHub after cloning the repo, writing the
// implementation, running tests, and pushing a new branch.
//
// Human-in-the-loop is OPT-IN via the HUMAN_REVIEW env var:
//   HUMAN_REVIEW=true  → the session pauses for approval before the PR is opened
//   unset / "false"    → the bot opens the PR autonomously (DEFAULT)
// Rationale: opening a PR is reversible (just don't merge it); MERGING is the
// action that warrants a human. So gate the merge (on GitHub), not PR creation.
//
// The implementation steps (clone, write, test, commit, push) run in the
// Eve sandbox via ctx.getSandbox() so they are isolated from the app runtime.
export default defineTool({
  description:
    "Create a branch, commit the implementation of a GitHub issue, push it, and open a pull request. Requires human approval before opening ONLY when HUMAN_REVIEW=true.",
  inputSchema: z.object({
    owner: z.string().describe("Repository owner"),
    repo: z.string().describe("Repository name"),
    issue_number: z.number().int().positive().describe("Issue number being fixed"),
    branch_name: z.string().describe("New branch name for the fix (e.g. fix/issue-1-add-function)"),
    file_path: z
      .string()
      .describe("Repo-relative path to the file to write (e.g. src/math.js)"),
    file_content: z.string().describe("Complete content of the file after the fix"),
    pr_title: z.string().describe("Pull request title"),
    pr_body: z.string().describe("Pull request description (markdown)"),
  }),
  // Gate on approval only when HUMAN_REVIEW=true; otherwise open autonomously.
  needsApproval: () => process.env.HUMAN_REVIEW === "true",
  async execute(
    { owner, repo, issue_number, branch_name, file_path, file_content, pr_title, pr_body },
    ctx
  ) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN env var is not set");

    const sandbox = await ctx.getSandbox();

    // Clone the repo into the sandbox workspace
    const cloneDir = `impl-${owner}-${repo}-${issue_number}`;
    await sandbox.run({
      command: `rm -rf ${cloneDir} && git clone https://x-access-token:${token}@github.com/${owner}/${repo}.git ${cloneDir}`,
    });

    // Configure git identity inside the sandbox
    await sandbox.run({
      command: `cd ${cloneDir} && git config user.email "eve-bot@agent.ai" && git config user.name "Eve Implementer Bot"`,
    });

    // Create a new branch
    await sandbox.run({
      command: `cd ${cloneDir} && git checkout -b ${branch_name}`,
    });

    // Write the implementation file
    await sandbox.writeTextFile({
      path: `${cloneDir}/${file_path}`,
      content: file_content,
    });

    // Run the tests — must pass before we open a PR
    const testResult = await sandbox.run({
      command: `cd ${cloneDir} && node --test 2>&1`,
    });

    const testOutput = testResult.stdout + testResult.stderr;
    const passed = !testOutput.includes("✖") && !testOutput.includes("failing tests");
    if (!passed) {
      throw new Error(
        `Tests failed after implementation — not opening PR.\n\nTest output:\n${testOutput}`
      );
    }

    // Commit and push
    await sandbox.run({
      command: `cd ${cloneDir} && git add -A && git commit -m "fix: implement ${file_path} to close #${issue_number}"`,
    });

    const pushResult = await sandbox.run({
      command: `cd ${cloneDir} && git push origin ${branch_name} 2>&1`,
    });

    if (pushResult.stdout.includes("error") || pushResult.stderr.includes("error")) {
      throw new Error(`Git push failed:\n${pushResult.stdout}\n${pushResult.stderr}`);
    }

    // Open the PR via GitHub API
    const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "eve-implementer-bot/1.0",
      },
      body: JSON.stringify({
        title: pr_title,
        body: pr_body,
        head: branch_name,
        base: "main",
      }),
    });

    if (!prRes.ok) {
      const body = await prRes.text();
      throw new Error(`GitHub PR creation error ${prRes.status}: ${body}`);
    }

    const pr = (await prRes.json()) as {
      number: number;
      html_url: string;
      head: { ref: string };
    };

    return {
      pr_number: pr.number,
      pr_url: pr.html_url,
      branch: pr.head.ref,
      test_output: testOutput,
      status: "PR opened",
    };
  },
});
