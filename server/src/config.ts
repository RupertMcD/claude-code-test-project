import "dotenv/config";
import { readFileSync } from "node:fs";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required env var ${name}. Copy server/.env.example to server/.env and fill it in.`,
    );
  }
  return v;
}

export const config = {
  appId: required("EB_APP_ID"),
  privateKeyPath: required("EB_PRIVATE_KEY_PATH"),
  baseUrl: process.env.EB_BASE_URL?.replace(/\/$/, "") || "https://api.enablebanking.com",
  redirectUrl: required("EB_REDIRECT_URL"),
  country: process.env.EB_COUNTRY || "GB",
  port: Number(process.env.PORT || 8000),
};

/**
 * Reads the Enable Banking private key from disk once, at startup, so a missing
 * or unreadable key fails fast with a clear message (rather than on first API call).
 */
export function loadPrivateKey(): string {
  try {
    return readFileSync(config.privateKeyPath, "utf8");
  } catch (err) {
    throw new Error(
      `Could not read Enable Banking private key at EB_PRIVATE_KEY_PATH="${config.privateKeyPath}". ` +
        `Point it at the .pem you downloaded during registration (named <APP_ID>.pem). Original error: ${(err as Error).message}`,
    );
  }
}
