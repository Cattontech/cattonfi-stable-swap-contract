import {Address, beginCell, ContractProvider} from '@ton/core'
import {BaseContract, CommonOp} from '../common'
import {FarmGemOp} from './constants'

export class GemBuffer extends BaseContract {
  static fromAddress(address: Address) {
    return new GemBuffer(address)
  }

  static msgTopUp() {
    return beginCell().storeUint(CommonOp.top_up, 32).storeUint(0, 64).endCell()
  }

  async getUserData(provider: ContractProvider) {
    const {state} = await provider.getState()
    if (state.type != 'active')
      return {
        pool: null,
        owner: null,
        amount: 0n,
        reward_debt: 0n,
        pending_reward: 0n,
      }
    const res = await provider.get('get_user_data', [])
    return {
      pool: res.stack.readAddress(),
      owner: res.stack.readAddress(),
      amount: res.stack.readBigNumber(),
      reward_debt: res.stack.readBigNumber(),
      pending_reward: res.stack.readBigNumber(),
    }
  }

  async getStakedBalance(provider: ContractProvider) {
    const {amount} = await this.getUserData(provider)
    return amount
  }

  static msgUnstake(args: {
    unstake_amount: bigint
    to: Address
    return_excess: Address
    take_lp: boolean
    uid: bigint
  }) {
    return beginCell()
      .storeUint(FarmGemOp.gem_buffer_unstake, 32)
      .storeUint(0, 64) // query_id
      .storeAddress(args.to)
      .storeAddress(args.return_excess)
      .storeCoins(args.unstake_amount)
      .storeBit(args.take_lp)
      .storeUint(args.uid, 64)
      .endCell()
  }

  static msgUnstakeToLp(args: {unstake_amount: bigint; to: Address; return_excess: Address; uid?: bigint}) {
    return this.msgUnstake({
      unstake_amount: args.unstake_amount,
      to: args.to,
      return_excess: args.return_excess,
      take_lp: true,
      uid: args.uid ?? 0n,
    })
  }

  static msgUnstakeToTokens(args: {unstake_amount: bigint; to: Address; return_excess: Address; uid?: bigint}) {
    return this.msgUnstake({
      unstake_amount: args.unstake_amount,
      to: args.to,
      return_excess: args.return_excess,
      take_lp: false,
      uid: args.uid ?? 0n,
    })
  }

  static msgClaimGem(args: {to: Address; return_excess: Address; uid: bigint}) {
    return this.msgUnstake({
      unstake_amount: 0n,
      to: args.to,
      return_excess: args.return_excess,
      take_lp: false,
      uid: args.uid,
    })
  }
}
