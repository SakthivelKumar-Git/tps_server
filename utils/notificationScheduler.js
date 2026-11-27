import AmcContract from '../models/AmcContract.js';
import FollowUp from '../models/FollowUp.js';
import Notification from '../models/Notification.js';
import CompanySetting from '../models/CompanySetting.js';
import { isMongoConnected } from '../config/db.js';
import { computeStatusByEndDate, createNotification, safeDaysRemaining } from './crmHelpers.js';

/**
 * Identifies AMC contracts within the 30-day expiry window (and urgent daily intervals)
 * and creates deduplicated notifications for Super Admin & Admin until renewed, cancelled, or expired.
 */
export const runAmcExpirySweep = async () => {
  if (!isMongoConnected()) return { scanned: 0, created: 0 };
  const settings = await CompanySetting.findOne({ key: 'default' }).lean();
  const windowDays = Number(settings?.amcReminderDays || 30);
  const intervals = settings?.notificationSettings?.amcReminderIntervals || [30, 15, 7, 1];
  const dailyUrgent = settings?.notificationSettings?.dailyUrgentAmc !== false;

  const contracts = await AmcContract.find({
    amcStatus: { $nin: ['Renewed', 'Cancelled'] }
  });

  let createdCount = 0;
  const todayKey = new Date().toISOString().slice(0, 10);

  for (const amc of contracts) {
    const daysRemaining = safeDaysRemaining(amc.endDate);
    if (daysRemaining === null) continue;

    const liveStatus = computeStatusByEndDate(amc.endDate, amc.amcStatus);
    if (amc.amcStatus !== liveStatus) {
      amc.amcStatus = liveStatus;
      await amc.save();
    }

    // Stop notifying once renewed, cancelled, or expired past threshold
    if (daysRemaining < 0 || ['Renewed', 'Cancelled', 'Expired'].includes(amc.amcStatus)) {
      continue;
    }
    if (daysRemaining > windowDays) continue;

    // Match initial 30-day entry, configured interval buckets, or daily urgent alerts (<=3 days)
    let matchedBucket = null;
    if (dailyUrgent && daysRemaining <= 3) {
      matchedBucket = `urgent-${todayKey}`;
    } else {
      const sorted = [...intervals].sort((a, b) => a - b);
      const bucket = sorted.find((iv) => daysRemaining <= iv);
      matchedBucket = `iv-${bucket ?? windowDays}-${amc.endDate.toISOString().slice(0, 10)}`;
    }

    const dedupeKey = `amc-${amc._id.toString()}-${matchedBucket}`;
    const alreadySent = (amc.amcNotificationsSent || []).some((n) => n.intervalKey === matchedBucket);
    if (alreadySent) continue;

    const notif = await createNotification({
      type: 'AMC Expiring',
      title: `AMC Expiring in ${daysRemaining} day(s) — ${amc.customerName}`,
      message: `${amc.customerName} (${amc.phone || 'N/A'}) · ${amc.productName} expires on ${new Date(amc.endDate).toLocaleDateString('en-IN')} (${daysRemaining} day(s) remaining)`,
      relatedModel: 'AmcContract',
      relatedId: amc._id.toString(),
      link: '/admin/amc-expired-report',
      targetRoles: ['Super Admin', 'Admin'],
      metadata: {
        customerName: amc.customerName,
        customerPhone: amc.phone,
        product: amc.productName,
        amcStartDate: amc.startDate,
        amcExpiryDate: amc.endDate,
        daysRemaining,
        assignedEmployee: amc.assignedEmployeeName || ''
      },
      dedupeKey
    });

    if (notif) {
      amc.amcNotificationsSent = amc.amcNotificationsSent || [];
      amc.amcNotificationsSent.push({ intervalKey: matchedBucket, sentAt: new Date() });
      await amc.save();
      createdCount += 1;
    }
  }

  return { scanned: contracts.length, created: createdCount };
};

/**
 * Checks active (non-cancelled, non-completed) follow-ups due today or within configurable advance reminder window
 * and notifies the assigned Sales Executive / BDE / Technician cleanly without duplicates.
 */
export const runFollowUpNotificationSweep = async () => {
  if (!isMongoConnected()) return { scanned: 0, created: 0 };
  const settings = await CompanySetting.findOne({ key: 'default' }).lean();
  const advanceMinutes = Number(settings?.notificationSettings?.followUpAdvanceMinutes || 30);

  const now = new Date();
  const windowEnd = new Date(now.getTime() + advanceMinutes * 60 * 1000);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  // Mark past-due open follow-ups as Missed when date was strictly before startOfDay
  await FollowUp.updateMany(
    { status: { $in: ['Upcoming', 'Pending'] }, followUpDate: { $lt: startOfDay } },
    { $set: { status: 'Missed' } }
  );

  const dueFollowUps = await FollowUp.find({
    status: { $in: ['Upcoming', 'Pending', 'Rescheduled'] },
    followUpDate: { $gte: startOfDay, $lte: new Date(Math.max(endOfDay.getTime(), windowEnd.getTime())) }
  });

  let createdCount = 0;
  const dateStamp = now.toISOString().slice(0, 10);

  for (const fu of dueFollowUps) {
    const dedupeKey = `fu-due-${fu._id.toString()}-${dateStamp}`;
    const notif = await createNotification({
      type: 'Follow-up Reminder',
      title: `Follow-up Reminder — ${fu.customerName}`,
      message: `${fu.customerName} (${fu.phone || 'N/A'}) · Ref ${fu.relatedRef || fu.followUpId} · ${fu.followUpType} on ${new Date(fu.followUpDate).toLocaleDateString('en-IN')} at ${fu.followUpTime || ''}`,
      relatedModel: 'FollowUp',
      relatedId: fu._id.toString(),
      link: '/admin/followups',
      recipientEmployee: fu.assignedEmployee || null,
      targetRoles: ['Super Admin', 'Admin'],
      metadata: {
        customerName: fu.customerName,
        customerPhone: fu.phone,
        referenceId: fu.relatedRef || fu.followUpId,
        followUpDate: fu.followUpDate,
        followUpTime: fu.followUpTime,
        followUpType: fu.followUpType,
        assignedEmployeeName: fu.assignedEmployeeName || ''
      },
      scheduledFor: fu.followUpDate,
      dedupeKey
    });
    if (notif) createdCount += 1;
  }

  return { scanned: dueFollowUps.length, created: createdCount };
};

let sweepTimer = null;
export const startNotificationScheduler = () => {
  if (sweepTimer || process.env.NODE_ENV === 'test') return;
  const runAll = async () => {
    try {
      await Promise.all([runAmcExpirySweep(), runFollowUpNotificationSweep()]);
    } catch {
      // background scheduler should never crash server
    }
  };
  setTimeout(runAll, 8000);
  sweepTimer = setInterval(runAll, 15 * 60 * 1000);
};
