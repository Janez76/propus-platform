import { cn } from "../../lib/utils";
import { t } from "../../i18n";
import { useAuthStore } from "../../store/authStore";
import { useDbFieldHints } from "../../hooks/useDbFieldHints";

type DbFieldHintProps = {
  fieldPath: string;
  className?: string;
};

export function DbFieldHint({ fieldPath, className }: DbFieldHintProps) {
  const lang = useAuthStore((s) => s.language);
  const enabled = useDbFieldHints();
  if (!enabled) return null;
  return (
    <p className={cn("mt-1 text-[11px] text-slate-400 dark:text-zinc-500", className)}>
      ({t(lang, "form.dbHintPrefix")}: {fieldPath})
    </p>
  );
}
