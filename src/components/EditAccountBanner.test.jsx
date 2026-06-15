import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import EditAccountBanner from './EditAccountBanner'

// Mock useAuth
const mockUseAuth = vi.fn()
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

describe('EditAccountBanner', () => {
  it('renders nothing when role is not admin', () => {
    mockUseAuth.mockReturnValue({
      role: 'user',
      activeAccounts: ['YUSO', 'M12'],
      editAccount: 'YUSO',
      setEditAccount: vi.fn(),
    })
    const { container } = render(<EditAccountBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when only one account is selected', () => {
    mockUseAuth.mockReturnValue({
      role: 'admin',
      activeAccounts: ['YUSO'],
      editAccount: 'YUSO',
      setEditAccount: vi.fn(),
    })
    const { container } = render(<EditAccountBanner />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a select with all active accounts when multiple are selected and role is admin', () => {
    mockUseAuth.mockReturnValue({
      role: 'admin',
      activeAccounts: ['YUSO', 'M12'],
      editAccount: 'YUSO',
      setEditAccount: vi.fn(),
    })
    render(<EditAccountBanner />)
    expect(screen.getByText('Editando a loja:')).toBeInTheDocument()
    const select = screen.getByRole('combobox')
    expect(select).toBeInTheDocument()
    expect(select.value).toBe('YUSO')
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[0].value).toBe('YUSO')
    expect(options[1].value).toBe('M12')
  })

  it('calls setEditAccount when a different store is selected', () => {
    const mockSetEditAccount = vi.fn()
    mockUseAuth.mockReturnValue({
      role: 'admin',
      activeAccounts: ['YUSO', 'M12'],
      editAccount: 'YUSO',
      setEditAccount: mockSetEditAccount,
    })
    render(<EditAccountBanner />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'M12' } })
    expect(mockSetEditAccount).toHaveBeenCalledWith('M12')
  })
})
