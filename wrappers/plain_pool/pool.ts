import {Address, beginCell, Cell, ContractProvider, OpenedContract, Transaction} from '@ton/core'
import {
  addr256,
  BaseContract,
  Errors,
  JettonMinter,
  JettonWallet,
  CommonOp,
  packGrams,
  unpackIdxToAddr,
  unpackGrams,
  unpackAddrToIdx,
  createTokenOnchainMetadata,
  TokenMetadata,
} from '../common'
import {BufferToken, Liquidity} from '../liquidity'

export type AssetTransferMessage = {
  type: 'token' | 'ton'
  body: Cell
  value: bigint
  senderWallet: OpenedContract<BaseContract>
}

function opName(code: number | bigint) {
  return Object.keys(CommonOp).find((key) => (CommonOp as any)[key] == code)
}
function errName(code: number | bigint) {
  const name = Object.keys(Errors).find((key) => (Errors as any)[key] == code)
  return name ? `err_${name}` : name
}
function msgSimple(op: number) {
  return beginCell().storeUint(op, 32).storeUint(0, 64).endCell()
}

export class PlainPool extends JettonMinter {
  #cache_info?: Awaited<ReturnType<InstanceType<typeof PlainPool>['getInfo']>>

  static fromAddress(address: Address) {
    return new PlainPool(address)
  }

  static msgTopUp() {
    return beginCell().storeUint(CommonOp.top_up, 32).storeUint(0, 64).endCell()
  }

  async getBufferAddress(provider: ContractProvider, owner: Address) {
    const res = await provider.get('get_buffer_address', [
      {
        type: 'slice',
        cell: beginCell().storeAddress(owner).endCell(),
      },
    ])
    return res.stack.readAddress()
  }

  async getBuffer(provider: ContractProvider, owner: Address) {
    const bufferAddr = await this.getBufferAddress(provider, owner)
    return provider.open(BufferToken.fromAddress(bufferAddr))
  }

  async getInfo(provider: ContractProvider) {
    const res = await provider.get('get_info', [])
    const info = {
      admin: res.stack.readAddressOpt(),
      fee_recipient: res.stack.readAddress(),
      n_coins: res.stack.readNumber(),

      is_initialized: res.stack.readBoolean(),
      is_killed: res.stack.readBoolean(),
      initial_A: res.stack.readNumber(),
      future_A: res.stack.readNumber(),
      initial_A_time: res.stack.readNumber(),
      future_A_time: res.stack.readNumber(),
      fee: res.stack.readNumber(),
      admin_fee: res.stack.readNumber(),

      coins: unpackIdxToAddr(res.stack.readCell()),
      wallets: unpackAddrToIdx(res.stack.readCell()),
      precision_mul: unpackGrams(res.stack.readCell()),

      future_admin: res.stack.readAddressOpt(),
      transfer_admin_deadline: res.stack.readNumber(),
      future_fee: res.stack.readNumber(),
      future_admin_fee: res.stack.readNumber(),
      admin_actions_deadline: res.stack.readNumber(),
    }
    this.#cache_info = info
    return info
  }

  async getInfoCached(provider: ContractProvider) {
    if (this.#cache_info) return this.#cache_info
    return await this.getInfo(provider)
  }

  async getIndex(provider: ContractProvider, coin_idx: number | Address | null, throw_not_found = true) {
    const info = await this.getInfoCached(provider)
    if (coin_idx === null || coin_idx instanceof Address) {
      coin_idx = info.coins.findIndex((val) => {
        if (val === null && coin_idx === null) return true
        if (val && coin_idx instanceof Address) return val.equals(coin_idx)
        return false
      })
    }
    if ((coin_idx < 0 || coin_idx >= info.coins.length) && throw_not_found) {
      throw new Error('coin not found!')
    }
    return coin_idx
  }

  async getReserves(provider: ContractProvider) {
    const res = await provider.get('get_reserves', [])
    return {
      liquidity_supply: res.stack.readBigNumber(),
      balances: unpackGrams(res.stack.readCell()),
      admin_balances: unpackGrams(res.stack.readCell()),
    }
  }

  async getVirtualPrice(provider: ContractProvider) {
    const res = await provider.get('get_virtual_price', [])
    return res.stack.readBigNumber()
  }

  async getLiquidityAmount(
    provider: ContractProvider,
    args: {
      amounts: bigint[]
      is_deposit: boolean
    },
  ) {
    const res = await provider.get('calc_token_amount', [
      {type: 'cell', cell: packGrams(args.amounts)},
      {type: 'int', value: args.is_deposit ? 1n : 0n},
    ])
    return res.stack.readBigNumber()
  }

  async getSwapAmountOut(
    provider: ContractProvider,
    args: {
      in_idx: number | Address | null
      amount_in: bigint
      out_idx: number | Address | null
    },
  ) {
    const in_idx = await this.getIndex(provider, args.in_idx)
    const out_idx = await this.getIndex(provider, args.out_idx)
    const res = await provider.get('get_dy', [
      {type: 'int', value: BigInt(in_idx)},
      {type: 'int', value: BigInt(out_idx)},
      {type: 'int', value: BigInt(args.amount_in)},
    ])
    return res.stack.readBigNumber()
  }

  async getWithdrawOneCoin(
    provider: ContractProvider,
    args: {
      lp_amount: bigint
      out_idx: number | Address | null
    },
  ) {
    const out_idx = await this.getIndex(provider, args.out_idx)
    const res = await provider.get('calc_withdraw_one_coin', [
      {type: 'int', value: args.lp_amount},
      {type: 'int', value: BigInt(out_idx)},
    ])
    return res.stack.readBigNumber()
  }

  static msgProvideLp(args: {min_lp: bigint}) {
    return beginCell().storeUint(CommonOp.pool_provide_lp, 32).storeCoins(args.min_lp).endCell()
  }

  static msgProvideLpTon(args: {amount: bigint; min_lp: bigint}) {
    return beginCell()
      .storeUint(CommonOp.pool_provide_lp_ton, 32)
      .storeUint(0, 64)
      .storeCoins(args.amount)
      .storeCoins(args.min_lp)
      .endCell()
  }

  async getMsgAddLiquidity(
    provider: ContractProvider,
    args: {
      sender: Address
      amounts: bigint[]
      min_lp: bigint
      fw_ton_amount: bigint
    },
  ) {
    const messages: AssetTransferMessage[] = []
    const info = await this.getInfoCached(provider)
    if (args.amounts.length != info.coins.length) {
      throw new Error(`require ${info.coins.length} amounts!`)
    }
    let last_amount = info.coins.length - 1
    while (last_amount > 0 && args.amounts[last_amount] == 0n) {
      last_amount--
    }

    for (const [idx, amount] of args.amounts.entries()) {
      const token = info.coins[idx]
      if (amount > 0) {
        if (token != null) {
          const minter = provider.open(JettonMinter.fromAddress(token))
          const senderWallet = await minter.getWalletAddress(args.sender)
          messages.push({
            type: 'token',
            body: JettonWallet.msgTransfer({
              amount: amount,
              to: this.address,
              response: args.sender,
              forward_ton_amount: args.fw_ton_amount,
              forward_payload: PlainPool.msgProvideLp({
                min_lp: idx == last_amount ? args.min_lp : 0n,
              }),
            }),
            value: args.fw_ton_amount,
            senderWallet: provider.open(JettonWallet.fromAddress(senderWallet)),
          })
        } else {
          messages.push({
            type: 'ton',
            body: PlainPool.msgProvideLpTon({
              amount: amount,
              min_lp: idx == last_amount ? args.min_lp : 0n,
            }),
            value: amount,
            senderWallet: provider.open(this),
          })
        }
      }
    }
    return messages
  }

  static msgExchange(args: {pool_pay_wallet: bigint; min_out: bigint}) {
    return beginCell()
      .storeUint(CommonOp.pool_exchange, 32)
      .storeUint(args.pool_pay_wallet, 256)
      .storeCoins(args.min_out)
      .endCell()
  }
  static msgExchangeTon(args: {amount: bigint; pool_pay_wallet: bigint; min_out: bigint}) {
    return beginCell()
      .storeUint(CommonOp.pool_exchange_ton, 32)
      .storeUint(0, 64)
      .storeCoins(args.amount)
      .storeUint(args.pool_pay_wallet, 256)
      .storeCoins(args.min_out)
      .endCell()
  }

  payLog(transaction: Transaction) {
    if (transaction.inMessage?.info.type === 'internal' && this.address.equals(transaction.inMessage.info.src)) {
      const ds = transaction.inMessage.body.beginParse()
      const op = ds.remainingBits >= 32 ? ds.loadUint(32) : -1
      if (op == CommonOp.transfer) {
        ds.skip(64) // query_id
        const amount = ds.loadCoins()
        const to = ds.loadAddress()
        ds.loadAddress() // response_destination
        ds.loadMaybeRef() // custom_payload
        ds.loadCoins() // forward_ton_amount
        ds.skip(1) // mark forward_payload as Cell
        const reason_code = ds.loadUintBig(32)
        const reason_name = opName(reason_code) || errName(reason_code)
        return {type: 'token', amount, to, reason_code, reason_name}
      }
      if (op == CommonOp.pay_to) {
        ds.skip(64) // query_id
        const amount = ds.loadCoins()
        const to = transaction.inMessage.info.dest
        const reason_code = ds.loadUintBig(32)
        const reason_name = opName(reason_code) || errName(reason_code)
        return {type: 'ton', amount, to, reason_code, reason_name}
      }
    }
    return null
  }

  exportPayLogs(transactions: Transaction[]) {
    return transactions.map(this.payLog.bind(this)).filter((val) => val)
  }

  async getMsgSwap(
    provider: ContractProvider,
    args: {
      sender: Address
      fw_ton_amount: bigint
      in_idx: number | Address | null
      amount_in: bigint
      out_idx: number | Address | null
      min_out: bigint
    },
  ): Promise<AssetTransferMessage> {
    const info = await this.getInfoCached(provider)
    const in_idx = await this.getIndex(provider, args.in_idx)
    const out_idx = await this.getIndex(provider, args.out_idx)

    const token = info.coins[in_idx]
    const pool_pay_wallet = info.wallets[out_idx]
    if (token != null) {
      const minter = provider.open(JettonMinter.fromAddress(token))
      const senderWallet = await minter.getWalletAddress(args.sender)
      return {
        type: 'token',
        body: JettonWallet.msgTransfer({
          amount: args.amount_in,
          to: this.address,
          response: args.sender,
          forward_ton_amount: args.fw_ton_amount,
          forward_payload: PlainPool.msgExchange({
            pool_pay_wallet: pool_pay_wallet ? addr256(pool_pay_wallet) : 0n,
            min_out: args.min_out,
          }),
        }),
        value: args.fw_ton_amount,
        senderWallet: provider.open(JettonWallet.fromAddress(senderWallet)),
      }
    } else {
      return {
        type: 'ton',
        body: PlainPool.msgExchangeTon({
          amount: args.amount_in,
          pool_pay_wallet: pool_pay_wallet ? addr256(pool_pay_wallet) : 0n,
          min_out: args.min_out,
        }),
        value: args.amount_in,
        senderWallet: provider.open(this),
      }
    }
  }

  static msgPoolRemoveLiquidity(args: {recipient: Address; min_amounts: bigint[]}) {
    return beginCell()
      .storeUint(CommonOp.pool_remove_liquidity, 32)
      .storeAddress(args.recipient)
      .storeMaybeRef(packGrams(args.min_amounts))
      .endCell()
  }

  async getMsgRemoveLiquidity(
    provider: ContractProvider,
    args: {
      sender: Address
      recipient?: Address
      response?: Address
      lp_amount: bigint
      min_amounts?: bigint[]
    },
  ) {
    const info = await this.getInfoCached(provider)
    const senderLiquidity = await this.getWalletAddress(provider, args.sender)
    const min_amounts = args.min_amounts ?? Array(Number(info.n_coins)).fill(0n)

    if (info.coins.length != min_amounts.length) {
      throw new Error(`require ${info.coins.length} min_amounts!`)
    }

    return {
      body: JettonWallet.msgBurn({
        amount: args.lp_amount,
        response: args.response ?? args.sender,
        custom_payload: PlainPool.msgPoolRemoveLiquidity({
          recipient: args.recipient ?? args.sender,
          min_amounts: min_amounts,
        }),
      }),
      senderLiquidity: provider.open(Liquidity.fromAddress(senderLiquidity)),
    }
  }

  static msgPoolRemoveLiquidityImbalance(args: {recipient: Address; amounts: bigint[]}) {
    return beginCell()
      .storeUint(CommonOp.pool_remove_liquidity_imbalance, 32)
      .storeAddress(args.recipient)
      .storeMaybeRef(packGrams(args.amounts))
      .endCell()
  }

  async getMsgRemoveLiquidityImbalance(
    provider: ContractProvider,
    args: {
      sender: Address
      recipient?: Address
      response?: Address
      max_lp_amount?: bigint
      amounts: bigint[]
    },
  ) {
    const info = await this.getInfoCached(provider)
    const senderLiquidityAddress = await this.getWalletAddress(provider, args.sender)
    const senderLiquidity = provider.open(Liquidity.fromAddress(senderLiquidityAddress))
    const max_lp_amount = args.max_lp_amount ?? (await senderLiquidity.getJettonBalance())

    if (info.coins.length != args.amounts.length) {
      throw new Error(`require ${info.coins.length} amounts!`)
    }

    return {
      body: JettonWallet.msgBurn({
        amount: max_lp_amount,
        response: args.response ?? args.sender,
        custom_payload: PlainPool.msgPoolRemoveLiquidityImbalance({
          recipient: args.recipient ?? args.sender,
          amounts: args.amounts,
        }),
      }),
      senderLiquidity: senderLiquidity,
    }
  }

  static msgPoolRemoveLiquidityOneCoin(args: {recipient: Address; idx_out: number; min_amount: bigint}) {
    return beginCell()
      .storeUint(CommonOp.pool_remove_liquidity_one_coin, 32)
      .storeAddress(args.recipient)
      .storeUint(args.idx_out, 4)
      .storeCoins(args.min_amount)
      .endCell()
  }

  async getMsgRemoveLiquidityOneCoin(
    provider: ContractProvider,
    args: {
      sender: Address
      recipient?: Address
      response?: Address
      lp_amount: bigint
      out_idx: number | Address | null
      min_amount_out?: bigint
    },
  ) {
    const out_idx = await this.getIndex(provider, args.out_idx)

    const senderLiquidity = await this.getWalletAddress(provider, args.sender)
    return {
      body: JettonWallet.msgBurn({
        amount: args.lp_amount,
        response: args.response ?? args.sender,
        custom_payload: PlainPool.msgPoolRemoveLiquidityOneCoin({
          recipient: args.recipient ?? args.sender,
          idx_out: out_idx,
          min_amount: args.min_amount_out ?? 0n,
        }),
      }),
      senderLiquidity: provider.open(Liquidity.fromAddress(senderLiquidity)),
    }
  }

  async getMsgBufferAddLiquidity(
    provider: ContractProvider,
    args: {
      sender: Address
      min_lp: bigint
      amounts: bigint[]
    },
  ) {
    const senderBuffer = await this.getBuffer(provider, args.sender)
    return {
      body: BufferToken.msgBufferAddLiquidity({
        min_lp: args.min_lp,
        amounts: args.amounts,
      }),
      senderBuffer: senderBuffer,
    }
  }

  async getMsgBufferRefundMe(provider: ContractProvider, sender: Address) {
    const senderBuffer = await this.getBuffer(provider, sender)
    return {
      body: BufferToken.msgBufferRefundMe(),
      senderBuffer: senderBuffer,
    }
  }

  static msgClaimFee() {
    return msgSimple(CommonOp.pool_claim_fee)
  }

  static msgKillMe() {
    return msgSimple(CommonOp.pool_kill_me)
  }

  static msgUnkillMe() {
    return msgSimple(CommonOp.pool_unkill_me)
  }

  static msgRampA(args: {future_a: bigint | number; future_time: bigint | number}) {
    return beginCell()
      .storeUint(CommonOp.pool_ramp_a, 32)
      .storeUint(0, 64)
      .storeUint(args.future_a, 32)
      .storeUint(args.future_time, 64)
      .endCell()
  }

  static msgStopRampA() {
    return msgSimple(CommonOp.pool_stop_ramp_a)
  }

  static msgCommitNewFee(args: {new_fee: bigint | number; new_admin_fee: bigint | number}) {
    return beginCell()
      .storeUint(CommonOp.pool_commit_new_fee, 32)
      .storeUint(0, 64)
      .storeUint(args.new_fee, 64)
      .storeUint(args.new_admin_fee, 64)
      .endCell()
  }

  static msgApplyNewFee() {
    return msgSimple(CommonOp.pool_apply_new_fee)
  }

  static msgRevertNewParameters() {
    return msgSimple(CommonOp.pool_revert_new_parameters)
  }

  static msgCommitTransferOwnership(args: {new_admin: Address | null}) {
    return beginCell()
      .storeUint(CommonOp.pool_commit_transfer_ownership, 32)
      .storeUint(0, 64)
      .storeAddress(args.new_admin)
      .endCell()
  }

  static msgApplyTransferOwnership() {
    return msgSimple(CommonOp.pool_apply_transfer_ownership)
  }

  static msgRevertTransferOwnership() {
    return msgSimple(CommonOp.pool_revert_transfer_ownership)
  }

  static msgNewContent(args: Omit<TokenMetadata, 'decimals'>) {
    return beginCell()
      .storeUint(CommonOp.pool_new_content, 32)
      .storeUint(0, 64)
      .storeRef(
        createTokenOnchainMetadata({
          ...args,
          decimals: '18',
        }),
      )
      .endCell()
  }

  static msgNewFeeRecipient(args: {fee_recipient: Address | null}) {
    return beginCell()
      .storeUint(CommonOp.pool_new_fee_recipient, 32)
      .storeUint(0, 64)
      .storeAddress(args.fee_recipient)
      .endCell()
  }

  static msgUpgrade(code: Cell) {
    return beginCell().storeUint(CommonOp.upgrade, 32).storeUint(0, 64).storeRef(code).endCell()
  }
}
