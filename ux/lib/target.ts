import { LOCAL_PASSWORD, UX_USER_EMAIL } from "../../config/users.ts";

export type UxPhase = "idle" | "load";

export function uxPhase(): UxPhase {
  return process.env.UX_PHASE === "load" ? "load" : "idle";
}

/** A deployed target passes its own account; locally it's the seeded one */
export function uxCredentials() {
  return {
    email: process.env.PERF_EMAIL ?? UX_USER_EMAIL,
    password: process.env.PERF_PASSWORD ?? LOCAL_PASSWORD,
  };
}

/** Pages the UX layer measures, and the API call that fills each one */
export const PAGES = [
  { name: "login", path: "/pt/login", auth: false, dataCall: undefined },
  {
    name: "dashboard",
    path: "/pt/dashboard",
    auth: true,
    dataCall: "/api/summary",
  },
] as const;

export const SAMPLES = Number(process.env.UX_SAMPLES ?? 5);
