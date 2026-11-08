import { EventEmitter } from 'events'

export type GameEventType =
  | 'game_opened'
  | 'game_closed'
  | 'agent_picked'
  | 'round_won'
  | 'round_lost'
  | 'match_point'
  | 'overtime'
  | 'player_died'
  | 'player_kill'
  | 'multikill'
  | 'combat_started'
  | 'combat_ended'
  | 'champion_picked'
  | 'enemy_team_known'
  | 'implant_changed'
  | 'objective_taken'
  | 'objective_lost'
  | 'match_started'
  | 'match_ended'
  | 'low_health'
  | 'wanted_level'
  | 'district_entered'
  | 'civilian_killed'
  | 'high_speed_driving'
  | 'extreme_speed'
  | 'vehicle_crash'
  | 'sandevistan_activated'
  | 'kerenzikov_activated'
  | 'synaptic_accelerator_activated'
  | 'overclock_activated'
  | 'berserk_activated'
  | 'player_quickhack'
  | 'player_being_hacked'
  | 'poi_marked'
  | 'gig_marked'
  | 'level_up'
  | 'kda_praise'
  | 'kda_roast'
  | 'player_feeder_alert'
  | 'player_carrying_alert'
  | 'custom'

export type GameEventPriority = 'low' | 'normal' | 'high' | 'critical'

export interface GameEvent<T = any> {
  id: string
  gameId: string
  type: GameEventType
  priority: GameEventPriority
  payload: T
  timestamp: number
}

export interface GameAdapter extends EventEmitter {
  id: string
  name: string
  detect(): Promise<boolean>
  start(): Promise<void> | void
  stop(): Promise<void> | void
  isRunning(): boolean
}

export type CommentaryFrequency = 'low' | 'normal' | 'high'

export interface ReactionConfig {
  silenceMode: boolean
  frequency: CommentaryFrequency
  globalCooldownMs: number
}
