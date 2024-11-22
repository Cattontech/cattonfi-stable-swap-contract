import fs = require('fs')
import path = require('path')
import {NetworkProvider} from '@ton/blueprint'
import {Address, Contract, OpenedContract} from '@ton/core'

/**
 * Rewrite fetch timeout for @tonconnect/sdk
 * https://github.com/ton-connect/sdk/blob/main/packages/isomorphic-fetch/index.js
 */
import {fetch, Request, Response, Headers, setGlobalDispatcher, Agent} from 'undici'
import {parseFee, StableSwapFactory} from '../wrappers'

function wrapFetch(this: any, url: any, options: any) {
  if (/^\/\//.test(url)) url = 'https:' + url
  return fetch.call(this, url, options)
}
export function rewriteFetchTimeout() {
  setGlobalDispatcher(new Agent({connect: {timeout: 3_000}}))
  global.fetch = wrapFetch as any
  global.Response = Response as any
  global.Headers = Headers as any
  global.Request = Request as any
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function deployInfo<T extends Contract>(
  provider: NetworkProvider,
  contractName: string,
  Clazz: new (address: Address) => T,
  version: string = '',
): {contract: OpenedContract<T>; info: any} {
  const filePath = path.join(infoPath(provider), version, `${contractName}.json`)
  const content = JSON.parse(fs.readFileSync(filePath).toString())
  return {
    contract:
      content.address == null
        ? ({address: null} as OpenedContract<T>)
        : provider.open(new Clazz(Address.parse(content.address))),
    info: content,
  }
}

export function infoPath(provider: NetworkProvider) {
  return path.join(process.cwd(), 'deploy', process.env.VERSION ?? provider.network())
}

export function saveDeployInfo(provider: NetworkProvider, contractName: string, content: any) {
  const folder = infoPath(provider)
  fs.mkdirSync(folder, {recursive: true})
  fs.writeFileSync(path.join(folder, `${contractName}.json`), JSON.stringify(content, null, 2))
}

export function detailAddress(addr: Address) {
  return {
    raw: addr.toRawString(),
    mainnet_bounceable: addr.toString(),
    mainnet_unbounceable: addr.toString({testOnly: false, urlSafe: true, bounceable: false}),
    testnet_bounceable: addr.toString({testOnly: true, urlSafe: true, bounceable: true}),
    testnet_unbounceable: addr.toString({testOnly: true, urlSafe: true, bounceable: false}),
  }
}
