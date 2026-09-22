import { registerHooks } from 'node:module'

// Match Vite's extensionless TypeScript imports in the dependency-free Node tests.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (error.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.') || /\.[a-z]+$/i.test(specifier)) {
        throw error
      }
      return nextResolve(`${specifier}.ts`, context)
    }
  },
})
