import { render, screen } from '@testing-library/react'
import KPICard from './KPICard'

test('renders label and value', () => {
  render(<KPICard label="Faturamento" value="R$ 1.200" variacao={12.5} />)
  expect(screen.getByText('Faturamento')).toBeInTheDocument()
  expect(screen.getByText('R$ 1.200')).toBeInTheDocument()
  expect(screen.getByText(/12\.5%/)).toBeInTheDocument()
})

test('shows negative variation in red', () => {
  render(<KPICard label="Pedidos" value="10" variacao={-5.2} />)
  const varText = screen.getByText(/5\.2%/)
  expect(varText.closest('p')).toHaveClass('text-red-400')
})

test('shows null variation without percentage', () => {
  render(<KPICard label="Reclamações" value="2" variacao={null} />)
  expect(screen.getByText('sem dados anteriores')).toBeInTheDocument()
})
