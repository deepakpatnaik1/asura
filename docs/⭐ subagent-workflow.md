# Subagent Workflow

## Overview
This document defines the multi-agent workflow for implementing mega features in the Asura project.

## Roles

### Boss (User)
- Defines requirements and provides strategic direction
- Makes all business logic and UI/UX decisions
- Reviews and approves mega feature scope
- Must authorize any business logic or UI/UX decisions

### Claude (Primary Agent)
- Reports to Boss
- Facilitates the entire workflow
- Breaks mega features into 7-10 high-level chunks
- Coordinates doer and reviewer sub-agents
- Has full permission to make technical edits automatically
- **Cannot** make business logic or UI/UX decisions independently
- Only interrupts Boss for business logic and UI/UX decisions

### Doer Sub-agent
- Creates detailed plans for each chunk
- Implements code based on approved plans
- Responds to reviewer feedback iteratively
- Must understand the full project context

### Reviewer Sub-agent
- Performs fiercely independent reviews
- Reviews both plans and implementations
- Provides scores (X/10), issues, and constructive suggestions
- Must understand the full project context
- Maintains independence from doer's perspective

## Workflow

### Phase 1: Mega Feature Initialization
1. Boss describes the mega feature they want to work on
2. Boss and Claude discuss and refine requirements together
3. Claude breaks the feature into 7-10 high-level chunks
4. Claude creates operating folder structure in `/working/[feature-name]/`
5. Claude summons doer and reviewer sub-agents
6. Claude briefs both sub-agents on the full project context

### Phase 2: Chunk Implementation (Repeat for Each Chunk)

#### Step 1: Planning
1. Claude assigns the doer to create a detailed plan for the chunk
2. Plan must include testing approach
3. Doer delivers plan to Claude

#### Step 2: Plan Review
1. Claude hands plan to reviewer for independent review
2. Reviewer provides:
   - Score (X/10)
   - Specific issues identified
   - Constructive and helpful suggestions for improvement
3. **Quality Gate**:
   - If score ≥ 8/10 → Plan approved, proceed to implementation
   - If score < 8/10 → Plan fails, return to doer with feedback
4. Doer/reviewer loop continues indefinitely until plan reaches ≥ 8/10
5. Claude only interrupts Boss if business logic or UI/UX decisions are needed

#### Step 3: Implementation
1. Claude assigns doer to implement the approved plan
2. Implementation must include tests
3. Doer delivers completed implementation

#### Step 4: Implementation Review
1. Claude hands implementation to reviewer for independent review
2. Reviewer provides:
   - Score (X/10)
   - Specific issues identified
   - Constructive and helpful suggestions for improvement
3. **Quality Gate**:
   - If score ≥ 8/10 → Implementation approved, chunk complete
   - If score < 8/10 → Implementation fails, return to doer with feedback
4. Doer/reviewer loop continues indefinitely until implementation reaches ≥ 8/10
5. Claude only interrupts Boss if business logic or UI/UX decisions are needed

### Phase 3: Completion
1. All chunks pass both plan and implementation reviews
2. Mega feature is complete

## Folder Structure

```
/working/[feature-name]/
├── chunks/
│   ├── chunk-1-[name]/
│   │   ├── plan.md
│   │   ├── review-1.md
│   │   ├── review-2.md (if needed)
│   │   └── implementation-notes.md
│   ├── chunk-2-[name]/
│   │   └── ...
│   └── ...
└── project-brief.md (full context for sub-agents)
```

## Key Principles

1. **Quality Threshold**: 8/10 minimum score for both plans and implementations
2. **Context Awareness**: Both doer and reviewer must understand the full project to reduce mistakes
3. **Independence**: Reviewer maintains fierce independence from doer's perspective
4. **Iteration**: Doer/reviewer loops continue indefinitely until quality gate is met
5. **Testing Mandatory**: All plans and implementations must include testing
6. **Decision Authority**:
   - Boss: Business logic and UI/UX decisions
   - Claude: Technical implementation decisions
   - Sub-agents: Execution within their assigned scope
7. **Autonomous Execution**: Claude and sub-agents work autonomously except when business logic or UI/UX decisions are required

## Interruption Protocol

Claude interrupts Boss **only** when:
- Business logic decisions are required
- UI/UX decisions are required
- Clarification on requirements is needed

Claude does **not** interrupt Boss for:
- Technical implementation decisions
- Doer/reviewer iteration loops
- Architecture or code structure decisions (unless they impact business logic)
