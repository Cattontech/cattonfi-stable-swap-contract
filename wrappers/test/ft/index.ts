import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox'
import {Address, beginCell, Cell, toNano} from '@ton/core'
import {compile} from '@ton/blueprint'
import {JettonMinter, JettonWallet} from '../../common'

type MinterContent = {
  type: 0 | 1
  uri: string
}
type MinterConfig = {admin: Address; content: MinterContent; wallet_code: Cell}

export class FT extends JettonMinter {
  private static wallet_code: Cell
  private static minter_code: Cell

  static async compile() {
    if (!this.wallet_code || !this.minter_code) {
      this.wallet_code = await compile('test/ft/jetton_wallet')
      this.minter_code = await compile('test/ft/jetton_minter')
    }
    return {wallet_code: this.wallet_code, minter_code: this.minter_code}
  }

  static packInitState(config: MinterConfig) {
    const content = beginCell()
      .storeUint(config.content.type, 8)
      .storeStringTail(config.content.uri) //Snake logic under the hood
      .endCell()
    return beginCell()
      .storeCoins(0) //total_supply
      .storeAddress(config.admin) //admin_address
      .storeRef(content) //content
      .storeRef(config.wallet_code) //jetton_wallet_code
      .endCell()
  }

  static async initToken(
    blockchain: Blockchain,
    deployer: SandboxContract<TreasuryContract>,
    uri: string,
    decimal: bigint,
  ) {
    const {wallet_code, minter_code} = await this.compile()
    const data = this.packInitState({
      admin: deployer.address,
      content: {
        type: 1,
        uri: uri,
      },
      wallet_code: wallet_code,
    })
    const minter = blockchain.openContract(new FT({data, code: minter_code}))
    await minter.sendMessage(deployer.getSender(), toNano('1'), Cell.EMPTY)

    const wallet = async (owner: Address) => {
      const address = await minter.getWalletAddress(owner)
      return blockchain.openContract(new JettonWallet(address))
    }
    const mint = async (to: Address, amount: bigint) => {
      const mintMsg = beginCell()
        .storeUint(21, 32) //mint op
        .storeUint(0, 64) //queryId
        .storeAddress(to)
        .storeCoins(toNano('1')) //total_ton_amount
        .storeRef(
          beginCell()
            .storeUint(0x178d4519, 32) //internal_transfer op
            .storeUint(0, 64) //queryId
            .storeCoins(amount)
            .storeAddress(null)
            .storeAddress(deployer.address) //response_address
            .storeCoins(0) //forward_ton_amount
            .storeMaybeRef(null) //either_forward_payload
            .endCell(),
        )
        .endCell()
      await minter.sendMessage(deployer.getSender(), toNano('1'), mintMsg)
    }
    return {decimal, address: minter.address, wallet, mint}
  }
}
