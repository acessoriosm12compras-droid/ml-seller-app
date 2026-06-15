import { render, screen, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

function MultiProbe() {
  const { activeAccounts, activeAccount, editAccount, setActiveAccounts } = useAuth()
  return (
    <div>
      <span data-testid="accounts">{JSON.stringify(activeAccounts)}</span>
      <span data-testid="joined">{activeAccount}</span>
      <span data-testid="edit">{editAccount}</span>
      <button onClick={() => setActiveAccounts(['YUSO', 'M12'])}>multi</button>
    </div>
  )
}

it('activeAccount é a junção das contas e editAccount é a primeira', async () => {
  render(<AuthProvider><MultiProbe /></AuthProvider>)
  await act(async () => {})
  await act(async () => { screen.getByText('multi').click() })
  expect(screen.getByTestId('accounts').textContent).toBe('["YUSO","M12"]')
  expect(screen.getByTestId('joined').textContent).toBe('YUSO,M12')
  expect(screen.getByTestId('edit').textContent).toBe('YUSO')
})

// Mock Supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({}),
    },
  },
}))

// Mock setTokenProvider from api
vi.mock('../api', () => ({
  setTokenProvider: vi.fn(),
}))

function TestComponent() {
  const { isLoggedIn, login, logout } = useAuth()
  return (
    <div>
      <span data-testid="status">{isLoggedIn ? 'logged-in' : 'logged-out'}</span>
      <button onClick={() => login('admin@test.com', 'admin')}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  )
}

test('starts logged out', async () => {
  render(<AuthProvider><TestComponent /></AuthProvider>)
  await act(async () => {})
  expect(screen.getByTestId('status').textContent).toBe('logged-out')
})

test('login calls supabase signInWithPassword', async () => {
  const { supabase } = await import('../lib/supabase')
  render(<AuthProvider><TestComponent /></AuthProvider>)
  await act(async () => {})
  await act(async () => { screen.getByText('login').click() })
  expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'admin@test.com', password: 'admin' })
})

test('logout calls supabase signOut', async () => {
  const { supabase } = await import('../lib/supabase')
  render(<AuthProvider><TestComponent /></AuthProvider>)
  await act(async () => {})
  await act(async () => { screen.getByText('logout').click() })
  expect(supabase.auth.signOut).toHaveBeenCalled()
})
