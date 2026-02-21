import { Client } from "@microsoft/microsoft-graph-client";
import https from "https";

// Custom fetch that bypasses TLS verification for development
// (needed for corporate proxies with self-signed certs)
export const customFetch = (url: string | URL | Request, options?: RequestInit) => {
  const agent = new https.Agent({
    rejectUnauthorized: false,
  });
  return fetch(url, { ...options, agent } as RequestInit);
};

export function getGraphClient(accessToken: string) {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
    fetchOptions: {
      agent: new https.Agent({ rejectUnauthorized: false }),
    },
  });
}

/** Escape single quotes in OData filter strings to prevent injection */
export function sanitizeOData(value: string): string {
  return value.replace(/'/g, "''");
}
