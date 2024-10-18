import {Address, beginCell, Cell, ContractProvider, Transaction} from '@ton/core'
import {BaseContract, JettonMinter, JettonWallet, CommonOp} from '../common'
import {GemBuffer} from './gem_buffer'
import {FarmGemOp} from './constants'

const ACC_REWARD_PRECISION = 10n ** 12n

export class GemPool extends BaseContract {
  static fromAddress(address: Address) {
    return new GemPool(address)
  }

  static packInitState(args: {serial: number; admin: Address; coin: Address; buffer_code: Cell}) {
    return beginCell()
      .storeUint(args.serial, 32)
      .storeAddress(args.admin)
      .storeAddress(args.coin)
      .storeAddress(null) // wallet
      .storeRef(
        beginCell()
          .storeCoins(0) // liquidity_supply
          .storeCoins(0) // reward_per_second
          .storeUint(0, 256) // acc_reward_per_share
          .storeUint(0, 64) // last_reward_time

          .storeCoins(0) // boosted_reward_per_second
          .storeUint(0, 64) // boosted_reward_end_time
          .endCell(),
      )
      .storeRef(args.buffer_code)
      .endCell()
  }

  static msgTopUp() {
    return beginCell().storeUint(CommonOp.top_up, 32).storeUint(0, 64).endCell()
  }

  async getGasFees(provider: ContractProvider) {
    const res = await provider.get('get_gas_fees', [])
    return {
      store_gem_buffer: res.stack.readBigNumber(),
      gem_pool_stake: res.stack.readBigNumber(),
      gem_buffer_claim_gem: res.stack.readBigNumber(),
      gem_buffer_unstake_take_lp: res.stack.readBigNumber(),
      gem_buffer_unstake_take_tokens: res.stack.readBigNumber(),
    }
  }

  async getInfo(provider: ContractProvider) {
    const res = await provider.get('get_gem_pool_data', [])
    return {
      serial: res.stack.readNumber(),
      admin: res.stack.readAddress(),
      coin: res.stack.readAddress(),
      wallet: res.stack.readAddressOpt(),

      liquidity_supply: res.stack.readBigNumber(),
      reward_per_second: res.stack.readBigNumber(),
      acc_reward_per_share: res.stack.readBigNumber(),
      last_reward_time: res.stack.readBigNumber(),

      boosted_reward_per_second: res.stack.readBigNumber(),
      boosted_reward_end_time: res.stack.readBigNumber(),
    }
  }

  static estimatePendingReward(
    poolState: {
      liquidity_supply: bigint
      reward_per_second: bigint
      acc_reward_per_share: bigint
      last_reward_time: bigint

      boosted_reward_per_second: bigint
      boosted_reward_end_time: bigint
    },
    bufferState: {
      amount: bigint
      reward_debt: bigint
      pending_reward: bigint
    },
    timestamp: bigint = 0n,
  ) {
    timestamp = timestamp == 0n ? BigInt(Math.floor(Date.now() / 1000)) : timestamp

    const boosted_time = timestamp <= poolState.boosted_reward_end_time ? timestamp : poolState.boosted_reward_end_time
    const duration = boosted_time > poolState.last_reward_time ? boosted_time - poolState.last_reward_time : 0n
    const boosted = duration * poolState.boosted_reward_per_second

    let _acc_reward_per_share = poolState.acc_reward_per_share
    if (timestamp > poolState.last_reward_time && poolState.liquidity_supply > 0n) {
      const time = timestamp - poolState.last_reward_time
      const reward = time * poolState.reward_per_second
      _acc_reward_per_share += ((reward + boosted) * ACC_REWARD_PRECISION) / poolState.liquidity_supply
    }
    return (
      bufferState.pending_reward +
      (bufferState.amount * _acc_reward_per_share) / ACC_REWARD_PRECISION -
      bufferState.reward_debt
    )
  }

  earnLog(transaction: Transaction) {
    if (transaction.inMessage?.info.type === 'internal' && this.address.equals(transaction.inMessage.info.src)) {
      const ds = transaction.inMessage.body.beginParse()
      const op = ds.remainingBits >= 32 ? ds.loadUint(32) : -1
      if (op == FarmGemOp.gem_pool_earn) {
        ds.skip(64) // query_id
        const amount = ds.loadCoins()
        const uid = ds.loadUint(64)
        const owner = ds.loadAddress()
        const return_excess = ds.loadAddress()
        return {amount, uid, owner, return_excess}
      }
    }
    return null
  }

  exportEarnLogs(transactions: Transaction[]) {
    return transactions.map(this.earnLog.bind(this)).filter((val) => val)
  }

  async getMsgStakeLp(
    provider: ContractProvider,
    sender: Address,
    fw_ton_amount: bigint,
    args: {
      lpMinter: Address
      stakeAmount: bigint
      recipient?: Address
    },
  ) {
    const lpMinter = provider.open(JettonMinter.fromAddress(args.lpMinter))
    const senderLiquidity = await lpMinter.getWalletAddress(sender)
    return {
      body: JettonWallet.msgTransfer({
        amount: args.stakeAmount,
        to: this.address,
        response: sender,
        forward_ton_amount: fw_ton_amount,
        forward_payload: GemPool.msgStake({
          recipient: args.recipient ?? sender,
          return_excess: sender,
        }),
      }),
      senderWallet: provider.open(JettonWallet.fromAddress(senderLiquidity)),
    }
  }

  async getMsgUnstakeToLp(
    provider: ContractProvider,
    sender: Address,
    args: {unstake_amount: bigint; to?: Address; uid?: bigint},
  ) {
    const senderGemBuffer = await this.getGemBuffer(provider, sender)
    return {
      body: GemBuffer.msgUnstakeToLp({
        unstake_amount: args.unstake_amount,
        to: args.to ?? sender,
        return_excess: sender,
        uid: args.uid,
      }),
      senderGemBuffer,
    }
  }

  async getMsgUnstakeToTokens(
    provider: ContractProvider,
    sender: Address,
    args: {unstake_amount: bigint; to?: Address; uid?: bigint},
  ) {
    const senderGemBuffer = await this.getGemBuffer(provider, sender)
    return {
      body: GemBuffer.msgUnstakeToTokens({
        unstake_amount: args.unstake_amount,
        to: args.to ?? sender,
        return_excess: sender,
        uid: args.uid,
      }),
      senderGemBuffer,
    }
  }

  async getMsgClaimGem(provider: ContractProvider, sender: Address, args: {to?: Address; uid: bigint}) {
    const senderGemBuffer = await this.getGemBuffer(provider, sender)
    return {
      body: GemBuffer.msgClaimGem({
        to: args.to ?? sender,
        return_excess: sender,
        uid: args.uid,
      }),
      senderGemBuffer,
    }
  }

  async getGemBufferAddress(provider: ContractProvider, owner: Address) {
    const res = await provider.get('get_gem_buffer_address', [
      {
        type: 'slice',
        cell: beginCell().storeAddress(owner).endCell(),
      },
    ])
    return res.stack.readAddress()
  }

  async getGemBuffer(provider: ContractProvider, owner: Address) {
    const userAddr = await this.getGemBufferAddress(provider, owner)
    return provider.open(GemBuffer.fromAddress(userAddr))
  }

  static msgStake(args: {recipient: Address; return_excess: Address}) {
    return beginCell()
      .storeUint(FarmGemOp.gem_pool_stake, 32)
      .storeAddress(args.recipient)
      .storeAddress(args.return_excess)
      .endCell()
  }

  static msgInit(args: {
    wallet: Address
    reward_per_second: bigint
    boosted_reward_per_second: bigint
    boosted_reward_end_time: bigint
  }) {
    return beginCell()
      .storeUint(FarmGemOp.gem_pool_init, 32)
      .storeUint(0, 64) // query_id
      .storeAddress(args.wallet)
      .storeCoins(args.reward_per_second)
      .storeCoins(args.boosted_reward_per_second)
      .storeUint(args.boosted_reward_end_time, 64)
      .endCell()
  }

  static msgChangeReward(args: {
    reward_per_second: bigint
    boosted_reward_per_second: bigint
    boosted_reward_end_time: bigint
  }) {
    return beginCell()
      .storeUint(FarmGemOp.gem_pool_change_reward, 32)
      .storeUint(0, 64) // query_id
      .storeCoins(args.reward_per_second)
      .storeCoins(args.boosted_reward_per_second)
      .storeUint(args.boosted_reward_end_time, 64)
      .endCell()
  }
}
