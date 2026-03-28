export function ordersQueryKey(token: string) {
  return `orders:${token || "anon"}`;
}

export function customersQueryKey(token: string) {
  return `customers:${token || "anon"}`;
}

export function employeesQueryKey(token: string) {
  return `employees:${token || "anon"}`;
}

export function productsQueryKey(token: string) {
  return `products:${token || "anon"}`;
}
