# Query Management im Admin-Panel

Dieses Projekt nutzt jetzt eine generische Daten-Schicht auf Basis von `useQuery` und `useMutation`.

## Ziel

- weniger doppelte API-Requests
- schnellere UI durch Cache und optimistische Updates
- robustere Fehlerbehandlung bei Netzwerkproblemen

## Bausteine

- `src/store/queryStore.ts`: zentraler Query-Cache (Data/Error/Stale/Invalidation)
- `src/hooks/useQuery.ts`: Hook fuer Laden, Refetch und Cache-Nutzung
- `src/store/mutationStore.ts`: Mutation-Status (pending/error/timestamps)
- `src/hooks/useMutation.ts`: Mutationen mit `onMutate`, `onError`, `onSuccess`, Invalidation
- `src/api/client.ts`: Retry, Timeout und Request-Deduplication

## Query Keys

Nutze eindeutige Keys pro Ressource und Benutzer:

- `src/lib/queryKeys.ts`
  - `ordersQueryKey(token)`
  - `customersQueryKey(token)`
  - `employeesQueryKey(token)`
  - `productsQueryKey(token)`

## Beispiel: Daten laden

```ts
const key = ordersQueryKey(token);
const { data = [], loading, error, refetch } = useQuery(
  key,
  () => getOrders(token),
  { enabled: Boolean(token), staleTime: 5 * 60 * 1000 },
);
```

## Beispiel: Optimistische Mutation

```ts
const statusMutation = useMutation(
  ({ orderNo, status }: { orderNo: string; status: string }) =>
    updateOrderStatus(token, orderNo, status),
  {
    mutationKey: `orders:updateStatus:${token}`,
    invalidateKeys: [key],
    onMutate: ({ orderNo, status }) => {
      const previous = useQueryStore.getState().queries[key]?.data as Order[] | undefined;
      useQueryStore.getState().updateData<Order[]>(key, (current = []) =>
        current.map((order) => (order.orderNo === orderNo ? { ...order, status } : order)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        useQueryStore.getState().setData(key, context.previous);
      }
    },
  },
);
```

## Migrationsleitfaden

1. alten `load()`/`useEffect()`-Fetch in der Page entfernen
2. `useQuery` mit einem stabilen Query-Key einsetzen
3. `create/update/delete` ueber `useMutation` laufen lassen
4. bei Bedarf optimistische Updates in `onMutate` einbauen
5. nach Mutation `invalidateKeys` oder `invalidatePrefixes` setzen

## Bereits migriert

- `src/pages/OrdersPage.tsx`
- `src/components/orders/OrderDetail.tsx`
- `src/pages/CustomersPage.tsx`

`src/hooks/useOrders.ts` bleibt als kompatibler, aber veralteter Wrapper bestehen.
