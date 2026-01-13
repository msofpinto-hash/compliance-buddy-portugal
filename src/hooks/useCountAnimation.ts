import { useState, useEffect, useRef } from "react";

interface UseCountAnimationOptions {
  duration?: number;
  startOnMount?: boolean;
}

export function useCountAnimation(
  targetValue: number,
  options: UseCountAnimationOptions = {}
) {
  const { duration = 800, startOnMount = true } = options;
  const [displayValue, setDisplayValue] = useState(0);
  const previousValue = useRef(0);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!startOnMount && previousValue.current === 0 && targetValue === 0) {
      return;
    }

    const startValue = previousValue.current;
    const endValue = targetValue;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-out cubic)
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      
      const currentValue = Math.round(
        startValue + (endValue - startValue) * easedProgress
      );
      
      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        previousValue.current = endValue;
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetValue, duration, startOnMount]);

  return displayValue;
}
