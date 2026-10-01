# ADR 018 — GitHub Flow and release tags

## Status

Accepted

## Context

Brightspacosaurus is released as a versioned package on JSR (and npm), built from the source in this repository. The course repositories that use BSO, such as OWE-1, already follow GitHub Flow with release tags (OWE-1 ADR 016). BSO used `release/x.y.z` branches for recent releases, which added branch management without adding value: there is only one supported release line, and the version already lives in `deno.json` and `CHANGELOG.md`.

Git-flow prescribes a long-lived `develop` branch and separate `release/*` and `hotfix/*` branches. Its author later advised teams that ship continuously to "adopt a much simpler workflow ... instead of trying to shoehorn git-flow into your team" (Driessen, 2020).

### Criteria

- `main` is the only long-lived integration branch.
- Large changes can be reviewed by colleagues before they reach `main`.
- Everyday changes reach `main` without branch overhead.
- A published version can be traced to an exact commit on `main`.
- Version history belongs in commits, the changelog and tags, not in branch names.
- The workflow matches the course repositories that consume BSO.

## Considered options

### Option A — Git-flow

Work with `develop`, feature, release and hotfix branches.

**Pros:** explicit separation between integration and release preparation; supports maintaining several release lines in parallel.

**Cons:** extra long-lived branches and back-merges; release branches add nothing while there is one release line.

### Option B — GitHub Flow with release tags (chosen)

Commit to `main` by default. Only large changes get a short-lived feature branch, merged through a GitHub pull request after review by colleagues.

**Pros:** little branch management; large changes stay reviewable; releases are traceable to a commit through tags; same workflow as the course repositories.

**Cons:** `main` must stay releasable; a release needs a tested build from the intended commit.

### Option C — GitLab Flow with stable branches

Work from `main` with additional `stable` or version branches when several releases must be maintained in parallel.

**Pros:** supports patching an older release while developing the next one.

**Cons:** extra branch management that is not needed while only the latest 0.x version is supported.

### Option D — Trunk-based only

Commit every change directly to `main`, without feature branches or pull requests.

**Pros:** minimal branch administration and fast integration.

**Cons:** large changes cannot be reviewed by colleagues before integration.

## Decision

We use GitHub Flow with release tags:

1. `main` is the only long-lived branch and the source for every published version.
2. Changes are committed directly to `main` by default.
3. Only large changes that colleagues should review get a short-lived feature branch from the current `main`, named `feature/<issue>-<slug>`.
4. The feature branch is merged into `main` through a pull request that references the issue, states the validation performed and is reviewed by a colleague.
5. The feature branch is deleted after merge.
6. A release is published from the intended commit on `main`: the version bump and changelog entry are part of the change, the tests pass, `deno publish` runs from that commit, and the commit is tagged `vX.Y.Z`.

We do not create `develop`, `release/*`, `hotfix/*` or other long-lived branches. A fix after a release is committed to `main` like any other change and, when needed, gets a new patch version and tag.

## Consequences

Positive:

- One clear integration base, without back-merges between `develop` and release branches.
- Pull requests with colleague review are reserved for changes with large impact.
- A tag records which commit a JSR version was published from.
- BSO and its course repositories share one workflow.

Negative:

- `main` receives unreviewed commits; the local test suite (`deno task test`) must pass before every commit.
- Version bumps and changelog entries must be included carefully in the change to `main`.
- Publishing from a feature branch before merge breaks traceability; the tag must then be placed on the merge commit that contains the same content.
- Maintaining several release lines in parallel is not supported. If that becomes necessary, we reconsider and GitLab Flow with stable branches is the obvious candidate: "With GitLab Flow, all features and fixes go to the main branch while enabling production and stable branches." (GitLab, Inc., n.d.).

## References

- Driessen, V. (2010, January 5; reflection note added 2020, March 5). *A successful Git branching model*. Retrieved September 30, 2026, from https://nvie.com/posts/a-successful-git-branching-model/
- GitLab, Inc. (n.d.). *What is GitLab Flow?* Retrieved September 30, 2026, from https://about.gitlab.com/topics/version-control/what-is-gitlab-flow/
- Modern Software Engineering. (2023, June 14). *I've found something BETTER than pull requests...* [Video]. YouTube. https://www.youtube.com/watch?v=WmVe1QrWxYU
