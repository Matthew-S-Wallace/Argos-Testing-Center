# ARGOS™

# ENGINEERING_BASELINE.md

## Official Engineering Baseline

### Version 1.0 Development

**Last Updated:** July 17, 2026

------------------------------------------------------------------------

# PURPOSE

This document is the permanent engineering baseline for ARGOS™.

Unlike engineering handoffs, this document remains inside the repository
and evolves with the application.

Its purpose is to prevent architectural drift, preserve engineering
decisions, maintain sprint continuity, and ensure that future
development always begins from a known, verified state.

------------------------------------------------------------------------

# PRODUCT

**ARGOS™** --- Fleet Visibility & Operational Awareness Platform

ARGOS is a lightweight operational awareness platform focused on:

-   Fleet availability
-   Maintenance status
-   Operational readiness
-   Technician workload
-   Organizational visibility

ARGOS complements existing CMMS/FMIS platforms rather than replacing
them.

------------------------------------------------------------------------

# CURRENT VERSION

-   **Version:** 1.0 Development
-   **Estimated Completion:** \~95%
-   **Repository Status:** Production

------------------------------------------------------------------------

# TECHNOLOGY STACK

## Frontend

-   React
-   Vite

## Backend

-   Supabase
-   PostgreSQL
-   Supabase Auth
-   Row Level Security (RLS)

## Security Layer

-   RPC Functions
-   Permission Resolver
-   Identity Service

## Server Infrastructure

-   Supabase Edge Functions
-   Deno Runtime

## Deployment

-   GitHub
-   Vercel

------------------------------------------------------------------------

# ENGINEERING PRINCIPLES

-   Always modify production source.
-   Never regenerate mature components.
-   Always perform surgical modifications.
-   Never reconstruct production modules from terminal output.
-   Backend first.
-   Frontend second.
-   Database changes only when required.

------------------------------------------------------------------------

# VERSION CONTROL

Every completed feature shall:

-   Build successfully.
-   Commit independently.
-   Push immediately.
-   Never combine unrelated work into one commit.

**One feature. One commit.**

------------------------------------------------------------------------

# PROJECT STRUCTURE

``` text
src/                        Frontend
src/utils/                  Shared utilities
src/components/Administration/ Administration modules
src/components/Shared/      Shared components
supabase/                   Backend infrastructure
supabase/functions/         Edge Functions
```

------------------------------------------------------------------------

# SECURITY MODEL

-   Organization isolation is mandatory.
-   Every record belongs to exactly one organization.
-   RLS is always enforced.
-   Permissions are role-based.
-   No cross-organization visibility.
-   Administrative actions must execute server-side.
-   Never expose service-role credentials to the frontend.

------------------------------------------------------------------------

# USER ROLES

-   Admin
-   Manager
-   Technician
-   User

------------------------------------------------------------------------

# COMPLETED ENGINEERING

-   Authentication
-   Organization Profiles
-   Dashboard
-   Fleet Management
-   Status Tracking
-   Reports
-   Daily Summary
-   CSV Import / Export
-   VIN Scanner
-   Administration Module
-   Departments
-   Asset Types
-   Status Configuration
-   Technician Administration
-   IAM Foundation
-   Permission Resolver
-   Identity Service
-   Supabase Backend Infrastructure

------------------------------------------------------------------------

# CURRENT SPRINT STATUS

-   Sprint 001A--001M: Complete
-   Sprint 001N.1: Complete
-   Sprint 001N.2: Complete
-   Sprint 001N.3: Complete
-   Sprint 001N.4: Complete
-   **Sprint 001N.5: Current Sprint (Ready to Begin)**

------------------------------------------------------------------------

# NEXT ENGINEERING OBJECTIVE

## Sprint 001N.5 -- Secure User Invitation Workflow

Implement:

-   Supabase Edge Function
-   Secure administrator invitation flow
-   Server-side profile creation/update
-   Organization assignment
-   Role assignment
-   Department assignment
-   Activation workflow

The Users Administration module should remain a thin UI layer while
privileged operations execute server-side.

------------------------------------------------------------------------

# UPCOMING ROADMAP

1.  Sprint 001O -- Vehicle Administration
2.  Sprint 001P -- Mobile VIN Workflow
3.  Sprint 001Q -- APWA Coding
4.  Sprint 001R -- VRMS Repair Coding
5.  Sprint 001S -- Role Enforcement Expansion
6.  Sprint 001T -- Audit Logging
7.  Sprint 001U -- Reporting Expansion
8.  Sprint 001V -- Beta Hardening
9.  Sprint 001W -- Version 1.0 Release Candidate

------------------------------------------------------------------------

# PERFORMANCE BACKLOG

Known item:

-   Large JavaScript bundle warning.

Status:

-   Accepted
-   Not blocking
-   Optimization deferred until after Version 1.0 feature completion.

------------------------------------------------------------------------

# ENGINEERING DISCIPLINE

Every engineering session shall begin by reviewing this document.

After every completed sprint update:

-   Current Sprint
-   Completed Features
-   Roadmap
-   Completion Percentage
-   Repository Status

This document is the authoritative engineering baseline for ARGOS.
Engineering handoffs supplement it---they do not replace it.
