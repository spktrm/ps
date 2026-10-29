import {Generations} from '@pkmn/data';
import {Dex, Effect, ID} from '@pkmn/dex';
import {DetailedPokemon, Protocol} from '@pkmn/protocol';

import {Battle, Pokemon, Side} from '../index';

// NOTE: tested exhaustively in integration/src/test/client.js
describe('Side', () => {
  it('#setName', () => {
    const side = new Side({} as Battle, 0);
    side.setName('Foo' as Protocol.Username, '13' as Protocol.AvatarIdent);
    expect(side.name).toBe('Foo');
    expect(side.id).toBe('foo');
    expect(side.avatar).toBe('13');
  });

  it('#sideConditions', () => {
    const side = new Side({gen: {num: 8}} as Battle, 0);

    side.addSideCondition({id: 'spikes', name: 'Spikes'} as unknown as Effect, false);
    expect(side.sideConditions['spikes'])
      .toEqual({name: 'Spikes', level: 1, minDuration: 0, maxDuration: 0});
    side.addSideCondition({id: 'spikes', name: 'Spikes'} as unknown as Effect, false);
    expect(side.sideConditions['spikes'])
      .toEqual({name: 'Spikes', level: 2, minDuration: 0, maxDuration: 0});

    side.addSideCondition({id: 'tailwind', name: 'Tailwind'} as unknown as Effect, false);
    expect(side.sideConditions['tailwind'])
      .toEqual({name: 'Tailwind', level: 1, minDuration: 4, maxDuration: 0});

    side.addSideCondition({id: 'lightscreen', name: 'Light Screen'} as unknown as Effect, false);
    expect(side.sideConditions['lightscreen'])
      .toEqual({name: 'Light Screen', level: 1, minDuration: 5, maxDuration: 8});

    side.removeSideCondition('tailwind' as ID);
    expect(side.sideConditions['tailwind']).toBeUndefined();
  });

  it('#addPokemon', () => {
    const battle = new Battle(new Generations(Dex));
    battle.add('|gen|9');
    const side = battle.p2;
    side.totalPokemon = 3;
    const add = (name: string) => side.addPokemon({
      ident: `p2: ${name}`, name, speciesForme: name, details: name,
      searchid: `p2: ${name}|${name}`,
    } as DetailedPokemon);
    add('Snorlax');
    const zoroark = add('Zoroark-Hisui');
    const kyurem = add('Kyurem');
    kyurem.fainted = true;

    // a second Kyurem means the fainted one was the Illusion user, even unrevealed
    add('Kyurem');
    expect(side.team).toHaveLength(3);
    expect(zoroark.fainted).toBe(true);
    expect(side.team.find(p => p.name === 'Snorlax')!.fainted).toBe(false);

    const play = (lines: string[]) => {
      const b = new Battle(new Generations(Dex));
      for (const line of ['|player|p1|Alice|1|', '|player|p2|Bob|2|', '|gen|9', ...lines]) {
        b.add(line);
      }
      return b;
    };
    const moves = (b: Battle, name: string) => Object.fromEntries(b.p1.team
      .filter(p => p.name === name).flatMap(p => p.moveSlots.map(m => [m.id, m.ppUsed])));

    // a Solrock that faints and then comes in again was Zoroark in the stint it fainted in
    let b = play([
      '|teamsize|p1|3', '|clearpoke', '|poke|p1|Solrock|', '|poke|p1|Ariados, M|',
      '|poke|p1|Zoroark, M|',
      '|poke|p2|Blissey, F|', '|teampreview',
      '|switch|p1a: Solrock|Solrock|100/100', '|switch|p2a: Blissey|Blissey, F|100/100',
      '|turn|1', '|move|p1a: Solrock|Stone Edge|p2a: Blissey',
      '|switch|p1a: Ariados|Ariados, M|100/100', '|turn|2',
      '|switch|p1a: Solrock|Solrock|24/100 tox', '|turn|3',
      '|move|p1a: Solrock|Sludge Bomb|p2a: Blissey',
      '|-damage|p1a: Solrock|0 fnt|[from] psn', '|faint|p1a: Solrock', '|upkeep',
      '|switch|p1a: Solrock|Solrock|100/100',
    ]);
    expect(b.p1.team.filter(p => p.name === 'Solrock')).toHaveLength(1);
    expect(moves(b, 'Solrock')).toEqual({stoneedge: 1});
    expect(moves(b, 'Zoroark')).toEqual({sludgebomb: 1});
    expect(b.p1.team.find(p => p.name === 'Zoroark')!.fainted).toBe(true);

    // one switched out for itself could have been either, so it keeps all it showed
    b = play([
      '|teamsize|p1|2', '|switch|p1a: Xurkitree|Xurkitree|64/100 tox',
      '|switch|p2a: Blissey|Blissey, F|100/100',
      '|turn|1', '|move|p1a: Xurkitree|Thunderbolt|p2a: Blissey',
      '|switch|p1a: Parasect|Parasect, F|100/100', '|turn|2',
      '|switch|p1a: Xurkitree|Xurkitree|100/100', '|turn|3',
      '|switch|p1a: Xurkitree|Xurkitree|64/100 tox',
    ]);
    expect(b.p1.team.filter(p => p.name === 'Xurkitree')).toHaveLength(1);
    expect(moves(b, 'Xurkitree')).toEqual({thunderbolt: 1});
  });

  it('#switchIn', () => {
    const side = new Side({gen: {num: 8}} as Battle, 0);
    let pokemon = side.addPokemon({} as DetailedPokemon);
    pokemon.slot = 2;
    pokemon.lastMove = 'tackle' as ID;
    pokemon.addVolatile('foo' as ID, {level: 1});

    side.switchIn(pokemon);

    expect(side.active[2]).toBe(pokemon);
    expect(pokemon.lastMove).toBe('');
    expect(side.battle.lastMove).toBe('switch-in');
    expect(pokemon.hasVolatile('foo' as ID)).toBe(false);

    side.lastPokemon = pokemon;
    pokemon.lastMove = 'batonpass' as ID;
    pokemon.addVolatile('bar' as ID, {level: 1});

    pokemon = side.addPokemon({} as DetailedPokemon);
    side.switchIn(pokemon, {id: 'batonpass' as ID}, 2);

    expect(side.active[2]).toBe(pokemon);
    expect(pokemon.lastMove).toBe('');
    expect(side.battle.lastMove).toBe('switch-in');
    expect(pokemon.hasVolatile('bar' as ID)).toBe(true);
  });

  it('#dragIn', () => {
    const side = new Side({gen: {num: 8}} as Battle, 0);
    const poke1 = side.addPokemon({} as DetailedPokemon);
    const poke2 = side.addPokemon({} as DetailedPokemon);

    expect(poke1.slot).toBe(0);
    expect(side.active[0]).toBeNull();

    poke1.statusStage = 1;
    side.dragIn(poke1);

    expect(poke1.slot).toBe(0);
    expect(poke1.statusStage).toBe(0);
    expect(side.active[0]).toBe(poke1);
    expect(side.lastPokemon).toBeNull();
    expect(side.battle.lastMove).toBe('switch-in');

    poke1.statusStage = 1;
    side.dragIn(poke1);

    expect(poke1.slot).toBe(0);
    expect(poke1.statusStage).toBe(1);
    expect(side.active[0]).toBe(poke1);
    expect(side.lastPokemon).toBeNull();
    expect(side.battle.lastMove).toBe('switch-in');

    poke1.statusStage = 1;
    poke2.statusStage = 2;
    side.dragIn(poke2);

    expect(poke1.slot).toBe(0);
    expect(poke1.statusStage).toBe(0);
    expect(poke2.slot).toBe(0);
    expect(poke2.statusStage).toBe(0);
    expect(side.active[0]).toBe(poke2);
    expect(side.lastPokemon).toBe(poke1);
    expect(side.battle.lastMove).toBe('switch-in');

    poke1.statusStage = 1;
    poke2.statusStage = 2;
    side.dragIn(poke1, 2);

    expect(poke1.slot).toBe(2);
    expect(poke1.statusStage).toBe(0);
    expect(poke2.slot).toBe(0);
    expect(poke2.statusStage).toBe(2);
    expect(side.active[0]).toBe(poke2);
    expect(side.active[1]).toBeUndefined();
    expect(side.active[2]).toBe(poke1);
    expect(side.lastPokemon).toBeUndefined();
    expect(side.battle.lastMove).toBe('switch-in');
  });

  it('#replace', () => {
    const battle = new Battle(new Generations(Dex));
    for (const line of [
      '|player|p1|Alice|1|', '|player|p2|Bob|2|', '|gen|9',
      '|switch|p1a: Linoone|Linoone, M|100/100', '|switch|p2a: Unfezant|Unfezant, M|100/100',
      '|turn|1', '|move|p1a: Linoone|Protect|p1a: Linoone',
      '|switch|p1a: Musharna|Musharna, M|100/100', '|turn|2',
      '|switch|p1a: Linoone|Linoone, M|100/100', '|turn|3',
      '|move|p1a: Linoone|Nasty Plot|p1a: Linoone', '|-boost|p1a: Linoone|spa|2',
      '|turn|4', '|move|p1a: Linoone|Protect|p1a: Linoone',
      '|turn|5', '|move|p1a: Linoone|Dark Pulse|p2a: Unfezant',
      '|-damage|p1a: Linoone|90/100|[from] item: Life Orb',
      '|move|p2a: Unfezant|Return|p1a: Linoone', '|-damage|p1a: Linoone|30/100',
      '|replace|p1a: Zoroark|Zoroark, M', '|-end|p1a: Zoroark|Illusion',
    ]) {
      battle.add(line);
    }
    const linoone = battle.p1.team.find(p => p.name === 'Linoone')!;
    const zoroark = battle.p1.active[0]!;
    expect(zoroark.name).toBe('Zoroark');

    // what came out while it posed as Linoone was the Illusion user's
    const moves = (p: Pokemon) => Object.fromEntries(p.moveSlots.map(m => [m.id, m.ppUsed]));
    expect(moves(linoone)).toEqual({protect: 1});
    expect(moves(zoroark)).toEqual({nastyplot: 1, protect: 1, darkpulse: 1});
    expect(linoone.item).toBe('');
    expect(zoroark.item).toBe('lifeorb');
  });
  it.todo('#switchOut');

  it('#swapTo', () => {
    const side = new Side({gen: {num: 8}} as Battle, 0);
    const poke1 = side.addPokemon({} as DetailedPokemon);
    const poke2 = side.addPokemon({} as DetailedPokemon);

    poke1.slot = 0;
    poke2.slot = 1;
    side.active[0] = poke1;
    side.active[1] = poke2;

    expect(poke1.slot).toBe(0);
    expect(poke2.slot).toBe(1);
    expect(side.active[0]).toBe(poke1);
    expect(side.active[1]).toBe(poke2);

    side.swapTo(poke1, 0);

    expect(poke1.slot).toBe(0);
    expect(poke2.slot).toBe(1);
    expect(side.active[0]).toBe(poke1);
    expect(side.active[1]).toBe(poke2);

    side.swapTo(poke1, 1);

    expect(poke1.slot).toBe(1);
    expect(poke2.slot).toBe(0);
    expect(side.active[0]).toBe(poke2);
    expect(side.active[1]).toBe(poke1);

    side.swapTo(poke1, 2);

    expect(poke1.slot).toBe(2);
    expect(poke2.slot).toBe(0);
    expect(side.active[0]).toBe(poke2);
    expect(side.active[1]).toBeUndefined();
    expect(side.active[2]).toBe(poke1);
  });

  it('#swapWith', () => {
    const side = new Side({gen: {num: 8}} as Battle, 0);
    const poke1 = side.addPokemon({} as DetailedPokemon);
    const poke2 = side.addPokemon({} as DetailedPokemon);

    poke1.slot = 0;
    poke2.slot = 1;
    side.active[0] = poke1;
    side.active[1] = poke2;

    expect(poke1.slot).toBe(0);
    expect(poke2.slot).toBe(1);
    expect(side.active[0]).toBe(poke1);
    expect(side.active[1]).toBe(poke2);

    side.swapWith(poke1, poke1);

    expect(poke1.slot).toBe(0);
    expect(poke2.slot).toBe(1);
    expect(side.active[0]).toBe(poke1);
    expect(side.active[1]).toBe(poke2);

    side.swapWith(poke1, poke2);

    expect(poke1.slot).toBe(1);
    expect(poke2.slot).toBe(0);
    expect(side.active[0]).toBe(poke2);
    expect(side.active[1]).toBe(poke1);
  });

  it('#faint', () => {
    const side = new Side({gen: {num: 8}} as Battle, 0);
    const pokemon = side.addPokemon({details: '', searchid: ''} as DetailedPokemon);

    pokemon.addVolatile('baz' as ID);
    pokemon.hp = 100;
    side.active[0] = pokemon;

    side.faint(pokemon);

    expect(pokemon.hasVolatile('baz' as ID)).toBe(false);
    expect(side.lastPokemon).toBe(pokemon);
    expect(side.active).toEqual([null]);
    expect(pokemon.fainted).toBe(true);
    expect(pokemon.hp).toBe(0);
  });

  it('#reset', () => {
    const side = new Side({gen: {num: 8}} as Battle, 0);
    const pokemon = side.addPokemon({} as DetailedPokemon);

    expect(pokemon.side).toBe(side);
    side.active[0] = pokemon;
    side.lastPokemon = pokemon;
    side.addSideCondition({id: 'tailwind', name: 'Tail Wind'} as Effect, false);

    side.reset();

    expect(pokemon.side).toBeNull();
    expect(side.lastPokemon).toBeNull();
    expect(side.active).toEqual([null]);
    expect(side.team).toEqual([]);
    expect(side.sideConditions['tailwind']).toBeUndefined();
  });

  it('#destroy', () => {
    const side = new Side({gen: {num: 8}} as Battle, 0);
    const foe = new Side({gen: {num: 8}} as Battle, 1);
    const pokemon = side.addPokemon({} as DetailedPokemon);

    expect(pokemon.side).toBe(side);
    side.active[0] = pokemon;
    side.lastPokemon = pokemon;
    side.foe = foe;
    side.addSideCondition({id: 'stealthrock', name: 'Stealth Rock'} as Effect, false);

    side.destroy();

    expect(pokemon.side).toBeNull();
    expect(side.lastPokemon).toBeNull();
    expect(side.active).toEqual([null]);
    expect(side.team).toEqual([]);
    expect(side.sideConditions['stealthrock'])
      .toEqual({name: 'Stealth Rock', level: 1, minDuration: 0, maxDuration: 0}); // WTF?
    expect(side.battle).toBeNull();
    expect(side.foe).toBeNull();
  });
});
