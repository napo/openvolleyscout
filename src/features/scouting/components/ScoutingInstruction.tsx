interface ScoutingInstructionProps {
  message?: string | null;
  actionLabel?: string | null;
  secondaryActionLabel?: string | null;
  onAction?: () => void;
  onSecondaryAction?: () => void;
}

export function ScoutingInstruction({
  message, actionLabel, secondaryActionLabel, onAction, onSecondaryAction,
}: ScoutingInstructionProps) {
  if (!message) return null;
  return (
    <div className="live-rally-stage__suggestion" aria-live="polite">
      <span>{message}</span>
      {secondaryActionLabel && onSecondaryAction && (
        <button type="button" className="btn-secondary btn-small live-rally-stage__suggestion-action" onClick={onSecondaryAction}>
          {secondaryActionLabel}
        </button>
      )}
      {actionLabel && onAction && (
        <button type="button" className="btn-primary btn-small live-rally-stage__suggestion-action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
