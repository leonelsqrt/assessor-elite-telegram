import { useState } from 'react';
import { Send, Mic, Activity, Wallet, GlassWater, Moon } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

function App() {
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setIsProcessing(true);
    try {
      // Enviar para o backend (usando o proxy do Vite em dev ou URL relativa em prod)
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input })
      });

      const data = await res.json();

      if (data.success) {
        alert(data.message); // TODO: Usar um Toast bonito
        setInput('');
      } else {
        alert('Erro: ' + (data.message || 'Desconhecido'));
      }
    } catch (error) {
      console.error(error);
      alert('Erro de conexão com o servidor.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen pb-20 px-4 pt-6 max-w-md mx-auto">
      {/* Header */}
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Acessor Elite</h1>
          <p className="text-2xl font-bold text-white">Olá, Leonel</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
          <span className="text-lg">🦁</span>
        </div>
      </header>

      {/* Main Input */}
      <div className="mb-10 relative group">
        <div className="absolute inset-0 bg-primary/20 blur-xl rounded-2xl group-hover:bg-primary/30 transition-all duration-500"></div>
        <form onSubmit={handleSubmit} className="relative bg-surface/80 backdrop-blur-md border border-white/10 rounded-2xl p-2 shadow-2xl flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ex: Almoço 50 reais..."
            className="flex-1 bg-transparent border-none outline-none text-white px-3 py-3 placeholder:text-gray-500"
            disabled={isProcessing}
          />
          {input.trim() ? (
            <button type="submit" disabled={isProcessing} className="p-3 bg-primary rounded-xl text-white hover:bg-primary/90 transition-colors">
              <Send size={20} />
            </button>
          ) : (
            <button type="button" className="p-3 bg-white/5 rounded-xl text-primary hover:bg-white/10 transition-colors">
              <Mic size={20} />
            </button>
          )}
        </form>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <Card title="Saldo Mensal" value="R$ 3.250" icon={<Wallet className="text-emerald-400" />} />
        <Card title="Gasto Hoje" value="R$ 120,00" sub="Meta: R$ 150" icon={<Activity className="text-red-400" />} />
        <Card title="Água" value="1.2L" sub="Meta: 2.0L" icon={<GlassWater className="text-blue-400" />} />
        <Card title="Sono" value="6h 30m" sub="Meta: 8h" icon={<Moon className="text-indigo-400" />} />
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className="text-lg font-semibold mb-4 text-white">Atividade Recente</h3>
        <div className="space-y-3">
          <ListItem icon="🍔" title="Almoço" time="12:30" amount="- R$ 45,00" type="expense" />
          <ListItem icon="Uber" title="Transporte" time="08:15" amount="- R$ 22,90" type="expense" />
          <ListItem icon="💧" title="Água 500ml" time="10:00" amount="+ Hidratação" type="neutral" />
        </div>
      </div>
    </div>
  );
}

function Card({ title, value, sub, icon }: { title: string, value: string, sub?: string, icon: React.ReactNode }) {
  return (
    <div className="bg-surface/50 backdrop-blur-sm border border-white/5 p-4 rounded-2xl hover:bg-surface/70 transition-colors">
      <div className="flex justify-between items-start mb-3">
        <div className="p-2 bg-white/5 rounded-lg">{icon}</div>
      </div>
      <p className="text-sm text-gray-400">{title}</p>
      <p className="text-xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

function ListItem({ icon, title, time, amount, type }: { icon: string, title: string, time: string, amount: string, type: 'expense' | 'income' | 'neutral' }) {
  return (
    <div className="flex items-center gap-4 p-3 bg-surface/30 rounded-xl border border-white/5">
      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-lg shadow-sm">
        {icon}
      </div>
      <div className="flex-1">
        <p className="font-medium text-white">{title}</p>
        <p className="text-xs text-gray-500">{time}</p>
      </div>
      <p className={cn("font-medium text-sm",
        type === 'expense' && "text-red-400",
        type === 'income' && "text-emerald-400",
        type === 'neutral' && "text-blue-400"
      )}>
        {amount}
      </p>
    </div>
  )
}

export default App;
