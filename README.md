# @catton/stable-swap

## Project structure

-   `contracts` - source code of all the smart contracts of the project and their dependencies.
-   `wrappers` - wrapper classes (implementing `Contract` from ton-core) for the contracts, including any [de]serialization primitives and compilation functions.
-   `tests` - tests for the contracts.
-   `scripts` - scripts used by the project, mainly the deployment scripts.

## How to use

### Build

`npm run build`

### Test

`npm test tests/max_gas_plain_pool.spec.ts > out.log`

### Deploy or run another script

`npm start`