interface HuidBadgeProps {
  huid?: string | null;
}

export function HuidBadge({ huid }: HuidBadgeProps) {
  if (huid) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        HUID: {huid}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
      No HUID
    </span>
  );
}
