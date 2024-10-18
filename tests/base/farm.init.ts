import {SandboxContract} from '@ton/sandbox'
import {ExtendActors, FactoryRuntimeState} from './factory.init'
import {GemBuffer, GemPool, Liquidity} from '../../wrappers'

export type FarmGemPool = SandboxContract<GemPool> & {
  liquidity: SandboxContract<Liquidity>
}
export type ExtendGemBuffer = ExtendActors & {gem_buffer: SandboxContract<GemBuffer>}

export class FarmRuntimeState extends FactoryRuntimeState<ExtendGemBuffer> {
  gem_pool!: FarmGemPool

  async initGemPool() {
    const gem_pool_lp_wallet = await this.plain_pool.getWalletAddress(this.gem_pool.address)
    this.gem_pool.liquidity = this.blockchain.openContract(Liquidity.fromAddress(gem_pool_lp_wallet))

    for (const actor of FarmRuntimeState.actors) {
      const gemUserAddress = await this.gem_pool.getGemBufferAddress(this[actor].address)
      this[actor].gem_buffer = this.blockchain.openContract(GemBuffer.fromAddress(gemUserAddress))
    }
  }
}
