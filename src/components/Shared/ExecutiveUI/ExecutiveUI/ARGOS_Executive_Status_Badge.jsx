const STATUS_TONES = {
  ready: "green",
  down: "red",
  "in shop": "amber",
  "at 3rd party shop": "teal",
  "waiting parts": "amber",
  "awaiting approval": "blue",
  "awaiting qc": "teal",
  "ready for pickup": "green",
};

export default function ARGOSExecutiveStatusBadge({
  children,
  status,
  tone,
  icon: Icon,
  className = "",
}) {
  const resolvedTone =
    tone ||
    STATUS_TONES[String(status || children || "").trim().toLowerCase()] ||
    "neutral";

  const classes = [
    "argos-executive-badge",
    `argos-executive-badge--${resolvedTone}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      {Icon ? <Icon size={13} strokeWidth={2.2} aria-hidden="true" /> : null}
      {children || status}
    </span>
  );
}
