# Graph Report - GrpVetteAndRolex  (2026-11-07)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 121 nodes · 146 edges · 14 communities (9 shown, 5 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4096900b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13

## God Nodes (most connected - your core abstractions)
1. `analyze_text()` - 8 edges
2. `analyze_image()` - 6 edges
3. `analyze_multiple_images()` - 6 edges
4. `analyzeMessages()` - 5 edges
5. `handleNewMessages()` - 5 edges
6. `scanMessages()` - 5 edges
7. `icons` - 5 edges
8. `default_icon` - 5 edges
9. `ensureContentScriptInjected()` - 4 edges
10. `getState()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `handleNewMessages()` --calls--> `analyzeMessages()`  [EXTRACTED]
  filtr-extension/service-worker.js → filtr-extension/pattern-engine.js

## Import Cycles
- None detected.

## Communities (14 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (27): anthropic, analyze_text(), claude_analyze_text(), gemini_analyze_text(), Filtr. AI Backend — FastAPI + spaCy + Anthropic Claude Local development server…, Lightweight local analysis using regex patterns and spaCy NLP context., Extract contextual features using spaCy NLP., Send text to Google Gemini for safety analysis. (+19 more)

### Community 1 - "Community 1"
Cohesion: 0.10
Nodes (19): background, service_worker, type, content_scripts, description, host_permissions, icons, 128 (+11 more)

### Community 2 - "Community 2"
Cohesion: 0.29
Nodes (12): analyzeMessages(), assessRisk(), BENIGN_SOLO, detectSignals(), SIGNAL_CHECKS, BADGE_STATES, ensureContentScriptInjected(), getState() (+4 more)

### Community 3 - "Community 3"
Cohesion: 0.27
Nodes (10): analyze_image(), analyze_multiple_images(), claude_analyze_image(), gemini_analyze_image(), Send an image to Google Gemini Vision for OCR + safety analysis., Send an image to Claude Vision for OCR + safety analysis., Analyze an uploaded screenshot for safety concerns., Analyze multiple uploaded screenshots. (+2 more)

### Community 5 - "Community 5"
Cohesion: 0.46
Nodes (6): checkConversationChange(), findMessages(), init(), scanMessages(), scheduleScan(), startObserving()

### Community 6 - "Community 6"
Cohesion: 0.29
Nodes (7): action, default_icon, default_title, 128, 16, 32, 48

### Community 7 - "Community 7"
Cohesion: 0.53
Nodes (4): cleanMessageText(), extractMessage(), extractText(), stripInvisibleMarks()

### Community 8 - "Community 8"
Cohesion: 0.50
Nodes (3): notice(), render(), stages

### Community 10 - "Community 10"
Cohesion: 0.67
Nodes (3): health_check(), Health check endpoint., get

## Knowledge Gaps
- **29 isolated node(s):** `service_worker`, `type`, `content_scripts`, `description`, `host_permissions` (+24 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 70 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `action` connect `Community 6` to `Community 1`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `service_worker`, `type`, `content_scripts` to the rest of the system?**
  _29 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08465608465608465 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._