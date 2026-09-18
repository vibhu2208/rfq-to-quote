import { getStateCode, getStateName } from "@/lib/accounting/states";
import type {
  EInvoiceRequest,
  EInvoiceResult,
  FilingRequest,
  FilingResult,
  GspConfig,
  GstinVerification,
} from "@/lib/accounting/gsp-types";

export type { GspConfig, GstinVerification, EInvoiceRequest, EInvoiceResult, FilingRequest, FilingResult };

type TokenCache = { token: string; expiresAt: number };
let platformTokenCache: TokenCache | null = null;

export function resolveSandboxBaseUrl(cfg: GspConfig): string {
  if (cfg.baseUrl) return cfg.baseUrl.replace(/\/$/, "");
  const key = cfg.apiKey || "";
  if (key.startsWith("key_test_")) return "https://test-api.sandbox.co.in";
  return "https://api.sandbox.co.in";
}

function formatAddress(pradr: unknown): string | undefined {
  if (!pradr || typeof pradr !== "object") return undefined;
  const root = pradr as Record<string, unknown>;
  const addr = (root.addr && typeof root.addr === "object" ? root.addr : root) as Record<
    string,
    unknown
  >;
  const parts = [addr.bno, addr.bnm, addr.flno, addr.st, addr.loc, addr.stcd, addr.pncd]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

async function authenticatePlatform(cfg: GspConfig): Promise<string> {
  if (!cfg.apiKey || !cfg.apiSecret) {
    throw new Error("Sandbox API key and secret are required");
  }

  const now = Date.now();
  if (platformTokenCache && platformTokenCache.expiresAt > now + 60_000) {
    return platformTokenCache.token;
  }

  const baseUrl = resolveSandboxBaseUrl(cfg);
  const res = await fetch(`${baseUrl}/authenticate`, {
    method: "POST",
    headers: {
      "x-api-key": cfg.apiKey,
      "x-api-secret": cfg.apiSecret,
      "x-api-version": "1.0",
    },
  });
  const body = (await res.json().catch(() => ({}))) as {
    code?: number;
    data?: { access_token?: string };
    message?: string;
  };

  const token = body.data?.access_token;
  if (!res.ok || !token) {
    throw new Error(
      `Sandbox authenticate failed (${res.status}): ${body.message || JSON.stringify(body)}`
    );
  }

  platformTokenCache = { token, expiresAt: now + 23 * 60 * 60 * 1000 };
  return token;
}

async function sandboxHeaders(cfg: GspConfig): Promise<Record<string, string>> {
  const token = await authenticatePlatform(cfg);
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-api-key": cfg.apiKey!,
    authorization: token,
    "x-api-version": "1.0",
  };
}

export async function sandboxVerifyGstin(
  cfg: GspConfig,
  local: GstinVerification
): Promise<GstinVerification> {
  if (!cfg.enabled || !cfg.hasCredentials) {
    return {
      ...local,
      message:
        "Local GSTIN validation passed. Enable GSP credentials to confirm via Sandbox.",
    };
  }

  try {
    const baseUrl = resolveSandboxBaseUrl(cfg);
    const headers = await sandboxHeaders(cfg);
    const res = await fetch(`${baseUrl}/gst/compliance/public/gstin/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ gstin: local.gstin }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const dataRoot = (body.data as Record<string, unknown> | undefined) || {};
    // Success payload is usually data.data; FO8000 lives on data itself.
    const taxpayer =
      dataRoot.data && typeof dataRoot.data === "object"
        ? (dataRoot.data as Record<string, unknown>)
        : dataRoot;

    const errorCode = String(
      dataRoot.error_cd ||
        (body as { error?: { error_cd?: string } }).error?.error_cd ||
        (dataRoot as { error?: { error_cd?: string } }).error?.error_cd ||
        ""
    );
    const errorMessage = String(
      dataRoot.message ||
        (body as { message?: string }).message ||
        (body as { error?: { message?: string } }).error?.message ||
        ""
    );

    if (!res.ok || Number(body.code) >= 400) {
      return {
        ...local,
        valid: false,
        source: "gsp",
        message: errorMessage || `Sandbox GSTIN search failed (HTTP ${res.status})`,
        raw: body,
      };
    }

    if (errorCode === "FO8000" || (!taxpayer.lgnm && !taxpayer.tradeNam && !taxpayer.sts)) {
      return {
        ...local,
        valid: false,
        source: "gsp",
        message: errorMessage || "No GSTIN records found",
        raw: body,
      };
    }

    const legalName = String(taxpayer.lgnm || "").trim() || undefined;
    const tradeName = String(taxpayer.tradeNam || "").trim() || undefined;
    const status = String(taxpayer.sts || "ACTIVE").trim();
    const stateFromAddr =
      typeof taxpayer.pradr === "object" &&
      taxpayer.pradr &&
      typeof (taxpayer.pradr as { addr?: { stcd?: string } }).addr?.stcd === "string"
        ? (taxpayer.pradr as { addr: { stcd: string } }).addr.stcd
        : "";
    const stateCode =
      getStateCode(stateFromAddr) || local.stateCode || local.gstin.slice(0, 2);

    return {
      gstin: local.gstin,
      valid: status.toLowerCase() !== "cancelled",
      source: "gsp",
      legalName,
      tradeName,
      status,
      stateCode,
      stateName: stateCode ? getStateName(stateCode) || stateFromAddr || undefined : undefined,
      address: formatAddress(taxpayer.pradr),
      raw: body,
      message:
        status.toLowerCase() === "cancelled"
          ? "GSTIN found but status is Cancelled"
          : "GSTIN confirmed via Sandbox",
    };
  } catch (err) {
    return {
      ...local,
      source: "gsp",
      message: err instanceof Error ? err.message : "Sandbox GSTIN verify failed",
    };
  }
}

export async function sandboxGenerateEInvoice(
  cfg: GspConfig,
  req: EInvoiceRequest
): Promise<EInvoiceResult> {
  if (!cfg.enabled || !cfg.hasCredentials) {
    return {
      status: "SKIPPED",
      requestPayload: req.payload,
      responsePayload: { message: "Sandbox credentials missing" },
    };
  }

  const username = process.env.GSP_EINVOICE_USERNAME?.trim();
  const password = process.env.GSP_EINVOICE_PASSWORD?.trim();
  if (!username || !password) {
    return {
      status: "SKIPPED",
      requestPayload: req.payload,
      responsePayload: {
        message:
          "Sandbox GSTIN verify is live. E-invoice needs NIC API user credentials: set GSP_EINVOICE_USERNAME and GSP_EINVOICE_PASSWORD.",
        docs: "https://developer.sandbox.co.in/api-reference/gst/compliance/guides/e-invoice/overview",
      },
    };
  }

  try {
    const baseUrl = resolveSandboxBaseUrl(cfg);
    const headers = await sandboxHeaders(cfg);

    const authRes = await fetch(
      `${baseUrl}/gst/compliance/e-invoice/tax-payer/authenticate?force=true`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ username, password, gstin: req.gstin }),
      }
    );
    const authBody = (await authRes.json().catch(() => ({}))) as {
      code?: number;
      data?: {
        Status?: number;
        access_token?: string;
        ErrorDetails?: Array<{ ErrorMessage?: string }>;
        error?: { message?: string };
      };
    };
    const einvToken = authBody.data?.access_token;
    if (!authRes.ok || authBody.data?.Status === 0 || !einvToken) {
      return {
        status: "FAILED",
        requestPayload: req.payload,
        responsePayload: {
          step: "e-invoice-authenticate",
          body: authBody,
          message:
            authBody.data?.ErrorDetails?.[0]?.ErrorMessage ||
            authBody.data?.error?.message ||
            "E-invoice authentication failed",
        },
      };
    }

    const genRes = await fetch(`${baseUrl}/gst/compliance/e-invoice/tax-payer/invoice`, {
      method: "POST",
      headers: {
        ...headers,
        "x-irn-access-token": einvToken,
      },
      body: JSON.stringify(req.payload),
    });
    const genBody = (await genRes.json().catch(() => ({}))) as Record<string, unknown>;
    const data = (genBody.data as Record<string, unknown> | undefined) || genBody;
    const nested = (data.Data as Record<string, unknown> | undefined) || {};
    const irn = String(data.Irn || data.irn || nested.Irn || "");
    if (!genRes.ok || !irn) {
      return { status: "FAILED", requestPayload: req.payload, responsePayload: genBody };
    }
    return {
      status: "GENERATED",
      irn,
      acknowledgementNumber: String(data.AckNo || data.ackNo || nested.AckNo || ""),
      signedQrCode: String(data.SignedQRCode || data.signedQrCode || nested.SignedQRCode || ""),
      requestPayload: req.payload,
      responsePayload: genBody,
    };
  } catch (err) {
    return {
      status: "FAILED",
      requestPayload: req.payload,
      responsePayload: { error: err instanceof Error ? err.message : "request failed" },
    };
  }
}

export async function sandboxSubmitReturn(
  _cfg: GspConfig,
  req: FilingRequest
): Promise<FilingResult> {
  return {
    status: "SKIPPED",
    requestPayload: req.payload,
    responsePayload: {
      message:
        "Sandbox GSTR filing needs taxpayer OTP session. Local drafts still work; portal file after ASP taxpayer auth.",
      returnType: req.returnType,
      period: req.period,
    },
  };
}

export function clearSandboxTokenCache() {
  platformTokenCache = null;
}
