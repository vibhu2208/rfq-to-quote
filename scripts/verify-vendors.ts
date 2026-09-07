import "dotenv/config";
import { readFile } from "node:fs/promises";
import { prisma } from "../src/lib/prisma";
import { normalizeProductKey } from "../src/lib/product-key";
import { matchVendorsToRfq } from "../src/lib/vendor-match";
import {
  buildVendorImportPreview,
  commitVendorImport,
  parseVendorFile,
} from "../src/lib/vendor-import";

const cases = [
  {
    label: "i7 PC",
    expectedKey: "computer-i7-32gb-1tb",
    parsedCategory: "Computers & Laptops",
    parsedSpecs: {
      description: "Core i7 desktop PC",
      specs: { processor: "i7", ram: "32GB", storage: "1TB SSD" },
    },
    rawText: "Need 2 i7 PC with 32GB RAM and 1TB SSD",
  },
  {
    label: "RAM",
    expectedKey: "ram-16gb-ddr4",
    parsedCategory: "Memory (RAM)",
    parsedSpecs: {
      description: "16GB DDR4 memory",
      specs: { capacity: "16GB", generation: "DDR4" },
    },
    rawText: "Need i5 computer and 16GB RAM",
  },
  {
    label: "32 inch screen",
    expectedKey: "monitor-32-4k",
    parsedCategory: "Monitors & Displays",
    parsedSpecs: {
      description: "32 inch 4K screen",
      specs: { size: "32 inch", resolution: "4K" },
    },
    rawText: "Need a 32 inch 4K monitor",
  },
];

async function main() {
  const vendorCount = await prisma.vendor.count({ where: { active: true } });
  if (vendorCount < 5) throw new Error(`Expected 5 active vendors, found ${vendorCount}`);

  for (const input of cases) {
    const productKey = normalizeProductKey(input);
    if (productKey !== input.expectedKey) {
      throw new Error(
        `${input.label}: expected ${input.expectedKey}, received ${productKey}`
      );
    }
    const result = await matchVendorsToRfq(input);
    if (!result.matches.length) throw new Error(`${input.label}: no vendor match`);
    console.log(
      `${input.label}: ${productKey} -> ${result.matches[0].vendor.name} (${result.matches[0].score})`
    );
  }

  const file = await readFile("sample-vendors.csv");
  const preview = await buildVendorImportPreview(
    parseVendorFile(file, "sample-vendors.csv")
  );
  if (preview.summary.groupedVendors !== 5 || preview.summary.updates !== 5) {
    throw new Error(`Unexpected import preview: ${JSON.stringify(preview.summary)}`);
  }
  console.log("Import preview:", preview.summary);
  const committed = await commitVendorImport(preview.items);
  if (committed.updated !== 5 || committed.created !== 0) {
    throw new Error(`Unexpected import commit: ${JSON.stringify(committed)}`);
  }
  console.log("Import commit:", committed);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
