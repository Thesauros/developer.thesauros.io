/**
 * Particle Swarm Optimization over allocation weights across vaults.
 *
 * Objective: maximize risk-adjusted expected return = sum(w_i * score_i), where
 * score_i is the vault's risk-adjusted APY (from analytics signals). Subject to:
 * weights sum to 1 and each weight <= maxWeight (diversification cap).
 *
 * This is a genuine (small, deterministic) PSO: a swarm of candidate weight
 * vectors evolves via inertia + cognitive (personal-best) + social (global-best)
 * terms, projected back onto the capped simplex each step. Seeded, so a given
 * input always yields the same allocation — reproducible for auditing.
 */

import { rngFromString } from './store.js';

function round4(x) {
  return Math.round(x * 10000) / 10000;
}

/**
 * @param {{signals: Array<{vault_id:string, risk_adjusted_apy:number}>, config?: object}} args
 * @returns PSO result with per-vault weights and expected risk-adjusted return.
 */
export function runPSO({ signals, config = {} }) {
  const vaults = signals.map((s) => ({ id: s.vault_id, score: s.risk_adjusted_apy }));
  const n = vaults.length;
  if (n === 0) {
    return { object: 'pso_result', weights: {}, expected_return: 0, iterations: 0, particles: 0, converged: false };
  }
  // Trivial case: single venue holds everything.
  if (n === 1) {
    return {
      object: 'pso_result',
      weights: { [vaults[0].id]: 1 },
      expected_return: round4(vaults[0].score),
      iterations: 0,
      particles: 0,
      converged: true,
    };
  }

  const {
    particles = 24,
    iterations = 60,
    maxWeight = 0.6,
    inertia = 0.6,
    c1 = 1.4,
    c2 = 1.6,
    seed = 'pso',
  } = config;

  const rng = rngFromString(seed);

  // Project a vector onto the capped simplex {sum = 1, 0 <= w_i <= maxWeight}.
  function project(w) {
    let arr = w.map((x) => Math.min(Math.max(x, 0), maxWeight));
    for (let k = 0; k < 12; k++) {
      const sum = arr.reduce((s, x) => s + x, 0) || 1;
      arr = arr.map((x) => x / sum);
      arr = arr.map((x) => Math.min(x, maxWeight));
      const s2 = arr.reduce((s, x) => s + x, 0);
      if (Math.abs(s2 - 1) < 1e-6) break;
    }
    const sum = arr.reduce((s, x) => s + x, 0) || 1;
    return arr.map((x) => x / sum);
  }

  function randomWeights() {
    return project(vaults.map(() => rng()));
  }

  function fitness(w) {
    let ret = 0;
    for (let i = 0; i < n; i++) ret += w[i] * vaults[i].score;
    return ret;
  }

  // Initialize swarm.
  const pos = [];
  const vel = [];
  const pbest = [];
  const pbestF = [];
  for (let p = 0; p < particles; p++) {
    const w = randomWeights();
    pos.push(w);
    vel.push(w.map(() => (rng() - 0.5) * 0.1));
    pbest.push(w.slice());
    pbestF.push(fitness(w));
  }
  let gIdx = 0;
  for (let p = 1; p < particles; p++) if (pbestF[p] > pbestF[gIdx]) gIdx = p;
  let gbest = pbest[gIdx].slice();
  let gbestF = pbestF[gIdx];

  // Evolve.
  for (let it = 0; it < iterations; it++) {
    for (let p = 0; p < particles; p++) {
      for (let i = 0; i < n; i++) {
        const r1 = rng();
        const r2 = rng();
        vel[p][i] =
          inertia * vel[p][i] +
          c1 * r1 * (pbest[p][i] - pos[p][i]) +
          c2 * r2 * (gbest[i] - pos[p][i]);
        pos[p][i] += vel[p][i];
      }
      pos[p] = project(pos[p]);
      const f = fitness(pos[p]);
      if (f > pbestF[p]) {
        pbestF[p] = f;
        pbest[p] = pos[p].slice();
      }
      if (f > gbestF) {
        gbestF = f;
        gbest = pos[p].slice();
      }
    }
  }

  const weights = {};
  for (let i = 0; i < n; i++) weights[vaults[i].id] = round4(gbest[i]);
  return {
    object: 'pso_result',
    weights,
    expected_return: round4(gbestF),
    iterations,
    particles,
    converged: true,
  };
}
