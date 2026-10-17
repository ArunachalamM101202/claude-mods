export type CritterIsHidden = boolean

declare module 'claude-code' {
  interface PluginState {
    'clawd-critter': { isHidden: CritterIsHidden }
  }
}
