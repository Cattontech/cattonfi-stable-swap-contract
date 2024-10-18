import {Address, beginCell, Cell, toNano} from '@ton/core'
import {compile, NetworkProvider} from '@ton/blueprint'
import {createTokenOnchainMetadata} from '../wrappers'
import {FT} from '../wrappers/test'
import {deployInfo, rewriteFetchTimeout, saveDeployInfo} from './utils'

rewriteFetchTimeout()

const INFO = 'coin_jUSDT'

async function deploy(provider: NetworkProvider, admin: Address) {
  const wallet_code = await compile('test/ft/jetton_wallet')
  const minter_code = await compile('test/ft/jetton_minter')

  // https://tonviewer.com/EQBynBO23ywHy_CgarY9NK9FTz0yDsG82PtcbSTQgGoXwiuA
  const meta = {
    decimals: '6',
    symbol: 'jUSDT',
    name: 'Bridged jUSDT',
    description:
      'Tether USD transferred from Ethereum via bridge.ton.org. Token address in Ethereum: 0xdac17f958d2ee523a2206206994597c13d831ec7.',
    image:
      'https://cache.tonapi.io/imgproxy/CwB_AmfxXaRx6D2SB22UgGJJu-P49hbxhjTnxv5Ruek/rs:fill:200:200:1/g:no/aHR0cHM6Ly9icmlkZ2UudG9uLm9yZy90b2tlbi8xLzB4ZGFjMTdmOTU4ZDJlZTUyM2EyMjA2MjA2OTk0NTk3YzEzZDgzMWVjNy5wbmc.webp',
  }
  const content = createTokenOnchainMetadata(meta)

  const init_state = beginCell()
    .storeCoins(0) //total_supply
    .storeAddress(admin) //admin_address
    .storeRef(content) //content
    .storeRef(wallet_code) //jetton_wallet_code
    .endCell()
  const token = provider.open(new FT({code: minter_code, data: init_state}))
  console.log(INFO + ':', token.address)

  const isDeployed = await provider.isContractDeployed(token.address)
  if (isDeployed) {
    console.log(INFO + ': deployed!')
  } else {
    console.log(INFO + ': waiting deploy!')
    const msg_val = toNano('0.5')
    await token.sendMessage(provider.sender(), msg_val, Cell.EMPTY)
    await provider.waitForDeploy(token.address)
  }
  saveDeployInfo(provider, INFO, {
    address: token.address.toString(),
    data: token.init?.data.toBoc().toString('hex'),
    code: token.init?.code.toBoc().toString('hex'),
  })
  return token
}

async function mint(provider: NetworkProvider, to: Address) {
  const {contract: token} = deployInfo(provider, INFO, FT)
  const mintMsg = beginCell()
    .storeUint(21, 32) //mint op
    .storeUint(0, 64) //queryId
    .storeAddress(to)
    .storeCoins(toNano('0.5')) //total_ton_amount
    .storeRef(
      beginCell()
        .storeUint(0x178d4519, 32) //internal_transfer op
        .storeUint(0, 64) //queryId
        .storeCoins(toNano(1_000_000_000_000_000_000))
        .storeAddress(null)
        .storeAddress(to) //response_address
        .storeCoins(0) //forward_ton_amount
        .storeMaybeRef(null) //either_forward_payload
        .endCell(),
    )
    .endCell()
  await token.sendMessage(provider.sender(), toNano('0.5'), mintMsg)
}

export async function run(provider: NetworkProvider) {
  const sender = provider.sender()
  if (!sender.address) return
  console.log('SenderWallet:', sender.address)

  await deploy(provider, sender.address)
  // await mint(provider, sender.address)
}
