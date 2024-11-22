import {z} from 'zod'

const addressBook = z.object({
  user_friendly: z.string(),
})
export type ApiAddressBook = z.infer<typeof addressBook>

const accountStatus = z.enum(['uninit', 'frozen', 'active', 'nonexist'])
export type ApiAccountStatus = z.infer<typeof accountStatus>

const accountState = z.object({
  hash: z.string(),
  balance: z.string().nullable(),
  account_status: accountStatus.nullable(),
  frozen_hash: z.string().nullable(),
  code_hash: z.string().nullable(),
  data_hash: z.string().nullable(),
})
export type ApiAccountState = z.infer<typeof accountState>

const blockReference = z.object({
  workchain: z.number(),
  shard: z.string(),
  seqno: z.number(),
})
export type ApiBlockReference = z.infer<typeof blockReference>

const storagePhase = z.object({
  status_change: z.string().nullable(),
  storage_fees_collected: z.string().nullable(),
  storage_fees_due: z.string().nullable().optional(),
})
export type ApiStoragePhase = z.infer<typeof storagePhase>

const msgSize = z.object({
  bits: z.string(),
  cells: z.string(),
})
export type ApiMsgSize = z.infer<typeof msgSize>

const actionPhase = z.object({
  success: z.boolean().nullable(),
  valid: z.boolean().nullable(),
  no_funds: z.boolean().nullable(),
  status_change: z.string().nullable(),
  total_fwd_fees: z.string().nullable().optional(),
  total_action_fees: z.string().nullable().optional(),
  result_code: z.number().nullable(),
  result_arg: z.number().nullable().optional(),
  tot_actions: z.number().nullable(),
  spec_actions: z.number().nullable(),
  skipped_actions: z.number().nullable(),
  msgs_created: z.number().nullable(),
  action_list_hash: z.string().nullable(),
  tot_msg_size: msgSize.nullable(),
})
export type ApiActionPhase = z.infer<typeof actionPhase>

const bouncePhase = z.object({
  // negative-funds | no-funds | ok
  type: z.string().nullable(),

  // no-funds
  req_fwd_fees: z.string().nullable().optional(),

  // ok
  msg_size: msgSize.nullable().optional(),
  msg_fees: z.string().nullable().optional(),
  fwd_fees: z.string().nullable().optional(),
})
export type ApiBouncePhase = z.infer<typeof bouncePhase>

const computePhaseSkipped = z.object({
  skipped: z.boolean().nullable(),
  reason: z.string().nullable(),
})
const computePhaseVm = z.object({
  success: z.boolean().nullable(),
  msg_state_used: z.boolean().nullable(),
  account_activated: z.boolean().nullable(),
  gas_fees: z.string().nullable(),
  gas_used: z.string().nullable(),
  gas_limit: z.string().nullable(),
  gas_credit: z.string().nullable(),
  mode: z.number().nullable(),
  exit_code: z.number().nullable(),
  exit_arg: z.number().nullable().optional(),
  vm_steps: z.number().nullable(),
  vm_init_state_hash: z.string().nullable(),
  vm_final_state_hash: z.string().nullable(),
})
const computePhase = computePhaseSkipped.partial().merge(computePhaseVm.partial())
export type ApiComputePhase = z.infer<typeof computePhase>

const creditPhase = z.object({
  credit: z.string().nullable(),
  due_fees_collected: z.string().nullable().optional(),
})
export type ApiCreditPhase = z.infer<typeof creditPhase>

const splitInfo = z.object({
  cur_shard_pfx_len: z.number().nullable(),
  acc_split_depth: z.number().nullable(),
  this_addr: z.string().nullable(),
  sibling_addr: z.string().nullable(),
})
export type ApiSplitInfo = z.infer<typeof splitInfo>

const transactionDescr = z.object({
  // generic
  type: z.string().nullable(),
  credit_first: z.boolean().nullable().optional(),
  storage_ph: storagePhase.nullable().optional(),
  credit_ph: creditPhase.nullable().optional(),
  compute_ph: computePhase.nullable().optional(),
  action: actionPhase.nullable().optional(),
  bounce: bouncePhase.nullable().optional(),
  aborted: z.boolean().nullable().optional(),
  destroyed: z.boolean().nullable().optional(),

  // tick-tock
  is_tock: z.boolean().nullable().optional(),

  // split-install
  installed: z.boolean().nullable().optional(),

  // split-prepare | split-install | merge-prepare | merge-install
  split_info: splitInfo.nullable().optional(),
})
export type ApiTransactionDescr = z.infer<typeof transactionDescr>

const decodedContent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text_comment'),
    comment: z.string(),
  }),
  z.object({
    type: z.literal('binary_comment'),
    hex_commentstring: z.string(),
  }),
])
export type ApiDecodedContent = z.infer<typeof decodedContent>

const messageContent = z.object({
  body: z.string(),
  decoded: decodedContent.nullable().optional(),
  hash: z.string(),
})
export type ApiMessageContent = z.infer<typeof messageContent>

const messageInitState = z.object({
  body: z.string(),
  hash: z.string(),
})
export type ApiMessageInitState = z.infer<typeof messageInitState>

const message = z.object({
  hash: z.string(),
  source: z.string().nullable(),
  destination: z.string().nullable(),
  value: z.string().nullable(),
  fwd_fee: z.string().nullable(),
  ihr_fee: z.string().nullable(),
  created_lt: z.string().nullable(),
  created_at: z.string().nullable(),
  opcode: z.string().nullable(),
  ihr_disabled: z.boolean().nullable(),
  bounce: z.boolean().nullable(),
  bounced: z.boolean().nullable(),
  import_fee: z.string().nullable(),
  message_content: messageContent.nullable(),
  init_state: messageInitState.nullable().optional(),
})
export type ApiMessage = z.infer<typeof message>

const transaction = z.object({
  account: z.string(),
  hash: z.string(),
  lt: z.string(),
  now: z.number(),
  orig_status: accountStatus,
  end_status: accountStatus,
  total_fees: z.string(),
  prev_trans_hash: z.string(),
  prev_trans_lt: z.string(),
  description: transactionDescr,
  block_ref: blockReference.nullable(),
  in_msg: message.nullable(),
  out_msgs: z.array(message),
  account_state_before: accountState.nullable(),
  account_state_after: accountState.nullable(),
  mc_block_seqno: z.number().nullable(),
  trace_id: z.string().nullable().optional(),
})
export type ApiTransaction = z.infer<typeof transaction>
export type ApiTransactionNode = ApiTransaction & {parent?: ApiTransactionNode; childrens: ApiTransactionNode[]}

const transactionList = z.object({
  transactions: z.array(transaction),
  address_book: z.record(z.string(), addressBook),
})
export type ApiTransactionList = z.infer<typeof transactionList>
