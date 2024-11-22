import {Address, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode} from '@ton/core'

export abstract class BaseContract implements Contract {
  readonly address: Address
  readonly init?: {code: Cell; data: Cell}

  constructor(from: Address | {code: Cell; data: Cell; workchain?: number}) {
    if (from instanceof Address) {
      this.address = from
    } else {
      const init = {code: from.code, data: from.data}
      this.address = contractAddress(from.workchain ?? 0, init)
      this.init = init
    }
  }

  async getState(provider: ContractProvider) {
    return await provider.getState()
  }

  async getBalance(provider: ContractProvider) {
    let state = await provider.getState()
    return state.balance
  }

  async sendMessage(provider: ContractProvider, via: Sender, value: bigint, body: Cell) {
    await provider.internal(via, {
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: body,
      value: value,
    })
  }
}
