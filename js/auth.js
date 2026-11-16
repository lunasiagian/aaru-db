import { createInviteLink, registerWithInvite, validateInviteToken } from './api.js?v=20261116a';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function stripInviteQueryParam() {
  const url = new URL(window.location.href);
  if (url.searchParams.has('invite')) {
    url.searchParams.delete('invite');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }
}

export function bindAdminInviteButton({ isAdmin, showToast }) {
  const btn = document.getElementById('btn-create-invite');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';

  btn.addEventListener('click', async () => {
    if (!isAdmin()) return;
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Generating...';
    try {
      const res = await createInviteLink();
      if (!res?.token) throw new Error('Server did not return an invite token.');
      const inviteUrl = `${window.location.origin}/?invite=${encodeURIComponent(res.token)}`;
      try {
        await navigator.clipboard.writeText(inviteUrl);
        showToast('One-time invite link copied (valid 48h)', 'mint');
      } catch {
        window.prompt('Copy your one-time invite link (valid 48h):', inviteUrl);
      }
    } catch (err) {
      showToast(err?.message || 'Failed to create invite link', 'coral');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  });
}

export async function initInviteRegistration({ onAuthenticated, showToast }) {
  const params = new URLSearchParams(window.location.search);
  const inviteToken = (params.get('invite') || '').trim();
  if (!inviteToken) return false;

  const modal = document.getElementById('register-modal');
  const form = document.getElementById('register-form');
  const userInput = document.getElementById('reg-username');
  const displayInput = document.getElementById('reg-display-name');
  const passInput = document.getElementById('reg-password');
  const confirmInput = document.getElementById('reg-confirm-password');
  const userHint = document.getElementById('reg-username-hint');
  const errEl = document.getElementById('register-error');
  const submitBtn = document.getElementById('reg-submit-btn');
  const closeBtn = document.getElementById('btn-close-register');

  try {
    const check = await validateInviteToken(inviteToken);
    if (!check?.ok) {
      throw new Error(check?.error || 'Invite link is invalid or expired.');
    }
  } catch (err) {
    stripInviteQueryParam();
    const loginErr = document.getElementById('login-error');
    if (loginErr) loginErr.textContent = err?.message || 'Invite link is invalid or expired.';
    showToast(err?.message || 'Invite link is invalid or expired.', 'coral');
    return false;
  }

  if (!modal || !form) return false;
  modal.hidden = false;

  const closeModal = () => {
    modal.hidden = true;
    stripInviteQueryParam();
  };
  closeBtn?.addEventListener('click', closeModal);

  userInput?.addEventListener('input', () => {
    const val = userInput.value.trim().toLowerCase();
    if (!userHint) return;
    if (!val) {
      userHint.textContent = '3–20 chars: lowercase letters, numbers, or underscores';
      userHint.className = 'field-hint mono';
    } else if (USERNAME_RE.test(val)) {
      userHint.textContent = `Valid username: ${val}`;
      userHint.className = 'field-hint mono text-mint';
    } else {
      userHint.textContent = 'Use 3–20 lowercase letters, numbers, or _ only';
      userHint.className = 'field-hint mono text-coral';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errEl) errEl.textContent = '';

    const username = (userInput?.value || '').trim().toLowerCase();
    const displayName = (displayInput?.value || '').trim();
    const password = passInput?.value || '';
    const confirmPassword = confirmInput?.value || '';

    if (!USERNAME_RE.test(username)) {
      if (errEl) errEl.textContent = 'Username must be 3–20 lowercase letters, numbers, or underscores.';
      return;
    }
    if (!displayName) {
      if (errEl) errEl.textContent = 'Display Name is required.';
      return;
    }
    if (password.length < 6) {
      if (errEl) errEl.textContent = 'Password must be at least 6 characters.';
      return;
    }
    if (password !== confirmPassword) {
      if (errEl) errEl.textContent = 'Passwords do not match.';
      return;
    }

    const orig = submitBtn?.textContent || 'Create Account';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="btn-spinner"></span> Creating Account...';
    }

    try {
      const res = await registerWithInvite({
        token: inviteToken,
        username,
        displayName,
        password,
        confirmPassword
      });
      modal.hidden = true;
      stripInviteQueryParam();
      onAuthenticated(res);
    } catch (err) {
      if (errEl) errEl.textContent = err?.message || 'Registration failed.';
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = orig;
      }
    }
  });

  return true;
}
