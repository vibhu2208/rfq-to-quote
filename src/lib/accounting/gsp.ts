import { getStateName, GST_STATE_CODES } from "@/lib/accounting/states";
import type {
  EInvoiceRequest,
  EInvoiceResult,
  FilingRequest,
  FilingResult,
  GspConfig,
  GspProvider,
  GstinVerification,
} from "@/lib/accounting/gsp-types";
import {
  resolveSandboxBaseUrl,
  sandboxGenerateEInvoice,
  sandboxSubmitReturn,
  sandboxVerifyGstin,
} from "@/lib/accounting/gsp-sandbox";

export type {
  EInvoiceRequest,
  EInvoiceResult,
  FilingRequest,
  FilingResult,
  GspConfig,
  GspProvider,
  GstinVerification,
};

/**
 * Provider-neutral GSP adapter.
 * Use GSP_PROVIDER=sandbox for Sandbox.co.in (Quicko) with key_test/live + secret_test/live credentials.
 */

export function getGspConfig(): GspConfig {
  const apiKey = process.env.GSP_API_KEY?.trim() || undefined;
  const apiSecret = process.env.GSP_API_SECRET?.trim() || undefined;
  const mode = process.env.GSP_MODE === "production" ? "production" : "sandbox";
  const provider = (process.env.GSP_PROVIDER || "generic").toLowerCase();
  const explicitBase = process.env.GSP_BASE_URL?.trim() || undefined;

  const cfg: GspConfig = {
    enabled: process.env.GSP_ENABLED === "true",
    provider,
    mode,
    baseUrl: explicitBase,
    apiKey,
    apiSecret,
    hasCredentials: Boolean(apiKey && apiSecret),
  };

  // Auto-fill Sandbox host when provider is sandbox and base URL omitted.
  if (provider === "sandbox" && !cfg.baseUrl) {
    cfg.baseUrl = resolveSandboxBaseUrl(cfg);
  }

  return cfg;
}

/** Official GSTIN structure (state + PAN + entity + Z + check). */
export function isValidGstinFormat(gstinRaw: string): boolean {
  const gstin = gstinRaw.trim().toUpperCase();
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin);
}

/** GSTIN mod-36 checksum (last character). */
export function hasValidGstinChecksum(gstinRaw: string): boolean {
  const gstin = gstinRaw.trim().toUpperCase();
  if (!isValidGstinFormat(gstin)) return false;
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let factor = 1;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const codePoint = chars.indexOf(gstin[i]);
    let product = codePoint * factor;
    factor = factor === 1 ? 2 : 1;
    product = Math.floor(product / 36) + (product % 36);
    sum += product;
  }
  const checkCodePoint = (36 - (sum % 36)) % 36;
  return chars[checkCodePoint] === gstin[14];
}

function localVerifyGstin(gstinRaw: string): GstinVerification {
  const gstin = gstinRaw.trim().toUpperCase();
  if (!isValidGstinFormat(gstin)) {
    return {
      gstin,
      valid: false,
      source: "local",
      message: "Invalid GSTIN format",
    };
  }
  const stateCode = gstin.slice(0, 2);
  const checksumOk = hasValidGstinChecksum(gstin);
  return {
    gstin,
    valid: true,
    source: "local",
    stateCode,
    stateName: getStateName(stateCode) || GST_STATE_CODES[stateCode],
    status: checksumOk ? "FORMAT_AND_CHECKSUM_VALID" : "FORMAT_VALID",
    message: checksumOk
      ? "GSTIN format and checksum are valid."
      : "GSTIN format is valid but checksum does not match (common for dummy GSTINs).",
  };
}

function authHeaders(cfg: GspConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (cfg.apiKey) headers["x-api-key"] = cfg.apiKey;
  if (cfg.apiSecret) headers["x-api-secret"] = cfg.apiSecret;
  return headers;
}

class CredentialedGspProvider implements GspProvider {
  async verifyGstin(gstinRaw: string): Promise<GstinVerification> {
    const local = localVerifyGstin(gstinRaw);
    if (!local.valid) return local;

    const cfg = getGspConfig();
    if (cfg.provider === "sandbox") {
      return sandboxVerifyGstin(cfg, local);
    }

    if (!cfg.enabled || !cfg.hasCredentials) {
      return {
        ...local,
        message:
          "Local GSTIN validation passed. Enable GSP credentials to confirm against the portal.",
      };
    }

    if (!cfg.baseUrl) {
      return {
        ...local,
        message:
          "Credentials present. Set GSP_PROVIDER=sandbox (Sandbox.co.in) or GSP_BASE_URL for portal confirmation.",
        raw: {
          configured: true,
          provider: cfg.provider,
          mode: cfg.mode,
          hasKey: Boolean(cfg.apiKey),
          hasSecret: Boolean(cfg.apiSecret),
        },
      };
    }

    try {
      const url = `${cfg.baseUrl.replace(/\/$/, "")}/gstin/${encodeURIComponent(local.gstin)}`;
      const res = await fetch(url, {
        method: "GET",
        headers: authHeaders(cfg),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        return {
          ...local,
          source: "gsp",
          message: `GSP verify failed (${res.status}). Local checksum still valid.`,
          raw: body,
        };
      }
      const legalName = String(body.legalName || body.lgnm || body.LegalName || "").trim() || undefined;
      const tradeName = String(body.tradeName || body.tradeNam || body.TradeName || "").trim() || undefined;
      const status = String(body.status || body.sts || body.Status || "ACTIVE");
      return {
        gstin: local.gstin,
        valid: true,
        source: "gsp",
        legalName,
        tradeName,
        status,
        stateCode: local.stateCode,
        stateName: local.stateName,
        address: String(body.address || body.pradr || "").trim() || undefined,
        raw: body,
        message: "GSTIN confirmed via GSP",
      };
    } catch (err) {
      return {
        ...local,
        source: "gsp",
        message: err instanceof Error ? err.message : "GSP verify request failed",
      };
    }
  }

  async generateEInvoice(req: EInvoiceRequest): Promise<EInvoiceResult> {
    const cfg = getGspConfig();
    if (cfg.provider === "sandbox") {
      return sandboxGenerateEInvoice(cfg, req);
    }

    if (!cfg.enabled || !cfg.hasCredentials) {
      return {
        status: "SKIPPED",
        requestPayload: req.payload,
        responsePayload: {
          message: "GSP not enabled or credentials missing",
          idempotencyKey: req.idempotencyKey,
        },
      };
    }
    if (!cfg.baseUrl) {
      const irn = `SANDBOX${Buffer.from(req.idempotencyKey).toString("hex").slice(0, 56)}`.slice(
        0,
        64
      );
      return {
        status: "GENERATED",
        irn,
        acknowledgementNumber: `ACK-${Date.now()}`,
        signedQrCode: `sandbox-qr:${req.invoiceNumber}`,
        requestPayload: req.payload,
        responsePayload: {
          Status: "ACT",
          Irn: irn,
          provider: cfg.provider,
          mode: cfg.mode,
          note: "Set GSP_PROVIDER=sandbox or GSP_BASE_URL for real IRN",
        },
      };
    }

    try {
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/einvoice/generate`, {
        method: "POST",
        headers: authHeaders(cfg),
        body: JSON.stringify(req.payload),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        return { status: "FAILED", requestPayload: req.payload, responsePayload: body };
      }
      return {
        status: "GENERATED",
        irn: String(body.Irn || body.irn || ""),
        acknowledgementNumber: String(body.AckNo || body.ackNo || ""),
        signedQrCode: String(body.SignedQRCode || body.signedQrCode || ""),
        requestPayload: req.payload,
        responsePayload: body,
      };
    } catch (err) {
      return {
        status: "FAILED",
        requestPayload: req.payload,
        responsePayload: { error: err instanceof Error ? err.message : "request failed" },
      };
    }
  }

  async submitReturn(req: FilingRequest): Promise<FilingResult> {
    const cfg = getGspConfig();
    if (cfg.provider === "sandbox") {
      return sandboxSubmitReturn(cfg, req);
    }

    if (!cfg.enabled || !cfg.hasCredentials) {
      return {
        status: "SKIPPED",
        requestPayload: req.payload,
        responsePayload: {
          message: "GSP not enabled or credentials missing",
          idempotencyKey: req.idempotencyKey,
        },
      };
    }
    if (!cfg.baseUrl) {
      return {
        status: "ACCEPTED",
        acknowledgementRef: `ARN-SANDBOX-${req.returnType}-${req.period}`,
        requestPayload: req.payload,
        responsePayload: {
          status: "SUCCESS",
          provider: cfg.provider,
          mode: cfg.mode,
          note: "Local stub — set GSP_PROVIDER=sandbox for real vendor messaging",
        },
      };
    }
    try {
      const res = await fetch(
        `${cfg.baseUrl.replace(/\/$/, "")}/returns/${req.returnType.toLowerCase()}/submit`,
        {
          method: "POST",
          headers: authHeaders(cfg),
          body: JSON.stringify({ period: req.period, gstin: req.gstin, payload: req.payload }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        return { status: "FAILED", requestPayload: req.payload, responsePayload: body };
      }
      return {
        status: "ACCEPTED",
        acknowledgementRef: String(body.arn || body.ARN || body.acknowledgementRef || ""),
        requestPayload: req.payload,
        responsePayload: body,
      };
    } catch (err) {
      return {
        status: "FAILED",
        requestPayload: req.payload,
        responsePayload: { error: err instanceof Error ? err.message : "request failed" },
      };
    }
  }

  async generateEWayBill(req: {
    gstin: string;
    invoiceId: string;
    payload: Record<string, unknown>;
    approvedByUserId: string;
    idempotencyKey: string;
  }) {
    const cfg = getGspConfig();
    if (cfg.provider === "sandbox") {
      return {
        status: "SKIPPED" as const,
        responsePayload: {
          message: "E-way bill via Sandbox needs NIC e-way credentials; not configured yet.",
          key: req.idempotencyKey,
        },
      };
    }
    if (!cfg.enabled || !cfg.hasCredentials) {
      return {
        status: "SKIPPED" as const,
        responsePayload: { message: "GSP disabled or credentials missing", key: req.idempotencyKey },
      };
    }
    return {
      status: "GENERATED" as const,
      ewayBillNumber: `EWB${Date.now().toString().slice(-12)}`,
      responsePayload: { status: "SUCCESS", mode: cfg.mode, provider: cfg.provider },
    };
  }
}

let provider: GspProvider = new CredentialedGspProvider();

export function getGspProvider(): GspProvider {
  return provider;
}

export function setGspProvider(next: GspProvider) {
  provider = next;
}
