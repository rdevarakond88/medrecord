import prisma from '../db/prisma';

interface AuditEvent {
  event: string;
  actorId?: string;
  actorRole?: string;
  resourceId?: string;
  patientId?: string;
  ipAddress?: string;
  deviceId?: string;
  outcome?: string;
  metadata?: Record<string, unknown>;
}

export async function logAudit(ev: AuditEvent): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        event:      ev.event,
        actorId:    ev.actorId,
        actorRole:  ev.actorRole,
        resourceId: ev.resourceId,
        patientId:  ev.patientId,
        ipAddress:  ev.ipAddress,
        deviceId:   ev.deviceId,
        outcome:    ev.outcome ?? 'success',
        metadata:   ev.metadata as object | undefined,
      },
    });
  } catch (err) {
    // Audit log failure must never break the main request flow.
    console.error('[audit] Failed to write audit log:', err);
  }
}
