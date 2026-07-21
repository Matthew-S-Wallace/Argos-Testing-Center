export default function ARGOSExecutivePageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className = "",
}) {
  const classes = ["argos-executive-page-header", className].filter(Boolean).join(" ");

  return (
    <header className={classes}>
      <div className="argos-executive-page-header__content">
        {eyebrow ? (
          <p className="argos-executive-page-header__eyebrow">{eyebrow}</p>
        ) : null}
        <h1 className="argos-executive-page-header__title">{title}</h1>
        {subtitle ? (
          <p className="argos-executive-page-header__subtitle">{subtitle}</p>
        ) : null}
      </div>

      {actions ? (
        <div className="argos-executive-page-header__actions">{actions}</div>
      ) : null}
    </header>
  );
}
