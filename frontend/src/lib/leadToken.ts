/**
 * Lead Persona Set auth threading (see CONTEXT.md → Lead Persona Set module).
 *
 * When a Lead arrives on /p/:token and signs up/logs in from there, the link
 * token must ride along in the auth request so the backend Claim matches by
 * token first. The AuthDialog doesn't know its referrer, so LeadSetPage
 * stashes the token here before opening the dialog, and the dialog attaches
 * it to login/signup/verify-otp/google payloads.
 */

let pendingLeadToken: string | null = null;

export function setPendingLeadToken(token: string | null) {
  pendingLeadToken = token;
}

export function takePendingLeadToken(): string | null {
  return pendingLeadToken;
}
