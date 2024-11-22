import fs = require('fs')
import path = require('path')
import {Address, Cell, Contract, Transaction, fromNano} from '@ton/core'
import {BlockchainTransaction, SandboxContract, SendMessageResult, TreasuryContract} from '@ton/sandbox'

export const nowSeconds = () => Math.floor(Date.now() / 1000)
export const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

export type Token<T extends Contract> = {
  decimal: bigint
  address: Address | null
  wallet: (address: Address) => Promise<SandboxContract<T>>
  mint: (to: Address, amount: bigint) => Promise<void>
}

export class GasUsedTxs {
  [opcode: string]: [bigint, Transaction] | undefined
}

function bodyOp(op: number): (body: Cell | undefined) => boolean {
  return (body: Cell | undefined): boolean => {
    if (body == null) return false
    const s = body.beginParse()
    return s.remainingBits >= 32 && s.loadUint(32) === op
  }
}
function extractGasUsed(tx: Transaction): bigint {
  if (tx.description.type !== 'generic') return 0n
  return tx.description.computePhase.type === 'vm' ? tx.description.computePhase.gasUsed : 0n
}

function logGas(opLabel: string, gasUsed: Record<string, bigint> = {}): string | undefined {
  const used = gasUsed[opLabel]
  gasUsed[opLabel] = -1n
  if (used >= 0n) {
    return 'const int gas::' + opLabel + ' = ' + used.toString() + ';'
  } else if (used == undefined) {
    return 'const int gas::' + opLabel + ' = 0;'
  }
}

function storeComputeGas(
  opLabel: string,
  opCode: number,
  tx: Transaction | GasUsedTxs | undefined,
  gasUsed: Record<string, bigint> = {},
) {
  if (tx instanceof GasUsedTxs) {
    tx = tx[`${opCode}`]?.[1]
  }
  if (tx == null) {
    throw new Error('no transaction to compute gas for op ' + opLabel)
  }
  if (!bodyOp(opCode)(tx.inMessage?.body ?? Cell.EMPTY) && !bodyOp(0)(tx.inMessage?.body ?? Cell.EMPTY)) {
    throw new Error('invalid transaction to log compute gas for op ' + opLabel)
  }
  const gas = extractGasUsed(tx)
  if (gasUsed[opLabel] == null || gasUsed[opLabel] < gas) {
    gasUsed[opLabel] = gas
  }
}

function accumulateUsedGas(gasUsedTxs: GasUsedTxs, txs: Transaction[]) {
  for (const tx of txs) {
    const body = tx.inMessage?.body ?? Cell.EMPTY
    const s = body.beginParse()
    const opcode = s.remainingBits >= 32 ? s.loadUint(32).toString() : '0'
    const gas = extractGasUsed(tx)
    const prev = gasUsedTxs[opcode]
    if (prev == null || prev[0] < gas) {
      gasUsedTxs[opcode] = [gas, tx]
    }
  }
}

export class StoreGasUsed {
  actionGas: Record<string, bigint> = {}
  opGasUsed: Record<string, bigint> = {}

  saveGas(action: string, gas: bigint) {
    if (this.actionGas[action] == null || this.actionGas[action] < gas) {
      this.actionGas[action] = gas
    }
  }

  saveOpGas(
    opLabel: string,
    opcode: number,
    txs: GasUsedTxs | {result: SendMessageResult & {result: void}},
    filterTxs?: {from?: Address; to?: Address},
  ) {
    let gasUsedTxs = txs instanceof GasUsedTxs ? txs : new GasUsedTxs()
    if (!(txs instanceof GasUsedTxs)) {
      if (filterTxs == null || (filterTxs.from == null && filterTxs.to == null)) {
        accumulateUsedGas(gasUsedTxs, txs.result.transactions)
      } else {
        accumulateUsedGas(
          gasUsedTxs,
          txs.result.transactions.filter((val) => {
            if (!val.inMessage || val.inMessage.info.type !== 'internal') return false
            if (filterTxs.from != null && !filterTxs.from.equals(val.inMessage.info.src)) return false
            if (filterTxs.to != null && !filterTxs.to.equals(val.inMessage.info.dest)) return false
            return true
          }),
        )
      }
    }
    storeComputeGas(opLabel, opcode, gasUsedTxs, this.opGasUsed)
  }

  logGas() {
    console.table(
      Object.keys(this.actionGas).map((action) => {
        return {
          action: action,
          gas: formatCoins(this.actionGas[action]),
        }
      }),
    )
  }

  getOpGasContent(opLabels: string[]) {
    return opLabels
      .map((val) => logGas(val, this.opGasUsed))
      .filter((el) => el != null)
      .join('\n')
  }
}

export function wrapSend<F>(
  treasury: SandboxContract<TreasuryContract>,
  fn: F,
  ...args: F extends (x: infer Via, ...args: infer Args) => infer R ? Args : never
): (
  opts?: {opcodes?: Object; errors?: Object},
  disableLog?: boolean,
  gasUsedTxs?: GasUsedTxs,
) => Promise<{
  result: SendMessageResult & {result: void}
  gas: bigint
  gasUsedTxs: GasUsedTxs
}> {
  return async (opts = {}, disableLog, gasUsedTxs) => {
    gasUsedTxs = gasUsedTxs ?? new GasUsedTxs()
    const gas = await treasury.getBalance()
    const result = await (fn as any)(treasury.getSender(), ...args)
    accumulateUsedGas(gasUsedTxs, result.transactions)
    !disableLog && printTransactionFees(result.transactions, opts)
    expectSuccessedTransactions(result.transactions)
    return {result, gas: gas - (await treasury.getBalance()), gasUsedTxs}
  }
}

function opName(op: number, opcodes: any = {}) {
  const name = Object.keys(opcodes).find((val) => opcodes[val] === op)
  return name ?? '0x' + op.toString(16)
}

function exitName(code: number, errors: any = {}) {
  const name = Object.keys(errors).find((val) => errors[val] === code)
  return name ?? code
}

const formatCoins = (value?: bigint) => {
  if (value === undefined) return 'N/A'
  let str = fromNano(value)
  let split = str.split('.')
  let zeroSuffix = split.length === 2 ? 9 - split[1].length : 0
  return str + ''.padStart(zeroSuffix, '0')
}

export function printTransactionFees(transactions: Transaction[], opts: {opcodes?: Object; errors?: Object} = {}) {
  console.table(
    transactions
      .map((tx) => {
        if (tx.description.type !== 'generic') return undefined
        const body = tx.inMessage?.info.type === 'internal' ? tx.inMessage?.body.beginParse() : undefined
        const op = body === undefined ? 'N/A' : body.remainingBits >= 32 ? body.preloadUint(32) : 'no body'
        const totalFees = formatCoins(tx.totalFees.coins)
        const computeFees = formatCoins(
          tx.description.computePhase.type === 'vm' ? tx.description.computePhase.gasFees : undefined,
        )
        const totalFwdFees = formatCoins(tx.description.actionPhase?.totalFwdFees ?? undefined)
        const valueIn = formatCoins(tx.inMessage?.info.type === 'internal' ? tx.inMessage.info.value.coins : undefined)
        const valueOut = formatCoins(
          tx.outMessages
            .values()
            .reduce((total, message) => total + (message.info.type === 'internal' ? message.info.value.coins : 0n), 0n),
        )
        const forwardIn = formatCoins(tx.inMessage?.info.type === 'internal' ? tx.inMessage.info.forwardFee : undefined)
        return {
          op: typeof op === 'number' ? opName(op, opts.opcodes) : op,
          valueIn,
          valueOut,
          totalFees: totalFees,
          inForwardFee: forwardIn,
          outForwardFee: totalFwdFees,
          outActions: tx.description.actionPhase?.totalActions ?? 'N/A',
          computeFee: computeFees,
          exitCode:
            tx.description.computePhase.type === 'vm'
              ? exitName(tx.description.computePhase.exitCode, opts.errors)
              : 'N/A',
          actionCode: tx.description.actionPhase?.resultCode ?? 'N/A',
        }
      })
      .filter((v) => v !== undefined),
  )
}

const abort_log = Symbol('abort_log')
export function isAbortLog() {
  return (expect.getState() as any)[abort_log]
}

export function setAbortLog() {
  const state: any = expect.getState()
  state[abort_log] = true
  expect.setState(state)
}

export function resetAbortLog() {
  const state: any = expect.getState()
  delete state[abort_log]
  expect.setState(state)
}

export function exportComputeGas(filePath: string, ...contents: string[]) {
  const exportGas = ['#pragma version >=0.4.4;', ...contents].join('\n\n')
  fs.writeFileSync(path.join(process.cwd(), 'contracts', filePath), exportGas)
}

export function expectSuccessedTransactions(txs: BlockchainTransaction[]) {
  for (const tx of txs) {
    if (tx.description.type == 'generic' && tx.description.computePhase.type === 'vm') {
      expect(
        !tx.description.aborted &&
          tx.description.computePhase.exitCode === 0 &&
          (!tx.description.actionPhase || tx.description.actionPhase.resultCode === 0),
      ).toBeTruthy()
    }
  }
}
