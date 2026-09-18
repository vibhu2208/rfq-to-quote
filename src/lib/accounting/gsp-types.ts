export type GspConfig = {
  enabled: boolean;
  provider: string;
  mode: "sandbox" | "production";
  baseUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  hasCredentials: boolean;
};

export type GstinVerification = {
  gstin: string;
  valid: boolean;
  source: "local" | "gsp" | "cache";
  legalName?: string;
  tradeName?: string;
  status?: string;
  stateCode?: string;
  stateName?: string;
  address?: string;
  raw?: Record<string, unknown>;
  message?: string;
};

export type EInvoiceRequest = {
  gstin: string;
  invoiceNumber: string;
  invoiceDate: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  approvedByUserId: string;
};

export type EInvoiceResult = {
  status: "GENERATED" | "PENDING" | "FAILED" | "SKIPPED";
  irn?: string;
  acknowledgementNumber?: string;
  signedQrCode?: string;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
};

export type FilingRequest = {
  gstin: string;
  returnType: "GSTR1" | "GSTR3B";
  period: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  approvedByUserId: string;
};

export type FilingResult = {
  status: "SUBMITTED" | "ACCEPTED" | "FAILED" | "SKIPPED";
  acknowledgementRef?: string;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
};

export interface GspProvider {
  verifyGstin(gstin: string): Promise<GstinVerification>;
  generateEInvoice(req: EInvoiceRequest): Promise<EInvoiceResult>;
  submitReturn(req: FilingRequest): Promise<FilingResult>;
  generateEWayBill(req: {
    gstin: string;
    invoiceId: string;
    payload: Record<string, unknown>;
    approvedByUserId: string;
    idempotencyKey: string;
  }): Promise<{
    status: "GENERATED" | "SKIPPED" | "FAILED";
    ewayBillNumber?: string;
    responsePayload: Record<string, unknown>;
  }>;
}
