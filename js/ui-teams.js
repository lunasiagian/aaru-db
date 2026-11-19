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

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  return escapeHtml(str);
}

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
    <header class="ed-roster-head">
      <div>
        <h1 class="ed-page-title">Team Comps</h1>
        <p class="section-subtitle muted">Squad archetypes, weapon conflict detection, and rotation test notes.</p>
      </div>
      <div class="ed-hud-meta">
        <span>Squads</span> <strong class="mono text-gold">${teams.length}</strong>
        <span class="muted">· Conflicts</span> <strong class="mono ${conflicts.length ? 'text-coral' : 'text-mint'}">${conflicts.length}</strong>
      </div>
    </header>

    ${
      conflicts.length
        ? `
      <section class="ed-conflict-banner" role="alert">
        <div class="ed-conflict-title">Weapon Conflict Detector</div>
        <div class="conflict-list">
          ${conflicts
            .map((c) => {
              const wm = getWeaponMeta(c.weaponKey);
              const details = c.usages.map((u) => `${u.teamName} (${getCharacterMeta(u.characterKey).name})`).join(' vs ');
              return `<div class="conflict-item">
                ${renderAssetIcon('weapons', c.weaponKey, wm.name, 'icon-sm')}
                <span><strong>${escapeHtml(wm.name)}</strong> <span class="mono muted">[${escapeHtml(c.instanceKey)}]</span> shared across: ${escapeHtml(details)}</span>
              </div>`;
            })
            .join('')}
        </div>
      </section>`
        : ''
    }

    ${ARCHETYPES.map((arch) => {
      const group = teams.filter((t) => t.archetype === arch);
      return `
      <section class="archetype-group">
        <div class="archetype-header">
          <h2 class="archetype-title">${arch} Archetype</h2>
          <span class="pill"><span class="mono">${group.length}</span> Squads</span>
        </div>

        <div class="teams-grid">
          ${group.length
            ? group
                .map((team) => {
                  const lockBadges = evaluateSquadArchetypeLocks(team.members || [], charByKey);
                  const teamElems = (team.members || []).map((m) => String(getCharacterMeta(m.characterKey)?.element || 'geo').toLowerCase());
                  return `
              <article class="team-card">
                <div class="team-card-head">
                  <div>
                    <div class="ed-team-elem-strip" aria-hidden="true">
                      ${teamElems.map((el) => `<span class="ed-team-elem-pip" data-element="${escapeAttr(el)}" title="${escapeAttr(el)}"></span>`).join('')}
                    </div>
                    <div class="team-card-kicker">${escapeHtml(team.archetype)}</div>
                    <h3 class="team-card-title">${escapeHtml(team.name)}</h3>
                    ${
                      lockBadges.length
                        ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">${lockBadges
                            .map((b) => `<span class="pill ${b.active ? 'pill-mint' : 'pill-coral'}">${escapeHtml(b.label)}</span>`)
                            .join('')}</div>`
                        : ''
                    }
                  </div>
                  ${
                    !isReadOnly
                      ? `<button type="button" class="btn btn-danger btn-xs" data-team-remove="${escapeAttr(team.id)}">Delete</button>`
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
                      <div class="squad-slot ${hasConflict ? 'slot-conflict' : ''}" data-element="${escapeAttr(String(cm.element || 'geo').toLowerCase())}">
                        <div class="slot-char">
                          <div class="element-frame" data-element="${escapeAttr(String(cm.element || '').toLowerCase())}" title="${escapeAttr(`${cm.name} (${cm.element})`)}">
                            ${renderAssetIcon('characters', m.characterKey, cm.name, 'icon-md')}
                          </div>
                          <div style="min-width:0;flex:1;">
                            <div class="ed-item-name">${escapeHtml(cm.name)}</div>
                            <div class="ed-item-meta">${escapeHtml(cm.element)}${roleInfo.functionTags.length ? ` · ${escapeHtml(roleInfo.functionTags.slice(0, 2).join(' · '))}` : ''}</div>
                            <select class="select-xs slot-role-select" aria-label="${escapeAttr(cm.name)} role" data-team-role="${escapeAttr(team.id)}" data-member-idx="${idx}" ${disabledAttr}>
                              <option value="" ${!explicitRole ? 'selected' : ''}>Auto: ${escapeHtml(autoRole)}</option>
                              ${roleOptions
                                .map(
                                  (opt) =>
                                    `<option value="${escapeAttr(opt.value)}" ${explicitRole === opt.value ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`
                                )
                                .join('')}
                            </select>
                          </div>
                        </div>
                        <div class="slot-weapon">
                          ${renderAssetIcon('weapons', m.weaponKey, wm.name, 'icon-sm')}
                          <select class="select-xs" aria-label="${escapeAttr(cm.name)} weapon" data-team-weapon="${escapeAttr(team.id)}" data-member-idx="${idx}" ${disabledAttr}>
                            ${weapons
                              .map(
                                (w) =>
                                  `<option value="${escapeAttr(w.id)}" data-wkey="${escapeAttr(w.key)}" ${(m.weaponId ? m.weaponId === w.id : m.weaponKey === w.key) ? 'selected' : ''}>${escapeHtml(getWeaponMeta(w.key).name)} (R${w.refinement})</option>`
                              )
                              .join('')}
                          </select>
                          ${hasConflict ? '<span class="pill pill-coral">Conflict</span>' : ''}
                        </div>
                      </div>`;
                    })
                    .join('')}
                </div>

                <div class="test-lab-box">
                  <div class="test-lab-title">Miliastra Test Lab Notes</div>
                  <label class="lab-field">
                    <span>Rotation Feel</span>
                    <textarea rows="2" class="textarea-lab" data-lab-team="${escapeAttr(team.id)}" data-lab-field="rotationFeel" ${disabledAttr}>${escapeHtml(team.testLab?.rotationFeel || '')}</textarea>
                  </label>
                  <label class="lab-field">
                    <span>Energy Reliability</span>
                    <textarea rows="2" class="textarea-lab" data-lab-team="${escapeAttr(team.id)}" data-lab-field="energyReliability" ${disabledAttr}>${escapeHtml(team.testLab?.energyReliability || '')}</textarea>
                  </label>
                  <label class="lab-field">
                    <span>Poise &amp; Stagger</span>
                    <textarea rows="2" class="textarea-lab" data-lab-team="${escapeAttr(team.id)}" data-lab-field="poiseNotes" ${disabledAttr}>${escapeHtml(team.testLab?.poiseNotes || '')}</textarea>
                  </label>
                </div>
              </article>`;
                })
                .join('')
            : `<div class="ed-empty-state">No ${arch} squads configured yet.</div>`}
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
