export default function ARGOSExecutiveMetric({
  label,
  value,
  detail,
  className = "",
}) {
  return (
    <div className={["argos-executive-metric", className].filter(Boolean).join(" ")}>
      <span className="argos-executive-metric__label">{label}</span>
      <strong className="argos-executive-metric__value">{value}</strong>
      {detail ? <small className="argos-executive-metric__detail">{detail}</small> : null}
    </div>
  );
}
