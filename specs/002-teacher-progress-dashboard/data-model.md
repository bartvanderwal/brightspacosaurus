# Data Model: Teacher Progress Dashboard

**Feature**: Teacher Progress Dashboard (Voortgangsverkenner)
**Date**: 2026-10-01
**Status**: Complete

## Core Entities & Relationships

```text
Course Configuration
  │
  ├── TeacherDashboardConfig
  │     ├── gitlabUrl: string
  │     ├── groupPath: string
  │     ├── subgroups: string[]
  │     ├── repos: ConfigRepoPrefix[]
  │     ├── teacherUsernames: string[]
  │     ├── requireCommentsForDone: boolean
  │     ├── orangeThresholdPercent: number (0..100)
  │     └── redThresholdPercent: number (0..100)
  │
Cohort / Subgroup (Runtime)
  │
  └── Student (1..*)
        ├── identifier: string (e.g., "J-deBruin7")
        ├── displayName: string
        ├── overallStatus: StoplightColor
        └── repositories: StudentRepository (1..*)
              ├── prefix: string
              ├── label: string
              ├── projectId: number
              ├── repoName: string
              ├── webUrl: string
              ├── status: StoplightColor
              ├── activeWorkItemCount: number
              ├── lastFetchedAt: string (ISO-8601)
              ├── error?: string
              └── workItems: WorkItem (0..*)
                    ├── id: number
                    ├── iid: number
                    ├── title: string
                    ├── webUrl: string
                    ├── state: "opened" | "closed"
                    ├── statusField?: string
                    ├── dueDate?: string (YYYY-MM-DD)
                    ├── hasStudentCommits: boolean
                    ├── hasComments: boolean
                    ├── stoplightColor: StoplightColor
                    └── reason: string
```

---

## Entity Details

### 1. TeacherDashboardConfig
Represents configuration declared in `brightspacosaurus.config.json` under `teacherDashboard`.

| Field | Type | Required | Default | Validation Rules |
|---|---|---|---|---|
| `gitlabUrl` | string | No | `"https://gitlab.com"` | Valid HTTP/HTTPS URL |
| `groupPath` | string | Yes | — | Non-empty string, valid GitLab path |
| `subgroups` | string[] | Yes | — | At least 1 subgroup string |
| `repos` | ConfigRepoPrefix[] | Yes | — | At least 1 prefix entry |
| `teacherUsernames` | string[] | No | `[]` | Array of strings |
| `requireCommentsForDone` | boolean | No | `false` | Boolean |
| `orangeThresholdPercent` | number | No | `10` | $0 \le \text{orange} < \text{red} \le 100$ |
| `redThresholdPercent` | number | No | `50` | $0 \le \text{orange} < \text{red} \le 100$ |

### 2. StoplightColor
Enumerated evaluation outcome for progress indicators:
- `green`: Completed or within optimal pace.
- `orange`: In progress, missing verification criteria, or moderate delay.
- `red`: Overdue, unstarted past deadline, or critical delay.
- `gray`: Neutral / Not yet due (0 active items or future deadline).

### 3. WorkItem Evaluation State Transitions

```text
[GitLab Issue]
      │
      ├─► State `opened` with label/status `todo`
      │     ├─► Due date in future? ──► [GRAY: "Not yet due"] (excluded from score)
      │     └─► Due date past / none? ──► [RED: "Not started (todo)"]
      │
      ├─► State `opened` with label/status `doing`
      │     └─► [ORANGE: "In progress (doing)"]
      │
      └─► State `closed` or status `done`
            ├─► No student commits? ──► [ORANGE: "Status done without linked commits"]
            ├─► Has student commits, but requireComments=true and commentCount=0?
            │     └─► [ORANGE: "No comment/details provided in work item"]
            └─► Has student commits AND (commentCount > 0 or requireComments=false)?
                  └─► [GREEN: "Complete (100%)"]
```

---

## Local Storage Cache Schema

Key format: `bso_td_cache_${encodeURIComponent(gitlabUrl)}_${encodeURIComponent(groupPath)}_${encodeURIComponent(subgroup)}`

```json
{
  "schemaVersion": 1,
  "fetchedAt": "2026-10-01T10:15:30.000Z",
  "students": [
    {
      "identifier": "J-deBruin7",
      "displayName": "J-deBruin7",
      "repositories": [
        {
          "prefix": "n1-chuck-a-luck",
          "label": "N1 Chuck-a-luck",
          "repoName": "n1-chuck-a-luck-J-deBruin7",
          "projectId": 12345,
          "webUrl": "https://gitlab.aimsites.nl/.../n1-chuck-a-luck-J-deBruin7",
          "fetchedAt": "2026-10-01T10:15:30.000Z",
          "workItems": []
        }
      ]
    }
  ]
}
```
