# @catton/stable-swap

## Project structure

-   `contracts` - source code of all the smart contracts of the project and their dependencies.
-   `wrappers` - wrapper classes (implementing `Contract` from ton-core) for the contracts, including any [de]serialization primitives and compilation functions.
-   `tests` - tests for the contracts.
-   `scripts` - scripts used by the project, mainly the deployment scripts.

## Contract Futures

- :white_check_mark: gem_pool: Stake LP to earn Catton GEM
- :white_check_mark: stable_swap_factory: Permissionless Liquidity Pool
- :white_check_mark: stable_swap: Plain Pools
- :white_large_square: stable_swap: Lending Pools
- :white_large_square: stable_swap: Metapools
- :white_large_square: stable_swap: SwapRouter

## How to use

### Test

```sh
npm test tests/max_gas_plain_pool.spec.ts > out.log
```
```sh
npm test tests/max_gas_gem_pool.spec.ts > out.log
```

### Deploy or run another script

`npm start`