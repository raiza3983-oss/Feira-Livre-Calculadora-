import { useState, useEffect } from 'react';
import logo from '../logo.png';
import {
  ArrowLeft, Store, Tent, ShoppingBag, Truck,
  Banknote, Info, CheckCircle, Package, Scale, 
  ChevronRight, Calculator, Hash, Layers, Weight,
  Plus, Trash2, X
} from 'lucide-react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import type { AppConfig, UserProfile } from '../types';

const CalculatorScreen = ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  config, onBack, user, onApply, initialData,
}: {
  config: AppConfig | null;
  onBack?: () => void;
  user?: UserProfile | null;
  onApply?: (data: { price: number; unit: string; weightPerUnit: number }) => void;
  initialData?: { price: number; unit: string; weightPerUnit: number };
}) => {
  const [price, setPrice] = useState<number>(initialData?.price || 0);
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<'kg' | 'gram' | 'box' | 'bag' | 'unit'>(
    (initialData?.unit as any) || 'unit'
  );
  const [weightPerUnit, setWeightPerUnit] = useState<number>(initialData?.weightPerUnit || 1);
  const [productName, setProductName] = useState('');
  const [shopType, setShopType] = useState<string>('feira');
  const [amountReceived, setAmountReceived] = useState<number>(0);
  const [items, setItems] = useState<Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    unit: string;
    weightPerUnit: number;
    total: number;
  }>>([]);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const SHOP_TYPES = [
    { id: 'feira',   label: 'Feira Livre', color: 'bg-emerald-500', icon: Store },
    { id: 'barraca', label: 'Barraca Livre',  color: 'bg-amber-500',   icon: Tent },
    { id: 'mercado', label: 'Mercado Livre',  color: 'bg-blue-500',    icon: ShoppingBag },
    { id: 'atacado', label: 'Atacado Livre',  color: 'bg-purple-500',  icon: Truck },
  ];

  const UNITS = [
    { id: 'unit', label: 'UNIDADE', icon: Package },
    { id: 'kg',   label: 'QUILO',   icon: Scale },
    { id: 'gram', label: 'GRAMA',   icon: Weight },
    { id: 'box',  label: 'CAIXA',   icon: Layers },
    { id: 'bag',  label: 'SACO',    icon: ShoppingBag },
  ];

  // Detecta automaticamente o tipo de comércio do vendedor logado
  useEffect(() => {
    if (user && user.role === 'vendor') {
      const fetchShopType = async () => {
        const pathForQuery = 'shops';
        try {
          const q = query(collection(db, pathForQuery), where('ownerUid', '==', user.uid), limit(1));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const shopData = snap.docs[0].data();
            if (shopData.type) setShopType(shopData.type);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, pathForQuery);
        }
      };
      fetchShopType();
    }
  }, [user]);

  // ===== LÓGICA PRINCIPAL DE CÁLCULO =====
  const calculateTotal = () => {
    const basePrice = Number(price) || 0;
    const qty = Number(quantity) || 0;
    const weight = Number(weightPerUnit) || 0;

    // Calculadora Matemática Manual por Peso
    // Preço Total = Preço Base (por kg) * Quantidade * (Peso Unitário convertido para kg)
    
    if (unit === 'kg' || unit === 'unit' || unit === 'box' || unit === 'bag') {
      // No caso de Quilo, Unidade, Caixa ou Saco, o peso/fator já está em unidades inteiras
      return basePrice * qty * weight;
    }
    
    // Para todos os outros (grama, unidade, caixa, saco), o peso é inserido em gramas
    return basePrice * qty * (weight / 1000);
  };

  useEffect(() => {
    // Sugestão de peso padrão ao mudar a unidade
    switch (unit) {
      case 'kg':
        setWeightPerUnit(1);
        break;
      case 'gram':
        setWeightPerUnit(1);
        break;
      case 'unit':
        setWeightPerUnit(1);
        break;
      case 'box':
        setWeightPerUnit(1);
        break;
      case 'bag':
        setWeightPerUnit(1);
        break;
      default:
        setWeightPerUnit(1);
    }
  }, [unit]);

  // Se houver itens na lista, o total é o somatório deles. 
  // O item atual sendo configurado na "Balança" não entra no total geral até ser "Adicionado".
  const itemsTotal = items.reduce((acc, item) => acc + item.total, 0);
  const total = itemsTotal;

  const currentItemTotal = calculateTotal();

  const addItem = () => {
    if (currentItemTotal <= 0) return;

    const newItem = {
      id: Math.random().toString(36).substr(2, 9),
      name: productName || 'Produto sem nome',
      price,
      quantity,
      unit,
      weightPerUnit,
      total: currentItemTotal,
    };

    setItems([...items, newItem]);
    // Limpar campos opcionais mas manter preço se for a mesma venda? 
    // Geralmente em feira se troca o produto, então vamos limpar o nome e resetar qty
    setProductName('');
    setQuantity(1);
    // setPrice(0); // Talvez deixar o preço? Vamos manter por enquanto.
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
    setItemToDelete(null);
  };

  return (
    <div id="calculator-screen" className="min-h-screen bg-[#F4F5F7] font-sans pb-12">
      {/* NOVO: Topo Brand Header */}
  <div className="w-full bg-white border-b border-slate-200 py-2 px-4 md:px-6 mb-8 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center gap-4 md:gap-6">
          <div className="h-10 md:h-12 flex items-center justify-center overflow-hidden shrink-0">
            <img 
              src={logo} 
              alt="Feira Livre Logo" 
              className="h-full w-auto object-contain" 
              referrerPolicy="no-referrer" 
            />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight leading-tight">
              Feira Livre <span className="text-emerald-600">Calculadora</span>
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4">
        {/* Sub Header com Voltar */}
        <div className="flex items-center justify-between mb-8 px-2">
          <div className="flex items-center gap-4">
            {onBack && (
              <button id="back-button" onClick={onBack} className="w-10 h-10 flex items-center justify-center bg-white rounded-full border border-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                <ArrowLeft size={18} />
              </button>
            )}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">Painel de Lançamento</h2>
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">COMERCIALIZAÇÃO DE VENDAS & ESTOQUE</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-6">
            <div id="calculator-main-card" className="bg-white rounded-[32px] p-6 md:p-8 shadow-sm border border-slate-100 space-y-8">
              {/* Tipo de Comércio */}
              <div className="space-y-4">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">SUA LOJA</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {SHOP_TYPES.map((type) => {
                    const Icon = type.icon;
                    const isActive = shopType === type.id;
                    return (
                      <button
                        id={`shop-type-${type.id}`}
                        key={type.id}
                        onClick={() => setShopType(type.id)}
                        className={cn(
                          'flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all duration-300',
                          isActive
                            ? 'border-emerald-500 bg-emerald-50/50 text-emerald-600'
                            : 'border-slate-50 bg-white text-slate-400 hover:border-slate-200 opacity-60'
                        )}
                      >
                        <Icon size={20} />
                        <span className={cn("text-[9px] font-black uppercase tracking-tight leading-tight text-center", isActive ? "text-emerald-700" : "text-slate-500")}>
                          {type.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-6">
                {/* Nome do Produto */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Produto Selecionado</label>
                  <div className="relative group">
                    <input
                      id="product-name-input"
                      type="text"
                      placeholder="Ex: Tomate Cereja, Batata Doce..."
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      className="w-full p-5 bg-slate-50 border-2 border-transparent rounded-[20px] focus:border-emerald-500 focus:bg-white outline-none transition-all font-bold text-slate-800 placeholder:text-slate-300 shadow-inner"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300">
                      <ChevronRight size={20} />
                    </div>
                  </div>
                </div>

                {/* Preço Base */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Preço Venda (R$)</label>
                  <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">R$</span>
                    <input
                      id="price-input"
                      type="number"
                      placeholder="0,00"
                      value={price || ''}
                      onChange={(e) => setPrice(Number(e.target.value))}
                      className="w-full p-5 pl-16 bg-slate-50 border-2 border-transparent rounded-[20px] focus:border-emerald-500 focus:bg-white outline-none font-black text-2xl text-slate-900 shadow-inner"
                    />
                  </div>
                </div>

                {/* Unidade de Venda */}
                <div className="flex flex-col gap-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">MERCADORIAS DE VENDAS</label>
                  <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                    {UNITS.map((u) => {
                      const Icon = u.icon;
                      const isActive = unit === u.id;
                      return (
                        <button
                          key={u.id}
                          onClick={() => setUnit(u.id as any)}
                          className={cn(
                            "flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200",
                            isActive 
                              ? "border-emerald-500 bg-white text-emerald-600 shadow-md ring-4 ring-emerald-50" 
                              : "border-slate-50 bg-slate-50/50 text-slate-400 opacity-60 hover:opacity-100"
                          )}
                        >
                          <Icon size={20} />
                          <span className="text-[9px] font-black tracking-tight">{u.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Calculadora de Peso/Quantidade */}
                <div className="space-y-4 pt-6 border-t border-slate-100">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                       <Calculator size={14} className="text-emerald-500" /> Calculadora de Peso/Quantidade
                    </h3>
                  </div>

                  <div className="bg-slate-50/80 rounded-[24px] p-6 border-2 border-slate-100 space-y-6">
                    <div className="flex items-center justify-between px-1 mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-500">
                          <Hash size={16} />
                        </div>
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Balança Digital</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">QUANTIDADE</label>
                        <input
                          id="quantity-input"
                          type="number"
                          value={quantity}
                          onChange={(e) => setQuantity(Number(e.target.value))}
                          className="w-full p-4 bg-white border-2 border-slate-100 rounded-[16px] outline-none font-black text-xl text-slate-800 shadow-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                          {unit === 'kg' ? 'PESO POR QUILO' : 
                           unit === 'gram' ? 'PESO POR GRAMA' : 
                           unit === 'unit' ? 'UNIDADE' :
                           unit === 'box' ? 'CAIXA' :
                           unit === 'bag' ? 'SACO' :
                           'QUANTIDADE'}
                        </label>
                        <div className="relative group">
                          <input
                            id="weight-per-unit-input"
                            type="number"
                            step="1"
                            value={weightPerUnit || 0}
                            onChange={(e) => setWeightPerUnit(Number(e.target.value))}
                            className="w-full p-4 pr-12 bg-white border-2 border-slate-100 rounded-[16px] outline-none font-black text-xl text-slate-800 shadow-sm"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">
                            {unit === 'kg' ? 'kg' : 
                             unit === 'gram' ? 'g' : 
                             (unit === 'unit' || unit === 'box' || unit === 'bag') ? 'un' :
                             'g'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                      <p className="text-[10px] font-bold text-blue-600 text-center">
                        RESULTADO DA DIVULGAÇÃO: <span className="text-blue-700">
                          {unit === 'gram' 
                            ? "com base no peso por 1 grama, os valores são calculados."
                            : `Este produto será divulgado como: ${quantity} por ${UNITS.find(u => u.id === unit)?.label.toLowerCase() || unit}`
                          }
                        </span>
                      </p>
                    </div>

                    <button
                      onClick={addItem}
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-100"
                    >
                      <Plus size={18} /> Adicionar ao Cálculo
                    </button>

                    {/* Lista de Produtos Adicionados */}
                    {items.length > 0 && (
                      <div className="pt-6 border-t border-slate-200">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1 block mb-4">Produtos no Cálculo</label>
                        <div className="space-y-3">
                          {items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-800 text-sm">{item.name}</span>
                                <span className="text-[10px] text-slate-400 font-medium uppercase">
                                  {item.quantity} {UNITS.find(u => u.id === item.unit)?.label || item.unit} x R$ {item.price.toFixed(2)}
                                </span>
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="font-black text-slate-900 text-sm">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                <button
                                  onClick={() => setItemToDelete(item.id)}
                                  className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal de Exclusão (Sim/Não) */}
            {itemToDelete && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                <div className="bg-white rounded-[32px] p-8 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in duration-200">
                  <div className="flex flex-col items-center text-center space-y-4">
                    <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 mb-2">
                      <Trash2 size={32} />
                    </div>
                    <h3 className="text-xl font-black text-slate-900">Excluir Produto?</h3>
                    <p className="text-sm text-slate-500 font-medium">Você tem certeza que deseja remover este produto do cálculo total?</p>
                    <div className="grid grid-cols-2 gap-4 w-full pt-4">
                      <button
                        onClick={() => setItemToDelete(null)}
                        className="p-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
                      >
                        <X size={18} /> Não
                      </button>
                      <button
                        onClick={() => removeItem(itemToDelete)}
                        className="p-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-100"
                      >
                        <CheckCircle size={18} /> Sim
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Cálculo de Troco Estilo Dark */}
            <div 
              id="change-calculator-card" 
              className="bg-slate-900 p-8 rounded-[32px] shadow-xl text-white flex flex-col md:flex-row items-center justify-between gap-8 transition-all duration-300"
            >
              <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
                  <Banknote size={28} />
                </div>
                <div className="w-full">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 block mb-1">Valor Recebido</label>
                  <div className="relative">
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xl font-bold opacity-30">R$</span>
                    <input
                      id="amount-received-input"
                      type="number"
                      placeholder="0,00"
                      value={amountReceived || ''}
                      onChange={(e) => setAmountReceived(Number(e.target.value))}
                      className="w-full bg-transparent border-none pl-8 p-0 text-3xl font-black focus:outline-none placeholder:text-white/10"
                    />
                  </div>
                </div>
              </div>
              <div id="change-display" className="text-center md:text-right w-full md:w-auto min-w-[120px]">
                <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 block mb-1">Troco Sugerido</label>
                <div className={cn('text-3xl font-black transition-colors', amountReceived >= total ? 'text-emerald-400' : 'text-red-400/80')}>
                  R$ {Math.max(0, amountReceived - total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                {amountReceived > 0 && amountReceived < total && (
                  <p className="text-[8px] font-bold text-red-400/60 uppercase mt-1">Valor abaixo do total</p>
                )}
              </div>
            </div>
          </div>

          {/* Coluna Direita: Resumo */}
          <div className="lg:col-span-4 space-y-6">
            <div 
              id="total-card" 
              className="bg-emerald-600 rounded-[40px] p-8 text-white shadow-xl shadow-emerald-200 flex flex-col h-fit relative overflow-hidden transition-all duration-300"
            >
              <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
              
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-8">
                  <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                    <CheckCircle size={14} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest">Resumo da Venda</span>
                </div>

                <div className="mb-8">
                  <label className="text-[11px] font-bold uppercase opacity-60 block">Total a Receber</label>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-bold opacity-60">R$</span>
                    <span className="text-6xl font-black tracking-tighter">
                      {total.toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="space-y-4 pt-8 border-t border-white/20">
                  <div className="flex justify-between items-center text-xs">
                    <span className="opacity-60">Quant. Itens</span>
                    <span className="font-bold">{items.length}</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    <span className="text-[10px] uppercase font-bold opacity-60">Lista de Pesos / Quantidades</span>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {items.map((item) => (
                        <div key={item.id} className="flex justify-between items-center text-[10px] border-b border-white/10 pb-1 last:border-0">
                          <span className="opacity-80 truncate max-w-[120px]">{item.name}</span>
                          <span className="font-black whitespace-nowrap">
                            {item.quantity} {UNITS.find(u => u.id === item.unit)?.label.toLowerCase().slice(0, 4)} x {item.weightPerUnit}{item.unit === 'kg' ? 'kg' : item.unit === 'gram' ? 'g' : 'un'}
                          </span>
                        </div>
                      ))}
                      {items.length === 0 && (
                        <span className="text-[10px] opacity-40 italic">Aguardando produtos...</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Smart Tip */}
            <div id="tip-card" className="bg-amber-50 rounded-[32px] p-6 border border-amber-100 flex gap-4">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex shrink-0 items-center justify-center text-amber-600">
                <Info size={20} />
              </div>
              <div className="space-y-1">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-900">Dica Prática</h4>
                <p className="text-xs text-amber-800 leading-relaxed font-medium">
                  Confira sempre a tara da balança. O Peso Real multiplicado pelo Preço Base garante a precisão do lucro diário no mercado livre.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalculatorScreen;
