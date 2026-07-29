import { useMemo, useState } from "react";
import "./ARGOS_Help_Support_Administration_Module.css";

const OPERATING_PRINCIPLES = [
  {
    title: "Manage by exception",
    body:
      "The Command Center emphasizes assets that require attention. Ready assets are intentionally excluded so supervisors can focus on operational risk, downtime, and unresolved work.",
  },
  {
    title: "Keep status information current",
    body:
      "Status, reason, priority, technician assignment, and down-date information should reflect the asset’s actual operating condition. Timely updates improve readiness reporting and management decisions.",
  },
  {
    title: "Complete the repair lifecycle",
    body:
      "When an asset returns to service, use the repair-completion workflow rather than changing status alone. This preserves repair history, downtime, technician, meter, and VMRS information.",
  },
  {
    title: "Protect controlled configuration",
    body:
      "Departments, Asset Types, statuses, technicians, reasons, and user permissions support consistent reporting. Change configuration deliberately and avoid creating duplicate records.",
  },
];

const WORKFLOW_GUIDES = [
  {
    id: "command-center",
    area: "Command Center",
    title: "Monitor fleet readiness and exceptions",
    steps: [
      "Review assets that are not Ready.",
      "Prioritize critical, high-priority, and long-duration exceptions.",
      "Open an asset to confirm status, reason, technician, and operational details.",
      "Use Daily Summary and Reports for broader performance context.",
    ],
    note:
      "Ready assets are excluded from the exception board by design. Use My Fleet when you need the complete asset directory.",
  },
  {
    id: "asset-status",
    area: "My Fleet",
    title: "Update an asset’s operating condition",
    steps: [
      "Locate the asset by unit, VIN, description, department, or status.",
      "Open the asset record and confirm that you selected the correct unit.",
      "Choose the status that best represents the current operating condition.",
      "Add the reason, priority, technician, and supporting details.",
      "Save the change and verify that the new status appears in the application.",
    ],
    note:
      "Use specific reasons and concise operational notes. Avoid using free-form notes as a substitute for an accurate status or reason.",
  },
  {
    id: "repair-completion",
    area: "Repair Completion",
    title: "Return an asset to service correctly",
    steps: [
      "Open the non-Ready asset and select Ready as the new status.",
      "Complete the repair information requested by ARGOS.",
      "Enter technician, work order, meter readings, repair dates, warranty, and VMRS information when available.",
      "Review the completed record before saving.",
      "Confirm that the asset is Ready and the completed repair appears in Repair History.",
    ],
    note:
      "The repair-completion workflow creates the permanent repair record and closes the active downtime event.",
  },
  {
    id: "data-management",
    area: "Data Management",
    title: "Import, export, and restore asset records",
    steps: [
      "Use the ARGOS CSV template when preparing an import.",
      "Review validation results before committing imported data.",
      "Use CSV Export to create a controlled extract of fleet records.",
      "Review Import History when investigating prior data loads.",
      "Restore archived assets only after confirming the record should return to the active fleet.",
    ],
    note:
      "CSV imports, exports, and archived-asset restores are recorded in the Audit Log.",
  },
  {
    id: "administration",
    area: "Administration",
    title: "Maintain governance and configuration",
    steps: [
      "Manage users and roles according to job responsibility.",
      "Keep Departments, Asset Types, statuses, reasons, and technicians current.",
      "Review the Audit Log for operational and administrative changes.",
      "Use Release Notes to confirm the capabilities and status of the installed version.",
    ],
    note:
      "Administration access is permission-controlled. Some configuration records are protected because operational workflows depend on them.",
  },
];

const FAQS = [
  {
    question: "Why are Ready assets not shown on the Command Center?",
    answer:
      "The Command Center is an exception-management workspace. It highlights assets that are Down, In Shop, awaiting parts, awaiting approval, awaiting quality control, at a third-party shop, or otherwise not fully available. The complete fleet remains available in My Fleet.",
  },
  {
    question: "When should I complete a repair instead of only changing status?",
    answer:
      "Use Repair Completion whenever an asset is being returned to Ready after maintenance or repair activity. That workflow creates the completed repair record, closes downtime, records status history, and preserves technician, work order, meter, warranty, and VMRS details.",
  },
  {
    question: "Why can’t I change or disable certain statuses?",
    answer:
      "Core ARGOS statuses are protected because readiness calculations, operational workflows, reports, and repair completion depend on them. Administrators may adjust approved behavior fields, but protected system names, codes, and active state remain controlled.",
  },
  {
    question: "What does the Audit Log record?",
    answer:
      "The Audit Log records major successful production events, including CSV imports and exports, archived-asset restoration, asset creation and updates, status changes, repair completion, user administration, and configuration changes.",
  },
  {
    question: "How do I restore an archived asset?",
    answer:
      "Open Administration, select Archived Assets under Data Management, locate the correct record, and use Restore. Confirm the asset appears in the active fleet before making additional changes.",
  },
  {
    question: "Why can’t I access Administration or a specific workspace?",
    answer:
      "Administration is permission-controlled. Access depends on the signed-in user’s role and active status. Contact an ARGOS administrator when your job responsibilities require additional access.",
  },
  {
    question: "How does ARGOS protect one organization’s data from another?",
    answer:
      "Production records are organization-scoped and protected through authenticated identity, organization identifiers, Row Level Security, and server-side authorization. Users operate only within the organization assigned to their profile.",
  },
  {
    question: "What should I do before importing a CSV file?",
    answer:
      "Start with the current ARGOS template, preserve the required headers, use approved Department and Asset Type values, remove duplicate units or VINs, and review the validation results carefully before committing the import.",
  },
];

function ContactLink({ label, value, href, detail }) {
  return (
    <a className="argos-help-contact-item" href={href}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </a>
  );
}

export default function ARGOSHelpSupportAdministrationModule({
  onOpenReleaseNotes,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [openFaq, setOpenFaq] = useState(FAQS[0].question);

  const filteredFaqs = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    if (!search) return FAQS;

    return FAQS.filter((item) =>
      `${item.question} ${item.answer}`.toLowerCase().includes(search)
    );
  }, [searchTerm]);

  return (
    <div className="argos-help-support-content">
      <header className="argos-help-support-heading">
        <div>
          <p className="eyebrow">Fleet Professional Resource Center</p>
          <h4>Help &amp; Support</h4>
          <p>
            Learn the operating principles, production workflows, governance
            practices, and support resources that help fleet professionals use
            ARGOS consistently and confidently.
          </p>
        </div>

        <div className="argos-help-support-version">
          <span>Product Version</span>
          <strong>ARGOS™ 1.0</strong>
          <small>Production Release Candidate</small>
        </div>
      </header>

      <section className="argos-help-system-summary" aria-label="System information">
        <div>
          <span>Platform</span>
          <strong>Fleet Operational Readiness</strong>
        </div>
        <div>
          <span>Primary Purpose</span>
          <strong>Visibility &amp; Exception Management</strong>
        </div>
        <div>
          <span>Current Phase</span>
          <strong>System Completion</strong>
        </div>
        <div>
          <span>Provider</span>
          <strong>Atlas Government Fleet Solutions</strong>
        </div>
      </section>

      <section className="argos-help-introduction">
        <div className="argos-help-introduction-copy">
          <p className="eyebrow">Start Here</p>
          <h5>How ARGOS supports fleet operations</h5>
          <p>
            ARGOS gives fleet leaders a clear view of availability, downtime,
            active workload, and operational exceptions. It is designed to
            replace fragmented spreadsheets and informal status reporting with
            controlled workflows, consistent records, and practical management
            intelligence.
          </p>
          <p>
            The strongest results come from accurate status updates, disciplined
            repair completion, controlled configuration, and regular review of
            the Command Center, Daily Summary, Reports, and Audit Log.
          </p>
        </div>

        <div className="argos-help-operating-question">
          <span>ARGOS helps answer</span>
          <strong>What is unavailable?</strong>
          <strong>Why is it unavailable?</strong>
          <strong>How long has it been unavailable?</strong>
          <strong>Who or what is holding the work?</strong>
        </div>
      </section>

      <section className="argos-help-section">
        <div className="argos-help-section-heading">
          <div>
            <p className="eyebrow">Operating Discipline</p>
            <h5>Four principles for reliable fleet information</h5>
          </div>
        </div>

        <div className="argos-help-principles">
          {OPERATING_PRINCIPLES.map((principle, index) => (
            <article key={principle.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h6>{principle.title}</h6>
              <p>{principle.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="argos-help-section">
        <div className="argos-help-section-heading">
          <div>
            <p className="eyebrow">Workflow Guidance</p>
            <h5>Core production workflows</h5>
          </div>
          <span>{WORKFLOW_GUIDES.length} reference guides</span>
        </div>

        <div className="argos-help-workflows">
          {WORKFLOW_GUIDES.map((guide) => (
            <article key={guide.id}>
              <div className="argos-help-workflow-heading">
                <span>{guide.area}</span>
                <h6>{guide.title}</h6>
              </div>

              <ol>
                {guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>

              <div className="argos-help-workflow-note">
                <strong>Fleet practice</strong>
                <span>{guide.note}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="argos-help-section">
        <div className="argos-help-section-heading argos-help-faq-heading">
          <div>
            <p className="eyebrow">Frequently Asked Questions</p>
            <h5>Common operational and administrative questions</h5>
          </div>

          <label className="argos-help-search">
            <span>Search help</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search questions and answers"
            />
          </label>
        </div>

        <div className="argos-help-faq-list">
          {filteredFaqs.length ? (
            filteredFaqs.map((item) => {
              const isOpen = openFaq === item.question;

              return (
                <article className={isOpen ? "open" : ""} key={item.question}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? "" : item.question)}
                    aria-expanded={isOpen}
                  >
                    <span>{item.question}</span>
                    <b aria-hidden="true">{isOpen ? "−" : "+"}</b>
                  </button>
                  {isOpen ? <p>{item.answer}</p> : null}
                </article>
              );
            })
          ) : (
            <div className="argos-help-no-results">
              No help topics matched “{searchTerm}”.
            </div>
          )}
        </div>
      </section>

      <section className="argos-help-support-panel">
        <div className="argos-help-support-copy">
          <p className="eyebrow">Contact Support</p>
          <h5>Atlas Government Fleet Solutions</h5>
          <p>
            Contact Atlas for technical assistance, application questions,
            feature requests, account support, or guidance on using ARGOS within
            your fleet operation.
          </p>
          <div className="argos-help-support-hours">
            <span>Standard support hours</span>
            <strong>Monday–Friday, 8:00 AM–5:00 PM Eastern Time</strong>
          </div>
        </div>

        <div className="argos-help-contact-grid">
          <ContactLink
            label="Support Email"
            value="Support@atlasgovfleet.com"
            href="mailto:Support@atlasgovfleet.com"
            detail="Recommended for detailed requests"
          />
          <ContactLink
            label="Support Phone"
            value="980.273.9733"
            href="tel:+19802739733"
            detail="Current Version 1.0 support line"
          />
          <ContactLink
            label="Website"
            value="www.atlasgovfleet.com"
            href="https://www.atlasgovfleet.com"
            detail="Company and service information"
          />
        </div>
      </section>

      <section className="argos-help-system-actions">
        <div>
          <p className="eyebrow">System Reference</p>
          <h5>Confirm the installed release</h5>
          <p>
            Review the official release history for Version 1.0 capabilities,
            production status, and future application updates.
          </p>
        </div>
        <button type="button" onClick={onOpenReleaseNotes}>
          Open Release Notes
        </button>
      </section>

      <footer className="argos-help-closing">
        <strong>ARGOS™ Fleet Operational Readiness Platform</strong>
        <span>
          Clear visibility. Controlled workflows. Actionable fleet intelligence.
        </span>
      </footer>
    </div>
  );
}
