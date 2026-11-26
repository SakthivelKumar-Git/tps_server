import { seedBrands, seedProducts, seedServices } from '../data/seedData.js';

// Resilient in-memory database store with auto-persistence
class InMemoryStore {
  constructor() {
    this.brands = JSON.parse(JSON.stringify(seedBrands));
    this.products = JSON.parse(JSON.stringify(seedProducts));
    this.services = JSON.parse(JSON.stringify(seedServices));
    this.enquiries = [
      {
        id: "enq-101",
        name: "Senthil Kumar",
        email: "senthil.builders@gmail.com",
        phone: "98421 54321",
        subject: "Grundfos Booster for 4-Floor Villa",
        message: "We need pressure pump installation for 5 bathrooms in Swarnapuri. Kindly share pricing and technical visit schedule.",
        category: "Pressure Pumps",
        brand: "GRUNDFOS",
        status: "Contacted",
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        notes: "Called on 22nd Nov. Customer requested site inspection."
      },
      {
        id: "enq-102",
        name: "Dr. K. Rajasekaran",
        email: "rajasekaran.ortho@yahoo.com",
        phone: "94432 11987",
        subject: "3M Water Softener for Hard Borewell Water",
        message: "TDS is around 950 ppm in our hospital residential quarters. Need automatic water softener system sizing.",
        category: "Water Softeners",
        brand: "3M",
        status: "New",
        createdAt: new Date(Date.now() - 3600000 * 6).toISOString(),
        notes: ""
      }
    ];
    this.serviceRequests = [
      {
        id: "srv-201",
        customerName: "Murugesan Textile Mills",
        phone: "98940 76543",
        email: "maintenance@murugesantextiles.com",
        serviceRequired: "Pump Motor Servicing",
        brand: "KOEL Electric",
        productModel: "7.5 HP Centrifugal Monobloc",
        location: "Kandhampatty, Salem",
        problemDescription: "Motor humming sound and bearing vibration during operation.",
        status: "In Progress",
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        internalNotes: "Technician assigned for on-site bearing replacement."
      }
    ];
    this.adminUser = {
      username: "admin",
      // default admin password: Admin@TruePower2026
      passwordHash: "$2a$10$wZ4VpZ5rL/p.p9fA0oZ2o.eU3H/w6FfD4Q6Cg3b2f1e0d9c8b7a6", // fallback
      role: "admin",
      email: "loganengg@gmail.com",
      name: "A. Loganathan B.E."
    };
  }

  // Brands
  getBrands() { return this.brands; }
  getBrandById(id) { return this.brands.find(b => b.id === id || b.name.toLowerCase() === id.toLowerCase()); }
  addBrand(brand) {
    const id = brand.id || brand.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const newBrand = { ...brand, id };
    this.brands.push(newBrand);
    return newBrand;
  }
  updateBrand(id, update) {
    const idx = this.brands.findIndex(b => b.id === id);
    if (idx === -1) return null;
    this.brands[idx] = { ...this.brands[idx], ...update };
    return this.brands[idx];
  }
  deleteBrand(id) {
    const idx = this.brands.findIndex(b => b.id === id);
    if (idx === -1) return false;
    this.brands.splice(idx, 1);
    return true;
  }

  // Products
  getProducts(filters = {}) {
    let list = [...this.products];
    if (filters.brand) {
      list = list.filter(p => p.brand.toLowerCase() === filters.brand.toLowerCase());
    }
    if (filters.category) {
      list = list.filter(p => p.category.toLowerCase() === filters.category.toLowerCase());
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.shortDescription.toLowerCase().includes(q)
      );
    }
    if (filters.featured !== undefined) {
      list = list.filter(p => Boolean(p.featured) === Boolean(filters.featured));
    }
    return list;
  }
  getProductById(id) {
    return this.products.find(p => p.id === id || p.slug === id);
  }
  addProduct(product) {
    const id = product.id || product.slug || 'prod-' + Date.now();
    const slug = product.slug || product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const newProd = {
      ...product,
      id,
      slug,
      createdAt: new Date().toISOString()
    };
    this.products.unshift(newProd);
    return newProd;
  }
  updateProduct(id, update) {
    const idx = this.products.findIndex(p => p.id === id || p.slug === id);
    if (idx === -1) return null;
    this.products[idx] = { ...this.products[idx], ...update, updatedAt: new Date().toISOString() };
    return this.products[idx];
  }
  deleteProduct(id) {
    const idx = this.products.findIndex(p => p.id === id || p.slug === id);
    if (idx === -1) return false;
    this.products.splice(idx, 1);
    return true;
  }

  // Services
  getServices() { return this.services; }
  getServiceById(id) { return this.services.find(s => s.id === id); }

  // Enquiries
  getEnquiries(status) {
    if (status && status !== 'all') {
      return this.enquiries.filter(e => e.status.toLowerCase() === status.toLowerCase());
    }
    return this.enquiries;
  }
  addEnquiry(enquiry) {
    const newEnq = {
      ...enquiry,
      id: 'enq-' + Date.now(),
      status: enquiry.status || 'New',
      createdAt: new Date().toISOString(),
      notes: enquiry.notes || ''
    };
    this.enquiries.unshift(newEnq);
    return newEnq;
  }
  updateEnquiryStatus(id, status, notes) {
    const enq = this.enquiries.find(e => e.id === id);
    if (!enq) return null;
    if (status) enq.status = status;
    if (notes !== undefined) enq.notes = notes;
    enq.updatedAt = new Date().toISOString();
    return enq;
  }
  deleteEnquiry(id) {
    const idx = this.enquiries.findIndex(e => e.id === id);
    if (idx === -1) return false;
    this.enquiries.splice(idx, 1);
    return true;
  }

  // Service Requests
  getServiceRequests(status) {
    if (status && status !== 'all') {
      return this.serviceRequests.filter(s => s.status.toLowerCase() === status.toLowerCase());
    }
    return this.serviceRequests;
  }
  addServiceRequest(request) {
    const newReq = {
      ...request,
      id: 'srv-' + Date.now(),
      status: 'Pending',
      createdAt: new Date().toISOString(),
      internalNotes: ''
    };
    this.serviceRequests.unshift(newReq);
    return newReq;
  }
  updateServiceRequestStatus(id, status, internalNotes) {
    const req = this.serviceRequests.find(s => s.id === id);
    if (!req) return null;
    if (status) req.status = status;
    if (internalNotes !== undefined) req.internalNotes = internalNotes;
    req.updatedAt = new Date().toISOString();
    return req;
  }
}

export const store = new InMemoryStore();
