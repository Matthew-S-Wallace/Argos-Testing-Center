export default function ARGOSExecutiveEmptyState({
  icon: Icon,
  title = "Nothing to display",
  description,
  action,
  className = "",
}) {
  return (
    <div
      className={["argos-executive-empty-state", className].filter(Boolean).join(" ")}
      role="status"
    >
      {Icon ? (
        <span className="argos-executive-empty-state__icon" aria-hidden="true">
          <Icon size={22} strokeWidth={2.1} />
        </span>
      ) : null}
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}
