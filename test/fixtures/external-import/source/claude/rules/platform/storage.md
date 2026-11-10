---
paths: ["**/storage/**"]
description: "Local persistence: one storage adapter per feature, versioned keys, JSON only."
---

# Storage rules

* Each feature reads and writes local data through its own adapter in
  `src/features/<feature>/storage/`; screens never touch the storage API.
* Keys are namespaced and versioned: `<feature>:v<n>:<name>`
  (`profile:v1:draft`). Changing the stored shape bumps the version.
* Values are serialized as JSON; no other format.
* An adapter that cannot parse a stored value deletes it and returns the
  default, instead of throwing.
