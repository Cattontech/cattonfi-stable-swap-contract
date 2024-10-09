import {Address, toNano} from '@ton/core'
import {NetworkProvider} from '@ton/blueprint'
import {StableSwapFactory} from '../wrappers'
import {deployInfo, rewriteFetchTimeout, saveDeployInfo, sleep, getFactory} from './utils'

rewriteFetchTimeout()

const FACTORY_INFO = 'stable_swap_factory'

async function deploy(provider: NetworkProvider, admin: Address) {
  const factory = provider.open(await getFactory(admin))
  console.log('StableSwapFactory:', factory.address)

  const isDeployed = await provider.isContractDeployed(factory.address)
  if (isDeployed) {
    console.log('StableSwapFactory: deployed!')
  } else {
    console.log('StableSwapFactory: waiting deploy!')
    const msg_val = toNano('1')
    await factory.sendMessage(provider.sender(), msg_val, StableSwapFactory.msgTopUp())
    await provider.waitForDeploy(factory.address)
  }
  saveDeployInfo(provider, FACTORY_INFO, {
    address: factory.address.toString(),
    data: factory.init?.data.toBoc().toString('hex'),
    code: factory.init?.code.toBoc().toString('hex'),
  })

  return factory
}

export async function run(provider: NetworkProvider) {
  const sender = provider.sender()
  if (!sender.address) return
  console.log('SenderWallet:', sender.address)

  // const factory = await deploy(provider, sender.address)
  const {contract: factory} = deployInfo(provider, FACTORY_INFO, StableSwapFactory)
  console.log('StableSwapFactory:', factory.address)

  const {pools, ...factory_info} = await factory.getInfo()
  console.log(factory_info)
  for (const pool of pools) {
    console.log(pool)
  }
}
