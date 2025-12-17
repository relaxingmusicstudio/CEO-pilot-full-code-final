/**
 * PageShell - Unified page layout wrapper
 * 
 * Provides consistent structure for all /app/* pages:
 * - Standard header row with title/subtitle + actions
 * - Optional assistant strip slot
 * - Standard content container spacing
 * 
 * USAGE:
 * <PageShell title="CRM" subtitle="Manage leads" primaryAction={<Button>Add Lead</Button>}>
 *   {children}
 * </PageShell>
 */

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageShellProps {
  title: string;
  subtitle?: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  assistantStrip?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Full bleed removes padding - useful for kanban/grid layouts */
  fullBleed?: boolean;
}

export function PageShell({
  title,
  subtitle,
  primaryAction,
  secondaryActions,
  assistantStrip,
  children,
  className,
  fullBleed = false,
}: PageShellProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header Row */}
      <div className="shrink-0 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className={cn("px-4 md:px-6 py-4", fullBleed && "max-w-none")}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-foreground truncate">{title}</h1>
              {subtitle && (
                <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
              )}
            </div>
            
            {(primaryAction || secondaryActions) && (
              <div className="flex items-center gap-2 shrink-0">
                {secondaryActions}
                {primaryAction}
              </div>
            )}
          </div>
        </div>
        
        {/* Assistant Strip Slot */}
        {assistantStrip && (
          <div className="border-t border-border/50">
            {assistantStrip}
          </div>
        )}
      </div>
      
      {/* Content Area */}
      <div className={cn(
        "flex-1 overflow-y-auto",
        !fullBleed && "p-4 md:p-6",
        className
      )}>
        {children}
      </div>
    </div>
  );
}

export default PageShell;
