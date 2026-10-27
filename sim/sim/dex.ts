import * as Utils from '../lib/utils';
import {Condition, DexConditions} from './dex-conditions';
import {DataMove, DexMoves} from './dex-moves';
import {Item, DexItems} from './dex-items';
import {Ability, DexAbilities} from './dex-abilities';
import {Species, DexSpecies, DexLearnsets, ModdedLearnsetData} from './dex-species';
import {Format, FormatList, DexFormats, RuleTable} from './dex-formats';
import {DexText} from './dex-text';
import {Aliases} from '../data/aliases';
import {Tags} from '../data/tags';
import {
	AbilityText,
	ActiveMove,
	AnyObject,
	DefaultText,
	ID,
	IDEntry,
	ItemText,
	ModdedBattleScriptsData,
	Move,
	MoveText,
	ResolvedAbilityText,
	ResolvedItemText,
	ResolvedMoveText,
	ResolvedSpeciesText,
	ResolvedTagText,
	ResolvedText,
	SpeciesText,
	StatsTable,
	TranslationString,
} from './exported-global-types';

import * as gen1 from '../data/mods/gen1';
import * as gen2 from '../data/mods/gen2';
import * as gen3 from '../data/mods/gen3';
import * as gen4 from '../data/mods/gen4';
import * as gen5 from '../data/mods/gen5';
import * as gen6 from '../data/mods/gen6';
import * as gen7 from '../data/mods/gen7';
import * as gen8 from '../data/mods/gen8';
import * as gen8bdsp from '../data/mods/gen8bdsp';
import * as gen8legends from '../data/mods/gen8legends';
import * as gen9 from '../data';

import * as formats9 from '../data/formats-data';

import * as learn2 from '../data/mods/gen2/learnsets';
import * as learn6 from '../data/mods/gen6/learnsets';
import * as learn8 from '../data/mods/gen8/learnsets';
import * as learn8bdsp from '../data/mods/gen8bdsp/learnsets';
import * as learn8legends from '../data/mods/gen8legends/learnsets';
import * as learn9 from '../data/learnsets';

import * as pokemongo from '../data/pokemongo';

import * as legality2 from '../data/mods/gen2/legality';
import * as legality6 from '../data/mods/gen6/legality';
import * as legality8 from '../data/mods/gen8/legality';
import * as legality8bdsp from '../data/mods/gen8bdsp/legality';
import * as legality8legends from '../data/mods/gen8legends/legality';
import * as legality9 from '../data/legality';

import * as Data from './dex-data';
import {type ModdedEffectText, type OtherNameTable, type TextLanguage} from './dex-data';

const BASE_MOD = 'gen9' as ID;

const LEARN_ORDER = 'MTLREVDSC';
interface Learnsets {[k: string]: ModdedLearnsetData}
function merge(learnsets: {Learnsets: Learnsets}, legality: {Legality: Learnsets}) {
	const merged: {Learnsets: Learnsets} = {...learnsets};
	for (const id in legality.Legality) {
		for (const key in legality.Legality[id]) {
			if (key === 'learnset') {
				for (const moveid in legality.Legality[id][key]) {
					const special = legality.Legality[id][key]![moveid];
					// import guarantees {id: {learnsets: {}}} exists in learnsets iff it exists in legality
					const existing = merged.Learnsets[id][key]!;
					if (existing[moveid]) {
						existing[moveid].push(...special);
						existing[moveid].sort((a, b) =>
							+b.charAt(0) - +a.charAt(0) ||
							LEARN_ORDER.indexOf(a.charAt(1)) - LEARN_ORDER.indexOf(b.charAt(1)));
					} else {
						existing[moveid] = special;
					}
				}
			} else {
				// @ts-ignore
				merged.Learnsets[id][key] = legality.Legality[id][key];
			}
		}
	}
	return merged;
}

const dexData = {
	gen1, gen2: {...gen2, ...merge(learn2, legality2)}, gen3,
	gen4, gen5, gen6: {...gen6, ...merge(learn6, legality6)},
	gen7, gen8: {...gen8, ...merge(learn8, legality8)},
	gen8bdsp: {...gen8bdsp, ...merge(learn8bdsp, legality8bdsp)},
	gen8legends: {...gen8legends, ...merge(learn8legends, legality8legends)},
	gen9: {...gen9, ...formats9, ...pokemongo, ...merge(learn9, legality9)},
};

const dexes: {[mod: string]: ModdedDex} = Object.create(null);

const DATA_TYPES = [
	'Abilities', 'Rulesets', 'FormatsData', 'Items', 'Learnsets', 'Moves',
	'Natures', 'Pokedex', 'Scripts', 'Conditions', 'TypeChart', 'PokemonGoData',
] as const;
type DataType = typeof DATA_TYPES[number];

/** Unfortunately we do for..in too much to want to deal with the casts */
export interface DexTable<T> {[id: string]: T}
export interface AliasesTable {[id: IDEntry]: string}

interface DexTableData {
	Abilities: DexTable<import('./dex-abilities').AbilityData>;
	Rulesets: DexTable<import('./dex-formats').FormatData>;
	Items: DexTable<import('./dex-items').ItemData>;
	Learnsets: DexTable<import('./dex-species').LearnsetData>;
	Moves: DexTable<import('./dex-moves').MoveData>;
	Natures: DexTable<import('./dex-data').NatureData>;
	Pokedex: DexTable<import('./dex-species').SpeciesData>;
	FormatsData: DexTable<import('./dex-species').SpeciesFormatsData>;
	PokemonGoData: DexTable<import('./dex-species').PokemonGoData>;
	Conditions: DexTable<import('./dex-conditions').ConditionData>;
	TypeChart: DexTable<import('./dex-data').TypeData>;

	Scripts: ModdedBattleScriptsData; // NB: Not a DexTable, but PS is dumb AF

	Species: DexTable<import('./dex-species').SpeciesData>;
	Types: DexTable<import('./dex-data').TypeData>;
}

interface TextTableData extends Record<OtherNameTable, DexTable<string>> {
	Abilities: DexTable<ResolvedAbilityText>;
	Items: DexTable<ResolvedItemText>;
	Moves: DexTable<ResolvedMoveText>;
	Pokedex: DexTable<ResolvedSpeciesText>;
	Tags: DexTable<ResolvedTagText>;
	Default: DexTable<DefaultText>;
}

type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends Array<infer U>
		? Array<DeepPartial<U>>
		: T[P] extends ReadonlyArray<infer V>
			? ReadonlyArray<DeepPartial<V>>
			: DeepPartial<T[P]>
};

export type ModData = DeepPartial<ModdedDex['data']>;

export const toID = Data.toID;

export class ModdedDex {
	readonly Data = Data;
	readonly Condition = Condition;
	readonly Ability = Ability;
	readonly Item = Item;
	readonly Move = DataMove;
	readonly Species = Species;
	readonly Format = Format;
	readonly ModdedDex = ModdedDex;

	readonly name = "[ModdedDex]";
	readonly isBase: boolean;
	readonly currentMod: string;

	readonly toID = Data.toID;

	readonly formats: DexFormats;
	readonly abilities: DexAbilities;
	readonly items: DexItems;
	readonly moves: DexMoves;
	readonly species: DexSpecies;
	readonly learnsets: DexLearnsets;
	readonly conditions: DexConditions;
	readonly text: DexText;
	readonly natures: Data.DexNatures;
	readonly types: Data.DexTypes;
	readonly stats: Data.DexStats;
	readonly aliases: Map<ID, ID> | null = null;

	gen = 0;
	parentMod = '';
	modsLoaded = false;

	dataCache: DexTableData | null;
	textCache: {[lang: string]: TextTableData | null | undefined};

	deepClone = Utils.deepClone;
	deepFreeze = Utils.deepFreeze;
	Multiset = Utils.Multiset;

	constructor(mod = 'base') {
		this.isBase = (mod === 'base');
		this.currentMod = mod;

		this.dataCache = null;
		this.textCache = {};

		this.formats = new DexFormats(this);
		this.abilities = new DexAbilities(this);
		this.items = new DexItems(this);
		this.moves = new DexMoves(this);
		this.species = new DexSpecies(this);
		this.learnsets = new DexLearnsets(this);
		this.conditions = new DexConditions(this);
		this.text = new DexText(this);
		this.natures = new Data.DexNatures(this);
		this.types = new Data.DexTypes(this);
		this.stats = new Data.DexStats(this);
	}

	get modid() {
		return this.currentMod as ID;
	}

	get data(): DexTableData {
		return this.loadData();
	}

	get dexes(): {[mod: string]: ModdedDex} {
		return dexes;
	}

	mod(mod: string | undefined, modData?: DeepPartial<ModdedDex['data']> & {Formats?: FormatList}): ModdedDex {
		if (!mod) return dexes['base'];
		const modid = toID(mod);
		if (modData?.Types && !modData.TypeChart) modData.TypeChart = modData.Types;
		if (modData?.Species && !modData.Pokedex) modData.Pokedex = modData.Species;
		const dex = (modid in dexes) && !modData ? dexes[modid] : new ModdedDex(modid);
		dex.loadData(modData);
		if (!(modid in dexes)) dexes[modid] = dex;
		if (modData?.Formats) dex.formats.extend(modData?.Formats);
		return dex;
	}

	forGen(gen: number) {
		if (gen < 1 || gen > 9) throw new Error(`Unsupported gen ${gen}`);
		return this.mod(`gen${gen}`);
	}

	forFormat(format: Format | string): ModdedDex {
		const mod = this.formats.get(format).mod;
		return dexes[mod || BASE_MOD].includeData();
	}

	modData(dataType: DataType, id: string) {
		if (dataType === 'Scripts') throw new Error(`'${dataType}' cannot be indexed by '${id}'`);
		if (this.isBase) return this.data[dataType][id];
		if (this.data[dataType][id] !== dexes[this.parentMod].data[dataType][id]) return this.data[dataType][id];
		return (this.data[dataType][id] = Utils.deepClone(this.data[dataType][id]));
	}

	effectToString() {
		return this.name;
	}

	/**
	 * Sanitizes a username or Pokemon nickname
	 *
	 * Returns the passed name, sanitized for safe use as a name in the PS
	 * protocol.
	 *
	 * Such a string must uphold these guarantees:
	 * - must not contain any ASCII whitespace character other than a space
	 * - must not start or end with a space character
	 * - must not contain any of: | , [ ]
	 * - must not be the empty string
	 * - must not contain Unicode RTL control characters
	 *
	 * If no such string can be found, returns the empty string. Calling
	 * functions are expected to check for that condition and deal with it
	 * accordingly.
	 *
	 * getName also enforces that there are not multiple consecutive space
	 * characters in the name, although this is not strictly necessary for
	 * safety.
	 */
	getName(name: any): string {
		if (typeof name !== 'string' && typeof name !== 'number') return '';
		name = ('' + name).replace(/[|\s[\],\u202e]+/g, ' ').trim();
		if (name.length > 18) name = name.substr(0, 18).trim();

		// remove zalgo
		name = name.replace(
			/[\u0300-\u036f\u0483-\u0489\u0610-\u0615\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06ED\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]{3,}/g,
			''
		);
		name = name.replace(/[\u239b-\u23b9]/g, '');

		return name;
	}

	/**
	 * Returns false if the target is immune; true otherwise.
	 * Also checks immunity to some statuses.
	 */
	getImmunity(
		source: {type: string} | string,
		target: {getTypes: () => string[]} | {types: string[]} | string[] | string
	): boolean {
		const sourceType: string = typeof source !== 'string' ? source.type : source;
		// @ts-ignore
		const targetTyping: string[] | string = target.getTypes?.() || target.types || target;
		if (Array.isArray(targetTyping)) {
			for (const type of targetTyping) {
				if (!this.getImmunity(sourceType, type)) return false;
			}
			return true;
		}
		const typeData = this.types.get(targetTyping);
		if (typeData?.damageTaken[sourceType] === 3) return false;
		return true;
	}

	getEffectiveness(
		source: {type: string} | string,
		target: {getTypes: () => string[]} | {types: string[]} | string[] | string
	): number {
		const sourceType: string = typeof source !== 'string' ? source.type : source;
		// @ts-ignore
		const targetTyping: string[] | string = target.getTypes?.() || target.types || target;
		let totalTypeMod = 0;
		if (Array.isArray(targetTyping)) {
			for (const type of targetTyping) {
				totalTypeMod += this.getEffectiveness(sourceType, type);
			}
			return totalTypeMod;
		}
		const typeData = this.types.get(targetTyping);
		if (!typeData) return 0;
		switch (typeData.damageTaken[sourceType]) {
		case 1: return 1; // super-effective
		case 2: return -1; // resist
		// in case of weird situations like Gravity, immunity is handled elsewhere
		default: return 0;
		}
	}

	/**
	 * Pokémon Showdown no longer includes descriptions on effects (they must instead be looked up via
	 * `Dex#text`), but @pkmn/sim continues to include them for compatibility with @pkmn/dex.
	 */
	getDescs(table: 'Abilities' | 'Items' | 'Moves', id: ID, dataEntry: ModdedEffectText) {
		if (dataEntry.desc !== undefined || dataEntry.shortDesc !== undefined) {
			const desc = dataEntry.desc || dataEntry.shortDesc || '';
			const shortDesc = dataEntry.shortDesc || dataEntry.desc || '';
			return {desc, shortDesc};
		}
		const entry = DexText.loadRawTextData()[table][id];
		if (!entry) return {desc: '', shortDesc: ''};
		const desc = this.resolveTextField(undefined, entry, 'desc');
		const shortDesc = this.resolveTextField(undefined, entry, 'shortDesc');
		return {desc: desc || shortDesc, shortDesc: shortDesc || desc};
	}

	isTagged(thing: Species | Move | Item | Ability, tagName: string) {
		const tag = Tags[toID(tagName)];
		if (!tag) return undefined;
		if (thing.effectType === 'Pokemon') {
			return !!(tag.speciesFilter || tag.genericFilter)?.(thing);
		}
		if (thing.effectType === 'Move') {
			return !!(tag.moveFilter || tag.genericFilter)?.(thing);
		}
		return !!tag.genericFilter?.(thing);
	}

	/**
	 * Ensure we're working on a copy of a move (and make a copy if we aren't)
	 *
	 * Remember: "ensure" - by default, it won't make a copy of a copy:
	 *     moveCopy === Dex.getActiveMove(moveCopy)
	 *
	 * If you really want to, use:
	 *     moveCopyCopy = Dex.getActiveMove(moveCopy.id)
	 */
	getActiveMove(move: Move | string): ActiveMove {
		if (move && typeof (move as ActiveMove).hit === 'number') return move as ActiveMove;
		move = this.moves.get(move);
		const moveCopy: ActiveMove = Utils.deepClone(move);
		moveCopy.hit = 0;
		return moveCopy;
	}

	getHiddenPower(ivs: StatsTable) {
		const hpTypes = [
			'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel',
			'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark',
		];
		const tr = this.trunc;
		const stats = {hp: 31, atk: 31, def: 31, spe: 31, spa: 31, spd: 31};
		if (this.gen <= 2) {
			// Gen 2 specific Hidden Power check. IVs are still treated 0-31 so we get them 0-15
			const atkDV = tr(ivs.atk / 2);
			const defDV = tr(ivs.def / 2);
			const speDV = tr(ivs.spe / 2);
			const spcDV = tr(ivs.spa / 2);
			return {
				type: hpTypes[4 * (atkDV % 4) + (defDV % 4)],
				power: tr(
					(5 * ((spcDV >> 3) + (2 * (speDV >> 3)) + (4 * (defDV >> 3)) + (8 * (atkDV >> 3))) + (spcDV % 4)) / 2 + 31
				),
			};
		} else {
			// Hidden Power check for Gen 3 onwards
			let hpTypeX = 0;
			let hpPowerX = 0;
			let i = 1;
			for (const s in stats) {
				hpTypeX += i * (ivs[s as StatID] % 2);
				hpPowerX += i * (tr(ivs[s as StatID] / 2) % 2);
				i *= 2;
			}
			return {
				type: hpTypes[tr(hpTypeX * 15 / 63)],
				// After Gen 6, Hidden Power is always 60 base power
				power: (this.gen && this.gen < 6) ? tr(hpPowerX * 40 / 63) + 30 : 60,
			};
		}
	}

	/**
	 * Truncate a number into an unsigned 32-bit integer, for
	 * compatibility with the cartridge games' math systems.
	 */
	trunc(num: number, bits = 0) {
		if (bits) return (num >>> 0) % (2 ** bits);
		return num >>> 0;
	}

	loadDataFile(
		mod: string,
		dataType: DataType,
		modData?: DeepPartial<ModdedDex['data']>
	): AnyObject | void {
		if (modData) return modData[dataType];
		return (dexData as any)[mod === 'base' ? BASE_MOD : mod][dataType];
	}

	loadTextFile(
		name: string, exportName: string, optional = false
	): DexTable<MoveText | ItemText | AbilityText | TranslationString> {
		return DexText.loadTextFile(name, exportName, optional);
	}

	loadTextData(lang: TextLanguage = 'en'): TextTableData {
		if (!this.gen) this.loadData();
		lang ||= 'en';
		const cacheKey = `${this.currentMod}:${lang}`;
		const cached = dexes['base'].textCache[cacheKey];
		if (cached) return cached;

		const englishData = DexText.loadRawTextData();
		const localizedData = lang === 'en' ? englishData : DexText.loadRawTextData(lang);
		return (dexes['base'].textCache[cacheKey] = {
			Pokedex: this.resolvePokedexTable(englishData.Pokedex, localizedData.Pokedex),
			Tags: DexText.resolveTagsTable(englishData.Tags, localizedData.Tags),
			Moves: this.resolveTextTable(englishData.Moves, localizedData.Moves),
			Abilities: this.resolveTextTable(englishData.Abilities, localizedData.Abilities),
			Items: this.resolveTextTable(englishData.Items, localizedData.Items),
			Default: localizedData.Default,
			...DexText.resolveOtherNameTables(englishData, localizedData),
		});
	}

	private resolvePokedexTable(
		englishTable: DexTable<SpeciesText>, localizedTable: DexTable<SpeciesText>
	): DexTable<ResolvedSpeciesText> {
		const FIELDS = ['name', 'baseSpecies', 'forme', 'grammar'] as const;
		const mergeEntry = (english?: SpeciesText, localized?: SpeciesText) => {
			const entry: Partial<ResolvedSpeciesText> = {};
			for (const field of FIELDS) {
				const value = localized?.[field] ?? english?.[field];
				if (value) entry[field] = value;
			}
			return entry;
		};
		const mergedTable: DexTable<Partial<ResolvedSpeciesText>> = {};
		for (const id in englishTable) {
			mergedTable[id] = mergeEntry(englishTable[id], localizedTable[id]);
		}
		for (const id in localizedTable) {
			if (!(id in englishTable)) mergedTable[id] = mergeEntry(undefined, localizedTable[id]);
		}

		const table: DexTable<ResolvedSpeciesText> = {};
		for (const id in mergedTable) {
			const entry = mergedTable[id];
			const species = this.species.get(id);
			const baseEntry = mergedTable[toID(species.baseSpecies)];
			table[id] = {
				...entry,
				name: entry.name || species.name,
				baseSpecies: baseEntry?.baseSpecies ?? baseEntry?.name ?? species.baseSpecies,
			};
		}
		return table;
	}

	private resolveTextTable<T extends AbilityText | ItemText | MoveText>(
		englishTable: DexTable<T>, localizedTable: DexTable<T>
	): DexTable<ResolvedText<T>> {
		const table: DexTable<ResolvedText<T>> = {};
		for (const id in englishTable) {
			const englishEntry = englishTable[id];
			const localizedEntry = localizedTable[id];
			const desc = this.resolveTextField(localizedEntry, englishEntry, 'desc');
			const shortDesc = this.resolveTextField(localizedEntry, englishEntry, 'shortDesc');
			table[id] = {
				...(localizedEntry || englishEntry),
				name: localizedEntry?.name ?? englishEntry.name,
				desc: desc || shortDesc,
				shortDesc: shortDesc || desc,
			} as ResolvedText<T>;
		}
		return table;
	}

	private resolveTextField<T extends AbilityText | ItemText | MoveText>(
		localizedEntry: T | undefined, englishEntry: T, field: 'desc' | 'shortDesc'
	): string {
		const englishMod = englishEntry[this.currentMod as 'gen1'];
		if (englishMod?.[field]) {
			const localizedMod = localizedEntry?.[this.currentMod as 'gen1'];
			return localizedMod?.[field] || englishMod?.[field];
		}
		for (let gen = this.gen; gen < dexes['base'].gen; gen++) {
			const englishGen = englishEntry[`gen${gen}` as 'gen1'];
			if (!englishGen?.[field]) continue;
			const localizedGen = localizedEntry?.[`gen${gen}` as 'gen1'];
			const desc = localizedGen?.[field] || englishGen?.[field];
			if (desc) return desc;
		}
		return localizedEntry?.[field] || englishEntry[field] || '';
	}

	getAlias(id: ID): ID | undefined {
		return this.loadAliases().get(id);
	}

	loadAliases(): NonNullable<ModdedDex['aliases']> {
		if (!this.isBase) return Dex.loadAliases();
		if (this.aliases) return this.aliases;
		const aliases = new Map<ID, ID>();
		for (const [alias, target] of Object.entries(Aliases)) {
			aliases.set(alias as ID, toID(target));
		}
		(this as any).aliases = aliases satisfies this['aliases'];
		return this.aliases!;
	}

	includeMods(): this {
		return this;
	}

	includeModData(): this {
		for (const mod in this.dexes) {
			dexes[mod].includeData();
		}
		return this;
	}

	includeData(): this {
		this.loadData();
		return this;
	}

	loadData(modData?: DeepPartial<ModdedDex['data']>): DexTableData {
		if (this.dataCache) return this.dataCache;
		const dataCache: {[k in keyof DexTableData]?: any} = {};

		const Scripts = this.loadDataFile(this.currentMod, 'Scripts', modData) || {};
		// We want to inherit most of Scripts but not this.
		const init = Scripts.init;

		this.parentMod = this.isBase ? '' : (Scripts.inherit || 'base');

		let parentDex;
		if (this.parentMod) {
			parentDex = dexes[this.parentMod];
			if (!parentDex || parentDex === this) {
				throw new Error(
					`Unable to load ${this.currentMod}. 'inherit' should specify a parent mod from which to inherit data, or must be not specified.`
				);
			}
		}

		if (!parentDex) {
			// Formats are inherited by mods and used by Rulesets
			this.includeFormats();
		}
		for (const dataType of DATA_TYPES) {
			dataCache[dataType] = this.loadDataFile(this.currentMod, dataType, modData);
			if (dataType === 'Rulesets' && !parentDex) {
				for (const format of this.formats.all()) {
					dataCache.Rulesets[format.id] = {...format, ruleTable: null};
				}
			}
		}
		if (parentDex) {
			for (const dataType of DATA_TYPES) {
				const parentTypedData: any = parentDex.data[dataType];
				if (!dataCache[dataType] && !init) {
					dataCache[dataType] = parentTypedData;
					continue;
				}
				const childTypedData = dataCache[dataType] || (dataCache[dataType] = {});
				for (const entryId in parentTypedData) {
					if (childTypedData[entryId] === null) {
						// null means don't inherit
						delete childTypedData[entryId];
					} else if (!(entryId in childTypedData)) {
						// If it doesn't exist it's inherited from the parent data
						childTypedData[entryId] = parentTypedData[entryId];
					} else if (childTypedData[entryId]?.inherit) {
						// {inherit: true} can be used to modify only parts of the parent data,
						// instead of overwriting entirely
						delete childTypedData[entryId].inherit;

						// {inherit: true} can also be used to inherit parts of conditions
						if (childTypedData[entryId].condition?.inherit) {
							delete childTypedData[entryId].condition.inherit;
							childTypedData[entryId].condition = {
								...parentTypedData[entryId].condition,
								...childTypedData[entryId].condition,
							};
						}

						// Merge parent into children entry, preserving existing childs' properties.
						childTypedData[entryId] = {...parentTypedData[entryId], ...childTypedData[entryId]};
					}
				}
			}
		}

		// Flag the generation. Required for team validator.
		this.gen = dataCache.Scripts.gen;
		if (!this.gen) throw new Error(`Mod ${this.currentMod} needs a generation number in scripts.js`);

		dataCache.Types = dataCache.TypeChart;
		dataCache.Species = dataCache.Pokedex;

		this.dataCache = dataCache as DexTableData;

		// Execute initialization script.
		if (init) init.call(this);

		// effects aren't constructed until they're first looked up, so add their callback names now
		const types = ['Abilities', 'Items', 'Moves', 'Conditions', 'Pokedex', 'Rulesets'] as const;
		for (const dataType of types) {
			const table = dataCache[dataType];
			// the parent dex already added these
			if (table === parentDex?.data[dataType]) continue;
			for (const id in table) {
				Data.addDefinedCallbackNames(table[id]);
				if (table[id].condition) Data.addDefinedCallbackNames(table[id].condition);
				if (dataType === 'Pokedex') Data.addDefinedCallbackNames(table[id], Data.speciesCallbackNames);
				if (dataType === 'Rulesets') Data.addDefinedCallbackNames(table[id], Data.formatCallbackNames);
			}
		}

		return this.dataCache;
	}

	includeFormats(): this {
		this.formats.load();
		return this;
	}
}

dexes['base'] = new ModdedDex();
dexes['gen1'] = new ModdedDex('gen1');
dexes['gen2'] = new ModdedDex('gen2');
dexes['gen3'] = new ModdedDex('gen3');
dexes['gen4'] = new ModdedDex('gen4');
dexes['gen5'] = new ModdedDex('gen5');
dexes['gen6'] = new ModdedDex('gen6');
dexes['gen7'] = new ModdedDex('gen7');
dexes['gen8'] = new ModdedDex('gen8');

// required for gen 9 moveset validation
dexes['gen8bdsp'] = new ModdedDex('gen8bdsp');
dexes['gen8legends'] = new ModdedDex('gen8legends');

// "gen9" is an alias for the current base data
dexes[BASE_MOD] = dexes['base'];
dexes['base'].includeModData();

export const Dex = dexes['base'];
export namespace Dex {
	export type Species = import('./dex-species').Species;
	export type Item = import('./dex-items').Item;
	export type Move = import('./dex-moves').Move;
	export type Ability = import('./dex-abilities').Ability;

	export type HitEffect = import('./dex-moves').HitEffect;
	export type SecondaryEffect = import('./dex-moves').SecondaryEffect;
	export type RuleTable = import('./dex-formats').RuleTable;
}
export {RuleTable};
