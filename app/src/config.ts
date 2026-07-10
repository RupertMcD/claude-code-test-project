// Base URL of the backend. For local web dev this is localhost; for the phone
// set EXPO_PUBLIC_API_URL to your https tunnel (e.g. https://xxx.trycloudflare.com).
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";
