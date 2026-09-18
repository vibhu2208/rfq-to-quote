import { prisma } from "@/lib/prisma";

export type OrgContext = {
  organisationId: string;
  legalEntityId: string;
  gstRegistrationId: string;
  gstin: string;
  stateCode: string;
  tradeName: string;
  warehouseId: string;
  organisationName: string;
};

/** Loads the seeded DEFAULT organisation and primary GST / warehouse. */
export async function getDefaultOrgContext(): Promise<OrgContext> {
  const organisation = await prisma.organisation.findUnique({
    where: { code: "DEFAULT" },
    include: {
      legalEntities: {
        where: { active: true },
        take: 1,
        include: {
          gstRegistrations: {
            where: { active: true },
            take: 1,
            include: {
              locations: { where: { active: true, isPrimary: true }, take: 1 },
              warehouses: { where: { active: true }, take: 1 },
            },
          },
        },
      },
      warehouses: { where: { active: true }, take: 1 },
    },
  });

  if (!organisation) {
    throw new Error("DEFAULT organisation not seeded. Run npm run db:seed");
  }

  const legalEntity = organisation.legalEntities[0];
  const gst = legalEntity?.gstRegistrations[0];
  const warehouse = gst?.warehouses[0] ?? organisation.warehouses[0];

  if (!legalEntity || !gst || !warehouse) {
    throw new Error("DEFAULT org is missing legal entity, GST registration, or warehouse");
  }

  return {
    organisationId: organisation.id,
    legalEntityId: legalEntity.id,
    gstRegistrationId: gst.id,
    gstin: gst.gstin,
    stateCode: gst.stateCode,
    tradeName: gst.tradeName || organisation.name,
    warehouseId: warehouse.id,
    organisationName: organisation.name,
  };
}

export async function getMembershipForUser(userId: string) {
  return prisma.organisationMembership.findFirst({
    where: { userId, status: "ACTIVE" },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      organisation: true,
    },
  });
}

export const getDefaultOrganisationContext = getDefaultOrgContext;
export type OrganisationContext = OrgContext;

export function readPolicyFlag(metadata: unknown, key: string, fallback: boolean): boolean {
  if (!metadata || typeof metadata !== "object") return fallback;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : fallback;
}

export async function resolveWarehouse(ctx: OrgContext, warehouseId?: string): Promise<string> {
  if (!warehouseId || warehouseId === ctx.warehouseId) return ctx.warehouseId;

  const warehouse = await prisma.warehouse.findFirst({
    where: {
      id: warehouseId,
      organisationId: ctx.organisationId,
      active: true,
    },
    select: { id: true },
  });

  if (!warehouse) {
    throw new Error(`Warehouse not found: ${warehouseId}`);
  }

  return warehouse.id;
}

export async function userHasPermission(userId: string, permissionCode: string): Promise<boolean> {
  const membership = await getMembershipForUser(userId);
  if (!membership) return false;
  for (const mr of membership.roles) {
    if (mr.role.code === "ADMIN" || mr.role.code === "OWNER") return true;
    for (const rp of mr.role.permissions) {
      if (rp.permission.code === permissionCode && rp.effect === "ALLOW") return true;
      if (rp.permission.code === "organisation.manage" && rp.effect === "ALLOW") return true;
    }
  }
  return false;
}
