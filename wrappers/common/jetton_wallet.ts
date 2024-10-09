import {Address, beginCell, Cell, ContractProvider} from '@ton/core'
import {BaseContract} from './base'
import {Op} from './constants'

export class JettonWallet extends BaseContract {
  static fromAddress(address: Address) {
    return new JettonWallet(address)
  }

  async getWalletData(provider: ContractProvider) {
    let res = await provider.get('get_wallet_data', [])
    return {
      balance: res.stack.readBigNumber(),
      owner: res.stack.readAddress(),
      minter: res.stack.readAddress(),
      jetton_wallet_code: res.stack.readCell(),
    }
  }

  async getJettonBalance(provider: ContractProvider) {
    let state = await provider.getState()
    if (state.state.type !== 'active') {
      return 0n
    }
    let res = await provider.get('get_wallet_data', [])
    return res.stack.readBigNumber()
  }

  static msgTransfer(args: {
    amount: bigint
    to: Address
    response: Address
    custom_payload?: Cell | null
    forward_ton_amount?: bigint
    forward_payload?: Cell | null
  }) {
    return beginCell()
      .storeUint(Op.transfer, 32) // op
      .storeUint(0, 64) // queryId
      .storeCoins(args.amount)
      .storeAddress(args.to)
      .storeAddress(args.response)
      .storeMaybeRef(args.custom_payload ?? null)
      .storeCoins(args.forward_ton_amount ?? 0n)
      .storeMaybeRef(args.forward_payload ?? null)
      .endCell()
  }

  static msgBurn(args: {amount: bigint; response: Address; custom_payload: Cell}) {
    return beginCell()
      .storeUint(Op.burn, 32) // op
      .storeUint(0, 64) // queryId
      .storeCoins(args.amount)
      .storeAddress(args.response)
      .storeMaybeRef(args.custom_payload ?? null)
      .endCell()
  }
}
