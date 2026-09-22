import { describe, expect, it } from 'bun:test'
import { formatPlanName } from '../frontend/usage/formatPlanName'

describe('formatPlanName', () => {
  it('separates Pro Lite regardless of how the API spells it', () => {
    expect(formatPlanName('prolite')).toBe('Pro Lite')
    expect(formatPlanName('pro_lite')).toBe('Pro Lite')
    expect(formatPlanName('Pro Lite')).toBe('Pro Lite')
  })

  it('capitalizes known plan names and leaves unknown names intact', () => {
    expect(formatPlanName('plus')).toBe('Plus')
    expect(formatPlanName('pro')).toBe('Pro')
    expect(formatPlanName('custom-plan')).toBe('custom-plan')
  })
})
