import {Generations, ID} from '@pkmn/data';
import {Dex} from '@pkmn/dex';
import {DetailedPokemon, PokemonIdent, Username} from '@pkmn/protocol';

import {Battle, Pokemon} from '../index';

const GENS = new Generations(Dex);

// NOTE: tested exhaustively in integration/src/test/client.js
describe('Battle', () => {
  it.todo('#setTurn');
  it.todo('#updateToxicTurns');

  it('#upkeep', () => {
    const battle = new Battle(GENS);
    const add = (lines: string[]) => {
      for (const line of lines) battle.add(line);
    };
    add([
      '|player|p1|Alice|1|', '|player|p2|Bob|2|', '|gametype|doubles', '|gen|9',
      '|switch|p1a: Armarouge|Armarouge, M|311/311', '|switch|p1b: Scizor|Scizor, F|281/281',
      '|switch|p2a: Excadrill|Excadrill, M|100/100', '|switch|p2b: Magikarp|Magikarp, F|100/100',
      '|turn|1',
      '|move|p1a: Armarouge|Wide Guard|p1a: Armarouge', '|-singleturn|p1a: Armarouge|Wide Guard',
      '|move|p2a: Excadrill|Rock Slide|p1b: Scizor|[spread]',
      '|-activate|p1a: Armarouge|move: Wide Guard', '|-activate|p1b: Scizor|move: Wide Guard',
      '|move|p1b: Scizor|U-turn|p2b: Magikarp', '|-damage|p2b: Magikarp|2/100',
    ]);
    // U-turn's switch request comes here, mid-turn, while the guard still stands
    expect(battle.p1.sideConditions.wideguard).toBeDefined();
    add(['|switch|p1b: Pikachu|Pikachu, F|211/211|[from] U-turn']);
    expect(battle.p1.sideConditions.wideguard).toBeDefined();

    add(['|', '|upkeep']);
    expect(battle.p1.sideConditions.wideguard).toBeUndefined();
    expect(battle.p1.active[0]!.volatiles.wideguard).toBeUndefined();
  });

  it('#upkeep (toxic)', () => {
    const toxic = (gen: number, from = '') => {
      const battle = new Battle(GENS);
      for (const line of [
        '|player|p1|Alice|1|', '|player|p2|Bob|2|', `|gen|${gen}`,
        '|switch|p1a: Blissey|Blissey, F|100/100', '|switch|p2a: Gengar|Gengar, M|100/100',
        '|turn|1', `|-status|p1a: Blissey|tox${from}`,
      ]) {
        battle.add(line);
      }
      const counts = [];
      for (let turn = 2; turn <= 20; turn++) {
        battle.add('|upkeep');
        counts.push(battle.p1.active[0]!.statusState.toxicTurns);
        battle.add(`|turn|${turn}`);
      }
      return counts;
    };
    const capped = (first: number) => Array.from({length: 19}, (_, i) => Math.min(first + i, 15));
    // the sim stops at 15 from Gen 3, and Toxic Orb poisons after the turn's toxic damage
    expect(toxic(9)).toEqual(capped(1));
    expect(toxic(9, '|[from] item: Toxic Orb')).toEqual(capped(0));
    expect(toxic(3)).toEqual(capped(1));
    expect(toxic(2)[18]).toBe(19);
  });

  it('#parsePokemonId', () => {
    const battle = new Battle(GENS);

    let p = battle.parsePokemonId('p1');
    expect(p.name).toBe('');
    expect(p.siden).toBe(0);
    expect(p.slot).toBe(-1);
    expect(p.pokemonid).toBe('p1');

    p = battle.parsePokemonId('p2');
    expect(p.name).toBe('');
    expect(p.siden).toBe(1);
    expect(p.slot).toBe(-1);
    expect(p.pokemonid).toBe('p2');

    p = battle.parsePokemonId('p1: Gengar' as PokemonIdent);
    expect(p.name).toBe('Gengar');
    expect(p.siden).toBe(0);
    expect(p.slot).toBe(-1);
    expect(p.pokemonid).toBe('p1: Gengar');

    p = battle.parsePokemonId('p2: Mew' as PokemonIdent);
    expect(p.name).toBe('Mew');
    expect(p.siden).toBe(1);
    expect(p.slot).toBe(-1);
    expect(p.pokemonid).toBe('p2: Mew');

    p = battle.parsePokemonId('p1c: Rapidash' as PokemonIdent);
    expect(p.name).toBe('Rapidash');
    expect(p.siden).toBe(0);
    expect(p.slot).toBe(2);
    expect(p.pokemonid).toBe('p1: Rapidash');

    p = battle.parsePokemonId('p2x: Arcanine' as PokemonIdent);
    expect(p.name).toBe('p2x: Arcanine');
    expect(p.siden).toBe(-1);
    expect(p.slot).toBe(-1);
    expect(p.pokemonid).toBe('p2x: Arcanine');

    p = battle.parsePokemonId('p3: Foo' as PokemonIdent);
    expect(p.name).toBe('Foo');
    expect(p.siden).toBe(2);
    expect(p.slot).toBe(-1);
    expect(p.pokemonid).toBe('p3: Foo');
  });

  it('#getSwitchedPokemon', () => {
    // a disguised Zoroark stands at p2b and the Rillaboom it poses as comes in at p2a
    const battle = new Battle(GENS);
    const add = (lines: string[]) => {
      for (const line of lines) battle.add(line);
    };
    const member = (name: string, details: string, hp: string, ability: string) => ({
      ident: `p1: ${name}`, details, condition: `${hp}/${hp}`, active: true, moves: ['protect'],
      stats: {atk: 80, def: 80, spa: 80, spd: 80, spe: 80}, baseAbility: ability, item: '',
    });
    const request = {wait: true, side: {name: 'Alice', id: 'p1', pokemon: [
      member('Slowbro', 'Slowbro, L50, M', '170', 'regenerator'),
      member('Audino', 'Audino, L50, F', '178', 'regenerator'),
    ]}};
    add([
      '|player|p1|Alice|1|', '|player|p2|Bob|2|', '|gametype|doubles', '|gen|9', '|clearpoke',
      '|poke|p1|Slowbro, L50, M|', '|poke|p1|Audino, L50, F|', '|poke|p2|Incineroar, L50, M|',
      '|poke|p2|Zoroark-Hisui, L50, M|', '|poke|p2|Rillaboom, L50, M|', '|teampreview|2',
      '|teamsize|p1|2', '|teamsize|p2|3', '|start',
      '|switch|p1a: Slowbro|Slowbro, L50, M|170/170', '|switch|p1b: Audino|Audino, L50, F|178/178',
      '|switch|p2a: Incineroar|Incineroar, L50, M|100/100',
      '|switch|p2b: Rillaboom|Rillaboom, L50, M|100/100',
      `|request|${JSON.stringify(request)}`, '|turn|1',
    ]);
    // as an open team sheet shows it
    battle.p2.team.find(p => p.speciesForme === 'Zoroark-Hisui')!.rememberAbility('Illusion');
    add([
      '|move|p2a: Incineroar|Parting Shot|p1a: Slowbro', '|-unboost|p1a: Slowbro|atk|1',
      '|switch|p2a: Rillaboom|Rillaboom, L50, M|100/100|[from] Parting Shot',
      '|move|p1a: Slowbro|Scald|p2b: Rillaboom', '|-damage|p2b: Rillaboom|90/100',
      '|replace|p2b: Zoroark|Zoroark-Hisui, L50, M', '|-end|p2b: Zoroark|Illusion',
      '|', '|upkeep', '|turn|2',
      '|move|p1a: Slowbro|Scald|p2a: Rillaboom', '|-damage|p2a: Rillaboom|0 fnt',
      '|faint|p2a: Rillaboom',
      '|move|p1b: Audino|Flamethrower|p2b: Zoroark', '|-damage|p2b: Zoroark|50/100',
    ]);

    const zoroark = battle.p2.active[1]!;
    expect(zoroark.speciesForme).toBe('Zoroark-Hisui');
    expect(zoroark.hp).toBe(50);
    expect(battle.p2.active[0]).toBeNull();
    expect(battle.p2.team.filter(p => p.fainted).map(p => p.speciesForme)).toEqual(['Rillaboom']);
  });
  it('#getSwitchedPokemon (dragged out)', () => {
    const battle = new Battle(GENS);
    for (const line of [
      '|player|p1|Alice|1|', '|player|p2|Bob|2|', '|gametype|doubles', '|gen|9',
      '|switch|p1a: Ting-Lu|Ting-Lu|100/100', '|switch|p1b: Houndstone|Houndstone, F|100/100',
      '|switch|p2a: Slowbro|Slowbro, F|100/100', '|switch|p2b: Gothitelle|Gothitelle, M|100/100',
      '|turn|1',
      '|move|p2b: Gothitelle|Fake Out|p1b: Houndstone', '|-damage|p1b: Houndstone|90/100',
      '|move|p1b: Houndstone|Shadow Ball|p2a: Slowbro', '|-damage|p2a: Slowbro|0 fnt',
      '|faint|p2a: Slowbro',
      '|move|p1a: Ting-Lu|Whirlwind|p2b: Gothitelle', '|drag|p2b: Amoonguss|Amoonguss, F|100/100',
      '|upkeep',
    ]) {
      battle.add(line);
    }
    const gothitelle = battle.p2.team.find(p => p.name === 'Gothitelle')!;

    // dragged out of p2b, it may still come in for the Slowbro that fainted at p2a
    battle.add('|switch|p2a: Gothitelle|Gothitelle, M|100/100');
    expect(battle.p2.team.filter(p => p.name === 'Gothitelle')).toEqual([gothitelle]);
    expect(battle.p2.active[0]).toBe(gothitelle);
    expect(gothitelle.moveSlots.map(m => [m.id, m.ppUsed])).toEqual([['fakeout', 1]]);
  });

  it.todo('#rememberTeamPreviewPokemon');
  it.todo('#findCorrespondingPokemon');

  it('#getSide', () => {
    const battle = new Battle(GENS);
    expect(battle.getSide('p1')).toBe(battle.p1);
    expect(battle.getSide('p2')).toBe(battle.p2);

    expect(battle.getSide('p1: Pikachu')).toBe(battle.p1);
    expect(battle.getSide('p2: Gengar')).toBe(battle.p2);

    battle.p1.setName('Foo' as Username);
    battle.p2.setName('Bar' as Username);

    expect(battle.getSide('Foo')).toBe(battle.p1);
    expect(battle.getSide('bar')).toBe(battle.p2);

    expect(battle.getSide('What The F')).toEqual({name: 'What The F', id: 'WhatTheF'}); // WTF?
  });

  it.todo('#getPokemon');
  it.todo('#checkActive');

  it('#pokemonAt', () => {
    const battle = new Battle(GENS);
    expect(battle.pokemonAt('p1', 0)).toBeUndefined();

    const pokemon = battle.p1.addPokemon({ident: 'p1: Gengar'} as DetailedPokemon);
    battle.p1.active[0] = pokemon;
    expect(battle.pokemonAt('p1', 0)).toBe('p1: Gengar');
    expect(battle.pokemonAt('p1', 2)).toBeUndefined();
  });

  it.todo('#damagePercentage');

  it('#currentWeather', () => {
    const battle = new Battle(GENS);
    battle.field.setWeather('raindance' as ID);
    expect(battle.currentWeather()).toBe('rain');
  });

  it('#reset', () => {
    const battle = new Battle(GENS);
    const field = battle.field;
    field.setWeather('raindance' as ID);
    battle.turn = 10;
    battle.lastMove = 'healing-wish';

    battle.reset();

    expect(battle.turn).toBe(0);
    expect(battle.field.weather).toBeUndefined();
    expect(battle.field.weatherState.id).toBe('');
    expect(battle.lastMove).toBe('');
  });

  it('#update', () => {
    const gen = GENS.get(9);
    // p1's request for its one Pokemon, with the PP each move has used (of 5 for a transformed
    // Pokemon's copies), or only the move it is locked into
    const request = (name: string, ids: string[], used: number[] | string, copies = false) => {
      const move = (id: string) => gen.moves.get(id)!;
      const moves = typeof used === 'string' ? [{move: move(used).name, id: used}]
        : ids.map((id, i) => {
          const maxpp = copies ? 5 : move(id).pp * 8 / 5;
          return {
            move: move(id).name, id, pp: maxpp - used[i], maxpp,
            target: move(id).target, disabled: false,
          };
        });
      return '|request|' + JSON.stringify({
        active: [{moves}],
        side: {name: 'Alice', id: 'p1', pokemon: [{
          ident: `p1: ${name}`, details: `${name}, L50`, condition: '150/150', active: true,
          stats: {atk: 100, def: 100, spa: 100, spd: 100, spe: 100}, moves: ids,
          baseAbility: 'innerfocus', item: '', pokeball: 'pokeball', ability: 'innerfocus',
        }]},
        rqid: 1,
      });
    };
    const start = (battle: Battle, p1: string, p2: string) => {
      for (const line of [
        '|player|p1|Alice|1|', '|player|p2|Bob|2|', '|gametype|singles', '|gen|9',
        `|switch|p1a: ${p1}|${p1}, L50|150/150`, `|switch|p2a: ${p2}|${p2}, L50|100/100`,
        '|turn|1',
      ]) battle.add(line);
    };
    const pp = (poke: Pokemon) =>
      poke.moveSlots.map(m => `${m.id}:${JSON.stringify(m.ppUsed)}${m.virtual ? 'v' : ''}`);

    const moves = ['outrage', 'extremespeed', 'earthquake', 'roost'];
    const battle = new Battle(GENS);
    start(battle, 'Dragonite', 'Snorlax');
    battle.add(request('Dragonite', moves, [0, 0, 1, 0]));
    const dnite = battle.p1.active[0]!;
    expect(pp(dnite)).toEqual(['outrage:0', 'extremespeed:0', 'earthquake:1', 'roost:0']);
    // a move after the request takes its PP from the request's slot
    battle.add('|move|p1a: Dragonite|Outrage|p2a: Snorlax');
    expect(pp(dnite)).toEqual(['outrage:1', 'extremespeed:0', 'earthquake:1', 'roost:0']);
    // a request locked into a move doesn't say what the others have left
    battle.add('|turn|2');
    battle.add(request('Dragonite', moves, 'outrage'));
    expect(pp(dnite)).toEqual(['outrage:1', 'extremespeed:0', 'earthquake:1', 'roost:0']);
    // nor does the null request the sim sends once the battle is over
    battle.add('|request|null');
    expect(pp(dnite)).toEqual(['outrage:1', 'extremespeed:0', 'earthquake:1', 'roost:0']);

    // a transformed Pokemon's request lists its own copies of its target's moves
    const imposter = new Battle(GENS);
    start(imposter, 'Ditto', 'Dragonite');
    imposter.add('|move|p2a: Dragonite|Outrage|p1a: Ditto');
    imposter.add('|-transform|p1a: Ditto|p2a: Dragonite|[from] ability: Imposter');
    imposter.add(request('Ditto', moves, [1, 0, 0, 0], true));
    const ditto = imposter.p1.active[0]!;
    const target = imposter.p2.active[0]!;
    // which shows the target's moves, but not the PP the target used
    expect(pp(target)).toEqual(['outrage:1', 'extremespeed:0', 'earthquake:0', 'roost:0']);
    expect(pp(ditto)).toEqual(['outrage:1v', 'extremespeed:0v', 'earthquake:0v', 'roost:0v']);

    // before Gen 6 a request names Hidden Power and Return with their type and power, and before
    // Gen 7 it names only the base ability
    const old = new Battle(GENS);
    for (const line of [
      '|player|p1|Alice|1|', '|player|p2|Bob|2|', '|gametype|singles', '|gen|3',
      '|switch|p1a: Gardevoir|Gardevoir, L50, F|150/150',
      '|switch|p2a: Persian|Persian, L50, M|100/100',
      '|-ability|p1a: Gardevoir|Limber|[from] ability: Trace|[of] p2a: Persian', '|turn|1',
    ]) old.add(line);
    const slot = (move: string, id: string, maxpp: number) =>
      ({move, id, pp: maxpp, maxpp, target: 'normal', disabled: false});
    old.add('|request|' + JSON.stringify({
      active: [{moves: [
        slot('Return 102', 'return', 32), slot('Hidden Power Fire 70', 'hiddenpower', 24),
        slot('Psychic', 'psychic', 16), slot('Calm Mind', 'calmmind', 32),
      ]}],
      side: {name: 'Alice', id: 'p1', pokemon: [{
        ident: 'p1: Gardevoir', details: 'Gardevoir, L50, F', condition: '150/150', active: true,
        stats: {atk: 100, def: 100, spa: 100, spd: 100, spe: 100},
        moves: ['return102', 'hiddenpowerfire', 'psychic', 'calmmind'],
        baseAbility: 'trace', item: '', pokeball: 'pokeball',
      }]},
      rqid: 1,
    }));
    old.add('|move|p1a: Gardevoir|Return|p2a: Persian');
    const gardevoir = old.p1.active[0]!;
    expect(pp(gardevoir)).toEqual(['return:1', 'hiddenpower:0', 'psychic:0', 'calmmind:0']);
    expect(gardevoir.moveSlots.map(m => m.name))
      .toEqual(['Return', 'Hidden Power', 'Psychic', 'Calm Mind']);
    expect(gardevoir.ability).toBe('limber');
    expect(gardevoir.baseAbility).toBe('trace');
  });

  it('#clone', () => {
    const battle = new Battle(GENS);
    for (const line of [
      '|player|p1|Alice|1|', '|player|p2|Bob|2|', '|gametype|singles', '|gen|9',
      '|switch|p1a: Gengar|Gengar, L50, M|100/100', '|switch|p2a: Mew|Mew, L50|100/100',
      '|turn|1', '|move|p1a: Gengar|Shadow Ball|p2a: Mew', '|-damage|p2a: Mew|50/100',
    ]) {
      battle.add(line);
    }

    const memo = new Map<object, object>();
    const clone = battle.clone(memo);
    const mew = battle.p2.active[0]!;
    const copy = clone.p2.active[0]!;

    expect(clone).not.toBe(battle);
    expect(memo.get(battle)).toBe(clone);
    expect(memo.get(mew)).toBe(copy);
    expect(memo.get(mew.volatiles)).toBe(copy.volatiles);
    expect(copy).not.toBe(mew);
    expect(copy.side).toBe(clone.p2);
    expect(clone.p2.battle).toBe(clone);
    expect(clone.p1.foe).toBe(clone.p2);
    expect(clone.p2.team[0]).toBe(copy);
    expect(clone.gen).toBe(battle.gen);
    expect(battle.clone(memo)).toBe(clone);

    clone.add('|-damage|p2a: Mew|25/100');
    expect(copy.hp).toBe(25);
    expect(mew.hp).toBe(50);
    expect(clone.turn).toBe(1);

    // a multi battle's partners share their active arrays, and a clone keeps them shared
    const multi = new Battle(GENS);
    multi.add('|gametype|multi');
    const multiClone = multi.clone();
    expect(multiClone.p1.active).toBe(multiClone.p3!.active);
    expect(multiClone.p3!.active).not.toBe(multi.p3!.active);
    expect(multiClone.p3!.battle).toBe(multiClone);

    // sides a clone adds belong to it
    const fresh = new Battle(GENS);
    const freshClone = fresh.clone();
    freshClone.add('|gametype|freeforall');
    expect(freshClone.p3!.battle).toBe(freshClone);
    expect(fresh.p3).toBeUndefined();
  });

  it('#destroy', () => {
    const battle = new Battle(GENS);

    const field = battle.field;
    const p1 = battle.p1;
    const p2 = battle.p2;

    battle.destroy();

    expect(field.battle).toBeNull();
    expect(battle.field).toBeNull();
    expect(p1.battle).toBeNull();
    expect(p2.battle).toBeNull();
    expect(battle.sides).toEqual([null, null]);
    expect(battle.p1).toBeNull();
    expect(battle.p2).toBeNull();
  });
});
