import { animate, spring, stagger } from './vendor/anime.esm.min.js';

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

/**
 * Choreographed entrance for the Today HUD (runs once per tab switch, not on every click).
 */
export function animateTodayEntrance(container) {
  if (!container || prefersReduced()) return;

  const blocks = container.querySelectorAll('.p-hud-hero, .p-resource-strip, .p-strategy-strip');
  if (blocks.length) {
    animate(blocks, {
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 380,
      delay: stagger(45),
      ease: 'outExpo'
    });
  }

  const cards = container.querySelectorAll('.p-target-card');
  if (cards.length) {
    animate(cards, {
      opacity: [0, 1],
      translateY: [8, 0],
      scale: [0.98, 1],
      duration: 340,
      delay: stagger(55, { start: 90 }),
      ease: 'outExpo'
    });
  }

  container.querySelectorAll('[data-count-to]').forEach((el) => {
    const target = Number(el.dataset.countTo);
    if (!Number.isFinite(target) || target <= 0) return;
    const prefix = el.dataset.countPrefix || '';
    const suffix = el.dataset.countSuffix || '';
    const state = { val: Math.round(target * 0.72) };
    animate(state, {
      val: target,
      duration: 520,
      ease: 'outExpo',
      onUpdate: () => {
        el.textContent = `${prefix}${Math.round(state.val).toLocaleString()}${suffix}`;
      }
    });
  });
}

/**
 * Tactile spring pop when toggling a Daily Commission or Weekly Boss chip.
 */
export function pulseReminderChip(container, group, id) {
  if (!container || prefersReduced()) return;
  const chip = container.querySelector(`[data-p-check="${group}"][data-p-cid="${id}"]`);
  if (!chip) return;
  animate(chip, {
    scale: [0.92, 1],
    duration: 340,
    ease: spring({ bounce: 0.42, duration: 340 })
  });
}

/**
 * Staggered entrance for Prefarm Queue cards, Artifact Domain cards, and material chips.
 */
export function animatePrefarmEntrance(container) {
  if (!container || prefersReduced()) return;

  const cards = container.querySelectorAll('.p-pf-card, .p-dom-eff-card');
  if (cards.length) {
    animate(cards, {
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 340,
      delay: stagger(40),
      ease: 'outExpo'
    });
  }

  const chips = container.querySelectorAll('.p-pf-mat-chip');
  if (chips.length) {
    animate(chips, {
      opacity: [0, 1],
      scale: [0.94, 1],
      duration: 240,
      delay: stagger(14, { start: 60 }),
      ease: 'outQuad'
    });
  }
}

/**
 * Spring pop on an inline Lv. or A/E/Q stepper number (extra pop when hitting Crown 10).
 */
export function pulseStepperValue(container, id, field, isCrown = false) {
  if (!container || prefersReduced()) return;
  const btn = container.querySelector(`[data-pf-id="${id}"][data-pf-step="${field}"]`);
  const valEl = btn?.closest('.p-pf-step')?.querySelector('strong');
  if (!valEl) return;
  animate(valEl, {
    scale: [isCrown ? 1.32 : 1.18, 1],
    duration: 320,
    ease: spring({ bounce: 0.48, duration: 320 })
  });
}

/**
 * Character Dossier reveal: splash art glide + spring stat-radar polygon bloom.
 */
export function animateDossierHero(container) {
  if (!container || prefersReduced()) return;

  const splash = container.querySelector('.p-dossier-hero .ed-gacha-splash-img');
  if (splash) {
    animate(splash, {
      opacity: [0, 1],
      translateX: [16, 0],
      duration: 460,
      ease: 'outExpo'
    });
  }

  const poly = container.querySelector('.p-radar-poly');
  if (poly) {
    poly.style.transformBox = 'fill-box';
    poly.style.transformOrigin = 'center';
    animate(poly, {
      opacity: [0, 1],
      scale: [0.62, 1],
      duration: 500,
      ease: spring({ bounce: 0.3, duration: 500 })
    });
  }
}
