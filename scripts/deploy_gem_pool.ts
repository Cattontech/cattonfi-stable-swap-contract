import {Address, toNano} from '@ton/core'
import {NetworkProvider} from '@ton/blueprint'
import {GemPool, JettonMinter, parseUnits} from '../wrappers'
import {deployInfo, rewriteFetchTimeout, saveDeployInfo} from './utils'
import {getGemPool} from './utils_farm'

rewriteFetchTimeout()

const INFO = 'gem_pool'

async function deploy(
  provider: NetworkProvider,
  args: {
    admin: Address
    serial: number
    coin: Address
    reward_per_second: bigint
    boosted_reward_per_second: bigint
    boosted_reward_end_time: bigint
  },
) {
  const gem_pool = provider.open(await getGemPool(args))
  console.log('GemPool:', gem_pool.address)

  const coin = provider.open(JettonMinter.fromAddress(args.coin))
  const wallet = await coin.getWalletAddress(gem_pool.address)

  const isDeployed = await provider.isContractDeployed(gem_pool.address)
  if (isDeployed) {
    console.log('GemPool: deployed!')
  } else {
    console.log('GemPool: waiting deploy!')
    const msg_val = toNano('1')
    await gem_pool.sendMessage(
      provider.sender(),
      msg_val,
      GemPool.msgInit({
        ...args,
        wallet: wallet,
      }),
    )
    await provider.waitForDeploy(gem_pool.address)
  }
  saveDeployInfo(provider, `${INFO}_${args.serial}_${args.coin}`, {
    address: gem_pool.address.toString(),
    data: gem_pool.init?.data.toBoc().toString('hex'),
    code: gem_pool.init?.code.toBoc().toString('hex'),
  })

  return gem_pool
}

async function info(provider: NetworkProvider, args: {serial: number; coin: Address}) {
  const {contract} = deployInfo(provider, `${INFO}_${args.serial}_${args.coin}`, GemPool)
  console.log('GemPool:', contract.address)
  console.log(await contract.getInfo())
}

export async function run(provider: NetworkProvider) {
  const sender = provider.sender()
  if (!sender.address) return
  console.log('SenderWallet:', sender.address)

  const params = {
    admin: sender.address,
    serial: 0,
    coin: Address.parse('EQBpLSudB-__U3C43aKHvVjNCDVXjyweH2CAPSxFpntSPQYu'),
    reward_per_second: BigInt(parseUnits(`${40000 / 86400}`, 18).toString()),
    boosted_reward_per_second: 0n,
    boosted_reward_end_time: 0n,
  }

  // await deploy(provider, params)
  await info(provider, params)
}
