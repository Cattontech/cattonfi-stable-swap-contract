import {Address, beginCell, Cell, ContractProvider} from '@ton/core'
import {BaseContract, Op, packGrams, unpackGrams} from '../common'

export class BufferToken extends BaseContract {
  static fromAddress(address: Address) {
    return new BufferToken(address)
  }

  static msgTopUp() {
    return beginCell().storeUint(Op.top_up, 32).storeUint(0, 64).endCell()
  }

  async getBufferData(provider: ContractProvider) {
    const {state} = await provider.getState()
    if (state.type != 'active') {
      return {
        pool: null,
        owner: null,
        balances: [],
      }
    }
    const res = await provider.get('get_buffer_data', [])
    return {
      pool: res.stack.readAddress(),
      owner: res.stack.readAddress(),
      balances: unpackGrams(res.stack.readCell()),
    }
  }

  static msgBufferAddLiquidity(args: {min_lp: bigint; amounts: bigint[]}) {
    return beginCell()
      .storeUint(Op.buffer_add_liquidity, 32)
      .storeUint(0, 64) // query_id
      .storeCoins(args.min_lp)
      .storeMaybeRef(packGrams(args.amounts))
      .endCell()
  }

  static msgBufferRefundMe() {
    return beginCell()
      .storeUint(Op.buffer_refund_me, 32)
      .storeUint(0, 64) // query_id
      .endCell()
  }
}
