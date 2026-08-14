import { getCurrentUser } from "./auth-service.js";
import { navigate } from "../router.js";

export function withAuth(handler) {
  return (params) => {
    const user = getCurrentUser();
    if (!user) {
      navigate("/login");
      return;
    }
    handler(params, user);
  };
}
