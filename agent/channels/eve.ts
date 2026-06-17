import { eveChannel } from "eve/channels/eve";
import { httpBasic, vercelOidc } from "eve/channels/auth";

// Eve fails closed in production: session routes reject unauthenticated traffic.
// Accept (1) Vercel internal/OIDC callers and (2) operator via HTTP Basic for smoke tests.
// GET /eve/v1/health stays public regardless.
export default eveChannel({
  auth: [
    vercelOidc(),
    httpBasic({
      username: "operator",
      password: process.env.ROUTE_AUTH_BASIC_PASSWORD ?? "",
    }),
  ],
});
