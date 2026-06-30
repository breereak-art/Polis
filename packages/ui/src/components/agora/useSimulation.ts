import { useEffect, useReducer, useRef } from "react";
import { createSimulator, type Simulator } from "./simulator";

export interface SimControls {
  speed: number;
  setSpeed: (n: number) => void;
  paused: boolean;
  setPaused: (b: boolean) => void;
}

export function useSimulation(tickMs = 250, seed = 7) {
  const simRef = useRef<Simulator | null>(null);
  if (!simRef.current) simRef.current = createSimulator(seed);

  const [, force] = useReducer((x: number) => x + 1, 0);
  const pausedRef = useRef(false);
  const speedRef = useRef(1);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      simRef.current!.step();
      force();
    }, tickMs / speedRef.current);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickMs, /* re-create on speed change */ speedRef.current]);

  // re-create interval when speed changes
  const setSpeed = (n: number) => {
    speedRef.current = n;
    simRef.current!.setSpeed(n);
    force();
  };
  const setPaused = (b: boolean) => {
    pausedRef.current = b;
    force();
  };

  return {
    state: simRef.current.state,
    controls: {
      speed: speedRef.current,
      setSpeed,
      paused: pausedRef.current,
      setPaused,
    } as SimControls,
  };
}
