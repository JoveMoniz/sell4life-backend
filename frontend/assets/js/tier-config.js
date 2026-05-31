// ============================================================
// VENDOR TIER CONFIG — single source of truth
// To change what a tier can do, edit ONLY this file.
// ============================================================

const TIER_RANK = { casual: 1, refurbished: 2, professional: 3, enterprise: 4 };

const TIER_CONFIG = {

  casual: {
    label: 'Casual Vendor',
    description: 'Selling personal items & occasional listings',
    // Product form sections visible to this tier
    productSections: ['basic', 'pricing', 'photos', 'condition', 'shipping'],
    // Sidebar nav hrefs visible to this tier
    navLinks: [
      '/account/vendor/dashboard.html',
      '/account/vendor/products.html',
      '/account/vendor/add-product.html',
      '/account/vendor/orders.html',
      '/account/vendor/settings.html',
    ],
    // Dashboard stat cards visible
    dashboardStats: ['products', 'orders', 'revenue'],
  },

  refurbished: {
    label: 'Refurbished Vendor',
    description: 'Certified refurbishers & repair businesses',
    productSections: ['basic', 'pricing', 'photos', 'condition', 'shipping', 'refurb'],
    navLinks: [
      '/account/vendor/dashboard.html',
      '/account/vendor/products.html',
      '/account/vendor/add-product.html',
      '/account/vendor/orders.html',
      '/account/vendor/transactions.html',
      '/account/vendor/payouts.html',
      '/account/vendor/settings.html',
    ],
    dashboardStats: ['products', 'orders', 'revenue', 'refunds'],
  },

  professional: {
    label: 'Professional Vendor',
    description: 'Small businesses, brands & regular retailers',
    productSections: ['basic', 'pricing', 'photos', 'condition', 'shipping', 'refurb', 'variants', 'addons', 'seo', 'inventory'],
    navLinks: [
      '/account/vendor/dashboard.html',
      '/account/vendor/products.html',
      '/account/vendor/add-product.html',
      '/account/vendor/orders.html',
      '/account/vendor/transactions.html',
      '/account/vendor/payouts.html',
      '/account/vendor/settings.html',
      '/account/vendor/tools.html',
    ],
    dashboardStats: ['products', 'orders', 'revenue', 'refunds', 'analytics'],
  },

  enterprise: {
    label: 'Enterprise Vendor',
    description: 'Manufacturers, wholesalers & large retailers',
    productSections: ['*'],
    navLinks: ['*'],
    dashboardStats: ['*'],
  },

};

// Returns true if vendorType meets or exceeds the required tier
function tierAtLeast(vendorType, required) {
  return (TIER_RANK[vendorType] || 0) >= (TIER_RANK[required] || 0);
}

// Returns the config for a vendor type, falling back to casual
function getTierConfig(vendorType) {
  return TIER_CONFIG[vendorType] || TIER_CONFIG.casual;
}

// Given a list and a wildcard check, returns true if item is allowed
function tierAllows(list, item) {
  return list.includes('*') || list.includes(item);
}
