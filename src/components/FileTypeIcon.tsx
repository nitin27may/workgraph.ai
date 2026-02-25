import type { FileTypeInfo } from "@/lib/file-utils";

interface FileTypeIconProps {
  typeInfo: FileTypeInfo;
  size?: "sm" | "md";
}

/**
 * Renders an M365-style letter icon for Office file types (Word=W, Excel=E, etc.)
 * or a Lucide icon with a tinted background for other types.
 */
export function FileTypeIcon({ typeInfo, size = "md" }: FileTypeIconProps) {
  const Icon = typeInfo.icon;
  const sizeClasses = size === "sm" ? "h-6 w-6" : "h-10 w-10";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";

  if (typeInfo.letter) {
    // Scale letter size based on character count and container size
    const charCount = typeInfo.letter.length;
    let letterSize: string;
    if (size === "sm") {
      letterSize = charCount >= 3 ? "text-[7px]" : charCount === 2 ? "text-[9px]" : "text-xs";
    } else {
      letterSize = charCount >= 3 ? "text-[9px]" : charCount === 2 ? "text-xs" : "text-sm";
    }

    // M365-style: solid colored square with white letter
    return (
      <div
        className={`flex ${sizeClasses} shrink-0 items-center justify-center rounded-md ${typeInfo.solidBg}`}
      >
        <span className={`font-bold text-white ${letterSize} leading-none`}>
          {typeInfo.letter}
        </span>
      </div>
    );
  }

  // Lucide icon with tinted background
  return (
    <div
      className={`flex ${sizeClasses} shrink-0 items-center justify-center rounded-md ${typeInfo.bg}`}
    >
      <Icon className={`${iconSize} ${typeInfo.fg}`} />
    </div>
  );
}
