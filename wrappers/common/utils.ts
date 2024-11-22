import {Address, beginCell, Cell, Dictionary, Slice} from '@ton/core'
import {sha256_sync} from '@ton/crypto'
import crc32 = require('crc-32')
import bn from 'bignumber.js'
import axios from 'axios'

export type TokenMetadata = {
  image?: string
  name?: string
  symbol?: string
  description?: string
  decimals?: string
}

export type UnpackedTokenMetadata = {
  type: 'onchain' | 'offchain'
  uri?: string
} & TokenMetadata
type MetadataKey = keyof Omit<UnpackedTokenMetadata, 'type'>

function stringHash(val: string) {
  return BigInt('0x' + sha256_sync(val).toString('hex'))
}

function storeSnakeContentData(str: string) {
  return beginCell().storeUint(0, 8).storeStringTail(str).endCell()
}

function storeHashmapContentData(meta: TokenMetadata) {
  const hashmap_content = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
  for (const [key, val] of Object.entries(meta)) {
    val != null && hashmap_content.set(stringHash(key), storeSnakeContentData(val))
  }
  return hashmap_content
}

// https://github.com/ton-blockchain/TEPs/blob/master/text/0064-token-data-standard.md#informal-tl-b-scheme
export function createTokenOnchainMetadata(meta: TokenMetadata) {
  const hashmap_content = storeHashmapContentData(meta)
  return beginCell().storeUint(0, 8).storeDict(hashmap_content).endCell()
}

export async function unpackTokenMetadata(meta: Cell) {
  const unpacked = {} as UnpackedTokenMetadata
  const fields: MetadataKey[] = ['uri', 'image', 'name', 'symbol', 'description', 'decimals']

  const ds = meta.beginParse()
  if (!ds.remainingBits) return unpacked

  const meta_type = ds.loadUint(8)
  if (meta_type == 0) {
    unpacked.type = 'onchain'
    try {
      const data = ds.loadDict(Dictionary.Keys.BigUint(256), Dictionary.Values.Cell())
      for (const field of fields) {
        const content_data = data.get(stringHash(field))
        if (content_data) {
          const ds = content_data.beginParse()

          const content_data_type = ds.loadUint(8)
          if (content_data_type == 0) {
            // content_data snake
            unpacked[field] = ds.loadStringTail()
          } else {
            // content_data chunks
            const map_chunked_data = ds.loadDict(Dictionary.Keys.Uint(32), Dictionary.Values.Cell())
            const chunked_data: string[] = []
            map_chunked_data.keys().forEach((key) => {
              const snake_data = map_chunked_data.get(key)
              if (snake_data) {
                chunked_data[key] = ds.loadStringTail()
              }
            })
            unpacked[field] = chunked_data.join('')
          }
        }
      }
    } catch {}
  } else {
    unpacked.type = 'offchain'
    const uri = ds.loadStringTail()
    try {
      const res = await axios.get(uri)
      const offchain_data = res.data
      for (const field of fields) {
        if (offchain_data[field]) {
          unpacked[field] = offchain_data[field]
        }
      }
    } catch {}
    unpacked.uri = uri
  }
  return unpacked
}

export function toBN(val: number | bigint | string) {
  return new bn(val.toString())
}
export function parseUnits(value: string, decimals: number | bigint) {
  return toBN(value).multipliedBy(toBN(10).pow(toBN(decimals)))
}
export function formatUnits(value: number | bigint | string, decimals: number | bigint, fixed?: number | bigint) {
  return toBN(value)
    .div(toBN(10).pow(toBN(decimals)))
    .toFixed(Number(fixed ?? decimals))
}

export function sliceHash(val: Cell | Slice | Address | null) {
  if (val instanceof Address || val == null) {
    val = beginCell().storeAddress(val).endCell()
  }
  if (val instanceof Slice) {
    val = beginCell().storeSlice(val).endCell()
  }
  return BigInt('0x' + val.hash().toString('hex'))
}

export function c(str: string) {
  return Number(BigInt(crc32.str(str)) & 0xffffffffn)
}

export function addr256(val: Address) {
  return beginCell().storeAddress(val).endCell().beginParse().skip(11).loadUintBig(256)
}

/**
 * addr_std$10 anycast:(Maybe Anycast)
 *   workchain_id:int8 address:bits256 = MsgAddressInt;
 */
export function msgAddrInt(addr256: bigint, wc: 0 | -1 = 0) {
  return beginCell()
    .storeUint(4, 3) // 100
    .storeInt(wc, 8) // basechain / masterchain
    .storeUint(addr256, 256)
    .endCell()
    .beginParse()
    .loadAddress()
}

/** @returns hashmap from address to index */
export function packAddrToIdx(wallets: (Address | null)[]) {
  const dict = Dictionary.empty(Dictionary.Keys.BigUint(256), Dictionary.Values.Uint(4))
  for (const [idx, wallet] of wallets.entries()) {
    dict.set(wallet ? addr256(wallet) : 0n, idx)
  }
  return dict
}
/** @returns array address */
export function unpackAddrToIdx(walletIdx: Cell) {
  const dict = Dictionary.loadDirect(Dictionary.Keys.BigUint(256), Dictionary.Values.Uint(4), walletIdx)
  const wallets: (Address | null)[] = []
  for (const wallet of dict.keys()) {
    wallets[dict.get(wallet)!] = wallet ? msgAddrInt(wallet) : null
  }
  return wallets
}

/** @returns hashmap from index to address */
export function packIdxToAddr(masters: (Address | null)[]) {
  const dict = Dictionary.empty(Dictionary.Keys.Uint(4), Dictionary.Values.BigUint(256))
  for (const [idx, coin] of masters.entries()) {
    dict.set(idx, coin ? addr256(coin) : 0n)
  }
  return dict
}

/** @returns array address */
export function unpackIdxToAddr(coins: Cell) {
  const dict = Dictionary.loadDirect(Dictionary.Keys.Uint(4), Dictionary.Values.BigUint(256), coins)
  const masters: (Address | null)[] = []
  for (const idx of dict.keys()) {
    const val = dict.get(idx)!
    masters[idx] = val > 0 ? msgAddrInt(dict.get(idx)!) : null
  }
  return masters
}

/** Pack array gram to a Slice */
export function packGrams(grams: (bigint | number)[]) {
  const pack = beginCell()
  for (const gram of grams) {
    pack.storeCoins(gram)
  }
  return pack.endCell()
}

/** @return array gram */
export function unpackGrams(grams: Cell) {
  const values: bigint[] = []
  const ds = grams.beginParse()
  while (ds.remainingBits) {
    values.push(ds.loadCoins())
  }
  return values
}
