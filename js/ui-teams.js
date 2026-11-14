import { renderAssetIcon } from './assets.js';
import { getCharacterMeta, getWeaponMeta } from './catalog.js?v=20261113ag';
import { detectTeamWeaponConflicts } from './calculations.js?v=20261113t';

const ARCHETYPES = ['Hypercarry', 'Dual Carry', 'Chip Damage'];

export function renderTeamsTab(container, state, handlers) {
  const { account, isReadOnly } = state;
  const teams = account.teams || [];
  const weapons = account.weapons || [];
  const conflicts = detectTeamWeaponConflicts(teams);
  const conflictSet = new Set(conflicts.map((c) => c.instanceKey));
  const disabledAttr = isReadOnly ? 'disabled' : '';

  container.innerHTML = `
    <div class="section-header">
      <div>
        <div class="eyebrow">AARUDB / TEAMS</div>
        <h1 class="section-title">Team Comps</h1>
      </div>
      <div class="header-meta mono">
        SQUADS: <span class="text-gold">${teams.length}</span> •
        CONFLICTS: <span class="${conflicts.length ? 'text-coral' : 'text-mint'}">${conflicts.length}</span>
      </div>
    </div>

    ${
      conflicts.length
        ? `
      <article class="card conflict-banner">
        <div class="card-eyebrow text-coral">⚠ WEAPON CONFLICT DETECTOR</div>
        <div class="conflict-list">
          ${conflicts
            .map((c) => {
              const wm = getWeaponMeta(c.weaponKey);
              const details = c.usages.map((u) => `${u.teamName} (${getCharacterMeta(u.characterKey).name})`).join(' vs ');
              return `<div class="conflict-item">
                ${renderAssetIcon('weapons', c.weaponKey, wm.name, 'icon-sm')}
                <span><strong>${wm.name}</strong> <span class="mono muted">[${c.instanceKey}]</span> shared across: ${details}</span>
              </div>`;
            })
            .join('')}
        </div>
      </article>`
        : ''
    }

    ${ARCHETYPES.map((arch) => {
      const group = teams.filter((t) => t.archetype === arch);
      return `
      <section class="archetype-group">
        <div class="archetype-header">
          <span class="eyebrow">${arch.toUpperCase()} ARCHETYPE</span>
          <span class="pill mono">${group.length} SQUADS</span>
        </div>

        <div class="teams-grid">
          ${group.length
            ? group
                .map(
                  (team) => `
              <article class="card team-card">
                <div class="team-card-head">
                  <div>
                    <div class="card-eyebrow">${team.archetype.toUpperCase()}</div>
                    <h2 class="card-title">${team.name}</h2>
                  </div>
                  ${
                    !isReadOnly
                      ? `<button type="button" class="btn btn-danger btn-xs" data-team-remove="${team.id}">Delete</button>`
                      : ''
                  }
                </div>

                <div class="squad-slots">
                  ${(team.members || [])
                    .map((m, idx) => {
                      const cm = getCharacterMeta(m.characterKey);
                      const wm = getWeaponMeta(m.weaponKey);
                      const instKey = m.weaponId || m.weaponKey;
                      const hasConflict = conflictSet.has(instKey);
                      return `
                      <div class="squad-slot ${hasConflict ? 'slot-conflict' : ''}">
                        <div class="slot-char">
                          ${renderAssetIcon('characters', m.characterKey, cm.name, 'icon-md')}
                          <div>
                            <div class="item-name">${cm.name}</div>
                            <div class="item-meta mono">${m.role || cm.element}</div>
                          </div>
                        </div>
                        <div class="slot-weapon">
                          ${renderAssetIcon('weapons', m.weaponKey, wm.name, 'icon-sm')}
                          <select class="select-xs mono" data-team-weapon="${team.id}" data-member-idx="${idx}" ${disabledAttr}>
                            ${weapons
                              .map(
                                (w) =>
                                  `<option value="${w.id}" data-wkey="${w.key}" ${(m.weaponId ? m.weaponId === w.id : m.weaponKey === w.key) ? 'selected' : ''}>${getWeaponMeta(w.key).name} (R${w.refinement})</option>`
                              )
                              .join('')}
                          </select>
                          ${hasConflict ? '<span class="pill pill-coral mono">CONFLICT</span>' : ''}
                        </div>
                      </div>`;
                    })
                    .join('')}
                </div>

                <div class="test-lab-box">
                  <div class="card-eyebrow">MILIASTRA TEST LAB NOTES</div>
                  <label class="lab-field">
                    <span class="mono">ROTATION FEEL</span>
                    <textarea rows="2" class="textarea-lab" data-lab-team="${team.id}" data-lab-field="rotationFeel" ${disabledAttr}>${team.testLab?.rotationFeel || ''}</textarea>
                  </label>
                  <label class="lab-field">
                    <span class="mono">ENERGY RELIABILITY</span>
                    <textarea rows="2" class="textarea-lab" data-lab-team="${team.id}" data-lab-field="energyReliability" ${disabledAttr}>${team.testLab?.energyReliability || ''}</textarea>
                  </label>
                  <label class="lab-field">
                    <span class="mono">POISE &amp; STAGGER</span>
                    <textarea rows="2" class="textarea-lab" data-lab-team="${team.id}" data-lab-field="poiseNotes" ${disabledAttr}>${team.testLab?.poiseNotes || ''}</textarea>
                  </label>
                </div>
              </article>`
                )
                .join('')
            : `<article class="card"><div class="empty-state">No ${arch} squads configured yet.</div></article>`}
        </div>
      </section>`;
    }).join('')}
  `;

  if (!isReadOnly) {
    container.querySelectorAll('[data-team-weapon]').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const teamId = e.target.dataset.teamWeapon;
        const memberIdx = Number(e.target.dataset.memberIdx);
        const weaponId = e.target.value;
        const weaponKey = e.target.selectedOptions[0]?.dataset?.wkey || '';
        handlers.onUpdateTeamWeapon(teamId, memberIdx, weaponId, weaponKey);
      });
    });

    container.querySelectorAll('[data-lab-team]').forEach((ta) => {
      ta.addEventListener('change', (e) => {
        handlers.onUpdateTeamLab(e.target.dataset.labTeam, e.target.dataset.labField, e.target.value);
      });
    });

    container.querySelectorAll('[data-team-remove]').forEach((btn) => {
      btn.addEventListener('click', () => handlers.onRemoveTeam(btn.dataset.teamRemove));
    });
  }
}
