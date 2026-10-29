import {
  BoostsTable, DataKind, Effect, GenderName, HPColor, HPTypeName, ID, Move,
  MoveTarget, NatureName, PokemonSet, SpeciesName, StatID, StatusName, TypeName, toID,
} from '@pkmn/data';
import {
  DetailedPokemon, EffectName, MoveName, PokemonDetails, PokemonHPStatus,
  PokemonHealth, PokemonIdent, PokemonSearchID, Protocol,
} from '@pkmn/protocol';

import {NA} from './battle';
import {CloneMemo, cloneable, copy, copyRest} from './clone';
import {Side} from './side';

interface EffectState {
  id: ID;
  level?: number;
  apparentType?: string;
  type?: TypeName;
  stat?: StatID;
  speciesForme?: SpeciesName;
  pokemon?: Pokemon;
  shiny?: boolean;
  gender?: GenderName;
  duration?: 'turn' | 'move' | number;
}

interface EffectTable {[effectid: string]: EffectState}

type MoveSlot = {
  name: MoveName;
  id: ID;
  ppUsed: PPState;
  virtual?: boolean;
} | {
  name: MoveName;
  id: ID;
  ppUsed: PPState;
  pp: number;
  maxpp: number;
  target: MoveTarget;
  disabled?: boolean;
  virtual?: boolean;
};

export type ItemEffect =
   'found' | 'frisked' | 'knocked off' | 'stolen' |
   'harvested' | 'bestowed' | 'tricked' | 'disturbed';
export type LastItemEffect =
   'eaten' | 'flung' | 'knocked off' | 'stolen' | 'consumed' | 'incinerated' | 'popped' | 'held up';
export type CopySource = 'batonpass' | 'illusion' | 'shedtail';
export type PPState = number | [number, number];

interface SwitchInState {
  moveSlots: MoveSlot[];
  item: ID;
  itemEffect: ItemEffect | '';
  lastItem: ID;
  lastItemEffect: LastItemEffect | '';
}

const copyPP = (pp: PPState): PPState => typeof pp === 'number' ? pp : [pp[0], pp[1]];

// The PP used since `b`, given the PP used now, `a`, each as [upper, lower].
function subtractPP(a: PPState, b: PPState): PPState {
  const [a0, a1] = typeof a === 'number' ? [a, a] : a;
  const [b0, b1] = typeof b === 'number' ? [b, b] : b;
  return a0 - b0 === a1 - b1 ? a0 - b0 : [a0 - b0, a1 - b1];
}

const VOLATILES = [
  'airballoon', 'attract', 'autotomize', 'disable', 'encore', 'foresight', 'gmaxchistrike',
  'imprison', 'laserfocus', 'mimic', 'miracleeye', 'nightmare', 'saltcure', 'smackdown',
  'stockpile1', 'stockpile2', 'stockpile3', 'syrupbomb', 'torment', 'typeadd', 'typechange', 'yawn',
];

export class Pokemon implements DetailedPokemon, PokemonHealth {
  readonly side: Side;
  readonly set?: PokemonSet;
  slot: number;

  details: PokemonDetails;
  name: string;
  baseSpeciesForme: string;
  level: number;
  shiny: boolean;
  gender: GenderName;
  readonly originalIdent: PokemonIdent;
  terastallized?: TypeName;
  searchid: PokemonSearchID;

  hp: number;
  maxhp: number;
  baseMaxhp: number;
  hpcolor: HPColor;
  status?: StatusName;
  fainted: boolean;

  newlySwitched: boolean;
  beingCalledBack: boolean;

  statusStage: number;
  statusState: {sleepTurns: number; toxicTurns: number};
  boosts: Partial<BoostsTable>;
  volatiles: EffectTable;

  ability: ID;
  baseAbility: ID;
  illusion?: Pokemon;
  revealedDetails?: PokemonDetails;

  item: ID;
  itemEffect: ItemEffect | '';
  lastItem: ID;
  lastItemEffect: LastItemEffect | '';
  teamPreviewItem: boolean;

  nature?: NatureName;
  hpType?: HPTypeName;

  moveSlots: MoveSlot[];
  maxMoves?: Array<{
    id: ID;
    target: MoveTarget;
    disabled?: boolean;
  }>;
  zMoves?: Array<{
    name: MoveName;
    id: ID;
    target: MoveTarget;
  } | null>;

  canDynamax?: boolean;
  canGigantamax?: boolean;
  canMegaEvo?: boolean;
  canUltraBurst?: boolean;
  canTerastallize?: string;
  trapped?: boolean;
  maybeTrapped?: boolean;
  maybeDisabled?: boolean;

  lastMove: ID;
  lastMoveTargetLoc?: number;
  moveThisTurn: ID | boolean;
  hurtThisTurn: boolean;
  movesUsedWhileActive: ID[];
  timesAttacked: number;
  /** What was known of this Pokemon's moves and item when it last came in. */
  switchInState?: Readonly<SwitchInState>;

  constructor(side: Side, details: DetailedPokemon, set?: PokemonSet) {
    this.side = side;
    this.set = set;
    this.slot = 0;

    this.baseSpeciesForme = details.speciesForme;
    this.details = details.details;
    this.name = details.name;
    this.level = set?.level ?? details.level;
    this.shiny = details.shiny;
    this.gender = details.gender || 'N';
    this.originalIdent = details.ident;
    this.searchid = details.searchid;

    this.hp = 0;
    this.maxhp = 0; // 1000
    this.baseMaxhp = this.maxhp;
    this.hpcolor = 'g';
    this.status = undefined;
    this.fainted = false;

    this.newlySwitched = false;
    this.beingCalledBack = false;

    this.statusStage = 0;
    this.statusState = {sleepTurns: 0, toxicTurns: 0};
    this.boosts = {};
    this.volatiles = {};

    this.ability = set?.ability ? toID(set.ability) : '';
    this.baseAbility = '';
    this.illusion = undefined;
    this.revealedDetails = undefined;

    this.item = set?.item ? toID(set.item) : '';
    this.itemEffect = '';
    this.lastItem = '';
    this.lastItemEffect = '';
    this.teamPreviewItem = false;

    this.nature = set?.nature ? this.side.battle.gen.natures.get(set.nature)?.name : undefined;
    this.hpType = set?.hpType
      ? this.side.battle.gen.types.get(set.hpType)?.name as HPTypeName
      : undefined;
    this.terastallized =
      set?.teraType ? this.side.battle.gen.types.get(set?.teraType)?.name : undefined;

    this.moveSlots = [];
    this.maxMoves = undefined;
    this.zMoves = undefined;

    this.canDynamax = undefined;
    this.canGigantamax = undefined;
    this.canMegaEvo = undefined;
    this.canUltraBurst = undefined;
    this.canTerastallize = undefined;
    this.trapped = undefined;
    this.maybeTrapped = undefined;
    this.maybeDisabled = undefined;

    this.lastMove = '';
    this.lastMoveTargetLoc = undefined;
    this.moveThisTurn = '';
    this.hurtThisTurn = false;
    this.movesUsedWhileActive = [];
    this.timesAttacked = 0;
    this.switchInState = undefined;
  }

  toString(): string {
    const ident = this.side.active.includes(this) ? this.ident : this.originalIdent;
    const s = `${ident}|${this.details}`;
    return this.illusion ? `${this.illusion.toString()} (${s})` : s;
  }

  get ivs() {
    return this.set?.ivs;
  }

  get evs() {
    return this.set?.evs;
  }

  get happiness() {
    return this.set?.happiness;
  }

  get ident() {
    return (
      this.originalIdent.substr(0, 2) +
      'abcdef'.charAt(this.slot) +
      this.originalIdent.substr(2)
    ) as PokemonIdent;
  }

  get position() {
    return this.slot;
  }

  get species() {
    return this.side.battle.gen.species.get(this.speciesForme)!;
  }

  get baseSpecies() {
    return this.side.battle.gen.species.get(this.baseSpeciesForme)!;
  }

  get speciesForme() {
    return this.volatiles.formechange?.speciesForme || this.baseSpeciesForme;
  }

  set speciesForme(speciesForme: string) {
    this.baseSpeciesForme = speciesForme;
  }

  get weighthg() {
    const autotomizeFactor = (this.volatiles.autotomize?.level || 0) * 1000;
    return Math.max(1, this.species.weighthg - autotomizeFactor);
  }

  get types() {
    let types: [TypeName] | [TypeName, TypeName];
    if (this.isTerastallized && this.teraType !== 'Stellar') {
      types = [this.teraType!];
    } else if (this.volatiles.typechange) {
      types =
        this.volatiles.typechange.apparentType!.split('/') as [TypeName] | [TypeName, TypeName];
    } else {
      types = this.species.types;
    }
    return this.actualTypes(types);
  }

  actualTypes(types: [TypeName] | [TypeName, TypeName]) {
    if (this.hasVolatile('roost' as ID) && types.includes('Flying')) {
      types = types.filter(typeName => typeName !== 'Flying') as [TypeName] | [TypeName, TypeName];
      if (!types.length) types = ['Normal'];
    }
    return types;
  }

  get addedType() {
    return this.volatiles.typeadd?.type;
  }

  get teraType() {
    return this.terastallized;
  }

  get isTerastallized() {
    return !!this.terastallized;
  }

  get switching() {
    return this.newlySwitched ? 'in' : this.beingCalledBack ? 'out' : undefined;
  }

  get moves() {
    return this.moveSlots.map(m => m.id);
  }

  hasItem() {
    return this.name ? !!this.item : this.teamPreviewItem;
  }

  isActive() {
    return this.side.active.includes(this);
  }

  healthParse(hpstring: string) {
    const oldmaxhp = this.maxhp;
    const oldstatus = this.status;
    const health = Pokemon.parseHealth(hpstring, this);
    // baseMaxhp differs from maxhp after Dynamax, but a Pokemon will always be initialized
    // in its base form first before Dynamax and so the first maxhp value we see is the base
    if (oldmaxhp === 0) this.baseMaxhp = this.maxhp;
    // a status the HP string starts or ends takes its counters with it
    if (this.status !== oldstatus) this.setStatus(this.status);
    return health;
  }

  /** Sets the status and restarts its sleep and toxic counters, as the sim does. */
  setStatus(status?: StatusName) {
    this.status = status;
    this.statusState.sleepTurns = 0;
    this.statusState.toxicTurns = 0;
  }

  static parseHealth(
    hpstring: string,
    output: PokemonHealth = {hp: 0, maxhp: 0, hpcolor: ''}
  ): [delta: number, denominator: number, oldnum: number, oldcolor: HPColor | ''] | null {
    if (!hpstring?.length) return null;

    let oldhp = output.fainted ? 0 : (output.hp || 1);
    let oldmaxhp = output.maxhp;
    const oldcolor = output.hpcolor;

    void Protocol.parseHealth(hpstring as PokemonHPStatus, output);
    // max hp not known before parsing this message
    if (oldmaxhp === 0) oldmaxhp = oldhp = output.maxhp;
    const oldnum = oldhp ? (Math.floor(output.maxhp * oldhp / oldmaxhp) || 1) : 0;
    const delta = output.hp - oldnum;
    return [delta, output.maxhp, oldnum, oldcolor];
  }

  checkDetails(details?: PokemonDetails) {
    if (!details) return false;
    if (details === this.details) return true;
    if (this.searchid) return false;
    if (details.includes(', shiny')) {
      if (this.checkDetails(details.replace(', shiny', '') as PokemonDetails)) {
        return true;
      }
    }
    // the actual forme was hidden on Team Preview
    details = details.replace(/(-[A-Za-z0-9-]+)?(, |$)/, '-*$2') as PokemonDetails;
    return details === this.details;
  }

  hasVolatile(volatile: ID) {
    return !!this.volatiles[volatile];
  }

  addVolatile(volatile: ID, args?: Omit<EffectState, 'id'>) {
    if (this.hasVolatile(volatile) && !args) return;
    this.volatiles[volatile] = {...args, id: volatile};
  }

  removeVolatile(volatile: ID) {
    if (!this.hasVolatile(volatile)) return;
    delete this.volatiles[volatile];
  }

  clearTurnstatuses() {
    for (const id in this.volatiles) {
      if (this.volatiles[id].duration === 'turn') delete this.volatiles[id];
    }
  }

  clearMovestatuses() {
    for (const id in this.volatiles) {
      if (this.volatiles[id].duration === 'move') delete this.volatiles[id];
    }
  }

  clearVolatiles() {
    this.volatiles = {};
  }

  clearVolatile() {
    this.ability = this.baseAbility;
    this.boosts = {};
    this.clearVolatiles();

    for (let i = 0; i < this.moveSlots.length; i++) {
      if (this.moveSlots[i].virtual) {
        this.moveSlots.splice(i, 1);
        i--;
      }
    }
    this.lastMove = '';
    this.moveThisTurn = '';
    this.hurtThisTurn = false;
    this.newlySwitched = true;
    this.beingCalledBack = false;
    this.movesUsedWhileActive = [];

    this.statusStage = 0;
    this.statusState.toxicTurns = 0;
    if (this.side.battle.gen.num === 5) this.statusState.sleepTurns = 0;
  }

  copyVolatileFrom(pokemon: Pokemon, copySource: CopySource = 'batonpass') {
    this.boosts = pokemon.boosts;
    this.volatiles = pokemon.volatiles;
    // this.lastMove = pokemon.lastMove; // I think
    if (copySource === 'batonpass') {
      for (const volatile of VOLATILES) {
        delete this.volatiles[volatile];
      }
    }
    // Shed Tail doesn't need special handling because the source already has
    // its volatiles except Substitute cleared in switchOut.
    delete this.volatiles['transform'];
    delete this.volatiles['formechange'];
    delete this.volatiles['terastallize'];

    pokemon.boosts = {};
    pokemon.volatiles = {};
    pokemon.statusStage = 0;
  }

  /** Notes the moves and item known as this Pokemon comes in. */
  markSwitchIn() {
    this.switchInState = {
      moveSlots: this.moveSlots.map(m => ({...m, ppUsed: copyPP(m.ppUsed)})),
      item: this.item,
      itemEffect: this.itemEffect,
      lastItem: this.lastItem,
      lastItemEffect: this.lastItemEffect,
    };
  }

  /** Gives what this Pokemon showed since it came in to the Illusion user it really was. */
  giveSwitchInTo(pokemon?: Pokemon | null) {
    const before = this.switchInState;
    if (!before) return;
    for (const slot of this.moveSlots) {
      if (slot.virtual) continue;
      const old = before.moveSlots.find(m => m.id === slot.id && !m.virtual);
      const pp = old ? subtractPP(slot.ppUsed, old.ppUsed) : slot.ppUsed;
      if (!old || pp !== 0) pokemon?.rememberMove(slot.name, pp);
    }
    this.moveSlots = before.moveSlots.map(m => ({...m, ppUsed: copyPP(m.ppUsed)}));
    if (this.item !== before.item || this.itemEffect !== before.itemEffect ||
      this.lastItem !== before.lastItem || this.lastItemEffect !== before.lastItemEffect) {
      if (pokemon) {
        pokemon.item = this.item;
        pokemon.itemEffect = this.itemEffect;
        pokemon.lastItem = this.lastItem;
        pokemon.lastItemEffect = this.lastItemEffect;
      }
      this.item = before.item;
      this.itemEffect = before.itemEffect;
      this.lastItem = before.lastItem;
      this.lastItemEffect = before.lastItemEffect;
    }
  }

  /** Takes what another object for the same Pokemon knew, where this one knows nothing yet. */
  takeHistoryFrom(pokemon: Pokemon) {
    if (!this.moveSlots.length) {
      this.moveSlots = pokemon.moveSlots.map(m => ({...m, ppUsed: copyPP(m.ppUsed)}));
    }
    if (!this.item && !this.lastItem) {
      this.item = pokemon.item;
      this.itemEffect = pokemon.itemEffect;
      this.lastItem = pokemon.lastItem;
      this.lastItemEffect = pokemon.lastItemEffect;
    }
    if (!this.baseAbility) {
      this.ability = pokemon.ability;
      this.baseAbility = pokemon.baseAbility;
    }
  }

  private mergePP(entry: [MoveName, PPState], pp: PPState): PPState {
    let ppUsed = entry[1];
    if (typeof ppUsed === 'number') {
      if (typeof pp === 'number') {
        ppUsed += pp;
      } else {
        ppUsed = [ppUsed + pp[0], ppUsed + pp[1]];
      }
    } else {
      if (typeof pp === 'number') {
        ppUsed[0] += pp;
        ppUsed[1] += pp;
      } else {
        ppUsed[0] += pp[0];
        ppUsed[1] += pp[1];
      }
    }
    // Pressure on a move's last PP takes only what is left
    const move = this.side.battle.gen.moves.get(entry[0]);
    let maxpp = !move ? Infinity : (move.pp === 1 || move.noPPBoosts ? move.pp : move.pp * 8 / 5);
    if (move && this.side.battle.tier.includes('Champions')) {
      maxpp = move.pp > 20 ? 20 : move.pp;
      maxpp = move.pp === 1 || move.noPPBoosts ? move.pp : (move.pp / 5 + 1) * 4;
    }
    if (typeof ppUsed === 'number') {
      if (ppUsed < 0) ppUsed = 0;
      if (ppUsed > maxpp) ppUsed = maxpp;
    } else {
      if (ppUsed[0] < 0) ppUsed[0] = 0;
      if (ppUsed[1] < 0) ppUsed[1] = 0;
      if (ppUsed[0] > maxpp) ppUsed[0] = maxpp;
      if (ppUsed[1] > maxpp) ppUsed[1] = maxpp;
      if (ppUsed[0] < ppUsed[1]) ppUsed[0] = ppUsed[1];
      if (ppUsed[0] === ppUsed[1]) ppUsed = ppUsed[0];
    }
    return ppUsed;
  }

  rememberMove(moveName: MoveName | ID, ppUsed: PPState = 1, recursionSource?: PokemonIdent) {
    if (recursionSource === this.originalIdent) return;
    // a move already remembered by its ID is left as it is when no PP was used
    if (ppUsed === 0 && !this.volatiles.transform) {
      for (const entry of this.moveSlots) {
        if (entry.id === moveName && entry.virtual === false) return;
      }
    }
    const move = this.side.battle.get('moves', moveName);
    if (move.name === 'Struggle') return;
    let virtual = false;
    if (this.volatiles.transform) {
      // make sure there is no infinite recursion if both Pokemon are transformed into each other
      if (!recursionSource) recursionSource = this.originalIdent;
      this.volatiles.transform.pokemon!.rememberMove(move.name as MoveName, 0, recursionSource);
      virtual = true;
    }
    for (const entry of this.moveSlots) {
      if (move.name === entry.name && virtual === entry.virtual) {
        entry.ppUsed = this.mergePP([entry.name, entry.ppUsed], ppUsed);
        return;
      }
    }
    this.moveSlots.push({id: move.id, name: move.name as MoveName, ppUsed, virtual});
  }

  useMove(
    move: Partial<Move> & NA,
    target: Pokemon | null,
    from?: EffectName | MoveName
  ) {
    const fromeffect = this.side.battle.get('conditions', from);
    this.activateAbility(fromeffect);
    this.clearMovestatuses();
    if (move.id === 'focuspunch') this.removeVolatile('focuspunch' as ID);
    if (fromeffect?.id === 'sleeptalk') {
      this.rememberMove(move.name, 0);
    }
    const gen = this.side.battle.gen;
    const caller = fromeffect.id ? gen.moves.get(fromeffect.id) : undefined;
    let callerMoveForPressure = null;
    // will not include effects that are conditions named after moves like Magic Coat and Snatch
    if (fromeffect.id && fromeffect.id !== move.id &&
      // Gen 3 drops the prefix, but only the conditions' moves have a condition
      (from!.startsWith('move:') || (gen.num === 3 && caller && !caller.condition))) {
      callerMoveForPressure = fromeffect as Move;
    }
    // Pursuit hitting a switching foe names itself
    if (!fromeffect.id || callerMoveForPressure || fromeffect.id === move.id) {
      let moveName = move.name;
      if (!callerMoveForPressure) {
        // const previousLine = this.stepQueue[this.currentStep - 1];
        // const zPower = previousLine.startsWith('|-zpower');
        const zPower = true; // BUG
        if (move.isZ && zPower) {
          const isZ = move.isZ as ID;
          this.item = isZ;
          const item = this.side.battle.gen.items.get(isZ);
          if (item?.zMoveFrom) moveName = item.zMoveFrom;
        } else if (move.name.startsWith('Z-') && zPower) {
          moveName = moveName.slice(2) as MoveName;
          move = this.side.battle.get('moves', moveName) as Partial<Move> & NA;
          for (const item of this.side.battle.gen.items) {
            if (item.zMoveType === move.type) {
              this.item = item.id;
              break;
            }
          }
        }
      }
      // 1 pp was already deducted from using the move itself
      const pp: PPState = callerMoveForPressure ? 0 : 1;
      this.rememberMove(
        callerMoveForPressure ? callerMoveForPressure.name : moveName,
        this.getPressurePP(pp, move, target)
      );
    }
    this.lastMove = move.id;
    this.lastMoveTargetLoc = target
      ? target.side === this.side ? -(target.slot + 1) : target.slot + 1
      : 0;
    this.side.battle.lastMove = move.id;
    this.moveThisTurn = move.id;
    if (!this.movesUsedWhileActive.includes(move.id)) this.movesUsedWhileActive.push(move.id);
    if (move.id === 'wish' || move.id === 'healingwish') {
      this.side.wisher = this;
    }
  }
  // Adds the PP that Pressure takes, from the Pokemon the sim's getMoveTargets checks for it.
  private getPressurePP(pp: PPState, move: Partial<Move> & NA, target: Pokemon | null) {
    const active = this.side.battle.getAllActive();
    let checked: Pokemon[] = [];
    let min = 0;
    let max = 0;
    if (move.flags?.mustpressure) {
      checked = active.filter(p => !this.isAlly(p));
    } else {
      switch (move.target) {
        case 'foeSide': break;
        case 'all': checked = active; break;
        case 'allySide': case 'allyTeam': case 'allies':
          checked = active.filter(p => this.isAlly(p));
          break;
        case 'allAdjacent': checked = active.filter(p => this.isAdjacent(p)); break;
        case 'allAdjacentFoes':
          checked = active.filter(p => !this.isAlly(p) && this.isAdjacent(p));
          break;
        default:
          if (target) {
            checked = [target];
            // Dragon Darts also hits the target's ally beside it
            const ally = move.smartTarget &&
              active.find(p => p !== target && p !== this && target.isAlly(p) &&
                target.isAdjacent(p));
            if (ally) checked.push(ally);
          } else {
            // [still] hides the target, so take the range over every Pokemon it could be
            const ranges = active.filter(p => this.couldTarget(p, move.target!))
              .map(p => this.pressureOf(p));
            if (ranges.length) {
              min = Math.min(...ranges.map(r => r[0]));
              max = Math.max(...ranges.map(r => r[1]));
            }
          }
      }
    }
    for (const p of checked) {
      const [lo, hi] = this.pressureOf(p);
      min += lo;
      max += hi;
    }
    if (typeof pp === 'number') return min === max ? pp + min : [pp + max, pp + min] as PPState;
    return [pp[0] + max, pp[1] + min] as PPState;
  }

  // The PP that p's Pressure adds to this Pokemon's move, as [at least, at most].
  private pressureOf(p: Pokemon): [number, number] {
    // Pressure spares the user, and from Gen 5 its allies too
    if (p.fainted || p === this || (this.side.battle.gen.num >= 5 && this.isAlly(p))) {
      return [0, 0];
    }
    if (p.ability || p.baseAbility) {
      return p.effectiveAbility() === 'pressure' ? [1, 1] : [0, 0];
    }
    // Gen 3 shows Pressure only to its own side
    if (this.side.battle.gen.num !== 3) return [0, 0];
    const abilities = Object.values(this.side.battle.gen.species.get(p.speciesForme)!.abilities);
    if (!abilities.some(a => toID(a) === 'pressure')) return [0, 0];
    return abilities.length === 1 ? [1, 1] : [0, 1];
  }

  // Whether a move with this target type could have been aimed at p.
  private couldTarget(p: Pokemon, moveTarget: MoveTarget) {
    switch (moveTarget) {
      case 'self': return p === this;
      case 'adjacentAllyOrSelf': return p === this || (this.isAlly(p) && this.isAdjacent(p));
      case 'adjacentAlly': return this.isAlly(p) && this.isAdjacent(p);
      case 'adjacentFoe': case 'randomNormal': return !this.isAlly(p) && this.isAdjacent(p);
      case 'normal': return this.isAdjacent(p);
      default: return p !== this;
    }
  }

  isAlly(pokemon: Pokemon) {
    return this.side === pokemon.side || this.side.ally === pokemon.side;
  }

  isAdjacent(pokemon: Pokemon) {
    if (this.fainted || pokemon.fainted) return false;
    const n = this.side.active.length;
    if (n <= 2) return this !== pokemon;
    if (this.side === pokemon.side) return Math.abs(this.slot - pokemon.slot) === 1;
    return Math.abs(this.slot + pokemon.slot + 1 - n) <= 1;
  }

  cantUseMove(
    effect: Partial<Effect> & NA,
    move?: Partial<Move> & NA,
  ) {
    this.clearMovestatuses();
    this.activateAbility(effect);
    if (move?.id) this.rememberMove(move.name, 0);
    switch (effect.id) {
      case 'slp': {
        if (this.side.battle.gen.num === 1) this.lastMove = '';
        return void this.statusState.sleepTurns++;
      }
      case 'frz': {
        if (this.side.battle.gen.num === 1) this.lastMove = '';
        return;
      }
      case 'focuspunch': return this.removeVolatile('focuspunch' as ID);
      case 'shelltrap': return this.removeVolatile('shelltrap' as ID);
      case 'flinch': return this.removeVolatile('focuspunch' as ID);
    }
  }

  activateAbility(effectOrName?: {kind: DataKind; name: string} | string, isNotBase?: boolean) {
    if (!effectOrName) return;
    if (typeof effectOrName !== 'string') {
      if (effectOrName.kind !== 'Ability') return;
      effectOrName = effectOrName.name;
    }
    this.rememberAbility(effectOrName, isNotBase);
  }

  effectiveAbility() {
    if (this.fainted || this.volatiles['gastroacid']) return '' as ID;
    const ability = this.side.battle.gen.abilities.get(this.ability || this.baseAbility || '');
    if (this.side.battle.ngasActive() && !ability?.flags.cantsuppress) return '' as ID;
    return ability?.id || '';
  }

  rememberAbility(ability: string, isNotBase?: boolean) {
    this.ability = this.side.battle.get('abilities', ability).id;
    // a transformed Pokemon shows the ability it copied, not its own
    if (!this.baseAbility && !isNotBase && !this.volatiles.transform) {
      this.baseAbility = this.ability;
    }
  }

  copyTypesFrom(pokemon: Pokemon, preterastallized = false) {
    const apparentType =
      (preterastallized ? pokemon.actualTypes(pokemon.species.types) : pokemon.types).join('/');
    this.addVolatile('typechange' as ID, {apparentType});
    if (pokemon.addedType) {
      this.addVolatile('typeadd' as ID, {type: pokemon.addedType});
    } else {
      this.removeVolatile('typeadd' as ID);
    }
  }

  isGrounded() {
    const battle = this.side.battle;
    if (battle.field.hasPseudoWeather('gravity' as ID)) {
      return true;
    } else if (this.volatiles['ingrain'] && battle.gen.num >= 4) {
      return true;
    } else if (this.volatiles['smackdown']) {
      return true;
    }

    let item = this.item;
    const ability = this.effectiveAbility();
    if (battle.field.hasPseudoWeather('magicroom' as ID) ||
      this.volatiles['embargo'] ||
      ability === 'klutz'
    ) {
      item = '';
    }

    if (item === 'ironball') return true;
    if (ability === 'levitate') return false;
    if (this.volatiles['magnetrise'] || this.volatiles['telekinesis']) return false;
    if (item === 'airballoon') return false;
    return !(this.types.includes('Flying') || this.addedType === 'Flying');
  }

  // Returns [min, max] damage dealt as a proportion of total HP from 0 to 1
  static getDamageRange(
    damage: [delta: number, denominator: number, oldnum: number, oldcolor: HPColor | ''],
    hpcolor: HPColor
  ): [number, number] {
    if (damage[1] !== 48) {
      const ratio = damage[0] / damage[1];
      return [ratio, ratio];
    }
    // pixel damage
    let oldrange = Pokemon.getPixelRange(damage[2], damage[3]);
    let newrange = Pokemon.getPixelRange(damage[2] + damage[0], hpcolor);
    if (damage[0] === 0) {
      // no change in displayed pixel width
      return [0, newrange[1] - newrange[0]];
    }
    if (oldrange[0] < newrange[0]) { // swap order
      const r = oldrange;
      oldrange = newrange;
      newrange = r;
    }
    return [oldrange[0] - newrange[1], oldrange[1] - newrange[0]];
  }

  static getPixelRange(pixels: number, color: HPColor | ''): [number, number] {
    const epsilon = 0.5 / 714;

    if (pixels === 0) return [0, 0];
    if (pixels === 1) return [0 + epsilon, 2 / 48 - epsilon];
    if (pixels === 9) {
      if (color === 'y') { // ratio is > 0.2
        return [0.2 + epsilon, 10 / 48 - epsilon];
      } else if (color === 'r') { // ratio is <= 0.2
        return [9 / 48, 0.2];
      }
    }
    if (pixels === 24) {
      if (color === 'g') { // ratio is > 0.5
        return [0.5 + epsilon, 25 / 48 - epsilon];
      } else if (color === 'y') { // ratio is exactly 0.5
        return [0.5, 0.5];
      }
    }
    if (pixels === 48) return [1, 1];

    return [pixels / 48, (pixels + 1) / 48 - epsilon];
  }

  static getFormattedRange(range: [number, number], precision: number, separator: string) {
    if (range[0] === range[1]) {
      const percentage = Math.abs(range[0] * 100);
      if (Math.floor(percentage) === percentage) {
        return percentage + '%';
      }
      return percentage.toFixed(precision) + '%';
    }
    let lower;
    let upper;
    if (precision === 0) {
      lower = Math.floor(range[0] * 100);
      upper = Math.ceil(range[1] * 100);
    } else {
      lower = (range[0] * 100).toFixed(precision);
      upper = (range[1] * 100).toFixed(precision);
    }
    return '' + lower + separator + upper + '%';
  }

  reset() {
    this.clearVolatile();
    this.hp = this.maxhp;
    this.fainted = false;
    this.status = undefined;
    this.moveSlots = [];
    this.name = this.name || this.baseSpeciesForme;
  }

  /** A copy of this Pokémon and its battle. `memo` maps each original to its copy. */
  clone(memo: CloneMemo = new Map()): this {
    const copied = memo.get(this);
    if (copied) return copied as this;
    const pokemon = Object.create(Object.getPrototypeOf(this));
    memo.set(this, pokemon);
    pokemon.side = this.side.clone(memo);
    pokemon.set = copy(this.set, memo);
    pokemon.slot = this.slot;
    pokemon.baseSpeciesForme = this.baseSpeciesForme;
    pokemon.details = this.details;
    pokemon.name = this.name;
    pokemon.level = this.level;
    pokemon.shiny = this.shiny;
    pokemon.gender = this.gender;
    pokemon.originalIdent = this.originalIdent;
    pokemon.searchid = this.searchid;
    pokemon.hp = this.hp;
    pokemon.maxhp = this.maxhp;
    pokemon.baseMaxhp = this.baseMaxhp;
    pokemon.hpcolor = this.hpcolor;
    pokemon.status = this.status;
    pokemon.fainted = this.fainted;
    pokemon.newlySwitched = this.newlySwitched;
    pokemon.beingCalledBack = this.beingCalledBack;
    pokemon.statusStage = this.statusStage;
    pokemon.statusState = copy(this.statusState, memo);
    pokemon.boosts = copy(this.boosts, memo);
    pokemon.volatiles = copy(this.volatiles, memo);
    pokemon.ability = this.ability;
    pokemon.baseAbility = this.baseAbility;
    pokemon.illusion = copy(this.illusion, memo);
    pokemon.revealedDetails = this.revealedDetails;
    pokemon.item = this.item;
    pokemon.itemEffect = this.itemEffect;
    pokemon.lastItem = this.lastItem;
    pokemon.lastItemEffect = this.lastItemEffect;
    pokemon.teamPreviewItem = this.teamPreviewItem;
    pokemon.nature = this.nature;
    pokemon.hpType = this.hpType;
    pokemon.terastallized = this.terastallized;
    pokemon.moveSlots = copy(this.moveSlots, memo);
    pokemon.maxMoves = copy(this.maxMoves, memo);
    pokemon.zMoves = copy(this.zMoves, memo);
    pokemon.canDynamax = this.canDynamax;
    pokemon.canGigantamax = this.canGigantamax;
    pokemon.canMegaEvo = this.canMegaEvo;
    pokemon.canUltraBurst = this.canUltraBurst;
    pokemon.canTerastallize = this.canTerastallize;
    pokemon.trapped = this.trapped;
    pokemon.maybeTrapped = this.maybeTrapped;
    pokemon.maybeDisabled = this.maybeDisabled;
    pokemon.lastMove = this.lastMove;
    pokemon.lastMoveTargetLoc = this.lastMoveTargetLoc;
    pokemon.moveThisTurn = this.moveThisTurn;
    pokemon.hurtThisTurn = this.hurtThisTurn;
    pokemon.movesUsedWhileActive = copy(this.movesUsedWhileActive, memo);
    pokemon.timesAttacked = this.timesAttacked;
    // never changed once taken, so copies can share it
    pokemon.switchInState = this.switchInState;
    POKEMON_FIELDS ??= new Set(Object.keys(pokemon));
    copyRest(this, pokemon, POKEMON_FIELDS, memo);
    return pokemon;
  }

  destroy() {
    // @ts-ignore readonly
    this.side = null!;
  }
}

// The fields Pokemon#clone copies by name, read off its first copy
let POKEMON_FIELDS: Set<string> | undefined;

cloneable(Pokemon);
