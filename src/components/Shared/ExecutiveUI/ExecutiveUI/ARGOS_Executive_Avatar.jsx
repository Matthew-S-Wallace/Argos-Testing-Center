function getInitials(name) {
  return String(name || "Unassigned")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "NA";
}

export default function ARGOSExecutiveAvatar({
  name,
  label,
  className = "",
}) {
  return (
    <span
      className={["argos-executive-avatar", className].filter(Boolean).join(" ")}
      aria-label={label || name || "Unassigned"}
      title={label || name || "Unassigned"}
    >
      {getInitials(name)}
    </span>
  );
}
