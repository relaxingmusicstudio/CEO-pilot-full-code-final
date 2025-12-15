// Performance monitoring utilities for production

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
}

interface NavigationTiming {
  dns: number;
  connection: number;
  ttfb: number;
  domLoad: number;
  windowLoad: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private marks: Map<string, number> = new Map();

  /**
   * Start a performance measurement
   */
  startMeasure(name: string): void {
    this.marks.set(name, performance.now());
  }

  /**
   * End a performance measurement and record the result
   */
  endMeasure(name: string): number | null {
    const startTime = this.marks.get(name);
    if (!startTime) {
      console.warn(`No start mark found for: ${name}`);
      return null;
    }

    const duration = performance.now() - startTime;
    this.marks.delete(name);

    this.recordMetric({
      name,
      value: duration,
      unit: "ms",
      timestamp: Date.now(),
    });

    return duration;
  }

  /**
   * Record a custom metric
   */
  recordMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric);

    // Keep only last 100 metrics to prevent memory issues
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-100);
    }

    // Log to console in development
    if (import.meta.env.DEV) {
      console.debug(`[Perf] ${metric.name}: ${metric.value.toFixed(2)}${metric.unit}`);
    }
  }

  /**
   * Get navigation timing metrics
   */
  getNavigationTiming(): NavigationTiming | null {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    if (!nav) return null;

    return {
      dns: nav.domainLookupEnd - nav.domainLookupStart,
      connection: nav.connectEnd - nav.connectStart,
      ttfb: nav.responseStart - nav.requestStart,
      domLoad: nav.domContentLoadedEventEnd - nav.startTime,
      windowLoad: nav.loadEventEnd - nav.startTime,
    };
  }

  /**
   * Get all recorded metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const summary: Record<string, { sum: number; min: number; max: number; count: number }> = {};

    for (const metric of this.metrics) {
      if (!summary[metric.name]) {
        summary[metric.name] = { sum: 0, min: Infinity, max: -Infinity, count: 0 };
      }
      summary[metric.name].sum += metric.value;
      summary[metric.name].min = Math.min(summary[metric.name].min, metric.value);
      summary[metric.name].max = Math.max(summary[metric.name].max, metric.value);
      summary[metric.name].count++;
    }

    return Object.fromEntries(
      Object.entries(summary).map(([name, data]) => [
        name,
        {
          avg: data.sum / data.count,
          min: data.min,
          max: data.max,
          count: data.count,
        },
      ])
    );
  }

  /**
   * Observe Largest Contentful Paint
   */
  observeLCP(callback: (value: number) => void): void {
    if (!("PerformanceObserver" in window)) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        callback(lastEntry.startTime);
      }
    });

    try {
      observer.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // Browser doesn't support LCP observation
    }
  }

  /**
   * Observe First Input Delay
   */
  observeFID(callback: (value: number) => void): void {
    if (!("PerformanceObserver" in window)) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        if ("processingStart" in entry) {
          callback((entry as PerformanceEventTiming).processingStart - entry.startTime);
        }
      }
    });

    try {
      observer.observe({ type: "first-input", buffered: true });
    } catch {
      // Browser doesn't support FID observation
    }
  }

  /**
   * Observe Cumulative Layout Shift
   */
  observeCLS(callback: (value: number) => void): void {
    if (!("PerformanceObserver" in window)) return;

    let clsValue = 0;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if ("hadRecentInput" in entry && !(entry as LayoutShift).hadRecentInput) {
          clsValue += (entry as LayoutShift).value;
          callback(clsValue);
        }
      }
    });

    try {
      observer.observe({ type: "layout-shift", buffered: true });
    } catch {
      // Browser doesn't support CLS observation
    }
  }

  /**
   * Initialize Core Web Vitals monitoring
   */
  initCoreWebVitals(): void {
    this.observeLCP((value) => {
      this.recordMetric({ name: "LCP", value, unit: "ms", timestamp: Date.now() });
    });

    this.observeFID((value) => {
      this.recordMetric({ name: "FID", value, unit: "ms", timestamp: Date.now() });
    });

    this.observeCLS((value) => {
      this.recordMetric({ name: "CLS", value, unit: "", timestamp: Date.now() });
    });

    // Record navigation timing after load
    window.addEventListener("load", () => {
      setTimeout(() => {
        const timing = this.getNavigationTiming();
        if (timing) {
          this.recordMetric({ name: "TTFB", value: timing.ttfb, unit: "ms", timestamp: Date.now() });
          this.recordMetric({ name: "DOM Load", value: timing.domLoad, unit: "ms", timestamp: Date.now() });
        }
      }, 0);
    });
  }

  /**
   * Clear all recorded metrics
   */
  clear(): void {
    this.metrics = [];
    this.marks.clear();
  }
}

// Type declaration for LayoutShift
interface LayoutShift extends PerformanceEntry {
  hadRecentInput: boolean;
  value: number;
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * HOF to measure async function execution time
 */
export function measureAsync<T extends (...args: unknown[]) => Promise<unknown>>(
  name: string,
  fn: T
): T {
  return (async (...args: Parameters<T>) => {
    performanceMonitor.startMeasure(name);
    try {
      const result = await fn(...args);
      return result;
    } finally {
      performanceMonitor.endMeasure(name);
    }
  }) as T;
}

/**
 * Hook for measuring component render time
 */
export function useRenderTime(componentName: string): void {
  performanceMonitor.startMeasure(`render:${componentName}`);
  
  // Use queueMicrotask to measure after render
  queueMicrotask(() => {
    performanceMonitor.endMeasure(`render:${componentName}`);
  });
}
