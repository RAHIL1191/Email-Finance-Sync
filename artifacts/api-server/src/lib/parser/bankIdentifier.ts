import { BANK_DOMAINS, REJECT_SUBJECT_PATTERNS } from "./constants.js";
import { stripSubjectPrefixes } from "./utils.js";

export function identifyBank(
  fromAddress: string,
  forwardedFrom: string
): string | null {
  const candidates = [fromAddress, forwardedFrom].filter(Boolean);
  for (const addr of candidates) {
    for (const { pattern, name } of BANK_DOMAINS) {
      if (pattern.test(addr)) return name;
    }
  }
  return null;
}

export function identifyBankFromBody(text: string): string {
  const checks: Array<[RegExp, string]> = [
    [/\bTD Canada Trust\b|\bTD Bank\b/i, "TD"],
    [/\bRBC\b|\bRoyal Bank\b/i, "RBC"],
    [/\bScotiabank\b/i, "Scotiabank"],
    [/\bBMO\b|\bBank of Montreal\b/i, "BMO"],
    [/\bCIBC\b/i, "CIBC"],
    [/\bTangerine\b/i, "Tangerine"],
    [/\bNational Bank\b|\bBNC\b/i, "National Bank"],
    [/\bDesjardins\b/i, "Desjardins"],
    [/\bChase\b/i, "Chase"],
    [/\bInterac\b/i, "Interac"],
  ];
  for (const [re, name] of checks) {
    if (re.test(text)) return name;
  }
  return "Bank";
}

export function shouldRejectSubject(subject: string): boolean {
  const clean = stripSubjectPrefixes(subject);
  return REJECT_SUBJECT_PATTERNS.some((p) => p.test(clean));
}
