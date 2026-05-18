export interface ImplicitScoutingRules {
  enabled: boolean;

  setInference: {
    enabled: boolean;
    defaultSetToSetterAfterReceiveOrDig: boolean;
    allowManualOverride: boolean;
  };

  defenseInference: {
    enabled: boolean;
    inferDigFromPositiveAttack: boolean;
    requireExplicitPlayerWhenUnknown: boolean;
  };

  freeballInference: {
    enabled: boolean;
    inferFreeballFromNegativeAttack: boolean;
    requireExplicitPlayerWhenUnknown: boolean;
  };

  coverInference: {
    enabled: boolean;
    inferCoverFromBlockedButRecoveredAttack: boolean;
    requireExplicitPlayerWhenUnknown: boolean;
  };
}

export const IMPLICIT_SCOUTING_RULES: ImplicitScoutingRules = {
  enabled: true,

  setInference: {
    enabled: true,
    defaultSetToSetterAfterReceiveOrDig: true,
    allowManualOverride: true,
  },

  defenseInference: {
    enabled: true,
    inferDigFromPositiveAttack: true,
    requireExplicitPlayerWhenUnknown: true,
  },

  freeballInference: {
    enabled: true,
    inferFreeballFromNegativeAttack: true,
    requireExplicitPlayerWhenUnknown: true,
  },

  coverInference: {
    enabled: true,
    inferCoverFromBlockedButRecoveredAttack: true,
    requireExplicitPlayerWhenUnknown: true,
  },
};
