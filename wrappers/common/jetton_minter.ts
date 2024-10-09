import {Address, beginCell, ContractProvider} from '@ton/core'
import {BaseContract} from './base'

export class JettonMinter extends BaseContract {
  static fromAddress(address: Address) {
    return new JettonMinter(address)
  }

  async getWalletAddress(provider: ContractProvider, owner: Address): Promise<Address> {
    const res = await provider.get('get_wallet_address', [
      {type: 'slice', cell: beginCell().storeAddress(owner).endCell()},
    ])
    return res.stack.readAddress()
  }

  async getJettonData(provider: ContractProvider) {
    let res = await provider.get('get_jetton_data', [])
    let total_supply = res.stack.readBigNumber()
    let mintable = res.stack.readBoolean()
    let admin_address = res.stack.readAddress()
    let jetton_content = res.stack.readCell()
    let jetton_wallet_code = res.stack.readCell()
    return {
      total_supply,
      mintable,
      admin_address,
      jetton_content,
      jetton_wallet_code,
    }
  }

  async getTotalSupply(provider: ContractProvider) {
    let res = await this.getJettonData(provider)
    return res.total_supply
  }
  async getAdminAddress(provider: ContractProvider) {
    let res = await this.getJettonData(provider)
    return res.admin_address
  }
  async getContent(provider: ContractProvider) {
    let res = await this.getJettonData(provider)
    return res.jetton_content
  }
}
