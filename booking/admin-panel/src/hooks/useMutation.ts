import { useCallback } from "react";
import { useMutationStore } from "../store/mutationStore";
import { useQueryStore } from "../store/queryStore";

type MutationOptions<TData, TVariables, TContext> = {
  mutationKey?: string;
  invalidateKeys?: string[];
  invalidatePrefixes?: string[];
  onMutate?: (variables: TVariables) => Promise<TContext> | TContext;
  onSuccess?: (data: TData, variables: TVariables, context: TContext | undefined) => Promise<void> | void;
  onError?: (
    error: Error,
    variables: TVariables,
    context: TContext | undefined,
  ) => Promise<void> | void;
  onSettled?: (
    data: TData | undefined,
    error: Error | null,
    variables: TVariables,
    context: TContext | undefined,
  ) => Promise<void> | void;
};

function toError(err: unknown) {
  return err instanceof Error ? err : new Error("Unbekannter Fehler");
}

export function useMutation<TData, TVariables = void, TContext = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: MutationOptions<TData, TVariables, TContext>,
) {
  const mutationKey = options?.mutationKey ?? "mutation:default";
  const status = useMutationStore((s) => s.mutations[mutationKey]);
  const start = useMutationStore((s) => s.start);
  const succeed = useMutationStore((s) => s.succeed);
  const fail = useMutationStore((s) => s.fail);
  const reset = useMutationStore((s) => s.reset);

  const mutate = useCallback(
    async (variables: TVariables) => {
      start(mutationKey);
      let context: TContext | undefined;
      try {
        context = options?.onMutate ? await options.onMutate(variables) : undefined;
        const data = await mutationFn(variables);

        if (options?.invalidateKeys?.length) {
          const queryStore = useQueryStore.getState();
          for (const key of options.invalidateKeys) queryStore.invalidate(key);
        }

        if (options?.invalidatePrefixes?.length) {
          const queryStore = useQueryStore.getState();
          for (const prefix of options.invalidatePrefixes) queryStore.invalidatePrefix(prefix);
        }

        if (options?.onSuccess) await options.onSuccess(data, variables, context);
        succeed(mutationKey);
        if (options?.onSettled) await options.onSettled(data, null, variables, context);
        return data;
      } catch (rawError) {
        const error = toError(rawError);
        fail(mutationKey, error.message);
        if (options?.onError) await options.onError(error, variables, context);
        if (options?.onSettled) await options.onSettled(undefined, error, variables, context);
        throw error;
      }
    },
    [fail, mutationFn, mutationKey, options, start, succeed],
  );

  return {
    mutate,
    isPending: Boolean(status?.isPending),
    error: status?.error ?? null,
    reset: () => reset(mutationKey),
  };
}
