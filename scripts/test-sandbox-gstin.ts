/**
 * Smoke-test Sandbox.co.in authenticate + GSTIN search using .env credentials.
 * Usage: npx tsx scripts/test-sandbox-gstin.ts [GSTIN]
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });

import { getGspConfig, getGspProvider } from "../src/lib/accounting/gsp";

async function main() {
  const gstin = process.argv[2] || "29AAFCD5862R000";
  const cfg = getGspConfig();
  console.log("config", {
    enabled: cfg.enabled,
    provider: cfg.provider,
    mode: cfg.mode,
    baseUrl: cfg.baseUrl,
    hasCredentials: cfg.hasCredentials,
    keyPrefix: cfg.apiKey?.slice(0, 10),
  });

  const result = await getGspProvider().verifyGstin(gstin);
  console.log(
    JSON.stringify(
      {
        gstin: result.gstin,
        valid: result.valid,
        source: result.source,
        legalName: result.legalName,
        tradeName: result.tradeName,
        status: result.status,
        stateCode: result.stateCode,
        stateName: result.stateName,
        address: result.address,
        message: result.message,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
