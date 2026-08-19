import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import ProdutosTable from './ProdutosTable'

function produto(over = {}) {
  return {
    ml_item_id: 'MLB1', titulo: 'Cabo Hdmi', sku: 'FV0031',
    preco_medio: 40, custo_unitario: 15, unidades: 10, total_faturado: 400,
    representatividade: 5, lucro: 100, margem: 25, custo_ads: 10,
    lucro_pos_ads: 90, mpa: 22.5, ...over,
  }
}

describe('ProdutosTable — frete por produto', () => {
  it('mostra o frete por produto', () => {
    render(<ProdutosTable produtos={[produto({ frete: 86.4, subsidio_ml: 210.5 })]} />)
    expect(screen.getByText('Frete')).toBeInTheDocument()
    expect(screen.getByText(/86,40/)).toBeInTheDocument()
  })

  it('deixa o subsídio de frete fora da tabela, que já tem colunas demais', () => {
    // Continua no CSV exportado — lá não custa espaço de tela.
    render(<ProdutosTable produtos={[produto({ frete: 86.4, subsidio_ml: 210.5 })]} />)
    expect(screen.queryByText('Subs. frete')).not.toBeInTheDocument()
    expect(screen.queryByText(/210,50/)).not.toBeInTheDocument()
  })

  it('escreve "—" quando o frete ainda não foi apurado, e não R$ 0,00', () => {
    // Fingir zero faria o produto parecer mais lucrativo do que é.
    render(<ProdutosTable produtos={[produto({ frete: null, subsidio_ml: null })]} />)
    const zeros = screen.queryAllByText('R$ 0,00')
    expect(zeros.length).toBe(0)
  })

  it('mantém a coluna antiga de subsídio de preço, que é outra coisa', () => {
    render(<ProdutosTable produtos={[produto({ frete: 10, subsidio_ml: 20 })]} />)
    expect(screen.getByText('SUBS. ML (R$)')).toBeInTheDocument()
  })
})
