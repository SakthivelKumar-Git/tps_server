import { normalizePhone } from '../utils/sequence.js';

const safeCreateIndex = async (collection, keys, options = {}) => {
  try {
    await collection.createIndex(keys, options);
  } catch (err) {
    // Ignore equivalent index already exists under another name or duplicate legacy values blocking unique
    if (err.code === 85 || err.code === 86 || err.code === 11000) {
      console.warn(`[001] Index warning on ${collection.collectionName} (${JSON.stringify(keys)}): ${err.message}`);
      return;
    }
    throw err;
  }
};

export const up = async (db) => {
  // 1. Backfill normalizedPhone cleanly on existing leads and customers without dropping or deleting records
  const leadsCol = db.collection('leads');
  const leadsCursor = leadsCol.find({
    $or: [{ normalizedPhone: { $exists: false } }, { normalizedPhone: '' }]
  });
  for await (const lead of leadsCursor) {
    const norm = normalizePhone(lead.phone || '');
    if (norm) {
      await leadsCol.updateOne({ _id: lead._id }, { $set: { normalizedPhone: norm } });
    }
  }

  const customersCol = db.collection('customers');
  const custCursor = customersCol.find({
    $or: [{ normalizedPhone: { $exists: false } }, { normalizedPhone: '' }]
  });
  for await (const cust of custCursor) {
    const norm = normalizePhone(cust.phone || '');
    if (norm) {
      await customersCol.updateOne({ _id: cust._id }, { $set: { normalizedPhone: norm } });
    }
  }

  // 2. Ensure users have normalized username & active flag
  const usersCol = db.collection('users');
  const usersCursor = usersCol.find({});
  for await (const u of usersCursor) {
    const updates = {};
    if (!u.username && u.email) updates.username = String(u.email).trim().toLowerCase();
    if (typeof u.isActive !== 'boolean') updates.isActive = true;
    if (Object.keys(updates).length > 0) {
      await usersCol.updateOne({ _id: u._id }, { $set: updates });
    }
  }

  // 3. Ensure core indexes exist for high-frequency CRM lookups and duplicate protection
  await safeCreateIndex(usersCol, { email: 1 }, { unique: true, name: 'idx_users_email_unique' });
  await safeCreateIndex(usersCol, { username: 1 }, { unique: true, name: 'idx_users_username_unique' });
  await safeCreateIndex(usersCol, { role: 1, isActive: 1 }, { name: 'idx_users_role_active' });

  await safeCreateIndex(leadsCol, { normalizedPhone: 1, createdAt: -1 }, { name: 'idx_leads_norm_phone' });
  await safeCreateIndex(leadsCol, { status: 1, assignedEmployee: 1 }, { name: 'idx_leads_status_emp' });
  await safeCreateIndex(
    leadsCol,
    { submissionToken: 1 },
    { unique: true, sparse: true, name: 'idx_leads_submission_token_unique' }
  );

  await safeCreateIndex(customersCol, { normalizedPhone: 1 }, { unique: true, sparse: true, name: 'idx_customers_norm_phone_unique' });
  await safeCreateIndex(customersCol, { status: 1, createdAt: -1 }, { name: 'idx_customers_status' });

  await safeCreateIndex(db.collection('serviceEnquiries'), { status: 1, priority: 1, createdAt: -1 }, { name: 'idx_srv_enq_status' });
  await safeCreateIndex(db.collection('serviceBookings'), { appointmentDate: 1, status: 1 }, { name: 'idx_srv_bkg_date_status' });
  await safeCreateIndex(db.collection('serviceRecords'), { serviceDate: -1, paymentStatus: 1 }, { name: 'idx_srv_rec_date_pay' });
  await safeCreateIndex(db.collection('followUps'), { followUpDate: 1, status: 1 }, { name: 'idx_followups_date_status' });
  await safeCreateIndex(db.collection('warranties'), { warrantyEndDate: 1, warrantyStatus: 1 }, { name: 'idx_warranties_end_status' });
  await safeCreateIndex(db.collection('amcContracts'), { endDate: 1, amcStatus: 1 }, { name: 'idx_amc_end_status' });
  await safeCreateIndex(db.collection('activityLogs'), { createdAt: -1, entityType: 1 }, { name: 'idx_activity_created_type' });
  await safeCreateIndex(db.collection('notifications'), { isRead: 1, createdAt: -1 }, { name: 'idx_notifications_read_created' });
};

export const down = async (db) => {
  const dropIfPresent = async (colName, indexName) => {
    try {
      await db.collection(colName).dropIndex(indexName);
    } catch {
      // Ignore if index does not exist
    }
  };

  await dropIfPresent('users', 'idx_users_role_active');
  await dropIfPresent('leads', 'idx_leads_norm_phone');
  await dropIfPresent('leads', 'idx_leads_status_emp');
  await dropIfPresent('customers', 'idx_customers_status');
  await dropIfPresent('serviceEnquiries', 'idx_srv_enq_status');
  await dropIfPresent('serviceBookings', 'idx_srv_bkg_date_status');
  await dropIfPresent('serviceRecords', 'idx_srv_rec_date_pay');
  await dropIfPresent('followUps', 'idx_followups_date_status');
  await dropIfPresent('warranties', 'idx_warranties_end_status');
  await dropIfPresent('amcContracts', 'idx_amc_end_status');
  await dropIfPresent('activityLogs', 'idx_activity_created_type');
  await dropIfPresent('notifications', 'idx_notifications_read_created');
};
