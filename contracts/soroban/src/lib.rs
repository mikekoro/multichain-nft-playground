//! PlaygroundNft: OpenZeppelin Soroban NFT (Base + Burnable) with a per-token URI, an owner-only mint,
//! an owner burn out of any holder (like XRPL tfBurnable), and a constructor flag that makes the
//! whole collection soulbound (transfer and transfer_from panic with Error::Soulbound = 300).
#![no_std]
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, String};
use stellar_tokens::non_fungible::{burnable::NonFungibleBurnable, Base, Compose, NonFungibleToken};

#[contracttype]
pub enum DataKey {
    Owner,
    Transferable,
    Uri(u32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    Soulbound = 300,
}

#[contract]
pub struct PlaygroundNft;

fn owner(e: &Env) -> Address {
    e.storage().instance().get(&DataKey::Owner).expect("owner")
}

#[contractimpl]
impl PlaygroundNft {
    pub fn __constructor(e: &Env, name: String, symbol: String, owner: Address, transferable: bool) {
        e.storage().instance().set(&DataKey::Owner, &owner);
        e.storage().instance().set(&DataKey::Transferable, &transferable);
        Base::set_metadata(e, String::from_str(e, ""), name, symbol);
    }

    /// Owner mints the next sequential id to `to`. `uri` is the full metadata URL; "" = no metadata.
    pub fn mint(e: &Env, to: Address, uri: String) -> u32 {
        owner(e).require_auth();
        let id = <Self as NonFungibleToken>::ContractType::mint(e, &to);
        e.storage().persistent().set(&DataKey::Uri(id), &uri);
        id
    }

    /// Owner burns the token out of whoever holds it.
    pub fn owner_burn(e: &Env, token_id: u32) {
        owner(e).require_auth();
        let holder = Base::owner_of(e, token_id);
        Base::update(e, Some(&holder), None, token_id);
        e.storage().persistent().remove(&DataKey::Uri(token_id));
    }

    pub fn transferable(e: &Env) -> bool {
        e.storage().instance().get(&DataKey::Transferable).unwrap_or(true)
    }

    pub fn owner(e: &Env) -> Address {
        owner(e)
    }
}

#[contractimpl(contracttrait)]
impl NonFungibleToken for PlaygroundNft {
    type ContractType = Compose<(Base,)>;

    fn transfer(e: &Env, from: Address, to: Address, token_id: u32) {
        if !Self::transferable(e) {
            panic_with_error!(e, Error::Soulbound);
        }
        Base::transfer(e, &from, &to, token_id);
    }

    fn transfer_from(e: &Env, spender: Address, from: Address, to: Address, token_id: u32) {
        if !Self::transferable(e) {
            panic_with_error!(e, Error::Soulbound);
        }
        Base::transfer_from(e, &spender, &from, &to, token_id);
    }

    fn token_uri(e: &Env, token_id: u32) -> String {
        Base::owner_of(e, token_id); // panics NonExistentToken
        e.storage().persistent().get(&DataKey::Uri(token_id)).unwrap_or(String::from_str(e, ""))
    }
}

#[contractimpl(contracttrait)]
impl NonFungibleBurnable for PlaygroundNft {}
