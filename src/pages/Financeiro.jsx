export default function Financeiro() {
  return (
    <div className="flex flex-col flex-1 h-full">
      <iframe
        src="https://ml-seller-financeiro.cnnmo2.easypanel.host"
        className="flex-1 w-full border-0"
        style={{ minHeight: 'calc(100vh - 56px)' }}
        title="Painel Financeiro"
        allow="same-origin"
      />
    </div>
  )
}
