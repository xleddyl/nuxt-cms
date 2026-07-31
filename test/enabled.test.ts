import { describe, expect, it } from 'vitest'
import { resolveCmsEnabled } from '../src/enabled'

describe('resolveCmsEnabled', () => {
   it('defaults to enabled when nothing is set', () => {
      expect(resolveCmsEnabled(undefined, undefined)).toBe(true)
   })

   it('prefers the explicit option over the env variable', () => {
      expect(resolveCmsEnabled(false, '1')).toBe(false)
      expect(resolveCmsEnabled(true, '0')).toBe(true)
      expect(resolveCmsEnabled(true, undefined)).toBe(true)
      expect(resolveCmsEnabled(false, undefined)).toBe(false)
   })

   it('reads truthy env values when the option is unset', () => {
      expect(resolveCmsEnabled(undefined, '1')).toBe(true)
      expect(resolveCmsEnabled(undefined, 'true')).toBe(true)
      expect(resolveCmsEnabled(undefined, 'TRUE')).toBe(true)
      expect(resolveCmsEnabled(undefined, ' true ')).toBe(true)
   })

   it('treats a defined but falsy env value as disabled', () => {
      expect(resolveCmsEnabled(undefined, '0')).toBe(false)
      expect(resolveCmsEnabled(undefined, 'false')).toBe(false)
      expect(resolveCmsEnabled(undefined, 'FALSE')).toBe(false)
      expect(resolveCmsEnabled(undefined, '')).toBe(false)
   })

   it('only consults the env variable when it is defined', () => {
      expect(resolveCmsEnabled(undefined, undefined)).toBe(true)
      expect(resolveCmsEnabled(undefined, '')).toBe(false)
   })
})
