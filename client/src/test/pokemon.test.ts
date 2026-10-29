import {Generations, ID, SpeciesName} from '@pkmn/data';
import {Dex} from '@pkmn/dex';
import {
  DetailedPokemon,
  PokemonDetails,
  PokemonHealth,
  PokemonIdent,
  PokemonSearchID,
  Protocol,
} from '@pkmn/protocol';

import {Battle} from '../battle';
import {Pokemon, Side} from '../index';

const gens = new Generations(Dex);
const gen = gens.get(7);

// NOTE: tested exhaustively in integration/src/test/client.js
describe('Pokemon', () => {
  it('#ident', () => {
    const pokemon = new Pokemon(null!, {ident: 'p1: Gengar'} as DetailedPokemon);
    expect(pokemon.ident).toBe('p1a: Gengar');
    pokemon.slot = 2;
    expect(pokemon.ident).toBe('p1c: Gengar');
  });

  it('#healthParse', () => {
    const parse = (
      hpstring: string,
      options = {} as Partial<PokemonHealth>
    ) => {
      const pokemon = new Pokemon(null!, {} as DetailedPokemon);
      const attrs: Array<keyof PokemonHealth> = ['hp', 'maxhp', 'hpcolor', 'status', 'fainted'];
      for (const attr of attrs) {
        if (options[attr]) (pokemon as any)[attr] = options[attr];
      }
      const result = pokemon.healthParse(hpstring);
      return {pokemon, result};
    };

    const health = (p: Partial<PokemonHealth> = {}) => {
      const ret: PokemonHealth = {
        hp: p.hp || 0,
        maxhp: p.maxhp || 0,
        hpcolor: p.hpcolor || 'g',
        status: p.status,
        fainted: !!p.fainted,
      };
      return ret;
    };
    expect(parse(null!).result).toBeNull();
    expect(parse('').result).toBeNull();

    let p = parse('0 fnt');
    expect(health(p.pokemon)).toEqual(health({hp: 0, maxhp: 100, fainted: true}));
    expect(p.result).toEqual([-100, 100, 100, 'g']);

    p = parse('0 fnt', health({fainted: true}));
    expect(health(p.pokemon)).toEqual(health({hp: 0, maxhp: 100, fainted: true}));
    expect(p.result).toEqual([-100, 100, 100, 'g']);

    p = parse('0 fnt', health({maxhp: 250}));
    expect(health(p.pokemon)).toEqual(health({hp: 0, maxhp: 250, fainted: true}));
    expect(p.result).toEqual([-1, 250, 1, 'g']);

    p = parse('0 fnt', health({hp: 200, maxhp: 250}));
    expect(health(p.pokemon)).toEqual(health({hp: 0, maxhp: 250, fainted: true}));
    expect(p.result).toEqual([-200, 250, 200, 'g']);

    p = parse('10/48y fnt');
    expect(health(p.pokemon)).toEqual(health({hp: 0, maxhp: 48, hpcolor: 'y', fainted: true}));
    expect(p.result).toEqual([-48, 48, 48, 'g']);

    p = parse('10/48y fnt', health({hp: 20, maxhp: 48, hpcolor: 'y'}));
    expect(health(p.pokemon)).toEqual(health({hp: 0, maxhp: 48, hpcolor: 'y', fainted: true}));
    expect(p.result).toEqual([-20, 48, 20, 'y']);

    p = parse('foo/bar');
    expect(health(p.pokemon)).toEqual(health());
    expect(p.result).toEqual([0, 0, 0, 'g']);

    p = parse('350/300 psn');
    expect(health(p.pokemon)).toEqual(health({hp: 300, maxhp: 300, status: 'psn'}));
    expect(p.result).toEqual([0, 300, 300, 'g']);
  });

  it('#checkDetails', () => {
    const detailed =
      Protocol.parseDetails('', 'p1: Arceus' as PokemonIdent, 'Arceus-*, L50' as PokemonDetails);
    const pokemon = new Pokemon(null!, detailed);

    expect(pokemon.checkDetails()).toBe(false);
    expect(pokemon.checkDetails('Arceus-*, L50' as PokemonDetails)).toBe(true);

    pokemon.searchid = 'p1: Arceus|Arceus-*, L50' as PokemonSearchID;
    expect(pokemon.checkDetails('Arceus-*, L50, shiny' as PokemonDetails)).toBe(false);

    pokemon.searchid = '' as PokemonSearchID;
    expect(pokemon.checkDetails('Arceus-*, L50, shiny' as PokemonDetails)).toBe(true);
    expect(pokemon.checkDetails('Arceus-Grass, L50, shiny' as PokemonDetails)).toBe(true);
    expect(pokemon.checkDetails('Arceus-Grass, L60, shiny' as PokemonDetails)).toBe(false);
  });

  it('#volatiles', () => {
    const pokemon = new Pokemon({battle: {gen: {num: 8}}} as Side, {} as DetailedPokemon);

    pokemon.addVolatile('foo' as ID, {duration: 'turn'});
    pokemon.addVolatile('bar' as ID, {duration: 'move'});
    pokemon.addVolatile('baz' as ID);
    pokemon.addVolatile('qux' as ID, {level: 2});

    expect(pokemon.hasVolatile('foo' as ID)).toBe(true);
    expect(pokemon.hasVolatile('bar' as ID)).toBe(true);
    expect(pokemon.hasVolatile('baz' as ID)).toBe(true);
    expect(pokemon.hasVolatile('qux' as ID)).toBe(true);

    pokemon.clearTurnstatuses();

    expect(pokemon.hasVolatile('foo' as ID)).toBe(false);
    expect(pokemon.hasVolatile('bar' as ID)).toBe(true);
    expect(pokemon.hasVolatile('baz' as ID)).toBe(true);
    expect(pokemon.hasVolatile('qux' as ID)).toBe(true);

    pokemon.addVolatile('foo' as ID, {duration: 'turn'});
    pokemon.clearMovestatuses();

    expect(pokemon.hasVolatile('foo' as ID)).toBe(true);
    expect(pokemon.hasVolatile('bar' as ID)).toBe(false);
    expect(pokemon.hasVolatile('baz' as ID)).toBe(true);
    expect(pokemon.hasVolatile('qux' as ID)).toBe(true);

    pokemon.addVolatile('bar' as ID, {duration: 'move'});
    pokemon.removeVolatile('baz' as ID);
    expect(pokemon.hasVolatile('baz' as ID)).toBe(false);
    expect(pokemon.hasVolatile('qux' as ID)).toBe(true);

    pokemon.ability = 'ability' as ID;
    pokemon.baseAbility = 'baseability' as ID;
    pokemon.statusStage = 2;
    pokemon.statusState.toxicTurns = 3;
    pokemon.statusState.sleepTurns = 4;

    pokemon.clearVolatile();

    expect(pokemon.hasVolatile('foo' as ID)).toBe(false);
    expect(pokemon.hasVolatile('bar' as ID)).toBe(false);
    expect(pokemon.hasVolatile('qux' as ID)).toBe(false);

    expect(pokemon.ability).toBe('baseability');
    expect(pokemon.statusStage).toBe(0);
    expect(pokemon.statusState.toxicTurns).toBe(0);
    expect(pokemon.statusState.sleepTurns).toBe(4);
  });

  it('#rememberMove', () => {
    const play = (num: number, lines: string[]) => {
      const battle = new Battle(gens);
      for (const line of [
        '|player|p1|Alice|1|', '|player|p2|Bob|2|', `|gen|${num}`,
        '|switch|p2a: Blissey|Blissey, F|100/100', ...lines,
      ]) {
        battle.add(line);
      }
      return battle;
    };
    const moves = (battle: Battle) =>
      Object.fromEntries(battle.p1.active[0]!.moveSlots.map(m => [m.id, m.ppUsed]));

    // a Z-Move's PP stays on it until a full moveset shows which move it came from
    let battle = play(7, [
      '|switch|p1a: Celebi|Celebi|100/100', '|turn|1',
      '|-zpower|p1a: Celebi', '|move|p1a: Celebi|Bloom Doom|p2a: Blissey|[zeffect]',
      '|move|p1a: Celebi|Psychic|p2a: Blissey', '|move|p1a: Celebi|Recover|p1a: Celebi',
      '|move|p1a: Celebi|Nasty Plot|p1a: Celebi',
    ]);
    expect(moves(battle)).toEqual({bloomdoom: 1, psychic: 1, recover: 1, nastyplot: 1});
    battle.add('|move|p1a: Celebi|Leaf Storm|p2a: Blissey');
    expect(moves(battle)).toEqual({psychic: 1, recover: 1, nastyplot: 1, leafstorm: 2});
    // with two Grass moves either could have been it
    battle = play(7, [
      '|switch|p1a: Celebi|Celebi|100/100', '|turn|1',
      '|-zpower|p1a: Celebi', '|move|p1a: Celebi|Bloom Doom|p2a: Blissey|[zeffect]',
      '|move|p1a: Celebi|Giga Drain|p2a: Blissey', '|move|p1a: Celebi|Recover|p1a: Celebi',
      '|move|p1a: Celebi|Nasty Plot|p1a: Celebi', '|move|p1a: Celebi|Leaf Storm|p2a: Blissey',
    ]);
    expect(moves(battle)).toEqual({gigadrain: [2, 1], recover: 1, nastyplot: 1, leafstorm: [2, 1]});

    // the request says which moves become which Z-Move
    battle = play(7, ['|switch|p1a: Celebi|Celebi, L50|176/176']);
    battle.update(Protocol.parseRequest(JSON.stringify({
      active: [{
        moves: [
          {move: 'Leaf Storm', id: 'leafstorm', pp: 8, maxpp: 8, target: 'normal', disabled: false},
          {move: 'Psychic', id: 'psychic', pp: 16, maxpp: 16, target: 'normal', disabled: false},
          {move: 'Recover', id: 'recover', pp: 16, maxpp: 16, target: 'self', disabled: false},
        ],
        canZMove: [{move: 'Bloom Doom', target: 'normal'}, null, null],
      }],
      side: {name: 'Alice', id: 'p1', pokemon: [{
        ident: 'p1: Celebi', details: 'Celebi, L50', condition: '176/176', active: true,
        stats: {atk: 120, def: 120, spa: 120, spd: 120, spe: 120},
        moves: ['leafstorm', 'psychic', 'recover'], baseAbility: 'naturalcure',
        item: 'grassiumz', pokeball: 'pokeball', ability: 'naturalcure',
      }]},
    }) as Protocol.RequestJSON));
    battle.add('|-zpower|p1a: Celebi');
    battle.add('|move|p1a: Celebi|Bloom Doom|p2a: Blissey|[zeffect]');
    expect(moves(battle)).toEqual({leafstorm: 1, psychic: 0, recover: 0});

    // Max Guard comes from any status move, Pixilate makes Hyper Voice Max Starfall,
    // and G-Max moves count though @pkmn/data leaves them out
    battle = play(8, [
      '|switch|p1a: Sylveon|Sylveon, F|100/100', '|turn|1',
      '|-start|p1a: Sylveon|Dynamax|', '|move|p1a: Sylveon|Max Guard|p1a: Sylveon',
      '|move|p1a: Sylveon|Max Starfall|p2a: Blissey', '|-end|p1a: Sylveon|Dynamax',
      '|move|p1a: Sylveon|Wish|p1a: Sylveon', '|move|p1a: Sylveon|Protect|p1a: Sylveon',
      '|move|p1a: Sylveon|Hyper Voice|p2a: Blissey',
    ]);
    expect(moves(battle)).toEqual({
      maxguard: 1, maxstarfall: 1, wish: 1, protect: 1, hypervoice: 1,
    });
    battle.add('|move|p1a: Sylveon|Mystical Fire|p2a: Blissey');
    expect(moves(battle)).toEqual({
      wish: [2, 1], protect: [2, 1], hypervoice: 2, mysticalfire: 1,
    });
    battle = play(8, [
      '|switch|p1a: Alcremie|Alcremie, F|100/100', '|turn|1',
      '|-start|p1a: Alcremie|Dynamax|Gmax', '|move|p1a: Alcremie|G-Max Finale|p2a: Blissey',
      '|-end|p1a: Alcremie|Dynamax', '|move|p1a: Alcremie|Dazzling Gleam|p2a: Blissey',
      '|move|p1a: Alcremie|Mystical Fire|p2a: Blissey', '|move|p1a: Alcremie|Recover|p1a: Alcremie',
      '|move|p1a: Alcremie|Calm Mind|p1a: Alcremie',
    ]);
    expect(moves(battle)).toEqual({dazzlinggleam: 2, mysticalfire: 1, recover: 1, calmmind: 1});
  });
  it('#useMove', () => {
    const play = (num: number, lines: string[]) => {
      const battle = new Battle(gens);
      for (const line of ['|player|p1|Alice|1|', '|player|p2|Bob|2|', `|gen|${num}`, ...lines]) {
        battle.add(line);
      }
      return battle;
    };
    const pp = (battle: Battle, name: string, move: string, side: 'p1' | 'p2' = 'p1') =>
      battle[side].team.find(p => p.name === name)!.moveSlots.find(m => m.id === move)?.ppUsed;

    // the PP each move took in the sim, from these same lines
    let battle = play(9, [
      '|switch|p1a: Mew|Mew, L50|176/176', '|switch|p2a: Kyurem|Kyurem, L50|201/201',
      '|-ability|p2a: Kyurem|Pressure', '|turn|1',
      '|move|p1a: Mew|Tackle|p2a: Kyurem',
      '|move|p1a: Mew|Swords Dance|p1a: Mew',
      '|move|p1a: Mew|Stealth Rock|p2a: Kyurem',
      '|move|p1a: Mew|Sticky Web|p2a: Kyurem',
      '|move|p1a: Mew|Haze|p1a: Mew',
      '|move|p1a: Mew|Sucker Punch||[still]', '|-fail|p1a: Mew',
    ]);
    expect(pp(battle, 'Mew', 'tackle')).toBe(2);
    expect(pp(battle, 'Mew', 'swordsdance')).toBe(1);
    expect(pp(battle, 'Mew', 'stealthrock')).toBe(2);
    expect(pp(battle, 'Mew', 'stickyweb')).toBe(1);
    expect(pp(battle, 'Mew', 'haze')).toBe(2);
    expect(pp(battle, 'Mew', 'suckerpunch')).toBe(2);

    battle = play(9, [
      '|switch|p1a: Mew|Mew, L50|176/176', '|switch|p2a: Snorlax|Snorlax, L50, F|236/236',
      '|turn|1', '|move|p1a: Mew|Tackle|p2a: Snorlax',
      '|switch|p2a: Kyurem|Kyurem, L50|201/201', '|-ability|p2a: Kyurem|Pressure',
      '|move|p1a: Mew|Gastro Acid|p2a: Kyurem', '|-endability|p2a: Kyurem',
      '|move|p1a: Mew|Tackle|p2a: Kyurem',
    ]);
    expect(pp(battle, 'Mew', 'tackle')).toBe(2);
    expect(pp(battle, 'Mew', 'gastroacid')).toBe(2);

    // spread moves check every foe beside the user, and the user's ally is spared
    const doubles = [
      '|gametype|doubles',
      '|switch|p1a: Smeargle|Smeargle, L50, M|131/131',
      '|switch|p1b: Articuno|Articuno, L50|166/166',
      '|switch|p2a: Kyurem|Kyurem, L50|201/201', '|switch|p2b: Zapdos|Zapdos, L50|166/166',
      '|-ability|p2b: Zapdos|Pressure', '|-ability|p2a: Kyurem|Pressure',
      '|-ability|p1b: Articuno|Pressure', '|turn|1',
      '|move|p1a: Smeargle|Earthquake|p2a: Kyurem|[spread] p2a',
      '|move|p1a: Smeargle|Rock Slide|p2b: Zapdos|[spread] p2a,p2b',
      '|move|p1a: Smeargle|Tackle|p1b: Articuno',
      '|move|p1a: Smeargle|Dragon Darts|p2a: Kyurem',
    ];
    battle = play(9, doubles);
    expect(pp(battle, 'Smeargle', 'earthquake')).toBe(3);
    expect(pp(battle, 'Smeargle', 'rockslide')).toBe(3);
    expect(pp(battle, 'Smeargle', 'tackle')).toBe(1);
    expect(pp(battle, 'Smeargle', 'dragondarts')).toBe(3);
    // before Gen 5 only the user is spared, but Rock Slide never aims at the ally
    battle = play(4, [
      '|gametype|doubles',
      '|switch|p1a: Smeargle|Smeargle, L50, M|131/131',
      '|switch|p1b: Articuno|Articuno, L50|166/166',
      '|switch|p2a: Snorlax|Snorlax, L50, F|236/236',
      '|switch|p2b: Blissey|Blissey, L50, F|331/331',
      '|-ability|p1b: Articuno|Pressure', '|turn|1',
      '|move|p1a: Smeargle|Earthquake|p2b: Blissey|[spread] p2a,p2b',
      '|move|p1a: Smeargle|Rock Slide|p2b: Blissey|[spread] p2a,p2b',
      '|move|p1a: Smeargle|Tackle|p1b: Articuno',
    ]);
    expect(pp(battle, 'Smeargle', 'earthquake')).toBe(2);
    expect(pp(battle, 'Smeargle', 'rockslide')).toBe(1);
    expect(pp(battle, 'Smeargle', 'tackle')).toBe(2);

    // [still] hides which foe was aimed at
    battle = play(9, [
      '|gametype|doubles',
      '|switch|p1a: Smeargle|Smeargle, L50, M|131/131', '|switch|p1b: Mew|Mew, L50|176/176',
      '|switch|p2a: Kyurem|Kyurem, L50|201/201', '|switch|p2b: Snorlax|Snorlax, L50, F|236/236',
      '|-ability|p2a: Kyurem|Pressure', '|turn|1',
      '|move|p1a: Smeargle|Sucker Punch||[still]', '|-fail|p1a: Smeargle',
    ]);
    expect(pp(battle, 'Smeargle', 'suckerpunch')).toEqual([2, 1]);

    // Pressure on the last PP takes only what is left
    battle = play(9, [
      '|switch|p1a: Lapras|Lapras, L50|200/200', '|switch|p2a: Snorlax|Snorlax, L50, F|236/236',
      '|turn|1', '|move|p1a: Lapras|Sheer Cold|p2a: Snorlax', '|-miss|p1a: Lapras|p2a: Snorlax',
      '|switch|p2a: Kyurem|Kyurem, L50|201/201', '|-ability|p2a: Kyurem|Pressure',
      ...Array(4).fill('|move|p1a: Lapras|Sheer Cold|p2a: Kyurem'),
    ]);
    expect(pp(battle, 'Lapras', 'sheercold')).toBe(8);

    // Pursuit on a switching foe still costs its own PP
    battle = play(4, [
      '|switch|p1a: Tyranitar|Tyranitar, L50, M|176/176',
      '|switch|p2a: Dusknoir|Dusknoir, L50, F|121/121', '|-ability|p2a: Dusknoir|Pressure',
      '|turn|1', '|-activate|p2a: Dusknoir|move: Pursuit',
      '|move|p1a: Tyranitar|Pursuit|p2a: Dusknoir|[from] move: Pursuit',
    ]);
    expect(pp(battle, 'Tyranitar', 'pursuit')).toBe(2);

    // Gen 3 hides Pressure and names Sleep Talk without a prefix, as it does Magic Coat
    battle = play(3, [
      '|switch|p1a: Snorlax|Snorlax, L50, M|236/236',
      '|switch|p2a: Dusclops|Dusclops, L50, F|116/116', '|turn|1',
      '|move|p1a: Snorlax|Rest|p1a: Snorlax', '|-status|p1a: Snorlax|slp|[from] move: Rest',
      '|cant|p1a: Snorlax|slp', '|move|p1a: Snorlax|Sleep Talk|p1a: Snorlax',
      '|move|p1a: Snorlax|Body Slam|p2a: Dusclops|[from] Sleep Talk',
      '|move|p2a: Dusclops|Magic Coat|p2a: Dusclops', '|-singleturn|p2a: Dusclops|move: Magic Coat',
      '|move|p1a: Snorlax|Toxic|p2a: Dusclops',
      '|move|p2a: Dusclops|Toxic|p1a: Snorlax|[from] Magic Coat',
    ]);
    expect(pp(battle, 'Snorlax', 'rest')).toBe(1);
    expect(pp(battle, 'Snorlax', 'sleeptalk')).toBe(2);
    expect(pp(battle, 'Snorlax', 'bodyslam')).toBe(0);
    expect(pp(battle, 'Dusclops', 'magiccoat', 'p2')).toBe(1);
    expect(pp(battle, 'Dusclops', 'toxic', 'p2')).toBeUndefined();

    // an ability shown while transformed was copied, and goes when the Pokemon switches out
    battle = play(4, [
      '|switch|p1a: Articuno|Articuno, L50|166/166', '|switch|p2a: Ditto|Ditto, L50|124/124',
      '|-ability|p1a: Articuno|Pressure', '|turn|1',
      '|move|p2a: Ditto|Transform|p1a: Articuno', '|-transform|p2a: Ditto|p1a: Articuno',
      '|-ability|p2a: Ditto|Pressure', '|turn|2',
      '|switch|p2a: Blissey|Blissey, L50, F|331/331',
      '|switch|p1a: Snorlax|Snorlax, L50, M|236/236',
      '|turn|3', '|switch|p2a: Ditto|Ditto, L50|124/124',
      '|move|p1a: Snorlax|Tackle|p2a: Ditto',
    ]);
    expect(pp(battle, 'Snorlax', 'tackle')).toBe(1);
  });
  it.todo('#cantUseMove');

  it('#abilities', () => {
    const pokemon =
      new Pokemon({battle: new Battle(gens)} as unknown as Side, {} as DetailedPokemon);
    pokemon.activateAbility({kind: 'Move', name: 'Tackle'});
    expect(pokemon.ability).not.toBe('tackle');
    pokemon.activateAbility({kind: 'Ability', name: 'Pressure'});
    expect(pokemon.ability).toBe('pressure');
    expect(pokemon.baseAbility).toBe('pressure');
    pokemon.activateAbility('Magic Guard', true);
    expect(pokemon.ability).toBe('magicguard');
    expect(pokemon.baseAbility).toBe('pressure');
  });

  it('#weighthg', () => {
    const pokemon = new Pokemon(
      {battle: {gen}} as unknown as Side,
      {speciesForme: 'Snorlax'} as DetailedPokemon
    );
    expect(pokemon.weighthg).toBe(4600);
    pokemon.addVolatile('autotomize' as ID, {level: 2});
    expect(pokemon.weighthg).toBe(2600);
    pokemon.addVolatile('autotomize' as ID, {level: 10});
    expect(pokemon.weighthg).toBe(1);
  });

  it('#types', () => {
    const pokemon = new Pokemon(
      {battle: {gen}} as unknown as Side,
      {speciesForme: 'Zapdos'} as DetailedPokemon
    );

    expect(pokemon.types).toEqual(['Electric', 'Flying']);
    expect(pokemon.addedType).toBeUndefined();
    pokemon.addVolatile('roost' as ID, {duration: 'turn'});
    expect(pokemon.types).toEqual(['Electric']);
    expect(pokemon.addedType).toBeUndefined();

    pokemon.speciesForme = 'Tornadus';

    pokemon.addVolatile('typeadd' as ID, {type: 'Grass'});
    expect(pokemon.types).toEqual(['Normal']);
    expect(pokemon.addedType).toBe('Grass');

    pokemon.addVolatile('typechange' as ID, {apparentType: 'Dragon/Fire'});
    expect(pokemon.types).toEqual(['Dragon', 'Fire']);
    expect(pokemon.addedType).toBe('Grass');

    const copy = new Pokemon(
      {battle: {gen}} as unknown as Side,
      {speciesForme: 'Gengar'} as DetailedPokemon
    );

    expect(copy.types).toEqual(['Ghost', 'Poison']);

    copy.copyTypesFrom(pokemon);
    expect(copy.types).toEqual(['Dragon', 'Fire']);
    expect(copy.addedType).toBe('Grass');
  });

  it.todo('#isGrounded');

  it('#species', () => {
    const pokemon = new Pokemon(
      {battle: {gen}} as unknown as Side,
      {speciesForme: 'Greninja'} as DetailedPokemon
    );

    expect(pokemon.baseSpecies.name).toBe('Greninja');
    expect(pokemon.species.name).toBe('Greninja');
    pokemon.speciesForme = 'Greninja-Bond';
    expect(pokemon.species.name).toBe('Greninja-Bond');

    pokemon.addVolatile('formechange' as ID, {speciesForme: 'Gengar' as SpeciesName});

    pokemon.speciesForme = 'Greninja';
    expect(pokemon.baseSpecies.name).toBe('Greninja');
    expect(pokemon.species.name).toBe('Gengar');
    pokemon.speciesForme = 'Greninja-Bond';
    expect(pokemon.species.name).toBe('Gengar');
  });

  it('#getDamageRange', () => {
    expect(Pokemon.getDamageRange([0, 300, 300, 'g'], 'g')).toEqual([0, 0]);
    expect(Pokemon.getDamageRange([-50, 300, 300, 'g'], 'g')).toEqual([-1 / 6, -1 / 6]);
    expect(Pokemon.getDamageRange([0, 48, 48, 'g'], 'g')).toEqual([0, 0]);
    const result = Pokemon.getDamageRange([-12, 48, 300, 'g'], 'g');
    expect(result[0]).toBeCloseTo(0.23);
    expect(result[1]).toBeCloseTo(0.27);
  });

  it('#getPixelRange', () => {
    const e = 0.5 / 714;
    expect(Pokemon.getPixelRange(0, '')).toEqual([0, 0]);
    expect(Pokemon.getPixelRange(1, 'r')).toEqual([e, 2 / 48 - e]);
    expect(Pokemon.getPixelRange(8, 'r')).toEqual([8 / 48, 9 / 48 - e]);
    expect(Pokemon.getPixelRange(9, 'r')).toEqual([9 / 48, 0.2]);
    expect(Pokemon.getPixelRange(9, 'y')).toEqual([0.2 + e, 10 / 48 - e]);
    expect(Pokemon.getPixelRange(15, 'y')).toEqual([15 / 48, 16 / 48 - e]);
    expect(Pokemon.getPixelRange(24, 'y')).toEqual([0.5, 0.5]);
    expect(Pokemon.getPixelRange(24, 'g')).toEqual([0.5 + e, 25 / 48 - e]);
    expect(Pokemon.getPixelRange(36, 'g')).toEqual([36 / 48, 37 / 48 - e]);
    expect(Pokemon.getPixelRange(47, 'g')).toEqual([47 / 48, 1 - e]);
    expect(Pokemon.getPixelRange(48, 'g')).toEqual([1, 1]);
  });

  it('#getFormattedRange', () => {
    expect(Pokemon.getFormattedRange([0, 0], 0, '-')).toBe('0%');
    expect(Pokemon.getFormattedRange([0.25, 0.50], 0, '_')).toBe('25_50%');
    expect(Pokemon.getFormattedRange([0.1, 0.1], 2, 'F')).toBe('10%');
    expect(Pokemon.getFormattedRange([0.123, 0.123], 2, 'F')).toBe('12.30%');
    expect(Pokemon.getFormattedRange([0.12, 0.123], 0, '-')).toBe('12-13%');
    expect(Pokemon.getFormattedRange([0.12, 0.123], 1, '-')).toBe('12.0-12.3%');
  });

  it('#reset', () => {
    const pokemon = new Pokemon({battle: {gen: {num: 8}}} as Side, {} as DetailedPokemon);
    pokemon.hp = 90;
    pokemon.maxhp = 105;
    pokemon.status = 'tox';
    pokemon.name = '';
    pokemon.statusStage = 5;
    pokemon.speciesForme = 'Gengar';

    pokemon.reset();

    expect(pokemon.hp).toBe(105);
    expect(pokemon.status).toBeUndefined();
    expect(pokemon.name).toBe('Gengar');
    expect(pokemon.statusStage).toBe(0);
  });

  it('#destroy', () => {
    const pokemon = new Pokemon({battle: {gen: {num: 8}}} as Side, {} as DetailedPokemon);
    expect(pokemon.side).not.toBeNull();
    pokemon.destroy();
    expect(pokemon.side).toBeNull();
  });
});
