export default function ARGOSExecutivePanel({
  title,
  icon: Icon,
  meta,
  tone = "default",
  children,
  className = "",
  bodyClassName = "",
  as: Component = "article",
}) {
  const classes = ["argos-executive-panel", className].filter(Boolean).join(" ");
  const iconClasses = [
    "argos-executive-panel__icon",
    tone === "danger" ? "argos-executive-panel__icon--danger" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Component className={classes}>
      {(title || Icon || meta) ? (
        <div className="argos-executive-panel__header">
          <div className="argos-executive-panel__heading">
            {Icon ? (
              <span className={iconClasses} aria-hidden="true">
                <Icon size={17} strokeWidth={2.2} />
              </span>
            ) : null}
            {title ? <h2 className="argos-executive-panel__title">{title}</h2> : null}
          </div>

          {meta ? <span className="argos-executive-panel__meta">{meta}</span> : null}
        </div>
      ) : null}

      <div className={["argos-executive-panel__body", bodyClassName].filter(Boolean).join(" ")}>
        {children}
      </div>
    </Component>
  );
}
