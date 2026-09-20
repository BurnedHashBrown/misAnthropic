# Filtr. decision log

## D-001: Keep a static web-app architecture

Decision: retain plain HTML, CSS, and JavaScript instead of introducing React, Tailwind, and a build system.

Reason: the existing project is static, small, and directly deployable. A build-system migration would not improve the present prototype and would add setup risk.

## D-002: Treat linked components as interaction patterns

Decision: adapt the requested component patterns in native code.

Reason: the referenced React components require dependencies that do not exist in this repository. Their user-facing behaviours are implemented in the existing theme without changing the deployment model.

## D-003: Do not flag romance at first contact

Decision: Live Watch and Paste Review only escalate where at least two pressure signals appear.

Reason: genuine long-distance relationships and early romance can look similar to scams. False alarms undermine trust and can isolate users.

## D-004: Keep the Filtr. palette unchanged

Decision: use only Amber Flame, Tomato, Grapefruit Pink, Onyx, and Porcelain as the core product palette.

Reason: the user supplied this palette and asked to retain the theme.

## D-005: Make privacy product-visible

Decision: create a dedicated Privacy page and repeat local-first messaging in Review and Evidence Locker.

Reason: sensitive conversation content creates a high trust burden. Privacy cannot be hidden in a footer alone.

## D-006: Separate urgent help from detection

Decision: Emergency Help is its own route with immediate action steps.

Reason: a user under sextortion pressure should not need to navigate a risk-analysis interface before finding a safe next step.

## D-007: Clearly label all account and analysis features as demos

Decision: signup, login, and analysis forms do not create accounts or transmit data.

Reason: the static prototype has no authenticated backend or reviewed data-handling model.

## D-008: Add explicit disclaimer boundaries

Decision: Terms and Disclaimer says Filtr. is not law enforcement, therapy, crisis care, or proof of wrongdoing.

Reason: safety tools should not overstate their certainty or authority.
