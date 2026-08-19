export type Model = 'base' | 'holder' | 'rack'

export const modelForPath = (pathname: string, boxFloorsEnabled: boolean): Model =>
  pathname === '/holders' ? 'holder' : pathname === '/rack' && boxFloorsEnabled ? 'rack' : 'base'
