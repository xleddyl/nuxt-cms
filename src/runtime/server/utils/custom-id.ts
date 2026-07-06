import { randomInt } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export const ID_LENGTH = 16

export function customId(prefix: string, length = ID_LENGTH): string {
   let result = prefix ? `${prefix}_` : ''
   for (let i = 0; i < length; i++) {
      result += ALPHABET[randomInt(ALPHABET.length)]
   }
   return result
}
