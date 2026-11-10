---
description: "Steps to cut a release: version bump, changelog entry, tag."
---

# Release process

1. Pick the next version with semantic versioning: breaking change bumps the
   major, a new feature the minor, a fix the patch.
2. Update `version` in `package.json`.
3. Add a `## [x.y.z] - YYYY-MM-DD` section at the top of `CHANGELOG.md` with
   `Added`, `Changed` and `Fixed` subsections, each line pointing at its pull
   request.
4. Open a release pull request titled `release: x.y.z` and wait for one
   approval and a green pipeline.
5. After the merge, tag the merge commit `vx.y.z` and push the tag; the
   pipeline publishes from the tag.
