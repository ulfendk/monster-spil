import { createHash, timingSafeEqual } from "node:crypto";

const MAX_FAILURES = 5;
const WINDOW_MS = 10 * 60 * 1000;

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

/** Constant-time comparison of a guess with a secret (both hashed, so lengths don't leak). */
export function sameSecret(given: unknown, secret: string): boolean {
  return typeof given === "string" && timingSafeEqual(digest(given), digest(secret));
}

/**
 * Counts wrong guesses — of a spilnøgle or the admin password — per client address.
 * After MAX_FAILURES within WINDOW_MS that address is locked out until the window
 * passes: even a correct guess is refused while locked, so guessing can't win by
 * persistence. One gate is shared by every game, so trying keys across games counts too.
 */
export class KeyGate {
  private failures = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * Runs `lookup` (which checks the guess) unless `address` is locked out. A result of
   * undefined counts as a wrong guess; anything else clears the address's failures.
   */
  attempt<T>(address: string, lookup: () => T | undefined): T | undefined {
    const recent = (this.failures.get(address) ?? []).filter((t) => this.now() - t < WINDOW_MS);
    if (recent.length >= MAX_FAILURES) {
      this.failures.set(address, recent);
      return undefined;
    }
    const found = lookup();
    if (found !== undefined) this.failures.delete(address);
    else this.failures.set(address, [...recent, this.now()]);
    return found;
  }

  /** A single fixed secret (the admin password). */
  check(address: string, given: unknown, secret: string): boolean {
    return this.attempt(address, () => (sameSecret(given, secret) ? true : undefined)) === true;
  }
}

/** Behind a reverse proxy the last X-Forwarded-For entry is the address the proxy itself saw. */
export function clientAddress(headers: Record<string, string | string[] | undefined>, ip: string | string[]): string {
  const forwarded = headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
  const last = raw?.split(",").pop()?.trim();
  return last || (Array.isArray(ip) ? ip[0] ?? "unknown" : ip);
}
