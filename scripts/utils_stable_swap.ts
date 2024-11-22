import {compile} from '@ton/blueprint'
import {Address, Cell} from '@ton/core'
import {parseFee, StableSwapFactory} from '../wrappers'

let factory_code: Cell
let pool_code: Cell
let buffer_code: Cell
let liquidity_code: Cell
export async function getStableSwapCodes() {
  if (!factory_code || !pool_code || !buffer_code || !liquidity_code) {
    factory_code = await compile('stable_swap_factory/factory')
    pool_code = await compile('plain_pool/pool')
    buffer_code = await compile('liquidity/buffer')
    liquidity_code = await compile('liquidity/liquidity')
  }
  return {
    factory_code,
    pool_code,
    buffer_code,
    liquidity_code,
  }
}

export async function getFactory(admin: Address) {
  const {factory_code, buffer_code, liquidity_code, pool_code} = await getStableSwapCodes()
  const init_state = StableSwapFactory.packInitState({
    admin: admin,
    fee_recipient: admin,
    plain_pool: {
      admin_fee: parseFee(50),
      pool_code,
      buffer_code,
      liquidity_code,
    },
  })
  return new StableSwapFactory({code: factory_code, data: init_state})
}
