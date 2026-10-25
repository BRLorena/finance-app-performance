import http from "k6/http";
import { check } from "k6";

/**
 * Logs in through NextAuth's credentials flow, the same requests the
 * login form sends: fetch a CSRF token, then post the credentials. The
 * session cookie lands in the VU's cookie jar and is reused by every
 * later request (the scenario sets noCookiesReset).
 */
export function login(baseUrl: string, email: string, password: string) {
  const csrf = http.get(`${baseUrl}/api/auth/csrf`, {
    tags: { name: "auth_csrf" },
  });
  const csrfToken = csrf.json("csrfToken") as string;

  const res = http.post(
    `${baseUrl}/api/auth/callback/credentials`,
    { email, password, csrfToken, callbackUrl: `${baseUrl}/pt/dashboard` },
    { redirects: 0, tags: { name: "login" } },
  );

  const jar = http.cookieJar();
  const loggedIn = check(res, {
    "login redirects": (r) => r.status === 302,
    "login sets a session": () =>
      Object.keys(jar.cookiesForURL(baseUrl)).some((name) =>
        name.endsWith("authjs.session-token"),
      ),
  });
  if (!loggedIn) {
    throw new Error(`Login failed for ${email} (status ${res.status})`);
  }
}
