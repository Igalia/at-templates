
// Minimal AT Protocol helpers over plain fetch — public XRPC, no auth, no SDK.
// Resolves a DID's PDS and reads records, so a template can dereference the
// `at://` URIs (and DIDs) a record points at.

const docCache = new Map<string, any>();

// Resolve a DID (or did:web) to its DID document, or null if not found.
export async function fetchDidDocument(did: string): Promise<any> {
  if (docCache.has(did)) return docCache.get(did);
  let doc = null;
  try {
    let url: URL | undefined;
    if (did.startsWith("did:web:")) {
      const hostPath = did.slice("did:web:".length).replace(/:/g, "/");
      url = safeHttpsUrl(`https://${hostPath}/.well-known/did.json`);
    } else {
      // did:plc and others go through the public PLC directory
      url = new URL(`https://plc.directory/${did}`);
    }
    if (url) doc = await getJSON(url);
  } catch {
    doc = null;
  }
  docCache.set(did, doc);
  return doc;
}

// Resolve a DID to its PDS service endpoint, or null if not found.
async function pdsFor(authority: string): Promise<string | null> {
  const doc = await fetchDidDocument(authority);
  const endpoint: unknown = (doc?.service || []).find(
    (s: any) => s.type === "AtprotoPersonalDataServer",
  )?.serviceEndpoint;
  if (typeof endpoint !== "string") return null;
  // Validate the serviceEndpoint before we ever fetch against it.
  return safeHttpsUrl(endpoint) ? endpoint : null;
}

const recordCache = new Map<string, any>();

// Resolve an `at://<authority>/<collection>/<rkey>` URI to that record's value,
// or null if it can't be resolved.
export async function fetchRecord(atUri: string): Promise<any> {
  if (recordCache.has(atUri)) return recordCache.get(atUri);

  let value = null;
  try {
    const [authority, collection, rkey] = atUri
      .slice("at://".length)
      .split("/");
    const pds = await pdsFor(authority);
    if (pds) {
      const u = new URL(`${pds}/xrpc/com.atproto.repo.getRecord`);
      u.searchParams.set("repo", authority);
      u.searchParams.set("collection", collection);
      u.searchParams.set("rkey", rkey);
      const res = await fetch(u);
      if (res.ok) value = ((await res.json()) as any).value;
    }
  } catch {
    value = null;
  }
  recordCache.set(atUri, value);
  return value;
}

async function getJSON(url: string | URL): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Validate that a URL string is a safe `https:` URL pointing to a public host.
 *
 * @param href
 *   URL string to check.
 * @returns
 *   URL object or nothing.
 */
function safeHttpsUrl(href: string): URL | undefined {
  let url: URL | undefined;
  try {
    url = new URL(href);
  } catch {}
  if (url && url.protocol === "https:" && !hostnamePrivate(url.hostname)) {
    return url;
  }
}

/**
 * Whether the hostname is a loopback address,
 * link-local address,
 * private-range address,
 * or otherwise not a public internet host.
 *
 * @param hostname
 *   Well-formed hostname to check.
 * @returns
 *   Whether the hostname is private.
 */
function hostnamePrivate(hostname: string): boolean {
  // IPv6 loopback / link-local.
  if (hostname === "::1") return true;
  if (hostname.startsWith("[")) {
    const inner = hostname.slice(1, -1).toLowerCase();
    // `::1` loopback, `fe80::/10` link-local.
    if (inner === "::1" || inner.startsWith("fe80:")) return true;
  }
  // Reject any hostname with no dot, single-label names are always internal.
  if (!hostname.includes(".")) return true;
  // IPv4 checks
  const parts = hostname.split(".");
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const [a, b] = parts.map(Number);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
  }
  return false;
}
