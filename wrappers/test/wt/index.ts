import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox'
import {Address} from '@ton/core'
import {JettonMinter} from '../../common'
import {TonWallet} from './ton_wallet'

export class WT extends JettonMinter {
  static async initToken(
    blockchain: Blockchain,
    deployer: SandboxContract<TreasuryContract>,
    uri: string,
    decimal: bigint,
  ) {
    const wallet = async (owner: Address) => {
      return blockchain.openContract(new TonWallet(owner))
    }
    const mint = async (to: Address, amount: bigint) => {}
    return {decimal, address: null, wallet, mint}
  }
}
