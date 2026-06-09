import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type RecordAuditLogInput = {
  organizationId?: string;
  actorId?: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonObject;
};

export async function recordAuditLog(input: RecordAuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ?? {},
    },
  });
}
