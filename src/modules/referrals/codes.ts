import "server-only";

import { randomInt } from "node:crypto";

import { REFERRAL_CODE_ALPHABET, REFERRAL_CODE_LENGTH } from "./schemas";

/**
 * A new share code: 6 characters of the unambiguous alphabet (no 0/O, 1/I), drawn with crypto.randomInt — about one
 * billion combinations. Uniqueness is enforced by the referrers_code_uq index (the service retries on a collision).
 */
export function generateReferralCode(random: (max: number) => number = randomInt): string {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) code += REFERRAL_CODE_ALPHABET[random(REFERRAL_CODE_ALPHABET.length)];
  return code;
}
