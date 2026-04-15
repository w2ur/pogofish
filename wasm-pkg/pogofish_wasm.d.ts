/* tslint:disable */
/* eslint-disable */

export function apply_move(state_js: any, move_js: any): any;

export function initial_state(): any;

export function is_terminal(state_js: any, rules_js: any): any;

/**
 * Convenience: check terminal with default LC2(50) rules.
 */
export function is_terminal_default(state_js: any): any;

export function legal_moves(state_js: any): any;

/**
 * Return the state key as a hex string (for repetition detection in JS).
 */
export function state_key(state_js: any): string;

/**
 * Get the winner from a terminal state using default LC2(50) rules.
 * Returns "W", "R", "Draw", or null.
 */
export function winner(state_js: any): any;

/**
 * Get the winner from a terminal state with explicit rules.
 * Returns "W", "R", "Draw", or null.
 */
export function winner_with_rules(state_js: any, rules_js: any): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly apply_move: (a: any, b: any) => [number, number, number];
    readonly initial_state: () => any;
    readonly is_terminal: (a: any, b: any) => any;
    readonly is_terminal_default: (a: any) => any;
    readonly legal_moves: (a: any) => any;
    readonly state_key: (a: any) => [number, number];
    readonly winner: (a: any) => any;
    readonly winner_with_rules: (a: any, b: any) => any;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
