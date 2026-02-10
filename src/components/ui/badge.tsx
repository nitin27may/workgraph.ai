import * as React from "react";
import { cn } from "@/lib/utils";

const Badge = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: "default" | "secondary" | "destructive" | "outline" | "success";
  }
>(({ className, variant = "default", ...props }, ref) => {
  const variantStyles = {
    default: "bg-primary text-primary-foreground shadow hover:bg-primary/80",
    secondary:
      "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    destructive:
      "bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
    outline: "text-foreground border border-input",
    success: "bg-success/10 text-success border-success/20 dark:bg-success/20 dark:text-success-foreground dark:border-success/30",
  };

  return (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-md border border-transparent px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
});
Badge.displayName = "Badge";

export { Badge };
