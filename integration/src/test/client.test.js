'use strict';

const fs = require('fs');

const {Battle} = require('@pkmn/client');
const {Generations} = require('@pkmn/data');
const {Protocol} = require('@pkmn/protocol');
const {Dex} = require('@pkmn/sim');
const {LogFormatter} = require('@pkmn/view');

const {ExhaustiveRunner, UNLOGGED} = require('./client');

const SKIPPED = new Set([]);

describe('client', () => {
  it('test', async () => {
    const opts = {prng: [1, 2, 3, 4]};
    for (const format of ExhaustiveRunner.FORMATS) {
      opts.format = format;
      expect(await (new ExhaustiveRunner(opts).run())).toBe(0);
    }
  });

  it('effects', () => {
    const gens = {sim: new Generations(Dex), dex: new Generations(require('@pkmn/dex').Dex)};
    for (let num = 1; num <= 9; num++) {
      const battles = {sim: new Battle(gens.sim), dex: new Battle(gens.dex)};
      for (const b of Object.values(battles)) b.gen = b.gens.get(num);
      const gen = battles.dex.gen;
      const names = [
        ...Array.from(gen.abilities, a => `ability: ${a.name}`),
        ...Array.from(gen.items, i => `item: ${i.name}`),
        ...Array.from(gen.moves, m => `move: ${m.name}`),
      ];
      for (const name of names) {
        const [s, d] = [battles.sim, battles.dex].map(b => b.get('conditions', name));
        expect([name, s.id, s.kind]).toEqual([name, d.id, d.kind]);
      }
    }
  });

  it('fixtures', () => {
    for (const name of fs.readdirSync(`${__dirname}/fixtures/input`)) {
      if (SKIPPED.has(name)) continue;

      const input = fs.readFileSync(`${__dirname}/fixtures/input/${name}`, 'utf8');
      const expected = fs.readFileSync(`${__dirname}/fixtures/output/${name}`, 'utf8');
      const perspective = name.endsWith('p1.log') ? 'p1' : 'p2';

      const gens = new Generations(Dex);
      const battle = new Battle(gens);
      const formatter = new LogFormatter(perspective, battle);

      let actual = '';
      for (const line of input.split('\n')) {
        const {args, kwArgs} = Protocol.parseBattleLine(line);
        if (!UNLOGGED.has(args[0])) actual += formatter.formatText(args, kwArgs);
        battle.add(args, kwArgs);
      }
      try {
        expect(actual).toEqual(expected);
      } catch (e) {
        console.error(name);
        throw e;
      }
    }
  });
});
