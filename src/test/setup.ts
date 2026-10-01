import 'fake-indexeddb/auto'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// Whole-app tests open every provider (stock, dishes, meals, batches, shopping,
// reminders) before a screen shows. On a busy machine, such as GitHub's build runner
// with every test file at once, that can take more than the default 1 second.
configure({ asyncUtilTimeout: 5000 })

// Unmount rendered components between tests (automatic only with Vitest globals on).
afterEach(() => {
  cleanup()
  localStorage.clear()
})
