import { requireAction } from "../auth/permissions.js";
import { writeAudit } from "../audit/service.js";

export async function aggregateCounts(db, user, now = new Date()) {
  try {
    requireAction(user, "view_aggregate_counts");
  } catch (error) {
    await writeAudit(db, { tenantId: user.tenantId, actor: user, action: "support_access", recordRef: "aggregate_counts", outcome: "refused", now });
    throw error;
  }
  const grouped = await db.collection("cards").aggregate([
    { $match: { tenantId: user.tenantId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]).toArray();
  const states = Object.fromEntries(grouped.map((item) => [item._id, item.count]));
  const total = grouped.reduce((sum, item) => sum + item.count, 0);
  await writeAudit(db, { tenantId: user.tenantId, actor: user, action: "support_access", recordRef: "aggregate_counts", outcome: "success", now });
  return { total, states };
}
