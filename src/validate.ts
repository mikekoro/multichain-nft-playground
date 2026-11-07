// Address checks: each chain's own SDK validator, no hand-rolled regexes. No `@/`, settings or chain imports: the CLI and node --test load it.
import { isValidClassicAddress } from 'xrpl';
import { isAddress } from 'viem';
import { isPublicKey } from '@metaplex-foundation/umi';
import { StrKey } from '@stellar/stellar-sdk';
import type { Chain } from './pure';

/** Stellar takes an account (G…) or a contract (C…): Soroban NFTs can be held by either. EVM: mixed case must be a valid checksum. */
export const validAddress = (chain: Chain, s: string) => chain === 'xrpl' ? isValidClassicAddress(s) : chain === 'evm' ? isAddress(s)
  : chain === 'solana' ? isPublicKey(s) : StrKey.isValidEd25519PublicKey(s) || StrKey.isValidContract(s);
/** The inline hint for an address field: nothing while it is empty or valid. */
export const addressError = (chain: Chain, s: string) => (s.trim() && !validAddress(chain, s.trim()) ? `not a valid ${chain} address` : undefined);
