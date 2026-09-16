import { describe, expect, it } from 'bun:test'

import type { ModelEndpoint } from '../../../contracts/providers'
import { filterAuto, filterHosts } from '../../../frontend/composer/routing/filter'

function host(partial: Partial<ModelEndpoint> & Pick<ModelEndpoint, 'tag' | 'providerName'>): ModelEndpoint {
  return {
    contextLength: 128000,
    status: 0,
    ...partial,
  }
}

const hosts: readonly ModelEndpoint[] = [
  host({ tag: 'groq', providerName: 'Groq', quantization: 'fp8' }),
  host({ tag: 'together', providerName: 'Together', quantization: 'fp16' }),
  host({ tag: 'deepinfra', providerName: 'DeepInfra' }),
]

const auto = [
  { title: 'Fastest', note: 'Lowest time to first token' },
  { title: 'Throughput', note: 'Highest tokens per second' },
]

describe('filterHosts', () => {
  it('returns everything for an empty query', () => {
    expect(filterHosts(hosts, '')).toHaveLength(3)
    expect(filterHosts(hosts, '   ')).toHaveLength(3)
  })

  it('matches on the host name', () => {
    expect(filterHosts(hosts, 'groq').map((item) => item.tag)).toEqual(['groq'])
  })

  it('matches on the OpenRouter tag when the display name is different', () => {
    const aliased = [host({ tag: 'amazon-bedrock', providerName: 'Amazon Bedrock' })]
    expect(filterHosts(aliased, 'bedrock').map((item) => item.tag)).toEqual(['amazon-bedrock'])
  })

  it('matches quantization so fp8 finds those hosts', () => {
    expect(filterHosts(hosts, 'fp8').map((item) => item.tag)).toEqual(['groq'])
  })

  it('ignores case and surrounding space', () => {
    expect(filterHosts(hosts, '  TOGETHER ').map((item) => item.tag)).toEqual(['together'])
  })

  it('returns nothing when nothing matches, rather than everything', () => {
    expect(filterHosts(hosts, 'nope')).toEqual([])
  })
})

describe('filterAuto', () => {
  it('keeps both auto rows until a query is typed', () => {
    expect(filterAuto(auto, '')).toHaveLength(2)
  })

  it('matches Fastest on the title and on the latency note', () => {
    expect(filterAuto(auto, 'fast').map((item) => item.title)).toEqual(['Fastest'])
    expect(filterAuto(auto, 'first token').map((item) => item.title)).toEqual(['Fastest'])
  })

  it('matches Throughput on tokens per second', () => {
    expect(filterAuto(auto, 'tokens per').map((item) => item.title)).toEqual(['Throughput'])
  })

  it('matches English haystack when the visible title is Arabic', () => {
    const translated = [
      {
        title: 'الأسرع',
        note: 'أقل زمن لأول رمز',
        haystack: 'Fastest Lowest time to first token',
      },
    ]
    expect(filterAuto(translated, 'fastest').map((item) => item.title)).toEqual(['الأسرع'])
    expect(filterAuto(translated, 'أول رمز').map((item) => item.title)).toEqual(['الأسرع'])
  })
})
