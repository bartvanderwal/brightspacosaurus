# For teachers

![A teacher inspects a package with a magnifying glass and a clipboard; a version tag and a light bulb float beside the dinosaur](images/for-teachers-inspect-package.jpg)

*Figure 1. Check which version is in Brightspace.*

> Teachers only: hide this page for students in Brightspace after each import.

## Version information

After a new Brightspace import, check here that you imported the current version.

{@bso-versions}

BSO fills in the table above during the build (`teacherPage` in `brightspacosaurus.config.json`, default `for-teachers.md`).

{@bso-teacher-dashboard}

The directive above turns this page into two tabs: this information and the Voortgangsverkenner (`teacherDashboard` in the configuration). The demo uses a fictitious GitLab server, so fetching data fails until a local GitLab is available (#46).
