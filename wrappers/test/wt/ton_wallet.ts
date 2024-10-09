import {Address, Cell, ContractProvider} from '@ton/core'
import {JettonWallet} from '../../common'

export class TonWallet extends JettonWallet {
  static fromAddress(address: Address) {
    return new TonWallet(address)
  }

  async getWalletData(provider: ContractProvider) {
    const {balance} = await provider.getState()
    return {
      balance: balance,
      owner: this.address,
      minter: this.address,
      jetton_wallet_code: Cell.EMPTY,
    }
  }

  async getJettonBalance(provider: ContractProvider) {
    const {balance} = await provider.getState()
    return balance
  }

  static msgTransfer(args: {
    amount: bigint
    to: Address
    response: Address
    custom_payload?: Cell | null
    forward_ton_amount?: bigint
    forward_payload?: Cell | null
  }): Cell {
    throw new Error('unimplemented!')
  }

  static msgBurn(args: {amount: bigint; response: Address; custom_payload: Cell}): Cell {
    throw new Error('unimplemented!')
  }
}
