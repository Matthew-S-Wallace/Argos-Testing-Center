/**************************************************************************************************
 * ARGOS™ Fleet Management Platform
 * Sprint 001U
 * Operations Navigation — Blue Shield Reference Design
 *
 * Complete replacement navigation component.
 * Existing view IDs, handlers, permissions, demo behavior, and identity props are preserved.
 **************************************************************************************************/

import {
  BarChart3,
  Building2,
  CarFront,
  ChevronDown,
  ClipboardList,
  Gauge,
  History,
  LogOut,
  Settings,
  Users,
} from "lucide-react";

import ARGOSLogo from "../../assets/Argos_Logo_Official.png";

import "./ARGOS_Operations_Navigation_Blue_Shield_Reference_001U.css";

const NAVIGATION_ITEMS = [
  { id: "command", label: "Command Center", icon: Gauge },
  { id: "fleet", label: "My Fleet", icon: CarFront },
  {
    id: "daily-summary",
    label: "Daily Summary",
    icon: ClipboardList,
    action: "daily-summary",
  },
  { id: "history", label: "Repair History", icon: History },
  { id: "technicians", label: "Technicians", icon: Users },
  { id: "reports", label: "Reports", icon: BarChart3 },
];

function formatRoleLabel(role) {
  const normalizedRole = String(role || "user")
    .trim()
    .replaceAll("_", " ")
    .toLowerCase();

  return normalizedRole.replace(/\b\w/g, (character) => character.toUpperCase());
}

function getInitials(userName) {
  const parts = String(userName || "ARGOS User")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "A";
}

export default function ARGOSOperationsNavigation({
  activeView,
  onNavigate,
  onOpenDailySummary,
  onSignOut,
  hasAdministrationAccess = false,
  isDemoMode = false,
  organizationName = "Fleet Services",
  userName = "ARGOS User",
  userRole = "user",
  versionLabel = "Version 1.0",
}) {
  function handleNavigation(item) {
    if (item.action === "daily-summary") {
      onOpenDailySummary?.();
      return;
    }

    onNavigate?.(item.id);
  }

  return (
    <aside className="argos-blue-navigation" aria-label="ARGOS operations navigation">
      <div className="argos-blue-navigation__brand">
        <img
          src={ARGOSLogo}
          alt="ARGOS"
          className="argos-blue-navigation__logo"
        />

      </div>

      {isDemoMode && (
        <div className="argos-blue-navigation__demo" role="status">
          Demo Environment
        </div>
      )}

      <nav className="argos-blue-navigation__menu">
        {NAVIGATION_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.action ? false : activeView === item.id;

          return (
            <button
              key={item.id}
              type="button"
              className={`argos-blue-navigation__item${isActive ? " is-active" : ""}`}
              onClick={() => handleNavigation(item)}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}

        {hasAdministrationAccess && (
          <button
            type="button"
            className={`argos-blue-navigation__item${
              activeView === "administration" ? " is-active" : ""
            }`}
            onClick={() => onNavigate?.("administration")}
            aria-current={activeView === "administration" ? "page" : undefined}
          >
            <Settings size={22} strokeWidth={1.8} aria-hidden="true" />
            <span>Administration</span>
          </button>
        )}
      </nav>

      <footer className="argos-blue-navigation__footer">
        <div className="argos-blue-navigation__organization">
          <Building2 size={25} strokeWidth={1.65} aria-hidden="true" />
          <div>
            <strong title={organizationName}>{organizationName}</strong>
            <span>Fleet Services</span>
          </div>
          <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
        </div>

        <button
          type="button"
          className="argos-blue-navigation__identity"
          onClick={onSignOut}
          title={isDemoMode ? "Exit demo" : "Log out"}
        >
          <span className="argos-blue-navigation__avatar" aria-hidden="true">
            {getInitials(userName)}
          </span>

          <span className="argos-blue-navigation__identity-copy">
            <strong title={userName}>{userName}</strong>
            <span>{formatRoleLabel(userRole)}</span>
          </span>

          {isDemoMode ? (
            <LogOut size={18} strokeWidth={1.9} aria-hidden="true" />
          ) : (
            <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
          )}
        </button>

        <span className="argos-blue-navigation__version">{versionLabel}</span>
      </footer>
    </aside>
  );
}
