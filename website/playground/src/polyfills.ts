export const readFileSync = (_path: string, _encoding?: string): string => {
  throw new Error('readFileSync is not available in the browser playground')
}
export const existsSync = (_path: string): boolean => false
export const constants = { R_OK: 4, W_OK: 2, X_OK: 1, F_OK: 0 }
export const accessSync = (_path: string, _mode?: number): void => {
  throw new Error('accessSync is not available in the browser playground')
}
