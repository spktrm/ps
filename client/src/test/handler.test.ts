import {Generations} from '@pkmn/data';
import {Dex} from '@pkmn/dex';

import {Battle} from '../index';

const GENS = new Generations(Dex);

const play = (gen: number, lines: string[]) => {
  const battle = new Battle(GENS);
  for (const line of ['|player|p1|Alice|1|', '|player|p2|Bob|2|', `|gen|${gen}`, ...lines]) {
    battle.add(line);
  }
  return battle;
};

describe('Handler', () => {
  it('|-heal|', () => {
    const battle = play(9, [
      '|switch|p1a: Blissey|Blissey, F|100/100', '|switch|p2a: Breloom|Breloom, M|100/100',
      '|turn|1',
      '|move|p2a: Breloom|Leech Seed|p1a: Blissey', '|-start|p1a: Blissey|move: Leech Seed',
      '|move|p1a: Blissey|Wish|p1a: Blissey',
      '|-damage|p1a: Blissey|88/100|[from] Leech Seed|[of] p2a: Breloom',
      '|-heal|p2a: Breloom|100/100|[silent]',
      '|upkeep', '|turn|2',
      '|move|p2a: Breloom|Toxic|p1a: Blissey', '|-status|p1a: Blissey|tox',
      '|move|p1a: Blissey|Sing|p2a: Breloom', '|-status|p2a: Breloom|slp|[from] move: Sing',
      '|upkeep', '|turn|3',
      '|cant|p2a: Breloom|slp',
      '|move|p1a: Blissey|Soft-Boiled|p1a: Blissey', '|-heal|p1a: Blissey|100/100 tox',
      '|-damage|p1a: Blissey|88/100 tox|[from] Leech Seed|[of] p2a: Breloom',
      '|-heal|p2a: Breloom|100/100 slp|[silent]',
    ]);
    const blissey = battle.p1.active[0]!;
    const breloom = battle.p2.active[0]!;

    // heals without a [from] leave the counters, the wish and the last move alone
    expect(blissey.statusState.toxicTurns).toBe(1);
    expect(breloom.statusState.sleepTurns).toBe(1);
    expect(battle.p1.wisher).toBe(blissey);
    expect(battle.lastMove).toBe('softboiled');

    battle.add('|-heal|p1a: Blissey|100/100 tox|[from] move: Wish|[wisher] Blissey');
    expect(blissey.statusState.toxicTurns).toBe(1);
    expect(battle.lastMove).toBe('softboiled');

    const hw = play(9, [
      '|switch|p1a: Snorlax|Snorlax, M|100/100', '|switch|p2a: Amoonguss|Amoonguss, F|100/100',
      '|turn|1',
      '|move|p2a: Amoonguss|Spore|p1a: Snorlax', '|-status|p1a: Snorlax|slp|[from] move: Spore',
      '|upkeep', '|turn|2',
      '|cant|p1a: Snorlax|slp',
      '|move|p2a: Amoonguss|Giga Drain|p1a: Snorlax', '|-damage|p1a: Snorlax|50/100 slp',
      '|upkeep', '|turn|3',
      '|switch|p1a: Gardevoir|Gardevoir, F|100/100',
      '|upkeep', '|turn|4',
      '|move|p1a: Gardevoir|Healing Wish|p1a: Gardevoir', '|-damage|p1a: Gardevoir|0 fnt',
      '|faint|p1a: Gardevoir',
      '|upkeep',
    ]);
    const snorlax = hw.p1.team.find(p => p.name === 'Snorlax')!;
    expect(snorlax.statusState.sleepTurns).toBe(1);
    expect(hw.p1.wisher).toBe(hw.p1.team.find(p => p.name === 'Gardevoir'));

    hw.add('|switch|p1a: Snorlax|Snorlax, M|50/100 slp');
    hw.add('|-heal|p1a: Snorlax|100/100|[from] move: Healing Wish');
    expect(snorlax.status).toBeUndefined();
    expect(snorlax.statusState.sleepTurns).toBe(0);
    expect(hw.p1.wisher).toBeNull();
    expect(hw.lastMove).toBe('healing-wish');

    const ld = play(9, [
      '|switch|p1a: Snorlax|Snorlax, M|100/100', '|switch|p2a: Amoonguss|Amoonguss, F|100/100',
      '|turn|1',
      '|move|p1a: Snorlax|Body Slam|p2a: Amoonguss', '|-damage|p2a: Amoonguss|60/100',
      '|move|p2a: Amoonguss|Giga Drain|p1a: Snorlax', '|-damage|p1a: Snorlax|50/100',
      '|upkeep', '|turn|2',
      '|switch|p1a: Cresselia|Cresselia, F|100/100',
      '|upkeep', '|turn|3',
      '|move|p1a: Cresselia|Lunar Dance|p1a: Cresselia', '|-damage|p1a: Cresselia|0 fnt',
      '|faint|p1a: Cresselia',
      '|upkeep',
      '|switch|p1a: Snorlax|Snorlax, M|50/100',
    ]);
    const lunar = ld.p1.active[0]!;
    expect(lunar.moveSlots[0].ppUsed).toBe(1);
    ld.add('|-heal|p1a: Snorlax|100/100|[from] move: Lunar Dance');
    expect(lunar.moveSlots[0].ppUsed).toBe(0);
    expect(ld.lastMove).toBe('healing-wish');
  });

  it('|-status|', () => {
    const battle = play(9, [
      '|switch|p1a: Chansey|Chansey, F|100/100', '|switch|p2a: Amoonguss|Amoonguss, F|100/100',
      '|turn|1',
      '|move|p2a: Amoonguss|Spore|p1a: Chansey', '|-status|p1a: Chansey|slp|[from] move: Spore',
      '|upkeep', '|turn|2', '|cant|p1a: Chansey|slp', '|upkeep', '|turn|3',
      '|cant|p1a: Chansey|slp', '|upkeep', '|turn|4',
      '|switch|p1a: Blissey|Blissey, F|100/100', '|upkeep', '|turn|5',
    ]);
    const chansey = battle.p1.team.find(p => p.name === 'Chansey')!;
    expect(chansey.statusState.sleepTurns).toBe(2);

    // the HP string shows Natural Cure's cure, and the count goes with the status
    battle.add('|switch|p1a: Chansey|Chansey, F|100/100');
    expect(chansey.status).toBeUndefined();
    expect(chansey.statusState.sleepTurns).toBe(0);

    battle.add('|-status|p1a: Chansey|slp|[from] move: Spore');
    battle.add('|cant|p1a: Chansey|slp');
    expect(chansey.statusState.sleepTurns).toBe(1);

    // Gen 2 Rest through Sleep Talk starts the sleep again
    const rest = play(2, [
      '|switch|p1a: Snorlax|Snorlax, M|100/100', '|switch|p2a: Gengar|Gengar, M|100/100',
      '|turn|1',
      '|move|p2a: Gengar|Hypnosis|p1a: Snorlax', '|-status|p1a: Snorlax|slp|[from] move: Hypnosis',
      '|upkeep', '|turn|2',
      '|cant|p1a: Snorlax|slp', '|move|p1a: Snorlax|Sleep Talk|p1a: Snorlax',
      '|move|p1a: Snorlax|Rest|p1a: Snorlax|[from] move: Sleep Talk',
    ]);
    const snorlax = rest.p1.active[0]!;
    expect(snorlax.statusState.sleepTurns).toBe(1);
    rest.add('|-status|p1a: Snorlax|slp|[from] move: Rest');
    expect(snorlax.statusState.sleepTurns).toBe(0);
  });

  it('|-ability|', () => {
    // Simple Beam names the ability it replaced, which comes back after a switch
    const beam = play(9, [
      '|switch|p1a: Sneasler|Sneasler, L50, M|155/155',
      '|switch|p2a: Indeedee|Indeedee, L50, M|135/135', '|turn|1',
      '|move|p2a: Indeedee|Simple Beam|p1a: Sneasler',
      '|-ability|p1a: Sneasler|Simple|Unburden|[from] move: Simple Beam',
    ]);
    const sneasler = beam.p1.active[0]!;
    expect(sneasler.ability).toBe('simple');
    expect(sneasler.baseAbility).toBe('unburden');
    beam.add('|switch|p1a: Pelipper|Pelipper, L50, F|135/135');
    expect(sneasler.ability).toBe('unburden');

    // Doodle doesn't name whose ability it copied
    const doodle = play(9, [
      '|gametype|doubles',
      '|switch|p1a: Sneasler|Sneasler, L50, M|155/155',
      '|switch|p1b: Smeargle|Smeargle, L50, F|130/130',
      '|switch|p2a: Incineroar|Incineroar, L50, F|170/170',
      '|switch|p2b: Gyarados|Gyarados, L50, M|170/170', '|turn|1',
      '|move|p1b: Smeargle|Doodle|p2b: Gyarados',
      '|-ability|p1a: Sneasler|Moxie|Unburden|[from] move: Doodle',
      '|-ability|p1b: Smeargle|Moxie|Own Tempo|[from] move: Doodle',
    ]);
    expect(doodle.p1.active[0]!.ability).toBe('moxie');
    expect(doodle.p1.active[0]!.baseAbility).toBe('unburden');
    expect(doodle.p1.active[1]!.baseAbility).toBe('owntempo');
    expect(doodle.p2.active[1]!.ability).toBe('');

    // Intimidate's boost names no ability
    const intimidate = play(9, [
      '|switch|p1a: Incineroar|Incineroar, L50, F|170/170',
      '|-ability|p1a: Incineroar|Intimidate|boost',
    ]);
    expect(intimidate.p1.active[0]!.baseAbility).toBe('intimidate');
  });

  it('|-activate|', () => {
    // a Pokemon that transformed swaps away the ability it copied, not its own
    const battle = play(9, [
      '|gametype|doubles',
      '|switch|p1a: Mew|Mew, L50|175/175', '|switch|p1b: Blissey|Blissey, L50, F|330/330',
      '|switch|p2a: Espeon|Espeon, L50, M|140/140',
      '|switch|p2b: Gengar|Gengar, L50, F|135/135', '|turn|1',
      '|move|p1a: Mew|Transform|p2a: Espeon', '|-transform|p1a: Mew|p2a: Espeon', '|turn|2',
      '|move|p1a: Mew|Skill Swap|p2b: Gengar',
      '|-activate|p1a: Mew|Skill Swap|Cursed Body|Magic Bounce|[of] p2b: Gengar',
    ]);
    const mew = battle.p1.active[0]!;
    const gengar = battle.p2.active[1]!;
    expect(mew.ability).toBe('cursedbody');
    expect(mew.baseAbility).toBe('');
    expect(gengar.ability).toBe('magicbounce');
    expect(gengar.baseAbility).toBe('cursedbody');
  });

  it('|-endability|', () => {
    const battle = play(9, [
      '|switch|p1a: Mew|Mew|100/100', '|switch|p2a: Kyurem|Kyurem|100/100',
      '|-ability|p2a: Kyurem|Pressure',
      '|turn|1',
      '|move|p1a: Mew|Gastro Acid|p2a: Kyurem', '|-endability|p2a: Kyurem',
    ]);
    const kyurem = battle.p2.active[0]!;
    expect(kyurem.volatiles.gastroacid).toBeDefined();
    expect(kyurem.effectiveAbility()).toBe('');

    battle.add('|switch|p2a: Snorlax|Snorlax, M|100/100');
    expect(kyurem.volatiles.gastroacid).toBeUndefined();
    expect(kyurem.ability).toBe('pressure');
  });

  it('|-transform|', () => {
    const battle = play(4, [
      '|switch|p1a: Articuno|Articuno, L50|166/166', '|switch|p2a: Ditto|Ditto, L50|124/124',
      '|-ability|p1a: Articuno|Pressure', '|turn|1',
      '|move|p2a: Ditto|Transform|p1a: Articuno', '|-transform|p2a: Ditto|p1a: Articuno',
      '|-ability|p2a: Ditto|Pressure',
    ]);
    const ditto = battle.p2.active[0]!;
    expect(ditto.ability).toBe('pressure');
    expect(ditto.baseAbility).toBeFalsy();

    // Transform's copy ends when Ditto leaves
    battle.add('|switch|p2a: Blissey|Blissey, L50, F|331/331');
    expect(ditto.ability).toBeFalsy();
  });
});
