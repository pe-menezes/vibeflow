# Architecture

Applications are organized by feature.

```
src/
  app.js                 # composition root: builds the container, registers routes
  di/                    # container and shared registrations
  navigation/            # the navigator
  features/<feature>/
    navigation/          # <feature>-routes.js
    storage/             # optional persistence adapter
    <feature>-screen.js  # screens
    <feature>-module.js  # dependency registrations
  utils/                 # pure helpers with no feature knowledge
```

* A feature never imports another feature's files; shared code moves to
  `utils/` or a service registered in `di/`.
* `utils/` has no imports from `features/`, `navigation/` or `di/`.
* The composition root is the only place that knows every feature.
