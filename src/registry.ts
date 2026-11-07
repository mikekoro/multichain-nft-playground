import type { NftType } from './types';
import { xrplTypes } from './types/xrpl';
import { evmTypes } from './types/evm';
import { solanaTypes } from './types/solana';
import { sorobanTypes } from './types/soroban';

export const TYPES: NftType[] = [...xrplTypes, ...evmTypes, ...solanaTypes, ...sorobanTypes];
export const typeOf = (key: string) => TYPES.find((t) => t.key === key);
