export class AccountingError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code = "ACCOUNTING_ERROR", status = 400) {
    super(message);
    this.name = "AccountingError";
    this.code = code;
    this.status = status;
  }
}

export function isAccountingError(err: unknown): err is AccountingError {
  return err instanceof AccountingError;
}
