# Pin npm packages by running ./bin/importmap

pin "application"
pin "@hotwired/turbo-rails", to: "turbo.min.js"
pin "@hotwired/stimulus", to: "stimulus.min.js"
pin "@hotwired/stimulus-loading", to: "stimulus-loading.js"
pin_all_from "app/javascript/controllers", under: "controllers"
pin "@rails/actioncable", to: "actioncable.esm.js"

# Editor colaborativo: bundle ESM único (yjs + y-quill + y-protocols/awareness
# + quill-cursors + quill-delta-to-markdown) vendorado em vendor/javascript.
# Para regerar: ver README (esbuild, build único — nada de Node no deploy).
pin "editor-deps"

pin "editor"
pin "editor/provider", to: "editor/provider.js"
pin "landing"
