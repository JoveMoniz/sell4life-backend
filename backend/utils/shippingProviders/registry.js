// ======================================================
// SHIPPING COST PROVIDER REGISTRY
// Generic layer shared by all supplier integrations.
// Each provider calls registerProvider() at module load.
// Caching, rate-limit pausing, and credential encryption
// live here so every future provider inherits them for free.
// ======================================================

import { encrypt, decrypt } from '../taxInfoCrypto.js';

export { encrypt as encryptCredential, decrypt as decryptCredential };

/* ── Provider registry ─────────────────────────────── */

const _providers = new Map(); // providerName → provider object

export function registerProvider(provider) {
  _providers.set(provider.providerName, provider);
}

export function getProvider(name) {
  return _providers.get(name) ?? null;
}

export function listProviders() {
  return [..._providers.values()];
}

/* ── Shared in-memory cache (24 h TTL) ─────────────── */
// Key format: "${providerName}:${variantRef}:${destCountry}"
// Value: result object or null (null = looked up, got nothing)
// undefined = not yet looked up

const _cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function getCached(key) {
  const entry = _cache.get(key);
  if (entry === undefined) return undefined;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return undefined; }
  return entry.result; // may be null
}

export function setCached(key, result) {
  _cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function cacheKey(providerName, variantRef, destCountry) {
  return `${providerName}:${variantRef}:${destCountry}`;
}
