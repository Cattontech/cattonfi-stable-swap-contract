import {compile} from '@ton/blueprint'
import {Address, beginCell, Cell, ContractProvider} from '@ton/core'
import {BaseContract} from '../common'

export class ContractUtils extends BaseContract {
  static async compile() {
    const code = await compile('test/contract_utils')
    const data = beginCell().storeMaybeRef().endCell()
    return new ContractUtils({code, data: data})
  }

  static fromAddress(address: Address) {
    return new ContractUtils(address)
  }

  static msgInvoke(op: number) {
    return beginCell().storeUint(op, 32).endCell()
  }

  async getChainConfigParam(provider: ContractProvider) {
    const res = await provider.get('get_chain_config_param', [])
    return {
      lum_price: res.stack.readBigNumber(),
      bit_price: res.stack.readBigNumber(),
      cell_price: res.stack.readBigNumber(),
      ihr_price_factor: res.stack.readBigNumber(),
      first_frac: res.stack.readBigNumber(),
      next_frac: res.stack.readBigNumber(),

      bit_price_ps: res.stack.readBigNumber(),
      cell_price_ps: res.stack.readBigNumber(),
      mc_bit_price_ps: res.stack.readBigNumber(),
      mc_cell_price_ps: res.stack.readBigNumber(),
    }
  }

  async getDataSize(provider: ContractProvider, data: Cell) {
    const res = await provider.get('get_data_size', [{type: 'cell', cell: data}])
    return {
      cells: res.stack.readBigNumber(),
      bits: res.stack.readBigNumber(),
    }
  }

  async getFeeStorage(provider: ContractProvider, cells: bigint, bits: bigint, sec: bigint) {
    const res = await provider.get('fee_storage', [
      {type: 'int', value: cells},
      {type: 'int', value: bits},
      {type: 'int', value: sec},
    ])
    return res.stack.readBigNumber()
  }
}
