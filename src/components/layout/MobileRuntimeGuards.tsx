import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { toast } from "sonner";
import { WifiOff } from "lucide-react";

const ROOT_PATHS = new Set([
  "/auth",
  "/dashboard",
  "/admin",
  "/professor",
  "/polo",
  "/student/dashboard",
  "/student/courses",
]);

export function MobileRuntimeGuards() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const lastBackPressRef = useRef(0);
  const isNativeAndroid = useMemo(
    () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android",
    [],
  );

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Conexao restabelecida.");
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.error("Sem conexao com a internet.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isNativeAndroid) return;

    const listenerPromise = CapacitorApp.addListener("backButton", ({ canGoBack }) => {
      const isRootPath = ROOT_PATHS.has(location.pathname);

      if (canGoBack && !isRootPath) {
        navigate(-1);
        return;
      }

      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        CapacitorApp.exitApp();
        return;
      }

      lastBackPressRef.current = now;
      toast("Toque novamente para sair.");
    });

    return () => {
      listenerPromise.then((listener) => listener.remove());
    };
  }, [isNativeAndroid, location.pathname, navigate]);

  if (isOnline) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[120] border-b border-destructive/20 bg-destructive px-4 py-3 text-destructive-foreground shadow-lg">
      <div className="mx-auto flex max-w-5xl items-center gap-2 text-sm font-medium">
        <WifiOff className="h-4 w-4 flex-shrink-0" />
        <span>Sem conexao. Algumas funcoes podem nao funcionar ate a internet voltar.</span>
      </div>
    </div>
  );
}
