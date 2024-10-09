import '@ton/test-utils'
import JEST_CONFIG from '../jest.config'
import {toNano, Cell, Dictionary, Slice} from '@ton/core'
import {parseFullConfig} from '@ton/ton'
import {Blockchain, SandboxContract, TreasuryContract} from '@ton/sandbox'
import {ContractUtils} from '../wrappers/test'
import {wrapSend} from './base/base.utils'
import {c} from '../wrappers'

describe('array', () => {
  const JEST_CONSOLE = console
  const NODE_CONSOLE = require('console')

  let blockchain: Blockchain
  let utils: SandboxContract<ContractUtils>
  let deployer: SandboxContract<TreasuryContract>

  beforeAll(async () => {
    global.console = JEST_CONFIG.silent ? JEST_CONSOLE : NODE_CONSOLE
    blockchain = await Blockchain.create()
    deployer = await blockchain.treasury('deployer')
    utils = blockchain.openContract(await ContractUtils.compile())
  })

  describe('deploy', () => {
    it('deploy (successed)', async () => {
      await wrapSend(deployer, utils.sendMessage, toNano('1'), ContractUtils.msgInvoke(c('top_up')))()
    })

    it('tupe', async () => {
      await wrapSend(deployer, utils.sendMessage, toNano('1'), ContractUtils.msgInvoke(c('test_tupe')))()
    })

    it('get_config', async () => {
      const config = Dictionary.loadDirect(Dictionary.Keys.Int(32), Dictionary.Values.Cell(), blockchain.config)
      const mapConfigs: Map<number, Slice> = config.keys().reduce((prev, cur) => {
        prev.set(cur, config.get(cur)!.beginParse())
        return prev
      }, new Map())
      const fullConfigs = parseFullConfig(mapConfigs)

      // console.log(await utils.getChainConfigParam())
      console.log(fullConfigs.msgPrices.workchain, fullConfigs.storagePrices[fullConfigs.storagePrices.length - 1])
    })
  })
})
