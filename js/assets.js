import { getCatalog, getLiveAssetEntry } from './catalog.js?v=20261113ah';

/**
 * Hybrid Icon Resolver
 * First checks /assets/custom/{type}/{pascalKey}.png (custom Aseprite PNGs),
 * then falls back to official Genshin icon URLs mapped from data/catalog.json.
 *
 * @param {'characters'|'weapons'|'materials'} type
 * @param {string} pascalKey
 * @returns {string}
 */
export function getAssetUrl(type, pascalKey) {
  const safeType = encodeURIComponent(type || 'materials');
  const safeKey = encodeURIComponent(pascalKey || 'Unknown');
  return `./assets/custom/${safeType}/${safeKey}.png`;
}

/**
 * Looks up the official Genshin icon URL from data/catalog.json.
 */
export function getFallbackAssetUrl(type, pascalKey) {
  const catalog = getCatalog();
  if (!pascalKey) return '';
  const live = getLiveAssetEntry(type, pascalKey);
  if (live?.icon) return live.icon;

  const bucket = catalog?.[type] || {};
  if (bucket[pascalKey]?.icon) return bucket[pascalKey].icon;

  // Handle Traveler variants (TravelerCryo -> Traveler or TravelerAnemo)
  if (type === 'characters' && pascalKey.startsWith('Traveler')) {
    return bucket.TravelerCryo?.icon || 'https://enka.network/ui/UI_AvatarIcon_PlayerGirl.png';
  }
  return '';
}

/**
 * Renders an <img> element string with hybrid custom -> catalog -> monogram fallback.
 */
export function renderAssetIcon(type, pascalKey, alt = '', className = 'asset-icon') {
  const customSrc = getAssetUrl(type, pascalKey);
  const fallbackSrc = getFallbackAssetUrl(type, pascalKey);
  const primarySrc = fallbackSrc || customSrc;
  const initials = (pascalKey || '?').slice(0, 2).toUpperCase();
  const safeAlt = (alt || pascalKey || '').replace(/"/g, '&quot;');

  return `<span class="asset-wrap ${className}" data-key="${safeAlt}">
    <img
      src="${primarySrc}"
      alt="${safeAlt}"
      class="asset-img${fallbackSrc ? '' : ' is-custom-pixel'}"
      referrerpolicy="no-referrer"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
    />
    <span class="asset-monogram" style="display:none;">${initials}</span>
  </span>`;
}
