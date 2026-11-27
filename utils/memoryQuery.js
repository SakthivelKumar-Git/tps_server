export const filterAndPaginateMemory = (
  items = [],
  { search = '', searchFields = [], filters = {}, startDate = '', endDate = '', dateField = 'createdAt', page = 1, limit = 15, sortBy = 'createdAt', sortOrder = -1 } = {}
) => {
  let result = [...items];

  // Exact/case-insensitive filters
  for (const [key, val] of Object.entries(filters)) {
    if (val === undefined || val === null || val === '' || val === 'All' || val === 'all') continue;
    result = result.filter((item) => String(item[key] || '').toLowerCase() === String(val).toLowerCase());
  }

  // Search
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter((item) =>
      searchFields.some((f) => String(item[f] || '').toLowerCase().includes(q))
    );
  }

  // Date range
  if (startDate || endDate) {
    const start = startDate ? new Date(startDate).getTime() : 0;
    const endObj = endDate ? new Date(endDate) : null;
    if (endObj) endObj.setHours(23, 59, 59, 999);
    const end = endObj ? endObj.getTime() : Number.MAX_SAFE_INTEGER;
    result = result.filter((item) => {
      const t = new Date(item[dateField] || item.createdAt || 0).getTime();
      return t >= start && t <= end;
    });
  }

  // Sort
  result.sort((a, b) => {
    const av = a[sortBy];
    const bv = b[sortBy];
    if (av === bv) return 0;
    if (av === undefined || av === null) return 1;
    if (bv === undefined || bv === null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') {
      return (av - bv) * sortOrder;
    }
    const at = Date.parse(av);
    const bt = Date.parse(bv);
    if (!Number.isNaN(at) && !Number.isNaN(bt) && (sortBy.toLowerCase().includes('date') || sortBy.endsWith('At'))) {
      return (at - bt) * sortOrder;
    }
    return String(av).localeCompare(String(bv)) * sortOrder;
  });

  const total = result.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (safePage - 1) * limit;
  const data = result.slice(startIdx, startIdx + limit);

  return {
    data,
    pagination: {
      total,
      page: safePage,
      limit,
      totalPages
    }
  };
};
