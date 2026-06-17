import { defineTool } from "eve/tools";
import { z } from "zod";

// Fetches a GitHub issue and returns its title + body.
// Uses GITHUB_TOKEN (fine-grained PAT or classic PAT with repo scope)
// injected via process.env — never written to a committed file.
export default defineTool({
  description:
    "Get the title and body of a GitHub issue. Returns the issue content so the agent can understand what needs to be implemented.",
  inputSchema: z.object({
    owner: z.string().describe("Repository owner (GitHub username or org)"),
    repo: z.string().describe("Repository name"),
    issue_number: z.number().int().positive().describe("Issue number"),
  }),
  async execute({ owner, repo, issue_number }) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN env var is not set");

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issue_number}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "eve-implementer-bot/1.0",
        },
      }
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API error ${res.status}: ${body}`);
    }

    const issue = (await res.json()) as {
      number: number;
      title: string;
      body: string | null;
      state: string;
      html_url: string;
    };

    return {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "(no description)",
      state: issue.state,
      url: issue.html_url,
    };
  },
});
