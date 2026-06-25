import { formatApiError } from "../../../lib/api";
import { useAdmin } from "../AdminContext";

export function useAdminAction() {
  const { toast } = useAdmin();

  return async function runAction(
    fn: () => Promise<void>,
    okMsg: string,
    errMsg = "Error al guardar",
  ): Promise<boolean> {
    try {
      await fn();
      toast(okMsg);
      return true;
    } catch (e: unknown) {
      toast(formatApiError(e, errMsg), "err");
      return false;
    }
  };
}
