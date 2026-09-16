export interface OAuthToken {
  access: string
  refresh: string
  expires: number
}

export interface OAuthCredential {
  type: 'oauth'
  access: string
  refresh: string
  expires: number
  accountId: string
}

export interface CallbackWaiter {
  waitForCode(): Promise<{ code: string } | null>
  cancel(): void
  close(): void
}

export type CreateCallback = (state: string) => Promise<CallbackWaiter>
