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

const SUBSCRIPTION_MONTHS = 6;

export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addSubscriptionMonths(baseDate: Date, months = SUBSCRIPTION_MONTHS): Date {
  const next = new Date(baseDate);
  next.setMonth(next.getMonth() + months);
  return next;
}

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
