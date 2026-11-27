import { getCatalog, getLiveAssetEntry } from './catalog.js?v=20261127p113';

function toEnkaUrlIfReleased(url, live) {
  if (!url || live?.unreleased) return url || '';
  if (url.startsWith('https://enka.network/ui/')) return url;
  const m = url.match(/(UI_(?:AvatarIcon|Gacha_AvatarImg|Gacha_EquipIcon|EquipIcon|RelicIcon|MonsterIcon|ItemIcon)_[A-Za-z0-9_]+)\.(?:png|webp)$/i);
  return m ? `https://enka.network/ui/${m[1]}.png` : url;
}

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
  const live = getLiveAssetEntry(type, pascalKey);
  const rawFallback = getFallbackAssetUrl(type, pascalKey);
  const enkaSrc = toEnkaUrlIfReleased(rawFallback, live);
  const primarySrc = enkaSrc || rawFallback || customSrc;
  const secondarySrc = (enkaSrc && rawFallback && enkaSrc !== rawFallback ? rawFallback : '').replace(/"/g, '&quot;');
  const initials = (pascalKey || '?').slice(0, 2).toUpperCase();
  const safeAlt = String(alt || '').replace(/"/g, '&quot;');
  const isDecorative = alt === '';
  const onerrorJs = secondarySrc
    ? `if(this.dataset.fb!=='1'){this.dataset.fb='1';this.src='${secondarySrc}';}else{this.style.display='none';this.nextElementSibling.style.display='flex';}`
    : `this.style.display='none';this.nextElementSibling.style.display='flex';`;

  return `<span class="asset-wrap ${className}" data-key="${safeAlt || pascalKey}"${isDecorative ? ' aria-hidden="true"' : ''}>
    <img
      src="${primarySrc}"
      alt="${safeAlt}"
      class="asset-img${rawFallback ? '' : ' is-custom-pixel'}"
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      onerror="${onerrorJs}"
    />
    <span class="asset-monogram" style="display:none;">${initials}</span>
  </span>`;
}

/**
 * Renders full-body Gacha Splash Art (Enka UI_Gacha_AvatarImg_*) with automatic
 * fallback to the catalog/Lunaris URL, standard character avatar, or monogram.
 */
export function renderGachaSplash(pascalKey, alt = '') {
  const rawAvatar = getFallbackAssetUrl('characters', pascalKey) || getAssetUrl('characters', pascalKey);
  const live = getLiveAssetEntry('characters', pascalKey);
  const avatarUrl = toEnkaUrlIfReleased(rawAvatar, live) || rawAvatar;
  const catalogSplash = getCatalog()?.characters?.[pascalKey]?.gachaImg || '';
  const rawSplash =
    live?.gachaImg ||
    catalogSplash ||
    (rawAvatar.includes('/assets/avataricon/UI_AvatarIcon_')
      ? rawAvatar.replace('/assets/avataricon/UI_AvatarIcon_', '/assets/gachaimg/UI_Gacha_AvatarImg_')
      : rawAvatar.includes('UI_AvatarIcon_')
        ? rawAvatar.replace('UI_AvatarIcon_', 'UI_Gacha_AvatarImg_')
        : rawAvatar);
  const splashUrl = toEnkaUrlIfReleased(rawSplash, live) || rawSplash;
  const fallbackChain = splashUrl !== rawSplash && rawSplash ? rawSplash : avatarUrl;
  const isSplash = splashUrl !== avatarUrl;
  const safeAlt = String(alt || pascalKey || '').replace(/"/g, '&quot;');
  const safeFallback = fallbackChain.replace(/"/g, '&quot;');
  const safeAvatar = avatarUrl.replace(/"/g, '&quot;');
  const initials = (pascalKey || '?').slice(0, 2).toUpperCase();

  return `<span class="asset-wrap ed-gacha-splash-wrap${isSplash ? ' has-splash' : ''}">
    <img
      src="${splashUrl}"
      alt="${safeAlt}"
      class="asset-img ed-gacha-splash-img"
      loading="eager"
      decoding="async"
      referrerpolicy="no-referrer"
      onerror="if(this.dataset.fb!=='1'&&'${safeFallback}'){this.dataset.fb='1';this.src='${safeFallback}';}else if(this.dataset.fb!=='2'&&'${safeAvatar}'){this.dataset.fb='2';this.src='${safeAvatar}';this.parentElement.classList.remove('has-splash');}else{this.style.display='none';this.nextElementSibling.style.display='flex';}"
    />
    <span class="asset-monogram" style="display:none;">${initials}</span>
  </span>`;
}

/**
 * Renders full-length Weapon Gacha Art (UI_Gacha_EquipIcon_*) with automatic
 * fallback to Yatta full art, standard cropped weapon icon, or monogram.
 */
export function renderWeaponSplash(pascalKey, alt = '', className = 'p-weapon-splash', weaponType = '') {
  const rawIcon = getFallbackAssetUrl('weapons', pascalKey) || getAssetUrl('weapons', pascalKey);
  const live = getLiveAssetEntry('weapons', pascalKey);
  const stdIconUrl = toEnkaUrlIfReleased(rawIcon, live) || rawIcon;
  const isCatalyst = String(weaponType || '').toLowerCase() === 'catalyst' || /_Catalyst_/i.test(rawIcon);
  const gachaMatch = !isCatalyst ? rawIcon.match(/UI_EquipIcon_([A-Za-z0-9_]+)\.(?:png|webp)$/i) : null;
  const gachaFilename = gachaMatch ? `UI_Gacha_EquipIcon_${gachaMatch[1]}.png` : '';
  const yattaGachaUrl = gachaFilename ? `https://gi.yatta.moe/assets/UI/${gachaFilename}` : '';
  const enkaGachaUrl = gachaFilename && !live?.unreleased ? `https://enka.network/ui/${gachaFilename}` : '';
  const primarySrc = enkaGachaUrl || yattaGachaUrl || stdIconUrl;
  const secondarySrc = (primarySrc === enkaGachaUrl ? yattaGachaUrl : '').replace(/"/g, '&quot;');
  const tertiarySrc = (stdIconUrl && stdIconUrl !== primarySrc ? stdIconUrl : '').replace(/"/g, '&quot;');
  const safeAlt = String(alt || pascalKey || '').replace(/"/g, '&quot;');
  const initials = (pascalKey || '?').slice(0, 2).toUpperCase();

  return `<span class="asset-wrap ${className}" data-key="${safeAlt}">
    <img
      src="${primarySrc}"
      alt="${safeAlt}"
      class="asset-img p-weapon-splash-img"
      loading="eager"
      decoding="async"
      referrerpolicy="no-referrer"
      onerror="if(this.dataset.fb!=='1'&&'${secondarySrc}'){this.dataset.fb='1';this.src='${secondarySrc}';}else if(this.dataset.fb!=='2'&&'${tertiarySrc}'){this.dataset.fb='2';this.src='${tertiarySrc}';}else{this.style.display='none';this.nextElementSibling.style.display='flex';}"
    />
    <span class="asset-monogram" style="display:none;">${initials}</span>
  </span>`;
}
