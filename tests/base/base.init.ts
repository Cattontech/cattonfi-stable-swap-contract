import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox'

export type Actors = 'deployer' | 'admin' | 'ali' | 'bob' | 'other'

export class RuntimeState<T = {}> {
  static actors: Actors[] = ['deployer', 'admin', 'ali', 'bob', 'other']

  blockchain!: Blockchain

  deployer!: SandboxContract<TreasuryContract> & T
  admin!: SandboxContract<TreasuryContract> & T
  ali!: SandboxContract<TreasuryContract> & T
  bob!: SandboxContract<TreasuryContract> & T
  other!: SandboxContract<TreasuryContract> & T

  getTime() {
    return BigInt(this.blockchain.now != undefined ? this.blockchain.now : Math.floor(Date.now() / 1000))
  }
  setTime(seconds?: number | bigint) {
    this.blockchain.now = seconds != undefined ? Number(seconds) : undefined
  }
  incTime() {
    this.blockchain.now != undefined && (this.blockchain.now += 1)
  }

  async init() {
    this.blockchain = await Blockchain.create()
    for (const actor of RuntimeState.actors) {
      this[actor] = (await this.blockchain.treasury(actor)) as SandboxContract<TreasuryContract> & T
    }
  }
}
