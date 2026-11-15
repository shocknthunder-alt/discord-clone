import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import { env } from "../env.js";

/**
 * "Влез с Google / Microsoft": the app gets an ID token from the provider's own sign-in window and
 * sends it here; we check its signature (the provider's published keys), audience (our client ID),
 * issuer and expiry. No provider secrets are needed or stored.
 */

export type OAuthProvider = "google" | "microsoft";

export interface OAuthProfile {
  provider: OAuthProvider;
  /** Stable id of the person at the provider. */
  subject: string;
  email: string | null;
  /** Whether the provider vouches that the e-mail is theirs (Google: email_verified). */
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const microsoftKeys = createRemoteJWKSet(new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"));

export function oauthConfig() {
  return { google: env.GOOGLE_CLIENT_ID ?? null, microsoft: env.MICROSOFT_CLIENT_ID ?? null };
}

export async function verifyIdToken(provider: OAuthProvider, idToken: string): Promise<OAuthProfile> {
  if (provider === "google") {
    if (!env.GOOGLE_CLIENT_ID) throw new Error("google sign-in is not configured");
    const { payload } = await jwtVerify(idToken, googleKeys, {
      audience: env.GOOGLE_CLIENT_ID,
      issuer: ["https://accounts.google.com", "accounts.google.com"],
    });
    if (typeof payload.sub !== "string") throw new Error("no subject");
    return {
      provider,
      subject: payload.sub,
      email: typeof payload.email === "string" ? payload.email.toLowerCase() : null,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === "string" ? payload.name : null,
      picture: typeof payload.picture === "string" ? payload.picture : null,
    };
  }

  if (!env.MICROSOFT_CLIENT_ID) throw new Error("microsoft sign-in is not configured");
  // Multi-tenant ("common"): the issuer names the person's own tenant — check its shape against the
  // token's tid instead of a fixed value.
  const tid = decodeJwt(idToken).tid;
  if (typeof tid !== "string" || !/^[0-9a-f-]{36}$/i.test(tid)) throw new Error("bad tenant");
  const { payload } = await jwtVerify(idToken, microsoftKeys, {
    audience: env.MICROSOFT_CLIENT_ID,
    issuer: `https://login.microsoftonline.com/${tid}/v2.0`,
  });
  // oid = the same person across apps of that tenant; fall back to sub.
  const subject = typeof payload.oid === "string" ? `${tid}:${payload.oid}` : typeof payload.sub === "string" ? payload.sub : null;
  if (!subject) throw new Error("no subject");
  const email =
    typeof payload.email === "string" ? payload.email : typeof payload.preferred_username === "string" && payload.preferred_username.includes("@") ? payload.preferred_username : null;
  return {
    provider,
    subject,
    email: email ? email.toLowerCase() : null,
    // Microsoft doesn't promise the address is verified → an existing account is linked only after
    // its password is given once.
    emailVerified: false,
    name: typeof payload.name === "string" ? payload.name : null,
    picture: null,
  };
}
