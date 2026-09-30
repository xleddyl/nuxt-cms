import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64
const COST = 16384

function derive(password: string, salt: Buffer, cost: number): Promise<Buffer> {
   return new Promise((resolve, reject) => {
      scrypt(password, salt, KEY_LENGTH, { N: cost, r: 8, p: 1 }, (error, key) =>
         error ? reject(error) : resolve(key)
      )
   })
}

export async function hashPassword(password: string): Promise<string> {
   const salt = randomBytes(16)
   const key = await derive(password, salt, COST)
   return `scrypt$${COST}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
   const [scheme, cost, salt, key] = stored.split('$')
   if (scheme !== 'scrypt' || !cost || !salt || !key) return false
   const expected = Buffer.from(key, 'base64')
   const actual = await derive(password, Buffer.from(salt, 'base64'), Number(cost))
   return actual.length === expected.length && timingSafeEqual(actual, expected)
}

const DUMMY_HASH =
   'scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

export async function verifyNothing(password: string): Promise<false> {
   await verifyPassword(DUMMY_HASH, password)
   return false
}
