import type { Options } from "k6/options";

/**
 * Load profiles. Each one answers a different question:
 *   smoke  - does the journey work at all? (every PR)
 *   load   - does the app meet its budgets at expected traffic? (nightly)
 *   stress - where does it start to degrade? (manual)
 *   spike  - does it recover from a sudden burst? (manual)
 */
export type ProfileName = "smoke" | "load" | "stress" | "spike";

type Stages = NonNullable<Options["stages"]>;

export const PROFILES: Record<ProfileName, Stages> = {
  smoke: [
    { duration: "10s", target: 3 },
    { duration: "40s", target: 3 },
  ],
  load: [
    { duration: "1m", target: 30 },
    { duration: "3m", target: 30 },
    { duration: "30s", target: 0 },
  ],
  stress: [
    { duration: "1m", target: 40 },
    { duration: "2m", target: 80 },
    { duration: "2m", target: 140 },
    { duration: "30s", target: 0 },
  ],
  spike: [
    { duration: "30s", target: 10 },
    { duration: "10s", target: 140 },
    { duration: "1m", target: 140 },
    { duration: "10s", target: 10 },
    { duration: "1m", target: 10 },
  ],
};

export function profileName(): ProfileName {
  const name = (__ENV.PROFILE ?? "smoke") as ProfileName;
  if (!(name in PROFILES)) {
    throw new Error(
      `Unknown PROFILE "${name}", use one of ${Object.keys(PROFILES).join(", ")}`,
    );
  }
  return name;
}
