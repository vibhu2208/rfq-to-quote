import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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
  const passwordHash = await bcrypt.hash("admin123", 10);

  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "Admin",
      passwordHash,
    },
  });

  // Deactivate old industrial demo SKUs if present
  await prisma.product.updateMany({
    where: { code: { startsWith: "SKU-" } },
    data: { active: false },
  });

  for (const p of ELECTRONICS_PRODUCTS) {
    await prisma.product.upsert({
      where: { code: p.code },
      update: { ...p, active: true },
      create: { ...p, active: true },
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
    `Seed complete: admin@example.com / admin123 + ${ELECTRONICS_PRODUCTS.length} products + ${ELECTRONICS_VENDORS.length} vendors`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
