import { createHash, timingSafeEqual } from "node:crypto";

const MAX_FAILURES = 5;
const WINDOW_MS = 10 * 60 * 1000;

const digest = (value: string): Buffer => createHash("sha256").update(value).digest();

/**
 * The family code check. Wrong guesses are counted per client address; after
 * MAX_FAILURES within WINDOW_MS that address is locked out until the window
 * passes — even a correct code is refused while locked, so guessing can't win
 * by persistence. With no code configured the gate is open (local dev only).
 */
export class FamilyGate {
  private failures = new Map<string, number[]>();

  constructor(private readonly code: string | undefined, private readonly now: () => number = Date.now) {}

  get isOpen(): boolean {
    return !this.code;
  }

  check(address: string, given: unknown): boolean {
    if (!this.code) return true;
    const recent = (this.failures.get(address) ?? []).filter((t) => this.now() - t < WINDOW_MS);
    if (recent.length >= MAX_FAILURES) {
      this.failures.set(address, recent);
      return false;
    }
    // Hash both sides so the comparison is constant-time regardless of length.
    const ok = typeof given === "string" && timingSafeEqual(digest(given), digest(this.code));
    if (ok) this.failures.delete(address);
    else this.failures.set(address, [...recent, this.now()]);
    return ok;
  }
}

/** Behind a reverse proxy the last X-Forwarded-For entry is the address the proxy itself saw. */
export function clientAddress(headers: Record<string, string | string[] | undefined>, ip: string | string[]): string {
  const forwarded = headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
  const last = raw?.split(",").pop()?.trim();
  return last || (Array.isArray(ip) ? ip[0] ?? "unknown" : ip);
}
