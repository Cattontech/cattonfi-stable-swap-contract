import '@ton/test-utils'
import JEST_CONFIG from '../jest.config'
import {toNano, fromNano, Address} from '@ton/core'
import {FT, WT} from '../wrappers/test'
import {
  Errors,
  formatUnits,
  GemBuffer,
  GemPool,
  JettonWallet,
  Op,
  OpName,
  PlainPool,
  StableSwapFactory,
} from '../wrappers'
import {getFactory} from '../scripts/utils_stable_swap'
import {getGemFarmCodes, getGemPool} from '../scripts/utils_farm'
import {FarmGemPool, FarmRuntimeState} from './base/farm.init'
import {exportComputeGas, isAbortLog, resetAbortLog, setAbortLog, StoreGasUsed, wrapSend} from './base/base.utils'
import {generateTestCases} from './base/testcase'

describe('gem_farm', () => {
  const JEST_CONSOLE = console
  const NODE_CONSOLE = require('console')

  let st: FarmRuntimeState
  const storeGasUsed = new StoreGasUsed()
  const opt = {opcodes: Op, errors: Errors}

  const INIT_STATES = generateTestCases()

  async function exportGas() {
    const utils = await st.contractUtils()
    const codes = await getGemFarmCodes()

    const exports = [
      {
        name: 'gem_buffer',
        path: 'gas/export/gem_buffer.fc',
        ops: [OpName.gem_buffer_stake, OpName.gem_buffer_unstake],
        code: codes.gem_buffer_code,
      },
      {
        name: 'gem_pool',
        path: 'gas/export/gem_pool.fc',
        ops: [OpName.gem_pool_stake, OpName.gem_pool_unstake, OpName.gem_pool_earn, OpName.gem_pool_change_reward],
        code: codes.gem_pool_code,
      },
    ]

    for (const elment of exports) {
      const opGas = storeGasUsed.getOpGasContent(elment.ops)
      const {cells, bits} = await utils.getDataSize(elment.code)
      const codeSize = [
        'const int ' + elment.name + '_code::cells = ' + cells.toString() + ';',
        'const int ' + elment.name + '_code::bits = ' + bits.toString() + ';',
      ].join('\n')
      exportComputeGas(elment.path, opGas, codeSize)
    }
  }

  afterAll(async () => {
    await exportGas()
    storeGasUsed.logGas()
    global.console = JEST_CONSOLE
  })

  beforeAll(async () => {
    global.console = JEST_CONFIG.silent ? JEST_CONSOLE : NODE_CONSOLE
  })

  for (let idx = 0; idx < INIT_STATES.length; idx++) {
    const state = INIT_STATES[idx]

    describe(`state #${idx}`, () => {
      st = new FarmRuntimeState()

      afterEach(async () => {
        const contracts: Record<string, any> = {
          gem_pool: st.gem_pool,
          'gem_pool.liquidity': st.gem_pool?.liquidity,

          'deployer.gem_buffer': st.deployer.gem_buffer,
          'ali.gem_buffer': st.ali.gem_buffer,

          'deployer.liquidity': st.deployer.liquidity,
          'ali.liquidity': st.ali.liquidity,
        }
        const data: Record<string, string> = {}
        for (const key in contracts) {
          const balance = contracts[key] ? await contracts[key].getBalance() : 0
          data[key] = fromNano(balance)
        }
        !isAbortLog() && console.table([data])
        console.log(`#TESTCASE#: ${expect.getState().currentTestName}`, '\n\n')
        resetAbortLog()
      })

      beforeAll(async () => {
        console.log(`#START_STATE#:`, idx, state)

        await st.init()
        for (const [idx, token] of state.tokens.entries()) {
          st.tokens[idx] = token.isNative
            ? await WT.initToken(st.blockchain, st.deployer, token.name, token.decimal)
            : await FT.initToken(st.blockchain, st.deployer, token.name, token.decimal)
        }
        st.factory = st.blockchain.openContract(await getFactory(st.admin.address))
      }, 60000)

      describe('deploy', () => {
        it('deploy_factory (successed)', async () => {
          setAbortLog()

          const send = await wrapSend(
            st.deployer,
            st.factory.sendMessage,
            toNano('50'),
            StableSwapFactory.msgTopUp(),
          )(opt)
          expect(send.result.transactions).toHaveTransaction({
            from: st.deployer.address,
            to: st.factory.address,
            deploy: true,
            success: true,
          })

          await st.initWallets()
          for (const actor of FarmRuntimeState.actors) {
            for (const [idx, token] of state.tokens.entries()) {
              if (!token.isNative) {
                expect(await st[actor].tokens[idx].getJettonBalance()).toEqual(st.mint_amount * 10n ** token.decimal)
              }
            }
          }

          const {pools, ...factory_info} = await st.factory.getInfo()
          console.log(factory_info)
          for (const pool of pools) {
            console.log(pool)
          }
        })

        it('deploy_plain_pool (successed)', async () => {
          setAbortLog()

          const pool_addr = await st.factory.getPlainPoolAddress({
            amp: state.amp,
            c_decimals: state.tokens.map((val) => val.decimal),
            coins: st.tokens.map((val) => val.address),
            fee: state.fee,
          })

          const poolWallets: (Address | null)[] = []
          for (const [idx, token] of st.tokens.entries()) {
            poolWallets[idx] = token.address ? (await token.wallet(pool_addr)).address : null
          }

          const body = StableSwapFactory.msgCreatePlainPool({
            amp: state.amp,
            c_decimals: state.tokens.map((val) => val.decimal),
            coins: st.tokens.map((val) => val.address),
            fee: state.fee,
            metadata: {
              symbol: 'A/B',
              name: 'Liquidity A/B',
              description: 'Liquidity Token',
              image: 'https://tonstakers.com/jetton/logo.svg',
            },
            poolWallets: poolWallets,
          })

          const msg_val = toNano('50')
          const send = await wrapSend(st.deployer, st.factory.sendMessage, msg_val, body)(opt)

          expect(send.result.transactions).toHaveTransaction({
            from: st.factory.address,
            to: pool_addr,
            deploy: true,
            aborted: false,
          })

          await st.setPlainPool(PlainPool.fromAddress(pool_addr))

          const {pools} = await st.factory.getInfo()
          for (const pool of pools) {
            console.log(pool)
          }
        })
      })

      describe('pool_add_liquidity', () => {
        it('pool_provide_lp (successed)', async () => {
          setAbortLog()

          const liquidityAmount = await st.plain_pool.getLiquidityAmount({
            amounts: state.tokens.map((token) => state.addLiquidity * 10n ** token.decimal),
            is_deposit: true,
          })
          console.log('liquidityAmount:', formatUnits(liquidityAmount, 18))
          console.log('getVirtualPrice:', formatUnits(await st.plain_pool.getVirtualPrice(), 18))

          const forward_ton_amount = toNano('50')
          const msg_val = toNano('50')

          const messages = await st.plain_pool.getMsgAddLiquidity({
            sender: st.deployer.address,
            amounts: state.tokens.map((token) => state.addLiquidity * 10n ** token.decimal),
            min_lp: 1n,
            fw_ton_amount: forward_ton_amount,
          })
          for (const msg of messages) {
            await wrapSend(st.deployer, msg.senderWallet.sendMessage, msg_val + msg.value, msg.body)(opt)
          }
          expect((await st.deployer.buffer.getState()).state.type).toEqual('uninit')

          const reserves = await st.plain_pool.getReserves()
          for (const [idx, balance] of reserves.balances.entries()) {
            expect(balance).toEqual(state.addLiquidity * 10n ** state.tokens[idx].decimal)
          }
          const deployerLP = await st.deployer.liquidity.getJettonBalance()
          expect(deployerLP).toEqual(liquidityAmount)
        })
      })

      describe('deploy', () => {
        it('deploy_gem_pool (successed)', async () => {
          setAbortLog()

          const reward_per_second = 10n ** 6n
          const gem_pool = await getGemPool({serial: 0, admin: st.deployer.address, coin: st.plain_pool.address})
          console.log('gem_pool_address:', gem_pool.address)

          st.gem_pool = st.blockchain.openContract(gem_pool) as FarmGemPool

          const send = await wrapSend(
            st.deployer,
            st.gem_pool.sendMessage,
            toNano('50'),
            GemPool.msgInit({
              wallet: await st.plain_pool.getWalletAddress(gem_pool.address),
              reward_per_second: reward_per_second,
              boosted_reward_per_second: reward_per_second,
              boosted_reward_end_time: st.getTime() + 86400n * 30n,
            }),
          )(opt)
          expect(send.result.transactions).toHaveTransaction({
            from: st.deployer.address,
            to: st.gem_pool.address,
            deploy: true,
            success: true,
          })

          await st.initGemPool()

          const info = await st.gem_pool.getInfo()
          console.log(info)
        })
      })

      describe('earn', () => {
        it('stake_lp first_time (successed)', async () => {
          st.setTime(st.getTime() + 86400n)

          const deployerLPBefore = await st.deployer.liquidity.getJettonBalance()
          const aliStaked = await st.ali.gem_buffer.getStakedBalance()
          const stake_amount = deployerLPBefore / 2n

          const forward_ton_amount = toNano('50')
          const msg_val = toNano('50') + forward_ton_amount

          const body = JettonWallet.msgTransfer({
            amount: stake_amount,
            to: st.gem_pool.address,
            response: st.deployer.address,
            forward_ton_amount: forward_ton_amount,
            forward_payload: GemPool.msgStake({
              recipient: st.ali.address,
              return_excess: st.deployer.address,
            }),
          })

          const send = await wrapSend(st.deployer, st.deployer.liquidity.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('stake_lp first_time (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.gem_pool_stake, Op.transfer_notification, send, {to: st.gem_pool.address})
          storeGasUsed.saveOpGas(OpName.gem_buffer_stake, Op.gem_buffer_stake, send.gasUsedTxs)

          expect(await st.deployer.liquidity.getJettonBalance()).toEqual(deployerLPBefore - stake_amount)
          expect(await st.ali.gem_buffer.getStakedBalance()).toEqual(aliStaked + stake_amount)

          const earnLog = st.gem_pool.exportEarnLogs(send.result.transactions)
          expect(earnLog.length).toEqual(0)
        })

        it('stake_lp (successed)', async () => {
          st.setTime(st.getTime() + 86400n)

          const deployerLPBefore = await st.deployer.liquidity.getJettonBalance()
          const aliStaked = await st.ali.gem_buffer.getStakedBalance()
          const stake_amount = deployerLPBefore

          const forward_ton_amount = toNano('50')
          const msg_val = toNano('50') + forward_ton_amount

          const body = JettonWallet.msgTransfer({
            amount: stake_amount,
            to: st.gem_pool.address,
            response: st.deployer.address,
            forward_ton_amount: forward_ton_amount,
            forward_payload: GemPool.msgStake({
              recipient: st.ali.address,
              return_excess: st.deployer.address,
            }),
          })

          const send = await wrapSend(st.deployer, st.deployer.liquidity.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('stake_lp (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.gem_pool_stake, Op.transfer_notification, send, {to: st.gem_pool.address})
          storeGasUsed.saveOpGas(OpName.gem_buffer_stake, Op.gem_buffer_stake, send.gasUsedTxs)

          expect(await st.deployer.liquidity.getJettonBalance()).toEqual(0n)
          expect(await st.ali.gem_buffer.getStakedBalance()).toEqual(aliStaked + stake_amount)

          const earnLog = st.gem_pool.exportEarnLogs(send.result.transactions)
          expect(earnLog.length).toEqual(0)
        })

        it('gem_pool_change_reward (successed)', async () => {
          st.setTime(st.getTime() + 86400n)

          const reward_per_second = 10n ** 12n
          const body = GemPool.msgChangeReward({
            reward_per_second: reward_per_second,
            boosted_reward_per_second: reward_per_second,
            boosted_reward_end_time: st.getTime() + 86400n * 30n,
          })
          const msg_val = toNano('50')

          const send = await wrapSend(st.deployer, st.gem_pool.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('gem_pool_change_reward (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.gem_pool_change_reward, Op.gem_pool_change_reward, send.gasUsedTxs)

          const info = await st.gem_pool.getInfo()
          expect(info.reward_per_second).toEqual(reward_per_second)
        })

        it('claim_gem (successed)', async () => {
          st.setTime(st.getTime() + 86400n)

          const pool_state = await st.gem_pool.getInfo()
          const aliStakedBefore = await st.ali.gem_buffer.getUserData()
          const pending = GemPool.estimatePendingReward(pool_state, aliStakedBefore, st.getTime())

          const body = GemBuffer.msgClaimGem({
            return_excess: st.ali.address,
            to: st.ali.address,
            uid: 1n, // earn_gem
          })

          const msg_val = toNano('50')
          const send = await wrapSend(st.ali, st.ali.gem_buffer.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('claim_gem (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.gem_buffer_unstake, Op.gem_buffer_unstake, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.gem_pool_unstake, Op.gem_pool_unstake, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.gem_pool_earn, Op.gem_pool_earn, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.gem_buffer_stake, Op.gem_buffer_stake, send.gasUsedTxs)

          const aliStaked = await st.ali.gem_buffer.getUserData()
          expect(aliStaked.amount).toEqual(aliStakedBefore.amount)
          expect(aliStaked.pending_reward).toEqual(0n)

          const earnLog = st.gem_pool.exportEarnLogs(send.result.transactions)
          expect(earnLog.length).toEqual(1)
          expect(earnLog[0]?.amount).toEqual(pending)
        })

        it('claim_lp [not earn_gem] (successed)', async () => {
          st.setTime(st.getTime() + 86400n)

          const deployerLPBefore = await st.deployer.liquidity.getJettonBalance()
          const aliStakedBefore = await st.ali.gem_buffer.getUserData()
          const unstake_amount = aliStakedBefore.amount / 2n
          console.log('unstake_amount:', formatUnits(unstake_amount, 18))

          const body = GemBuffer.msgUnstakeToLp({
            unstake_amount: unstake_amount,
            return_excess: st.ali.address,
            to: st.deployer.address,
          })

          const msg_val = toNano('50')
          const send = await wrapSend(st.ali, st.ali.gem_buffer.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('claim_lp (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.gem_buffer_unstake, Op.gem_buffer_unstake, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.gem_pool_unstake, Op.gem_pool_unstake, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.gem_buffer_stake, Op.gem_buffer_stake, send.gasUsedTxs)

          expect(await st.deployer.liquidity.getJettonBalance()).toEqual(deployerLPBefore + unstake_amount)
          const aliStaked = await st.ali.gem_buffer.getUserData()
          expect(aliStaked.amount).toEqual(aliStakedBefore.amount - unstake_amount)
          expect(aliStaked.pending_reward).toBeGreaterThan(aliStakedBefore.pending_reward)

          const earnLog = st.gem_pool.exportEarnLogs(send.result.transactions)
          expect(earnLog.length).toEqual(0)
        })

        it('claim_lp [earn_gem] (successed)', async () => {
          st.setTime(st.getTime() + 86400n)

          const deployerLPBefore = await st.deployer.liquidity.getJettonBalance()
          const aliStakedBefore = await st.ali.gem_buffer.getUserData()
          const unstake_amount = aliStakedBefore.amount / 2n
          console.log('unstake_amount:', formatUnits(unstake_amount, 18))

          const pool_state = await st.gem_pool.getInfo()
          const pending = GemPool.estimatePendingReward(pool_state, aliStakedBefore, st.getTime())

          const body = GemBuffer.msgUnstakeToLp({
            unstake_amount: unstake_amount,
            return_excess: st.ali.address,
            to: st.deployer.address,
            uid: 1n, // earn_gem
          })

          const msg_val = toNano('50')
          const send = await wrapSend(st.ali, st.ali.gem_buffer.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('claim_lp (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.gem_buffer_unstake, Op.gem_buffer_unstake, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.gem_pool_unstake, Op.gem_pool_unstake, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.gem_pool_earn, Op.gem_pool_earn, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.gem_buffer_stake, Op.gem_buffer_stake, send.gasUsedTxs)

          expect(await st.deployer.liquidity.getJettonBalance()).toEqual(deployerLPBefore + unstake_amount)
          const aliStaked = await st.ali.gem_buffer.getUserData()
          expect(aliStaked.amount).toEqual(aliStakedBefore.amount - unstake_amount)
          expect(aliStaked.pending_reward).toEqual(0n)

          const earnLog = st.gem_pool.exportEarnLogs(send.result.transactions)
          expect(earnLog.length).toEqual(1)
          expect(earnLog[0]?.amount).toEqual(pending)
        })

        it('claim_token [not earn_gem] (successed)', async () => {
          st.setTime(st.getTime() + 86400n)

          const deployerLPBefore = await st.deployer.liquidity.getJettonBalance()
          const aliStakedBefore = await st.ali.gem_buffer.getUserData()
          const unstake_amount = aliStakedBefore.amount / 4n
          console.log('unstake_amount:', formatUnits(unstake_amount, 18))

          const body = GemBuffer.msgUnstakeToTokens({
            unstake_amount: unstake_amount,
            return_excess: st.ali.address,
            to: st.deployer.address,
          })

          const msg_val = toNano('50')
          const send = await wrapSend(st.ali, st.ali.gem_buffer.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('claim_token (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.gem_buffer_unstake, Op.gem_buffer_unstake, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.gem_pool_unstake, Op.gem_pool_unstake, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.gem_buffer_stake, Op.gem_buffer_stake, send.gasUsedTxs)

          expect(await st.deployer.liquidity.getJettonBalance()).toEqual(deployerLPBefore)
          const aliStaked = await st.ali.gem_buffer.getUserData()
          expect(aliStaked.amount).toEqual(aliStakedBefore.amount - unstake_amount)
          expect(aliStaked.pending_reward).toBeGreaterThan(aliStakedBefore.pending_reward)

          const earnLog = st.gem_pool.exportEarnLogs(send.result.transactions)
          expect(earnLog.length).toEqual(0)
        })

        it('claim_token [earn_gem] (successed)', async () => {
          st.setTime(st.getTime() + 86400n)

          const deployerLPBefore = await st.deployer.liquidity.getJettonBalance()
          const aliStakedBefore = await st.ali.gem_buffer.getUserData()
          const unstake_amount = aliStakedBefore.amount / 3n
          console.log('unstake_amount:', formatUnits(unstake_amount, 18))

          const pool_state = await st.gem_pool.getInfo()
          const pending = GemPool.estimatePendingReward(pool_state, aliStakedBefore, st.getTime())

          const body = GemBuffer.msgUnstakeToTokens({
            unstake_amount: unstake_amount,
            return_excess: st.ali.address,
            to: st.deployer.address,
            uid: 1n, // earn_gem
          })

          const msg_val = toNano('50')
          const send = await wrapSend(st.ali, st.ali.gem_buffer.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('claim_token (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.gem_buffer_unstake, Op.gem_buffer_unstake, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.gem_pool_unstake, Op.gem_pool_unstake, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.gem_pool_earn, Op.gem_pool_earn, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.gem_buffer_stake, Op.gem_buffer_stake, send.gasUsedTxs)

          expect(await st.deployer.liquidity.getJettonBalance()).toEqual(deployerLPBefore)
          const aliStaked = await st.ali.gem_buffer.getUserData()
          expect(aliStaked.amount).toEqual(aliStakedBefore.amount - unstake_amount)
          expect(aliStaked.pending_reward).toEqual(0n)

          const earnLog = st.gem_pool.exportEarnLogs(send.result.transactions)
          expect(earnLog.length).toEqual(1)
          expect(earnLog[0]?.amount).toEqual(pending)
        })

        it('claim_all_token [not earn_gem] (successed)', async () => {
          st.setTime(st.getTime() + 86400n)

          const aliStakedBefore = await st.ali.gem_buffer.getUserData()
          const unstake_amount = aliStakedBefore.amount
          console.log('unstake_amount:', formatUnits(unstake_amount, 18))

          const body = GemBuffer.msgUnstakeToTokens({
            unstake_amount: unstake_amount,
            return_excess: st.ali.address,
            to: st.ali.address,
          })

          const msg_val = toNano('50')
          const send = await wrapSend(st.ali, st.ali.gem_buffer.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('claim_all_token (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.gem_buffer_unstake, Op.gem_buffer_unstake, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.gem_pool_unstake, Op.gem_pool_unstake, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.gem_buffer_stake, Op.gem_buffer_stake, send.gasUsedTxs)

          const aliStaked = await st.ali.gem_buffer.getUserData()
          expect(aliStaked.amount).toEqual(0n)
          expect(aliStaked.pending_reward).toBeGreaterThan(aliStakedBefore.pending_reward)

          const earnLog = st.gem_pool.exportEarnLogs(send.result.transactions)
          expect(earnLog.length).toEqual(0)
        })

        it('claim_all_token [earn_gem] (successed)', async () => {
          st.setTime(st.getTime() + 86400n)

          const aliStakedBefore = await st.ali.gem_buffer.getUserData()
          const unstake_amount = aliStakedBefore.amount
          console.log('unstake_amount:', formatUnits(unstake_amount, 18))

          const pool_state = await st.gem_pool.getInfo()
          const pending = GemPool.estimatePendingReward(pool_state, aliStakedBefore, st.getTime())

          const body = GemBuffer.msgUnstakeToTokens({
            unstake_amount: unstake_amount,
            return_excess: st.ali.address,
            to: st.ali.address,
            uid: 1n, // earn_gem
          })

          const msg_val = toNano('50')
          const send = await wrapSend(st.ali, st.ali.gem_buffer.sendMessage, msg_val, body)(opt)
          storeGasUsed.saveGas('claim_all_token (successed)', send.gas)
          storeGasUsed.saveOpGas(OpName.gem_buffer_unstake, Op.gem_buffer_unstake, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.gem_pool_unstake, Op.gem_pool_unstake, send.gasUsedTxs)
          storeGasUsed.saveOpGas(OpName.gem_pool_earn, Op.gem_pool_earn, send.gasUsedTxs)

          expect((await st.ali.gem_buffer.getState()).state.type).toEqual('uninit')

          const earnLog = st.gem_pool.exportEarnLogs(send.result.transactions)
          expect(earnLog.length).toEqual(1)
          expect(earnLog[0]?.amount).toEqual(pending)
        })
      })
    })
  }
})
