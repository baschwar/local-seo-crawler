import type { NormalizedUrl } from "@seo-auditor/shared-types";

const unreserved = /^[A-Za-z0-9\-._~]$/;

function normalizePercentEncoding(value: string): string {
  return value.replace(/%[0-9a-fA-F]{2}/g, (encoded) => {
    const character = String.fromCharCode(Number.parseInt(encoded.slice(1), 16));
    return unreserved.test(character) ? character : encoded.toUpperCase();
  });
}

export function normalizeUrl(input: string, base?: string): NormalizedUrl {
  let url: URL;
  try {
    url = base ? new URL(input, base) : new URL(input);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }

  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
    url.port = "";
  }
  url.pathname = normalizePercentEncoding(url.pathname.replace(/\/{2,}/g, "/"));
  url.search = normalizePercentEncoding(url.search);
  const fragment = url.hash ? url.hash.slice(1) : "";
  url.hash = "";

  return {
    originalUrl: base ? new URL(input, base).href : new URL(input).href,
    normalizedUrl: url.href,
    scheme: url.protocol.slice(0, -1),
    host: url.host,
    path: url.pathname,
    query: url.search ? url.search.slice(1) : "",
    fragment
  };
}

export function isInternalUrl(candidate: string, startUrl: string, includeSubdomains: boolean): boolean {
  const candidateHost = new URL(candidate).hostname.toLowerCase();
  const startHost = new URL(startUrl).hostname.toLowerCase();
  return candidateHost === startHost || (includeSubdomains && candidateHost.endsWith(`.${startHost}`));
}

export function isPrivateNetworkLiteral(url: string): boolean {
  const host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1") return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a = 0, b = 0] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}
