import {Config, CustomNetwork} from '@ton/blueprint'

type Network = Pick<Config, 'network'>['network']
type NetworkType = Pick<CustomNetwork, 'type'>['type']

function loadNetwork(): Network {
  if (process.env.NETWORK && process.env.RPC_ENDPOINT && process.env.RPC_KEY) {
    return {
      type: process.env.NETWORK as NetworkType,
      endpoint: process.env.RPC_ENDPOINT!,
      key: process.env.RPC_KEY,
    }
  }
  return 'testnet'
}

const network = loadNetwork()
console.log('Version:', process.env.VERSION)
console.log('Network:', network)

export const config: Config = {
  // config contents
  network: network,
}
