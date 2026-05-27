import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import logo from '../logo.png';
import {
  ArrowLeft, Store, Tent, ShoppingBag, Truck,
  Banknote, Info, CheckCircle, Package, Scale, 
  ChevronRight, Calculator, Hash, Layers, Weight,
  Plus, X, Pencil, Share2, Calendar, User, Search,
  CreditCard, QrCode, Coins, Download
} from 'lucide-react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import type { AppConfig, UserProfile } from '../types';

const SEEDED_PRODUCTS = [
  "Tomate", "Batata", "Cebola", "Cenoura", "Alface", 
  "Banana", "Manga", "Laranja", "Maçã", "Chuchu", 
  "Abobrinha", "Pimentão", "Limão", "Melancia", "Abacaxi",
  "Couve", "Brócolis", "Cheiro Verde", "Mamão", "Uva",
  "Ovo", "Mandioca", "Inhame"
];

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
    comercializacao?: string;
    comercialUnit?: string;
    comercialText?: string;
  }>>([]);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [saleToDelete, setSaleToDelete] = useState<string | null>(null);
  const [comercialUnit, setComercialUnit] = useState<string>('');
  const [comercialText, setComercialText] = useState<string>('');

  // Estados adicionados para Histórico, Busca Rápida e Editar
  const [activeTab, setActiveTab] = useState<'calculator' | 'products' | 'history'>('calculator');
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('dinheiro');
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [recentProductNames, setRecentProductNames] = useState<string[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showReceiptToast, setShowReceiptToast] = useState(false);

  // Estados para Gestão de Produtos em Estoque
  const [products, setProducts] = useState<Array<{
    id: string;
    name: string;
    quantity: number;
    unit: 'kg' | 'gram' | 'box' | 'bag' | 'unit';
    weightPerUnit: number;
    costPrice: number;
    createdAt?: string;
  }>>([]);
  const [productFormId, setProductFormId] = useState<string | null>(null);
  const [productFormName, setProductFormName] = useState<string>('');
  const [productFormQuantity, setProductFormQuantity] = useState<number>(0);
  const [productFormUnit, setProductFormUnit] = useState<'kg' | 'gram' | 'box' | 'bag' | 'unit'>('unit');
  const [productFormWeightPerUnit, setProductFormWeightPerUnit] = useState<number>(0);
  const [productFormCostPrice, setProductFormCostPrice] = useState<number>(0);

  // Carregar histórico e nomes de produtos recentes e estoque do localStorage na inicialização
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('feiralivre_sales_history');
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        setSalesHistory(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
      }
      
      const savedRecent = localStorage.getItem('feiralivre_recent_products');
      if (savedRecent) {
        const parsed = JSON.parse(savedRecent);
        setRecentProductNames(Array.isArray(parsed) ? parsed.filter(Boolean) : SEEDED_PRODUCTS);
      } else {
        setRecentProductNames(SEEDED_PRODUCTS);
      }

      const savedProducts = localStorage.getItem('feiralivre_products');
      if (savedProducts) {
        const parsed = JSON.parse(savedProducts);
        const filtered = Array.isArray(parsed) ? parsed.filter(p => p && p.name && p.id !== '1' && p.id !== '2' && p.id !== '3' && p.id !== '4') : [];
        setProducts(filtered);
        localStorage.setItem('feiralivre_products', JSON.stringify(filtered));
      } else {
        const initialProducts: Array<{
          id: string;
          name: string;
          quantity: number;
          unit: 'kg' | 'gram' | 'box' | 'bag' | 'unit';
          weightPerUnit: number;
          costPrice: number;
          createdAt?: string;
        }> = [];
        setProducts(initialProducts);
        localStorage.setItem('feiralivre_products', JSON.stringify(initialProducts));
      }
    } catch (e) {
      console.error("Erro ao carregar dados do localStorage", e);
    }
  }, []);

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
          console.warn("Could not fetch shop type on boot (offline mode active):", error);
        }
      };
      fetchShopType();
    }
  }, [user]);

  // ===== LÓGICA PRINCIPAL DE CÁLCULO =====
  const calculateTotal = () => {
    const basePrice = Number(price) || 0;
    const qty = Number(quantity) || 0;
    const w = Number(weightPerUnit) || 1;

    // Calculadora Matemática Manual por Peso com Fator Medida de Gramas
    // Preço Total = (Preço do Quilo / 1000) * Gramas * Quantidade
    if (unit === 'gram') {
      return (basePrice / 1000) * w * qty;
    }
    // Para kg, caixas (box), sacos (bag) ou unidades (unit), multiplicamos o preço de venda pela quantidade de volumes e pelo peso/unidades de cada volume.
    // Se o peso/multiplicador por volume for 1 (padrão), o cálculo se mantém perfeitamente como basePrice * qty.
    return basePrice * w * qty;
  };

  useEffect(() => {
    // Sugestão de peso padrão ao mudar a unidade
    switch (unit) {
      case 'kg':
        setWeightPerUnit(1);
        break;
      case 'gram':
        setWeightPerUnit(1000);
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
  const totalQuantity = items.reduce((acc, item) => acc + item.quantity, 0);
  const total = itemsTotal;

  const getUnitAbbreviation = (u: string) => {
    switch (u) {
      case 'kg': return 'kg';
      case 'gram': return 'g';
      case 'unit': return 'un';
      case 'box': return 'CX';
      case 'bag': return 'SC';
      default: return 'un';
    }
  };

  const formatarMercadoria = (q: number, unitId: string) => {
    const unidades: Record<string, [string, string]> = {
      unit: ["unidade", "unidades"],
      kg: ["quilo", "quilos"],
      gram: ["grama", "gramas"],
      box: ["caixa", "caixas"],
      bag: ["saco", "sacos"],
    };

    const [singular, plural] = unidades[unitId] || [unitId, unitId + "s"];
    const isSingular = q >= 0 && q <= 1.001;

    return `${q} ${isSingular ? singular : plural}`;
  };

  const formatarQuantidadeComUnidade = (q: number, unitId: string) => {
    const unidades: Record<string, [string, string]> = {
      unit: ["unidade", "unidades"],
      kg: ["quilo", "quilos"],
      gram: ["grama", "gramas"],
      box: ["caixa", "caixas"],
      bag: ["saco", "sacos"],
    };

    const [singular, plural] = unidades[unitId] || [unitId, unitId + "s"];
    const isSingular = q >= 0 && q <= 1.001;
    return `${q} ${isSingular ? singular : plural}`;
  };

  const obterLabelMedida = (q: number, unitId: string) => {
    const unidades: Record<string, [string, string]> = {
      unit: ["Unidade", "Unidades"],
      kg: ["quilo", "quilos"],
      gram: ["grama", "gramas"],
      box: ["caixa", "caixas"],
      bag: ["saco", "sacos"],
    };
    const [singular, plural] = unidades[unitId] || [unitId, unitId + "s"];
    const isSingular = q >= 0 && q <= 1.001;
    return isSingular ? singular : plural;
  };

  const obterLabelPagamento = (method: string) => {
    const methods: Record<string, string> = {
      dinheiro: 'Dinheiro',
      pix: 'Pix',
      cartao_credito: 'Cartão de Crédito',
      cartao_debito: 'Cartão de Débito',
      cartao_credito_virtual: 'Cartão de Crédito Virtual',
      cartao_debito_virtual: 'Cartão de Débito Virtual',
    };
    return methods[method] || method || 'Dinheiro';
  };

  const getProductMetrics = (p: { name: string; quantity: number; unit: string; weightPerUnit: number }) => {
    if (!p || !p.name) {
      return {
        totalRegisteredContent: 0,
        totalSoldContent: 0,
        remainingContent: 0,
        remainingContainers: 0,
        percentRemaining: 0,
        baseWeightOrCountPerContainer: 1,
        isWeightBased: false,
        contentUnitLabel: 'unidades'
      };
    }
    const baseWeightOrCountPerContainer = p.weightPerUnit || 1;
    const isGram = p.unit === 'gram';
    
    // Total registered capacity in physical content unit (grams for 'gram', units for 'unit', kg for others)
    const totalRegisteredContent = (p.quantity || 0) * baseWeightOrCountPerContainer;
    
    let totalSoldContent = 0;
    
    salesHistory.forEach((sale) => {
      if (sale && Array.isArray(sale.items)) {
        sale.items.forEach((item) => {
          if (item && item.name && p.name && item.name.trim().toLowerCase() === p.name.trim().toLowerCase()) {
            if (p.unit === 'unit') {
              if (item.unit === 'unit') {
                totalSoldContent += item.quantity || 0;
              } else {
                totalSoldContent += (item.quantity || 0) * (item.weightPerUnit || 1);
              }
            } else {
              const itemIsGram = item.unit === 'gram';
              const itemWeightPerUnit = item.weightPerUnit || 1;
              const itemTotalWeightInGrams = itemIsGram ? ((item.quantity || 0) * itemWeightPerUnit) : ((item.quantity || 0) * itemWeightPerUnit * 1000);
              
              if (isGram) {
                totalSoldContent += itemTotalWeightInGrams;
              } else {
                // Product is weight based (kg, bag, box). Convert sale weight from grams to kg
                totalSoldContent += itemTotalWeightInGrams / 1000;
              }
            }
          }
        });
      }
    });

    const remainingContent = Math.max(0, totalRegisteredContent - totalSoldContent);
    
    let remainingContainers = 0;
    if (p.unit === 'bag' || p.unit === 'box') {
      remainingContainers = Math.ceil(remainingContent / baseWeightOrCountPerContainer);
    } else {
      remainingContainers = remainingContent / baseWeightOrCountPerContainer;
    }
    
    const percentRemaining = totalRegisteredContent > 0 ? (remainingContent / totalRegisteredContent) * 100 : 0;
    
    return {
      totalRegisteredContent,
      totalSoldContent,
      remainingContent,
      remainingContainers,
      percentRemaining,
      baseWeightOrCountPerContainer,
      isWeightBased: p.unit !== 'unit',
      contentUnitLabel: p.unit === 'unit' ? 'unidades' : p.unit === 'gram' ? 'gramas' : 'quilos'
    };
  };

  const saveProducts = (updatedProducts: any[]) => {
    setProducts(updatedProducts);
    localStorage.setItem('feiralivre_products', JSON.stringify(updatedProducts));
  };

  const handleSaveProduct = () => {
    if (!productFormName.trim()) {
      alert("Por favor, digite o nome do produto.");
      return;
    }

    if (productFormId) {
      // Editar
      const updated = products.map(p => p.id === productFormId ? {
        ...p,
        name: productFormName.trim(),
        quantity: Number(productFormQuantity) || 0,
        unit: productFormUnit,
        weightPerUnit: isNaN(Number(productFormWeightPerUnit)) ? 0 : Number(productFormWeightPerUnit),
        costPrice: Number(productFormCostPrice) || 0,
      } : p);
      saveProducts(updated);
      setProductFormId(null);
    } else {
      // Adicionar novo
      const newProduct = {
        id: Math.random().toString(36).substr(2, 9),
        name: productFormName.trim(),
        quantity: Number(productFormQuantity) || 0,
        unit: productFormUnit,
        weightPerUnit: isNaN(Number(productFormWeightPerUnit)) ? 0 : Number(productFormWeightPerUnit),
        costPrice: Number(productFormCostPrice) || 0,
        createdAt: new Date().toLocaleString('pt-BR', {
          dateStyle: 'short',
          timeStyle: 'short'
        })
      };
      saveProducts([...products, newProduct]);
    }

    // Resetar campos
    setProductFormName('');
    setProductFormQuantity(0);
    setProductFormUnit('unit');
    setProductFormWeightPerUnit(0);
    setProductFormCostPrice(0);
  };

  const confirmDeleteProduct = (id: string) => {
    const updated = products.filter(p => p.id !== id);
    saveProducts(updated);
    setProductToDelete(null);
  };

  const startEditProduct = (p: any) => {
    setProductFormId(p.id);
    setProductFormName(p.name);
    setProductFormQuantity(p.quantity);
    setProductFormUnit(p.unit);
    setProductFormWeightPerUnit(p.weightPerUnit);
    setProductFormCostPrice(p.costPrice);
  };

  const cancelEditProduct = () => {
    setProductFormId(null);
    setProductFormName('');
    setProductFormQuantity(0);
    setProductFormUnit('unit');
    setProductFormWeightPerUnit(0);
    setProductFormCostPrice(0);
  };

  useEffect(() => {
    if (!productFormId) {
      setProductFormWeightPerUnit(0);
    }
  }, [productFormUnit, productFormId]);

  const formatarComercializacao = (unitStr: string, textStr: string) => {
    if (!unitStr) return '';
    
    const unidades: Record<string, [string, string]> = {
      grama: ["grama", "gramas"],
      quilo: ["quilo", "quilos"],
      saco: ["saco", "sacos"],
      unidade: ["unidade", "unidades"],
      caixa: ["caixa", "caixas"],
    };

    const lowerUnit = unitStr.toLowerCase();
    const [singular, plural] = unidades[lowerUnit] || [unitStr, unitStr + "s"];

    const trimmed = textStr.trim();
    const match = trimmed.match(/^([0-9]+(?:[.,][0-9]+)?)/);

    if (match) {
      const numStr = match[1].replace(',', '.');
      const num = parseFloat(numStr);
      // 0 or 1 is singular (diminutivo), 2, 3... is plural (aumentativo)
      const isSingular = num >= 0 && num <= 1.001;
      const formattedUnit = isSingular ? singular : plural;

      const numLen = match[1].length;
      const rest = trimmed.substring(numLen).trim();
      return `${match[1]} ${formattedUnit}${rest ? ' ' + rest : ''}`;
    } else {
      return trimmed ? `${singular} ${trimmed}` : singular;
    }
  };

  const currentItemTotal = calculateTotal();

  const addItem = () => {
    if (currentItemTotal <= 0) return;

    let comercializacao = '';
    if (comercialUnit) {
      comercializacao = formatarComercializacao(comercialUnit, comercialText);
    }

    if (editingItemId) {
      // Editar item existente
      setItems(items.map(item => {
        if (item.id === editingItemId) {
          return {
            ...item,
            name: productName || 'Produto sem nome',
            price,
            quantity,
            unit,
            weightPerUnit,
            total: currentItemTotal,
            comercializacao: comercializacao || undefined,
            comercialUnit: comercialUnit || undefined,
            comercialText: comercialText || undefined,
          };
        }
        return item;
      }));
      setEditingItemId(null);
    } else {
      // Adicionar novo item
      const newItem = {
        id: Math.random().toString(36).substr(2, 9),
        name: productName || 'Produto sem nome',
        price,
        quantity,
        unit,
        weightPerUnit,
        total: currentItemTotal,
        comercializacao: comercializacao || undefined,
        comercialUnit: comercialUnit || undefined,
        comercialText: comercialText || undefined,
      };
      setItems([...items, newItem]);
    }

    // Resetar campos
    setProductName('');
    setQuantity(1);
    setComercialUnit('');
    setComercialText('');
  };

  const startEditItem = (item: any) => {
    setEditingItemId(item.id);
    setProductName(item.name);
    setPrice(item.price);
    setUnit(item.unit as any);
    setWeightPerUnit(item.weightPerUnit);
    setQuantity(item.quantity);
    setComercialUnit(item.comercialUnit || '');
    setComercialText(item.comercialText || '');
    
    // Rolar até o formulário de cálculo
    const target = document.getElementById('product-name-input');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
      target.focus();
    }
  };

  const cancelEdit = () => {
    setEditingItemId(null);
    setProductName('');
    setQuantity(1);
    setComercialUnit('');
    setComercialText('');
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
    setItemToDelete(null);
    if (editingItemId === id) {
      setEditingItemId(null);
    }
  };

  // Histórico de Vendas Off-line
  const finishSale = () => {
    if (items.length === 0) return;

    const currentShop = SHOP_TYPES.find(t => t.id === shopType) || SHOP_TYPES[0];
    const shopLabel = currentShop ? currentShop.label : 'Feira Livre';

    const newSale = {
      id: Math.random().toString(36).substr(2, 9),
      customerName: customerName.trim() || `Cliente - ${shopLabel}`,
      date: new Date().toLocaleString('pt-BR'),
      items: [...items],
      total: total,
      amountReceived: amountReceived,
      change: Math.max(0, amountReceived - total),
      shopType: shopType,
      paymentMethod: paymentMethod,
    };

    const updatedHistory = [newSale, ...salesHistory];
    setSalesHistory(updatedHistory);
    localStorage.setItem('feiralivre_sales_history', JSON.stringify(updatedHistory));

    // Salvar o nome de exibição no histórico de produtos sugeridos
    const completedProductNames = items.map(item => item.name);
    const updatedRecents = Array.from(new Set([...completedProductNames, ...recentProductNames])).slice(0, 30);
    setRecentProductNames(updatedRecents);
    localStorage.setItem('feiralivre_recent_products', JSON.stringify(updatedRecents));

    // Limpar estados
    setItems([]);
    setCustomerName('');
    setPaymentMethod('dinheiro');
    setAmountReceived(0);
    setProductName('');
    setQuantity(1);
    setPrice(0);
    setComercialUnit('');
    setComercialText('');

    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 4000);
  };

  const deleteSaleFromHistory = (saleId: string) => {
    setSaleToDelete(saleId);
  };

  const confirmDeleteSale = () => {
    if (saleToDelete) {
      const updated = salesHistory.filter(s => s.id !== saleToDelete);
      setSalesHistory(updated);
      localStorage.setItem('feiralivre_sales_history', JSON.stringify(updated));
      setSaleToDelete(null);
    }
  };

  const getReceiptTitle = (sType: string) => {
    const shopLabel = 
      sType === 'barraca' ? 'Barraca Livre' :
      sType === 'mercado' ? 'Mercado Livre' :
      sType === 'atacado' ? 'Atacado Livre' : 'Feira Livre';
    return `1. ${shopLabel} - Recibo de Venda`;
  };

  const generateReceiptText = (sale: any) => {
    if (!sale) return '';
    const sType = sale.shopType || shopType;
    const title = getReceiptTitle(sType);

    let text = `*${title}*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `👤 *Cliente:* ${sale.customerName || 'Cliente sem nome'}\n`;
    text += `📅 *Data:* ${sale.date || ''}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    const saleItems = Array.isArray(sale.items) ? sale.items : [];
    saleItems.forEach((item: any, idx: number) => {
      if (!item) return;
      const quantityText = formatarQuantidadeComUnidade(item.quantity || 0, item.unit || 'unit');
      const weightText = formatarMercadoria(item.weightPerUnit || 0, item.unit || 'unit');
      const precoUnitRatio = item.unit === 'gram' ? 1000 : 1;
      const precoUnitText = `${formatarMercadoria(precoUnitRatio, item.unit || 'unit')} — R$ ${(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

      const weightLabel = obterLabelMedida(item.weightPerUnit || 0, item.unit || 'unit');

      text += `${idx + 1}. *${item.name || 'Produto'}*\n`;
      text += `   • ${item.quantity <= 1 ? "Quantidade" : "Quantidades"}: ${item.quantity || 0}\n`;
      text += `   • ${weightLabel}: ${weightText}\n`;
      if (item.comercializacao) {
        text += `   • Comercialização: ${item.comercializacao}\n`;
      }
      text += `   • Preço Unitário: ${precoUnitText}\n`;
      text += `   • Preço do produto: R$ ${(item.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\n`;
    });
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `💵 *TOTAL A PAGAR:* R$ ${(sale.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    if (sale.paymentMethod) {
      text += `💳 *Forma de Pagamento:* ${obterLabelPagamento(sale.paymentMethod)}\n`;
    }
    if (sale.amountReceived > 0) {
      text += `🪙 *Pago:* R$ ${(sale.amountReceived || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
      text += `🪙 *Troco:* R$ ${(sale.change || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    }
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `Muito obrigado pela preferência! 😊🥬🍍`;
    return text;
  };

  const shareReceipt = async (sale: any) => {
    const text = generateReceiptText(sale);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Recibo de ${sale.customerName}`,
          text: text,
        });
      } catch {
        copyToClipboard(text);
      }
    } else {
      copyToClipboard(text);
    }
  };

  const exportSalesText = () => {
    if (salesHistory.length === 0) return;
    
    let text = `*1. EXPORTAÇÃO DE VENDAS*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    salesHistory.forEach((sale, index) => {
      const orderNumber = salesHistory.length - index;
      text += `📦 *Pedido nº ${orderNumber}*\n`;
      text += `👤 *Cliente:* ${sale.customerName || 'Cliente sem nome'}\n`;
      text += `📅 *Data:* ${sale.date || ''}\n`;
      text += `💳 *Forma de Pagamento:* ${obterLabelPagamento(sale.paymentMethod)}\n`;
      text += `💵 *Total:* R$ ${(sale.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
      if (sale.amountReceived > 0) {
        text += `🪙 *Pago:* R$ ${(sale.amountReceived || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | *Troco:* R$ ${(sale.change || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
      }
      text += `🛒 *Produtos:*\n`;
      const saleItems = Array.isArray(sale.items) ? sale.items : [];
      saleItems.forEach((item: any, itemIdx: number) => {
        text += `   ${itemIdx + 1}. ${item.name || 'Produto'} — Qtd: ${item.quantity || 0} (${obterLabelMedida(item.weightPerUnit, item.unit)}: ${formatarMercadoria(item.weightPerUnit, item.unit)}) — total: R$ ${(item.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
      });
      text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    });
    
    text += `📈 *Faturamento Acumulado:* R$ ${salesHistory.reduce((acc, s) => acc + (s.total || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    text += `Gerado em: ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`;
    
    copyToClipboard(text);
  };

  const copyToClipboard = (text: string) => {
    const fallbackCopy = (val: string) => {
      const textArea = document.createElement("textarea");
      textArea.value = val;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Fallback: Falha ao copiar', err);
      }
      document.body.removeChild(textArea);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          setShowReceiptToast(true);
          setTimeout(() => setShowReceiptToast(false), 3000);
        })
        .catch((err) => {
          console.warn('writeText falhou, tentando fallback', err);
          fallbackCopy(text);
          setShowReceiptToast(true);
          setTimeout(() => setShowReceiptToast(false), 3000);
        });
    } else {
      fallbackCopy(text);
      setShowReceiptToast(true);
      setTimeout(() => setShowReceiptToast(false), 3000);
    }
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
            <h1 className="text-lg md:text-xl font-black tracking-tight leading-tight">
              <span className="text-emerald-600">Feira Livre</span> <span className="text-yellow-500">Calculadora</span>
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4">
        {/* Sub Header com Voltar e Abas */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 px-2">
          <div className="flex items-center gap-4">
            {onBack && (
              <button id="back-button" onClick={onBack} className="w-10 h-10 flex items-center justify-center bg-white rounded-full border border-slate-200 text-slate-400 hover:text-slate-600 transition-colors">
                <ArrowLeft size={18} />
              </button>
            )}
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                {activeTab === 'calculator' ? 'Painel de Lançamento' : activeTab === 'products' ? 'Produto' : 'Minha Venda'}
              </h2>
              <p className={cn(
                "text-[10px] font-bold text-emerald-600 tracking-widest",
                activeTab === 'calculator' ? "uppercase" : "normal-case"
              )}>
                {activeTab === 'calculator' 
                  ? 'COMERCIALIZAÇÃO DE VENDAS & ESTOQUE' 
                  : activeTab === 'products'
                    ? 'REGISTRO DE PRODUTO, CONTROLE DE QUANTIDADE DE ESTOQUE.'
                    : 'Registro de venda, histórico de venda salva.'}
              </p>
            </div>
          </div>

          {/* Abas Modernas */}
          <div className="flex flex-col bg-slate-200/60 p-1.5 rounded-2xl items-center border border-slate-200 gap-1 w-full max-w-[160px] mx-auto md:mx-0 shrink-0">
            <button
              onClick={() => setActiveTab('calculator')}
              className={cn(
                "px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 w-full",
                activeTab === 'calculator' 
                  ? "bg-white text-emerald-700 shadow-sm font-extrabold" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-300/40"
              )}
            >
              <Calculator size={11} /> Calculadora
            </button>
            <button
              onClick={() => setActiveTab('products')}
              className={cn(
                "px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 w-full",
                activeTab === 'products' 
                  ? "bg-white text-emerald-700 shadow-sm font-extrabold" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-300/40"
              )}
            >
              <Package size={11} /> Produto
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={cn(
                "px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 relative w-full",
                activeTab === 'history' 
                  ? "bg-white text-emerald-700 shadow-sm font-extrabold" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-300/40"
              )}
            >
              <CheckCircle size={11} /> Minha Venda
              {salesHistory.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-emerald-600 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-white">
                  {salesHistory.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {activeTab === 'calculator' ? (
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

                  {/* Mais Vendidos / Sugestões Rápidas */}
                  <div className="mt-1 flex flex-col gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400/80 ml-1 flex items-center gap-1">
                      <Search size={10} /> Lista de Já Vendidos / Mais Vendidos (Estoque)
                    </span>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto py-1 pr-1">
                      {(() => {
                        const availableProducts = products;
                        return availableProducts.length > 0 ? (
                          (productName 
                            ? availableProducts.filter(p => p.name.toLowerCase().includes(productName.toLowerCase()))
                            : availableProducts
                          ).slice(0, 15).map((p) => {
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setProductName(p.name);
                                if (p.unit) setUnit(p.unit as any);
                                if (p.weightPerUnit !== undefined) setWeightPerUnit(p.weightPerUnit);
                                if (p.costPrice) setPrice(p.costPrice);
                                document.getElementById('price-input')?.focus();
                              }}
                              className="text-[10px] font-bold px-3 py-1.5 border border-slate-200 hover:border-emerald-500 hover:text-emerald-700 text-slate-600 bg-white hover:bg-emerald-50/30 rounded-full transition-all flex items-center gap-1.5 shadow-sm shrink-0 cursor-pointer"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              <span>{p.name}</span>
                            </button>
                          );
                        })
                      ) : (
                        <span className="text-[10px] text-slate-400 italic font-medium ml-1">Nenhum produto cadastrado</span>
                      );
                    })()}
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
                          {obterLabelMedida(1, unit).toUpperCase()}
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
                            {getUnitAbbreviation(unit)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Dinâmica de Comercialização Opcional */}
                    <div className="space-y-3 pt-4 border-t border-slate-200/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Coluna Opcional - Dinâmica de Comercialização</span>
                        <span className="text-[8px] bg-slate-100 text-slate-500 py-0.5 px-2 rounded-full font-bold uppercase">Demonstrativo</span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Menu Comercialização</label>
                          <select
                            id="demo-comercial-unit"
                            value={comercialUnit}
                            onChange={(e) => setComercialUnit(e.target.value)}
                            className="w-full p-4 bg-white border-2 border-slate-100 rounded-[16px] outline-none font-bold text-sm text-slate-700 shadow-sm focus:border-emerald-500 transition-colors"
                          >
                            <option value="">Nenhuma opção selecionada</option>
                            <option value="grama">Grama</option>
                            <option value="quilo">Quilo</option>
                            <option value="saco">Saco</option>
                            <option value="unidade">Unidade</option>
                            <option value="caixa">Caixa</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Peso ou Medida</label>
                          <input
                            id="demo-comercial-text"
                            type="text"
                            placeholder=""
                            value={comercialText}
                            onChange={(e) => setComercialText(e.target.value)}
                            disabled={!comercialUnit}
                            className="w-full p-4 bg-white border-2 border-slate-100 rounded-[16px] outline-none font-bold text-sm text-slate-800 shadow-sm focus:border-emerald-500 transition-colors disabled:opacity-50 disabled:bg-slate-50"
                          />
                        </div>
                      </div>

                      {comercialUnit && (
                        <p className="text-[9px] text-slate-400 italic font-medium ml-1">
                          Será demonstrado como: <span className="font-bold text-slate-600">
                            {formatarComercializacao(comercialUnit, comercialText)}
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                      <p className="text-[10px] font-bold text-blue-600 text-center">
                        RESULTADO DA DIVULGAÇÃO: <span className="text-blue-700">
                          {unit === 'gram' 
                            ? "com base no peso por 1 quilo, os valores são calculados para gramas."
                            : `Este produto será divulgado como: por ${UNITS.find(u => u.id === unit)?.label.toLowerCase() || unit}`
                          }
                        </span>
                      </p>
                    </div>

                    {editingItemId ? (
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={addItem}
                          className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-100"
                        >
                          <Pencil size={18} /> Salvar Alterações
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="w-full sm:w-auto py-4 px-6 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={addItem}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
                      >
                        <Plus size={18} /> Adicionar ao Cálculo
                      </button>
                    )}

                    {/* Lista de Produtos Adicionados */}
                    {items.length > 0 && (
                      <div className="pt-6 border-t border-slate-200">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1 block mb-4">Produtos nos Cálculos</label>
                        <div className="space-y-3">
                          {items.map((item, index) => (
                            <div key={item.id} className={cn(
                              "flex items-center justify-between p-4 rounded-2xl border transition-all hover:shadow-md",
                              editingItemId === item.id 
                                ? "border-amber-400 bg-amber-50/40 shadow-inner" 
                                : "bg-white border-slate-100 shadow-sm"
                            )}>
                              <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-slate-800 text-sm flex items-center gap-1.5 flex-wrap">
                                  <span>{index + 1}. {item.name}</span>
                                  
                                  <span className="inline-flex items-center gap-0.5">
                                    <button
                                      onClick={() => startEditItem(item)}
                                      title="Editar Produto"
                                      className={cn(
                                        "w-6 h-6 flex items-center justify-center rounded-md transition-colors",
                                        editingItemId === item.id 
                                          ? "text-amber-600 bg-amber-100" 
                                          : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                      )}
                                    >
                                      <Pencil size={11} />
                                    </button>
                                    <button
                                      onClick={() => setItemToDelete(item.id)}
                                      title="Excluir Produto"
                                      className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500 rounded-md transition-colors bg-transparent border-0"
                                    >
                                      <X size={11} />
                                    </button>
                                  </span>

                                  {editingItemId === item.id && (
                                    <span className="text-[9px] bg-amber-500 text-white py-0.5 px-2 rounded-full font-bold uppercase">
                                      Editando
                                    </span>
                                  )}
                                </span>
                                <div className="flex flex-col text-[9px] uppercase font-bold text-slate-500 gap-0.5">
                                  <span>{item.quantity <= 1 ? "Quantidade" : "Quantidades"}: {item.quantity}</span>
                                  <span>{obterLabelMedida(item.weightPerUnit, item.unit)}: {formatarMercadoria(item.weightPerUnit, item.unit)}</span>
                                  {item.comercializacao && (
                                    <span className="text-emerald-600 font-extrabold normal-case">Comercialização: {item.comercializacao}</span>
                                  )}
                                  <span className="text-slate-400">Preço Unitário: {formatarMercadoria(item.unit === 'gram' ? 1000 : 1, item.unit)} — R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 md:gap-4 shrink-0">
                                <span className="font-black text-emerald-600 text-sm whitespace-nowrap mr-1">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
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
            <AnimatePresence>
              {itemToDelete && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent"
                  onClick={() => setItemToDelete(null)}
                >
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-[40px] p-10 w-full max-w-sm shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-slate-100 pointer-events-auto"
                  >
                    <div className="flex flex-col items-center text-center space-y-6">
                      <div className="text-red-500 mb-2">
                        <X size={48} />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Excluir Item?</h3>
                        <p className="text-sm text-slate-500 font-medium px-4">
                          Deseja remover <span className="text-slate-900 font-bold">"{items.find(i => i.id === itemToDelete)?.name}"</span> da lista de cálculos?
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 w-full pt-4">
                        <button
                          onClick={() => removeItem(itemToDelete)}
                          className="py-3 px-4 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-sm tracking-wider transition-colors border-0 shadow-none text-center flex items-center justify-center justify-self-center w-full"
                        >
                          Sim
                        </button>
                        <button
                          onClick={() => setItemToDelete(null)}
                          className="py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm tracking-wider transition-colors border-0 shadow-none text-center flex items-center justify-center justify-self-center w-full"
                        >
                          Não
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Cálculo de Troco Estilo Dark */}
            <div 
              id="change-calculator-card" 
              className="bg-slate-900 p-8 rounded-[32px] shadow-xl text-white flex flex-col md:flex-row items-center justify-between gap-8 transition-all duration-300"
            >
              <div className="flex items-center gap-4 w-full md:w-auto">
                <div 
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-emerald-400 shrink-0"
                  style={{ boxShadow: 'none', filter: 'none', background: '#1e293b' }}
                >
                  <Banknote size={28} style={{ boxShadow: 'none', filter: 'none' }} />
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
          <div className="lg:col-span-4 space-y-6 w-full max-w-full overflow-hidden" style={{ width: '100%', maxWidth: '100%' }}>
            <div 
              id="total-card" 
              className="w-full max-w-full bg-emerald-600 rounded-[40px] p-6 md:p-8 text-white shadow-md flex flex-col h-fit relative overflow-hidden"
              style={{ 
                willChange: 'auto', 
                transform: 'none', 
                backfaceVisibility: 'hidden',
                position: 'relative',
                overflow: 'hidden',
                width: '100%',
                maxWidth: '100%'
              }}
            >
              <div className="relative z-10 w-full max-w-full overflow-hidden flex flex-col" style={{ width: '100%', maxWidth: '100%' }}>
                <div className="flex items-center gap-2 mb-8 shrink-0">
                  <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                    <CheckCircle size={14} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest">Resumo da Venda</span>
                </div>

                {/* Nome do Cliente Opcional */}
                <div className="space-y-1.5 mb-6 bg-white/10 p-3.5 rounded-2xl border border-white/10 w-full max-w-full overflow-hidden" style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                  <label className="text-[9px] font-black uppercase tracking-widest opacity-85 flex items-center gap-1.5 text-white">
                    <User size={10} /> Nome do Cliente (Opcional)
                  </label>
                  <input
                    id="client-name-input-safe"
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="words"
                    placeholder="Nome do Cliente (Opcional)"
                    value={customerName || ""}
                    onChange={(e) => {
                      const val = e.target.value ?? "";
                      setCustomerName(val);
                    }}
                    className="w-full bg-white/20 border-0 rounded-xl py-2 px-3 text-xs font-semibold text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-white/45 font-sans"
                    style={{
                      transform: 'none',
                      transition: 'none',
                      animation: 'none',
                      WebkitTransform: 'none',
                      WebkitTransition: 'none',
                      overflow: 'hidden',
                      width: '100%',
                      maxWidth: '100%'
                    }}
                  />
                </div>

                <div className="mb-8 w-full max-w-full overflow-hidden">
                  <label className="text-[11px] font-bold uppercase opacity-60 block">Total a Receber</label>
                  <div className="flex flex-wrap items-baseline gap-1.5 mt-1 w-full max-w-full overflow-hidden">
                    <span className="text-lg md:text-xl font-bold opacity-60 shrink-0">R$</span>
                    <span 
                      className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter break-all max-w-full inline-block"
                      style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                    >
                      {(typeof total === 'number' ? total : 0).toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="space-y-4 pt-8 border-t border-white/20 w-full max-w-full overflow-hidden">
                  <div className="flex flex-col gap-3 w-full max-w-full">
                    <span className="text-[10px] uppercase font-bold opacity-60">QUANTIDADES DE ITENS</span>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1 w-full max-w-full">
                      {items.map((item, index) => {
                        if (!item || !item.id) return null;
                        const itemTotal = typeof item.total === 'number' ? item.total : 0;
                        return (
                          <div key={item.id} className="flex flex-col text-[10px] border-b border-white/10 pb-2 last:border-0 font-sans gap-0.5 w-full max-w-full overflow-hidden">
                            <div className="flex items-center justify-between gap-2 max-w-full">
                              <span className="opacity-85 truncate font-semibold block max-w-full flex items-center gap-1.5 flex-wrap">
                                <span>{index + 1}. {item.name || "Produto"} — {item.quantity <= 1 ? "Quantidade" : "Quantidades"}: {item.quantity || 0}</span>
                                <span className="inline-flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => startEditItem(item)}
                                    title="Editar Produto"
                                    className="w-5 h-5 flex items-center justify-center rounded-md bg-white/10 hover:bg-white/20 text-white border-0 transition-colors cursor-pointer"
                                  >
                                    <Pencil size={9} />
                                  </button>
                                  <button
                                    onClick={() => setItemToDelete(item.id)}
                                    title="Excluir Produto"
                                    className="w-5 h-5 flex items-center justify-center rounded-md bg-white/10 hover:bg-rose-600 text-white border-0 transition-colors cursor-pointer"
                                  >
                                    <X size={9} />
                                  </button>
                                </span>
                              </span>
                            </div>
                            <span className="text-[9px] opacity-70 ml-1 block">{obterLabelMedida(item.weightPerUnit || 0, item.unit || "unit")}: {formatarMercadoria(item.weightPerUnit || 0, item.unit || "unit")}</span>
                            {item.comercializacao && (
                              <span className="text-[9px] text-emerald-100 font-semibold ml-1 block">Comercialização: {item.comercializacao}</span>
                            )}
                            <div className="flex flex-col ml-1 mt-1">
                              <span className="text-[8px] text-emerald-200/85 uppercase font-black tracking-wider">PREÇO DO PRODUTO</span>
                              <span className="text-emerald-300 font-bold text-xs" style={{ color: '#a7f3d0' }}>R$ {itemTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                        );
                      })}
                      {items.length === 0 && (
                        <span className="text-[10px] opacity-40 italic">Aguardando produtos...</span>
                      )}
                    </div>
                  </div>
                </div>

                {items.length > 0 && (
                  <div className="space-y-1.5 mt-6 bg-white/10 p-4 rounded-2xl border border-white/10 w-full max-w-full">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-85 flex items-center gap-1.5 text-white">
                      <Coins size={12} /> Pagamento da Compra
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full bg-emerald-700/60 border-0 rounded-xl py-2.5 px-3 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-white/40 transition-all font-sans cursor-pointer"
                    >
                      <option value="cartao_credito" className="text-slate-800">Cartão de Crédito</option>
                      <option value="cartao_debito" className="text-slate-800">Cartão de Débito</option>
                      <option value="cartao_credito_virtual" className="text-slate-800">Cartão de Crédito Virtual</option>
                      <option value="cartao_debito_virtual" className="text-slate-800">Cartão de Débito Virtual</option>
                      <option value="pix" className="text-slate-800">Pix</option>
                      <option value="dinheiro" className="text-slate-800">Dinheiro</option>
                    </select>
                  </div>
                )}

                {items.length > 0 && (
                  <button
                    onClick={finishSale}
                    className="w-full mt-4 py-3.5 bg-white hover:bg-emerald-50 text-emerald-700 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2 font-sans shrink-0 border-0"
                  >
                    <CheckCircle size={16} /> Finalizar Venda (Salvar)
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      ) : activeTab === 'products' ? (
        <div id="products-tab-panel" className="space-y-8 pb-12 animate-fade-in max-w-6xl mx-auto px-2">
          {/* Financial summaries */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Desembolso */}
            <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-slate-100 flex items-center gap-4">
              <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center font-bold text-lg shrink-0">
                R$
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Desembolsos</span>
                <span className="text-xl font-black text-slate-950">
                  R$ {products.reduce((acc, p) => acc + (p.costPrice * p.quantity), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Minhas Vendas */}
            <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-slate-100 flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-bold text-lg shrink-0">
                R$
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Minha Venda</span>
                <span className="text-xl font-black text-slate-950">
                  R$ {salesHistory.reduce((acc, s) => acc + (s && typeof s.total === 'number' ? s.total : 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Lucro */}
            <div className="bg-white rounded-[24px] p-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-slate-100 flex items-center gap-4">
              {(() => {
                const totalDes = products.reduce((acc, p) => acc + (p.costPrice * p.quantity), 0);
                const totalSaleVal = salesHistory.reduce((acc, s) => acc + (s && typeof s.total === 'number' ? s.total : 0), 0);
                const profitVal = totalSaleVal - totalDes;
                return (
                  <>
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg shrink-0",
                      profitVal >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                    )}>
                      R$
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Lucro</span>
                      <span className={cn("text-xl font-black", profitVal >= 0 ? "text-emerald-600" : "text-rose-500")}>
                        R$ {profitVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Core UI Form and List */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left side: Add/Edit Product form */}
            <div className="lg:col-span-4 bg-white rounded-[32px] p-6 md:p-8 border border-slate-100 shadow-[0_4px_12px_rgba(0,0,0,0.08)] space-y-6">
              <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
                <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                  <Package size={16} />
                </div>
                <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider">
                  {productFormId ? "Editar Produto" : "Novo Produto"}
                </h3>
              </div>

              {/* Inputs */}
              <div className="space-y-4">
                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">NOME DO PRODUTO</label>
                  <input
                    type="text"
                    placeholder="Ex: Batata Doce, Tomate..."
                    value={productFormName}
                    onChange={(e) => setProductFormName(e.target.value)}
                    className="w-full py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl font-sans font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white text-xs transition-colors"
                  />
                </div>

                {/* Quantidade em estoque */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">QUANTIDADE DO PRODUTO (VALOR DO PREÇO UNITÁRIO)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={productFormQuantity === 0 ? '' : productFormQuantity}
                    onChange={(e) => setProductFormQuantity(Number(e.target.value))}
                    className="w-full py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl font-sans font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white text-xs transition-colors"
                  />
                </div>

                {/* Preço de Custo */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">PREÇO UNITÁRIO (DESEMBOLSO) (R$)</label>
                  <div className="relative">
                     <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">R$</span>
                     <input
                       type="number"
                       step="0.01"
                       placeholder="0,00"
                       value={productFormCostPrice === 0 ? '' : productFormCostPrice}
                       onChange={(e) => setProductFormCostPrice(Number(e.target.value))}
                       className="w-full py-3 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl font-sans font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white text-xs transition-colors"
                     />
                  </div>
                </div>



              </div>

              {/* Pré-visualização com cálculo de desembolso no formulário */}
              <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4.5 space-y-2 text-[11px] font-sans text-slate-600 shadow-inner">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">Produto:</span>
                  <span className="font-bold text-slate-800">
                    {productFormName || "Produto sem nome"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">Quantidade adicionada:</span>
                  <span className="font-bold text-slate-800">
                    {productFormQuantity}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">Preço Unitário (Desembolso):</span>
                  <span className="font-bold text-slate-800">
                    R$ {productFormCostPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="h-px bg-slate-200/50 my-1.5" />
                <div className="flex items-center justify-between text-xs">
                  <strong className="font-black text-slate-700 uppercase tracking-wide">Cálculo de Desembolso:</strong>
                  <span className="font-black text-emerald-600 text-sm">
                    R$ {(productFormQuantity * productFormCostPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={handleSaveProduct}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-[0_4px_12px_rgba(0,0,0,0.08)] flex items-center justify-center gap-1.5"
                >
                  <CheckCircle size={14} /> Salvar Produto
                </button>
                {productFormId && (
                  <button
                    onClick={cancelEditProduct}
                    className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
                  >
                    Cancelar Edição
                  </button>
                )}
              </div>
            </div>

            {/* Right side: Stock list */}
            <div className="lg:col-span-8 bg-white rounded-[32px] p-6 md:p-8 border border-slate-100 shadow-[0_4px_12px_rgba(0,0,0,0.08)] space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                    <Layers size={16} />
                  </div>
                  <h3 className="text-sm font-black text-slate-850 uppercase tracking-wider">Produtos Cadastrados ({products.length})</h3>
                </div>
              </div>

              {products.length > 0 ? (
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                  {products.map((p) => {
                    const metrics = getProductMetrics(p);
                    const isAvailable = metrics.remainingContent > 0;

                    return (
                      <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-2xl bg-slate-50 border border-slate-100 hover:shadow-sm transition-all gap-4">
                        <div className="space-y-2 flex-grow">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="font-bold text-slate-800 text-sm">{p.name}</span>
                            
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => startEditProduct(p)}
                                className="w-6 h-6 text-slate-400 hover:text-emerald-500 rounded-md flex items-center justify-center transition-colors bg-transparent border-0 cursor-pointer"
                                title="Editar Produto"
                              >
                                <Pencil size={11} />
                              </button>
                              <button
                                onClick={() => setProductToDelete(p.id)}
                                className="w-6 h-6 text-slate-400 hover:text-red-500 rounded-md flex items-center justify-center transition-colors bg-transparent border-0 cursor-pointer"
                                title="Excluir Produto"
                              >
                                <X size={11} />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[10px] font-bold text-slate-500 uppercase">
                            <span>
                              {p.quantity <= 1 ? "Quantidade" : "Quantidades"}: <span className="text-slate-900 normal-case">{p.quantity}</span>
                            </span>
                            <span>
                              Desembolso: <span className="text-emerald-600 normal-case">R$ {(p.costPrice * p.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </span>
                            <span>
                              Data/Hora: <span className="text-slate-900 normal-case">{p.createdAt}</span>
                            </span>
                            <span className="sm:col-span-2">
                              Preço Unitário: <span className="text-slate-900 normal-case">R$ {p.costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <Package className="mx-auto mb-3 opacity-30" size={36} />
                  <p className="text-xs font-semibold uppercase tracking-wider">Nenhum produto cadastrado no estoque</p>
                  <p className="text-[10px] mt-1 text-slate-400 normal-case font-medium">Adicione seu primeiro produto usando o formulário ao lado para começar o controle!</p>
                </div>
              )}
            </div>
          </div>

          {/* Modal de Exclusão de Produto (Sim/Não) */}
          <AnimatePresence>
            {productToDelete && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent"
                onClick={() => setProductToDelete(null)}
              >
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white rounded-[40px] p-10 w-full max-w-sm shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-slate-100 pointer-events-auto text-center"
                >
                  <div className="flex flex-col items-center space-y-6">
                    <div className="text-red-500 mb-2">
                      <X size={48} />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-2xl font-black text-slate-900 tracking-tight">Excluir Produto?</h3>
                      <p className="text-sm text-slate-500 font-medium px-4">
                        Deseja realmente remover o produto <span className="text-slate-900 font-bold">"{products.find(p => p.id === productToDelete)?.name}"</span> do estoque?
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 w-full pt-4">
                      <button
                        onClick={() => confirmDeleteProduct(productToDelete)}
                        className="py-3 px-4 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-sm tracking-wider transition-colors border-0 shadow-none text-center flex items-center justify-center justify-self-center w-full"
                      >
                        Sim
                      </button>
                      <button
                        onClick={() => setProductToDelete(null)}
                        className="py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm tracking-wider transition-colors border-0 shadow-none text-center flex items-center justify-center justify-self-center w-full"
                      >
                        Não
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="space-y-6 max-w-4xl mx-auto pb-8">
          {/* Stats Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-bold text-lg">
                R$
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Faturamento Total</span>
                <span className="text-xl font-black text-slate-900">
                  R$ {salesHistory.reduce((acc, s) => acc + (s && typeof s.total === 'number' ? s.total : 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-bold text-lg">
                #
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  {salesHistory.length <= 1 ? 'Total de Venda' : 'Totais de Vendas'}
                </span>
                <span className="text-xl font-black text-slate-900">
                  {salesHistory.length} {salesHistory.length <= 1 ? 'venda salva' : 'vendas salvas'}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 flex flex-col justify-center gap-2 font-sans">
              {salesHistory.length > 0 ? (
                <>
                  <button
                    onClick={exportSalesText}
                    className="py-2.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all w-full text-center font-bold border-0 flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Download size={12} /> Exportar Vendas
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm("Deseja apagar todo o histórico de vendas permanentemente? Esta ação é irreversível.")) {
                        setSalesHistory([]);
                        localStorage.removeItem('feiralivre_sales_history');
                      }
                    }}
                    className="py-2.5 px-6 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all w-full text-center font-bold border-0"
                  >
                    Apagar Todo Histórico
                  </button>
                </>
              ) : (
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center">Sem faturamento recente</span>
              )}
            </div>
          </div>

          {/* Sales List */}
          {salesHistory.length > 0 ? (
            <div className="space-y-4">
              {salesHistory.filter(Boolean).map((sale, index) => {
                if (!sale || !sale.id) return null;
                const saleItems = Array.isArray(sale.items) ? sale.items : [];
                const saleTotal = typeof sale.total === 'number' ? sale.total : 0;
                const saleAmountReceived = typeof sale.amountReceived === 'number' ? sale.amountReceived : 0;
                const saleChange = typeof sale.change === 'number' ? sale.change : 0;
                const orderNumber = salesHistory.length - index;

                return (
                  <div key={sale.id} className="bg-white rounded-[28px] border border-slate-100 p-6 shadow-sm hover:shadow-md transition-all space-y-4 animate-fade-in">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-emerald-50 text-emerald-600 font-black rounded-full flex items-center justify-center text-xs shrink-0 border border-emerald-100">
                          {orderNumber}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                            Pedido nº {orderNumber} — {(!sale.customerName || sale.customerName === 'Cliente Avulso') 
                              ? (SHOP_TYPES.find(t => t.id === sale.shopType)?.label || 'Feira Livre')
                              : sale.customerName}
                          </h4>
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold block">{sale.date}</span>
                            {sale.paymentMethod && (
                              <span className="inline-flex items-center text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full mt-1 border border-slate-200/60">
                                {obterLabelPagamento(sale.paymentMethod)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="self-start sm:self-auto flex items-baseline gap-1 mt-1 sm:mt-0">
                        <span className="text-slate-400 text-xs font-bold">R$</span>
                        <span className="text-xl font-black text-emerald-600">
                          {saleTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {/* Products List */}
                    <div className="space-y-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-2">
                        {saleItems.length <= 1 ? "Produto Vendido" : "Produtos Vendidos"}:
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {saleItems.map((item: any, idx: number) => {
                          if (!item) return null;
                          const itemTotal = typeof item.total === 'number' ? item.total : 0;
                          const itemPrice = typeof item.price === 'number' ? item.price : 0;

                          // Encontrar produto correspondente no estoque para obter Produto Disponível e Tipo de Medida
                          const matchingProduct = products.find(
                            p => p && p.name && item.name && p.name.trim().toLowerCase() === item.name.trim().toLowerCase()
                          );

                          let restanteLabel = "";
                          let tipoMedidaLabel = "";

                          if (matchingProduct) {
                            const metrics = getProductMetrics(matchingProduct);
                            const remainingLabelMedida = obterLabelMedida(metrics.remainingContent, matchingProduct.unit);
                            const formattedRemainingVal = metrics.remainingContent.toLocaleString('pt-BR', matchingProduct.unit === 'gram' ? { maximumFractionDigits: 0 } : { maximumFractionDigits: 2 });
                            restanteLabel = `${formattedRemainingVal} ${remainingLabelMedida}`;

                            const labelMed = obterLabelMedida(matchingProduct.weightPerUnit, matchingProduct.unit);
                            const formattedWeight = matchingProduct.weightPerUnit.toLocaleString('pt-BR', matchingProduct.unit === 'gram' ? { maximumFractionDigits: 0 } : { maximumFractionDigits: 2 });
                            tipoMedidaLabel = `${formattedWeight} — ${labelMed}`;
                          } else {
                            // Se o produto não for encontrado, calcula-se com base nas informações do próprio item vendido
                            const itemUnit = item.unit || 'unit';
                            const itemWeightVal = item.weightPerUnit || 1;
                            const labelMed = obterLabelMedida(itemWeightVal, itemUnit);
                            const formattedWeight = itemWeightVal.toLocaleString('pt-BR', itemUnit === 'gram' ? { maximumFractionDigits: 0 } : { maximumFractionDigits: 2 });
                            tipoMedidaLabel = `${formattedWeight} — ${labelMed}`;
                            restanteLabel = "Venda Avulsa (Controle indisponível)";
                          }

                          return (
                            <div key={item.id || idx} className="text-xs bg-slate-50 rounded-xl p-4 border border-slate-100/60 flex flex-col gap-1.5 font-sans">
                              {/* Quantidade */}
                              <span className="text-[10px] text-slate-500 font-semibold block">
                                {item.quantity <= 1 ? "Quantidade" : "Quantidades"}: <span className="text-slate-900 font-bold">{item.quantity}</span>
                              </span>

                              {/* Produto */}
                              <span className="text-[10px] text-slate-500 font-semibold block">
                                {item.quantity <= 1 ? "Produto" : "Produtos"}: <span className="text-slate-900 font-bold">{item.name || 'Produto'}</span>
                              </span>

                              {/* Preço Unitário */}
                              <span className="text-[10px] text-slate-500 font-semibold block">
                                Preço unitário: <span className="text-slate-900 font-bold">R$ {itemPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </span>

                              {/* Total */}
                              <span className="text-[10px] text-slate-500 font-semibold block">
                                {item.quantity <= 1 ? "Total" : "Totais"}: <span className="text-emerald-600 font-extrabold">R$ {itemTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </span>

                              {/* Peso ou Medida */}
                              <span className="text-[10px] text-slate-500 font-semibold block">
                                {item.quantity <= 1 ? "Peso ou Medida" : "Pesos ou Medidas"}: <span className="text-slate-900 font-bold">{formatarMercadoria(item.weightPerUnit, item.unit || 'unit')}</span>
                              </span>

                              {/* Comercialização / Peso ou Medida */}
                              {item.comercializacao && (
                                <span className="text-[10px] text-slate-500 font-semibold block">
                                  Comercialização / Peso ou Medida: <span className="text-emerald-700 font-extrabold">{item.comercializacao}</span>
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Footer Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        {saleAmountReceived > 0 ? (
                          <span>Pago: R$ {saleAmountReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Troco: R$ {saleChange.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        ) : (
                          <span>Sem cálculo de troco</span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => shareReceipt(sale)}
                          className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 shadow-sm shadow-emerald-100 border-0"
                        >
                          <Share2 size={12} /> WhatsApp / Compartilhar
                        </button>
                        <button
                          onClick={() => deleteSaleFromHistory(sale.id)}
                          className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-red-500 rounded-xl transition-all bg-transparent border-0"
                          title="Excluir venda do histórico"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-[32px] p-12 text-center border border-slate-100 flex flex-col items-center justify-center gap-4 shadow-sm">
              <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center">
                <CheckCircle size={32} className="opacity-40" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-800">Sem faturamento no histórico</h3>
                <p className="text-sm text-slate-500 font-medium max-w-sm">
                  As vendas finalizadas serão salvas em dados de forma privada no banco de dados do seu celular. Comece agora registrando sua primeira venda!
                </p>
              </div>
            </div>
          )}
          
          {/* Informative Security Callout */}
          <div className="bg-blue-50 border border-blue-100 p-5 rounded-2xl flex gap-3 text-blue-700 text-xs text-left">
            <Info size={16} className="shrink-0 mt-0.5" />
            <div>
              <strong className="block mb-0.5 font-bold">100% Automático e Prático</strong>
              Fique totalmente ligado aos detalhes da Venda. Seus faturamentos, nomes de clientes e recibos sempre ficam salvos e datados. Tudo é armazenado diretamente no armazenamento privado do seu próprio aparelho celular ou tablet.
            </div>
          </div>

          {/* Modal de Exclusão de Venda do Histórico (Sim/Não) */}
          <AnimatePresence>
            {saleToDelete && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent"
                onClick={() => setSaleToDelete(null)}
              >
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white rounded-[40px] p-10 w-full max-w-sm shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-slate-100 pointer-events-auto text-center"
                >
                  <div className="flex flex-col items-center space-y-6">
                    <div className="text-red-500 mb-2">
                      <X size={48} />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-2xl font-black text-slate-900 tracking-tight">Excluir Venda?</h3>
                      <p className="text-sm text-slate-500 font-medium px-4">
                        Deseja realmente remover esta venda de <span className="text-slate-900 font-bold">"{salesHistory.find(s => s.id === saleToDelete)?.customerName || 'Cliente sem nome'}"</span> do histórico permanente?
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 w-full pt-4">
                      <button
                        onClick={confirmDeleteSale}
                        className="py-3 px-4 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-sm tracking-wider transition-colors border-0 shadow-none text-center flex items-center justify-center justify-self-center w-full"
                      >
                        Sim
                      </button>
                      <button
                        onClick={() => setSaleToDelete(null)}
                        className="py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm tracking-wider transition-colors border-0 shadow-none text-center flex items-center justify-center justify-self-center w-full"
                      >
                        Não
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>

    {/* Toasts Flutuantes */}
    <AnimatePresence>
      {showSuccessToast && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-700 border border-emerald-600 shadow-2xl px-6 py-4 rounded-2xl flex items-center gap-3 text-white font-extrabold text-xs uppercase tracking-wider"
        >
          <CheckCircle size={18} className="text-emerald-200" />
          <span>Venda salva com sucesso!</span>
        </motion.div>
      )}
    </AnimatePresence>

    <AnimatePresence>
      {showReceiptToast && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-slate-800 shadow-2xl px-6 py-4 rounded-2xl flex items-center gap-3 text-white font-extrabold text-xs uppercase tracking-wider"
        >
          <CheckCircle size={18} className="text-emerald-400" />
          <span>Recibo copiado para área de transferência!</span>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
  );
};

export default CalculatorScreen;
