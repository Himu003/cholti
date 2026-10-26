import { decodeProtectedHeader, importPKCS8, importX509, jwtVerify, SignJWT } from "jose";

export type FsDocData = Record<string, unknown>;

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

let sa: ServiceAccount | null = null;
let accessToken: string | null = null;
let tokenExpiresAt = 0;

function getServiceAccount(): ServiceAccount {
  if (sa) return sa;
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!inline) throw new Error("Firebase credentials are not set");
  sa = JSON.parse(inline) as ServiceAccount;
  return sa;
}

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) return accessToken;
  const account = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/datastore" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(tokenUri)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await importPKCS8(account.private_key, "RS256"));
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  accessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
  return accessToken;
}

function baseUrl(account: ServiceAccount): string {
  return `https://firestore.googleapis.com/v1/projects/${account.project_id}/databases/(default)/documents`;
}

function encodeValue(v: unknown): Record<string, unknown> {
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (v === null) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, encodeValue(x)])) } };
}

function decodeValue(v: Record<string, unknown>): unknown {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return parseInt(String(v.integerValue), 10);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("bytesValue" in v) return v.bytesValue;
  if ("referenceValue" in v) return v.referenceValue;
  if ("geoPointValue" in v) return v.geoPointValue;
  if ("arrayValue" in v) {
    const values = (v.arrayValue as { values?: Array<Record<string, unknown>> })?.values ?? [];
    return values.map(decodeValue);
  }
  if ("mapValue" in v) {
    const fields = (v.mapValue as { fields?: Record<string, Record<string, unknown>> })?.fields ?? {};
    return decodeFields(fields);
  }
  return v;
}

function decodeFields(fields: Record<string, Record<string, unknown>>): FsDocData {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));
}

export type FsDocSnapshot = { exists: boolean; data: () => FsDocData };

export async function fsGetDoc(path: string): Promise<FsDocSnapshot | null> {
  const account = getServiceAccount();
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl(account)}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`firestore get failed: ${res.status}`);
  const doc = (await res.json()) as { name: string; fields: Record<string, Record<string, unknown>> };
  return { exists: true, data: () => decodeFields(doc.fields ?? {}) };
}

export async function fsQuery(
  collection: string,
  field: string,
  op: string,
  value: unknown
): Promise<Array<{ id: string; data: () => FsDocData }>> {
  if (op !== "==") throw new Error(`unsupported query operator: ${op}`);
  const account = getServiceAccount();
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl(account)}:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: encodeValue(value) } },
      },
    }),
  });
  if (!res.ok) throw new Error(`firestore query failed: ${res.status}`);
  const rows = (await res.json()) as Array<{
    document?: { name: string; fields: Record<string, Record<string, unknown>> };
  }>;
  return rows
    .filter((r) => r.document)
    .map((r) => ({
      id: r.document!.name.split("/").pop() ?? "",
      data: () => decodeFields(r.document!.fields ?? {}),
    }));
}

export async function fsAddDoc(collection: string, fields: FsDocData): Promise<string> {
  const account = getServiceAccount();
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl(account)}/${collection}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encodeValue(v)])),
    }),
  });
  if (!res.ok) throw new Error(`firestore add failed: ${res.status}`);
  const doc = (await res.json()) as { name: string };
  return doc.name.split("/").pop() ?? "";
}

const CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let certCache: { keys: Record<string, string>; at: number } | null = null;

export async function verifyIdToken(token: string): Promise<{ uid: string }> {
  const account = getServiceAccount();
  if (!certCache || Date.now() - certCache.at > 3_600_000) {
    const res = await fetch(CERT_URL);
    if (!res.ok) throw new Error(`cert fetch failed: ${res.status}`);
    certCache = { keys: (await res.json()) as Record<string, string>, at: Date.now() };
  }
  const { kid } = decodeProtectedHeader(token);
  const pem = certCache.keys[kid ?? ""] ?? Object.values(certCache.keys)[0];
  if (!pem) throw new Error("no matching cert");
  const { payload } = await jwtVerify(token, await importX509(pem, "RS256"), {
    algorithms: ["RS256"],
    issuer: `https://securetoken.google.com/${account.project_id}`,
    audience: account.project_id,
  });
  if (!payload.sub) throw new Error("no uid");
  return { uid: payload.sub };
}
