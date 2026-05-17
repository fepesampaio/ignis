import { useEffect, useRef, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useDelayedFlag } from '@/hooks/useDelayedFlag';

/**
 * Thin, discreet top progress bar (YouTube/GitHub style).
 * Active whenever React Query is fetching/mutating or a route chunk is loading.
 * A 300ms delay prevents flicker on fast responses.
 */
export function TopProgressBar() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const location = useLocation();

  // Brief "route changing" pulse — covers Suspense lazy-loads
  const [routeChanging, setRouteChanging] = useState(false);
  const lastPath = useRef(location.pathname);
  useEffect(() => {
    if (lastPath.current !== location.pathname) {
      lastPath.current = location.pathname;
      setRouteChanging(true);
      const t = setTimeout(() => setRouteChanging(false), 600);
      return () => clearTimeout(t);
    }
  }, [location.pathname]);

  const active = fetching > 0 || mutating > 0 || routeChanging;
  const visible = useDelayedFlag(active, 300);

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[100] h-[2px] pointer-events-none"
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease-out',
      }}
    >
      <div
        className="h-full bg-primary"
        style={{
          width: '40%',
          animation: visible ? 'tpb-slide 1.2s ease-in-out infinite' : 'none',
          boxShadow: '0 0 8px hsl(var(--primary) / 0.6)',
        }}
      />
      <style>{`
        @keyframes tpb-slide {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(120%); }
          100% { transform: translateX(250%); }
        }
      `}</style>
    </div>
  );
}
