'use strict';

// Plays seeded random battles on the simulator, feeds each battle's spectator log to
// @pkmn/client, and after every update compares what the client tracks with the simulator's own
// state: the PP each move has used, the toxic counter and the sleep counter.

const path = require('path');

const {Generations} = require('@pkmn/data');
const {Protocol} = require('@pkmn/protocol');

const FORMATS = [
  'gen9randombattle', 'gen9randomdoublesbattle', 'gen8randombattle', 'gen7randombattle',
  'gen6randombattle', 'gen5randombattle', 'gen4randombattle', 'gen3randombattle',
];

// @pkmn/sim with @pkmn/randoms, or the build of a Showdown checkout
function simulator(checkout) {
  if (!checkout) {
    const sim = require('@pkmn/sim');
    sim.Teams.setGeneratorFactory(require('@pkmn/randoms').TeamGenerators);
    return sim;
  }
  const dir = path.resolve(checkout);
  return {
    ...require(`${dir}/dist/sim`),
    RandomPlayerAI: require(`${dir}/dist/sim/tools/random-player-ai`).RandomPlayerAI,
    extractChannelMessages: require(`${dir}/dist/sim/battle`).extractChannelMessages,
  };
}

// The seeds of battle n: the battle's own, each player's team, and each player's choices.
function seeds(n) {
  const battle = [n, n * 7 + 1, n * 13 + 2, n * 31 + 3].map(x => x & 0xffff);
  return {
    battle,
    team: {p1: battle.map(x => x ^ 5), p2: battle.map(x => x ^ 6)},
    ai: {p1: battle.map(x => x ^ 1), p2: battle.map(x => x ^ 2)},
  };
}

class Differential {
  constructor(options = {}) {
    this.sim = simulator(options.sim);
    this.client = require(options.client ? path.resolve(options.client) : '@pkmn/client');
    this.gens = new Generations(require('@pkmn/sim').Dex);
    this.num = options.num || 250;
    this.offset = options.offset || 0;
    this.verbose = !!options.verbose;
  }

  // Plays `num` battles of the format and returns how many checks ran and the mismatches, by
  // kind and tag, first seen at any update and still there at the end of the battle.
  run(format) {
    const result = {format, battles: 0, errors: 0, checks: 0, seen: {}, end: {}};
    for (let n = this.offset + 1; n <= this.offset + this.num; n++) {
      try {
        this.play(format, n, result);
        result.battles++;
      } catch (err) {
        result.errors++;
        if (this.verbose) console.error(`${format} #${n}: ${err.stack}`);
      }
    }
    return result;
  }

  play(format, n, result) {
    const s = seeds(n);
    const sim = this.sim;
    let pending = [];
    const battle = new sim.Battle({
      formatid: format, seed: s.battle,
      send: (type, data) => {
        if (type !== 'update') return;
        if (Array.isArray(data)) data = data.join('\n');
        pending.push(...sim.extractChannelMessages(data, [0])[0]);
      },
    });
    battle.setPlayer('p1', {name: 'A', seed: s.team.p1});
    battle.setPlayer('p2', {name: 'B', seed: s.team.p2});
    const ais = {};
    for (const id of ['p1', 'p2']) {
      ais[id] = new sim.RandomPlayerAI(null, {seed: s.ai[id], move: 0.85, mega: 0.6});
      ais[id].choose = choice => { ais[id].choice = choice; };
    }

    const client = new this.client.Battle(this.gens);
    // which Pokemon used a Z-Move or Dynamaxed, by `${side}|${name}`
    const used = {z: new Set(), max: new Set()};
    const seen = new Set();
    let last = new Map();
    for (let step = 0; step < 2000; step++) {
      battle.sendUpdates();
      for (const line of pending) {
        const {args, kwArgs} = Protocol.parseBattleLine(line);
        if (args[0] === '-zpower') used.z.add(key(args[1]));
        if (args[0] === '-start' && args[2] === 'Dynamax') used.max.add(key(args[1]));
        client.add(args, kwArgs);
      }
      pending = [];
      // the last residual has no |upkeep| after it, so stop comparing once the battle ends
      if (battle.ended) break;
      const now = this.compare(battle, client, used, result);
      for (const [k, m] of now) {
        if (seen.has(k)) continue;
        seen.add(k);
        result.seen[m.label] = (result.seen[m.label] || 0) + 1;
      }
      last = now;
      for (const side of battle.sides) {
        if (!side.activeRequest || side.activeRequest.wait || side.isChoiceDone()) continue;
        const ai = ais[side.id];
        ai.choice = undefined;
        ai.receiveRequest(side.activeRequest);
        if (!ai.choice || !battle.choose(side.id, ai.choice)) battle.choose(side.id, 'default');
      }
    }
    for (const m of last.values()) {
      result.end[m.label] = (result.end[m.label] || 0) + 1;
      if (this.verbose) console.log(`  ${format} #${n} t${battle.turn} ${m.label}: ${m.detail}`);
    }
  }

  // The mismatches between the simulator and the client right now, by what they are about.
  compare(battle, client, used, result) {
    const mismatches = new Map();
    const gen = this.gens.get(battle.gen);
    for (const [i, side] of battle.sides.entries()) {
      const cside = client.sides[i];
      if (!cside) continue;
      const illusion = side.pokemon.some(p => p.baseAbility === 'illusion');
      for (const sp of side.pokemon) {
        if (sp.transformed || sp.illusion) continue;
        const cp = cside.team.find(p => p.name === sp.name && !p.illusion);
        if (!cp || cp.volatiles.transform) continue;
        const k = `${side.id}|${sp.name}`;
        const tags = [illusion && 'illusion', used.z.has(k) && 'z', used.max.has(k) && 'max'];
        const tag = tags.filter(t => t).join('+') || 'other';
        const add = (kind, what, detail) =>
          mismatches.set(`${k}|${what}`, {label: `${kind}:${tag}`, detail: `${k} ${detail}`});

        for (const slot of sp.moveSlots) {
          if (slot.virtual) continue;
          const cs = cp.moveSlots.find(m => m.id === slot.id && !m.virtual);
          if (!cs) continue;
          result.checks++;
          const ppUsed = slot.maxpp - slot.pp;
          // a range is [upper, lower]
          const ok = Array.isArray(cs.ppUsed)
            ? ppUsed <= cs.ppUsed[0] && ppUsed >= cs.ppUsed[1] : ppUsed === cs.ppUsed;
          if (ok) continue;
          const moves = cp.moveSlots.filter(m => !m.virtual).map(m => gen.dex.moves.get(m.id));
          const placeholder = moves.some(m => m.exists && (m.isZ || m.isMax));
          const known = moves.filter(m => m.exists && !m.isZ && !m.isMax).length;
          add('pp', slot.id, `${slot.id} sim=${ppUsed} client=${JSON.stringify(cs.ppUsed)}` +
            ` known=${known}/${sp.moveSlots.length}${placeholder ? ' z/max placeholder' : ''}`);
        }

        if (!sp.isActive || sp.fainted) continue;
        if (sp.status === 'tox' && battle.gen >= 3 && cp.status === 'tox') {
          result.checks++;
          const stage = sp.statusState.stage;
          if (stage !== cp.statusState.toxicTurns) {
            add('tox', 'tox', `toxic sim=${stage} client=${cp.statusState.toxicTurns}`);
          }
        }
        // the client counts the turns it couldn't move, which Early Bird halves in the sim
        if (sp.status === 'slp' && cp.status === 'slp' && battle.gen >= 5 &&
          !sp.hasAbility('earlybird') && typeof sp.statusState.startTime === 'number') {
          result.checks++;
          const slept = sp.statusState.startTime - sp.statusState.time;
          if (slept !== cp.statusState.sleepTurns) {
            add('slp', 'slp', `sleep sim=${slept} client=${cp.statusState.sleepTurns}`);
          }
        }
      }
    }
    return mismatches;
  }
}

function key(ident) {
  const {player, name} = Protocol.parsePokemonIdent(ident);
  return `${player}|${name}`;
}

Differential.FORMATS = FORMATS;
exports.Differential = Differential;
