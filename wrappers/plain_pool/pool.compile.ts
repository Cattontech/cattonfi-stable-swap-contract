import {CompilerConfig} from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'func',
  targets: ['contracts/plain_pool/pool.fc'],
}
