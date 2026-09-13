import { describe, expect, it } from 'vitest'
import {
  LiquidReference,
  buildErrorResponse,
  buildRequest,
  buildResponse,
  decodeLiquidMessage,
  encodeLiquidMessage,
  fromBase64Url,
  generateLiquidDeepLink,
  isLiquidResponse,
  parseLiquidDeepLink,
  toBase64Url
} from './protocol'

describe('liquid deep links', () => {
  it('generates the liquid:// form used by Liquid Auth QR codes', () => {
    expect(generateLiquidDeepLink('https://liquid.biatec.io', 'abc-123')).toBe(
      'liquid://liquid.biatec.io/?requestId=abc-123'
    )
    expect(generateLiquidDeepLink('https://example.com/liquid/', 'id')).toBe(
      'liquid://example.com/liquid/?requestId=id'
    )
  })

  it('parses host, optional path and requestId back out', () => {
    expect(parseLiquidDeepLink('liquid://liquid.biatec.io/?requestId=abc-123')).toEqual({
      origin: 'https://liquid.biatec.io',
      requestId: 'abc-123'
    })
    expect(parseLiquidDeepLink(' LIQUID://example.com/liquid/?requestId=id&x=1 ')).toEqual({
      origin: 'https://example.com/liquid',
      requestId: 'id'
    })
  })

  it('rejects other schemes and missing parts', () => {
    expect(() => parseLiquidDeepLink('wc:abc@2')).toThrow('Not a liquid:// link')
    expect(() => parseLiquidDeepLink('liquid://host/')).toThrow('no requestId')
    expect(() => parseLiquidDeepLink('liquid://?requestId=x')).toThrow('no origin')
  })
})

describe('base64url', () => {
  it('round-trips bytes and accepts standard base64 with padding', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])
    const encoded = toBase64Url(bytes)
    expect(encoded).not.toMatch(/[+/=]/)
    expect(fromBase64Url(encoded)).toEqual(bytes)
    expect(fromBase64Url(btoa(String.fromCharCode(...bytes)))).toEqual(bytes)
  })
})

describe('message envelope', () => {
  it('encodes and decodes an ARC-0027 request through CBOR + base64url', async () => {
    const request = buildRequest(LiquidReference.signTransactionsRequest, {
      providerId: 'p',
      txns: [{ txn: 'AAEC' }, { txn: 'AQID', signers: [] }]
    })
    const wire = await encodeLiquidMessage(request)
    expect(wire).toMatch(/^[A-Za-z0-9_-]+$/)
    const decoded = await decodeLiquidMessage(wire)
    expect(decoded).toEqual(request)
    expect(isLiquidResponse(decoded)).toBe(false)
  })

  it('builds responses that reference the request id', async () => {
    const request = buildRequest(LiquidReference.signDataRequest, { providerId: 'p', items: [] })
    const response = buildResponse(request, LiquidReference.signDataResponse, {
      providerId: 'p',
      signatures: ['sig', null]
    })
    expect(response.requestId).toBe(request.id)
    const decoded = await decodeLiquidMessage(await encodeLiquidMessage(response))
    expect(isLiquidResponse(decoded)).toBe(true)
    expect((decoded as typeof response).result?.signatures).toEqual(['sig', null])

    const error = buildErrorResponse(request, LiquidReference.signDataResponse, {
      code: 4001,
      message: 'User rejected'
    })
    expect(error.error?.code).toBe(4001)
    expect(error.result).toBeUndefined()
  })

  it('rejects garbage payloads', async () => {
    await expect(decodeLiquidMessage('AAAA')).rejects.toThrow()
  })
})
