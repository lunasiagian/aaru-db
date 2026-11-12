/**
 * Google Apps Script — Session-Token Auth Helpers (auth-session.gs)
 *
 * Script Properties (Project Settings -> Script Properties):
 *   PASS_almondeluna   = <Luna's passphrase>
 *   PASS_vanbrohenheim = <Roy's passphrase>
 *
 * Shared global helpers called by Code.gs (no doGet/doPost here).
 */

const SESSION_TTL_SECONDS = 6 * 60 * 60; // 6 hours
const SESSION_CACHE_PREFIX = 'genshin_session_';

function getExpectedPassphrase_(user) {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty('PASS_' + String(user || '').trim().toLowerCase()) || '';
}

function createSessionToken_(user) {
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put(
    SESSION_CACHE_PREFIX + token,
    JSON.stringify({ user: user, createdAt: Date.now() }),
    SESSION_TTL_SECONDS
  );
  return token;
}

function requireSession_(token) {
  if (!token) {
    throw new Error('Unauthorized: missing session token');
  }
  const raw = CacheService.getScriptCache().get(SESSION_CACHE_PREFIX + token);
  if (!raw) {
    throw new Error('Unauthorized: session expired or invalid');
  }
  return JSON.parse(raw);
}

function revokeSession_(token) {
  if (token) {
    CacheService.getScriptCache().remove(SESSION_CACHE_PREFIX + token);
  }
}
