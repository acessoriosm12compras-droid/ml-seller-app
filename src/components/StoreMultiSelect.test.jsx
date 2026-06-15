import { render, screen, fireEvent } from '@testing-library/react'
import StoreMultiSelect from './StoreMultiSelect'

const CONTAS = ['YUSO', 'LOCITECH', 'J12', 'M12']

it('marca e desmarca lojas chamando onChange', () => {
  const onChange = vi.fn()
  render(<StoreMultiSelect contas={CONTAS} selecionadas={['YUSO']} onChange={onChange} />)
  fireEvent.click(screen.getByText(/YUSO/))
  fireEvent.click(screen.getByLabelText('M12'))
  expect(onChange).toHaveBeenCalledWith(['YUSO', 'M12'])
})

it('botão Todas seleciona todas as lojas', () => {
  const onChange = vi.fn()
  render(<StoreMultiSelect contas={CONTAS} selecionadas={['YUSO']} onChange={onChange} />)
  fireEvent.click(screen.getByText(/YUSO/))
  fireEvent.click(screen.getByLabelText('Todas'))
  expect(onChange).toHaveBeenCalledWith(CONTAS)
})

it('não permite desmarcar a última loja (mantém ao menos uma)', () => {
  const onChange = vi.fn()
  render(<StoreMultiSelect contas={CONTAS} selecionadas={['YUSO']} onChange={onChange} />)
  fireEvent.click(screen.getByText(/YUSO/))            // abre o dropdown
  fireEvent.click(screen.getByLabelText('YUSO'))       // tenta desmarcar a única
  expect(onChange).not.toHaveBeenCalled()
})
