// FG.Sim enums as frozen int maps (same numeric values as the C# enums, so state JSON diffs field by field).

export const GoalType = Object.freeze({ DeathMatch: 0, Kill5: 1, LastSurvivor: 2, KillBoss: 3 });

export const TeamConfig = Object.freeze({ FreeForAll: 0, OneVersusThree: 1, TwoVersusTwo: 2 });

export const GamePhase = Object.freeze({ WaitingToStart: 0, Playing: 1, GameOver: 2 });

export const StatusFlags = Object.freeze({
  None: 0,
  Dead: 0x001,
  Invincibility: 0x002,
  RespawnWait: 0x004,
  Freeze: 0x008,
  Angry: 0x010,
  Invisibility: 0x020,
  SlowDown: 0x040,
  NextAttackLeach: 0x080,
  Special: 0x100,
  ShootMode: 0x200,
  MeleeMode: 0x400,
  Poison: 0x800,
});

export const ActionType = Object.freeze({ Shoot: 0, MeleeAttack: 1, Buff: 2, MeleeShoot: 3 });

export const Trajectory = Object.freeze({ Straight: 0, Align: 1, Lob: 2 });

export const DestroyType = Object.freeze({ OnHit: 0, OnHitPlayerOnly: 1, OnHitObstacleOnly: 2, Lifetime: 3 });

export const NavNodeType = Object.freeze({ Walkable: 0, Jump: 1, Fall: 2 });

export const PowerType = Object.freeze({
  None: -1,
  DamageBoost: 0,
  DamageBoostOnLessLife: 1,
  DamageBoostOnLowLife: 2,
  DamageBoostOnHighLife: 3,
  DamageBoostOnKillCount: 4,
  DamageBoostOnBulletComeBack: 5,
  DamageBoostOnBulletDistance: 6,
  DamageBoostOnAttackSucceed: 7,
  DamageBoostOnLowLifeOpponent: 8,
  SpeedBoost: 9,
  SpeedBoostOnLowLife: 10,
  SpeedBoostOnHighLife: 11,
  BulletSpeedBoost: 12,
  BulletLifeTimeBoost: 13,
  BulletNumberBoost: 14,
  BulletScaleOnDistance: 15,
  BulletDestroyOnHit: 16,
  BulletPierce: 17,
  BulletRebound: 18,
  CooldownBoost: 19,
  NotUsed: 20,
  CooldownBoostOnLowLife: 21,
  CooldownBoostOnHighLife: 22,
  CooldownResetOnDeath: 23,
  CooldownResetOnKill: 24,
  LifeBoost: 25,
  HealOnAttack: 26,
  HealOnKill: 27,
  PushBack: 28,
  HealOnTime: 29,
  DashIgnoreDamage: 30,
  CriticalAttack: 31,
  InstantKill: 32,
  Shield: 33,
  DropOnDeath: 34,
  BuffDurationBoost: 35,
  LifeBoostOnKillCount: 36,
  HealOnLowLife: 37,
  SpecialUnlocked: 38,
});

/** Input buttons (Quantum InputButtons), a byte flag set. */
export const InputButtons = Object.freeze({ None: 0, Jump: 1, Action: 2, Special: 4 });

/** KCC movement classification (CharacterController2D.ComputeRawMovement). */
export const KccMoveType = Object.freeze({ FreeFall: 0, None: 1, Horizontal: 2, SlopeFall: 3 });
