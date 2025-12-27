import { HumanControlProfile } from "./contracts";
import { ensureDefaultHumanControls, loadHumanControls, upsertHumanControlProfile } from "./runtimeState";
import { nowIso } from "./utils";

export const getHumanControlProfile = (identityKey: string): HumanControlProfile => {
  const existing = ensureDefaultHumanControls(identityKey);
  return existing[0];
};

export const listHumanControlProfiles = (identityKey: string): HumanControlProfile[] =>
  loadHumanControls(identityKey);

export const updateHumanControlProfile = (
  identityKey: string,
  updates: Partial<HumanControlProfile>
): HumanControlProfile => {
  const current = getHumanControlProfile(identityKey);
  const next: HumanControlProfile = {
    ...current,
    ...updates,
    identityKey,
    updatedAt: nowIso(),
  };
  upsertHumanControlProfile(identityKey, next);
  return next;
};
