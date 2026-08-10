import { useCallback, useEffect, useState } from "react";
import { OrderList, type Order } from "../../../components/OrderList";
import { apiFetch } from "../../../lib/api";

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch("/api/me/orders?status=open");
      if (!res.ok) throw new Error("Backend returned an error");
      setOrders(await res.json());
    } catch {
      setError("Couldn't reach the backend. Check that it's running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <OrderList
      orders={orders}
      loading={loading}
      error={error}
      emptyMessage="No open orders. Orders placed outside market hours stay here until the next open."
      onRefresh={load}
    />
  );
}
