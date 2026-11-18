const AUTH_ERROR_MESSAGES: Record<string, string> = {
  Configuration:
    "Sign-in is temporarily unavailable. This often happens on the first request after the app has been idle. Wait a moment and try again.",
  AccessDenied: "This account is not allowed to sign in.",
  Verification: "That sign-in link is invalid or has expired. Request a new one from the sign-in page.",
  CredentialsSignin: "Invalid email or password.",
  SessionRequired: "Your session expired. Sign in again.",
  Default:
    "Sign-in didn't complete. If the app was idle, wait a moment and try again.",
};

/** Human copy for NextAuth's `?error=` code. Unknown codes stay actionable. */
export function authErrorMessage(code: string | null | undefined): string {
  const key = (code || "").trim();
  if (!Object.hasOwn(AUTH_ERROR_MESSAGES, key)) return AUTH_ERROR_MESSAGES.Default;
  return AUTH_ERROR_MESSAGES[key];
}
