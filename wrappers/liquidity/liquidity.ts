import {Address} from '@ton/core'
import {JettonWallet} from '../common'

export class Liquidity extends JettonWallet {
  static fromAddress(address: Address) {
    return new Liquidity(address)
  }
}
