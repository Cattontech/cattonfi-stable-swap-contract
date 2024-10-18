import {compile} from '@ton/blueprint'
import {Address, Cell} from '@ton/core'
import {GemPool} from '../wrappers'

let gem_pool_code: Cell
let gem_buffer_code: Cell
export async function getGemFarmCodes() {
  if (!gem_pool_code || !gem_buffer_code) {
    gem_pool_code = await compile('farm/gem_pool')
    gem_buffer_code = await compile('farm/gem_buffer')
  }
  return {
    gem_pool_code,
    gem_buffer_code,
  }
}

export async function getGemPool(args: {serial: number; admin: Address; coin: Address}) {
  const {gem_pool_code, gem_buffer_code} = await getGemFarmCodes()
  const init_state = GemPool.packInitState({
    serial: args.serial,
    admin: args.admin,
    coin: args.coin,
    buffer_code: gem_buffer_code,
  })
  return new GemPool({code: gem_pool_code, data: init_state})
}
