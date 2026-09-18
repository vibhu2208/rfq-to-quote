import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

/** Electronics trader catalog — CCTV, computers, peripherals, storage, networking */
const ELECTRONICS_PRODUCTS = [
  {
    code: "CCTV-DVR-8CH",
    name: "8CH HD DVR",
    description: "8 channel HD DVR, HDMI out, supports 5MP cameras, 1 SATA",
    unit: "pcs",
    basePrice: 3200,
    offerPrice: 4500,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "CCTV-NVR-16CH",
    name: "16CH NVR 4K",
    description: "16 channel PoE NVR, 4K playback, 2 SATA bays",
    unit: "pcs",
    basePrice: 9800,
    offerPrice: 13500,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "CCTV-CAM-DOME",
    name: "2MP Dome Camera",
    description: "2MP IR dome CCTV camera, 3.6mm lens, night vision 20m",
    unit: "pcs",
    basePrice: 750,
    offerPrice: 1100,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "CCTV-CAM-BULLET",
    name: "5MP Bullet Camera",
    description: "5MP outdoor bullet camera, IP66, IR 30m",
    unit: "pcs",
    basePrice: 1450,
    offerPrice: 2100,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "CCTV-CAM-PTZ",
    name: "2MP PTZ Camera",
    description: "2MP PTZ speed dome, 20x optical zoom, outdoor",
    unit: "pcs",
    basePrice: 12500,
    offerPrice: 16800,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "PC-DESK-I5",
    name: "Desktop PC Core i5",
    description: "Intel Core i5, 16GB RAM, 512GB SSD, Win 11 ready (assembled)",
    unit: "pcs",
    basePrice: 28500,
    offerPrice: 34990,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "PC-DESK-I7",
    name: "Desktop PC Core i7",
    description: "Intel Core i7, 32GB RAM, 1TB SSD, for office / design use",
    unit: "pcs",
    basePrice: 52000,
    offerPrice: 62500,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "LAP-I5-14",
    name: "Laptop 14 inch Core i5",
    description: "14 inch business laptop, i5, 16GB RAM, 512GB SSD",
    unit: "pcs",
    basePrice: 42000,
    offerPrice: 49990,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "MON-24-FHD",
    name: "24 inch Full HD Monitor",
    description: "24 inch IPS FHD monitor, HDMI + VGA, 75Hz",
    unit: "pcs",
    basePrice: 7200,
    offerPrice: 9490,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "MON-32-4K",
    name: "32 inch 4K Monitor",
    description: "32 inch 4K UHD monitor, HDMI/DP, for CCTV / editing",
    unit: "pcs",
    basePrice: 18500,
    offerPrice: 22990,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "HDD-2TB-SURV",
    name: "2TB Surveillance HDD",
    description: "2TB CCTV/surveillance hard disk, 24x7 rated",
    unit: "pcs",
    basePrice: 4200,
    offerPrice: 5490,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "HDD-4TB-SURV",
    name: "4TB Surveillance HDD",
    description: "4TB CCTV/surveillance hard disk, 24x7 rated",
    unit: "pcs",
    basePrice: 7800,
    offerPrice: 9990,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "SSD-512",
    name: "512GB SATA SSD",
    description: "512GB 2.5 inch SATA SSD for desktop / laptop upgrade",
    unit: "pcs",
    basePrice: 2800,
    offerPrice: 3690,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "RAM-DDR4-8",
    name: "8GB DDR4 RAM",
    description: "8GB DDR4 3200MHz desktop RAM module",
    unit: "pcs",
    basePrice: 1450,
    offerPrice: 1990,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "RAM-DDR4-16",
    name: "16GB DDR4 RAM",
    description: "16GB DDR4 3200MHz desktop RAM module",
    unit: "pcs",
    basePrice: 2800,
    offerPrice: 3690,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "SW-POE-8",
    name: "8 Port PoE Switch",
    description: "8 port Gigabit PoE switch for IP cameras, 120W budget",
    unit: "pcs",
    basePrice: 3200,
    offerPrice: 4500,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "CAB-CAT6-305",
    name: "CAT6 Cable Box 305m",
    description: "CAT6 UTP network cable, 305 meter box",
    unit: "box",
    basePrice: 5200,
    offerPrice: 6800,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "UPS-600VA",
    name: "600VA UPS",
    description: "600VA line-interactive UPS for PC / DVR backup",
    unit: "pcs",
    basePrice: 2100,
    offerPrice: 2890,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "UPS-1KVA",
    name: "1kVA UPS",
    description: "1kVA UPS for CCTV / small office load",
    unit: "pcs",
    basePrice: 4800,
    offerPrice: 6490,
    taxRate: 18,
    taxCategory: "GST18",
  },
  {
    code: "SVC-INSTALL",
    name: "On-site Installation",
    description: "CCTV / PC / network installation labour (per day)",
    unit: "day",
    basePrice: 1500,
    offerPrice: 2500,
    taxRate: 18,
    taxCategory: "GST18",
    productType: "SERVICE" as const,
  },
] as const;

const ELECTRONICS_VENDORS = [
  {
    name: "Vision Secure Systems",
    phone: "+919810000101",
    email: "sales@visionsecure.example",
    preferredChannel: "EMAIL" as const,
    categories: [
      {
        category: "CCTV & Surveillance",
        subcategory: "Cameras & Recorders",
        keywords: ["cctv", "camera", "dome", "bullet", "ptz", "dvr", "nvr", "2mp", "5mp"],
      },
      {
        category: "Storage (HDD / SSD)",
        subcategory: "Surveillance HDD",
        keywords: ["surveillance", "hdd", "2tb", "4tb", "recording"],
      },
    ],
    history: [
      { productKey: "cctv-2mp-dome", lastPrice: 980 },
      { productKey: "cctv-5mp-bullet", lastPrice: 1850 },
    ],
  },
  {
    name: "TechBridge Computers",
    phone: "+919810000102",
    email: "quotes@techbridge.example",
    preferredChannel: "EMAIL" as const,
    categories: [
      {
        category: "Computers & Laptops",
        subcategory: "Business PCs",
        keywords: ["computer", "desktop", "laptop", "pc", "i5", "i7", "business"],
      },
      {
        category: "Memory (RAM)",
        subcategory: "Desktop Memory",
        keywords: ["ram", "memory", "ddr4", "8gb", "16gb", "32gb"],
      },
    ],
    history: [
      { productKey: "computer-i5-16gb-512gb", lastPrice: 32600 },
      { productKey: "computer-i7-32gb-1tb", lastPrice: 58500 },
    ],
  },
  {
    name: "Display Hub",
    phone: "+919810000103",
    email: "sales@displayhub.example",
    preferredChannel: "EMAIL" as const,
    categories: [
      {
        category: "Monitors & Displays",
        subcategory: "LED & IPS",
        keywords: ["monitor", "display", "screen", "led", "ips", "24", "32", "4k"],
      },
    ],
    history: [
      { productKey: "monitor-24-fhd", lastPrice: 8700 },
      { productKey: "monitor-32-4k", lastPrice: 20900 },
    ],
  },
  {
    name: "NetWire Solutions",
    phone: "+919810000104",
    email: "orders@netwire.example",
    preferredChannel: "EMAIL" as const,
    categories: [
      {
        category: "Networking & Cables",
        subcategory: "PoE & CAT6",
        keywords: ["network", "poe", "switch", "cat6", "cable", "gigabit"],
      },
    ],
    history: [{ productKey: "network-poe", lastPrice: 4150 }],
  },
  {
    name: "PowerSafe India",
    phone: "+919810000105",
    email: "sales@powersafe.example",
    preferredChannel: "EMAIL" as const,
    categories: [
      {
        category: "UPS & Power",
        subcategory: "UPS",
        keywords: ["ups", "600va", "1kva", "backup", "power"],
      },
    ],
    history: [{ productKey: "ups-1kva", lastPrice: 5900 }],
  },
] as const;

async function main() {
  const configuredPassword = process.env.SEED_ADMIN_PASSWORD;
  const bootstrapPassword = configuredPassword ?? randomBytes(32).toString("base64url");
  const passwordHash = await bcrypt.hash(bootstrapPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: configuredPassword ? { passwordHash } : {},
    create: {
      email: "admin@example.com",
      name: "Admin",
      passwordHash,
    },
  });

  const organisation = await prisma.organisation.upsert({
    where: { code: "DEFAULT" },
    update: {
      name: "Default Organisation",
      status: "ACTIVE",
      inventoryPolicy: "WEIGHTED_AVERAGE",
    },
    create: {
      code: "DEFAULT",
      name: "Default Organisation",
      inventoryPolicy: "WEIGHTED_AVERAGE",
      policyMetadata: {
        inventoryValuation: "WEIGHTED_AVERAGE",
        negativeStockAllowed: false,
        costingPrecision: 4,
      },
    },
  });

  const legalEntity = await prisma.legalEntity.upsert({
    where: {
      organisationId_legalName: {
        organisationId: organisation.id,
        legalName: "Default Organisation",
      },
    },
    update: { active: true },
    create: {
      organisationId: organisation.id,
      name: "Default Organisation",
      legalName: "Default Organisation",
      entityType: "PROPRIETORSHIP",
    },
  });

  // A syntactically valid non-production GSTIN reserved for local bootstrap data.
  const gstRegistration = await prisma.gSTRegistration.upsert({
    where: { gstin: "29AAAAA0000A1Z5" },
    update: { legalEntityId: legalEntity.id, active: true },
    create: {
      legalEntityId: legalEntity.id,
      gstin: "29AAAAA0000A1Z5",
      stateCode: "29",
      tradeName: "Default Organisation",
    },
  });

  const location = await prisma.businessLocation.upsert({
    where: {
      gstRegistrationId_code: {
        gstRegistrationId: gstRegistration.id,
        code: "HO",
      },
    },
    update: { active: true, isPrimary: true },
    create: {
      gstRegistrationId: gstRegistration.id,
      code: "HO",
      name: "Head Office",
      addressLine1: "Local development address",
      city: "Bengaluru",
      state: "Karnataka",
      stateCode: "29",
      postalCode: "560001",
      isPrimary: true,
    },
  });

  const roleDefs = [
    { code: "ADMIN", name: "Administrator", description: "Full organisation administration" },
    { code: "OWNER", name: "Owner", description: "Business owner" },
    { code: "ACCOUNTANT", name: "Accountant", description: "Journals, GST, payments" },
    { code: "SALES", name: "Sales", description: "Quotes, proformas, invoices" },
    { code: "INVENTORY", name: "Inventory Manager", description: "Stock movements and warehouses" },
    { code: "AUDITOR", name: "Auditor", description: "Read-only financial audit access" },
  ] as const;

  const roles: Record<string, { id: string }> = {};
  for (const def of roleDefs) {
    roles[def.code] = await prisma.role.upsert({
      where: {
        organisationId_code: {
          organisationId: organisation.id,
          code: def.code,
        },
      },
      update: { name: def.name, description: def.description, system: true },
      create: {
        organisationId: organisation.id,
        code: def.code,
        name: def.name,
        description: def.description,
        system: true,
      },
    });
  }
  const adminRole = roles.ADMIN;

  const membership = await prisma.organisationMembership.upsert({
    where: {
      organisationId_userId: {
        organisationId: organisation.id,
        userId: admin.id,
      },
    },
    update: { status: "ACTIVE", joinedAt: new Date() },
    create: {
      organisationId: organisation.id,
      userId: admin.id,
      status: "ACTIVE",
      joinedAt: new Date(),
    },
  });

  await prisma.membershipRole.upsert({
    where: {
      membershipId_roleId: {
        membershipId: membership.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: { membershipId: membership.id, roleId: adminRole.id },
  });

  const permissionDefs = [
    ["organisation.manage", "Manage all organisation settings and transactions"],
    ["invoice.issue", "Issue and cancel tax invoices"],
    ["invoice.file", "Approve GST and e-invoice submissions"],
    ["inventory.adjust", "Post inventory adjustments"],
    ["journal.post", "Post and reverse journals"],
    ["reports.read", "Read financial and GST reports"],
  ] as const;

  for (const [code, description] of permissionDefs) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: { description },
      create: { code, description },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      },
      update: { effect: "ALLOW" },
      create: {
        roleId: adminRole.id,
        permissionId: permission.id,
        effect: "ALLOW",
      },
    });
  }

  // Grant accountant filing + journal permissions
  for (const code of ["invoice.issue", "invoice.file", "journal.post", "reports.read"] as const) {
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code } });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: roles.ACCOUNTANT.id, permissionId: permission.id },
      },
      update: { effect: "ALLOW" },
      create: {
        roleId: roles.ACCOUNTANT.id,
        permissionId: permission.id,
        effect: "ALLOW",
      },
    });
  }
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const fiscalStartYear = now.getUTCMonth() >= 3 ? currentYear : currentYear - 1;
  const fiscalStart = new Date(Date.UTC(fiscalStartYear, 3, 1));
  const fiscalEnd = new Date(Date.UTC(fiscalStartYear + 1, 2, 31));
  const fiscalYear = await prisma.fiscalYear.upsert({
    where: {
      legalEntityId_startsOn: {
        legalEntityId: legalEntity.id,
        startsOn: fiscalStart,
      },
    },
    update: { name: `FY ${fiscalStartYear}-${String(fiscalStartYear + 1).slice(-2)}` },
    create: {
      organisationId: organisation.id,
      legalEntityId: legalEntity.id,
      name: `FY ${fiscalStartYear}-${String(fiscalStartYear + 1).slice(-2)}`,
      startsOn: fiscalStart,
      endsOn: fiscalEnd,
    },
  });

  for (let index = 0; index < 12; index += 1) {
    const startsOn = new Date(Date.UTC(fiscalStartYear, 3 + index, 1));
    const endsOn = new Date(Date.UTC(fiscalStartYear, 4 + index, 0));
    await prisma.fiscalPeriod.upsert({
      where: {
        fiscalYearId_number: {
          fiscalYearId: fiscalYear.id,
          number: index + 1,
        },
      },
      update: { startsOn, endsOn },
      create: {
        fiscalYearId: fiscalYear.id,
        number: index + 1,
        name: startsOn.toLocaleString("en-IN", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }),
        startsOn,
        endsOn,
      },
    });
  }

  await prisma.warehouse.upsert({
    where: {
      organisationId_code: {
        organisationId: organisation.id,
        code: "MAIN",
      },
    },
    update: {
      gstRegistrationId: gstRegistration.id,
      businessLocationId: location.id,
      active: true,
    },
    create: {
      organisationId: organisation.id,
      gstRegistrationId: gstRegistration.id,
      businessLocationId: location.id,
      code: "MAIN",
      name: "Main Warehouse",
      valuationMethod: "WEIGHTED_AVERAGE",
      policyMetadata: { negativeStockAllowed: false, costingPrecision: 4 },
    },
  });

  const accounts = [
    ["1000", "Cash", "ASSET", "CASH"],
    ["1010", "Bank", "ASSET", "BANK"],
    ["1100", "Accounts Receivable", "ASSET", "ACCOUNTS_RECEIVABLE"],
    ["1200", "Inventory", "ASSET", "INVENTORY"],
    ["1300", "Input GST", "ASSET", "INPUT_GST"],
    ["2000", "Accounts Payable", "LIABILITY", "ACCOUNTS_PAYABLE"],
    ["2100", "Output GST", "LIABILITY", "OUTPUT_GST"],
    ["3000", "Owner's Equity", "EQUITY", "EQUITY"],
    ["4000", "Sales", "INCOME", "SALES"],
    ["5000", "Cost of Goods Sold", "EXPENSE", "COGS"],
  ] as const;
  for (const [code, name, type, systemKey] of accounts) {
    await prisma.chartOfAccount.upsert({
      where: {
        legalEntityId_code: { legalEntityId: legalEntity.id, code },
      },
      update: { name, type, systemKey, active: true },
      create: {
        organisationId: organisation.id,
        legalEntityId: legalEntity.id,
        code,
        name,
        type,
        systemKey,
      },
    });
  }

  // Deactivate old industrial demo SKUs if present
  await prisma.product.updateMany({
    where: { code: { startsWith: "SKU-" } },
    data: { active: false },
  });

  for (const p of ELECTRONICS_PRODUCTS) {
    await prisma.product.upsert({
      where: { code: p.code },
      update: { ...p, organisationId: organisation.id, active: true },
      create: { ...p, organisationId: organisation.id, active: true },
    });
  }

  // Mark legacy install SKU as service if it was seeded as goods earlier
  await prisma.product.updateMany({
    where: { code: "SVC-INSTALL" },
    data: { productType: "SERVICE" },
  });

  const mainWarehouse = await prisma.warehouse.findUniqueOrThrow({
    where: {
      organisationId_code: { organisationId: organisation.id, code: "MAIN" },
    },
  });

  const goods = await prisma.product.findMany({
    where: {
      active: true,
      productType: "GOODS",
      OR: [{ organisationId: organisation.id }, { organisationId: null }],
    },
    select: { id: true, basePrice: true, code: true },
  });

  for (const product of goods) {
    await prisma.stockBalance.upsert({
      where: {
        warehouseId_productId: {
          warehouseId: mainWarehouse.id,
          productId: product.id,
        },
      },
      update: {},
      create: {
        warehouseId: mainWarehouse.id,
        productId: product.id,
        quantityOnHand: 0,
        quantityReserved: 0,
        averageCost: 0,
        inventoryValue: 0,
      },
    });
  }

  for (const seed of ELECTRONICS_VENDORS) {
    const existing = await prisma.vendor.findFirst({
      where: {
        OR: [{ phone: seed.phone }, { email: seed.email }],
      },
    });
    const vendor = existing
      ? await prisma.vendor.update({
          where: { id: existing.id },
          data: {
            name: seed.name,
            phone: seed.phone,
            email: seed.email,
            preferredChannel: seed.preferredChannel,
            active: true,
          },
        })
      : await prisma.vendor.create({
          data: {
            name: seed.name,
            phone: seed.phone,
            email: seed.email,
            preferredChannel: seed.preferredChannel,
          },
        });

    for (const category of seed.categories) {
      await prisma.vendorCategory.upsert({
        where: {
          vendorId_category_subcategory: {
            vendorId: vendor.id,
            category: category.category,
            subcategory: category.subcategory,
          },
        },
        update: { keywords: [...category.keywords] },
        create: {
          vendorId: vendor.id,
          category: category.category,
          subcategory: category.subcategory,
          keywords: [...category.keywords],
        },
      });
    }

    for (const history of seed.history) {
      await prisma.vendorProductHistory.upsert({
        where: {
          vendorId_productKey: {
            vendorId: vendor.id,
            productKey: history.productKey,
          },
        },
        update: {
          lastPrice: history.lastPrice,
          lastQuotedAt: new Date(),
        },
        create: {
          vendorId: vendor.id,
          productKey: history.productKey,
          lastPrice: history.lastPrice,
          lastQuotedAt: new Date(),
        },
      });
    }
  }

  console.log(
    `Seed complete: default accounting organisation + ${ELECTRONICS_PRODUCTS.length} products + ${ELECTRONICS_VENDORS.length} vendors`
  );
  if (!configuredPassword) {
    console.warn(
      "SEED_ADMIN_PASSWORD was not set. A random, undisclosed bootstrap password was used; set SEED_ADMIN_PASSWORD before seeding a fresh environment to enable admin login."
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
