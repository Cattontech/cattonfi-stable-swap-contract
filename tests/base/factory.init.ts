import {SandboxContract} from '@ton/sandbox'
import {RuntimeState} from './base.init'
import {Token} from './base.utils'
import {BufferToken, JettonWallet, Liquidity, PlainPool, StableSwapFactory} from '../../wrappers'
import {ContractUtils} from '../../wrappers/test'

export type ExtendActors = {
  tokens: SandboxContract<JettonWallet>[]
  liquidity: SandboxContract<Liquidity>
  buffer: SandboxContract<BufferToken>
}

export class FactoryRuntimeState<T extends ExtendActors = ExtendActors> extends RuntimeState<T> {
  mint_amount: bigint = 10n ** 9n

  tokens: Token<JettonWallet>[] = []
  factory!: SandboxContract<StableSwapFactory>
  plain_pool!: SandboxContract<PlainPool>

  #util!: SandboxContract<ContractUtils>
  async contractUtils() {
    if (!this.#util) {
      this.#util = this.blockchain.openContract(await ContractUtils.compile())
      await this.#util.sendMessage(this.deployer.getSender(), 10n ** 9n, ContractUtils.msgInvoke(0))
    }
    return this.#util
  }

  async initWallets() {
    for (const actor of FactoryRuntimeState.actors) {
      this[actor].tokens = []
      for (const [idx, token] of this.tokens.entries()) {
        this[actor].tokens[idx] = await token.wallet(this[actor].address)
        await token.mint(this[actor].address, this.mint_amount * 10n ** token.decimal)
      }
    }
  }

  async setPlainPool(pool: PlainPool) {
    this.plain_pool = this.blockchain.openContract(pool)
    for (const actor of FactoryRuntimeState.actors) {
      this[actor].liquidity = this.blockchain.openContract(
        JettonWallet.fromAddress(await this.plain_pool.getWalletAddress(this[actor].address)),
      )

      this[actor].buffer = this.blockchain.openContract(
        BufferToken.fromAddress(await this.plain_pool.getBufferAddress(this[actor].address)),
      )
    }
  }
}
