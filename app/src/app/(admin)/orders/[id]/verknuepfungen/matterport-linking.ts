export type MatterportUnlinkTarget = {
  id: number;
  autoCreated: boolean;
  hasDependencies: boolean;
};

export type MatterportUnlinkPlan = {
  deleteIds: number[];
  unlinkIds: number[];
  resetIds: number[];
};

export function planMatterportUnlink(targets: MatterportUnlinkTarget[]): MatterportUnlinkPlan {
  return targets.reduce<MatterportUnlinkPlan>(
    (plan, target) => {
      if (target.autoCreated && !target.hasDependencies) {
        plan.deleteIds.push(target.id);
      } else {
        plan.unlinkIds.push(target.id);
        if (target.autoCreated) {
          plan.resetIds.push(target.id);
        }
      }
      return plan;
    },
    { deleteIds: [], unlinkIds: [], resetIds: [] },
  );
}
