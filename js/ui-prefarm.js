import { renderAssetIcon } from './assets.js';
import { getAllCharacterKeys, getAllWeaponKeys, getCharacterMeta, getWeaponMeta } from './catalog.js';
import { calculateWaterfallPrefarm } from './calculations.js';

export function renderPrefarmTab(container, state, handlers) {
  const { account, isReadOnly } = state;
  const allCharKeys = getAllCharacterKeys();
  const allWeaponKeys = getAllWeaponKeys();
  const queue = [...(account.prefarmQueue || [])].sort((a, b) => a.rank - b.rank);
  const waterfallMap = calculateWaterfallPrefarm(queue, account.inventory || {}, account.wallet);
  const disabledAttr = isReadOnly ? 'disabled' : '';

  container.innerHTML = `
    <div class="section-header">
      <div>
        <div class="eyebrow">GENSHIN SHEET (FINAL) / PREFARM PLANNER</div>
        <h1 class="section-title">Ascension &amp; Talent Deficit Calculator</h1>
      </div>
      <div class="header-meta mono">
        TARGETS: <span class="text-gold">${queue.length}</span> • #1 &amp; #2 FEED CENTRAL HUD POOL
      </div>
    </div>

    ${
      !isReadOnly
        ? `
      <article class="card prefarm-add-card">
        <div class="card-eyebrow">ADD PREFARM TARGET</div>
        <form class="prefarm-add-form" id="prefarm-add-form">
          <label class="mini-field">
            <span>CHARACTER</span>
            <select name="characterKey" class="select-sm">
              ${allCharKeys
                .map((k) => {
                  const m = getCharacterMeta(k);
                  const label = m.name.includes(`(${m.element})`) ? m.name : `${m.name} (${m.element})`;
                  return `<option value="${k}">${label}</option>`;
                })
                .join('')}
            </select>
          </label>
          <label class="mini-field">
            <span>TARGET LVL</span>
            <select name="targetLevel" class="select-sm mono">
              <option value="80">80</option>
              <option value="90" selected>90</option>
              <option value="95">95 (Masterless)</option>
            </select>
          </label>
          <label class="mini-field">
            <span>TARGET A</span>
            <input type="number" name="tAuto" min="1" max="10" value="6" class="input-mono sm" />
          </label>
          <label class="mini-field">
            <span>TARGET E</span>
            <input type="number" name="tSkill" min="1" max="10" value="9" class="input-mono sm" />
          </label>
          <label class="mini-field">
            <span>TARGET Q</span>
            <input type="number" name="tBurst" min="1" max="10" value="9" class="input-mono sm" />
          </label>
          <label class="mini-field">
            <span>WEAPON (OPTIONAL)</span>
            <select name="weaponKey" class="select-sm">
              <option value="">— None —</option>
              ${allWeaponKeys
                .map((wk) => `<option value="${wk}">${getWeaponMeta(wk).name}</option>`)
                .join('')}
            </select>
          </label>
          <button type="submit" class="btn btn-gold">+ Add Target</button>
        </form>
      </article>`
        : ''
    }

    <div class="prefarm-list">
      ${queue.length
        ? queue
            .map((target, idx) => {
              const charMeta = getCharacterMeta(target.characterKey);
              const weaponMeta = target.weaponKey ? getWeaponMeta(target.weaponKey) : null;
              const reqRows = waterfallMap.get(target.id) || [];
              const deficitCount = reqRows.filter((r) => r.deficit > 0).length;

              return `
              <article class="card prefarm-card">
                <div class="prefarm-head">
                  <div class="prefarm-char">
                    <span class="rank-badge mono ${target.rank <= 2 ? 'rank-top' : ''}">#${target.rank}</span>
                    ${renderAssetIcon('characters', target.characterKey, charMeta.name, 'icon-md')}
                    <div>
                      <div class="item-name">${charMeta.name} <span class="pill">${charMeta.element}</span></div>
                      <div class="item-meta mono">
                        Lv.${target.currentLevel} → Lv.${target.targetLevel} •
                        Talents ${target.currentTalent.auto}/${target.currentTalent.skill}/${target.currentTalent.burst} →
                        ${target.targetTalent.auto}/${target.targetTalent.skill}/${target.targetTalent.burst}${weaponMeta ? ` • ${weaponMeta.name} (${target.weaponCurrentLevel || 1}→${target.weaponTargetLevel || 90})` : ''}
                      </div>
                    </div>
                  </div>

                  <div class="prefarm-controls">
                    <span class="pill ${deficitCount > 0 ? 'pill-coral' : 'pill-mint'} mono">
                      ${deficitCount > 0 ? `${deficitCount} DEFICITS` : 'READY TO BUILD'}
                    </span>
                    ${
                      !isReadOnly
                        ? `
                      <button type="button" class="btn btn-ghost btn-xs" data-pf-move="up" data-pf-id="${target.id}" ${idx === 0 ? 'disabled' : ''}>▲</button>
                      <button type="button" class="btn btn-ghost btn-xs" data-pf-move="down" data-pf-id="${target.id}" ${idx === queue.length - 1 ? 'disabled' : ''}>▼</button>
                      <button type="button" class="btn btn-danger btn-xs" data-pf-remove="${target.id}">Remove</button>`
                        : ''
                    }
                  </div>
                </div>

                <div class="prefarm-targets-edit">
                  <label class="mini-field">
                    <span>CUR LVL</span>
                    <input type="number" min="1" max="95" class="input-mono sm" data-pf-edit="currentLevel" data-pf-id="${target.id}" value="${target.currentLevel}" ${disabledAttr} />
                  </label>
                  <label class="mini-field">
                    <span>TGT LVL</span>
                    <input type="number" min="1" max="95" class="input-mono sm" data-pf-edit="targetLevel" data-pf-id="${target.id}" value="${target.targetLevel}" ${disabledAttr} />
                  </label>
                  <label class="mini-field">
                    <span>TGT A</span>
                    <input type="number" min="1" max="10" class="input-mono sm" data-pf-edit="tAuto" data-pf-id="${target.id}" value="${target.targetTalent.auto}" ${disabledAttr} />
                  </label>
                  <label class="mini-field">
                    <span>TGT E</span>
                    <input type="number" min="1" max="10" class="input-mono sm" data-pf-edit="tSkill" data-pf-id="${target.id}" value="${target.targetTalent.skill}" ${disabledAttr} />
                  </label>
                  <label class="mini-field">
                    <span>TGT Q</span>
                    <input type="number" min="1" max="10" class="input-mono sm" data-pf-edit="tBurst" data-pf-id="${target.id}" value="${target.targetTalent.burst}" ${disabledAttr} />
                  </label>
                  <label class="mini-field">
                    <span>WEAPON</span>
                    <select class="select-sm" data-pf-edit="weaponKey" data-pf-id="${target.id}" ${disabledAttr}>
                      <option value="">— None —</option>
                      ${allWeaponKeys
                        .map((wk) => `<option value="${wk}" ${target.weaponKey === wk ? 'selected' : ''}>${getWeaponMeta(wk).name}</option>`)
                        .join('')}
                    </select>
                  </label>
                  ${
                    target.weaponKey
                      ? `<label class="mini-field">
                          <span>WPN CUR</span>
                          <input type="number" min="1" max="90" class="input-mono sm" data-pf-edit="weaponCurrentLevel" data-pf-id="${target.id}" value="${target.weaponCurrentLevel || 1}" ${disabledAttr} />
                        </label>
                        <label class="mini-field">
                          <span>WPN TGT</span>
                          <input type="number" min="1" max="90" class="input-mono sm" data-pf-edit="weaponTargetLevel" data-pf-id="${target.id}" value="${target.weaponTargetLevel || 90}" ${disabledAttr} />
                        </label>`
                      : ''
                  }
                </div>

                <div class="req-grid">
                  ${reqRows
                    .map((r) => {
                      const isDef = r.deficit > 0;
                      return `
                      <div class="req-chip ${isDef ? 'row-deficit' : 'row-surplus'}">
                        ${renderAssetIcon('materials', r.key, r.name, 'icon-xs')}
                        <div class="req-chip-body">
                          <div class="req-name">${r.name}</div>
                          <div class="req-nums mono">
                            <span>${r.owned.toLocaleString()} / ${r.needed.toLocaleString()}</span>
                            <span class="${isDef ? 'text-coral' : 'text-mint'}">${isDef ? `-${r.deficit.toLocaleString()}` : `+${r.surplus.toLocaleString()}`}</span>
                          </div>
                        </div>
                      </div>`;
                    })
                    .join('')}
                </div>
              </article>`;
            })
            .join('')
        : '<article class="card"><div class="empty-state">No characters in the Prefarm Queue yet.</div></article>'}
    </div>
  `;

  if (!isReadOnly) {
    container.querySelector('#prefarm-add-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      const origText = submitBtn?.textContent || 'Add Target';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="btn-spinner"></span> Adding...';
      }
      try {
        const fd = new FormData(e.target);
        const characterKey = fd.get('characterKey');
        const weaponKey = String(fd.get('weaponKey') || '');
        const existingChar = (account.characters || []).find((c) => c.key === characterKey);
        await handlers.onAddPrefarmTarget({
          characterKey,
          currentLevel: existingChar?.level || 1,
          targetLevel: Number(fd.get('targetLevel')) || 90,
          currentTalent: existingChar?.talent || { auto: 1, skill: 1, burst: 1 },
          targetTalent: {
            auto: Number(fd.get('tAuto')) || 6,
            skill: Number(fd.get('tSkill')) || 9,
            burst: Number(fd.get('tBurst')) || 9
          },
          weaponKey,
          weaponCurrentLevel: 1,
          weaponTargetLevel: 90
        });
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = origText;
        }
      }
    });

    container.querySelectorAll('[data-pf-move]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await handlers.onMovePrefarmTarget(btn.dataset.pfId, btn.dataset.pfMove);
      });
    });

    container.querySelectorAll('[data-pf-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Removing...';
        await handlers.onRemovePrefarmTarget(btn.dataset.pfRemove || btn.dataset.pfId);
      });
    });

    container.querySelectorAll('[data-pf-edit]').forEach((input) => {
      input.addEventListener('change', (e) => {
        const field = e.target.dataset.pfEdit;
        const val = field === 'weaponKey' ? e.target.value : (Number(e.target.value) || 1);
        handlers.onEditPrefarmTarget(e.target.dataset.pfId, field, val);
      });
    });
  }
}
