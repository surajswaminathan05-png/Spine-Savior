---
name: deep-research
description: "ALWAYS use this skill whenever the user asks for 'deep research', tells you to 'search the web comprehensively', 'find sources', or needs source-grounded synthesis from multiple documents. Do NOT rely on standard search for complex topics; use this skill instead."
---

# Deep Research (NotebookLM)

This skill dictates the exact protocol for conducting comprehensive, source-grounded research using the NotebookLM MCP server. 

> [!CAUTION]
> **THE IRON LAW**: NO MANUAL WEB SEARCHING FOR COMPLEX TOPICS. You MUST use the NotebookLM MCP tools in the exact 6-phase sequence below. Failure to follow these phases sequentially will result in hallucinations and token waste.

## Critical Behavioral Rules

> [!WARNING]
> **These rules are NON-NEGOTIABLE. Violating any of them will cause the research to fail.**

1. **NO TERMINAL SLEEPING.** Do NOT use `sleep`, `Start-Sleep`, `timeout`, `ping -n`, or any terminal/shell command to wait. All waiting is handled exclusively by the MCP tool's `max_wait` and `poll_interval` parameters.
2. **NO PREMATURE NOTEBOOK INSPECTION.** Do NOT call `notebook_get`, `notebook_query`, `source_list_drive`, `source_describe`, or any notebook/source inspection tools between Phase 1 and Phase 3. The notebook WILL show zero sources during this window. This is expected behavior, NOT a failure.
3. **NO PANIC ON `in_progress`.** Deep research routinely takes 3-7 minutes. Receiving an `in_progress` status is completely normal. You MUST NOT tell the user the research has failed, is broken, or is not working during the wait period.

## The 6-Phase Protocol

### Phase 0: Pre-Research Clarification (Context Gathering & User Gatekeeper)
Before initiating any research, you MUST gather architectural context and secure explicit user approval.
1. Analyze the user's project to understand the specific tech stack and architectural constraints (e.g., using `view_file` on `package.json` or reading existing skill files).
2. Synthesize the user's raw research query into a highly specific, codebase-aware research prompt.
3. Present this contextualized prompt to the user as a bulleted plan.
4. Explicitly use the `notify_user` tool with `BlockedOnUser: true` to wait for their approval. 
**The user is the gatekeeper.** Do not proceed to Phase 1 until the user explicitly approves the context-aware plan.

### Phase 1: Initiate (Clean Workspace)

> [!NOTE]
> **Troubleshooting NotebookLM API Failures**
> If `mcp_notebooklm_research_start` fails with "no confirmation from API," it means one of two things:
> 1. **BUG:** You forgot to pass a valid `notebook_id`. The CLI has a known bug where omitting the ID fails silently.
> 2. **AUTH:** The authentication tokens have expired. Pause the research, execute `C:\Users\suraj\AppData\Local\Programs\Python\Python313\Scripts\nlm.exe login` via terminal to trigger Chrome login, then call `mcp_notebooklm_refresh_auth`.
> For detailed diagnosis, see the `notebooklm_troubleshooting.md` artifact.

1. You MUST explicitly create a new, isolated workspace first by calling `mcp_notebooklm_notebook_create` and providing a descriptive `title`.
2. Do NOT rely on the `research_start` tool to create the notebook automatically.
3. After the notebook is created, extract its `notebook_id`.
4. Call `mcp_notebooklm_research_start` passing the approved `query` and the newly generated `notebook_id`.
5. Set `mode: "deep"`.

### Phase 2: Wait & Verify (Blocking Poller)
1. Call `mcp_notebooklm_research_status`.
2. You MUST pass `max_wait: 300` and `poll_interval: 30` so the tool handles waiting internally.
3. If the tool returns early with `in_progress` (due to platform-level timeouts or any other reason), you MUST call `mcp_notebooklm_research_status` again with the same `task_id`, `max_wait: 300`, and `poll_interval: 30`. Repeat this cycle until the status returns `completed`.
4. You MUST NOT proceed to Phase 3 under ANY circumstance until the status is `completed`. There are no exceptions.
5. Do NOT inspect the notebook, count sources, or call any other tools during this wait. Just re-poll.

### Phase 3: Capture (Task Tracking)
1. Call `mcp_notebooklm_research_import` to ingest the discovered sources natively into the notebook.
2. You MUST provide exactly both the `notebook_id` and the `task_id` returned from the prior phases.

### Phase 4: Generate Studio Artifact (Server-Side Synthesis)
Command NotebookLM to formally synthesize the sources into a structured document.
1. Call `mcp_notebooklm_studio_create`.
2. Pass the `notebook_id` from Phase 3.
3. Set `artifact_type: "report"`.
4. Set `report_format: "Briefing Doc"`.
5. Explicitly pass a descriptive `title` based on the user's focus.
6. Include a `focus_prompt` instructing the engine to synthesize the research specifically focusing on the technical constraints gathered in Phase 0.
7. You MUST poll `mcp_notebooklm_studio_status(action: 'status')` until this new artifact shows `status: 'completed'`.

### Phase 5: Download & Contextual Merge (Local Application)
1. Call `mcp_notebooklm_download_artifact` with `artifact_type: "report"` to save the generated Briefing Doc locally (e.g., to `/tmp/<filename>.md`).
2. Read the downloaded file.
3. Merge the pristine internet research from the downloaded file with the codebase context gathered in Phase 0. 
4. You MUST write this final synthesis to an artifact (e.g., `<appDataDir>/brain/<conversation-id>/research_results.md`), translating the generic research into actionable engineering steps for this specific repository.
