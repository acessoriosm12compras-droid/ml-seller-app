import { render, screen, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

vi.mock('../api', () => ({
  api: {
    login: vi.fn().mockResolvedValue({ ok: true }),
    logout: vi.fn().mockResolvedValue({ ok: true }),
  }
}))

function TestComponent() {
  const { isLoggedIn, login, logout } = useAuth()
  return (
    <div>
      <span data-testid="status">{isLoggedIn ? 'logged-in' : 'logged-out'}</span>
      <button onClick={() => login('admin', 'admin')}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  )
}

test('starts logged out', () => {
  localStorage.clear()
  render(<AuthProvider><TestComponent /></AuthProvider>)
  expect(screen.getByTestId('status').textContent).toBe('logged-out')
})

test('login sets isLoggedIn true', async () => {
  localStorage.clear()
  render(<AuthProvider><TestComponent /></AuthProvider>)
  await act(async () => { screen.getByText('login').click() })
  expect(screen.getByTestId('status').textContent).toBe('logged-in')
})

test('logout sets isLoggedIn false', async () => {
  localStorage.setItem('ml_auth', '1')
  render(<AuthProvider><TestComponent /></AuthProvider>)
  expect(screen.getByTestId('status').textContent).toBe('logged-in')
  await act(async () => { screen.getByText('logout').click() })
  expect(screen.getByTestId('status').textContent).toBe('logged-out')
  expect(localStorage.getItem('ml_auth')).toBeNull()
})
