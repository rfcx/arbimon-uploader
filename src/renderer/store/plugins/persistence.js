import settings from '../../services/settings'

const STORE_KEY = 'vuex_state'

export function createPersistedState () {
  return (store) => {
    const persistedState = settings.get(STORE_KEY)
    if (persistedState && typeof persistedState === 'object') {
      store.replaceState({
        ...store.state,
        ...persistedState
      })
    }

    store.subscribe((mutation, state) => {
      settings.set(STORE_KEY, state)
    })
  }
}

export function createSharedMutations () {
  return () => {}
}
