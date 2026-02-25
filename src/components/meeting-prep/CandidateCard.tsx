import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar, Mail, Users, File, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface CandidateCardProps {
  id: string;
  title: string;
  metadata: string;
  score: number;
  selected: boolean;
  reasoning?: string;
  type: 'meeting' | 'email' | 'team' | 'file';
  onToggle: (id: string, selected: boolean) => void;
  additionalInfo?: React.ReactNode;
  /** Custom icon element to replace the default type-based icon */
  customIcon?: React.ReactNode;
}

export function CandidateCard({
  id,
  title,
  metadata,
  score,
  selected,
  reasoning,
  type,
  onToggle,
  additionalInfo,
  customIcon,
}: CandidateCardProps) {
  // Determine score badge color based on relevance
  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return "default"; // Green (using success colors)
    if (score >= 60) return "secondary"; // Yellow-ish
    return "outline"; // Grey
  };

  const getScoreBadgeClassName = (score: number) => {
    if (score >= 80) return "bg-success/10 text-success border-success/20";
    if (score >= 60) return "bg-warning/10 text-warning border-warning/20";
    return "bg-muted text-muted-foreground border-border";
  };

  // Get icon based on type
  const getIcon = () => {
    switch (type) {
      case 'meeting':
        return <Calendar className="h-4 w-4" />;
      case 'email':
        return <Mail className="h-4 w-4" />;
      case 'team':
        return <Users className="h-4 w-4" />;
      case 'file':
        return <File className="h-4 w-4" />;
    }
  };

  return (
    <Card
      className={cn(
        "border-border/50 rounded-lg transition-colors cursor-pointer",
        selected ? "bg-accent/50 border-primary/50" : "hover:bg-accent/30"
      )}
      onClick={() => onToggle(id, !selected)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selected}
              onCheckedChange={(checked) => onToggle(id, checked as boolean)}
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Title and Score */}
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-medium leading-tight line-clamp-2">
                {title}
              </h4>
              <Badge
                className={cn(
                  "shrink-0 text-xs",
                  getScoreBadgeClassName(score)
                )}
              >
                {score}%
              </Badge>
            </div>

            {/* Metadata */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {customIcon || getIcon()}
              <span className="line-clamp-1">{metadata}</span>
            </div>

            {/* Additional Info */}
            {additionalInfo && (
              <div className="text-xs text-muted-foreground">
                {additionalInfo}
              </div>
            )}
          </div>

          {/* Reasoning Tooltip */}
          {reasoning && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="shrink-0 p-1 hover:bg-accent rounded-sm transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <p className="text-sm">{reasoning}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
