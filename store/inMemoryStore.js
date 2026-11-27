import { normalizePhone, syncMemoryCounterSeed } from '../utils/sequence.js';

/**
 * Clean fallback state holder with ZERO static/dummy business records.
 * Retains only .env-configured administrator credentials for auth fallback safety.
 */
class InMemoryStore {
  constructor() {
    this.brands = [];
    this.products = [];
    this.services = [];
    this.roles = [];
    this.productCategories = [];
    this.serviceCategories = [];
    this.serviceTypes = [];
    this.serviceAreas = [];
    this.employees = [];
    this.dealers = [];
    this.customers = [];
    this.leads = [];
    this.serviceEnquiries = [];
    this.serviceBookings = [];
    this.serviceRecords = [];
    this.followUps = [];
    this.warranties = [];
    this.amcContracts = [];
    this.notifications = [];
    this.activityLogs = [];

    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const adminUsername = (process.env.ADMIN_USERNAME || adminEmail || '').trim().toLowerCase();
    this.users = adminEmail
      ? [
          {
            id: 'usr-admin',
            name: process.env.ADMIN_NAME || 'System Administrator',
            username: adminUsername,
            email: adminEmail,
            phone: '',
            role: process.env.ADMIN_ROLE || 'Super Admin',
            isActive: true,
            createdAt: new Date().toISOString()
          }
        ]
      : [];

    this.companySettings = {
      id: 'default',
      companyName: 'TRUE POWER SOLUTIONS',
      proprietor: '',
      email: '',
      primaryPhone: '',
      secondaryPhone: '',
      whatsappNumber: '',
      address: '',
      businessHours: '',
      gstNumber: '',
      timeSlots: ['09:00 AM - 11:00 AM', '11:00 AM - 01:00 PM', '02:00 PM - 04:00 PM', '04:00 PM - 06:00 PM'],
      warrantyReminderDays: 30,
      amcReminderDays: 30
    };

    const y = new Date().getFullYear();
    ['TPS-EMP', 'TPS-DLR', 'TPS-CUS', 'TPS-LD', 'TPS-SRV', 'TPS-BKG', 'TPS-REC', 'TPS-FLW', 'TPS-WRN', 'TPS-AMC'].forEach((p) => {
      syncMemoryCounterSeed(`${p}-${y}`, 0);
    });
  }

  findOrCreateCustomer(payload) {
    const np = normalizePhone(payload.phone);
    const email = (payload.email || '').trim().toLowerCase();
    const existing = this.customers.find((c) => (np && c.normalizedPhone === np) || (email && c.email === email));
    if (existing) {
      return { customer: existing, created: false };
    }
    const customerId = `TPS-CUS-${new Date().getFullYear()}-${String(this.customers.length + 1).padStart(4, '0')}`;
    const created = {
      id: `cus-${Date.now()}`,
      customerId,
      name: payload.name || payload.customerName || 'Customer',
      phone: payload.phone,
      normalizedPhone: np || customerId,
      altPhone: payload.altPhone || '',
      email,
      address: payload.address || payload.serviceAddress || payload.location || '',
      city: payload.city || '',
      pincode: payload.pincode || '',
      customerType: payload.customerType || 'Residential',
      ownedProducts: [],
      status: 'Active',
      notesList: [],
      createdAt: new Date().toISOString()
    };
    this.customers.unshift(created);
    return { customer: created, created: true };
  }

  addNotification(n) {
    if (n.dedupeKey && this.notifications.some((x) => x.dedupeKey === n.dedupeKey)) return null;
    const item = { ...n, id: `not-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, isRead: false, createdAt: new Date().toISOString() };
    this.notifications.unshift(item);
    return item;
  }

  addActivityLog(log) {
    const item = { ...log, id: `log-${Date.now()}`, createdAt: new Date().toISOString() };
    this.activityLogs.unshift(item);
    return item;
  }

  getBrands() {
    return this.brands;
  }

  getBrandById(id) {
    return this.brands.find((b) => b.id === id || (b.name && b.name.toLowerCase() === id.toLowerCase())) || null;
  }

  addBrand(data) {
    const brand = { id: data.id || `brand-${Date.now()}`, ...data };
    this.brands.push(brand);
    return brand;
  }

  updateBrand(id, data) {
    const idx = this.brands.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    this.brands[idx] = { ...this.brands[idx], ...data };
    return this.brands[idx];
  }

  deleteBrand(id) {
    const idx = this.brands.findIndex((b) => b.id === id);
    if (idx === -1) return false;
    this.brands.splice(idx, 1);
    return true;
  }

  getProducts(params = {}) {
    let list = [...this.products];
    if (params.brand && params.brand !== 'All') {
      list = list.filter((p) => (p.brand || '').toLowerCase() === params.brand.toLowerCase());
    }
    if (params.category && params.category !== 'All') {
      list = list.filter((p) => (p.category || '').toLowerCase() === params.category.toLowerCase());
    }
    if (params.featured !== undefined) {
      list = list.filter((p) => p.featured === params.featured);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
    }
    return list;
  }

  getProductById(id) {
    return this.products.find((p) => p.id === id || p.slug === id) || null;
  }

  addProduct(data) {
    const prod = { id: data.id || `prod-${Date.now()}`, ...data };
    this.products.push(prod);
    return prod;
  }

  updateProduct(id, data) {
    const idx = this.products.findIndex((p) => p.id === id || p.slug === id);
    if (idx === -1) return null;
    this.products[idx] = { ...this.products[idx], ...data };
    return this.products[idx];
  }

  deleteProduct(id) {
    const idx = this.products.findIndex((p) => p.id === id || p.slug === id);
    if (idx === -1) return false;
    this.products.splice(idx, 1);
    return true;
  }

  getServices() {
    return this.services;
  }

  getServiceById(id) {
    return this.services.find((s) => s.id === id) || null;
  }
}

export const store = new InMemoryStore();
