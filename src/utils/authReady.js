let resolveAuthReady
let authReadyResolved = false

const authReadyPromise = new Promise((resolve) => {
  resolveAuthReady = resolve
})

export const waitForAuthReady = () => authReadyPromise

export const markAuthReady = (result = {}) => {
  if (authReadyResolved) {
    return
  }

  authReadyResolved = true
  resolveAuthReady(result)
}
