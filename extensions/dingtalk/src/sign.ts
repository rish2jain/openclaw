import { createHmac } from "node:crypto";

/**
 * Compute the DingTalk robot signing params.
 * DingTalk requires: sign = base64(HMAC-SHA256(timestamp + "\n" + secret))
 */
export function buildDingTalkSignParams(secret: string): {
  timestamp: string;
  sign: string;
} {
  const timestamp = Date.now().toString();
  const stringToSign = `${timestamp}\n${secret}`;
  const sign = createHmac("sha256", secret).update(stringToSign).digest("base64");
  return { timestamp, sign };
}

/**
 * Verify an incoming DingTalk webhook signature.
 * Returns true if the signature is valid.
 */
export function verifyDingTalkSignature(params: {
  timestamp: string;
  sign: string;
  secret: string;
}): boolean {
  const { timestamp, sign, secret } = params;
  const expected = buildDingTalkSignParams(secret);
  // Re-derive sign using the provided timestamp (not current time)
  const stringToSign = `${timestamp}\n${secret}`;
  const derivedSign = createHmac("sha256", secret).update(stringToSign).digest("base64");
  return sign === derivedSign && Math.abs(Date.now() - Number(timestamp)) < 60_000;
}
