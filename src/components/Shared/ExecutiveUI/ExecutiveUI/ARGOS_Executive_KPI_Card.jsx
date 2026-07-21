export default function ARGOSExecutiveKPICard({
  tone = "blue",
  icon: Icon,
  label,
  value,
  detail,
  className = "",
}) {
  const classes = [
    "argos-executive-kpi-card",
    `argos-executive-kpi-card--${tone}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={classes}>
      {Icon ? (
        <div className="argos-executive-kpi-card__icon" aria-hidden="true">
          <Icon size={24} strokeWidth={2.2} />
        </div>
      ) : null}

      <div>
        <span className="argos-executive-kpi-card__label">{label}</span>
        <strong className="argos-executive-kpi-card__value">{value}</strong>
        {detail ? (
          <small className="argos-executive-kpi-card__detail">{detail}</small>
        ) : null}
      </div>
    </article>
  );
}
