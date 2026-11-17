import { renderAssetIcon } from './assets.js';
import { getCharacterKit, getCharacterMeta, getWeaponMeta } from './catalog.js?v=20261115ag';
import { analyzeCharacterKit, classifyCharacterRole, resolveMemberTeamRole } from './build-science.js?v=20261115ah';
import { detectTeamWeaponConflicts } from './calculations.js?v=20261114w';

const ARCHETYPES = ['Hypercarry', 'Dual Carry', 'Chip Damage'];
const CORE_FIELD_ROLES = ['On-Field Carry', 'On-Field Driver', 'Off-Field Sub-DPS', 'Quickswap Support'];

const LOCK_ELEMENTS = {
  'Freeze-Core': ['Hydro', 'Cryo'],
  'Overload-Core': ['Pyro', 'Electro'],
  'Bloom-Core': ['Dendro', 'Hydro']
};

function evaluateSquadArchetypeLocks(members, charByKey) {
  const elems = (members || []).map((m) => getCharacterMeta(m.characterKey)?.element || '').filter(Boolean);
  const badges = [];
  const seen = new Set();
  for (const m of members || []) {
    const kitData = getCharacterKit(m.characterKey);
    const ownedCon = Number(charByKey.get(m.characterKey)?.constellation) || 0;
    const analysis = analyzeCharacterKit(m.characterKey, kitData, null, ownedCon);
    const lock = analysis?.archetypeLock;
    if (!lock || seen.has(lock) || !LOCK_ELEMENTS[lock]) continue;
    seen.add(lock);
    const allowed = new Set(LOCK_ELEMENTS[lock]);
    const allAllowed = elems.length > 0 && elems.every((e) => allowed.has(e));
    const hasBoth = LOCK_ELEMENTS[lock].every((req) => elems.includes(req));
    const active = allAllowed && hasBoth;
    badges.push({
      lock,
      active,
      label: active ? `✓ ${lock} Active` : `⚠ ${lock} Broken (${LOCK_ELEMENTS[lock].join('/')} only)`
    });
  }
  return badges;
}

export function renderTeamsTab(container, state, handlers) {
  const { account, isReadOnly } = state;
  const teams = account.teams || [];
  const weapons = account.weapons || [];
  const charByKey = new Map((account.characters || []).map((c) => [c.key, c]));
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
                .map((team) => {
                  const lockBadges = evaluateSquadArchetypeLocks(team.members || [], charByKey);
                  return `
              <article class="card team-card">
                <div class="team-card-head">
                  <div>
                    <div class="card-eyebrow">${team.archetype.toUpperCase()}</div>
                    <h2 class="card-title">${team.name}</h2>
                    ${
                      lockBadges.length
                        ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">${lockBadges
                            .map((b) => `<span class="pill ${b.active ? 'pill-mint' : 'pill-coral'} mono">${b.label}</span>`)
                            .join('')}</div>`
                        : ''
                    }
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
                      const kitData = getCharacterKit(m.characterKey);
                      const ownedCon = Number(charByKey.get(m.characterKey)?.constellation) || 0;
                      const roleInfo = classifyCharacterRole(m.characterKey, kitData, ownedCon);
                      const autoRole = resolveMemberTeamRole(m.characterKey, kitData, ownedCon, team.members, '');
                      const explicitRole = m.roleOverride || '';
                      const flexOptions = (roleInfo.flexModes || []).map((fm) => ({
                        value: fm.id,
                        label: `Flex: ${fm.label}`
                      }));
                      const seenVals = new Set(flexOptions.map((o) => o.value));
                      const standardOptions = CORE_FIELD_ROLES.filter((r) => !seenVals.has(r)).map((r) => ({
                        value: r,
                        label: r
                      }));
                      const roleOptions = [...flexOptions, ...standardOptions];
                      const instKey = m.weaponId || m.weaponKey;
                      const hasConflict = conflictSet.has(instKey);
                      return `
                      <div class="squad-slot ${hasConflict ? 'slot-conflict' : ''}">
                        <div class="slot-char">
                          <div class="element-frame" data-element="${String(cm.element || '').toLowerCase()}" title="${cm.name} (${cm.element})">
                            ${renderAssetIcon('characters', m.characterKey, cm.name, 'icon-md')}
                          </div>
                          <div>
                            <div class="item-name">${cm.name}</div>
                            <div class="item-meta mono">${cm.element}${roleInfo.functionTags.length ? ` · ${roleInfo.functionTags.slice(0, 2).join(' · ')}` : ''}</div>
                            <select class="select-xs mono slot-role-select" data-team-role="${team.id}" data-member-idx="${idx}" ${disabledAttr}>
                              <option value="" ${!explicitRole ? 'selected' : ''}>Auto: ${autoRole}</option>
                              ${roleOptions
                                .map(
                                  (opt) =>
                                    `<option value="${opt.value}" ${explicitRole === opt.value ? 'selected' : ''}>${opt.label}</option>`
                                )
                                .join('')}
                            </select>
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
              </article>`;
                })
                .join('')
            : `<article class="card"><div class="empty-state">No ${arch} squads configured yet.</div></article>`}
        </div>
      </section>`;
    }).join('')}
  `;

  if (!isReadOnly) {
    container.querySelectorAll('[data-team-role]').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const teamId = e.target.dataset.teamRole;
        const memberIdx = Number(e.target.dataset.memberIdx);
        handlers.onUpdateTeamRole?.(teamId, memberIdx, e.target.value);
      });
    });

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
