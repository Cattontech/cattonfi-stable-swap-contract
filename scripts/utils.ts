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
  const filePath = path.join(process.cwd(), 'deploy', provider.network(), version, `${contractName}.json`)
  const content = JSON.parse(fs.readFileSync(filePath).toString())
  return {
    contract:
      content.address == null
        ? ({address: null} as OpenedContract<T>)
        : provider.open(new Clazz(Address.parse(content.address))),
    info: content,
  }
}

export function saveDeployInfo(provider: NetworkProvider, contractName: string, content: any) {
  const folder = path.join(process.cwd(), 'deploy', provider.network())
  fs.mkdirSync(folder, {recursive: true})
  fs.writeFileSync(path.join(folder, `${contractName}.json`), JSON.stringify(content, null, 2))
}
