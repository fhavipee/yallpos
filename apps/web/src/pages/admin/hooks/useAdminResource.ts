import { useCallback, useEffect, useState } from "react";
import { formatApiError } from "../../../lib/api";
import { useAdmin } from "../AdminContext";

export function useAdminResource<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const { toast } = useAdmin();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await loader();
      setData(result);
    } catch (e: unknown) {
      const msg = formatApiError(e, "Error cargando datos");
      setError(msg);
      toast(msg, "err");
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}
