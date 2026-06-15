import { render, screen, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

function MultiProbe() {
  const { activeAccounts, activeAccount, editAccount, setActiveAccounts, setEditAccount } = useAuth()
  return (
    <div>
      <span data-testid="accounts">{JSON.stringify(activeAccounts)}</span>
      <span data-testid="joined">{activeAccount}</span>
      <span data-testid="edit">{editAccount}</span>
      <button onClick={() => setActiveAccounts(['YUSO', 'M12'])}>multi</button>
      <button onClick={() => setEditAccount('M12')}>set-edit-m12</button>
      <button onClick={() => setActiveAccounts(['OTHER'])}>change-accounts</button>
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

it('setEditAccount muda editAccount quando a loja está em activeAccounts', async () => {
  render(<AuthProvider><MultiProbe /></AuthProvider>)
  await act(async () => {})
  await act(async () => { screen.getByText('multi').click() })
  expect(screen.getByTestId('edit').textContent).toBe('YUSO')
  await act(async () => { screen.getByText('set-edit-m12').click() })
  expect(screen.getByTestId('edit').textContent).toBe('M12')
})

it('mudar activeAccounts para conjunto sem o editAccount escolhido reseta para o primeiro', async () => {
  render(<AuthProvider><MultiProbe /></AuthProvider>)
  await act(async () => {})
  await act(async () => { screen.getByText('multi').click() })
  await act(async () => { screen.getByText('set-edit-m12').click() })
  expect(screen.getByTestId('edit').textContent).toBe('M12')
  // now change activeAccounts to ['OTHER'] which doesn't include M12
  await act(async () => { screen.getByText('change-accounts').click() })
  expect(screen.getByTestId('edit').textContent).toBe('OTHER')
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

// Mock setTokenProvider + api from api
vi.mock('../api', () => ({
  setTokenProvider: vi.fn(),
  api: { minhasContas: vi.fn().mockResolvedValue({ contas: [] }) },
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

test('não reseta a seleção de lojas quando o Supabase re-dispara evento de auth', async () => {
  const { supabase } = await import('../lib/supabase')
  render(<AuthProvider><MultiProbe /></AuthProvider>)
  await act(async () => {})
  // usuária seleciona 2 lojas
  await act(async () => { screen.getByText('multi').click() })
  expect(screen.getByTestId('accounts').textContent).toBe('["YUSO","M12"]')
  // Supabase re-dispara um evento (ex.: TOKEN_REFRESHED / re-foco) com a conta padrão
  const cb = supabase.auth.onAuthStateChange.mock.calls.at(-1)[0]
  await act(async () => {
    cb('TOKEN_REFRESHED', {
      user: { user_metadata: { conta_ml: 'YUSO', role: 'admin' } },
      access_token: 'x',
    })
  })
  // a seleção da usuária deve ser preservada (não voltar para ['YUSO'])
  expect(screen.getByTestId('accounts').textContent).toBe('["YUSO","M12"]')
})
