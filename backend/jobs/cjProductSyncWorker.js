// ======================================================
// CJ PRODUCT SYNC WORKER
// Periodic safety net: sweeps every professional vendor's
// CJ-connected products and backfills any variant missing its
// cjVid (the CJ internal id needed for freight quotes and
// auto-ordering). Auto-sync-on-save (products.js PATCH route)
// covers the common case; this catches anything that slips
// through — products added before auto-sync existed, a failed
// CJ API call at save time, etc.
// ======================================================
import Vendor from '../models/vendor.js';
import Product from '../models/product.js';
import { decryptCredential } from '../utils/shippingProviders/registry.js';
import { syncProductFromCj, looksCjSourced } from '../utils/cjProductSync.js';

export async function processCjProductSync() {
  const summary = { vendorsChecked: 0, productsChecked: 0, synced: 0, skipped: 0, errors: 0, details: [] };

  const vendors = await Vendor.find({
    type: 'professional',
    'supplierCredentials.cjdropshipping': { $exists: true, $ne: null },
  });

  for (const vendor of vendors) {
    summary.vendorsChecked++;
    let credential;
    try {
      credential = decryptCredential(vendor.supplierCredentials.cjdropshipping);
    } catch (err) {
      summary.errors++;
      summary.details.push({ vendorId: String(vendor._id), storeName: vendor.storeName, error: 'Bad CJ credential: ' + err.message });
      continue;
    }

    const products = await Product.find({ vendor: vendor._id, archived: { $ne: true } });

    for (const product of products) {
      summary.productsChecked++;
      try {
        if (!looksCjSourced(product)) { summary.skipped++; continue; }

        const needsSync = (product.variants || []).some(v => (v.supplierVariantRef || v.sku) && !v.cjVid);
        if (!needsSync) { summary.skipped++; continue; }

        const r = await syncProductFromCj(product, credential);
        if (r.status === 'updated' && r.variantsSynced > 0) {
          summary.synced++;
          summary.details.push({ vendorId: String(vendor._id), storeName: vendor.storeName, productId: String(product._id), variantsSynced: r.variantsSynced });
        } else {
          summary.skipped++;
        }
      } catch (err) {
        summary.errors++;
        summary.details.push({ vendorId: String(vendor._id), productId: String(product._id), error: err.message });
      }
    }
  }

  return summary;
}

export function startCjProductSyncWorker() {
  const INTERVAL_MS = 12 * 60 * 60 * 1000; // every 12 hours

  setInterval(async () => {
    console.log('⏱ CJ product sync worker tick:', new Date().toISOString());
    try {
      const summary = await processCjProductSync();
      if (summary.synced > 0) {
        console.log(`🔗 CJ product sync: ${summary.synced} product(s) backfilled across ${summary.vendorsChecked} vendor(s)`);
      }
    } catch (err) {
      console.error('💥 CJ PRODUCT SYNC WORKER ERROR:', err.message);
    }
  }, INTERVAL_MS);
}
