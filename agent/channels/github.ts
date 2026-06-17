import { defaultGitHubAuth, githubChannel } from "eve/channels/github";

// Production webhook channel — receives GitHub App webhooks at /eve/v1/github.
// Point a GitHub App's webhook URL at https://<deployment>/eve/v1/github and
// subscribe to the "issues" event. When an issue is opened or labeled, this
// channel dispatches a turn so the agent implements it.
//
// BLOCKER: GitHub App registration is a manual human setup step.
// Required env vars (set in Vercel project):
//   GITHUB_APP_ID          — GitHub App numeric id
//   GITHUB_APP_PRIVATE_KEY — PEM private key (newlines as \n)
//   GITHUB_WEBHOOK_SECRET  — validates the X-Hub-Signature-256 header
//   GITHUB_APP_SLUG        — supplies botName if not set here
//
// This code is real and correct; the bot won't receive webhooks until a
// GitHub App is registered and the webhook URL is pointed at the deployment.
export default githubChannel({
  botName: "eve-implementer",
  credentials: {
    appId: process.env.GITHUB_APP_ID,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
  },
  // Dispatch only on issue opened or labeled events — ignore all other issue actions.
  onIssue: (ctx, issue) =>
    issue.action === "opened" || issue.action === "labeled"
      ? { auth: defaultGitHubAuth(ctx) }
      : null,
});
