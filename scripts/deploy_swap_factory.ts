import {Address, toNano} from '@ton/core'
import {NetworkProvider} from '@ton/blueprint'
import {PlainPool, StableSwapFactory, unpackTokenMetadata} from '../wrappers'
import {deployInfo, detailAddress, infoPath, rewriteFetchTimeout, saveDeployInfo} from './utils'
import {getFactory} from './utils_stable_swap'

rewriteFetchTimeout()

const INFO = 'stable_swap_factory'

async function deploy(provider: NetworkProvider, admin: Address) {
  const factory = provider.open(await getFactory(admin))
  console.log('StableSwapFactory:', factory.address)

  const isDeployed = await provider.isContractDeployed(factory.address)
  if (isDeployed) {
    console.log('StableSwapFactory: deployed!')
  } else {
    console.log('StableSwapFactory: waiting deploy!')
    // process.exit(1)
    const msg_val = toNano('0.25')
    await factory.sendMessage(provider.sender(), msg_val, StableSwapFactory.msgTopUp())
    await provider.waitForDeploy(factory.address)
  }
  saveDeployInfo(provider, INFO, {
    address: factory.address.toString(),
    data: factory.init?.data.toBoc().toString('hex'),
    code: factory.init?.code.toBoc().toString('hex'),
  })

  return factory
}

async function info(provider: NetworkProvider) {
  const {contract} = deployInfo(provider, INFO, StableSwapFactory)
  console.log('StableSwapFactory:', contract.address)

  const {pools, ...factory_info} = await contract.getInfo()
  console.log(factory_info)
  for (const pool of pools) {
    const plain_pool = provider.open(PlainPool.fromAddress(pool.address))
    const {name, symbol, description} = await unpackTokenMetadata(await plain_pool.getContent())
    console.log({...pool, name, symbol, description})
  }
}

async function configSwapFactory(provider: NetworkProvider) {
  const {contract} = deployInfo(provider, INFO, StableSwapFactory)
  console.log('StableSwapFactory:', contract.address)

  const body = StableSwapFactory.msgSetPermissionless(false)
  await contract.sendMessage(provider.sender(), toNano('0.2'), body)
}

export async function run(provider: NetworkProvider) {
  const sender = provider.sender()
  if (!sender.address) return
  console.log('InfoPath:', infoPath(provider))
  console.log('SenderWallet:', detailAddress(sender.address))

  // await deploy(provider, sender.address)
  // await configSwapFactory(provider)
  await info(provider)
}
