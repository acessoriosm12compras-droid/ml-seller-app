import { render, screen } from '@testing-library/react'
import LojasIndisponiveisAviso from './LojasIndisponiveisAviso'

it('não renderiza nada quando lista vazia', () => {
  const { container } = render(<LojasIndisponiveisAviso lojas={[]} />)
  expect(container.firstChild).toBeNull()
})

it('lista as lojas indisponíveis', () => {
  render(<LojasIndisponiveisAviso lojas={['LOCITECH', 'J12']} />)
  expect(screen.getByText(/LOCITECH/)).toBeInTheDocument()
  expect(screen.getByText(/J12/)).toBeInTheDocument()
})
