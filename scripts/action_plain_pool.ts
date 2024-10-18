import {Address} from '@ton/core'
import {NetworkProvider} from '@ton/blueprint'
import {PlainPool} from '../wrappers'
import {rewriteFetchTimeout} from './utils'

rewriteFetchTimeout()

export async function run(provider: NetworkProvider) {
  const sender = provider.sender()
  if (!sender.address) return
  console.log('SenderWallet:', sender.address)

  const userAddr = '0QCN4hZam-nnK362ViEad8vlVl3L8v1ywE_SSsuFvP-DEYXn'
  const poolAddr = 'kQDElzC6yRd0oPfLc4I6VdkjZYUVEU96Iu0kalrM1zxUvf8U'
  const pool = provider.open(PlainPool.fromAddress(Address.parse(poolAddr)))

  const buffer = await pool.getBuffer(Address.parse(userAddr))
  console.log(await buffer.getBufferData())

  console.log(await pool.getReserves())
  console.log(await pool.getInfo())
}
