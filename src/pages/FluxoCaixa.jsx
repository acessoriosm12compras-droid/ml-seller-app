import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'

const BRL = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const PCT = v => v == null ? '—' : `${(v * 100).toFixed(1)}%`
const NUM = v => v == null ? '—' : v.toFixed(1)

function mesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function FluxoCaixa() {
  const { activeAccount } = useAuth()
  const [anoMes, setAnoMes] = useState(mesAtual())
  const qc = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['fluxo-caixa', activeAccount, anoMes],
    queryFn: () => api.fluxoCaixa({ conta_ml: activeAccount, ano_mes: anoMes }),
    enabled: !!activeAccount,
  })

  const salvar = useMutation({
    mutationFn: (body) => api.salvarFluxoCaixa({ ...body, conta_ml: activeAccount, ano_mes: anoMes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fluxo-caixa'] }),
  })

  return (
    <div className="flex flex-col flex-1">
      <Header title="Fluxo de Caixa" onRefresh={refetch} isLoading={isLoading} />
      <main className="flex-1 p-3 sm:p-6 space-y-6">
        <div className="flex items-center justify-end">
          <input type="month" value={anoMes} onChange={e => setAnoMes(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-700" />
        </div>

        {!activeAccount && (
          <div className="text-stone-500 text-sm">Selecione uma loja no topo.</div>
        )}
        {isLoading && <div className="text-stone-500 text-sm">Carregando...</div>}
        {error && <div className="text-red-400 text-sm">{error.message}</div>}
        {data && (
          <>
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-2">
              <h2 className="text-sm font-medium text-stone-600 dark:text-stone-400 mb-2">Quanto desse negócio é dinheiro seu</h2>
              <Linha label="Em produto (estoque)" valor={BRL(data.estoque_custo)} />
              <Linha label="A receber do Mercado Livre · cai em ~15 dias" valor={`+ ${BRL(data.a_receber)}`} />
              <Linha label="Total girando no negócio" valor={BRL(data.aco)} forte />
              <Linha label="O fornecedor banca (crédito)" valor={`− ${BRL(data.fornecedores_total)}`} />
              <div className="flex justify-between items-center bg-sky-50 dark:bg-sky-950 rounded-lg px-4 py-3 mt-2">
                <span className="text-sky-700 dark:text-sky-300 font-medium">Sobra pra você bancar (caixa próprio)</span>
                <span className="text-sky-700 dark:text-sky-300 text-xl font-semibold">{BRL(data.ncg)}</span>
              </div>
              <p className="text-xs text-stone-500 pt-2">
                Dos {BRL(data.ncg)}, {BRL(data.a_receber)} já vão cair em ~15 dias. Dinheiro vivo de folga ≈ <b>{BRL(data.folga_dinheiro_vivo)}</b>.
              </p>
            </div>

            <DadosDoMes key={`${activeAccount}-${anoMes}`} data={data} onSave={salvar.mutate} salvando={salvar.isPending} erro={salvar.isError ? salvar.error?.message : null} />

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <Indic label="Cobertura de estoque" valor={data.indicadores.cobertura_estoque == null ? '—' : `${NUM(data.indicadores.cobertura_estoque)} mês`} />
              <Indic label="Margem do estoque" valor={PCT(data.indicadores.margem_estoque)} />
              <Indic label="Margem líquida" valor={PCT(data.indicadores.margem_liquida)} />
              <Indic label="Dependência fornecedor" valor={PCT(data.indicadores.dependencia_fornecedor)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Cenario titulo="Base (normal)" valor={BRL(data.cenarios.base)} />
              <Cenario titulo="Fornecedor corta crédito" valor={BRL(data.cenarios.fornecedor_corta)} />
              <Cenario titulo="Queda de vendas −30%" valor={BRL(data.cenarios.queda_30)} />
            </div>

            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 overflow-x-auto">
              <h2 className="text-sm font-medium text-stone-600 dark:text-stone-400 mb-3">Acompanhamento mensal</h2>
              <table className="w-full text-sm">
                <thead><tr className="text-stone-500 text-right">
                  <th className="text-left font-normal py-2">Mês</th><th className="font-normal">Faturamento</th>
                  <th className="font-normal">Saldo fornec.</th><th className="font-normal">NCG</th>
                  <th className="font-normal">Δ dívida</th><th className="text-left font-normal pl-3">Alerta</th>
                </tr></thead>
                <tbody>
                  {(data.acompanhamento || []).map(m => (
                    <tr key={m.ano_mes} className="text-right border-t border-stone-100 dark:border-stone-800">
                      <td className="text-left py-2">{m.ano_mes}</td>
                      <td>{BRL(m.faturamento)}</td>
                      <td>{BRL(m.saldo_devedor)}</td>
                      <td>{BRL(m.ncg)}</td>
                      <td className={m.delta_divida > 0 ? 'text-red-500' : ''}>{m.delta_divida == null ? '—' : BRL(m.delta_divida)}</td>
                      <td className="text-left pl-3">{m.alerta ? <span className="text-red-500">⚠ dívida &gt; lucro</span> : <span className="text-emerald-500">OK</span>}</td>
                    </tr>
                  ))}
                  {(!data.acompanhamento || data.acompanhamento.length === 0) && (
                    <tr><td colSpan={6} className="text-stone-500 py-3">Sem meses fechados ainda.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function Linha({ label, valor, forte }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-stone-100 dark:border-stone-800">
      <span className={`text-sm ${forte ? 'text-stone-700 dark:text-stone-300' : 'text-stone-500'}`}>{label}</span>
      <span className={forte ? 'font-medium' : ''}>{valor}</span>
    </div>
  )
}
function Indic({ label, valor }) {
  return (
    <div className="bg-stone-100 dark:bg-stone-800 rounded-lg p-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="text-lg font-semibold">{valor}</div>
    </div>
  )
}
function Cenario({ titulo, valor }) {
  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-4">
      <div className="text-xs text-stone-500">{titulo}</div>
      <div className="text-lg font-semibold mt-1">{valor}</div>
    </div>
  )
}
function CampoAuto({ label, valor }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-stone-500">{label} <span className="text-[11px] text-sky-600 bg-sky-100 dark:bg-sky-950 px-1.5 py-0.5 rounded">auto</span></span>
      <span className="font-medium">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0)}</span>
    </div>
  )
}
function CampoManual({ label, v, set, editavel }) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-stone-500">{label}</span>
      <input type="number" value={v} disabled={!editavel} onChange={e => set(e.target.value)}
        className="w-32 text-right px-2 py-1 rounded border border-stone-300 dark:border-stone-700 bg-transparent disabled:opacity-60" />
    </div>
  )
}
function Fornecedores({ lista, set, editavel }) {
  const add = () => set([...(lista || []), { nome: '', valor: '' }])
  const upd = (i, k, val) => set(lista.map((f, j) => j === i ? { ...f, [k]: val } : f))
  const rem = i => set(lista.filter((_, j) => j !== i))
  return (
    <div className="border-t border-stone-100 dark:border-stone-800 pt-3">
      <div className="text-xs text-stone-500 mb-2">Fornecedores a pagar</div>
      {(lista || []).map((f, i) => (
        <div key={i} className="flex gap-2 mb-2 items-center">
          <input placeholder="Nome" value={f.nome} disabled={!editavel} onChange={e => upd(i, 'nome', e.target.value)}
            className="flex-1 px-2 py-1 rounded border border-stone-300 dark:border-stone-700 bg-transparent text-sm disabled:opacity-60" />
          <input type="number" placeholder="Valor" value={f.valor} disabled={!editavel} onChange={e => upd(i, 'valor', e.target.value)}
            className="w-32 text-right px-2 py-1 rounded border border-stone-300 dark:border-stone-700 bg-transparent text-sm disabled:opacity-60" />
          {editavel && <button onClick={() => rem(i)} className="text-stone-400 hover:text-red-500 text-sm px-1">✕</button>}
        </div>
      ))}
      {editavel && <button onClick={add} className="text-sky-600 text-sm">+ adicionar fornecedor</button>}
    </div>
  )
}
function DadosDoMes({ data, onSave, salvando, erro }) {
  const editavel = data.editavel
  const [form, setForm] = useState({
    estoque_custo: data.inputs.estoque_custo ?? '',
    estoque_liquido: data.inputs.estoque_liquido ?? '',
    a_receber: data.inputs.a_receber ?? '',
    compras: data.inputs.compras ?? '',
    fornecedores: data.inputs.fornecedores ?? [],
  })
  const num = v => v === '' || v == null ? null : Number(v)
  const submit = () => onSave({
    estoque_custo: num(form.estoque_custo), estoque_liquido: num(form.estoque_liquido),
    a_receber: num(form.a_receber), compras: num(form.compras),
    fornecedores: (form.fornecedores || []).filter(f => f.nome || f.valor),
  })
  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-stone-600 dark:text-stone-400">Dados do mês</h2>
        {!editavel && <span className="text-xs text-stone-500">Para editar, escolha uma conta (YUSO ou M12)</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <CampoAuto label="Faturamento" valor={data.vendas.faturamento} />
        <CampoManual label="Estoque a custo" v={form.estoque_custo} set={v => setForm({ ...form, estoque_custo: v })} editavel={editavel} />
        <CampoAuto label="Lucro líquido" valor={data.vendas.lucro_liquido} />
        <CampoManual label="A receber (Mercado Pago)" v={form.a_receber} set={v => setForm({ ...form, a_receber: v })} editavel={editavel} />
        <CampoAuto label="Custos plataforma ML" valor={data.vendas.taxas_ml} />
        <CampoManual label="Compras de mercadoria" v={form.compras} set={v => setForm({ ...form, compras: v })} editavel={editavel} />
        <CampoAuto label="ADS" valor={data.vendas.gasto_ads} />
        <CampoManual label="Estoque líquido previsto" v={form.estoque_liquido} set={v => setForm({ ...form, estoque_liquido: v })} editavel={editavel} />
      </div>
      <Fornecedores lista={form.fornecedores} set={l => setForm({ ...form, fornecedores: l })} editavel={editavel} />
      {editavel && (
        <>
          {erro && <div className="text-red-500 text-sm">{erro}</div>}
          <button onClick={submit} disabled={salvando}
            className="bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60">
            {salvando ? 'Salvando...' : 'Salvar dados do mês'}
          </button>
        </>
      )}
    </div>
  )
}
