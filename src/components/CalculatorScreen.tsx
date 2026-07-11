import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import { Html5Qrcode } from 'html5-qrcode';
import html2canvas from 'html2canvas';
import logo from '../logo.png';
import {
  ArrowLeft, Store, Tent, ShoppingBag, Truck,
  Banknote, Info, CheckCircle, Package, Scale, 
  ChevronRight, ChevronDown, Calculator, Hash, Layers, Weight,
  Plus, X, Pencil, Share2, Calendar, User, Search,
  CreditCard, QrCode, Coins, Copy, Trash2, RotateCcw, Archive,
  Tag, Camera, Barcode, Upload, Image, Receipt, Printer, Download,
  Check, Edit2, Eye, AlertTriangle, RefreshCw, Cpu, Tv
} from 'lucide-react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/errorHandler';
import type { AppConfig, UserProfile } from '../types';
import VisionAIModal from './VisionAIModal';

const colorCache = new Map<string, string>();

function oklchToRgb(oklchStr: string): string {
  if (colorCache.has(oklchStr)) {
    return colorCache.get(oklchStr)!;
  }
  
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'rgb(255, 255, 255)';
    ctx.fillStyle = oklchStr;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    const rgbStr = a === 255 
      ? `rgb(${r}, ${g}, ${b})` 
      : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
    colorCache.set(oklchStr, rgbStr);
    return rgbStr;
  } catch (e) {
    return 'rgb(255, 255, 255)';
  }
}

function replaceOklchInString(str: string): string {
  if (!str.includes('oklch') && !str.includes('oklab')) return str;
  let result = str;
  if (result.includes('oklch')) {
    result = result.replace(/oklch\([^)]+\)/g, (match) => {
      return oklchToRgb(match);
    });
  }
  if (result.includes('oklab')) {
    result = result.replace(/oklab\([^)]+\)/g, (match) => {
      return oklchToRgb(match);
    });
  }
  return result;
}

const SEEDED_PRODUCTS = [
  "Tomate", "Batata", "Cebola", "Cenoura", "Alface", 
  "Banana", "Manga", "Laranja", "Maçã", "Chuchu", 
  "Abobrinha", "Pimentão", "Limão", "Melancia", "Abacaxi",
  "Couve", "Brócolis", "Cheiro Verde", "Mamão", "Uva",
  "Ovo", "Mandioca", "Inhame"
];

const SEGM_OPTIONS = [
  "Alimentação Pronta e Lanches",
  "Antiguidades, Cultura e Lazer.",
  "Aquarismo e Pequenos Animais",
  "Armarinhos, Tecidos e Artesanato.",
  "Brinquedo Infantil",
  "Carnes, Peixes e Embutidos.",
  "Conservas, Licores.",
  "Combustíveis e Acendimento Tradicional",
  "Cordoaria e Amarração Profissional",
  "Cosméticos, Perfumaria e Bem-Estar.",
  "Economia Circular e Sucata",
  "Eletrônicos, Mídias, Objetos Eletrônicos.",
  "Embalagens e Descartáveis",
  "Entretenimento de Rua e Arte Urbana",
  "Frutas Frescas",
  "Laticínios e Ovos",
  "Legumes, Verduras, Ervas e Raízes.",
  "Mercearia, Grãos e Temperos.",
  "Misticismo, Religiosidade e Artigos de Fé.",
  "Mobilidade Urbana",
  "Papelaria, Escritório, Escolar.",
  "Plantas e Jardinagem",
  "Produtos Artesanais",
  "Produtos Químicos de Limpeza",
  "Produtos Sazonais e Festivos",
  "Produtos para Pets e Agropecuária",
  "Saúde Popular e Ortopedia Básica",
  "Selaria e Artigos de Couro",
  "Serviços Rápidos e Logística de Apoio",
  "Utensílios de Cozinha",
  "Utilidades para Construção e Pequenos Reparos",
  "Vestuário, Acessórios e Conveniência."
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
  const [showCalcProductDropdown, setShowCalcProductDropdown] = useState<boolean>(false);
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
    segmento?: string;
    tamanho?: string;
  }>>([]);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [saleToDelete, setSaleToDelete] = useState<string | null>(null);
  const [comercialUnit, setComercialUnit] = useState<string>('');
  const [comercialText, setComercialText] = useState<string>('');

  // Atividade Comercial Segmento states for Current Item Form
  const [segmento, setSegmento] = useState<string>('');
  const [segmentoSearch, setSegmentoSearch] = useState<string>('');
  const [showSegmentoDropdown, setShowSegmentoDropdown] = useState<boolean>(false);
  const [tamanho, setTamanho] = useState<string>('');

  // Atividade Comercial Segmento states for Registered Product Form
  const [productFormSegmento, setProductFormSegmento] = useState<string>('');
  const [productFormSegmentoSearch, setProductFormSegmentoSearch] = useState<string>('');
  const [showProductFormSegmentoDropdown, setShowProductFormSegmentoDropdown] = useState<boolean>(false);
  const [productFormTamanho, setProductFormTamanho] = useState<string>('');
  const [productFormEmpresaFornecedora, setProductFormEmpresaFornecedora] = useState<string>('');

  // Filtro de Atividade Comercial na listagem de produtos
  const [productsFilterSegmento, setProductsFilterSegmento] = useState<string>('');

  // Referência para vídeo da câmera
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Estados adicionados para Histórico, Busca Rápida e Editar
  const [activeTab, setActiveTab] = useState<'calculator' | 'products' | 'history' | 'quantity' | 'etiqueta' | 'notafiscal' | 'visualizar_cupom' | 'armazenagem'>('calculator');
  
  // Estados para Nota Fiscal
  const [nfEmitenteTipo, setNfEmitenteTipo] = useState<'feirante_cpf' | 'empresa_cnpj' | 'feirante_cnpj' | 'comerciante_cpf'>(() => {
    return (localStorage.getItem('nfEmitenteTipo') as any) || 'feirante_cpf';
  });
  const [nfEmitenteNome, setNfEmitenteNome] = useState(() => localStorage.getItem('nfEmitenteNome') || '');
  const [nfEmitenteDoc, setNfEmitenteDoc] = useState(() => localStorage.getItem('nfEmitenteDoc') || '');
  const [nfEmitenteEndereco, setNfEmitenteEndereco] = useState(() => localStorage.getItem('nfEmitenteEndereco') || '');
  const [nfEmitenteNomeVendedor, setNfEmitenteNomeVendedor] = useState(() => localStorage.getItem('nfEmitenteNomeVendedor') || '');
  const [nfEmitentePapel, setNfEmitentePapel] = useState<'vendedor' | 'feirante' | 'comerciante'>(() => {
    return (localStorage.getItem('nfEmitentePapel') as any) || 'vendedor';
  });
  const [nfEmitenteEnderecoTipo, setNfEmitenteEnderecoTipo] = useState<'comercial' | 'box' | 'barraca'>(() => {
    return (localStorage.getItem('nfEmitenteEnderecoTipo') as any) || 'comercial';
  });
  const [nfEmitenteDocTipo, setNfEmitenteDocTipo] = useState<'CPF' | 'RG'>(() => {
    return (localStorage.getItem('nfEmitenteDocTipo') as any) || 'CPF';
  });
  const [nfEmitenteDocNumero, setNfEmitenteDocNumero] = useState(() => localStorage.getItem('nfEmitenteDocNumero') || '');
  const [isNfEmitenteEditing, setIsNfEmitenteEditing] = useState<boolean>(false);

  const [nfDestinatarioTipo, setNfDestinatarioTipo] = useState<'consumidor_cpf' | 'empresa_cnpj' | 'entrega_cliente' | 'entrega_empresa'>('consumidor_cpf');
  const [nfDestinatarioNome, setNfDestinatarioNome] = useState('');
  const [nfDestinatarioDoc, setNfDestinatarioDoc] = useState('');
  const [nfDestinatarioEndereco, setNfDestinatarioEndereco] = useState('');

  // Itens selecionados para compor a nota fiscal
  const [nfItems, setNfItems] = useState<Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
    total?: number;
    barcode?: string;
    comercializacao?: string;
    tamanho?: string;
    weightPerUnit?: number;
    unit?: string;
  }>>([]);

  const [nfSelectedProdId, setNfSelectedProdId] = useState<string>('');
  const [nfManualQty, setNfManualQty] = useState<number>(1);
  const [nfManualPrice, setNfManualPrice] = useState<number>(0);
  const [isPrintingBluetooth, setIsPrintingBluetooth] = useState<boolean>(false);
  const [nfSelectedOrderId, setNfSelectedOrderId] = useState<string>('');
  const [nfPaymentMethod, setNfPaymentMethod] = useState<string>('dinheiro');
  const [nfAmountReceived, setNfAmountReceived] = useState<number>(0);
  const [nfChange, setNfChange] = useState<number>(0);

  // Sincronizar dados do Emitente com localStorage
  useEffect(() => {
    localStorage.setItem('nfEmitenteTipo', nfEmitenteTipo);
    localStorage.setItem('nfEmitenteNome', nfEmitenteNome);
    localStorage.setItem('nfEmitenteDoc', nfEmitenteDoc);
    localStorage.setItem('nfEmitenteEndereco', nfEmitenteEndereco);
    localStorage.setItem('nfEmitenteNomeVendedor', nfEmitenteNomeVendedor);
    localStorage.setItem('nfEmitentePapel', nfEmitentePapel);
    localStorage.setItem('nfEmitenteEnderecoTipo', nfEmitenteEnderecoTipo);
    localStorage.setItem('nfEmitenteDocTipo', nfEmitenteDocTipo);
    localStorage.setItem('nfEmitenteDocNumero', nfEmitenteDocNumero);
  }, [nfEmitenteTipo, nfEmitenteNome, nfEmitenteDoc, nfEmitenteEndereco, nfEmitenteNomeVendedor, nfEmitentePapel, nfEmitenteEnderecoTipo, nfEmitenteDocTipo, nfEmitenteDocNumero]);
  const [customerName, setCustomerName] = useState('');
  const [customerDoc, setCustomerDoc] = useState('');
  const [labelPreviewProduct, setLabelPreviewProduct] = useState<any | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>('dinheiro');
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  
  // Estados para consulta de nota fiscal (Câmera & Código de Acesso)
  const [nfSearchInput, setNfSearchInput] = useState<string>('');
  const [isScanningNfCamera, setIsScanningNfCamera] = useState<boolean>(false);
  const [nfSearchResultMessage, setNfSearchResultMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isCapturingWidget, setIsCapturingWidget] = useState<boolean>(false);
  const [isSharingWidget, setIsSharingWidget] = useState<boolean>(false);
  const [isSavingWidget, setIsSavingWidget] = useState<boolean>(false);
  const [recentlyDeletedSales, setRecentlyDeletedSales] = useState<any[]>([]);
  const [isDeletedManagerOpen, setIsDeletedManagerOpen] = useState<boolean>(false);
  const [selectedCurrentSales, setSelectedCurrentSales] = useState<string[]>([]);
  const [selectedDeletedSales, setSelectedDeletedSales] = useState<string[]>([]);
  const [managerActiveTab, setManagerActiveTab] = useState<'current' | 'deleted'>('current');
  const [historySearchMode, setHistorySearchMode] = useState<'all' | 'date' | 'year' | 'name' | 'category'>('all');
  const [historySearchText, setHistorySearchText] = useState<string>('');
  const [historySearchDate, setHistorySearchDate] = useState<string>('');

  // Seta a primeira data disponível ao abrir o gerenciador
  useEffect(() => {
    if (isDeletedManagerOpen) {
      const allSales = [...salesHistory, ...recentlyDeletedSales].filter(Boolean);
      const allDatesISO = allSales
        .map(s => {
          if (!s || !s.date) return '';
          const datePart = s.date.split(/[ ,]+/)[0];
          const parts = datePart.split('/');
          if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];
            return `${year}-${month}-${day}`;
          }
          return '';
        })
        .filter(Boolean);
      
      if (allDatesISO.length > 0) {
        // Ordena cronologicamente para pegar a primeira data disponível
        allDatesISO.sort();
        setHistorySearchDate(allDatesISO[0]);
      } else {
        setHistorySearchDate('');
      }
    }
  }, [isDeletedManagerOpen, salesHistory, recentlyDeletedSales]);

  const [recentProductNames, setRecentProductNames] = useState<string[]>([]);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showReceiptToast, setShowReceiptToast] = useState(false);

  // Estados para Edição de Estoque/Quantidade na aba de Quantidade
  const [stockEditProductId, setStockEditProductId] = useState<string | null>(null);
  const [stockEditName, setStockEditName] = useState<string>('');
  const [stockEditQuantity, setStockEditQuantity] = useState<number>(0);
  const [stockEditUnit, setStockEditUnit] = useState<'kg' | 'gram' | 'box' | 'bag' | 'unit'>('unit');

  // Estados para Edição de Etiqueta (nova página Etiqueta)
  const [labelEditProductId, setLabelEditProductId] = useState<string | null>(null);
  const [labelEditEtiquetaManual, setLabelEditEtiquetaManual] = useState<string>('');
  const [labelEditLoteManual, setLabelEditLoteManual] = useState<string>('');
  const [labelEditLeitorEtiqueta, setLabelEditLeitorEtiqueta] = useState<string>('');
  const [labelEditFotoLote, setLabelEditFotoLote] = useState<string>('');
  const [labelEditValidadeData, setLabelEditValidadeData] = useState<string>('');
  const [labelEditValidadeFoto, setLabelEditValidadeFoto] = useState<string>('');
  const [labelEditCodigoBarras, setLabelEditCodigoBarras] = useState<string>('');
  const [etiquetaSearch, setEtiquetaSearch] = useState<string>('');
  const [etiquetaFilterCategory, setEtiquetaFilterCategory] = useState<string>('');

  // Câmera e Scanner Simulado
  const [isScanningBarcode, setIsScanningBarcode] = useState<boolean>(false);
  const [scanningTargetField, setScanningTargetField] = useState<'codigoBarras' | 'leitorEtiqueta' | null>(null);
  const [isTakingPhoto, setIsTakingPhoto] = useState<'fotoLote' | 'validadeFoto' | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [stockEditCategory, setStockEditCategory] = useState<string>('');
  const [stockEditSalesMerchandiseQty, setStockEditSalesMerchandiseQty] = useState<number>(0);
  const [stockEditWeightPerUnit, setStockEditWeightPerUnit] = useState<number>(0);
  const [stockFormSegmentoSearch, setStockFormSegmentoSearch] = useState<string>('');
  const [showStockFormSegmentoDropdown, setShowStockFormSegmentoDropdown] = useState<boolean>(false);
  const [quantityFilterCategory, setQuantityFilterCategory] = useState<string>('');
  const [quantitySearch, setQuantitySearch] = useState<string>('');

  // Estados para Gestão de Produtos em Estoque
  const [products, setProducts] = useState<Array<{
    id: string;
    name: string;
    quantity: number;
    unit: 'kg' | 'gram' | 'box' | 'bag' | 'unit';
    weightPerUnit: number;
    costPrice: number;
    salePrice?: number;
    createdAt?: string;
    segmento?: string;
    salesMerchandiseQty?: number;
    empresaFornecedora?: string;
  }>>([]);
  const [productFormId, setProductFormId] = useState<string | null>(null);
  const [productFormName, setProductFormName] = useState<string>('');
  const [productFormQuantity, setProductFormQuantity] = useState<number>(0);
  const [productFormUnit, setProductFormUnit] = useState<'kg' | 'gram' | 'box' | 'bag' | 'unit'>('unit');
  const [productFormWeightPerUnit, setProductFormWeightPerUnit] = useState<number>(0);
  const [productFormCostPrice, setProductFormCostPrice] = useState<number>(0);
  const [productFormSalePrice, setProductFormSalePrice] = useState<number>(0);
  const [productFormSalesMerchandiseQty, setProductFormSalesMerchandiseQty] = useState<number>(0);

  // === ESTADOS PARA GESTÃO DE ARMAZENAGEM E LEITOR INTELIGENTE ===
  const [productsSmartMetadata, setProductsSmartMetadata] = useState<Record<string, {
    id?: string;
    productName?: string;
    marca?: string;
    categoria?: string;
    fotoPrincipal?: string;
    fotosExtras?: string[];
    codigoGS1?: string;
    codigoInterno?: string;
    peso?: number;
    validade?: string;
    lote?: string;
    fornecedor?: string;
    origem?: string;
    situacao?: 'Aprovado' | 'Em Análise' | 'Quarentena' | 'Descartado';
    observacoes?: string;
    createdAt?: string;
  }>>({});

  const [selectedTraceProductId, setSelectedTraceProductId] = useState<string>('');
  
  // Métodos de Leitura e Balança
  const [activeReaderType, setActiveReaderType] = useState<'ocr' | 'balanca' | 'etiqueta' | 'foto' | null>(null);
  const [isReaderActive, setIsReaderActive] = useState<boolean>(false);
  const [scaleSourceMethod, setScaleSourceMethod] = useState<'ocr' | 'bluetooth' | 'usb' | 'serial' | 'photo' | 'manual'>('ocr');
  const [capturedWeightValue, setCapturedWeightValue] = useState<number>(0);
  const [isSimulatingRead, setIsSimulatingRead] = useState<boolean>(false);
  const [scannerFeedType, setScannerFeedType] = useState<'camera' | 'upload'>('camera');
  const [showVisionAIModal, setShowVisionAIModal] = useState<boolean>(false);
  
  // Filtros da Central de Rastreabilidade
  const [traceabilityFilterSearch, setTraceabilityFilterSearch] = useState<string>('');
  const [traceabilityFilterStatus, setTraceabilityFilterStatus] = useState<string>('');
  const [traceabilityFilterCategory, setTraceabilityFilterCategory] = useState<string>('');

  // Formulário da Ficha de Cadastro e Rastreabilidade Completa
  const [traceFormMarca, setTraceFormMarca] = useState<string>('');
  const [traceFormCategoria, setTraceFormCategoria] = useState<string>('');
  const [traceFormFotoPrincipal, setTraceFormFotoPrincipal] = useState<string>('');
  const [traceFormFotosExtras, setTraceFormFotosExtras] = useState<string[]>([]);
  const [traceFormCodigoGS1, setTraceFormCodigoGS1] = useState<string>('');
  const [traceFormCodigoInterno, setTraceFormCodigoInterno] = useState<string>('');
  const [traceFormPeso, setTraceFormPeso] = useState<number>(0);
  const [traceFormValidade, setTraceFormValidade] = useState<string>('');
  const [traceFormLote, setTraceFormLote] = useState<string>('');
  const [traceFormFornecedor, setTraceFormFornecedor] = useState<string>('');
  const [traceFormOrigem, setTraceFormOrigem] = useState<string>('');
  const [traceFormSituacao, setTraceFormSituacao] = useState<'Aprovado' | 'Em Análise' | 'Quarentena' | 'Descartado'>('Aprovado');
  const [traceFormObservacoes, setTraceFormObservacoes] = useState<string>('');

  // === FUNÇÕES AUXILIARES DA CENTRAL DE RASTREABILIDADE ===
  const selectProductForTraceability = (pId: string) => {
    setSelectedTraceProductId(pId);
    const meta = productsSmartMetadata[pId] || {};
    const product = products.find(p => p.id === pId);
    
    setTraceFormMarca(meta.marca || '');
    setTraceFormCategoria(meta.categoria || product?.segmento || 'Frutas Frescas');
    setTraceFormFotoPrincipal(meta.fotoPrincipal || '');
    setTraceFormFotosExtras(meta.fotosExtras || []);
    setTraceFormCodigoGS1(meta.codigoGS1 || '');
    setTraceFormCodigoInterno(meta.codigoInterno || `SKU-${pId.substring(0, 5).toUpperCase()}`);
    setTraceFormPeso(meta.peso || product?.weightPerUnit || 0);
    setTraceFormValidade(meta.validade || '');
    setTraceFormLote(meta.lote || '');
    setTraceFormFornecedor(meta.fornecedor || product?.empresaFornecedora || '');
    setTraceFormOrigem(meta.origem || 'Produtor Local');
    setTraceFormSituacao(meta.situacao || 'Aprovado');
    setTraceFormObservacoes(meta.observacoes || '');
  };

  const handleSaveTraceability = (prodId: string) => {
    if (!prodId) return;
    const product = products.find(p => p.id === prodId);
    const updatedMetadata = {
      ...productsSmartMetadata,
      [prodId]: {
        id: prodId,
        productName: product?.name || 'Produto',
        marca: traceFormMarca,
        categoria: traceFormCategoria,
        fotoPrincipal: traceFormFotoPrincipal,
        fotosExtras: traceFormFotosExtras,
        codigoGS1: traceFormCodigoGS1,
        codigoInterno: traceFormCodigoInterno,
        peso: Number(traceFormPeso) || 0,
        validade: traceFormValidade,
        lote: traceFormLote,
        fornecedor: traceFormFornecedor,
        origem: traceFormOrigem,
        situacao: traceFormSituacao,
        observacoes: traceFormObservacoes,
        createdAt: productsSmartMetadata[prodId]?.createdAt || new Date().toISOString()
      }
    };
    setProductsSmartMetadata(updatedMetadata);
    localStorage.setItem('feiralivre_products_smart_metadata', JSON.stringify(updatedMetadata));
    
    // Sincronizar o peso e a categoria com a lista principal de produtos
    const updatedProducts = products.map(p => {
      if (p.id === prodId) {
        return {
          ...p,
          weightPerUnit: Number(traceFormPeso) || 0,
          segmento: traceFormCategoria
        };
      }
      return p;
    });
    setProducts(updatedProducts);
    localStorage.setItem('feiralivre_products', JSON.stringify(updatedProducts));

    // Exibir Toast de Sucesso
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  // Carregar histórico e nomes de produtos recentes e estoque do localStorage na inicialização
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('feiralivre_sales_history');
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory);
        setSalesHistory(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
      }

      const savedDeleted = localStorage.getItem('feiralivre_recently_deleted_sales');
      if (savedDeleted) {
        const parsed = JSON.parse(savedDeleted);
        setRecentlyDeletedSales(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
      }
      
      const savedRecent = localStorage.getItem('feiralivre_recent_products');
      if (savedRecent) {
        const parsed = JSON.parse(savedRecent);
        setRecentProductNames(Array.isArray(parsed) ? parsed.filter(Boolean) : SEEDED_PRODUCTS);
      } else {
        setRecentProductNames(SEEDED_PRODUCTS);
      }

      const savedProducts = localStorage.getItem('feiralivre_products');
      let currentProducts: any[] = [];
      if (savedProducts) {
        const parsed = JSON.parse(savedProducts);
        currentProducts = Array.isArray(parsed) ? parsed.filter(p => p && p.name && p.id !== '1' && p.id !== '2' && p.id !== '3' && p.id !== '4') : [];
      } else {
        // Inicializar com alguns produtos demo incríveis para a Central de Rastreabilidade & Leitor
        currentProducts = [
          {
            id: 'demo-prod-1',
            name: 'Tomate Italiano Selecionado',
            quantity: 120,
            unit: 'kg',
            weightPerUnit: 1.0,
            costPrice: 4.50,
            salePrice: 7.90,
            createdAt: new Date().toISOString()
          },
          {
            id: 'demo-prod-2',
            name: 'Melancia Graúda Híbrida',
            quantity: 25,
            unit: 'unit',
            weightPerUnit: 8.45,
            costPrice: 12.00,
            salePrice: 22.00,
            createdAt: new Date().toISOString()
          },
          {
            id: 'demo-prod-3',
            name: 'Queijo Minas Frescal Artesanal',
            quantity: 45,
            unit: 'unit',
            weightPerUnit: 0.50,
            costPrice: 14.00,
            salePrice: 24.50,
            createdAt: new Date().toISOString()
          }
        ];
        localStorage.setItem('feiralivre_products', JSON.stringify(currentProducts));
      }
      setProducts(currentProducts);

      // Carregar Metadados de Rastreabilidade Inteligente
      const savedMetadata = localStorage.getItem('feiralivre_products_smart_metadata');
      if (savedMetadata) {
        setProductsSmartMetadata(JSON.parse(savedMetadata));
      } else {
        // Metadados iniciais lindos para os produtos demo
        const initialMetadata: Record<string, any> = {
          'demo-prod-1': {
            id: 'demo-prod-1',
            productName: 'Tomate Italiano Selecionado',
            marca: 'Sabor do Campo',
            categoria: 'Legumes, Verduras, Ervas e Raízes.',
            fotoPrincipal: 'https://images.unsplash.com/photo-1595855759920-86582396756a?auto=format&fit=crop&w=300&q=80',
            fotosExtras: [],
            codigoGS1: '7891020304050',
            codigoInterno: 'TOM-ITA-01',
            peso: 1.250,
            validade: '2026-07-25',
            lote: 'L-TOM-0726A',
            fornecedor: 'Fazenda Sol Nascente Ltda',
            origem: 'Produtor Local - Mogi das Cruzes / SP',
            situacao: 'Aprovado',
            observacoes: 'Tomates tipo exportação com classificação AAA. Conservar em local fresco e arejado.',
            createdAt: new Date().toISOString()
          },
          'demo-prod-2': {
            id: 'demo-prod-2',
            productName: 'Melancia Graúda Híbrida',
            marca: 'Frutas Nobres',
            categoria: 'Frutas Frescas',
            fotoPrincipal: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&w=300&q=80',
            fotosExtras: [],
            codigoGS1: '7892030405060',
            codigoInterno: 'MEL-HYB-02',
            peso: 8.450,
            validade: '2026-08-05',
            lote: 'L-MEL-08B',
            fornecedor: 'Hortícola Vale Verde',
            origem: 'Distribuidor Central - Pavilhão M-3 CEAGESP',
            situacao: 'Em Análise',
            observacoes: 'Melancias graúdas de polpa firme e doce. Transportadas e armazenadas em paletes secos e suspensos.',
            createdAt: new Date().toISOString()
          },
          'demo-prod-3': {
            id: 'demo-prod-3',
            productName: 'Queijo Minas Frescal Artesanal',
            marca: 'Serra da Canastra',
            categoria: 'Laticínios e Ovos',
            fotoPrincipal: 'https://images.unsplash.com/photo-1528750901443-e9c17796aa4a?auto=format&fit=crop&w=300&q=80',
            fotosExtras: [],
            codigoGS1: '7893040506070',
            codigoInterno: 'QJO-MIN-03',
            peso: 0.500,
            validade: '2026-07-18',
            lote: 'L-QJO-0718',
            fornecedor: 'Laticínios Santo Antônio',
            origem: 'MG - São Roque de Minas (Artesanal)',
            situacao: 'Quarentena',
            observacoes: 'Queijo artesanal produzido com leite cru. Manter estritamente refrigerado entre 2°C e 8°C para conservação ideal.',
            createdAt: new Date().toISOString()
          }
        };
        setProductsSmartMetadata(initialMetadata);
        localStorage.setItem('feiralivre_products_smart_metadata', JSON.stringify(initialMetadata));
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
    // Para kg, se o usuário vende por peso, multiplicamos o preço pelo peso total (peso por embalagem * quantidade de embalagens)
    if (unit === 'kg') {
      return basePrice * w * qty;
    }
    // Para caixas (box), sacos (bag) ou unidades (unit), o preço de venda é o preço unitário daquele volume.
    // O total é simplesmente Preço * Quantidade.
    return basePrice * qty;
  };

  useEffect(() => {
    console.log("[STEP 3] items após setItems:", items);
  }, [items]);

  useEffect(() => {
    console.log("[STEP 5] salesHistory após salvar:", salesHistory);
  }, [salesHistory]);

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

  const calcularPesoMedidaTotal = (itemsList: any[]) => {
    const totals: Record<string, number> = {};
    itemsList.forEach(item => {
      const unit = item.unit || 'unit';
      const weight = item.weightPerUnit || 0;
      const totalWeight = weight;
      if (totalWeight > 0) {
        totals[unit] = (totals[unit] || 0) + totalWeight;
      }
    });

    const formattedParts = Object.entries(totals).map(([unit, val]) => {
      return formatarMercadoria(val, unit);
    });

    return formattedParts.length > 0 ? formattedParts.join(' + ') : 'Nenhum peso/medida';
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

  const obterCodigoAcessoApp = (sale: any) => {
    if (!sale) return 'FL-2026-0000-0000';
    if (sale.appAccessCode) return sale.appAccessCode;
    const num = String(sale.orderNumber || 1).padStart(4, '0');
    const idHash = sale.id ? sale.id.substring(0, 4).toUpperCase() : 'A1B2';
    return `FL-2026-${num}-${idHash}`;
  };

  const obterQuantidadeTotalComercializada = (item: any) => {
    const qty = Number(item.quantity) || 0;
    const w = Number(item.weightPerUnit) || 0;
    const u = item.unit || 'unit';
    
    if (u === 'unit' || !w) {
      const label = qty === 1 ? 'unidade' : 'unidades';
      return `${qty} ${label}`;
    }
    
    const totalW = qty * w;
    const formattedUnit = formatUnitLabel(totalW, u);
    return `${totalW} ${formattedUnit}`;
  };

  const captureWidgetAsBlob = async (): Promise<Blob | null> => {
    const element = document.getElementById("thermal-receipt-58mm");
    if (!element) {
      alert("Erro: O visualizador do cupom não foi encontrado na tela.");
      return null;
    }

    const originalGetComputedStyle = window.getComputedStyle;

    // Override getComputedStyle to strip oklch colors before html2canvas reads them
    window.getComputedStyle = function (elt, pseudoElt) {
      const style = originalGetComputedStyle(elt, pseudoElt);
      return new Proxy(style, {
        get(target, prop, receiver) {
          if (prop === 'getPropertyValue') {
            return function (propertyName: string) {
              const value = target.getPropertyValue(propertyName);
              if (typeof value === 'string' && (value.includes('oklch') || value.includes('oklab'))) {
                return replaceOklchInString(value);
              }
              return value;
            };
          }
          const value = Reflect.get(target, prop);
          if (typeof value === 'string' && (value.includes('oklch') || value.includes('oklab'))) {
            return replaceOklchInString(value);
          }
          if (typeof value === 'function') {
            return value.bind(target);
          }
          return value;
        }
      });
    };

    try {
      // Create high-fidelity screenshot using html2canvas
      const canvas = await html2canvas(element, {
        scale: 2, // sharp resolution
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false
      });
      
      return new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob);
        }, "image/png");
      });
    } catch (error) {
      console.error("Erro ao capturar cupom:", error);
      alert("Erro ao tirar screenshot do cupom.");
      return null;
    } finally {
      // Restore original getComputedStyle
      window.getComputedStyle = originalGetComputedStyle;
    }
  };

  const salvarCupomWidget = async () => {
    setIsSavingWidget(true);
    const blob = await captureWidgetAsBlob();
    setIsSavingWidget(false);
    if (!blob) return;

    try {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Cupom_Venda_${Date.now()}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao salvar cupom:", error);
      alert("Não foi possível salvar o cupom.");
    }
  };

  const compartilharCupomWidget = async () => {
    setIsSharingWidget(true);
    const blob = await captureWidgetAsBlob();
    setIsSharingWidget(false);
    if (!blob) return;

    try {
      const filename = `Cupom_Venda_${Date.now()}.png`;
      const file = new File([blob], filename, { type: "image/png" });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Cupom de Venda - Feira Livre",
          text: "Olá! Segue a imagem do cupom de venda gerado diretamente do aplicativo."
        });
      } else {
        // Fallback
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        alert("O compartilhamento nativo de arquivos não é suportado pelo seu navegador/dispositivo. A imagem do cupom foi baixada automaticamente.");
      }
    } catch (error: any) {
      console.error("Erro ao compartilhar cupom:", error);
      // Ignorar erro se o compartilhamento foi cancelado pelo usuário
      const isCanceled = error?.name === 'AbortError' || 
                         error?.message?.toLowerCase().includes('cancel') || 
                         error?.message?.toLowerCase().includes('abort');
      if (!isCanceled) {
        alert("Não foi possível compartilhar o cupom.");
      }
    }
  };

  const imprimirCupomBluetooth = async () => {
    setIsPrintingBluetooth(true);
    
    // Play sound simulation
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch (e) {}

    const element = document.getElementById("thermal-receipt-58mm");
    if (!element) {
      alert("Erro: O visualizador do cupom não foi encontrado na tela.");
      setIsPrintingBluetooth(false);
      return;
    }

    try {
      // Create temporary print container
      const printContainer = document.createElement('div');
      printContainer.className = 'print-only-container';
      printContainer.innerHTML = element.innerHTML;
      document.body.appendChild(printContainer);

      // Add print mode active class to the body
      document.body.classList.add('print-mode-active');

      // Trigger print dialog directly from window
      setTimeout(() => {
        window.print();

        // Cleanup
        setTimeout(() => {
          document.body.classList.remove('print-mode-active');
          if (document.body.contains(printContainer)) {
            document.body.removeChild(printContainer);
          }
        }, 1000);
      }, 150);
    } catch (error) {
      console.error("Erro ao imprimir cupom:", error);
      alert("Não foi possível abrir a janela de impressão nativa.");
    } finally {
      setIsPrintingBluetooth(false);
    }
  };

  const calcularEstoque = (
    q0: number,
    m: number,
    totalSold: number
  ) => {
    if (m <= 0) {
      const rem = Math.max(0, q0 - totalSold);
      return {
        remainingQty: rem,
        remainingStockItem: rem,
        soldQtyUnit: totalSold,
        soldSalesMerchandise: 0
      };
    }

    // Painel "Vendido"
    // Toda vez que a quantidade vendida de mercadorias atinge o lote de 'm',
    // contamos como 1 quantidade/unidade principal vendida.
    const soldQtyUnit = Math.floor(totalSold / m);
    const soldSalesMerchandise = totalSold;

    // Estoque
    const remainingQty = Math.max(0, q0 - soldQtyUnit);
    
    // Mercadoria de venda restante no pacote/lote atual.
    // Se a venda for múltiplo exato de m, o lote do pacote atual terminou de vender,
    // mas se ainda restam pacotes no estoque principal (remainingQty > 0), o estoque
    // de mercadoria se renova para o valor cheio de 'm'.
    let remainingStockItem = 0;
    if (remainingQty > 0) {
      if (totalSold % m === 0) {
        remainingStockItem = m;
      } else {
        remainingStockItem = Math.max(0, m - (totalSold % m));
      }
    }

    return {
      remainingQty,
      remainingStockItem,
      soldQtyUnit,
      soldSalesMerchandise
    };
  };

  const obterPesoUnidadeConvertido = (itemWeight: number, itemUnit: string, productUnit: string) => {
    const itemUnitLower = (itemUnit || '').toLowerCase();
    const productUnitLower = (productUnit || '').toLowerCase();
    if (itemUnitLower === productUnitLower || productUnitLower === 'unit' || !productUnitLower || !itemUnitLower) {
      return itemWeight;
    }
    if ((productUnitLower === 'gram' || productUnitLower === 'grama' || productUnitLower === 'gramas') && 
        (itemUnitLower === 'kg' || itemUnitLower === 'quilo' || itemUnitLower === 'quilos')) {
      return itemWeight * 1000;
    }
    if ((productUnitLower === 'kg' || productUnitLower === 'quilo' || productUnitLower === 'quilos') && 
        (itemUnitLower === 'gram' || itemUnitLower === 'grama' || itemUnitLower === 'gramas')) {
      return itemWeight / 1000;
    }
    return itemWeight;
  };

  const obterTotalMercadoriaVendida = (p: any, itemList: any[]) => {
    let totalSoldWeight = 0;
    itemList.forEach((item) => {
      if (item && item.name && p.name && item.name.trim().toLowerCase() === p.name.trim().toLowerCase()) {
        const itemQty = Number(item.quantity || 0);
        const itemWeight = Number(item.weightPerUnit || 1);
        const itemUnit = item.unit || 'unit';
        
        const convertedWeight = obterPesoUnidadeConvertido(itemWeight, itemUnit, p.unit);
        totalSoldWeight += itemQty * convertedWeight;
      }
    });
    return totalSoldWeight;
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
      const oldProduct = products.find(p => p.id === productFormId);
      const oldName = oldProduct ? oldProduct.name.trim() : '';
      const newName = productFormName.trim();

      const updated = products.map(p => p.id === productFormId ? {
        ...p,
        name: newName,
        quantity: Number(productFormQuantity) || 0,
        unit: productFormUnit,
        weightPerUnit: isNaN(Number(productFormWeightPerUnit)) ? 0 : Number(productFormWeightPerUnit),
        costPrice: Number(productFormCostPrice) || 0,
        salePrice: Number(productFormSalePrice) || 0,
        segmento: productFormSegmento || undefined,
        tamanho: productFormTamanho || undefined,
        salesMerchandiseQty: Number(productFormSalesMerchandiseQty) || 0,
        empresaFornecedora: productFormEmpresaFornecedora.trim() || undefined,
      } : p);
      saveProducts(updated);

      // SE O NOME DO PRODUTO MUDOU, ATUALIZAR EM TODAS AS OUTRAS PÁGINAS E ESTADOS CONFORME SOLICITADO
      if (oldName && oldName.toLowerCase() !== newName.toLowerCase()) {
        const oldNameLower = oldName.toLowerCase();

        // 1. Minha Venda - Lista de Pedidos (salesHistory)
        const updatedSalesHistory = salesHistory.map(sale => {
          if (!sale || !sale.items) return sale;
          const updatedItems = sale.items.map((item: any) => {
            if (item.name && item.name.trim().toLowerCase() === oldNameLower) {
              return { ...item, name: newName };
            }
            return item;
          });
          return { ...sale, items: updatedItems };
        });
        setSalesHistory(updatedSalesHistory);
        localStorage.setItem('feiralivre_sales_history', JSON.stringify(updatedSalesHistory));

        // 2. Histórico de Apagados (recentlyDeletedSales)
        const updatedDeletedSales = recentlyDeletedSales.map(sale => {
          if (!sale || !sale.items) return sale;
          const updatedItems = sale.items.map((item: any) => {
            if (item.name && item.name.trim().toLowerCase() === oldNameLower) {
              return { ...item, name: newName };
            }
            return item;
          });
          return { ...sale, items: updatedItems };
        });
        setRecentlyDeletedSales(updatedDeletedSales);
        localStorage.setItem('feiralivre_recently_deleted_sales', JSON.stringify(updatedDeletedSales));

        // 3. Minha Venda - Carrinho Atual de Quantidade (items)
        const updatedItems = items.map(item => {
          if (item.name && item.name.trim().toLowerCase() === oldNameLower) {
            return { ...item, name: newName };
          }
          return item;
        });
        setItems(updatedItems);

        // 4. Nota Fiscal - Itens da Nota Fiscal Carregados (nfItems)
        const updatedNfItems = nfItems.map(item => {
          if (item.name && item.name.trim().toLowerCase() === oldNameLower) {
            return { ...item, name: newName };
          }
          return item;
        });
        setNfItems(updatedNfItems);

        // 5. Minha Venda - Produto Selecionado na coluna de Pesquisar (productName input)
        if (productName && productName.trim().toLowerCase() === oldNameLower) {
          setProductName(newName);
        }

        // 6. Recentes (recentProductNames)
        const updatedRecents = recentProductNames.map(name => {
          if (name && name.trim().toLowerCase() === oldNameLower) {
            return newName;
          }
          return name;
        });
        setRecentProductNames(updatedRecents);
        localStorage.setItem('feiralivre_recent_products', JSON.stringify(updatedRecents));

        // 7. Pesquisas de texto
        if (quantitySearch && quantitySearch.trim().toLowerCase() === oldNameLower) {
          setQuantitySearch(newName);
        }
        if (etiquetaSearch && etiquetaSearch.trim().toLowerCase() === oldNameLower) {
          setEtiquetaSearch(newName);
        }
      }

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
        salePrice: Number(productFormSalePrice) || 0,
        segmento: productFormSegmento || undefined,
        tamanho: productFormTamanho || undefined,
        salesMerchandiseQty: Number(productFormSalesMerchandiseQty) || 0,
        empresaFornecedora: productFormEmpresaFornecedora.trim() || undefined,
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
    setProductFormSalePrice(0);
    setProductFormSegmento('');
    setProductFormSegmentoSearch('');
    setProductFormSalesMerchandiseQty(0);
    setProductFormTamanho('');
    setProductFormEmpresaFornecedora('');
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
    setProductFormSalePrice(p.salePrice || 0);
    setProductFormSegmento(p.segmento || '');
    setProductFormSegmentoSearch(p.segmento || '');
    setProductFormSalesMerchandiseQty(p.salesMerchandiseQty || 0);
    setProductFormTamanho(p.tamanho || '');
    setProductFormEmpresaFornecedora(p.empresaFornecedora || '');
  };

  const cancelEditProduct = () => {
    setProductFormId(null);
    setProductFormName('');
    setProductFormQuantity(0);
    setProductFormUnit('unit');
    setProductFormWeightPerUnit(0);
    setProductFormCostPrice(0);
    setProductFormSalePrice(0);
    setProductFormSegmento('');
    setProductFormSegmentoSearch('');
    setProductFormSalesMerchandiseQty(0);
    setProductFormTamanho('');
    setProductFormEmpresaFornecedora('');
  };

  // Função para validar e detalhar códigos GS1 Brasil / Internacional
  const getGS1Info = (code: string) => {
    const clean = code.replace(/\D/g, '');
    const len = clean.length;
    const isGtin = [8, 12, 13, 14].includes(len);
    
    let format = 'Desconhecido';
    if (len === 8) format = 'EAN-8';
    else if (len === 12) format = 'UPC-A';
    else if (len === 13) format = 'EAN-13';
    else if (len === 14) format = 'GTIN-14';

    let hasBrazilianPrefix = false;
    let prefixCountry = 'Outro País / Internacional';
    if (isGtin && (len === 13 || len === 14)) {
      const prefixStr = len === 13 ? clean.slice(0, 3) : clean.slice(1, 4);
      const prefixNum = parseInt(prefixStr, 10);
      
      if (prefixNum >= 789 && prefixNum <= 790) {
        hasBrazilianPrefix = true;
        prefixCountry = 'Brasil';
      } else if (prefixNum >= 0 && prefixNum <= 19) {
        prefixCountry = 'EUA / Canadá';
      } else if (prefixNum >= 300 && prefixNum <= 379) {
        prefixCountry = 'França';
      } else if (prefixNum >= 400 && prefixNum <= 440) {
        prefixCountry = 'Alemanha';
      } else if (prefixNum >= 490 && prefixNum <= 499) {
        prefixCountry = 'Japão';
      } else if (prefixNum >= 500 && prefixNum <= 509) {
        prefixCountry = 'Reino Unido';
      } else if (prefixNum >= 690 && prefixNum <= 699) {
        prefixCountry = 'China';
      } else if (prefixNum >= 779) {
        prefixCountry = 'Argentina';
      } else if (prefixNum >= 840 && prefixNum <= 849) {
        prefixCountry = 'Espanha';
      }
    } else if (isGtin && len === 8) {
      const prefixStr = clean.slice(0, 3);
      const prefixNum = parseInt(prefixStr, 10);
      if (prefixNum >= 789 && prefixNum <= 790) {
        hasBrazilianPrefix = true;
        prefixCountry = 'Brasil';
      }
    }

    let calculatedCheckDigit: number | null = null;
    let currentCheckDigit: number | null = null;
    let isValidCheckDigit = false;

    if (isGtin) {
      currentCheckDigit = parseInt(clean[len - 1], 10);
      const digits = clean.slice(0, -1).split('').map(Number);
      let sum = 0;
      for (let i = digits.length - 1; i >= 0; i--) {
        const weight = (digits.length - 1 - i) % 2 === 0 ? 3 : 1;
        sum += digits[i] * weight;
      }
      const remainder = sum % 10;
      calculatedCheckDigit = remainder === 0 ? 0 : 10 - remainder;
      isValidCheckDigit = calculatedCheckDigit === currentCheckDigit;
    }

    let companyPrefix = '';
    let itemReference = '';
    if (isGtin && len === 13) {
      companyPrefix = clean.slice(3, 10);
      itemReference = clean.slice(10, 12);
    }

    return {
      isValidLength: len > 0,
      isGtin,
      format,
      hasBrazilianPrefix,
      prefixCountry,
      calculatedCheckDigit,
      currentCheckDigit,
      isValidCheckDigit,
      companyPrefix,
      itemReference,
      cleanCode: clean
    };
  };

  // Funções para controle da página de Etiqueta
  const saveLabelDetails = () => {
    if (!labelEditProductId) return;
    const updated = products.map(p => p.id === labelEditProductId ? {
      ...p,
      etiquetaManual: labelEditEtiquetaManual || undefined,
      loteManual: labelEditLoteManual || undefined,
      leitorEtiqueta: labelEditLeitorEtiqueta || undefined,
      fotoLote: labelEditFotoLote || undefined,
      validadeData: labelEditValidadeData || undefined,
      validadeFoto: labelEditValidadeFoto || undefined,
      codigoBarras: labelEditCodigoBarras || undefined,
    } : p);
    saveProducts(updated);
    setLabelEditProductId(null);
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 2500);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setCameraStream(stream);
    } catch (err) {
      console.warn("Câmera não disponível ou permissão negada. Usando simulação.", err);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  };

  const [scannerErrorMessage, setScannerErrorMessage] = useState<string>('');

  const handleBarcodeDetected = (code: string) => {
    // Tenta tocar som de bipe
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {}

    if (scanningTargetField === 'codigoBarras') {
      setLabelEditCodigoBarras(code);
    }

    setIsScanningBarcode(false);
    setScanningTargetField(null);
    setScannerErrorMessage('');
  };

  const handleBarcodeFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setScannerErrorMessage('Processando imagem e identificando código...');
    try {
      const tempReaderId = "barcode-scanner-reader";
      // Certifica de instanciar temporariamente na div existente
      const html5QrCodeParser = new Html5Qrcode(tempReaderId);
      const decodedText = await html5QrCodeParser.scanFile(file, false);
      handleBarcodeDetected(decodedText);
    } catch (err: any) {
      console.error("Não foi possível ler código do arquivo:", err);
      setScannerErrorMessage('Não foi possível identificar um código de barras ou QR Code nesta imagem. Certifique-se de que o código esteja nítido e bem focado.');
    }
  };

  useEffect(() => {
    let html5QrCode: any = null;
    if (isScanningBarcode) {
      setScannerErrorMessage('');
      const timer = setTimeout(() => {
        const element = document.getElementById("barcode-scanner-reader");
        if (element) {
          try {
            html5QrCode = new Html5Qrcode("barcode-scanner-reader");
            html5QrCode.start(
              { facingMode: 'environment' },
              {
                fps: 10,
                qrbox: (width: number, height: number) => {
                  const min = Math.min(width, height);
                  const size = Math.floor(min * 0.75);
                  return { width: size, height: size };
                }
              },
              (decodedText: string) => {
                handleBarcodeDetected(decodedText);
              },
              (err: any) => {
                // Ignorar erros repetitivos de render
              }
            ).catch((err: any) => {
              console.error("Erro ao iniciar Html5Qrcode:", err);
              setScannerErrorMessage('Não foi possível acessar a câmera. Forneça as permissões de câmera ou selecione uma foto da galeria para escanear.');
            });
          } catch (e) {
            console.error("Erro ao criar Html5Qrcode:", e);
            setScannerErrorMessage('Falha ao inicializar o componente do leitor. Selecione uma foto da galeria.');
          }
        }
      }, 500);

      return () => {
        clearTimeout(timer);
        if (html5QrCode) {
          try {
            if (html5QrCode.isScanning) {
              html5QrCode.stop().then(() => {
                html5QrCode.clear();
              }).catch((e: any) => console.warn("Erro ao parar camera:", e));
            } else {
              html5QrCode.clear();
            }
          } catch (e) {
            console.warn("Erro no cleanup de html5QrCode:", e);
          }
        }
      };
    }
  }, [isScanningBarcode]);

  const handleNfCodeDetected = (text: string) => {
    if (!text) return;
    const cleanText = text.trim().replace(/\s/g, '');
    
    // Search in salesHistory
    const foundSale = salesHistory.find(sale => {
      const appCode = obterCodigoAcessoApp(sale).replace(/\s/g, '').toUpperCase();
      const saleId = sale.id;
      
      return cleanText.toUpperCase().includes(appCode) || 
             cleanText.includes(saleId) ||
             text.includes(sale.id);
    });

    if (foundSale) {
      setNfSelectedOrderId(foundSale.id);
      
      const imported = foundSale.items.map((item: any) => {
        const dbProduct = products.find(p => p.name.toLowerCase() === item.name.toLowerCase());
        return {
          id: item.id || Math.random().toString(),
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          total: typeof item.total === 'number' ? item.total : (item.quantity * item.price),
          barcode: dbProduct?.codigoBarras || '',
          comercializacao: item.comercializacao || dbProduct?.comercializacao || '',
          tamanho: item.tamanho || dbProduct?.tamanho || '',
          weightPerUnit: item.weightPerUnit || dbProduct?.weightPerUnit || 0,
          unit: item.unit || dbProduct?.unit || 'unit'
        };
      });
      setNfItems(imported);
      setNfDestinatarioNome(foundSale.customerName || '');
      setNfDestinatarioDoc(foundSale.customerDoc || '');
      setNfPaymentMethod(foundSale.paymentMethod || 'dinheiro');
      setNfAmountReceived(foundSale.amountReceived || 0);
      setNfChange(foundSale.change || 0);
      
      setNfSearchResultMessage({
        type: 'success',
        text: `Cupom #${foundSale.orderNumber} localizado! Código de Acesso validado offline com sucesso.`
      });
      setIsScanningNfCamera(false);
    } else {
      setNfSearchResultMessage({
        type: 'error',
        text: `Código lido, mas não corresponde a nenhuma nota fiscal em nosso histórico local.`
      });
    }
  };

  useEffect(() => {
    let html5QrCode: any = null;
    if (isScanningNfCamera) {
      setNfSearchResultMessage(null);
      const timer = setTimeout(() => {
        const element = document.getElementById("nf-camera-scanner-reader");
        if (element) {
          try {
            html5QrCode = new Html5Qrcode("nf-camera-scanner-reader");
            html5QrCode.start(
              { facingMode: 'environment' },
              {
                fps: 10,
                qrbox: (width: number, height: number) => {
                  const min = Math.min(width, height);
                  const size = Math.floor(min * 0.75);
                  return { width: size, height: size };
                }
              },
              (decodedText: string) => {
                handleNfCodeDetected(decodedText);
              },
              (err: any) => {
                // Ignorar erros repetitivos
              }
            ).catch((err: any) => {
              console.error("Erro ao iniciar Html5Qrcode para NF-e:", err);
              setNfSearchResultMessage({
                type: 'error',
                text: 'Não foi possível acessar a câmera para ler o QR Code da nota fiscal.'
              });
            });
          } catch (e) {
            console.error("Erro ao criar Html5Qrcode para NF-e:", e);
            setNfSearchResultMessage({
              type: 'error',
              text: 'Falha ao inicializar o leitor de QR Code de notas.'
            });
          }
        }
      }, 500);

      return () => {
        clearTimeout(timer);
        if (html5QrCode) {
          try {
            if (html5QrCode.isScanning) {
              html5QrCode.stop().then(() => {
                html5QrCode.clear();
              }).catch((e: any) => console.warn("Erro ao parar camera de NF-e:", e));
            } else {
              html5QrCode.clear();
            }
          } catch (e) {
            console.warn("Erro no cleanup do leitor de NF-e:", e);
          }
        }
      };
    }
  }, [isScanningNfCamera]);

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
    console.log("[STEP 1] quantity:", quantity);
    if (currentItemTotal <= 0) return;

    // Verificar se o produto é cadastrado e validar se há estoque
    const registeredProduct = products.find(
      (p) => p.name.trim().toLowerCase() === (productName || '').trim().toLowerCase()
    );

    if (registeredProduct) {
      const q0 = registeredProduct.quantity || 0;
      const m = registeredProduct.salesMerchandiseQty || 0;

      let remainingSalesMerchandise = 0;
      let requiredAmount = Number(quantity || 0);

      if (m <= 0) {
        const totalSoldInHistory = salesHistory.reduce((acc, sale) => {
          if (!sale?.items) return acc;

          const soldInSale = sale.items
            .filter((item: any) => (item.name || '').trim().toLowerCase() === registeredProduct.name.trim().toLowerCase())
            .reduce(
              (sum: number, item: any) =>
                sum + Number(item.quantity || 0),
              0
            );

          return acc + soldInSale;
        }, 0);

        const totalInCurrentCart = items.reduce((acc, item) => {
          if (editingItemId && item.id === editingItemId) return acc;
          if (item.name.trim().toLowerCase() === registeredProduct.name.trim().toLowerCase()) {
            return acc + (item.quantity || 0);
          }
          return acc;
        }, 0);

        const totalConsumed = totalSoldInHistory + totalInCurrentCart;
        remainingSalesMerchandise = Math.max(0, q0 - totalConsumed);
      } else {
        const totalSoldInHistory = salesHistory.reduce((acc, sale) => {
          if (!sale?.items) return acc;
          return acc + obterTotalMercadoriaVendida(registeredProduct, sale.items);
        }, 0);

        const totalInCurrentCart = obterTotalMercadoriaVendida(
          registeredProduct,
          items.filter(item => !(editingItemId && item.id === editingItemId))
        );

        const totalConsumed = totalSoldInHistory + totalInCurrentCart;
        // O estoque total de mercadorias é a quantidade de pacotes (q0) vezes as mercadorias por pacote (m)
        remainingSalesMerchandise = Math.max(0, (q0 * m) - totalConsumed);
        requiredAmount = Number(quantity || 0) * obterPesoUnidadeConvertido(Number(weightPerUnit || 1), unit, registeredProduct.unit);
      }

      if (remainingSalesMerchandise <= 0) {
        alert(
          `VENDA NÃO AUTORIZADA!\n\nO produto "${registeredProduct.name}" está sem estoque de "Mercadoria de Venda" (Estoque atual: 0).\nPor favor, adicione estoque nas Opções Disponíveis na tela "QUANTIDADE" antes de prosseguir.`
        );
        return;
      }

      if (remainingSalesMerchandise < requiredAmount) {
        const remainingFormatted = formatarMercadoria(remainingSalesMerchandise, registeredProduct.unit || 'unit');
        const requiredFormatted = formatarMercadoria(requiredAmount, registeredProduct.unit || 'unit');
        alert(
          `QUANTIDADE NÃO AUTORIZADA!\n\nVocê está tentando vender ${quantity} ${quantity > 1 ? 'quantidades/unidades' : 'quantidade/unidade'} com PESO OU MEDIDA total de ${requiredFormatted} do produto "${registeredProduct.name}", mas restam apenas ${remainingFormatted} no estoque de Mercadoria de Venda.\n\nPor favor, adicione mais estoque ou reduza a quantidade.`
        );
        return;
      }
    }

    let comercializacao = '';
    if (comercialUnit) {
      comercializacao = formatarComercializacao(comercialUnit, comercialText);
    }

    if (editingItemId) {
      // Editar item existente
      console.log("[DEBUG TRACKING - EDIT]", {
        quantity,
        weightPerUnit,
        unit,
        total: currentItemTotal
      });
      setItems(items.map(item => {
        if (item.id === editingItemId) {
          return {
            ...item,
            name: productName || 'Produto sem nome',
            price,
            quantity: Number(quantity) || 0,
            unit,
            weightPerUnit,
            total: currentItemTotal,
            comercializacao: comercializacao || undefined,
            comercialUnit: comercialUnit || undefined,
            comercialText: comercialText || undefined,
            segmento: segmento || undefined,
            tamanho: tamanho || undefined,
          };
        }
        return item;
      }));
      setEditingItemId(null);
    } else {
      // Adicionar novo item
      console.log("[DEBUG QUANTIDADE]", {
        productName,
        quantity,
        unit,
        currentItemTotal
      });

      const newItem = {
        id: Math.random().toString(36).substr(2, 9),
        name: productName || 'Produto sem nome',
        price,
        quantity: Number(quantity) || 0,
        unit,
        weightPerUnit,
        total: currentItemTotal,
        comercializacao: comercializacao || undefined,
        comercialUnit: comercialUnit || undefined,
        comercialText: comercialText || undefined,
        segmento: segmento || undefined,
        tamanho: tamanho || undefined,
      };

      console.log("[STEP 2] newItem:", newItem);

      console.log("[NOVO ITEM]", newItem);

      console.log("[ITEM CRIADO]", {
        name: newItem.name,
        quantity: newItem.quantity,
        weightPerUnit: newItem.weightPerUnit,
        unit: newItem.unit,
        total: newItem.total
      });

      console.log("[DEBUG TRACKING - ADD]", {
        quantity: newItem.quantity,
        weightPerUnit: newItem.weightPerUnit,
        unit: newItem.unit,
        total: newItem.total
      });

      alert(
        `Produto: ${newItem.name}
Quantidade: ${newItem.quantity}
Peso/Medida: ${newItem.weightPerUnit}
Unidade: ${newItem.unit}`
      );

      setItems([...items, newItem]);
    }

    // Resetar campos
    setProductName('');
    setQuantity(1);
    setComercialUnit('');
    setComercialText('');
    setSegmento('');
    setSegmentoSearch('');
    setTamanho('');
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
    setSegmento(item.segmento || '');
    setSegmentoSearch(item.segmento || '');
    setTamanho(item.tamanho || '');
    
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
    setSegmento('');
    setSegmentoSearch('');
    setTamanho('');
  };

  const formatUnitLabel = (val: number, unitId: string) => {
    const isPlural = val > 1; // 0 and 1 are singular, 2, 3, 4, 5... are plural
    const u = (unitId || 'unit').toLowerCase();
    if (u === 'unit' || u === 'unidade' || u === 'unidades') {
      return isPlural ? 'unidades' : 'unidade';
    }
    if (u === 'kg' || u === 'quilo' || u === 'quilos') {
      return isPlural ? 'quilos' : 'quilo';
    }
    if (u === 'gram' || u === 'grama' || u === 'gramas') {
      return isPlural ? 'gramas' : 'grama';
    }
    if (u === 'box' || u === 'caixa' || u === 'caixas') {
      return isPlural ? 'caixas' : 'caixa';
    }
    if (u === 'bag' || u === 'saco' || u === 'sacos') {
      return isPlural ? 'sacos' : 'saco';
    }
    return isPlural ? 'unidades' : 'unidade';
  };

  const handleSaveStockEdit = () => {
    if (!stockEditProductId) return;
    const updatedProducts = products.map((p) => {
      if (p.id === stockEditProductId) {
        return {
          ...p,
          quantity: stockEditQuantity,
          unit: stockEditUnit,
          segmento: stockEditCategory || undefined,
          salesMerchandiseQty: stockEditSalesMerchandiseQty,
          weightPerUnit: stockEditWeightPerUnit,
        };
      }
      return p;
    });
    setProducts(updatedProducts);
    localStorage.setItem('feiralivre_products', JSON.stringify(updatedProducts));
    
    setStockEditProductId(null);
    setStockEditName('');
    setStockEditQuantity(0);
    setStockEditUnit('unit');
    setStockEditCategory('');
    setStockEditSalesMerchandiseQty(0);
    setStockEditWeightPerUnit(0);
    setStockFormSegmentoSearch('');
    
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 3000);
  };

  const cancelStockEdit = () => {
    setStockEditProductId(null);
    setStockEditName('');
    setStockEditQuantity(0);
    setStockEditUnit('unit');
    setStockEditCategory('');
    setStockEditSalesMerchandiseQty(0);
    setStockEditWeightPerUnit(0);
    setStockFormSegmentoSearch('');
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

    console.log(
      "[FINISH SALE ITEMS]",
      JSON.stringify(items, null, 2)
    );

    // Snapshot robusto de todos os itens com os dados dos produtos vigentes no momento da venda
    const richItems = items.map(item => {
      const dbProduct = products.find(p => p.name.trim().toLowerCase() === item.name.trim().toLowerCase());
      return {
        id: item.id || Math.random().toString(36).substr(2, 9),
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        unit: item.unit || dbProduct?.unit || 'unit',
        weightPerUnit: item.weightPerUnit || dbProduct?.weightPerUnit || 0,
        total: typeof item.total === 'number' ? item.total : (item.quantity * item.price),
        comercializacao: item.comercializacao || dbProduct?.comercializacao || '',
        comercialUnit: item.comercialUnit || dbProduct?.comercialUnit || '',
        comercialText: item.comercialText || dbProduct?.comercialText || '',
        segmento: item.segmento || dbProduct?.segmento || '',
        tamanho: item.tamanho || dbProduct?.tamanho || '',
        barcode: item.barcode || dbProduct?.codigoBarras || '',
        empresaFornecedora: item.empresaFornecedora || dbProduct?.empresaFornecedora || '',
        costPrice: typeof item.costPrice === 'number' ? item.costPrice : (dbProduct?.costPrice || 0)
      };
    });

    const newSale = {
      id: Math.random().toString(36).substr(2, 9),
      orderNumber: salesHistory.length + 1,
      customerName: customerName.trim() || `Cliente - ${shopLabel}`,
      customerDoc: customerDoc.trim() || '',
      companyName: nfEmitenteNome.trim() || '',
      companyDoc: nfEmitenteDoc.trim() || '',
      companyAddress: nfEmitenteEndereco.trim() || '',
      vendorName: nfEmitenteNomeVendedor.trim() || '',
      companyType: nfEmitenteTipo,
      companyPapel: nfEmitentePapel,
      companyAddressTipo: nfEmitenteEnderecoTipo,
      companyDocTipo: nfEmitenteDocTipo,
      companyDocNumero: nfEmitenteDocNumero,
      date: new Date().toLocaleString('pt-BR'),
      items: richItems,
      total: total,
      amountReceived: amountReceived,
      change: Math.max(0, amountReceived - total),
      shopType: shopType,
      paymentMethod: paymentMethod,
    };

    const cartItems = items;
    const saleData = newSale;
    console.log("ITEMS DO CARRINHO", cartItems);
    console.log("VENDA SALVA", saleData);

    console.log("[STEP 4] newSale antes de salvar:", newSale);

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
    setCustomerDoc('');
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
      const saleObj = salesHistory.find(s => s.id === saleToDelete);
      const updated = salesHistory.filter(s => s.id !== saleToDelete);
      setSalesHistory(updated);
      localStorage.setItem('feiralivre_sales_history', JSON.stringify(updated));
      
      if (saleObj) {
        const updatedDeleted = [saleObj, ...recentlyDeletedSales];
        setRecentlyDeletedSales(updatedDeleted);
        localStorage.setItem('feiralivre_recently_deleted_sales', JSON.stringify(updatedDeleted));
      }
      setSaleToDelete(null);
    }
  };

  const toggleCurrentSaleSelection = (saleId: string) => {
    setSelectedCurrentSales(prev =>
      prev.includes(saleId) ? prev.filter(id => id !== saleId) : [...prev, saleId]
    );
  };

  const toggleDeletedSaleSelection = (saleId: string) => {
    setSelectedDeletedSales(prev =>
      prev.includes(saleId) ? prev.filter(id => id !== saleId) : [...prev, saleId]
    );
  };

  const toggleSelectAllCurrentSales = () => {
    const visibleSales = salesHistory.filter(matchesSearch).filter(Boolean);
    if (visibleSales.length === 0) return;
    
    const visibleIds = visibleSales.map(s => s.id);
    const allVisibleSelected = visibleIds.every(id => selectedCurrentSales.includes(id));
    
    if (allVisibleSelected) {
      setSelectedCurrentSales(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedCurrentSales(prev => {
        const union = new Set([...prev, ...visibleIds]);
        return Array.from(union);
      });
    }
  };

  const toggleSelectAllDeletedSales = () => {
    const visibleSales = recentlyDeletedSales.filter(matchesSearch).filter(Boolean);
    if (visibleSales.length === 0) return;
    
    const visibleIds = visibleSales.map(s => s.id);
    const allVisibleSelected = visibleIds.every(id => selectedDeletedSales.includes(id));
    
    if (allVisibleSelected) {
      setSelectedDeletedSales(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedDeletedSales(prev => {
        const union = new Set([...prev, ...visibleIds]);
        return Array.from(union);
      });
    }
  };

  const deleteSelectedCurrentSales = () => {
    if (selectedCurrentSales.length === 0) return;
    const salesToMove = salesHistory.filter(s => s && selectedCurrentSales.includes(s.id));
    const updatedHistory = salesHistory.filter(s => s && !selectedCurrentSales.includes(s.id));
    
    setSalesHistory(updatedHistory);
    localStorage.setItem('feiralivre_sales_history', JSON.stringify(updatedHistory));
    
    const updatedDeleted = [...salesToMove, ...recentlyDeletedSales];
    setRecentlyDeletedSales(updatedDeleted);
    localStorage.setItem('feiralivre_recently_deleted_sales', JSON.stringify(updatedDeleted));
    
    setSelectedCurrentSales([]);
  };

  const deleteAllCurrentSales = () => {
    if (salesHistory.length === 0) return;
    const updatedDeleted = [...salesHistory, ...recentlyDeletedSales];
    setRecentlyDeletedSales(updatedDeleted);
    localStorage.setItem('feiralivre_recently_deleted_sales', JSON.stringify(updatedDeleted));
    
    setSalesHistory([]);
    localStorage.removeItem('feiralivre_sales_history');
    
    setSelectedCurrentSales([]);
  };

  const deleteSelectedDeletedSalesPermanently = () => {
    if (selectedDeletedSales.length === 0) return;
    const updatedDeleted = recentlyDeletedSales.filter(s => s && !selectedDeletedSales.includes(s.id));
    setRecentlyDeletedSales(updatedDeleted);
    localStorage.setItem('feiralivre_recently_deleted_sales', JSON.stringify(updatedDeleted));
    
    setSelectedDeletedSales([]);
  };

  const deleteAllDeletedSalesPermanently = () => {
    if (recentlyDeletedSales.length === 0) return;
    setRecentlyDeletedSales([]);
    localStorage.removeItem('feiralivre_recently_deleted_sales');
    
    setSelectedDeletedSales([]);
  };

  const restoreSelectedDeletedSales = () => {
    if (selectedDeletedSales.length === 0) return;
    const salesToRestore = recentlyDeletedSales.filter(s => s && selectedDeletedSales.includes(s.id));
    const updatedDeleted = recentlyDeletedSales.filter(s => s && !selectedDeletedSales.includes(s.id));
    
    const updatedHistory = [...salesToRestore, ...salesHistory];
    setSalesHistory(updatedHistory);
    localStorage.setItem('feiralivre_sales_history', JSON.stringify(updatedHistory));
    
    setRecentlyDeletedSales(updatedDeleted);
    localStorage.setItem('feiralivre_recently_deleted_sales', JSON.stringify(updatedDeleted));
    
    setSelectedDeletedSales([]);
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
      if (item.tamanho) {
        text += `   • Tamanho: ${item.tamanho}\n`;
      }
      if (item.segmento) {
        text += `   • Categoria: ${item.segmento}\n`;
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

  const copyReceiptText = (sale: any) => {
    const text = generateReceiptText(sale);
    copyToClipboard(text);
  };

  const copyAllSalesText = () => {
    if (salesHistory.length === 0) return;
    
    let text = `*RELATÓRIO COMPLETO DE VENDAS*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    const currentDateStr = new Date().toLocaleDateString('pt-BR');
    const currentTimeStr = new Date().toLocaleTimeString('pt-BR');
    text += `📅 *Gerado em:* ${currentDateStr} às ${currentTimeStr}\n`;
    text += `📦 *Total de Vendas:* ${salesHistory.length}\n`;
    const totalRev = salesHistory.reduce((acc, s) => acc + (s && typeof s.total === 'number' ? s.total : 0), 0);
    text += `💰 *Faturamento Total:* R$ ${totalRev.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n\n`;

    salesHistory.forEach((sale, index) => {
      const orderNumber = salesHistory.length - index;
      const titleText = (!sale.customerName || sale.customerName === 'Cliente Avulso')
        ? (SHOP_TYPES.find(t => t.id === sale.shopType)?.label || 'Feira Livre')
        : sale.customerName;

      text += `📦 *PEDIDO Nº ${orderNumber} — ${titleText}*\n`;
      text += `📅 *Data:* ${sale.date || ''}\n`;
      if (sale.paymentMethod) {
        text += `💳 *Forma de Pagamento:* ${obterLabelPagamento(sale.paymentMethod)}\n`;
      }
      
      const saleItems = Array.isArray(sale.items) ? sale.items : [];
      saleItems.forEach((item: any, idx: number) => {
        if (!item) return;
        const weightText = formatarMercadoria(item.weightPerUnit || 0, item.unit || 'unit');
        const weightLabel = obterLabelMedida(item.weightPerUnit || 0, item.unit || 'unit');
        
        text += `   ${idx + 1}. *${item.name || 'Produto'}*\n`;
        text += `      • ${item.quantity <= 1 ? "Quantidade" : "Quantidades"}: ${item.quantity || 0}\n`;
        text += `      • ${weightLabel}: ${weightText}\n`;
        if (item.comercializacao) {
          text += `      • Comercialização: ${item.comercializacao}\n`;
        }
        if (item.tamanho) {
          text += `      • Tamanho: ${item.tamanho}\n`;
        }
        if (item.segmento) {
          text += `      • Categoria: ${item.segmento}\n`;
        }
        const precoUnitRatio = item.unit === 'gram' ? 1000 : 1;
        const precoUnitText = `${formatarMercadoria(precoUnitRatio, item.unit || 'unit')} — R$ ${(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        text += `      • Preço Unitário: ${precoUnitText}\n`;
        text += `      • Preço do produto: R$ ${(item.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
      });
      
      text += `💵 *Total do Pedido:* R$ ${(sale.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
      if (sale.amountReceived > 0) {
        text += `   • Pago: R$ ${(sale.amountReceived || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Troco: R$ ${(sale.change || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
      }
      text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    });

    copyToClipboard(text);
  };

  const getSaleCardHeight = (sale: any) => {
    const saleItems = Array.isArray(sale.items) ? sale.items : [];
    // Header section:
    // top margin (6) + circle badge / title / date / payment (19) + separator & label spacing (8) = 33
    let height = 33;

    // Items list:
    saleItems.forEach((item: any) => {
      let itemCardHeight = 24;
      if (item.comercializacao) itemCardHeight += 4;
      if (item.tamanho) itemCardHeight += 4;
      if (item.segmento) itemCardHeight += 4;
      height += itemCardHeight + 3; // card height + padding
    });

    // Divider line, Pago / Troco, Total section, and bottom padding:
    height += 12; // bottom section padding and margin
    return height;
  };

  const drawSaleCard = (doc: any, sale: any, orderNumber: number, startY: number) => {
    const saleItems = Array.isArray(sale.items) ? sale.items : [];
    const cardHeight = getSaleCardHeight(sale);

    // Draw the main card background box
    doc.setFillColor(255, 255, 255); // White container card
    doc.setDrawColor(226, 232, 240); // slate-200 border
    doc.setLineWidth(0.4);
    // Draw rounded rect with rx=6, ry=6
    doc.roundedRect(20, startY, 170, cardHeight, 6, 6, "FD");

    let cardY = startY + 6;

    // Order badge circle
    doc.setFillColor(236, 253, 245); // emerald-50 bg
    doc.setDrawColor(209, 250, 229); // emerald-100 border
    doc.setLineWidth(0.2);
    doc.circle(28, cardY + 2.5, 4.5, "FD");

    // Order number text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(5, 150, 105); // emerald-600
    doc.text(String(orderNumber), 28, cardY + 5.6, { align: "center" });

    // Pedido title text
    const titleText = (!sale.customerName || sale.customerName === 'Cliente Avulso')
      ? (SHOP_TYPES.find(t => t.id === sale.shopType)?.label || 'Feira Livre')
      : sale.customerName;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59); // slate-800
    doc.text(`Pedido nº {orderNumber} — {titleText}`.replace("{orderNumber}", String(orderNumber)).replace("{titleText}", titleText), 36, cardY + 2.5);

    // Subtitle Date/Hour
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(sale.date || "", 36, cardY + 7);

    // Payment method badge
    if (sale.paymentMethod) {
      const payLabel = obterLabelPagamento(sale.paymentMethod);
      doc.setFillColor(241, 245, 249); // slate-100 bg
      doc.setDrawColor(226, 232, 240); // slate-200 border
      doc.setLineWidth(0.2);
      doc.roundedRect(36, cardY + 9.5, 30, 4.5, 1.5, 1.5, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105); // slate-600
      doc.text(payLabel.toUpperCase(), 51, cardY + 12.8, { align: "center" });
    }

    // Top Right price total of the sale
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text("R$", 153, cardY + 5.5);

    const saleTotal = sale.total || 0;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(16, 185, 129); // emerald-500
    doc.text(saleTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), 184, cardY + 5.5, { align: "right" });

    // Top section horizontal divider line
    doc.setDrawColor(241, 245, 249); // slate-100 line
    doc.setLineWidth(0.3);
    doc.line(24, cardY + 18, 186, cardY + 18);

    cardY += 23;

    // "Produtos Vendidos" category label list
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(saleItems.length <= 1 ? "PRODUTO VENDIDO:" : "PRODUTOS VENDIDOS:", 24, cardY);

    cardY += 4;

    // Print all product details as individual grey cards
    saleItems.forEach((item: any, idx: number) => {
      const itemTotal = item.total || 0;
      const itemPrice = item.price || 0;

      let itemCardHeight = 24;
      if (item.comercializacao) itemCardHeight += 4;
      if (item.tamanho) itemCardHeight += 4;
      if (item.segmento) itemCardHeight += 4;

      // Card container outline for product
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(241, 245, 249); // slate-100 border
      doc.roundedRect(24, cardY, 162, itemCardHeight, 3.5, 3.5, "FD");

      let innerY = cardY + 4.5;

      const drawItemField = (label: string, value: string, isEmerald = false, isAmber = false) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139); // slate-500
        doc.text(label, 28, innerY);

        doc.setFont("helvetica", "bold");
        if (isEmerald) {
          doc.setTextColor(5, 150, 105); // emerald-600
        } else if (isAmber) {
          doc.setTextColor(180, 83, 9); // amber-700
        } else {
          doc.setTextColor(30, 41, 59); // slate-800
        }
        doc.text(value, 82, innerY);
        innerY += 4;
      };

      const isSingular = item.quantity <= 1;
      drawItemField(isSingular ? "Quantidade:" : "Quantidades:", `${item.quantity || 0}`);
      drawItemField(isSingular ? "Produto:" : "Produtos:", `${item.name || "Produto"}`);
      drawItemField("Preço unitário:", `R$ ${itemPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
      drawItemField(isSingular ? "Total:" : "Totais:", `R$ ${itemTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, true);
      
      const formattedWeight = formatarMercadoria(item.weightPerUnit || 0, item.unit || "unit");
      drawItemField(isSingular ? "Peso ou Medida:" : "Pesos ou Medidas:", formattedWeight);

      if (item.comercializacao) {
        drawItemField("Comercialização / Peso ou Medida:", item.comercializacao, true);
      }
      if (item.tamanho) {
        drawItemField("Tamanho:", item.tamanho, false, false);
      }
      if (item.segmento) {
        drawItemField("Categoria:", item.segmento, false, true);
      }

      cardY += itemCardHeight + 3;
    });

    // Horizontal line above payment details
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.3);
    doc.line(24, cardY, 186, cardY);
    cardY += 5;

    // Bottom left section metadata
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    if (sale.amountReceived > 0) {
      const infoText = `PAGO: R$ ${sale.amountReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}   |   TROCO: R$ ${sale.change.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      doc.text(infoText, 24, cardY);
    } else {
      doc.text("SEM CÁLCULO DE TROCO", 24, cardY);
    }

    return startY + cardHeight;
  };

  const downloadPDFReceipt = (sale: any) => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    let y = 15;

    // Decorative Header brand
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(16, 185, 129); // emerald-500
    doc.text("RECIBO DE VENDA", 20, y);

    const currentDateStr = new Date().toLocaleDateString('pt-BR');
    const currentTimeStr = new Date().toLocaleTimeString('pt-BR');
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Gerado em: ${currentDateStr} às ${currentTimeStr}`, 190, y, { align: "right" });

    y += 5;
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.5);
    doc.line(20, y, 190, y);
    
    y += 10;

    // Draw the sale card matching UI styling perfectly
    y = drawSaleCard(doc, sale, 1, y);

    y += 12;
    // Thank you message
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9.5);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text("Muito obrigado pela preferência! 😊🥬🍍", 105, y, { align: "center" });

    // File name: recibo_[cliente]_[data].pdf
    const cleanCustomerName = (sale.customerName || "cliente")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") 
      .replace(/[^a-z0-9]/g, "-") 
      .replace(/-+/g, "-") 
      .replace(/^-|-$/g, ""); 
    
    const formattedDate = (sale.date || "")
      .split(" ")[0] 
      .replace(/\//g, "-");

    const filename = `recibo_${cleanCustomerName || "cliente"}_${formattedDate || "venda"}.pdf`;
    doc.save(filename);
  };

  const downloadPDFAllSales = () => {
    if (salesHistory.length === 0) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    let y = 15;

    // Header Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(16, 185, 129); // emerald-500
    doc.text("RELATÓRIO COMPLETO DE VENDAS", 20, y);

    const currentDateStr = new Date().toLocaleDateString('pt-BR');
    const currentTimeStr = new Date().toLocaleTimeString('pt-BR');

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Gerado em: ${currentDateStr} às ${currentTimeStr}`, 190, y, { align: "right" });

    y += 5;
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.5);
    doc.line(20, y, 190, y);
    
    y += 10;

    // Performance Overview Stats Box
    const totalRevenue = salesHistory.reduce((acc, s) => acc + (s && typeof s.total === 'number' ? s.total : 0), 0);
    
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200 border
    doc.setLineWidth(0.4);
    doc.roundedRect(20, y, 170, 18, 4, 4, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(115, 115, 115); // neutral-500
    doc.text(`Total de Vendas: ${salesHistory.length}`, 25, y + 10.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(16, 185, 129); // emerald-500
    doc.text(`Faturamento: R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 105, y + 10.5);

    y += 28;

    // Iterate through sales from latest to oldest
    salesHistory.forEach((sale, i) => {
      const orderNumber = salesHistory.length - i;
      const cardHeightEst = getSaleCardHeight(sale);

      // Overflow safe boundary check
      if (y + cardHeightEst > 275) {
        doc.addPage();
        y = 20;
      }

      // Draw the sale card exactly matching the HTML screen style!
      y = drawSaleCard(doc, sale, orderNumber, y);

      // Margin after the card before starting next one
      y += 8;
    });

    const cleanDate = currentDateStr.replace(/\//g, "-");
    const filename = `relatorio_vendas_completo_${cleanDate}.pdf`;
    doc.save(filename);
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

  // Auxiliares de pesquisa para o Histórico / Apagados
  const normalizeStr = (str: string) => {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  };

  const getAvailableSalesDates = () => {
    const allSales = [...salesHistory, ...recentlyDeletedSales].filter(Boolean);
    const datesSet = new Set<string>();
    allSales.forEach(sale => {
      if (sale && sale.date) {
        const datePart = sale.date.split(',')[0].trim(); // "28/06/2026"
        if (datePart && datePart.includes('/')) {
          datesSet.add(datePart);
        }
      }
    });
    // Converte de volta para array e ordena cronologicamente descendente (mais novas primeiro)
    const list = Array.from(datesSet);
    list.sort((a, b) => {
      const partsA = a.split('/');
      const partsB = b.split('/');
      if (partsA.length === 3 && partsB.length === 3) {
        const dateA = new Date(parseInt(partsA[2]), parseInt(partsA[1]) - 1, parseInt(partsA[0]));
        const dateB = new Date(parseInt(partsB[2]), parseInt(partsB[1]) - 1, parseInt(partsB[0]));
        return dateB.getTime() - dateA.getTime();
      }
      return 0;
    });
    return list;
  };

  const matchesSearch = (sale: any): boolean => {
    if (!sale) return false;
    
    const query = normalizeStr(historySearchText);
    const dateStr = sale.date || ''; // ex: "28/06/2026, 17:02:32"
    const customer = normalizeStr(sale.customerName || '');
    const itemsList = Array.isArray(sale.items) ? sale.items : [];

    // Verifica se a data da venda bate com a data selecionada no calendário
    // historySearchDate é "YYYY-MM-DD" e.g. "2026-06-28"
    // sale.date é "28/06/2026, 17:02:32"
    let matchesCalendarDate = true;
    if (historySearchDate && historySearchMode === 'date') {
      const parts = historySearchDate.split('-'); // ["2026", "06", "28"]
      if (parts.length === 3) {
        const expectedDateStr = `${parts[2]}/${parts[1]}/${parts[0]}`; // "28/06/2026"
        matchesCalendarDate = dateStr.includes(expectedDateStr);
      } else {
        matchesCalendarDate = false;
      }
    }

    if (historySearchMode === 'date') {
      if (historySearchDate) {
        return matchesCalendarDate;
      }
      if (query) {
        // Encontrar digitando e interpretando se o usuário quer um mês, por exemplo: "mês 06" ou "06"
        if (query.includes('mes 06') || query.includes('mes6') || query.includes('mês 06') || query === '06' || query === '6') {
          return dateStr.includes('/06/') || dateStr.includes('/6/') || dateStr.includes('06');
        }
        // Substitui traço por barra se digitarem "28-06"
        const cleanQuery = query.replace(/-/g, '/');
        return dateStr.toLowerCase().includes(cleanQuery);
      }
      return true;
    }

    if (historySearchMode === 'year') {
      if (query) {
        return dateStr.toLowerCase().includes(query);
      }
      return true;
    }

    if (historySearchMode === 'name') {
      if (query) {
        const matchCustomer = customer.includes(query);
        const matchItems = itemsList.some((item: any) => 
          item && normalizeStr(item.name || '').includes(query)
        );
        return matchCustomer || matchItems;
      }
      return true;
    }

    if (historySearchMode === 'category') {
      if (query) {
        // Busca flexível na categoria/segmento (ex: "verdura" bate com "frutas, legumes e verduras.")
        return itemsList.some((item: any) => 
          item && normalizeStr(item.segmento || '').includes(query)
        );
      }
      return true;
    }

    // Modo 'all' (Tudo)
    if (!query) return true;

    if (query) {
      const cleanQuery = query.replace(/-/g, '/');
      const matchDate = dateStr.toLowerCase().includes(cleanQuery);
      const matchCustomer = customer.includes(query);
      const matchItems = itemsList.some((item: any) => {
        if (!item) return false;
        const itemName = normalizeStr(item.name || '');
        const itemSeg = normalizeStr(item.segmento || '');
        const itemCom = normalizeStr(item.comercializacao || '');
        return itemName.includes(query) || itemSeg.includes(query) || itemCom.includes(query);
      });
      
      const isSpecialMonthSearch = query.includes('mes 06') || query.includes('mês 06');
      const matchSpecialMonth = isSpecialMonthSearch && (dateStr.includes('/06/') || dateStr.includes('06'));

      return matchDate || matchCustomer || matchItems || matchSpecialMonth;
    }

    return true;
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
                {activeTab === 'calculator' 
                  ? 'Painel de Lançamento' 
                  : activeTab === 'products' 
                    ? 'Produto' 
                    : activeTab === 'quantity' 
                      ? 'QUANTIDADE' 
                      : activeTab === 'etiqueta' 
                        ? 'Etiqueta' 
                        : activeTab === 'notafiscal'
                          ? 'NOTA FISCAL'
                          : activeTab === 'armazenagem'
                            ? 'Armazenamento & Rastreabilidade'
                            : 'Minha Venda'}
              </h2>
              <p className={cn(
                "text-[10px] font-bold text-emerald-600 tracking-widest uppercase",
                activeTab === 'calculator' || activeTab === 'notafiscal' || activeTab === 'armazenagem' ? "tracking-widest" : "tracking-wider"
              )}>
                {activeTab === 'calculator' 
                  ? 'COMERCIALIZAÇÃO DE VENDAS & ESTOQUE' 
                  : activeTab === 'products'
                    ? 'REGISTRO DE PRODUTO, CONTROLE DE QUANTIDADE DE ESTOQUE.'
                    : activeTab === 'quantity'
                      ? 'Os estoques das quantidades e das Mercadorias.'
                      : activeTab === 'etiqueta'
                        ? 'IDENTIFICAÇÃO DE PRODUTOS, CÓDIGOS DE BARRA, LOTES E VALIDADES.'
                        : activeTab === 'notafiscal'
                          ? 'DOCUMENTOS, IMPRIMIR NOTA FISCAL E DADOS.'
                          : activeTab === 'armazenagem'
                            ? 'LEITOR INTELIGENTE, BALANÇA INTEGRADA, CÂMERAS OCR E CONTROLE DE LOTES.'
                            : 'Registro de venda, histórico de venda salva.'}
              </p>
            </div>
          </div>

          {/* Abas Modernas */}
          <div className="flex flex-col bg-slate-200/60 p-1.5 rounded-2xl items-center border border-slate-200 gap-1 w-full max-w-[185px] mx-auto md:mx-0 shrink-0">
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
              onClick={() => setActiveTab('quantity')}
              className={cn(
                "px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 w-full",
                activeTab === 'quantity' 
                  ? "bg-white text-emerald-700 shadow-sm font-extrabold" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-300/40"
              )}
            >
              <Scale size={11} /> Quantidade
            </button>
            <button
              onClick={() => setActiveTab('etiqueta')}
              className={cn(
                "px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 w-full",
                activeTab === 'etiqueta' 
                  ? "bg-white text-emerald-700 shadow-sm font-extrabold" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-300/40"
              )}
            >
              <Tag size={11} /> Etiqueta
            </button>
            <button
              onClick={() => setActiveTab('notafiscal')}
              className={cn(
                "px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 w-full",
                activeTab === 'notafiscal' 
                  ? "bg-white text-emerald-700 shadow-sm font-extrabold" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-300/40"
              )}
            >
              <Receipt size={11} /> Nota Fiscal
            </button>
            <button
              onClick={() => setActiveTab('armazenagem')}
              className={cn(
                "px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 w-full",
                activeTab === 'armazenagem' 
                  ? "bg-white text-emerald-700 shadow-sm font-extrabold" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-300/40"
              )}
            >
              <Archive size={11} /> Armazenagem
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
                <div className="flex flex-col gap-2 relative">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Produto Selecionado</label>
                  <div className="relative group">
                    <input
                      id="product-name-input"
                      type="text"
                      placeholder="Ex: Tomate Cereja, Batata Doce..."
                      value={productName}
                      onFocus={() => setShowCalcProductDropdown(true)}
                      onChange={(e) => {
                        setProductName(e.target.value);
                        setShowCalcProductDropdown(true);
                      }}
                      className="w-full p-5 bg-slate-50 border-2 border-transparent rounded-[20px] focus:border-emerald-500 focus:bg-white outline-none transition-all font-bold text-slate-800 placeholder:text-slate-300 shadow-inner"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCalcProductDropdown(!showCalcProductDropdown)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition flex items-center justify-center p-1 cursor-pointer"
                    >
                      <ChevronDown size={20} className={cn("transition-transform duration-200", showCalcProductDropdown ? "rotate-180" : "")} />
                    </button>
                  </div>

                  {showCalcProductDropdown && (
                    <>
                      {/* Invisible backdrop to capture outside clicks */}
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowCalcProductDropdown(false)} 
                      />
                      <div className="absolute z-50 left-0 right-0 top-full mt-2 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-[20px] shadow-2xl divide-y divide-slate-100 p-2 animate-in fade-in slide-in-from-top-2 duration-150">
                        <div className="p-2 border-b border-slate-50 font-black text-[9px] text-slate-400 flex items-center justify-between sticky top-0 bg-white z-10">
                          <span>PRODUTOS CADASTRADOS & ESTOQUE</span>
                          <button 
                            type="button" 
                            onClick={() => setShowCalcProductDropdown(false)}
                            className="text-[10px] text-rose-500 hover:text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md transition font-bold"
                          >
                            Fechar
                          </button>
                        </div>
                        <div className="divide-y divide-slate-50">
                          {(() => {
                            const filtered = products.filter(p => 
                              p.name.toLowerCase().includes(productName.toLowerCase())
                            );

                            if (filtered.length === 0) {
                              return (
                                <div className="p-4 text-center">
                                  <span className="text-[11px] text-slate-400 font-semibold italic block">
                                    Adicionar "{productName || 'Novo Produto'}" como produto avulso.
                                  </span>
                                </div>
                              );
                            }

                            return filtered.map((p) => {
                              const q0 = p.quantity || 0;
                              const m = p.salesMerchandiseQty || 0;

                              let totalSold = 0;
                              if (m <= 0) {
                                const totalSoldInHistory = salesHistory.reduce((acc, sale) => {
                                  if (!sale?.items) return acc;

                                  const soldInSale = sale.items
                                    .filter((item: any) => (item.name || '').trim().toLowerCase() === p.name.trim().toLowerCase())
                                    .reduce(
                                      (sum: number, item: any) =>
                                        sum + Number(item.quantity || 0),
                                      0
                                    );

                                  return acc + soldInSale;
                                }, 0);

                                const totalInCurrentCart = items.reduce((acc, item) => {
                                  if (editingItemId && item.id === editingItemId) return acc;
                                  if (item.name.trim().toLowerCase() === p.name.trim().toLowerCase()) {
                                      return acc + (item.quantity || 0);
                                  }
                                  return acc;
                                }, 0);

                                totalSold = totalSoldInHistory + totalInCurrentCart;
                              } else {
                                const totalSoldInHistory = salesHistory.reduce((acc, sale) => {
                                  if (!sale?.items) return acc;
                                  return acc + obterTotalMercadoriaVendida(p, sale.items);
                                }, 0);

                                const totalInCurrentCart = obterTotalMercadoriaVendida(
                                  p,
                                  items.filter(item => !(editingItemId && item.id === editingItemId))
                                );

                                totalSold = totalSoldInHistory + totalInCurrentCart;
                              }

                              console.log("[STEP 6] totalSold calculado:", totalSold, "para o produto", p.name);

                              const { remainingQty, remainingStockItem } = calcularEstoque(q0, m, totalSold);

                              const hasStock = m <= 0 ? (remainingQty > 0) : (remainingQty > 0 || remainingStockItem > 0);

                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    setProductName(p.name);
                                    if (p.unit) setUnit(p.unit as any);
                                    if (p.weightPerUnit !== undefined) setWeightPerUnit(p.weightPerUnit);
                                    const priceToUse = (p.salePrice !== undefined && p.salePrice > 0) ? p.salePrice : p.costPrice;
                                    if (priceToUse) setPrice(priceToUse);
                                    if (p.segmento) {
                                      setSegmento(p.segmento);
                                      setSegmentoSearch(p.segmento);
                                    } else {
                                      setSegmento('');
                                      setSegmentoSearch('');
                                    }
                                    if (p.tamanho) {
                                      setTamanho(p.tamanho);
                                    } else {
                                      setTamanho('');
                                    }
                                    setShowCalcProductDropdown(false);
                                    setTimeout(() => {
                                      document.getElementById('price-input')?.focus();
                                    }, 50);
                                  }}
                                  className="w-full text-left font-semibold text-xs text-slate-700 p-3 hover:bg-emerald-50 hover:text-emerald-800 transition-colors flex items-center justify-between border-0 bg-transparent rounded-xl cursor-pointer"
                                >
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={cn(
                                        "w-2 h-2 rounded-full",
                                        hasStock ? "bg-emerald-500" : "bg-rose-500 animate-pulse"
                                      )}></span>
                                      <span className="font-extrabold text-slate-800 text-xs sm:text-[13px]">{p.name}</span>
                                      {p.tamanho && (
                                        <span className="text-[9px] font-black uppercase text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-md">
                                          {p.tamanho}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-medium">
                                    Venda: R$ {(p.salePrice || p.costPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} • {remainingQty <= 1 ? 'Quantidade' : 'Quantidades'}: {remainingQty}
                                    </span>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className={cn(
                                      "text-[10px] font-black uppercase py-1 px-2 rounded-lg border",
                                      hasStock 
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-100" 
                                        : "bg-rose-50 text-rose-700 border-rose-100"
                                    )}>
                                      Estoque: {remainingStockItem}
                                    </span>
                                  </div>
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Preço Base */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Valor do Produto</label>
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
                          onClick={() => {
                            setUnit(u.id as any);
                            // Sugestão de peso padrão ao mudar a unidade manualmente pelo usuário
                            switch (u.id) {
                              case 'kg':
                                setWeightPerUnit(1);
                                break;
                              case 'gram':
                                setWeightPerUnit(1000);
                                break;
                              default:
                                setWeightPerUnit(1);
                            }
                          }}
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
                    <div className="space-y-3 pt-4 border-t border-slate-200/60 pb-2 relative">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Comercialização Opcional</span>
                          <span className="text-[8px] bg-emerald-50 text-emerald-700 py-0.5 px-2 rounded-full font-bold uppercase">Personalize</span>
                        </div>
                        {segmento && (
                          <button 
                            type="button" 
                            onClick={() => { setSegmento(''); setSegmentoSearch(''); }}
                            className="text-[9px] font-bold text-rose-500 hover:text-rose-700 transition"
                          >
                            Limpar Categoria
                          </button>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

                        <div className="space-y-1 relative">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Menu Comercialização Categoria</label>
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Pesquisar Categoria"
                              value={showSegmentoDropdown ? segmentoSearch : (segmento || "")}
                              onFocus={() => {
                                setShowSegmentoDropdown(true);
                                setSegmentoSearch(segmento);
                              }}
                              onChange={(e) => {
                                setSegmentoSearch(e.target.value);
                              }}
                              className="w-full p-4 bg-white border-2 border-slate-100 rounded-[16px] outline-none font-bold text-sm text-slate-800 shadow-sm focus:border-emerald-500 transition-colors"
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                              <Search size={16} className="text-slate-400" />
                            </div>
                          </div>

                          {showSegmentoDropdown && (
                            <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl overflow-x-hidden divide-y divide-slate-100">
                              <div className="p-2 border-b border-slate-100 font-bold text-[9px] text-slate-400 bg-slate-50">
                                SELECIONE A CATEGORIA:
                              </div>
                              <div className="divide-y divide-slate-50">
                                {SEGM_OPTIONS.filter((opt) => 
                                  opt.toLowerCase().includes(segmentoSearch.toLowerCase())
                                ).map((opt) => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => {
                                      setSegmento(opt);
                                      setSegmentoSearch(opt);
                                      setShowSegmentoDropdown(false);
                                    }}
                                    className="w-full text-left font-semibold text-xs text-slate-700 px-4 py-2.5 hover:bg-emerald-50 hover:text-emerald-800 transition-colors duration-150 flex items-center justify-between cursor-pointer border-0 bg-transparent"
                                  >
                                    <span>{opt}</span>
                                    {segmento === opt && (
                                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                                    )}
                                  </button>
                                ))}
                                {SEGM_OPTIONS.filter((opt) => 
                                  opt.toLowerCase().includes(segmentoSearch.toLowerCase())
                                ).length === 0 && (
                                  <div className="p-4 text-center text-xs text-slate-400 italic">
                                    Nenhuma categoria encontrada...
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Nova coluna menu Tamanho abaixo das outras */}
                      <div className="mt-3.5 pt-3.5 border-t border-slate-100/50">
                        <div className="space-y-1 max-w-sm">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Tamanho</label>
                          <select
                            id="demo-tamanho-select"
                            value={tamanho}
                            onChange={(e) => setTamanho(e.target.value)}
                            className="w-full p-4 bg-white border-2 border-slate-100 rounded-[16px] outline-none font-bold text-sm text-slate-700 shadow-sm focus:border-emerald-500 transition-colors"
                          >
                            <option value="">Nenhum tamanho selecionado</option>
                            <option value="GRANDE (G)">GRANDE (G)</option>
                            <option value="MÉDIO (M)">MÉDIO (M)</option>
                            <option value="PEQUENO (P)">PEQUENO (P)</option>
                          </select>
                        </div>
                      </div>

                      {comercialUnit && (
                        <p className="text-[9px] text-slate-400 italic font-medium ml-1">
                          Será demonstrado como: <span className="font-bold text-slate-600">
                            {formatarComercializacao(comercialUnit, comercialText)}
                          </span>
                        </p>
                      )}

                      {showSegmentoDropdown && (
                        <div 
                          className="fixed inset-0 z-40 outline-none" 
                          onClick={() => setShowSegmentoDropdown(false)}
                        />
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
                                  {item.segmento && (
                                    <span className="text-amber-700 font-extrabold normal-case">Categoria: {item.segmento}</span>
                                  )}
                                  {item.tamanho && (
                                    <span className="text-blue-600 font-extrabold normal-case">Tamanho: {item.tamanho}</span>
                                  )}
                                  <span className="text-slate-400">Valor do Produto: {formatarMercadoria(item.unit === 'gram' ? 1000 : 1, item.unit)} — R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
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

                {/* CPF/CNPJ do Cliente (Opcional) */}
                <div className="space-y-1.5 mb-6 bg-white/10 p-3.5 rounded-2xl border border-white/10 w-full max-w-full overflow-hidden" style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                  <label className="text-[9px] font-black uppercase tracking-widest opacity-85 flex items-center gap-1.5 text-white">
                    <Hash size={10} /> CPF/CNPJ do Cliente (Opcional)
                  </label>
                  <input
                    id="client-doc-input-safe"
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    placeholder="Ex: 000.000.000-00"
                    value={customerDoc || ""}
                    onChange={(e) => {
                      const val = e.target.value ?? "";
                      setCustomerDoc(val);
                    }}
                    className="w-full bg-white/20 border-0 rounded-xl py-2 px-3 text-xs font-semibold text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-white/45 font-mono"
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
                            {item.segmento && (
                              <span className="text-[9px] text-amber-200 font-semibold ml-1 block">Categoria: {item.segmento}</span>
                            )}
                            {item.tamanho && (
                              <span className="text-[9px] text-blue-200 font-semibold ml-1 block">Tamanho: {item.tamanho}</span>
                            )}
                            <div className="flex flex-col ml-1 mt-1">
                              <span className="text-[8px] text-emerald-200/85 uppercase font-black tracking-wider">Valor do Produto</span>
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

                {/* Quantidade de Mercadorias de Vendas */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">QUANTIDADE DE MERCADORIAS DE VENDAS</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={productFormSalesMerchandiseQty === 0 ? '' : productFormSalesMerchandiseQty}
                    onChange={(e) => setProductFormSalesMerchandiseQty(Number(e.target.value))}
                    className="w-full py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl font-sans font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white text-xs transition-colors"
                  />
                </div>

                {/* Mercadoria de Vendas (Unidade) - Seleção Manual no Novo Produto */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1 block">MERCADORIA DE VENDAS (UNIDADE)</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {UNITS.map((u) => {
                      const Icon = u.icon;
                      const isActive = productFormUnit === u.id;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setProductFormUnit(u.id as any)}
                          className={cn(
                            "flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border border-2 transition-all duration-150 cursor-pointer",
                            isActive
                              ? "border-emerald-500 bg-emerald-50/50 text-emerald-700 font-extrabold shadow-sm"
                              : "border-slate-100 bg-slate-50 text-slate-400 opacity-75 hover:opacity-100"
                          )}
                        >
                          <Icon size={16} />
                          <span className="text-[8px] font-black tracking-tight">{u.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Peso/Medida por Unidade ou Fardo (kg) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">PESO/MEDIDA POR UNIDADE OU FARDO (kg)</label>
                  <div className="relative">
                    <Scale size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold" />
                    <input
                      type="number"
                      step="0.001"
                      placeholder="0.000"
                      value={productFormWeightPerUnit === 0 ? '' : productFormWeightPerUnit}
                      onChange={(e) => setProductFormWeightPerUnit(Number(e.target.value))}
                      className="w-full py-3 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl font-sans font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white text-xs transition-colors"
                    />
                  </div>
                </div>

                {/* Preço de Custo */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">PREÇO DE DESEMBOLSO (R$)</label>
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

                {/* Preço de Venda */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Valor do Produto</label>
                  <div className="relative">
                     <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">R$</span>
                     <input
                       type="number"
                       step="0.01"
                       placeholder="0,00"
                       value={productFormSalePrice === 0 ? '' : productFormSalePrice}
                       onChange={(e) => setProductFormSalePrice(Number(e.target.value))}
                       className="w-full py-3 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl font-sans font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white text-xs transition-colors"
                     />
                  </div>
                </div>

                {/* Empresa / Fornecedora */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Empresa / Fornecedora</label>
                  <input
                    type="text"
                    placeholder="Ex: Ambev, Nestlé, Fornecedor X..."
                    value={productFormEmpresaFornecedora}
                    onChange={(e) => setProductFormEmpresaFornecedora(e.target.value)}
                    className="w-full py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl font-sans font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white text-xs transition-colors"
                  />
                </div>

                {/* Atividade Comercial / Categoria para Cadastro de Produto */}
                <div className="space-y-1.5 relative">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Menu Comercialização Categoria Opcional</label>
                    {productFormSegmento && (
                      <button 
                        type="button" 
                        onClick={() => { setProductFormSegmento(''); setProductFormSegmentoSearch(''); }}
                        className="text-[9px] font-bold text-rose-500 hover:text-rose-700 transition"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Pesquisar Categoria"
                      value={showProductFormSegmentoDropdown ? productFormSegmentoSearch : (productFormSegmento || "")}
                      onFocus={() => {
                        setShowProductFormSegmentoDropdown(true);
                        setProductFormSegmentoSearch(productFormSegmento);
                      }}
                      onChange={(e) => {
                        setProductFormSegmentoSearch(e.target.value);
                      }}
                      className="w-full py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl font-sans font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white text-xs transition-colors"
                    />
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                      <Search size={14} />
                    </div>
                  </div>

                  {showProductFormSegmentoDropdown && (
                    <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-250 border-slate-200 rounded-xl shadow-xl divide-y divide-slate-100">
                      <div className="p-1.5 px-3 border-b border-slate-100 font-bold text-[8px] text-slate-400 bg-slate-50">
                        OPÇÕES DE CATEGORIA:
                      </div>
                      <div className="divide-y divide-slate-50">
                        {SEGM_OPTIONS.filter((opt) => 
                          opt.toLowerCase().includes(productFormSegmentoSearch.toLowerCase())
                        ).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              setProductFormSegmento(opt);
                              setProductFormSegmentoSearch(opt);
                              setShowProductFormSegmentoDropdown(false);
                            }}
                            className="w-full text-left font-semibold text-[11px] text-slate-700 px-3 py-2 cursor-pointer hover:bg-emerald-50 hover:text-emerald-800 transition-colors flex items-center justify-between border-0 bg-transparent"
                          >
                            <span>{opt}</span>
                            {productFormSegmento === opt && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                            )}
                          </button>
                        ))}
                        {SEGM_OPTIONS.filter((opt) => 
                          opt.toLowerCase().includes(productFormSegmentoSearch.toLowerCase())
                        ).length === 0 && (
                          <div className="p-3 text-center text-xs text-slate-400 italic">
                            Nenhuma categoria encontrada...
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {showProductFormSegmentoDropdown && (
                    <div 
                      className="fixed inset-0 z-40 outline-none" 
                      onClick={() => setShowProductFormSegmentoDropdown(false)}
                    />
                  )}
                </div>

                {/* Tamanho Opcional para Cadastro de Produto */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">Tamanho Opcional</label>
                    {productFormTamanho && (
                      <button 
                        type="button" 
                        onClick={() => setProductFormTamanho('')}
                        className="text-[9px] font-bold text-rose-500 hover:text-rose-700 transition"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <select
                    value={productFormTamanho}
                    onChange={(e) => setProductFormTamanho(e.target.value)}
                    className="w-full py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl font-sans font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white text-xs transition-colors cursor-pointer"
                  >
                    <option value="">Nenhum tamanho selecionado</option>
                    <option value="GRANDE (G)">GRANDE (G)</option>
                    <option value="MÉDIO (M)">MÉDIO (M)</option>
                    <option value="PEQUENO (P)">PEQUENO (P)</option>
                  </select>
                </div>

              </div>

              {/* Pré-visualização com cálculo de desembolso no formulário */}
              <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4.5 space-y-2 text-[11px] font-sans text-slate-600 shadow-inner">
                {productFormSegmento && (
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-500">Categoria:</span>
                    <span className="font-bold text-amber-700">
                      {productFormSegmento}
                    </span>
                  </div>
                )}
                {productFormTamanho && (
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-500">Tamanho:</span>
                    <span className="font-bold text-blue-600">
                      {productFormTamanho}
                    </span>
                  </div>
                )}
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
                  <span className="font-semibold text-slate-500">Preço de Desembolso:</span>
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
              {(() => {
                const filteredProducts = productsFilterSegmento
                  ? products.filter(p => p.segmento === productsFilterSegmento)
                  : products;

                return (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                          <Layers size={16} />
                        </div>
                        <h3 className="text-sm font-black text-slate-850 uppercase tracking-wider">Produtos Cadastrados ({filteredProducts.length})</h3>
                      </div>

                      {/* Filtro de Categoria */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider shrink-0">Filtrar:</span>
                        <select
                          value={productsFilterSegmento}
                          onChange={(e) => setProductsFilterSegmento(e.target.value)}
                          className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 outline-none focus:border-emerald-500 transition-colors w-32 sm:w-40 max-w-[160px] truncate cursor-pointer"
                          style={{ maxWidth: '160px' }}
                        >
                          <option value="">Todas as Categorias</option>
                          {SEGM_OPTIONS.map((opt) => (
                            <option key={opt} value={opt} className="font-sans font-semibold text-xs">
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {filteredProducts.length > 0 ? (
                      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                        {filteredProducts.map((p) => {
                          const metrics = getProductMetrics(p);
                          // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
                                  {p.empresaFornecedora && (
                                    <span className="sm:col-span-2">
                                      Empresa / Fornecedora: <span className="text-[9px] font-black tracking-wide text-indigo-800 bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-100 normal-case">{p.empresaFornecedora}</span>
                                    </span>
                                  )}
                                  {p.segmento && (
                                    <span className="sm:col-span-2">
                                      Categoria: <span className="text-[9px] font-black tracking-wide text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-100 normal-case">{p.segmento}</span>
                                    </span>
                                  )}
                                  {p.tamanho && (
                                    <span className="sm:col-span-2">
                                      Tamanho: <span className="text-[9px] font-black tracking-wide text-blue-800 bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-100 normal-case">{p.tamanho}</span>
                                    </span>
                                  )}
                                  <span>
                                    Data/Hora: <span className="text-slate-900 normal-case">{p.createdAt}</span>
                                  </span>
                                  <span className="sm:col-span-2 flex flex-col sm:flex-row sm:gap-6">
                                    <span>
                                      Preço de Desembolso: <span className="text-slate-900 normal-case">R$ {p.costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </span>
                                    <span>
                                      Valor do Produto: <span className="text-emerald-700 font-extrabold normal-case">R$ {(p.salePrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </span>
                                    {p.salePrice && p.salePrice > p.costPrice ? (() => {
                                      const lucro = p.salePrice - p.costPrice;
                                      const margem = (lucro / p.salePrice) * 100;
                                      return (
                                        <span>
                                          Lucro Estimado: <span className="text-emerald-600 font-black normal-case">R$ {lucro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({margem.toFixed(1)}%)</span>
                                        </span>
                                      );
                                    })() : null}
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
                  </>
                );
              })()}
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
      ) : activeTab === 'quantity' ? (
        <div id="quantity-tab-panel" className="space-y-8 pb-12 animate-fade-in max-w-6xl mx-auto px-2">
          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left side: Edit Stock Form */}
            <div className="lg:col-span-5 bg-white rounded-[32px] p-6 md:p-8 border border-slate-100 shadow-[0_4px_12px_rgba(0,0,0,0.08)] space-y-6 self-start">
              <div className="flex flex-col gap-1.5 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
                    <Pencil size={16} />
                  </div>
                  <h3 className="text-xs font-black text-slate-850 uppercase tracking-wider">
                    {stockEditProductId ? "Editar Estoque" : "Adicione seu Estoque"}
                  </h3>
                </div>
                {stockEditProductId && (
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    O estoque da quantidade e mercadoria de venda do produto selecionado.
                  </p>
                )}
              </div>

              {stockEditProductId ? (
                <div className="space-y-5">
                  {/* Nome do Produto (Desabilitado) */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">PRODUTO SELECIONADO</label>
                    <input
                      type="text"
                      disabled
                      value={stockEditName}
                      className="w-full py-3 px-4 bg-slate-100 border border-slate-200 rounded-xl font-sans font-bold text-slate-500 text-xs cursor-not-allowed"
                    />
                  </div>

                  {/* Menu de Comercialização Categoria (Opcional) */}
                  <div className="space-y-1.5 relative">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">CATEGORIA DO PRODUTO (MENU)</label>
                      {stockEditCategory && (
                        <button 
                          type="button" 
                          onClick={() => { setStockEditCategory(''); setStockFormSegmentoSearch(''); }}
                          className="text-[9px] font-bold text-rose-500 hover:text-rose-700 transition"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Pesquisar categoria..."
                        value={showStockFormSegmentoDropdown ? stockFormSegmentoSearch : (stockEditCategory || "")}
                        onFocus={() => {
                          setShowStockFormSegmentoDropdown(true);
                          setStockFormSegmentoSearch(stockEditCategory);
                        }}
                        onChange={(e) => {
                          setStockFormSegmentoSearch(e.target.value);
                        }}
                        className="w-full py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl font-sans font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white text-xs transition-colors"
                      />
                      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                        <Search size={14} />
                      </div>
                    </div>

                    {showStockFormSegmentoDropdown && (
                      <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl divide-y divide-slate-100">
                        <div className="p-1.5 px-3 border-b border-slate-100 font-bold text-[8px] text-slate-400 bg-slate-50">
                          OPÇÕES DE CATEGORIA:
                        </div>
                        <div className="divide-y divide-slate-50">
                          {SEGM_OPTIONS.filter((opt) => 
                            opt.toLowerCase().includes(stockFormSegmentoSearch.toLowerCase())
                          ).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                  setStockEditCategory(opt);
                                  setStockFormSegmentoSearch(opt);
                                  setShowStockFormSegmentoDropdown(false);
                              }}
                              className="w-full text-left font-semibold text-[11px] text-slate-700 px-3 py-2 cursor-pointer hover:bg-emerald-50 hover:text-emerald-800 transition-colors flex items-center justify-between border-y-0 border-x-0 bg-transparent"
                            >
                              <span>{opt}</span>
                              {stockEditCategory === opt && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                              )}
                            </button>
                          ))}
                          {SEGM_OPTIONS.filter((opt) => 
                            opt.toLowerCase().includes(stockFormSegmentoSearch.toLowerCase())
                          ).length === 0 && (
                            <div className="p-3 text-center text-xs text-slate-400 italic">
                              Nenhuma categoria encontrada...
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {showStockFormSegmentoDropdown && (
                      <div 
                        className="fixed inset-0 z-40 outline-none" 
                        onClick={() => setShowStockFormSegmentoDropdown(false)}
                      />
                    )}
                  </div>

                  {/* Quantidade do Produto (Apenas Leitura no Ajuste de Estoque) */}
                  <div className="space-y-1.5 bg-slate-50 border border-slate-200/60 rounded-2xl p-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block mb-1">
                      {stockEditQuantity > 1 ? 'Quantidades' : 'Quantidade'}
                    </label>
                    <div className="flex items-center justify-between">
                      <span className="font-sans font-black text-slate-700 text-xs">
                        {stockEditQuantity} {stockEditQuantity > 1 ? 'quantidades' : 'quantidade'}
                      </span>
                      <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-100">
                        Editar na pág. do Produto
                      </span>
                    </div>
                  </div>

                  {/* Quantidade de Mercadorias de Vendas */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">QUANTIDADE DE MERCADORIAS DE VENDAS</label>
                    <input
                      type="number"
                      placeholder="Ex: 10"
                      value={stockEditSalesMerchandiseQty === 0 ? '' : stockEditSalesMerchandiseQty}
                      onChange={(e) => setStockEditSalesMerchandiseQty(Number(e.target.value))}
                      className="w-full py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl font-sans font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white text-xs transition-colors"
                    />
                  </div>

                  {/* Mercadoria de Vendas Options */}
                  <div className="space-y-2 pt-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1 block">MERCADORIA DE VENDAS</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {UNITS.map((u) => {
                        const Icon = u.icon;
                        const isActive = stockEditUnit === u.id;
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => setStockEditUnit(u.id as any)}
                            className={cn(
                              "flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border border-2 transition-all duration-150",
                              isActive
                                ? "border-emerald-500 bg-emerald-50/50 text-emerald-700 font-extrabold shadow-sm"
                                : "border-slate-100 bg-slate-50 text-slate-400 opacity-75 hover:opacity-100"
                            )}
                          >
                            <Icon size={16} />
                            <span className="text-[8px] font-black tracking-tight">{u.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Peso/Medida por Mercadoria de Vendas Selecionada */}
                  <div className="space-y-1.5 pt-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">
                      PESO/MEDIDA POR {UNITS.find(u => u.id === stockEditUnit)?.label || 'UNIDADE'}
                    </label>
                    <div className="relative">
                      <Scale size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold" />
                      <input
                        type="number"
                        step="0.001"
                        placeholder="0.000"
                        value={stockEditWeightPerUnit === 0 ? '' : stockEditWeightPerUnit}
                        onChange={(e) => setStockEditWeightPerUnit(Number(e.target.value))}
                        className="w-full py-3 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl font-sans font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white text-xs transition-colors"
                      />
                    </div>
                  </div>

                  {/* Saving buttons */}
                  <div className="flex flex-col gap-2 pt-4 border-t border-slate-100">
                    <button
                      onClick={handleSaveStockEdit}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-[0_4px_12px_rgba(0,0,0,0.08)] flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle size={14} /> Salvar Estoque
                    </button>
                    <button
                      onClick={cancelStockEdit}
                      className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
                    >
                      Cancelar Edição
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center justify-center py-6 px-4 space-y-4">
                  <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center animate-pulse">
                    <Scale size={28} />
                  </div>
                  <div className="space-y-1 px-2">
                    <h4 className="font-sans font-bold text-slate-800 text-xs">Adicione seu Estoque</h4>
                    <p className="font-sans text-[11px] text-slate-400 font-medium leading-relaxed">
                      O produto cadastrado listado aqui tá salvo na lista de Produto, você pode criar um estoque aqui com as opções disponíveis: "quantidade", "mercadoria de venda", "tamanho".
                      <br />
                      A categoria tá visível pra pesquisar e facilitar a sua lista!
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right side: List of registered products */}
            <div className="lg:col-span-7 bg-white rounded-[32px] p-6 md:p-8 border border-slate-100 shadow-[0_4px_12px_rgba(0,0,0,0.08)] space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <h3 className="text-sm font-black text-slate-850 uppercase tracking-wider">Quantidades Cadastradas ({products.length})</h3>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  {/* Search by Name */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Pesquisar produto..."
                      value={quantitySearch}
                      onChange={(e) => setQuantitySearch(e.target.value)}
                      className="py-1.5 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 outline-none focus:border-emerald-500 transition-colors bg-white w-full sm:w-36"
                    />
                    <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                      <Search size={10} />
                    </div>
                  </div>

                  {/* Filter by Category */}
                  <select
                    value={quantityFilterCategory}
                    onChange={(e) => setQuantityFilterCategory(e.target.value)}
                    className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 outline-none focus:border-emerald-500 transition-colors w-full sm:w-40 cursor-pointer text-ellipsis overflow-hidden"
                  >
                    <option value="">Todas as Categorias</option>
                    {SEGM_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} className="font-sans font-semibold text-xs text-slate-700">
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Grid of items */}
              <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1">
                {(() => {
                  const filtered = products.filter((p) => {
                    const matchSearch = p.name.toLowerCase().includes(quantitySearch.toLowerCase());
                    const matchCategory = quantityFilterCategory ? p.segmento === quantityFilterCategory : true;
                    return matchSearch && matchCategory;
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="p-8 text-center text-xs text-slate-400 italic">
                        Nenhum produto cadastrado corresponde aos critérios de pesquisa.
                      </div>
                    );
                  }

                  return filtered.map((p) => {
                    const q0 = p.quantity || 0;
                    const m = p.salesMerchandiseQty || 0;

                    let totalSold = 0;
                    if (m <= 0) {
                      totalSold = salesHistory.reduce((acc, sale) => {
                        if (!sale?.items) return acc;

                        const soldInSale = sale.items
                          .filter((item: any) =>
                            (item.name || "").trim().toLowerCase() ===
                            p.name.trim().toLowerCase()
                          )
                          .reduce(
                            (sum: number, item: any) =>
                              sum + Number(item.quantity || 0),
                            0
                          );

                        return acc + soldInSale;
                      }, 0);
                    } else {
                      totalSold = salesHistory.reduce((acc, sale) => {
                        if (!sale?.items) return acc;
                        return acc + obterTotalMercadoriaVendida(p, sale.items);
                      }, 0);
                    }

                    console.log("TOTAL SOLD CALCULADO", totalSold);

                    const { 
                      remainingQty: remaining, 
                      remainingStockItem: remainingSalesMerchandiseQty,
                      soldQtyUnit
                    } = calcularEstoque(q0, m, totalSold);

                    console.log(
                      "[ESTOQUE]",
                      {
                        produto: p.name,
                        quantidadeInicial: q0,
                        mercadoriaPorLote: m,
                        totalSold,
                        soldQtyUnit,
                        remaining,
                        remainingSalesMerchandiseQty
                      }
                    );

                    return (
                      <div 
                        key={p.id} 
                        className={cn(
                          "p-4 rounded-2xl border transition-all duration-250 flex items-center justify-between gap-4 shadow-sm",
                          stockEditProductId === p.id 
                            ? "border-emerald-400 bg-emerald-50/20 ring-2 ring-emerald-100" 
                            : "border-slate-100 hover:border-slate-200/80 bg-slate-50/30"
                        )}
                      >
                        <div className="space-y-2 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-sans font-black text-slate-800 text-xs tracking-tight">{p.name}</span>
                            {p.segmento && (
                              <span className="text-[8px] font-black tracking-wide text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100/50 uppercase">
                                {p.segmento}
                              </span>
                            )}
                          </div>

                          {/* Inventory numbers row with Portuguese label specifications */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1.5 border-t border-slate-100/40">
                            {/* Group: Adição */}
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-black tracking-widest text-slate-400 uppercase">Adição</span>
                                <div className="h-[1px] bg-slate-100/80 flex-1"></div>
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                {/* Quantidade Gray */}
                                <div className="bg-slate-100/80 border border-slate-200/40 rounded-xl p-2 text-center flex flex-col justify-center min-h-[62px] transition-all">
                                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">
                                    {p.quantity > 1 ? 'Quantidades' : 'Quantidade'}
                                  </span>
                                  <span className="font-bold text-[10.5px] text-slate-600 block leading-tight">
                                    {p.quantity} {p.quantity > 1 ? 'quantidades' : 'quantidade'}
                                  </span>
                                </div>

                                {/* Sold count (rose) */}
                                <div className="bg-rose-100/60 border border-rose-300/80 rounded-xl p-2 text-center flex flex-col justify-center min-h-[62px] transition-all">
                                  <span className="text-[8px] font-bold text-rose-500 uppercase tracking-widest block mb-0.5">
                                    {soldQtyUnit === 1 ? 'Vendido' : 'Vendidos'}
                                  </span>
                                  {m <= 0 ? (
                                    <span className="font-bold text-[10.5px] text-rose-800 block leading-tight">
                                      {soldQtyUnit} {soldQtyUnit === 1 ? 'quantidade' : 'quantidades'}
                                    </span>
                                  ) : (
                                    <div className="flex flex-col items-center justify-center w-full">
                                      <span className="font-bold text-[10px] text-rose-800 block leading-tight">
                                        {soldQtyUnit} {soldQtyUnit === 1 ? 'quantidade' : 'quantidades'}
                                      </span>
                                      <div className="h-[1px] bg-rose-300/40 my-0.5 w-full"></div>
                                      <span className="font-bold text-[9px] text-rose-700 block leading-tight">
                                        {totalSold} {totalSold === 1 ? 'mercadoria de Venda' : 'mercadorias de vendas'}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Group: Estoque */}
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-black tracking-widest text-slate-400 uppercase">Estoque</span>
                                <div className="h-[1px] bg-slate-100/80 flex-1"></div>
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                {/* Quantidade Green (was Contagem) */}
                                <div className={cn(
                                  "border rounded-xl p-2 text-center flex flex-col justify-center min-h-[62px] transition-all",
                                  remaining > 0 
                                    ? "bg-emerald-50 border-emerald-200/80 text-emerald-800" 
                                    : "bg-slate-100/95 border-slate-200 text-slate-500"
                                )}>
                                  <span className="text-[8px] font-bold uppercase tracking-widest block mb-0.5">
                                    {remaining > 1 ? 'Quantidades' : 'Quantidade'}
                                  </span>
                                  <span className="font-black text-[10.5px] block leading-tight">
                                    {remaining} {remaining > 1 ? 'quantidades' : 'quantidade'}
                                  </span>
                                </div>

                                {/* Mercadoria de Venda (blue) */}
                                <div className="bg-blue-50/70 border border-blue-200/70 rounded-xl p-2 text-center text-blue-800 flex flex-col justify-center min-h-[62px] transition-all">
                                  <span className="text-[8px] font-bold uppercase tracking-widest block mb-0.5">
                                    {remainingSalesMerchandiseQty > 1 ? 'Mercadorias de Vendas' : 'Mercadoria de Venda'}
                                  </span>
                                  <span className="font-extrabold text-[10.5px] block leading-tight">
                                    {remainingSalesMerchandiseQty} {formatUnitLabel(remainingSalesMerchandiseQty, p.unit)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Pencil Edit button */}
                        <div className="shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setStockEditProductId(p.id);
                              setStockEditName(p.name);
                              setStockEditQuantity(p.quantity);
                              setStockEditUnit(p.unit);
                              setStockEditCategory(p.segmento || '');
                              setStockFormSegmentoSearch(p.segmento || '');
                              setStockEditSalesMerchandiseQty(p.salesMerchandiseQty || 0);
                              setStockEditWeightPerUnit(p.weightPerUnit || 0);
                            }}
                            className="w-8 h-8 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors shadow-sm"
                            title="Editar estoque do produto"
                          >
                            <Pencil size={12} className="text-slate-500" />
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'history' ? (
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
              {salesHistory.length > 0 || recentlyDeletedSales.length > 0 ? (
                <>
                  {salesHistory.length > 0 && (
                    <button
                      onClick={copyAllSalesText}
                      className="py-2.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all w-full text-center font-bold border-0 flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Copy size={12} /> Copiar Lista Completa / Recibos
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsDeletedManagerOpen(true);
                    }}
                    className="py-2.5 px-6 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all w-full text-center font-bold border-0 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 size={12} /> Histórico de Apagados {recentlyDeletedSales.length > 0 && `(${recentlyDeletedSales.length})`}
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
                                Valor do Produto: <span className="text-slate-900 font-bold">R$ {itemPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
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

                              {item.segmento && (
                                <span className="text-[10px] text-slate-500 font-semibold block">
                                  Categoria: <span className="text-amber-700 font-extrabold">{item.segmento}</span>
                                </span>
                              )}

                              {item.tamanho && (
                                <span className="text-[10px] text-slate-500 font-semibold block">
                                  Tamanho: <span className="text-blue-600 font-extrabold">{item.tamanho}</span>
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
                      
                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          onClick={() => copyReceiptText(sale)}
                          className="py-2.5 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 shadow-sm shadow-emerald-100 border-0 cursor-pointer"
                        >
                          <Copy size={12} /> Copiar Minha Venda / Recibo
                        </button>
                        <button
                          onClick={() => deleteSaleFromHistory(sale.id)}
                          className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-red-500 rounded-xl transition-all bg-transparent border-0 cursor-pointer"
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

          {/* Modal / Página Aba Abertura para Gestão de Histórico e Apagados */}
          <AnimatePresence>
            {isDeletedManagerOpen && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-[#F4F5F7] flex flex-col overflow-hidden"
                onClick={() => setIsDeletedManagerOpen(false)}
              >
                <motion.div 
                  initial={{ y: "100%", opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: "100%", opacity: 0 }}
                  transition={{ type: "spring", damping: 30, stiffness: 200 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full h-full flex flex-col pointer-events-auto bg-[#F4F5F7]"
                >
                  {/* Header do Modal */}
                  <div className="bg-white border-b border-slate-200 shadow-sm shrink-0">
                    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-black text-slate-900 flex items-center gap-2.5">
                          <Archive className="text-red-500" size={24} />
                          Gerenciador de Histórico & Apagados
                        </h3>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
                          Consulte e gerencie a memória de vendas ativas e excluídas
                        </p>
                      </div>
                      <button 
                        onClick={() => setIsDeletedManagerOpen(false)}
                        className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all border-0 cursor-pointer flex items-center gap-1.5"
                      >
                        <X size={16} /> Fechar Página
                      </button>
                    </div>
                  </div>

                  {/* Tabs Selector: Lista Atual vs Histórico de Apagados */}
                  <div className="bg-white border-b border-slate-200 shrink-0">
                    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-1.5 flex gap-6">
                      <button
                        onClick={() => setManagerActiveTab('current')}
                        className={cn(
                          "pb-3 pt-2 text-xs font-black uppercase tracking-wider border-b-2 border-transparent transition-all border-0 cursor-pointer bg-transparent",
                          managerActiveTab === 'current' 
                            ? "border-red-500 text-red-600 font-extrabold" 
                            : "text-slate-400 hover:text-slate-600"
                        )}
                      >
                        Lista Atual ({salesHistory.length})
                      </button>
                      <button
                        onClick={() => setManagerActiveTab('deleted')}
                        className={cn(
                          "pb-3 pt-2 text-xs font-black uppercase tracking-wider border-b-2 border-transparent transition-all border-0 cursor-pointer bg-transparent",
                          managerActiveTab === 'deleted' 
                            ? "border-red-500 text-red-600 font-extrabold" 
                            : "text-slate-400 hover:text-slate-600"
                        )}
                      >
                        Histórico de Apagados ({recentlyDeletedSales.length})
                      </button>
                    </div>
                  </div>

                  {/* Coluna Modo de Pesquisa */}
                  <div className="bg-slate-100/70 border-b border-slate-200 shrink-0">
                    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      {/* Dropdown de Seleção para Modo de Pesquisa */}
                      <div className="md:col-span-4 flex flex-col gap-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                          Modo de pesquisa:
                        </span>
                        <div className="relative">
                          <select
                            value={historySearchMode}
                            onChange={(e) => {
                              setHistorySearchMode(e.target.value as any);
                            }}
                            className="w-full py-3 pl-10 pr-10 bg-white border border-slate-200 rounded-xl font-sans font-bold text-slate-700 text-xs focus:outline-none focus:border-red-500 shadow-sm appearance-none cursor-pointer"
                          >
                            <option value="all">🔍 Tudo (Geral)</option>
                            <option value="date">📅 Por Data</option>
                            <option value="year">📅 Por Ano</option>
                            <option value="name">👤 Por Nome</option>
                            <option value="category">🏷️ Por Categoria</option>
                          </select>
                          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                            <ChevronDown size={14} />
                          </div>
                          {/* Left icon inside the dropdown */}
                          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                            {historySearchMode === 'all' && <Search size={14} />}
                            {historySearchMode === 'date' && <Calendar size={14} />}
                            {historySearchMode === 'year' && <Calendar size={14} />}
                            {historySearchMode === 'name' && <User size={14} />}
                            {historySearchMode === 'category' && <Tag size={14} />}
                          </div>
                        </div>
                      </div>

                      {/* Input de Busca ou Filtro */}
                      <div className="md:col-span-8 flex flex-col gap-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                          Filtro ou Busca:
                        </span>
                        <div className="flex flex-col sm:flex-row gap-3">
                          {/* Text Search Input */}
                          <div className="flex-1 relative">
                            <input
                              type="text"
                              placeholder={
                                historySearchMode === 'date' 
                                  ? "Digite a data (ex: 28/06, 06) ou use os seletores..." 
                                  : historySearchMode === 'year'
                                  ? "Digite o ano (ex: 2026)..."
                                  : historySearchMode === 'category'
                                  ? "Escreva a categoria (ex: verdura, frutas)..."
                                  : historySearchMode === 'name'
                                  ? "Digite o nome do cliente ou produto..."
                                  : "Pesquisar por nome, categoria, data ou ano..."
                              }
                              value={historySearchText}
                              onChange={(e) => setHistorySearchText(e.target.value)}
                              className="w-full py-3 pl-10 pr-10 bg-white border border-slate-200 rounded-xl font-sans font-semibold text-slate-800 focus:outline-none focus:border-red-500 text-xs transition-colors shadow-sm"
                            />
                            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            
                            {historySearchText && (
                              <button
                                type="button"
                                onClick={() => setHistorySearchText('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full cursor-pointer border-0"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>

                          {/* Date Picker (Calendar) - Shows if 'date' is selected */}
                          {historySearchMode === 'date' && (
                            <div className="flex gap-2 items-center shrink-0">
                              <div className="relative">
                                <input
                                  type="date"
                                  value={historySearchDate}
                                  onChange={(e) => setHistorySearchDate(e.target.value)}
                                  className="py-3 px-4 bg-white border border-slate-200 rounded-xl font-sans font-semibold text-slate-800 focus:outline-none focus:border-red-500 text-xs transition-colors shadow-sm cursor-pointer"
                                />
                              </div>

                              {historySearchDate && (
                                <button
                                  type="button"
                                  onClick={() => setHistorySearchDate('')}
                                  title="Limpar data"
                                  className="py-3 px-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-xl font-black text-[10px] uppercase tracking-wider transition-colors flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <X size={12} /> Limpar
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Novo: Calendário de datas disponíveis com vendas reais */}
                    {historySearchMode === 'date' && (
                      <div className="bg-white p-4 rounded-2xl border border-slate-200/60 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-bold">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            Selecione uma Data com Venda Ativa:
                          </span>
                          
                          {historySearchDate && (
                            <button
                              type="button"
                              onClick={() => setHistorySearchDate('')}
                              className="text-[10px] text-red-500 hover:text-red-700 font-extrabold flex items-center gap-1 cursor-pointer border-0 bg-transparent"
                            >
                              <X size={12} /> Mostrar Todas as Datas
                            </button>
                          )}
                        </div>
                        
                        {(() => {
                          const availableDates = getAvailableSalesDates();
                          if (availableDates.length === 0) {
                            return (
                              <p className="text-xs text-slate-400 font-medium italic">
                                Nenhuma data com registro de venda encontrado.
                              </p>
                            );
                          }
                          return (
                            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
                              {availableDates.map((dateStr) => {
                                const parts = dateStr.split('/');
                                const dateISO = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                                const isSelected = historySearchDate === dateISO;
                                return (
                                  <button
                                    key={dateStr}
                                    type="button"
                                    onClick={() => {
                                      setHistorySearchDate(dateISO);
                                    }}
                                    className={cn(
                                      "px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5",
                                      isSelected
                                        ? "bg-red-500 text-white border-red-500 shadow-sm font-black"
                                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                                    )}
                                  >
                                    <Calendar size={12} className={isSelected ? "text-white" : "text-red-500"} />
                                    {dateStr}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Quick helper indicator for calendar available date */}
                    {historySearchMode === 'date' && historySearchDate && (
                      <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1.5 pl-1 bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Mostrando registros de: <strong>{new Date(historySearchDate + 'T00:00:00').toLocaleDateString('pt-BR')}</strong>.</span>
                      </div>
                    )}
                    </div>
                  </div>

                  {/* Conteúdo do Modal */}
                  <div className="flex-1 overflow-y-auto">
                    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
                      {managerActiveTab === 'current' ? (
                      <>
                        {/* Ações para a Lista Atual */}
                        <div className="bg-white rounded-2xl p-4 border border-slate-100 flex flex-wrap gap-2.5 items-center justify-between">
                          <div className="flex items-center gap-3">
                            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                              <input 
                                type="checkbox"
                                checked={salesHistory.filter(matchesSearch).length > 0 && salesHistory.filter(matchesSearch).every(s => s && selectedCurrentSales.includes(s.id))}
                                ref={input => {
                                  if (input) {
                                    const visible = salesHistory.filter(matchesSearch).filter(Boolean);
                                    const selectedCount = visible.filter(s => selectedCurrentSales.includes(s.id)).length;
                                    input.indeterminate = selectedCount > 0 && selectedCount < visible.length;
                                  }
                                }}
                                onChange={toggleSelectAllCurrentSales}
                                className="w-5 h-5 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer accent-red-600 shrink-0"
                              />
                              <span className="text-xs font-bold text-slate-700">Selecionar todos</span>
                            </label>
                            <span className="text-slate-300">|</span>
                            <span className="text-xs text-slate-500 font-semibold">
                              {selectedCurrentSales.length} {selectedCurrentSales.length === 1 ? 'item selecionado' : 'itens selecionados'}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={deleteSelectedCurrentSales}
                              disabled={selectedCurrentSales.length === 0}
                              className={cn(
                                "py-2 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider border-0 transition-all flex items-center gap-1.5 cursor-pointer",
                                selectedCurrentSales.length > 0 
                                  ? "bg-red-500 text-white hover:bg-red-600" 
                                  : "bg-slate-100 text-slate-300 cursor-not-allowed"
                              )}
                            >
                              Apagar Selecionados
                            </button>
                          </div>
                        </div>

                        {/* Listagem da Lista Atual */}
                        {salesHistory.length > 0 ? (
                          salesHistory.filter(matchesSearch).length > 0 ? (
                            <div className="space-y-3">
                              {salesHistory.filter(matchesSearch).map((sale) => {
                                if (!sale) return null;
                                const saleItems = Array.isArray(sale.items) ? sale.items : [];
                                const isChecked = selectedCurrentSales.includes(sale.id);
                                return (
                                  <div 
                                    key={sale.id}
                                    onClick={() => toggleCurrentSaleSelection(sale.id)}
                                    className={cn(
                                      "p-4 rounded-2xl border transition-all flex items-start gap-4 cursor-pointer bg-white text-left",
                                      isChecked ? "border-red-200 bg-red-50/20" : "border-slate-100 hover:border-slate-200"
                                    )}
                                  >
                                    {/* Caixa Quadrada Checkbox */}
                                    <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                                      <input 
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleCurrentSaleSelection(sale.id)}
                                        className="w-5 h-5 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer accent-red-600 shrink-0"
                                      />
                                    </div>

                                    <div className="flex-1 space-y-3">
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <h4 className="font-extrabold text-sm text-slate-800">
                                            {sale.customerName || 'Cliente sem nome'}
                                          </h4>
                                          <div className="flex flex-wrap gap-2 items-center mt-1">
                                            <span className="text-[10px] text-slate-400 font-bold">
                                              {sale.date}
                                            </span>
                                            {sale.paymentMethod && (
                                              <span className="inline-flex items-center text-[8px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200/60">
                                                {obterLabelPagamento(sale.paymentMethod)}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <span className="text-[9px] text-slate-400 font-bold block">TOTAL PEDIDO</span>
                                          <span className="font-black text-base text-emerald-600">
                                            R$ {Number(sale.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                          </span>
                                        </div>
                                      </div>
                                      
                                      {/* Lista de itens completa do Pedido */}
                                      <div className="space-y-2 pt-2 border-t border-slate-100">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                                          Lista Completa de Produtos ({saleItems.length}):
                                        </span>
                                        <div className="grid grid-cols-1 gap-2">
                                          {saleItems.map((item: any, idx: number) => {
                                            if (!item) return null;
                                            const itemTotal = typeof item.total === 'number' ? item.total : 0;
                                            const itemPrice = typeof item.price === 'number' ? item.price : 0;
                                            return (
                                              <div key={item.id || idx} className="text-[11px] bg-slate-50 rounded-xl p-3 border border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 font-sans hover:bg-slate-100/50 transition-colors">
                                                <div className="space-y-0.5">
                                                  <div className="font-bold text-slate-800">
                                                    {item.name || 'Produto'}
                                                  </div>
                                                  <div className="text-slate-500 font-medium flex flex-wrap gap-x-2">
                                                    <span>Qtd: <strong className="text-slate-800 font-bold">{item.quantity}</strong></span>
                                                    <span>Valor do Produto: <strong className="text-slate-800 font-bold">R$ {itemPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
                                                    <span>Peso/Medida: <strong className="text-slate-800 font-bold">{formatarMercadoria(item.weightPerUnit, item.unit || 'unit')}</strong></span>
                                                  </div>
                                                  {(item.comercializacao || item.segmento || item.tamanho) && (
                                                    <div className="text-[10px] text-slate-400 font-medium flex flex-wrap gap-x-2">
                                                      {item.comercializacao && <span>Medida Comercial: <strong className="text-slate-600 font-semibold">{item.comercializacao}</strong></span>}
                                                      {item.segmento && <span>Categoria: <strong className="text-slate-600 font-semibold">{item.segmento}</strong></span>}
                                                      {item.tamanho && <span>Tamanho: <strong className="text-slate-600 font-semibold">{item.tamanho}</strong></span>}
                                                    </div>
                                                  )}
                                                </div>
                                                <div className="sm:text-right shrink-0">
                                                  <span className="text-[9px] text-slate-400 font-medium block">SUBTOTAL</span>
                                                  <span className="text-emerald-600 font-extrabold">R$ {itemTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 flex flex-col items-center justify-center gap-2">
                              <Search className="text-slate-300 animate-bounce" size={32} />
                              <span className="text-sm text-slate-400 font-bold block">Nenhum resultado encontrado</span>
                              <p className="text-xs text-slate-400 max-w-xs font-medium text-center">
                                Não encontramos nenhuma venda ativa que corresponda aos filtros de pesquisa atuais.
                              </p>
                            </div>
                          )
                        ) : (
                          <div className="text-center py-12 bg-white rounded-3xl border border-slate-100">
                            <span className="text-sm text-slate-400 font-bold block">Nenhuma venda ativa no histórico</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Ações para a Lista Apagadas Recentes */}
                        <div className="bg-white rounded-2xl p-4 border border-slate-100 flex flex-wrap gap-2.5 items-center justify-between">
                          <div className="flex items-center gap-3">
                            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                              <input 
                                type="checkbox"
                                checked={recentlyDeletedSales.filter(matchesSearch).length > 0 && recentlyDeletedSales.filter(matchesSearch).every(s => s && selectedDeletedSales.includes(s.id))}
                                ref={input => {
                                  if (input) {
                                    const visible = recentlyDeletedSales.filter(matchesSearch).filter(Boolean);
                                    const selectedCount = visible.filter(s => selectedDeletedSales.includes(s.id)).length;
                                    input.indeterminate = selectedCount > 0 && selectedCount < visible.length;
                                  }
                                }}
                                onChange={toggleSelectAllDeletedSales}
                                className="w-5 h-5 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer accent-red-600 shrink-0"
                              />
                              <span className="text-xs font-bold text-slate-700">Selecionar todos</span>
                            </label>
                            <span className="text-slate-300">|</span>
                            <span className="text-xs text-slate-500 font-semibold">
                              {selectedDeletedSales.length} {selectedDeletedSales.length === 1 ? 'item selecionado' : 'itens selecionados'}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={restoreSelectedDeletedSales}
                              disabled={selectedDeletedSales.length === 0}
                              className={cn(
                                "py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider border-0 transition-all flex items-center gap-1.5 cursor-pointer",
                                selectedDeletedSales.length > 0 
                                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" 
                                  : "bg-slate-100 text-slate-300 cursor-not-allowed"
                              )}
                            >
                              <RotateCcw size={10} /> Restaurar Selecionados
                            </button>
                            <button
                              onClick={deleteSelectedDeletedSalesPermanently}
                              disabled={selectedDeletedSales.length === 0}
                              className={cn(
                                "py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider border-0 transition-all flex items-center gap-1.5 cursor-pointer",
                                selectedDeletedSales.length > 0 
                                  ? "bg-red-600 text-white hover:bg-red-700" 
                                  : "bg-slate-100 text-slate-300 cursor-not-allowed"
                              )}
                            >
                              Apagar Selecionados
                            </button>
                          </div>
                        </div>

                         {/* Listagem da Lista Apagadas Recentes */}
                        {recentlyDeletedSales.length > 0 ? (
                          recentlyDeletedSales.filter(matchesSearch).length > 0 ? (
                            <div className="space-y-3">
                              {recentlyDeletedSales.filter(matchesSearch).map((sale) => {
                                if (!sale) return null;
                                const saleItems = Array.isArray(sale.items) ? sale.items : [];
                                const isChecked = selectedDeletedSales.includes(sale.id);
                                return (
                                  <div 
                                    key={sale.id}
                                    onClick={() => toggleDeletedSaleSelection(sale.id)}
                                    className={cn(
                                      "p-4 rounded-2xl border transition-all flex items-start gap-4 cursor-pointer bg-white text-left",
                                      isChecked ? "border-rose-200 bg-rose-50/20" : "border-slate-100 hover:border-slate-200"
                                    )}
                                  >
                                    {/* Caixa Quadrada Checkbox */}
                                    <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                                      <input 
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleDeletedSaleSelection(sale.id)}
                                        className="w-5 h-5 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer accent-red-600 shrink-0"
                                      />
                                    </div>

                                    <div className="flex-1 space-y-3">
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <h4 className="font-extrabold text-sm text-slate-800">
                                            {sale.customerName || 'Cliente sem nome'}
                                          </h4>
                                          <div className="flex flex-wrap gap-2 items-center mt-1">
                                            <span className="text-[10px] text-slate-400 font-bold">
                                              {sale.date}
                                            </span>
                                            {sale.paymentMethod && (
                                              <span className="inline-flex items-center text-[8px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200/60">
                                                {obterLabelPagamento(sale.paymentMethod)}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <span className="text-[9px] text-slate-400 font-bold block">TOTAL PEDIDO</span>
                                          <span className="font-black text-base text-rose-600">
                                            R$ {Number(sale.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                          </span>
                                        </div>
                                      </div>
                                      
                                      {/* Lista de itens completa do Pedido Apagado */}
                                      <div className="space-y-2 pt-2 border-t border-slate-100">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                                          Lista Completa de Produtos ({saleItems.length}):
                                        </span>
                                        <div className="grid grid-cols-1 gap-2">
                                          {saleItems.map((item: any, idx: number) => {
                                            if (!item) return null;
                                            const itemTotal = typeof item.total === 'number' ? item.total : 0;
                                            const itemPrice = typeof item.price === 'number' ? item.price : 0;
                                            return (
                                              <div key={item.id || idx} className="text-[11px] bg-slate-50 rounded-xl p-3 border border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 font-sans hover:bg-slate-100/50 transition-colors">
                                                <div className="space-y-0.5">
                                                  <div className="font-bold text-slate-800">
                                                    {item.name || 'Produto'}
                                                  </div>
                                                  <div className="text-slate-500 font-medium flex flex-wrap gap-x-2">
                                                    <span>Qtd: <strong className="text-slate-800 font-bold">{item.quantity}</strong></span>
                                                    <span>Valor do Produto: <strong className="text-slate-800 font-bold">R$ {itemPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
                                                    <span>Peso/Medida: <strong className="text-slate-800 font-bold">{formatarMercadoria(item.weightPerUnit, item.unit || 'unit')}</strong></span>
                                                  </div>
                                                  {(item.comercializacao || item.segmento || item.tamanho) && (
                                                    <div className="text-[10px] text-slate-400 font-medium flex flex-wrap gap-x-2">
                                                      {item.comercializacao && <span>Medida Comercial: <strong className="text-slate-600 font-semibold">{item.comercializacao}</strong></span>}
                                                      {item.segmento && <span>Categoria: <strong className="text-slate-600 font-semibold">{item.segmento}</strong></span>}
                                                      {item.tamanho && <span>Tamanho: <strong className="text-slate-600 font-semibold">{item.tamanho}</strong></span>}
                                                    </div>
                                                  )}
                                                </div>
                                                <div className="sm:text-right shrink-0">
                                                  <span className="text-[9px] text-slate-400 font-medium block">SUBTOTAL</span>
                                                  <span className="text-rose-600 font-extrabold">R$ {itemTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 flex flex-col items-center justify-center gap-2">
                              <Search className="text-slate-300 animate-bounce" size={32} />
                              <span className="text-sm text-slate-400 font-bold block">Nenhum resultado encontrado</span>
                              <p className="text-xs text-slate-400 max-w-xs font-medium text-center">
                                Não encontramos nenhuma venda apagada que corresponda aos filtros de pesquisa atuais.
                              </p>
                            </div>
                          )
                        ) : (
                          <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 flex flex-col items-center justify-center gap-3">
                            <span className="text-sm text-slate-400 font-bold">Histórico de Apagados vazio</span>
                            <p className="text-xs text-slate-400 max-w-xs font-medium text-center">
                              Vendas apagadas do histórico serão guardadas temporariamente no histórico de apagados.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                    </div>
                  </div>


                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : activeTab === 'etiqueta' ? (
        <div id="etiqueta-tab-panel" className="space-y-6 max-w-6xl mx-auto pb-12 animate-fade-in px-2">
          {/* Header/Stats Cards for Etiqueta */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-bold text-lg">
                <Tag size={20} className="text-emerald-600" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Produtos em Estoque</span>
                <span className="text-xl font-black text-slate-900">
                  {products.length} {products.length === 1 ? 'produto' : 'produtos'}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-100 flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-bold text-lg font-sans">
                R$
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Desembolso Total</span>
                <span className="text-xl font-black text-slate-900">
                  R$ {products.reduce((acc, p) => acc + (Number(p.costPrice || 0) * Number(p.quantity || 0)), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* List of Products and their Labels */}
          <div className="bg-white rounded-[32px] p-6 md:p-8 border border-slate-100 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-extrabold text-slate-800">Controle de Identificação de Estoque</h3>
                <p className="text-xs text-slate-400 font-medium">Cadastre etiquetas, lotes, fotos e códigos de barra para cada produto.</p>
              </div>

              {/* Filters for Etiqueta List */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {/* Search by Product Name */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Pesquisar produto..."
                    value={etiquetaSearch}
                    onChange={(e) => setEtiquetaSearch(e.target.value)}
                    className="py-1.5 pl-8 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 outline-none focus:border-emerald-500 transition-colors bg-white w-full sm:w-36"
                  />
                  <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <Search size={10} />
                  </div>
                </div>

                {/* Filter by Category (Pesquisar Categoria) */}
                <select
                  value={etiquetaFilterCategory}
                  onChange={(e) => setEtiquetaFilterCategory(e.target.value)}
                  className="py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 outline-none focus:border-emerald-500 transition-colors w-full sm:w-40 cursor-pointer text-ellipsis overflow-hidden"
                >
                  <option value="">Pesquisar Categoria</option>
                  {SEGM_OPTIONS.map((opt) => (
                    <option key={opt} value={opt} className="font-sans font-semibold text-xs text-slate-700">
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {(() => {
              const filteredEtiquetaProducts = products.filter((p) => {
                const matchSearch = p.name.toLowerCase().includes(etiquetaSearch.toLowerCase());
                const matchCategory = etiquetaFilterCategory ? p.segmento === etiquetaFilterCategory : true;
                return matchSearch && matchCategory;
              });

              if (filteredEtiquetaProducts.length > 0) {
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredEtiquetaProducts.map((p) => {
                      const totalDesembolso = Number(p.costPrice || 0) * Number(p.quantity || 0);
                      const q0 = p.quantity || 0;
                      const m = p.salesMerchandiseQty || 0;

                      let totalSold = 0;
                      if (m <= 0) {
                        totalSold = salesHistory.reduce((acc, sale) => {
                          if (!sale?.items) return acc;

                          const soldInSale = sale.items
                            .filter((item: any) =>
                              (item.name || "").trim().toLowerCase() ===
                              p.name.trim().toLowerCase()
                            )
                            .reduce(
                              (sum: number, item: any) =>
                                sum + Number(item.quantity || 0),
                              0
                            );

                          return acc + soldInSale;
                        }, 0);
                      } else {
                        totalSold = salesHistory.reduce((acc, sale) => {
                          if (!sale?.items) return acc;
                          return acc + obterTotalMercadoriaVendida(p, sale.items);
                        }, 0);
                      }

                      const { 
                        remainingQty: remaining, 
                        remainingStockItem: remainingSalesMerchandiseQty,
                        soldQtyUnit
                      } = calcularEstoque(q0, m, totalSold);

                      return (
                        <div key={p.id} className="bg-slate-50 rounded-2xl p-5 border border-slate-200/60 hover:border-slate-300 hover:shadow-md transition-all flex flex-col justify-between gap-5">
                          {/* Name and Header of Card */}
                          <div className="space-y-4">
                            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                              <div className="truncate flex-1">
                                <span className="text-[8px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider border border-indigo-100/50 block w-max max-w-full truncate">
                                  {p.segmento || 'Sem categoria'}
                                </span>
                                <h4 className="text-base font-black text-slate-800 tracking-tight mt-1 truncate" title={p.name}>
                                  {p.name}
                                </h4>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-[8px] text-slate-400 font-black block">DESEMBOLSO</span>
                                <span className="text-xs font-black text-emerald-600">
                                  R$ {totalDesembolso.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>

                            {/* Informações da Página de Produto */}
                            <div className="bg-white rounded-xl p-3.5 border border-slate-100 space-y-3">
                              <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest block border-b border-slate-50 pb-1">
                                Informações do Produto
                              </span>
                              <div className="flex flex-col gap-3 font-sans">
                                {/* NOME DO PRODUTO */}
                                <div className="flex flex-col gap-1 border-b border-dashed border-slate-100 pb-1.5">
                                  <span className="text-slate-400 text-[8.5px] font-black uppercase tracking-wider block">
                                    NOME DO PRODUTO
                                  </span>
                                  <strong className="text-slate-800 normal-case text-xs font-bold leading-normal">
                                    {p.name}
                                  </strong>
                                </div>

                                {/* QUANTIDADE DO PRODUTO (VALOR DO PREÇO UNITÁRIO) */}
                                <div className="flex flex-col gap-1 border-b border-dashed border-slate-100 pb-1.5">
                                  <span className="text-slate-400 text-[8.5px] font-black uppercase tracking-wider block">
                                    QUANTIDADE DO PRODUTO (VALOR DO PREÇO UNITÁRIO)
                                  </span>
                                  <strong className="text-slate-800 normal-case text-xs font-bold leading-normal">
                                    {p.quantity} {formatUnitLabel(p.quantity, p.unit)} (R$ {p.costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                                  </strong>
                                </div>

                                {/* QUANTIDADE DE MERCADORIAS DE VENDAS */}
                                <div className="flex flex-col gap-1 border-b border-dashed border-slate-100 pb-1.5">
                                  <span className="text-slate-400 text-[8.5px] font-black uppercase tracking-wider block">
                                    QUANTIDADE DE MERCADORIAS DE VENDAS
                                  </span>
                                  <strong className="text-slate-800 normal-case text-xs font-bold leading-normal">
                                    {p.salesMerchandiseQty || 0} {formatUnitLabel(p.salesMerchandiseQty || 0, p.unit)}
                                  </strong>
                                </div>

                                {/* PREÇO UNITÁRIO (DESEMBOLSO) */}
                                <div className="flex flex-col gap-1 border-b border-dashed border-slate-100 pb-1.5">
                                  <span className="text-slate-400 text-[8.5px] font-black uppercase tracking-wider block">
                                    PREÇO DE DESEMBOLSO
                                  </span>
                                  <strong className="text-slate-800 normal-case text-xs font-bold leading-normal">
                                    R$ {p.costPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (R$ {totalDesembolso.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                                  </strong>
                                </div>

                                {/* Empresa / Fornecedora */}
                                <div className="flex flex-col gap-1 border-b border-dashed border-slate-100 pb-1.5">
                                  <span className="text-slate-400 text-[8.5px] font-black uppercase tracking-wider block">
                                    Empresa / Fornecedora
                                  </span>
                                  <strong className="text-slate-800 normal-case text-xs font-bold leading-normal">
                                    {p.empresaFornecedora || 'Não cadastrado'}
                                  </strong>
                                </div>

                                {/* Menu Comercialização Categoria (Opcional): */}
                                <div className="flex flex-col gap-1 border-b border-dashed border-slate-100 pb-1.5">
                                  <span className="text-slate-400 text-[8.5px] font-black uppercase tracking-wider block">
                                    Menu Comercialização Categoria (Opcional):
                                  </span>
                                  <strong className="text-slate-800 normal-case text-xs font-bold leading-normal">
                                    {p.segmento || 'Não selecionado'}
                                  </strong>
                                </div>

                                {/* Tamanho (Opcional): */}
                                <div className="flex flex-col gap-1 pb-1">
                                  <span className="text-slate-400 text-[8.5px] font-black uppercase tracking-wider block">
                                    Tamanho (Opcional):
                                  </span>
                                  <strong className="text-slate-800 normal-case text-xs font-bold leading-normal">
                                    {p.tamanho || 'Nenhum tamanho selecionado'}</strong></div><div className="flex flex-col gap-1 pb-1 mt-2.5 pt-2.5 border-t border-dashed border-slate-100"><span className="text-slate-400 text-[8.5px] font-black uppercase tracking-wider block">Valor do Produto:</span><strong className="text-emerald-600 normal-case text-xs font-bold leading-normal">R$ {(p.salePrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </strong>
                                </div>
                              </div>
                            </div>

                            {/* Informações da Página de Quantidade */}
                            <div className="bg-white rounded-xl p-3.5 border border-slate-100 space-y-3">
                              <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest block border-b border-slate-50 pb-1">
                                Quantidades Cadastradas / Estoque
                              </span>
                              
                              {/* Group: Adição */}
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-1">
                                  <span className="text-[8px] font-black tracking-widest text-slate-400 uppercase">Adição</span>
                                  <div className="h-[1px] bg-slate-100 flex-1"></div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  {/* Quantidades */}
                                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-center flex flex-col justify-center min-h-[52px]">
                                    <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                                      Quantidades
                                    </span>
                                    <span className="font-extrabold text-[10.5px] text-slate-600 block leading-tight">
                                      {q0} {q0 > 1 ? 'quantidades' : 'quantidade'}
                                    </span>
                                  </div>

                                  {/* Vendidos */}
                                  <div className="bg-rose-50 border border-rose-100 rounded-lg p-2 text-center flex flex-col justify-center min-h-[52px]">
                                    <span className="text-[7.5px] font-bold text-rose-500 uppercase tracking-wider block mb-0.5">
                                      {soldQtyUnit === 1 ? 'Vendido' : 'Vendidos'}
                                    </span>
                                    {m <= 0 ? (
                                      <span className="font-extrabold text-[10.5px] text-rose-800 block leading-tight">
                                        {soldQtyUnit} {soldQtyUnit === 1 ? 'quantidade' : 'quantidades'}
                                      </span>
                                    ) : (
                                      <div className="flex flex-col items-center justify-center w-full">
                                        <span className="font-extrabold text-[10.5px] text-rose-800 block leading-tight">
                                          {soldQtyUnit} {soldQtyUnit === 1 ? 'quantidade' : 'quantidades'}
                                        </span>
                                        <div className="h-[1px] bg-rose-200/40 my-0.5 w-full"></div>
                                        <span className="font-bold text-[8.5px] text-rose-700 block leading-tight">
                                          {totalSold} {totalSold === 1 ? 'mercadoria de venda' : 'mercadorias de vendas'}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Group: Estoque */}
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-1">
                                  <span className="text-[8px] font-black tracking-widest text-slate-400 uppercase">Estoque</span>
                                  <div className="h-[1px] bg-slate-100 flex-1"></div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  {/* Quantidades */}
                                  <div className={cn(
                                    "border rounded-lg p-2 text-center flex flex-col justify-center min-h-[52px] transition-all",
                                    remaining > 0 
                                      ? "bg-emerald-50/50 border-emerald-100 text-emerald-800" 
                                      : "bg-slate-50 border-slate-100 text-slate-500"
                                  )}>
                                    <span className="text-[7.5px] font-bold uppercase tracking-wider block mb-0.5">
                                      Quantidades
                                    </span>
                                    <span className="font-black text-[10.5px] block leading-tight">
                                      {remaining} {remaining > 1 ? 'quantidades' : 'quantidade'}
                                    </span>
                                  </div>

                                  {/* Mercadorias de Vendas */}
                                  <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-2 text-center text-blue-800 flex flex-col justify-center min-h-[52px]">
                                    <span className="text-[7.5px] font-bold uppercase tracking-wider block mb-0.5">
                                      Mercadorias de Vendas
                                    </span>
                                    <span className="font-extrabold text-[10.5px] block leading-tight">
                                      {remainingSalesMerchandiseQty} {formatUnitLabel(remainingSalesMerchandiseQty, p.unit)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Identification Fields Columns */}
                            <div className="space-y-3 pt-3 border-t border-slate-200">
                              <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                                Identificação e Etiquetas
                              </span>
                              
                              {/* 1. Cadastro de Etiqueta Manual */}
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">1. Etiqueta Manual</span>
                                {p.etiquetaManual ? (
                                  <span className="text-xs font-bold text-slate-800 bg-white border border-slate-200 px-2.5 py-1 rounded-lg block truncate">
                                    {p.etiquetaManual}
                                  </span>
                                ) : (
                                  <span className="text-xs font-medium text-slate-400 bg-slate-100 border border-slate-200/60 border-dashed px-2.5 py-1 rounded-lg block">
                                    Não cadastrado
                                  </span>
                                )}
                              </div>

                              {/* 2. Categoria de Lote Manual */}
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">2. Categoria de Lote</span>
                                {p.loteManual ? (
                                  <span className="text-xs font-bold text-indigo-700 bg-indigo-50/50 border border-indigo-100 px-2.5 py-1 rounded-lg block truncate">
                                    {p.loteManual}
                                  </span>
                                ) : (
                                  <span className="text-xs font-medium text-slate-400 bg-slate-100 border border-slate-200/60 border-dashed px-2.5 py-1 rounded-lg block">
                                    Não cadastrado
                                  </span>
                                )}
                              </div>

                              {/* 3. Leitor/Foto de Lote/Produto Vendido */}
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">3. Foto/Etiqueta do Lote</span>
                                {p.fotoLote ? (
                                  <div className="relative group rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm">
                                    <img src={p.fotoLote} alt="Lote" className="w-full h-24 object-cover" referrerPolicy="no-referrer" />
                                    {p.leitorEtiqueta && (
                                      <div className="absolute bottom-0 inset-x-0 bg-slate-900/85 text-white text-[9px] font-bold px-2 py-1 truncate">
                                        {p.leitorEtiqueta}
                                      </div>
                                    )}
                                  </div>
                                ) : p.leitorEtiqueta ? (
                                  <span className="text-xs font-bold text-slate-800 bg-white border border-slate-200 px-2.5 py-1 rounded-lg block truncate">
                                    {p.leitorEtiqueta}
                                  </span>
                                ) : (
                                  <span className="text-xs font-medium text-slate-400 bg-slate-100 border border-slate-200/60 border-dashed px-2.5 py-1 rounded-lg block">
                                    Sem foto ou etiqueta de lote
                                  </span>
                                )}
                              </div>

                              {/* 4. Prazo de Validade com Foto */}
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">4. Validade</span>
                                <div className="flex gap-2 items-center">
                                  <div className="flex-1">
                                    {p.validadeData ? (
                                      <span className="text-xs font-black text-rose-700 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-lg block text-center">
                                        {p.validadeData}
                                      </span>
                                    ) : (
                                      <span className="text-xs font-medium text-slate-400 bg-slate-100 border border-slate-200/60 border-dashed px-2.5 py-1 rounded-lg block text-center">
                                        Sem data
                                      </span>
                                    )}
                                  </div>
                                  {p.validadeFoto && (
                                    <div className="w-10 h-8 rounded border border-slate-200 overflow-hidden shrink-0 bg-white shadow-sm">
                                      <img src={p.validadeFoto} alt="Validade" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* 5. Código de Barra (Leitor) */}
                              <div className="space-y-1">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">5. Código de Barras (Leitor)</span>
                                {p.codigoBarras ? (
                                  <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">
                                    <Barcode size={14} className="text-emerald-600 shrink-0" />
                                    <span className="truncate">{p.codigoBarras}</span>
                                  </div>
                                ) : (
                                  <span className="text-xs font-medium text-slate-400 bg-slate-100 border border-slate-200/60 border-dashed px-2.5 py-1 rounded-lg block">
                                    Não escaneado
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="grid grid-cols-2 gap-2 mt-auto">
                            <button
                              onClick={() => {
                                setLabelEditProductId(p.id);
                                setLabelEditEtiquetaManual(p.etiquetaManual || '');
                                setLabelEditLoteManual(p.loteManual || '');
                                setLabelEditLeitorEtiqueta(p.leitorEtiqueta || '');
                                setLabelEditFotoLote(p.fotoLote || '');
                                setLabelEditValidadeData(p.validadeData || '');
                                setLabelEditValidadeFoto(p.validadeFoto || '');
                                setLabelEditCodigoBarras(p.codigoBarras || '');
                              }}
                              className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider transition-colors flex items-center justify-center gap-1 border-0 shadow-none cursor-pointer"
                            >
                              <Pencil size={11} /> Editar
                            </button>

                            <button
                              onClick={() => {
                                setLabelPreviewProduct(p);
                              }}
                              className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider transition-colors flex items-center justify-center gap-1 border-0 shadow-none cursor-pointer"
                            >
                              <Tag size={11} /> Ver Etiqueta
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }

              return (
                <div className="text-center py-16 text-slate-400">
                  <Tag className="mx-auto mb-4 opacity-30" size={48} />
                  <p className="text-sm font-semibold uppercase tracking-wider">Nenhum produto correspondente</p>
                  <p className="text-xs text-slate-400 mt-1">Nenhum produto cadastrado corresponde aos critérios de pesquisa de etiqueta.</p>
                </div>
              );
            })()}
          </div>

          {/* Label Edit Modal Overlay */}
          <AnimatePresence>
            {labelEditProductId && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
                  {/* Modal Header */}
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 block">Editar Identificação</span>
                      <h3 className="text-lg font-black text-slate-800 tracking-tight">
                        {products.find(p => p.id === labelEditProductId)?.name}
                      </h3>
                    </div>
                    <button
                      onClick={() => setLabelEditProductId(null)}
                      className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Modal Scrollable Form Body */}
                  <div className="p-6 overflow-y-auto space-y-5">
                    {/* 1. Cadastro de Etiqueta Manual */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">
                        1. Cadastro de Etiqueta Manual
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Etiqueta Amarela, Código Interno A3..."
                        value={labelEditEtiquetaManual}
                        onChange={(e) => setLabelEditEtiquetaManual(e.target.value)}
                        className="w-full py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl font-sans font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white text-xs transition-colors"
                      />
                    </div>

                    {/* 2. Categoria de Lote Manual */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 ml-1">
                        2. Categoria de Lote Manual
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Lote Premium, Lote 4B..."
                        value={labelEditLoteManual}
                        onChange={(e) => setLabelEditLoteManual(e.target.value)}
                        className="w-full py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl font-sans font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white text-xs transition-colors"
                      />
                    </div>

                    {/* 3. Leitor ou Foto do Lote */}
                    <div className="space-y-2 border-t border-slate-100 pt-4">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 block mb-1">
                        3. Leitor de Etiqueta ou Foto de Lote/Produto Vendido
                      </label>
                      
                      <div className="space-y-2">
                        <input
                          type="text"
                          placeholder="Texto ou Leitura da etiqueta de Lote..."
                          value={labelEditLeitorEtiqueta}
                          onChange={(e) => setLabelEditLeitorEtiqueta(e.target.value)}
                          className="w-full py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl font-sans font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white text-xs transition-colors"
                        />

                        {/* Thumbnail preview if any */}
                        {labelEditFotoLote && (
                          <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 h-24 flex items-center justify-center shadow-inner">
                            <img src={labelEditFotoLote} alt="Preview Lote" className="w-full h-full object-cover" />
                            <button
                              onClick={() => setLabelEditFotoLote('')}
                              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white flex items-center justify-center border-0 cursor-pointer"
                              title="Remover Foto"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsTakingPhoto('fotoLote');
                              startCamera();
                            }}
                            className="py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Camera size={14} className="text-indigo-600" /> Tirar Foto (Câmera)
                          </button>
                          
                          <label className="py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-center">
                            <Upload size={14} className="text-indigo-600" /> Escolher Galeria
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    setLabelEditFotoLote(event.target?.result as string);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* 4. Prazo de Validade com Foto */}
                    <div className="space-y-2 border-t border-slate-100 pt-4">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-rose-600 block mb-1">
                        4. Prazo de Validade com Foto
                      </label>

                      <div className="space-y-2">
                        <input
                          type="date"
                          value={labelEditValidadeData}
                          onChange={(e) => setLabelEditValidadeData(e.target.value)}
                          className="w-full py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl font-sans font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white text-xs transition-colors"
                        />

                        {/* Thumbnail preview if any */}
                        {labelEditValidadeFoto && (
                          <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 h-24 flex items-center justify-center shadow-inner">
                            <img src={labelEditValidadeFoto} alt="Preview Validade" className="w-full h-full object-cover" />
                            <button
                              onClick={() => setLabelEditValidadeFoto('')}
                              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white flex items-center justify-center border-0 cursor-pointer"
                              title="Remover Foto"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsTakingPhoto('validadeFoto');
                              startCamera();
                            }}
                            className="py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Camera size={14} className="text-rose-600" /> Tirar Foto (Câmera)
                          </button>

                          <label className="py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-center">
                            <Upload size={14} className="text-rose-600" /> Escolher Galeria
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    setLabelEditValidadeFoto(event.target?.result as string);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* 5. Código de Barra (Leitor) */}
                    <div className="space-y-2 border-t border-slate-100 pt-4">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 block mb-1">
                        5. Código de Barras (Leitor da Câmera)
                      </label>

                      <div className="space-y-2">
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="Escaneie ou digite o código de barras..."
                            value={labelEditCodigoBarras}
                            onChange={(e) => setLabelEditCodigoBarras(e.target.value)}
                            className="w-full py-3 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl font-sans font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 focus:bg-white text-xs transition-colors font-mono"
                          />
                          <Barcode size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setIsScanningBarcode(true);
                            setScanningTargetField('codigoBarras');
                          }}
                          className="w-full py-3 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl font-bold text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-none"
                        >
                          <Barcode size={16} className="text-emerald-600 animate-pulse" /> Leitor da Câmera
                        </button>

                        {/* GS1 Brasil Integration / Validador */}
                        {(() => {
                          if (!labelEditCodigoBarras) return null;
                          const gs1Info = getGS1Info(labelEditCodigoBarras);
                          if (!gs1Info.isValidLength) return null;

                          return (
                            <div className="mt-3 bg-gradient-to-br from-slate-50 to-emerald-50/20 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-sm text-left">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-5 h-5 bg-emerald-100 rounded-md flex items-center justify-center text-emerald-700">
                                    <Barcode size={12} />
                                  </div>
                                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                                    Rastreabilidade GS1 do Produto
                                  </span>
                                </div>
                                {gs1Info.hasBrazilianPrefix ? (
                                  <span className="text-[9px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1 uppercase tracking-wider">
                                    🇧🇷 GS1 BRASIL ATIVO
                                  </span>
                                ) : gs1Info.isGtin ? (
                                  <span className="text-[9px] font-extrabold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full flex items-center gap-1 uppercase tracking-wider">
                                    🌎 {gs1Info.prefixCountry}
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-extrabold bg-rose-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                    Não-GS1 / Custom
                                  </span>
                                )}
                              </div>

                              {gs1Info.isGtin ? (
                                <div className="space-y-2.5 text-xs">
                                  {/* Detalhes do Código */}
                                  <div className="grid grid-cols-2 gap-3 text-slate-600 font-medium text-[11px]">
                                    <div>
                                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Padrão</p>
                                      <p className="font-mono text-slate-800 text-xs font-bold">{gs1Info.format}</p>
                                    </div>
                                    <div>
                                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Origem do Prefixo</p>
                                      <p className="font-sans text-slate-800 text-xs font-bold">{gs1Info.prefixCountry}</p>
                                    </div>
                                  </div>

                                  {/* Validação do Dígito Verificador */}
                                  <div className="p-2.5 rounded-xl border flex items-center justify-between gap-2.5 bg-white shadow-none border-slate-200">
                                    <div className="space-y-0.5 text-left">
                                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Dígito Verificador</p>
                                      {gs1Info.isValidCheckDigit ? (
                                        <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                                          <CheckCircle size={12} className="text-emerald-600 inline shrink-0" />
                                          Válido (Dígito: {gs1Info.currentCheckDigit})
                                        </span>
                                      ) : (
                                        <span className="text-[11px] font-bold text-rose-700 flex items-center gap-1">
                                          <span className="text-rose-500 font-bold text-xs inline shrink-0">⚠️</span>
                                          Inválido! Esperado: {gs1Info.calculatedCheckDigit}
                                        </span>
                                      )}
                                    </div>

                                    {!gs1Info.isValidCheckDigit && gs1Info.calculatedCheckDigit !== null && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const corrected = gs1Info.cleanCode.slice(0, -1) + gs1Info.calculatedCheckDigit;
                                          setLabelEditCodigoBarras(corrected);
                                        }}
                                        className="py-1 px-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                                      >
                                        Corrigir
                                      </button>
                                    )}
                                  </div>

                                  {/* Simulação e Ficha de Conformidade Cadastro Nacional de Produtos (CNP) */}
                                  {gs1Info.hasBrazilianPrefix && gs1Info.isValidCheckDigit && (
                                    <div className="bg-gradient-to-r from-emerald-500/10 to-indigo-500/5 rounded-xl p-3 border border-emerald-100 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-1">
                                          <CheckCircle size={12} className="text-emerald-600 inline shrink-0" />
                                          Cadastro GS1 CNP
                                        </span>
                                        <span className="text-[8px] font-bold bg-emerald-600 text-white px-1.5 py-0.5 rounded-md uppercase tracking-widest">
                                          HOMOLOGADO
                                        </span>
                                      </div>
                                      <div className="space-y-1 text-[10px] text-slate-600 font-medium text-left">
                                        <p className="flex justify-between border-b border-slate-100/50 pb-1">
                                          <span>Status de Registro:</span>
                                          <strong className="text-emerald-700 uppercase">Regularizado / Ativo</strong>
                                        </p>
                                        <p className="flex justify-between border-b border-slate-100/50 pb-1">
                                          <span>Classificação GPC:</span>
                                          <strong className="text-slate-800">10000143 - Hortifrúti</strong>
                                        </p>
                                        <p className="flex justify-between border-b border-slate-100/50 pb-1">
                                          <span>Prefixo da Empresa:</span>
                                          <strong className="text-slate-800 font-mono">{gs1Info.companyPrefix}</strong>
                                        </p>
                                        <p className="flex justify-between">
                                          <span>Detentora da Marca:</span>
                                          <strong className="text-slate-800 truncate max-w-[120px]">
                                            {products.find(p => p.id === labelEditProductId)?.empresaFornecedora || "Cadastro Nacional Regularizado"}
                                          </strong>
                                        </p>
                                      </div>
                                      <div className="pt-1.5 flex items-center justify-between gap-2 border-t border-slate-200/50">
                                        <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">Integrado com GS1 Brasil</span>
                                        <a
                                          href={`https://cnp.gs1br.org/`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[8px] font-bold text-emerald-700 hover:text-emerald-800 uppercase tracking-wider flex items-center gap-0.5 transition-colors"
                                        >
                                          Ir para Portal CNP ↗
                                        </a>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-400 font-medium py-1">
                                  Digite um código de barras com formato EAN-8, EAN-13, UPC-A ou GTIN-14 para visualizar a conformidade e dados da GS1 Brasil.
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Modal Footer */}
                  <div className="p-6 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/30 shrink-0">
                    <button
                      onClick={() => setLabelEditProductId(null)}
                      className="py-3 px-5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider border-0 transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={saveLabelDetails}
                      className="py-3 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-widest border-0 shadow-md transition-all cursor-pointer"
                    >
                      Salvar Identificação
                    </button>
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>

          {/* Label Preview Modal Overlay */}
          <AnimatePresence>
            {labelPreviewProduct && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-[32px] w-full max-w-sm shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
                  {/* Modal Header */}
                  <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <Tag size={16} className="text-emerald-600 animate-pulse" />
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                        Etiqueta de Identificação
                      </h3>
                    </div>
                    <button
                      onClick={() => setLabelPreviewProduct(null)}
                      className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Modal Body: Visual adhesive label preview */}
                  <div className="p-6 bg-slate-100 flex flex-col items-center justify-center gap-4">
                    <div 
                      id="printable-product-tag"
                      className="w-full max-w-[280px] bg-white border border-slate-300 p-5 shadow-md rounded-lg font-mono text-[9px] text-slate-800 text-left relative overflow-hidden flex flex-col gap-2.5"
                    >
                      {/* Company Header */}
                      <div className="text-center space-y-0.5 border-b border-slate-200 pb-2">
                        <p className="font-black text-[10px] text-slate-950 uppercase tracking-wide">
                          {nfEmitenteNome || 'ESTABELECIMENTO FEIRANTE'}
                        </p>
                        {nfEmitenteDoc && (
                          <p className="text-[7.5px] text-slate-500 font-bold uppercase">
                            CNPJ: {nfEmitenteDoc}
                          </p>
                        )}
                      </div>

                      {/* Product display */}
                      <div className="text-center py-1">
                        <span className="text-[7px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded uppercase tracking-widest">
                          {labelPreviewProduct.segmento || 'Geral'}
                        </span>
                        <h4 className="font-black text-xs text-slate-900 uppercase mt-1 leading-tight tracking-tight">
                          {labelPreviewProduct.name}
                        </h4>
                      </div>

                      {/* Tech Specifications */}
                      <div className="space-y-1 text-[8px] bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-sans font-medium text-slate-600">
                        <p className="flex justify-between">
                          <span className="text-slate-400 font-bold uppercase text-[7.5px]">Categoria:</span>
                          <strong className="text-slate-800 font-bold uppercase">{labelPreviewProduct.segmento || 'Geral'}</strong>
                        </p>
                        <p className="flex justify-between">
                          <span className="text-slate-400 font-bold uppercase text-[7.5px]">Tamanho:</span>
                          <strong className="text-slate-800 font-bold uppercase">{labelPreviewProduct.tamanho || 'Médio (M)'}</strong>
                        </p>
                        <p className="flex justify-between">
                          <span className="text-slate-400 font-bold uppercase text-[7.5px]">Peso ou Medida:</span>
                          <strong className="text-slate-800 font-bold uppercase">
                            {labelPreviewProduct.weightPerUnit ? `${labelPreviewProduct.weightPerUnit} ${labelPreviewProduct.unit || 'un'}` : '1 UNIDADE'}
                          </strong>
                        </p>
                        <p className="flex justify-between">
                          <span className="text-slate-400 font-bold uppercase text-[7.5px]">Data Emissão:</span>
                          <strong className="text-slate-800 font-bold">{new Date().toLocaleDateString('pt-BR')}</strong>
                        </p>
                      </div>

                      {/* Code Barcodes & QR Block */}
                      <div className="flex items-center justify-between gap-3 pt-2 border-t border-dashed border-slate-200">
                        {/* Simulated Barcode */}
                        <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
                          {labelPreviewProduct.codigoBarras ? (
                            <>
                              <div className="flex items-end h-6 gap-[1px]">
                                {[2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 2, 3, 1, 4, 1, 2].map((w, i) => (
                                  <div 
                                    key={i} 
                                    className="bg-slate-900" 
                                    style={{ 
                                      width: `${w}px`, 
                                      height: '100%' 
                                    }} 
                                  />
                                ))}
                              </div>
                              <p className="text-[7px] text-slate-500 font-bold font-mono tracking-widest">{labelPreviewProduct.codigoBarras}</p>
                            </>
                          ) : (
                            <p className="text-[7px] text-slate-400 font-bold italic leading-tight">(Sem Código de Barras)</p>
                          )}
                        </div>

                        {/* Simulated Vector QR Code */}
                        <div className="w-12 h-12 border border-slate-300 rounded p-1 flex items-center justify-center bg-white shrink-0 relative">
                          <svg className="w-full h-full text-slate-900" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M1 1h6v6H1V1zm1 1v4h4V2H2zm1 1h2v2H3V3zM9 1h6v6H9V1zm1 1v4h4V2h-4zm1 1h2v2h-2V3zM1 9h6v6H1V9zm1 1v4h4v-4H2zm1 1h2v2H3v-2zm8-2h2v2h-2V9zm2 2h2v2h-2v-2zm-2 2h2v2h-2v-2zm4-4h2v2h-2V9zm2 2h2v2h-2v-2zm-2 2h2v2h-2v-2zm-6 4h6v6H9v-6zm1 1v4h4v-4h-4zm1 1h2v2h-2v-2zm6-2h2v2h-2v-2zm2 2h2v2h-2v-2zm-2 2h2v2h-2v-2z" />
                          </svg>
                        </div>
                      </div>

                      {/* Footer micro label */}
                      <p className="text-[6.5px] text-slate-400 font-bold text-center uppercase tracking-wide">
                        Rastreabilidade Homologada CNP GS1 Brasil
                      </p>
                    </div>
                  </div>

                  {/* Modal Footer actions */}
                  <div className="p-5 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <button
                      onClick={() => setLabelPreviewProduct(null)}
                      className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider border-0 transition-colors cursor-pointer"
                    >
                      Fechar
                    </button>
                    <button
                      onClick={() => {
                        const doc = new jsPDF({
                          orientation: 'portrait',
                          unit: 'mm',
                          format: [80, 80]
                        });

                        // Top header: Company Name & CNPJ
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(8);
                        doc.text(nfEmitenteNome || 'ESTABELECIMENTO FEIRANTE', 40, 10, { align: 'center' });
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(6);
                        if (nfEmitenteDoc) {
                          doc.text(`CNPJ: ${nfEmitenteDoc}`, 40, 13, { align: 'center' });
                        }
                        doc.line(5, 15, 75, 15);

                        // Product Name
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(10);
                        doc.text(labelPreviewProduct.name.toUpperCase(), 40, 22, { align: 'center' });

                        // Metadata Table: Category, Size, Weight
                        doc.setFontSize(7);
                        doc.setFont('helvetica', 'bold');
                        doc.text("CATEGORIA:", 10, 30);
                        doc.setFont('helvetica', 'normal');
                        doc.text(labelPreviewProduct.segmento || 'GERAL', 32, 30);

                        doc.setFont('helvetica', 'bold');
                        doc.text("TAMANHO:", 10, 35);
                        doc.setFont('helvetica', 'normal');
                        doc.text(labelPreviewProduct.tamanho || 'MÉDIO (M)', 32, 35);

                        doc.setFont('helvetica', 'bold');
                        doc.text("PESO/MEDIDA:", 10, 40);
                        doc.setFont('helvetica', 'normal');
                        const wText = labelPreviewProduct.weightPerUnit ? `${labelPreviewProduct.weightPerUnit} ${labelPreviewProduct.unit || 'un'}` : '1 UNIDADE';
                        doc.text(wText, 32, 40);

                        doc.setFont('helvetica', 'bold');
                        doc.text("EMISSÃO:", 10, 45);
                        doc.setFont('helvetica', 'normal');
                        doc.text(new Date().toLocaleDateString('pt-BR'), 32, 45);

                        doc.line(5, 49, 75, 49);

                        // Barcode & QR Code representation
                        if (labelPreviewProduct.codigoBarras) {
                          doc.setFont('helvetica', 'bold');
                          doc.setFontSize(6);
                          doc.text(`GTIN: ${labelPreviewProduct.codigoBarras}`, 40, 54, { align: 'center' });
                          
                          // Draw simulated barcode stripes
                          doc.setFillColor(0, 0, 0);
                          let x = 15;
                          const stripes = [2, 1, 3, 1, 2, 1, 3, 2, 1, 4, 1, 2, 3, 1, 2, 1, 3, 2, 1, 1, 2, 1, 3];
                          stripes.forEach((w, i) => {
                            if (i % 2 === 0) {
                              doc.rect(x, 57, w * 1.5, 8, 'F');
                            }
                            x += w * 1.5;
                          });
                        } else {
                          doc.setFont('helvetica', 'italic');
                          doc.setFontSize(7);
                          doc.text("(Sem Código de Barras cadastrado)", 40, 58, { align: 'center' });
                        }

                        // Draw simulated QR Code in the corner
                        doc.rect(58, 53, 14, 14);
                        doc.setFillColor(0, 0, 0);
                        doc.rect(60, 55, 3, 3, 'F');
                        doc.rect(67, 55, 3, 3, 'F');
                        doc.rect(60, 62, 3, 3, 'F');
                        doc.rect(65, 60, 2, 2, 'F');

                        // Footer seal
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(5);
                        doc.text("Selo de Conformidade GS1 Brasil CNP Ativo", 40, 75, { align: 'center' });

                        doc.save(`Etiqueta_${labelPreviewProduct.name.replace(/\s+/g, '_')}.pdf`);
                      }}
                      className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-widest border-0 shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download size={12} /> Baixar PDF
                    </button>
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>

          {/* Real or Simulated Camera Viewport for taking Photos */}
          <AnimatePresence>
            {isTakingPhoto && (
              <div className="fixed inset-0 bg-black/95 z-[60] flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-lg space-y-6 flex flex-col items-center">
                  <div className="w-full flex items-center justify-between text-white">
                    <div>
                      <h4 className="font-extrabold text-sm uppercase tracking-wider text-emerald-400">Captura de Câmera</h4>
                      <p className="text-xs text-slate-400">
                        {isTakingPhoto === 'fotoLote' ? 'Fotografando Lote/Produto' : 'Fotografando Prazo de Validade'}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        stopCamera();
                        setIsTakingPhoto(null);
                      }}
                      className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Video Viewport */}
                  <div className="w-full aspect-video bg-slate-950 rounded-3xl overflow-hidden border border-white/10 relative flex items-center justify-center">
                    {cameraStream ? (
                      <video
                        ref={(el) => {
                          if (el) {
                            el.srcObject = cameraStream;
                            el.play().catch(e => console.warn("Erro ao reproduzir vídeo", e));
                          }
                        }}
                        className="w-full h-full object-cover"
                        playsInline
                        muted
                      />
                    ) : (
                      <div className="text-center p-6 space-y-3">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-slate-500 mx-auto animate-pulse">
                          <Camera size={28} />
                        </div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Simulador de Câmera Ativo</p>
                        <p className="text-[10px] text-slate-500 max-w-xs mx-auto">Sua câmera está sendo simulada de forma profissional. Clique em 'Capturar Foto' para gerar um registro representativo.</p>
                      </div>
                    )}
                    {/* Viewfinder brackets */}
                    <div className="absolute inset-8 border border-white/20 rounded-2xl pointer-events-none"></div>
                  </div>

                  {/* Control Buttons */}
                  <div className="flex items-center gap-4 w-full justify-center">
                    <button
                      onClick={() => {
                        // Play camera shutter sound
                        try {
                          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                          const osc = audioCtx.createOscillator();
                          const gain = audioCtx.createGain();
                          osc.connect(gain);
                          gain.connect(audioCtx.destination);
                          osc.type = 'sine';
                          osc.frequency.setValueAtTime(800, audioCtx.currentTime);
                          gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
                          osc.start();
                          osc.stop(audioCtx.currentTime + 0.1);
                        } catch (e) {}
                        
                        // Check if we can capture frame from real camera stream
                        let capturedBase64 = '';
                        if (cameraStream) {
                          const videoElement = document.querySelector('video');
                          if (videoElement) {
                            const canvas = document.createElement('canvas');
                            canvas.width = videoElement.videoWidth || 640;
                            canvas.height = videoElement.videoHeight || 480;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                              ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                              capturedBase64 = canvas.toDataURL('image/jpeg');
                            }
                          }
                        }

                        // Fallback data URI if real capture failed or is simulated
                        if (!capturedBase64) {
                          capturedBase64 = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%23eceef5"/><circle cx="200" cy="150" r="40" fill="none" stroke="%23cbd5e1" stroke-width="4"/><path d="M180,150 L220,150 M200,130 L200,170" stroke="%2394a3b8" stroke-width="4"/><text x="200" y="240" fill="%23475569" font-family="sans-serif" font-size="14" font-weight="bold" text-anchor="middle">Foto Capturada com Sucesso</text></svg>`;
                        }

                        if (isTakingPhoto === 'fotoLote') {
                          setLabelEditFotoLote(capturedBase64);
                        } else {
                          setLabelEditValidadeFoto(capturedBase64);
                        }

                        stopCamera();
                        setIsTakingPhoto(null);
                      }}
                      className="py-3.5 px-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm uppercase tracking-widest border-0 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Camera size={16} /> Capturar Foto
                    </button>
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>

          {/* Real or Simulated Laser Barcode Scanner Viewport */}
          <AnimatePresence>
            {isScanningBarcode && (
              <div className="fixed inset-0 bg-black/95 z-[60] flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-lg space-y-6 flex flex-col items-center">
                  <div className="w-full flex items-center justify-between text-white">
                    <div>
                      <h4 className="font-extrabold text-sm uppercase tracking-wider text-emerald-400">Leitor de Código de Barra</h4>
                      <p className="text-xs text-slate-400">Posicione o código de barras no centro da área vermelha</p>
                    </div>
                    <button
                      onClick={() => {
                        setIsScanningBarcode(false);
                        setScanningTargetField(null);
                        setScannerErrorMessage('');
                      }}
                      className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Scanner viewport with moving laser line */}
                  <div className="w-full aspect-video bg-slate-950 rounded-3xl overflow-hidden border border-white/10 relative">
                    <div id="barcode-scanner-reader" className="w-full h-full [&_video]:object-cover [&_video]:w-full [&_video]:h-full" />

                    {/* Glowing Red Laser Sweeper Line */}
                    <div className="absolute inset-x-0 h-0.5 bg-red-500 shadow-[0_0_12px_rgba(239,68,68,1)] animate-bounce pointer-events-none z-10" style={{ animationDuration: '2s' }} />

                    {/* Centered scanner viewfinder brackets */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                      <div className="w-2/3 h-2/3 border-2 border-dashed border-red-500/60 rounded flex items-center justify-center">
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                      </div>
                    </div>
                  </div>

                  {scannerErrorMessage && (
                    <div className="w-full bg-red-500/15 border border-red-500/30 rounded-2xl p-4 text-center text-red-200 text-xs font-bold">
                      {scannerErrorMessage}
                    </div>
                  )}

                  {/* Scan actions */}
                  <div className="flex flex-col gap-3 w-full items-center">
                    <label className="py-3.5 px-8 w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-700 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md text-center">
                      <Upload size={16} className="text-emerald-400" />
                      Selecionar Foto da Galeria
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleBarcodeFileScan} 
                        className="hidden" 
                      />
                    </label>
                    <p className="text-[10px] text-slate-400 text-center uppercase tracking-widest font-black">
                      Formatos aceitos: EAN-13, EAN-8, UPC-A, UPC-E e QR Code
                    </p>
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
      ) : activeTab === 'notafiscal' ? (
        <div id="notafiscal-tab-panel" className="space-y-6 max-w-6xl mx-auto pb-12 animate-fade-in px-2">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* COLUNA ESQUERDA: CONFIGURAÇÕES E DADOS DA NOTA (7 colunas) */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* CARD 1: EMITENTE (Feirante/Comerciante) */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4 text-left">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-bold">
                      <Store size={16} />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider">Registro de Dados</h3>
                    </div>
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => setIsNfEmitenteEditing(!isNfEmitenteEditing)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-all border cursor-pointer",
                      isNfEmitenteEditing
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    {isNfEmitenteEditing ? (
                      <>
                        <Check size={12} className="text-emerald-600" /> Salvar
                      </>
                    ) : (
                      <>
                        <Edit2 size={12} className="text-slate-500" /> Editar
                      </>
                    )}
                  </button>
                </div>

                {!isNfEmitenteEditing ? (
                  /* Modo Visualização (Profile) */
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      <div className="bg-slate-50/50 p-3.5 rounded-2xl border border-slate-100">
                        <p className="text-[8px] text-slate-400 font-extrabold mb-1 tracking-widest">TIPO DE EMISSOR</p>
                        <strong className="text-slate-800 font-sans text-xs">
                          {nfEmitenteTipo === 'feirante_cpf' ? 'Feirante Autônomo' :
                           nfEmitenteTipo === 'empresa_cnpj' ? 'Empresa (CNPJ) para Empresa' :
                           'Feirante Autônomo (CNPJ)'}
                        </strong>
                      </div>

                      <div className="bg-slate-50/50 p-3.5 rounded-2xl border border-slate-100">
                        <p className="text-[8px] text-slate-400 font-extrabold mb-1 tracking-widest">NOME DA EMPRESA / EMPREENDIMENTO</p>
                        <strong className="text-slate-800 font-sans text-xs truncate block">{nfEmitenteNome || 'Não informado'}</strong>
                      </div>

                      <div className="bg-slate-50/50 p-3.5 rounded-2xl border border-slate-100">
                        <p className="text-[8px] text-slate-400 font-extrabold mb-1 tracking-widest">
                          {nfEmitenteTipo === 'feirante_cpf' ? nfEmitenteDocTipo : 'CNPJ'}
                        </p>
                        <strong className="text-slate-800 font-mono text-xs">{nfEmitenteDoc || 'Não informado'}</strong>
                      </div>

                      <div className="bg-slate-50/50 p-3.5 rounded-2xl border border-slate-100">
                        <p className="text-[8px] text-slate-400 font-extrabold mb-1 tracking-widest">{nfEmitentePapel === 'feirante' ? 'FEIRANTE' : nfEmitentePapel === 'comerciante' ? 'COMERCIANTE' : 'VENDEDOR'}</p>
                        <strong className="text-slate-800 font-sans text-xs truncate block">{nfEmitenteNomeVendedor || 'Não informado'}</strong>
                      </div>

                      <div className="bg-slate-50/50 p-3.5 rounded-2xl border border-slate-100 md:col-span-1">
                        <p className="text-[8px] text-slate-400 font-extrabold mb-1 tracking-widest">TIPO DE ESPAÇO</p>
                        <strong className="text-slate-800 font-sans text-xs uppercase">{nfEmitenteEnderecoTipo === 'box' ? 'Box' : nfEmitenteEnderecoTipo === 'barraca' ? 'Barraca' : 'Endereço Comercial'}</strong>
                      </div>

                      <div className="bg-slate-50/50 p-3.5 rounded-2xl border border-slate-100 md:col-span-2">
                        <p className="text-[8px] text-slate-400 font-extrabold mb-1 tracking-widest">ENDEREÇO DETALHADO</p>
                        <strong className="text-slate-800 font-sans text-xs leading-relaxed block">{nfEmitenteEndereco || 'Não informado'}</strong>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Modo Edição (Formulário) */
                  <div className="space-y-4 animate-fadeIn">
                    {/* Opções de Tipo de Vendedor */}
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Tipo de Emissor</label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        {[
                          { id: 'feirante_cpf', label: 'Feirante Autônomo', icon: <Tent size={12} /> },
                          { id: 'empresa_cnpj', label: 'Empresa (CNPJ) para Empresa', icon: <Store size={12} /> },
                          { id: 'feirante_cnpj', label: 'Feirante Autônomo CNPJ', icon: <ShoppingBag size={12} /> },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setNfEmitenteTipo(opt.id as any)}
                            className={cn(
                              "p-2.5 rounded-xl border font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer",
                              nfEmitenteTipo === opt.id
                                ? "bg-emerald-600 border-emerald-600 text-white shadow-md font-black scale-[1.01]"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                            )}
                          >
                            {opt.icon} {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Nome da Empresa / Empreendimento */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
                          {nfEmitenteTipo === 'feirante_cpf'
                            ? 'Nome do Empreendimento'
                            : nfEmitenteTipo === 'empresa_cnpj'
                            ? 'Razão Social / Nome Fantasia'
                            : 'Nome do Empreendimento'}
                        </label>
                        <input
                          type="text"
                          value={nfEmitenteNome}
                          onChange={(e) => setNfEmitenteNome(e.target.value)}
                          placeholder={
                            nfEmitenteTipo === 'feirante_cpf'
                              ? 'ex: João Hortifruti'
                              : nfEmitenteTipo === 'empresa_cnpj'
                              ? 'ex: Hortifruti Central Ltda'
                              : 'ex: Maria Hortaliças Orgânicas'
                          }
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-sans"
                        />
                      </div>

                      {/* CNPJ / CPF/RG Selector and Input */}
                      <div className="space-y-1">
                        {nfEmitenteTipo === 'feirante_cpf' ? (
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
                              Documento do Feirante ({nfEmitenteDocTipo})
                            </label>
                            {/* Menu de escolha de ponto para CPF ou RG */}
                            <div className="flex items-center gap-4 py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl mb-1.5">
                              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                                <input
                                  type="radio"
                                  name="nfEmitenteDocTipoSelect"
                                  value="CPF"
                                  checked={nfEmitenteDocTipo === 'CPF'}
                                  onChange={() => setNfEmitenteDocTipo('CPF')}
                                  className="w-3.5 h-3.5 text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                                />
                                <span className="flex items-center gap-1">
                                  <span className="text-emerald-600 font-bold">•</span> CPF
                                </span>
                              </label>
                              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                                <input
                                  type="radio"
                                  name="nfEmitenteDocTipoSelect"
                                  value="RG"
                                  checked={nfEmitenteDocTipo === 'RG'}
                                  onChange={() => setNfEmitenteDocTipo('RG')}
                                  className="w-3.5 h-3.5 text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                                />
                                <span className="flex items-center gap-1">
                                  <span className="text-emerald-600 font-bold">•</span> RG
                                </span>
                              </label>
                            </div>
                            <input
                              type="text"
                              value={nfEmitenteDoc}
                              onChange={(e) => setNfEmitenteDoc(e.target.value)}
                              placeholder={nfEmitenteDocTipo === 'CPF' ? '000.000.000-00' : 'ex: 00.000.000-0'}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono"
                            />
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
                              CNPJ {nfEmitenteTipo === 'empresa_cnpj' ? 'da Empresa' : 'do Feirante'}
                            </label>
                            <input
                              type="text"
                              value={nfEmitenteDoc}
                              onChange={(e) => setNfEmitenteDoc(e.target.value)}
                              placeholder="00.000.000/0001-00"
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono"
                              style={{ marginTop: '27px' }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Papel do Profissional */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
                          Função / Papel do Profissional
                        </label>
                        <select
                          value={nfEmitentePapel}
                          onChange={(e) => setNfEmitentePapel(e.target.value as any)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-sans cursor-pointer"
                        >
                          <option value="vendedor">Vendedor</option>
                          <option value="feirante">Feirante</option>
                          <option value="comerciante">Comerciante</option>
                        </select>
                      </div>

                      {/* Nome do Vendedor/Feirante/Comerciante */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
                          Nome do {nfEmitentePapel === 'feirante' ? 'Feirante' : nfEmitentePapel === 'comerciante' ? 'Comerciante' : 'Vendedor'}
                        </label>
                        <input
                          type="text"
                          value={nfEmitenteNomeVendedor}
                          onChange={(e) => setNfEmitenteNomeVendedor(e.target.value)}
                          placeholder="ex: João da Silva"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-sans"
                        />
                      </div>

                      {/* Tipo de Endereço / Espaço */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
                          Tipo de Endereço / Espaço
                        </label>
                        <select
                          value={nfEmitenteEnderecoTipo}
                          onChange={(e) => setNfEmitenteEnderecoTipo(e.target.value as any)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-sans cursor-pointer"
                        >
                          <option value="comercial">Endereço Comercial</option>
                          <option value="box">Box</option>
                          <option value="barraca">Barraca</option>
                        </select>
                      </div>

                      {/* Endereço Detalhado */}
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
                          {nfEmitenteEnderecoTipo === 'box' ? 'Número do Box' : nfEmitenteEnderecoTipo === 'barraca' ? 'Nome/Número da Barraca' : 'Endereço Comercial'}
                        </label>
                        <input
                          type="text"
                          value={nfEmitenteEndereco}
                          onChange={(e) => setNfEmitenteEndereco(e.target.value)}
                          placeholder={
                            nfEmitenteEnderecoTipo === 'box'
                              ? 'ex: Box 42 - Setor A'
                              : nfEmitenteEnderecoTipo === 'barraca'
                              ? 'ex: Barraca 12 - Hortifruti'
                              : 'ex: Av. das Nações, 1500'
                          }
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-sans"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsNfEmitenteEditing(false)}
                      className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-widest rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer border-0"
                    >
                      <Check size={14} /> Salvar Dados do Emitente
                    </button>
                  </div>
                )}
              </div>

              {/* CARD 2: CLIENTE */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4 text-left">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
                    <User size={16} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider">Cliente</h3>
                  </div>
                </div>

                {/* Opções de Menu para Nota Fiscal de Venda/Compra */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {[
                    { id: 'consumidor_cpf', label: '1. Consumidor Final (CPF)', icon: <User size={12} /> },
                    { id: 'empresa_cnpj', label: '2. Empresa para Empresa', icon: <Store size={12} /> },
                    { id: 'entrega_cliente', label: '3. Entrega ao Cliente', icon: <Truck size={12} /> },
                    { id: 'entrega_empresa', label: 'Entrega a Empresa/Comer.', icon: <Truck size={12} /> },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setNfDestinatarioTipo(opt.id as any);
                        // Limpar campos dinâmicos ao trocar opção
                        setNfDestinatarioNome('');
                        setNfDestinatarioDoc('');
                        setNfDestinatarioEndereco('');
                      }}
                      className={cn(
                        "p-2.5 rounded-xl border font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all text-center",
                        nfDestinatarioTipo === opt.id
                          ? "bg-blue-600 border-blue-600 text-white shadow-md font-black scale-[1.01]"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>

                {/* Campos do Cliente baseados no tipo selecionado */}
                <div className="space-y-3 pt-2">
                  
                  {/* Nome / Razão Social */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
                      {nfDestinatarioTipo === 'consumidor_cpf' || nfDestinatarioTipo === 'entrega_cliente'
                        ? 'Nome do Cliente'
                        : nfDestinatarioTipo === 'empresa_cnpj'
                        ? 'Nome da Empresa / Restaurante (Razão Social)'
                        : 'Nome da Empresa / Comerciante CLIENTE'}
                    </label>
                    <input
                      type="text"
                      value={nfDestinatarioNome}
                      onChange={(e) => setNfDestinatarioNome(e.target.value)}
                      placeholder={
                        nfDestinatarioTipo === 'consumidor_cpf' || nfDestinatarioTipo === 'entrega_cliente'
                          ? 'ex: Maria Oliveira de Souza'
                          : 'ex: Restaurante Sabor e Cia Ltda'
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans"
                    />
                  </div>

                  {/* Documento (CPF / CNPJ / CPF-CNPJ-RG) */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
                      {nfDestinatarioTipo === 'consumidor_cpf' || nfDestinatarioTipo === 'entrega_cliente'
                        ? 'CPF do Cliente'
                        : nfDestinatarioTipo === 'empresa_cnpj'
                        ? 'CNPJ da Empresa / Restaurante'
                        : 'CPF, CNPJ OU RG da Empresa/Comerciante'}
                    </label>
                    <input
                      type="text"
                      value={nfDestinatarioDoc}
                      onChange={(e) => setNfDestinatarioDoc(e.target.value)}
                      placeholder={
                        nfDestinatarioTipo === 'consumidor_cpf' || nfDestinatarioTipo === 'entrega_cliente'
                          ? '000.000.000-00'
                          : nfDestinatarioTipo === 'empresa_cnpj'
                          ? '00.000.000/0001-00'
                          : 'Digite o Documento'
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
                    />
                  </div>

                  {/* Endereço (Condicional) */}
                  {(nfDestinatarioTipo === 'entrega_cliente' || nfDestinatarioTipo === 'entrega_empresa') && (
                    <div className="space-y-1 animate-fade-in">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
                        Endereço de Entrega Completo
                      </label>
                      <input
                        type="text"
                        value={nfDestinatarioEndereco}
                        onChange={(e) => setNfDestinatarioEndereco(e.target.value)}
                        placeholder="Rua, Número, Bairro, Cidade - UF"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* CARD 3: BANCO DE DADOS GS1 BRASIL & CONTROLE DE QUALIDADE */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4 text-left">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold">
                      <Barcode size={16} />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider">Dados de Sistema de Controle de Materiais</h3>
                      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Rastreio de códigos de barra</p>
                    </div>
                  </div>
                </div>

                {/* ADICIONADO: ESCOLHA O PEDIDO */}
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
                  <span className="text-[9px] font-black text-indigo-700 uppercase tracking-widest block">Selecionar Venda</span>
                  
                  <div className="space-y-1 text-left">
                    <label className="text-[8px] font-bold text-slate-400 uppercase">Selecione uma venda da lista 'Minha Venda'</label>
                    <select
                      value={nfSelectedOrderId}
                      onChange={(e) => {
                        const orderId = e.target.value;
                        setNfSelectedOrderId(orderId);
                        if (orderId === 'carrinho_ativo') {
                          const imported = items.map(item => {
                            const dbProduct = products.find(p => p.name.toLowerCase() === item.name.toLowerCase());
                            return {
                              id: item.id || Math.random().toString(),
                              name: item.name,
                              quantity: item.quantity,
                              price: item.price,
                              total: typeof item.total === 'number' ? item.total : (item.quantity * item.price),
                              barcode: dbProduct?.codigoBarras || '',
                              comercializacao: item.comercializacao || dbProduct?.comercializacao || '',
                              tamanho: item.tamanho || dbProduct?.tamanho || '',
                              weightPerUnit: item.weightPerUnit || dbProduct?.weightPerUnit || 0,
                              unit: item.unit || dbProduct?.unit || 'unit'
                            };
                          });
                          setNfItems(imported);
                          setNfDestinatarioNome(customerName || '');
                          setNfDestinatarioDoc(customerDoc || '');
                          setNfPaymentMethod(paymentMethod || 'dinheiro');
                          setNfAmountReceived(amountReceived || 0);
                          setNfChange(Math.max(0, amountReceived - total));
                        } else {
                          const sale = salesHistory.find(s => s.id === orderId);
                          if (sale) {
                            const imported = sale.items.map((item: any) => {
                              const dbProduct = products.find(p => p.name.toLowerCase() === item.name.toLowerCase());
                              return {
                                id: item.id || Math.random().toString(),
                                name: item.name,
                                quantity: item.quantity,
                                price: item.price,
                                total: typeof item.total === 'number' ? item.total : (item.quantity * item.price),
                                barcode: dbProduct?.codigoBarras || '',
                                comercializacao: item.comercializacao || dbProduct?.comercializacao || '',
                                tamanho: item.tamanho || dbProduct?.tamanho || '',
                                weightPerUnit: item.weightPerUnit || dbProduct?.weightPerUnit || 0,
                                unit: item.unit || dbProduct?.unit || 'unit'
                              };
                            });
                            setNfItems(imported);
                            setNfDestinatarioNome(sale.customerName || '');
                            setNfDestinatarioDoc(sale.customerDoc || '');
                            setNfPaymentMethod(sale.paymentMethod || 'dinheiro');
                            setNfAmountReceived(sale.amountReceived || 0);
                            setNfChange(sale.change || 0);
                            if (sale.paymentMethod) {
                              setPaymentMethod(sale.paymentMethod);
                            }
                          } else {
                            setNfItems([]);
                            setNfDestinatarioNome('');
                            setNfDestinatarioDoc('');
                            setNfPaymentMethod('dinheiro');
                            setNfAmountReceived(0);
                            setNfChange(0);
                          }
                        }
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer font-sans"
                    >
                      <option value="">-- Selecionar Venda --</option>
                      {items.length > 0 && (
                        <option value="carrinho_ativo" className="text-emerald-700 font-bold">
                          🛒 Carrinho Ativo (Atual de Lançamentos) - {items.length} itens (R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                        </option>
                      )}
                      {salesHistory.filter(Boolean).map((sale, idx) => {
                        const orderNum = salesHistory.length - idx;
                        return (
                          <option key={sale.id} value={sale.id}>
                            📦 Pedido #{orderNum} - {sale.customerName || 'Sem Nome'} ({sale.date}) - R$ {sale.total?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* RESUMO DO PEDIDO HOMOLOGADO - CHECKLIST COMPLETO */}
                  {nfSelectedOrderId ? (() => {
                    const selectedSale = nfSelectedOrderId === 'carrinho_ativo'
                      ? {
                          orderNumber: salesHistory.length + 1,
                          customerName: customerName || 'Consumidor Final',
                          customerDoc: customerDoc || '',
                          companyName: nfEmitenteNome || '',
                          companyDoc: nfEmitenteDoc || '',
                          companyAddress: nfEmitenteEndereco || '',
                          vendorName: nfEmitenteNomeVendedor || '',
                          companyType: nfEmitenteTipo,
                          companyPapel: nfEmitentePapel,
                          companyAddressTipo: nfEmitenteEnderecoTipo,
                          companyDocTipo: nfEmitenteDocTipo,
                          companyDocNumero: nfEmitenteDocNumero,
                          date: new Date().toLocaleString('pt-BR'),
                          items: nfItems,
                          total: nfItems.reduce((acc, i) => acc + (typeof i.total === 'number' ? i.total : (i.quantity * i.price)), 0),
                          paymentMethod: nfPaymentMethod,
                          amountReceived: nfAmountReceived,
                          change: nfChange
                        }
                      : salesHistory.find(s => s.id === nfSelectedOrderId);

                    if (!selectedSale) return null;

                    return (
                      <div className="space-y-6 pt-4 border-t border-slate-100">
                        <div className="flex justify-between items-center bg-indigo-50/60 border border-indigo-100/50 rounded-2xl px-4 py-3">
                          <div>
                            <p className="text-xs font-black text-indigo-900 uppercase tracking-wide flex items-center gap-1.5">
                              <CheckCircle size={14} className="text-emerald-600 shrink-0" />
                              Documentação e Nota Fiscal
                            </p>
                          </div>
                          <span className="text-[9px] bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded-xl font-black uppercase tracking-wider border border-indigo-200">
                            {nfSelectedOrderId === 'carrinho_ativo' ? 'Carrinho Ativo' : 'Minha Venda'}
                          </span>
                        </div>

                        {/* CARD 1: DADOS DA EMPRESA */}
                        <div className="bg-slate-50 border border-slate-200/60 rounded-3xl p-5 space-y-3.5 relative overflow-hidden text-left">
                          <h4 className="text-[10px] font-black text-indigo-800 uppercase tracking-widest flex items-center gap-2 pb-2 border-b border-slate-200/50">
                            🏢 Empresa ou Comerciante
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10px] text-slate-600 font-semibold uppercase tracking-wider">
                            <div>
                              {(() => {
                                const currentType = nfEmitenteTipo || selectedSale.companyType;
                                let tipoLabel = 'Não informado';
                                if (currentType === 'feirante_cpf') tipoLabel = 'Feirante Autônomo (CPF)';
                                else if (currentType === 'empresa_cnpj') tipoLabel = 'Empresa (CNPJ) para Empresa';
                                else if (currentType === 'feirante_cnpj') tipoLabel = 'Feirante Autônomo CNPJ';
                                else if (currentType === 'comerciante_cpf') tipoLabel = 'Comerciante CPF/RG';

                                return (
                                  <>
                                    <p className="text-[8px] text-slate-400 font-bold mb-0.5">Empresa [TIPO DE EMISSOR]</p>
                                    <strong className="text-slate-800 font-sans">{tipoLabel}</strong>
                                  </>
                                );
                              })()}
                            </div>
                            <div>
                              {(() => {
                                return (
                                  <>
                                    <p className="text-[8px] text-slate-400 font-bold mb-0.5">Minha Empresa [NOME DA EMPRESA / EMPREENDIMENTO]</p>
                                    <strong className="text-slate-800 font-sans">{nfEmitenteNome || selectedSale.companyName || 'Não informado'}</strong>
                                  </>
                                );
                              })()}
                            </div>
                            {(nfEmitenteDoc || selectedSale.companyDoc) && (
                              <div>
                                <p className="text-[8px] text-slate-400 font-bold mb-0.5">CNPJ / CPF (Principal)</p>
                                <strong className="text-slate-800 font-mono">{nfEmitenteDoc || selectedSale.companyDoc}</strong>
                              </div>
                            )}
                            <div>
                              <p className="text-[8px] text-slate-400 font-bold mb-0.5">
                                {(nfEmitentePapel || selectedSale.companyPapel) === 'feirante' ? 'Feirante' : (nfEmitentePapel || selectedSale.companyPapel) === 'comerciante' ? 'Comerciante' : 'Vendedor'}
                              </p>
                              <strong className="text-slate-800 font-sans">{nfEmitenteNomeVendedor || selectedSale.vendorName || 'Não informado'}</strong>
                            </div>
                            {(nfEmitenteDocNumero || selectedSale.companyDocNumero) && (
                              <div>
                                <p className="text-[8px] text-slate-400 font-bold mb-0.5">
                                  Doc. {nfEmitenteDocTipo || selectedSale.companyDocTipo || 'CPF/RG'}
                                </p>
                                <strong className="text-slate-800 font-mono">{nfEmitenteDocNumero || selectedSale.companyDocNumero}</strong>
                              </div>
                            )}
                            <div className="sm:col-span-2">
                              <p className="text-[8px] text-slate-400 font-bold mb-0.5">
                                {(nfEmitenteEnderecoTipo || selectedSale.companyAddressTipo) === 'box' ? 'Box' : (nfEmitenteEnderecoTipo || selectedSale.companyAddressTipo) === 'barraca' ? 'Barraca' : 'Endereço Comercial'}
                              </p>
                              <strong className="text-slate-800 font-sans">{nfEmitenteEndereco || selectedSale.companyAddress || 'Não informado'}</strong>
                            </div>
                          </div>
                        </div>

                        {/* CARD 2: DADOS DO CLIENTE */}
                        <div className="bg-slate-50 border border-slate-200/60 rounded-3xl p-5 space-y-3.5 relative overflow-hidden text-left">
                          <h4 className="text-[10px] font-black text-indigo-800 uppercase tracking-widest flex items-center gap-2 pb-2 border-b border-slate-200/50">
                            👤 Cliente
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10px] text-slate-600 font-semibold uppercase tracking-wider">
                            <div>
                              <p className="text-[8px] text-slate-400 font-bold mb-0.5">Nome</p>
                              <strong className="text-slate-800 font-sans">{nfDestinatarioNome || 'Não informado'}</strong>
                            </div>
                            <div>
                              <p className="text-[8px] text-slate-400 font-bold mb-0.5">CPF</p>
                              <strong className="text-slate-800 font-mono">{nfDestinatarioDoc || 'Não informado'}</strong>
                            </div>
                          </div>
                        </div>

                        {/* CARD 3: PRODUTO VENDIDO */}
                        <div className="bg-slate-50 border border-slate-200/60 rounded-3xl p-5 space-y-3.5 relative overflow-hidden text-left">
                          <h4 className="text-[10px] font-black text-indigo-800 uppercase tracking-widest flex items-center gap-2 pb-2 border-b border-slate-200/50">
                            📦 Produto Vendido
                          </h4>
                          <div className="space-y-3">
                            {selectedSale.items?.map((item: any, idx: number) => {
                              const itemSubtotal = typeof item.total === 'number' ? item.total : (item.quantity * item.price);
                              const unitPrice = typeof item.price === 'number' ? item.price : 0;
                              return (
                                <div key={idx} className="p-3 bg-white border border-slate-100 rounded-2xl space-y-2 text-[10px]">
                                  <div className="flex justify-between font-black text-slate-800 text-[11px] border-b border-slate-100 pb-1">
                                    <span>{item.name.toUpperCase()}</span>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-slate-600 font-semibold uppercase tracking-wider text-[9px]">
                                    <div>
                                      <p className="text-[8px] text-slate-400 font-bold">Nome</p>
                                      <strong className="text-slate-800">{item.name}</strong>
                                    </div>
                                    <div>
                                      <p className="text-[8px] text-slate-400 font-bold">Categoria</p>
                                      <strong className="text-slate-800">{item.segmento || 'Não informado'}</strong>
                                    </div>
                                    <div>
                                      <p className="text-[8px] text-slate-400 font-bold">Quantidade</p>
                                      <strong className="text-slate-800">{item.quantity}</strong>
                                    </div>
                                    <div>
                                      <p className="text-[8px] text-slate-400 font-bold">Valor do Produto</p>
                                      <strong className="text-slate-800 font-mono">R$ {unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                                    </div>
                                    {item.tamanho ? (
                                      <div>
                                        <p className="text-[8px] text-slate-400 font-bold">Tamanho</p>
                                        <strong className="text-slate-800">{item.tamanho}</strong>
                                      </div>
                                    ) : null}
                                    {item.comercializacao ? (
                                      <div>
                                        <p className="text-[8px] text-slate-400 font-bold">Menu Comercialização</p>
                                        <strong className="text-slate-800">{item.comercializacao}</strong>
                                      </div>
                                    ) : null}
                                    {(item.weightPerUnit && item.weightPerUnit > 0) ? (
                                      <div>
                                        <p className="text-[8px] text-slate-400 font-bold">Peso ou Medida</p>
                                        <strong className="text-slate-800">{formatarMercadoria(item.weightPerUnit, item.unit || 'unit')}</strong>
                                      </div>
                                    ) : null}
                                    <div>
                                      <p className="text-[8px] text-slate-400 font-bold">Valor Total</p>
                                      <strong className="text-emerald-700 font-mono font-black">R$ {itemSubtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* CARD 5: RESUMO DO PEDIDO */}
                        <div className="bg-slate-50 border border-slate-200/60 rounded-3xl p-5 space-y-3.5 relative overflow-hidden text-left">
                          <h4 className="text-[10px] font-black text-indigo-800 uppercase tracking-widest flex items-center gap-2 pb-2 border-b border-slate-200/50">
                            📋 Resumo do Pedido
                          </h4>
                          {(() => {
                            const [saleDate, saleTime] = selectedSale.date ? selectedSale.date.replace(',', '').split(' ') : ['', ''];
                            const saleIndex = salesHistory.findIndex(s => s.id === nfSelectedOrderId);
                            const displayOrderNumber = nfSelectedOrderId === 'carrinho_ativo'
                              ? `Pedido ${salesHistory.length + 1}`
                              : saleIndex !== -1
                              ? `Pedido ${salesHistory.length - saleIndex}`
                              : selectedSale.orderNumber
                              ? `Pedido ${selectedSale.orderNumber}`
                              : 'Não informado';
                            return (
                              <div className="grid grid-cols-2 gap-4 text-[10px] text-slate-600 font-semibold uppercase tracking-wider">
                                <div>
                                  <p className="text-[8px] text-slate-400 font-bold mb-0.5">Número do Pedido</p>
                                  <strong className="text-slate-800 text-xs font-bold">{displayOrderNumber}</strong>
                                </div>
                                <div>
                                  <p className="text-[8px] text-slate-400 font-bold mb-0.5">Data da Venda</p>
                                  <strong className="text-slate-800 font-sans">{saleDate || 'Não informado'}</strong>
                                </div>
                                <div>
                                  <p className="text-[8px] text-slate-400 font-bold mb-0.5">Hora da Venda</p>
                                  <strong className="text-slate-800 font-sans">{saleTime || 'Não informado'}</strong>
                                </div>
                                <div>
                                  <p className="text-[8px] text-slate-400 font-bold mb-0.5">Forma de Pagamento</p>
                                  <strong className="text-indigo-900 font-sans">
                                    {obterLabelPagamento(selectedSale.paymentMethod).toUpperCase()}
                                  </strong>
                                </div>
                                <div>
                                  <p className="text-[8px] text-slate-400 font-bold mb-0.5">Valor Recebido</p>
                                  <strong className="text-slate-800 font-mono">
                                    R$ {selectedSale.amountReceived?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
                                  </strong>
                                </div>
                                <div>
                                  <p className="text-[8px] text-slate-400 font-bold mb-0.5">Troco</p>
                                  <strong className="text-amber-700 font-mono">
                                    R$ {selectedSale.change?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
                                  </strong>
                                </div>
                                <div className="col-span-2">
                                  <p className="text-[8px] text-slate-400 font-bold mb-0.5">Status do Pedido</p>
                                  <span className="inline-block text-[8px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-black uppercase">
                                    CONCLUÍDO
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* CARD 4: IDENTIFICAÇÃO GS1 */}
                        <div className="bg-slate-50 border border-slate-200/60 rounded-3xl p-5 space-y-3.5 relative overflow-hidden text-left">
                          <h4 className="text-[10px] font-black text-indigo-800 uppercase tracking-widest flex items-center gap-2 pb-2 border-b border-slate-200/50">
                            🏷 Informações do Produto
                          </h4>
                          <div className="space-y-4">
                            {selectedSale.items?.map((item: any, idx: number) => {
                              const dbProduct = products.find(p => p.name.toLowerCase() === item.name.toLowerCase());
                              const barcode = item.barcode || item.codigoBarras || dbProduct?.codigoBarras || '';
                              const gs1Info = barcode ? getGS1Info(barcode) : null;
                              return (
                                <div key={idx} className="p-3.5 bg-white border border-slate-100 rounded-2xl space-y-3">
                                  <div className="flex justify-between items-center border-b border-slate-50 pb-1.5">
                                    <strong className="text-slate-800 text-[10px] font-black uppercase">{item.name}</strong>
                                    {gs1Info?.isGtin ? (
                                      <span className="text-[8px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                        GTIN RASTREÁVEL
                                      </span>
                                    ) : (
                                      <span className="text-[8px] bg-slate-50 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                        SEM CÓDIGO GS1
                                      </span>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-2 gap-3 text-[10px] text-slate-600 font-semibold uppercase tracking-wider text-left">
                                    <div>
                                      <p className="text-[8px] text-slate-400 font-bold mb-0.5">GTIN</p>
                                      <strong className="text-slate-800 font-mono">{(gs1Info?.isGtin && barcode) ? barcode : 'Não informado'}</strong>
                                    </div>
                                    <div>
                                      <p className="text-[8px] text-slate-400 font-bold mb-0.5">EAN</p>
                                      <strong className="text-slate-800 font-mono">{(gs1Info?.format?.startsWith('EAN') && barcode) ? barcode : 'Não informado'}</strong>
                                    </div>
                                    <div>
                                      <p className="text-[8px] text-slate-400 font-bold mb-0.5">Código de Barras</p>
                                      <strong className="text-slate-800 font-mono">{barcode || 'Não informado'}</strong>
                                    </div>
                                    <div>
                                      <p className="text-[8px] text-slate-400 font-bold mb-0.5">Origem</p>
                                      <strong className="text-slate-800">{gs1Info?.prefixCountry || 'Não informado'}</strong>
                                    </div>
                                    <div className="col-span-2">
                                      <p className="text-[8px] text-slate-400 font-bold mb-0.5">Prefixo GS1</p>
                                      <strong className="text-slate-800 font-mono">{gs1Info?.companyPrefix || 'Não informado'}</strong>
                                    </div>
                                  </div>

                                  {/* Visual Barcode (Preserved from original) */}
                                  <div className="flex items-center gap-4 justify-start pt-1.5 border-t border-slate-50">
                                    {barcode && (
                                      <div className="flex flex-col items-center gap-0.5 border border-slate-100 p-1.5 rounded-lg bg-slate-50">
                                        <div className="flex items-end h-6 gap-[1px]">
                                          {[1, 2, 1, 3, 1, 2, 1, 3, 2, 1, 2, 1, 2, 1].map((w, i) => (
                                            <div key={i} className="bg-slate-800" style={{ width: `${w}px`, height: '100%' }} />
                                          ))}
                                        </div>
                                        <span className="text-[6.5px] font-mono text-slate-500">{barcode}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })() : (
                    <div className="text-center py-10 border border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                      <Barcode size={32} className="text-slate-300 mx-auto animate-pulse mb-2" />
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Informação de Nota Fiscal.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* CARD 4: CONSULTA E VALIDAÇÃO DE NOTA FISCAL */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4 text-left">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
                      <Search size={16} />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider">Consulta de Notas Fiscais</h3>
                      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Código de Acesso do Aplicativo Feira Livre</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 text-left">
                  {/* METODO 1: BUSCA POR DIGITAÇÃO */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                    <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest block">Busca por Código do Aplicativo</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={nfSearchInput}
                        onChange={(e) => setNfSearchInput(e.target.value)}
                        placeholder="Digite o Código de Acesso do App (ex: FL-2026-0002-3A9B)"
                        className="flex-1 bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!nfSearchInput.trim()) return;
                          handleNfCodeDetected(nfSearchInput);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase px-4 py-2 rounded-xl transition-all tracking-wider shrink-0 cursor-pointer"
                      >
                        Buscar
                      </button>
                    </div>
                  </div>

                  {/* ALERTA DE RESULTADO */}
                  {nfSearchResultMessage && (
                    <div className={`p-4 rounded-2xl border text-left flex items-start gap-2.5 ${
                      nfSearchResultMessage.type === 'success' 
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}>
                      <div className="mt-0.5 shrink-0">
                        {nfSearchResultMessage.type === 'success' ? (
                          <CheckCircle size={14} className="text-emerald-600" />
                        ) : (
                          <Info size={14} className="text-rose-600" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-wide">
                          {nfSearchResultMessage.type === 'success' ? 'Sucesso' : 'Erro de Consulta'}
                        </p>
                        <p className="text-[9.5px] font-medium leading-relaxed">
                          {nfSearchResultMessage.text}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* COLUNA DIREITA: CUPOM TÉRMICO E CONTROLE DE IMPRESSÃO (5 colunas) */}
            <div className="lg:col-span-5 space-y-4">
              
              {/* Botão de abrir cupom no lado direito */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (nfSelectedOrderId) {
                      setActiveTab('visualizar_cupom');
                    }
                  }}
                  disabled={!nfSelectedOrderId}
                  className={cn(
                    "h-5 w-14 text-[6px] font-black text-black bg-white border border-slate-300 rounded-none cursor-pointer flex items-center justify-center tracking-wide uppercase transition-all shadow-xs",
                    !nfSelectedOrderId 
                      ? "opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200" 
                      : "hover:bg-slate-50 active:bg-slate-100"
                  )}
                >
                  Visualizar Nota Fiscal
                </button>
              </div>
              
              {/* COMPATIBILIDADE CUPOM BLUETOOTH TÉRMICO 58mm */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3 text-left">
                  <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center font-bold">
                    <Receipt size={16} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider">NOTA FISCAL</h3>
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Visualização para Impressora Bluetooth</p>
                  </div>
                </div>

                {/* THE MOCK THERMAL COUPON PAPER */}
                <div className="bg-slate-100 p-4 rounded-3xl flex justify-center">
                  <div 
                    id="thermal-receipt-58mm"
                    className="w-full max-w-[280px] bg-white border border-slate-200 p-4 shadow-md font-mono text-[10px] text-slate-800 text-left relative overflow-hidden"
                    style={{ 
                      backgroundImage: 'linear-gradient(rgba(0,0,0,0.01) 50%, transparent 50%)',
                      backgroundSize: '100% 4px',
                      borderRadius: '4px'
                    }}
                  >
                    {/* Jagged thermal paper top effect */}
                    <div className="absolute top-0 inset-x-0 h-1 bg-repeat-x" style={{ backgroundImage: 'radial-gradient(circle, transparent 2px, white 2px)', backgroundSize: '6px 4px', backgroundPosition: 'left top' }} />

                    {(() => {
                      const selectedSale = nfSelectedOrderId === 'carrinho_ativo'
                        ? {
                            orderNumber: salesHistory.length + 1,
                            date: new Date().toLocaleString('pt-BR'),
                            companyName: nfEmitenteNome || '',
                            companyDoc: nfEmitenteDoc || '',
                            companyType: nfEmitenteTipo,
                            companyPapel: nfEmitentePapel,
                            vendorName: nfEmitenteNomeVendedor,
                            companyDocTipo: nfEmitenteDocTipo,
                            companyDocNumero: nfEmitenteDocNumero,
                            companyAddressTipo: nfEmitenteEnderecoTipo,
                            companyAddress: nfEmitenteEndereco
                          }
                        : salesHistory.find(s => s.id === nfSelectedOrderId);

                      const saleIndex = salesHistory.findIndex(s => s.id === nfSelectedOrderId);
                      const numPedido = nfSelectedOrderId === 'carrinho_ativo'
                        ? (salesHistory.length + 1)
                        : saleIndex !== -1
                        ? (salesHistory.length - saleIndex)
                        : selectedSale?.orderNumber ?? (salesHistory.length + 1);
                      const dataEmissao = selectedSale?.date ?? new Date().toLocaleString('pt-BR');
                      const emitenteNome = (nfEmitenteNome || selectedSale?.companyName || 'MINHA EMPRESA').trim();
                      const emitenteDoc = (nfEmitenteDoc || selectedSale?.companyDoc || '').trim();
                      
                      const currentEmitenteTipo = selectedSale?.companyType || nfEmitenteTipo;
                      const emitenteTipoLabel = currentEmitenteTipo === 'feirante_cpf'
                        ? (selectedSale?.companyDocTipo || nfEmitenteDocTipo || 'CPF').toUpperCase()
                        : 'CNPJ';

                      const papelLabel = (nfEmitentePapel || selectedSale?.companyPapel || 'vendedor').toUpperCase();
                      const papelNome = nfEmitenteNomeVendedor || selectedSale?.vendorName || '';
                      const endTipoLabel = (nfEmitenteEnderecoTipo || selectedSale?.companyAddressTipo || 'comercial') === 'box' ? 'BOX' : (nfEmitenteEnderecoTipo || selectedSale?.companyAddressTipo || 'comercial') === 'barraca' ? 'BARRACA' : 'ENDEREÇO';
                      const endDet = nfEmitenteEndereco || selectedSale?.companyAddress || '';

                      return (
                        <div className="text-center space-y-1.5 pt-2 uppercase">
                          <p className="font-black text-[12px] text-slate-950 tracking-wider">NOTA FISCAL</p>
                          <p className="font-extrabold text-[9px] text-slate-800 tracking-wide">SISTEMA DE CONTROLE</p>
                          <p className="font-black text-[10px] text-indigo-950 pt-0.5">
                            PEDIDO #{numPedido}
                          </p>
                          <div className="my-1 border-b border-dashed border-slate-200" />
                          {emitenteNome && (
                            <p className="font-black text-[9px] text-slate-900 leading-tight">
                              {emitenteNome}
                            </p>
                          )}
                          {emitenteDoc && (
                            <p className="text-[8px] text-slate-600 font-bold">
                              {emitenteTipoLabel}: {emitenteDoc}
                            </p>
                          )}
                          {papelNome && (
                            <p className="text-[8px] text-slate-700 font-extrabold">
                              {papelLabel}: {papelNome}
                            </p>
                          )}
                          <p className="text-[7.5px] text-slate-600 font-semibold leading-tight">
                            {endTipoLabel}: {endDet ? endDet : 'ENDEREÇO NÃO ENCONTRADO'}
                          </p>
                          <p className="text-[7.5px] text-slate-500">Emissão: {dataEmissao}</p>
                        </div>
                      );
                    })()}

                    <div className="my-2 border-b border-dashed border-slate-300" />

                    {/* RECIPIENT */}
                    <div className="space-y-0.5 uppercase text-[9px]">
                      <p className="font-black">CLIENTE:</p>
                      <p className="break-words font-semibold">{nfDestinatarioNome || 'CONSUMIDOR FINAL'}</p>
                      {(() => {
                        const docLabel = (nfDestinatarioTipo === 'empresa_cnpj' || nfDestinatarioTipo === 'entrega_empresa') ? 'CNPJ' : 'CPF';
                        return <p>{docLabel}: {nfDestinatarioDoc || 'SEM CPF'}</p>;
                      })()}
                      {nfDestinatarioEndereco && (
                        <p className="text-[8px] break-words">ENDEREÇO: {nfDestinatarioEndereco}</p>
                      )}
                    </div>

                    <div className="my-2 border-b border-dashed border-slate-300" />

                    {/* ITEMS LIST */}
                    <div className="space-y-3">
                      <div className="font-black text-[9px] border-b border-slate-200 pb-1 text-left">
                        {nfItems.length <= 1 ? 'ITEM' : 'ITENS'}
                      </div>

                      {nfItems.length === 0 ? (
                        <div className="text-center py-4 text-slate-400 italic">
                          (Nenhum item lançado)
                        </div>
                      ) : (
                        nfItems.map((item, idx) => {
                          const unitPrice = typeof item.price === 'number' ? item.price : 0;
                          return (
                            <div key={`${item.id}-${idx}`} className="space-y-1 text-left border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                              <p className="text-[9px] font-black text-slate-900">
                                {idx + 1} {item.name.toUpperCase()}
                                {item.barcode ? ` - código de barras: ${item.barcode}` : ''}
                              </p>
                              
                              <div className="pl-2 space-y-0.5 text-[8px] font-bold text-slate-500 uppercase leading-relaxed">
                                <p>QUANTIDADE: <span className="text-slate-950 font-black">{item.quantity}</span></p>
                                {(() => {
                                  const displayPesoMedida = item.comercializacao || formatarMercadoria(item.weightPerUnit || 0, item.unit || 'unit');
                                  return displayPesoMedida ? (
                                    <p>PESO/MEDIDA: <span className="text-slate-950 font-black">{displayPesoMedida.toUpperCase()}</span></p>
                                  ) : null;
                                })()}
                                {item.tamanho && (
                                  <p>TAMANHO: <span className="text-slate-950 font-black">{item.tamanho.toUpperCase()}</span></p>
                                )}
                                <p>
                                  VALOR UNITÁRIO: <span className="text-slate-950 font-black">R$ {unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                  {" | "}
                                  VALOR TOTAL: <span className="text-slate-950 font-black">R$ {(typeof item.total === 'number' ? item.total : item.quantity * unitPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="my-2 border-b border-dashed border-slate-300" />

                    {/* TOTALS */}
                    {(() => {
                      const totalNf = nfItems.reduce((acc, i) => acc + (typeof i.total === 'number' ? i.total : (i.quantity * i.price)), 0);
                      const totalQty = nfItems.reduce((acc, i) => acc + i.quantity, 0);
                      return (
                        <div className="space-y-3 uppercase text-[9px] text-slate-800">
                          {/* 1. QUANTIDADES (Logo após os Itens) */}
                          <div className="space-y-0.5 text-left text-slate-500 text-[8.5px] font-bold px-1">
                            <p className="flex justify-between">
                              <span>TOTAL DE ITENS:</span>
                              <span className="text-slate-950 font-extrabold">{totalQty}</span>
                            </p>
                          </div>

                          <div className="my-1 border-b border-dotted border-slate-300" />

                          {/* 2. SEÇÃO DE PAGAMENTO */}
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-2 space-y-0.5 text-left">
                            <p className="flex justify-between font-black text-slate-900 border-b border-slate-200/50 pb-1 mb-1">
                              <span>MÉTODO DE PAGAMENTO:</span>
                              <span className="text-indigo-800">{obterLabelPagamento(nfPaymentMethod).toUpperCase()}</span>
                            </p>
                            <p className="flex justify-between font-bold text-slate-600">
                              <span>VALOR RECEBIDO:</span>
                              <span>R$ {nfAmountReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </p>
                            <p className="flex justify-between text-amber-800 font-extrabold">
                              <span>TROCO:</span>
                              <span>R$ {nfChange.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </p>
                          </div>

                          {/* 3. TOTAL GERAL */}
                          <p className="flex justify-between text-xs font-black text-slate-950 px-1 pt-0.5 border-t border-dashed border-slate-200 pt-1.5">
                            <span>TOTAL:</span>
                            <span className="text-emerald-700 font-bold">R$ {totalNf.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </p>
                        </div>
                      );
                    })()}

                    <div className="my-3 border-b border-dashed border-slate-300" />

                    {/* QUALITY CONTROL / GS1 BRASIL SEAL */}
                    <div className="bg-slate-50 border border-slate-200/60 rounded p-2 text-center">
                      <p className="text-[7.5px] text-slate-600 font-black leading-normal px-1 break-words uppercase">
                        VERIFICAÇÃO DA NOTA FISCAL POR CÓDIGO OU DOCUMENTO NO APLICATIVO OU SITE FEIRA LIVRE
                      </p>
                    </div>

                    {/* QR CODE DE CONSULTA E CÓDIGO DO APP */}
                    {(() => {
                      const activeSale = nfSelectedOrderId === 'carrinho_ativo'
                        ? {
                            id: 'carrinho_ativo',
                            orderNumber: salesHistory.length + 1,
                            companyDoc: nfEmitenteDoc,
                            date: new Date().toLocaleString('pt-BR')
                          }
                        : salesHistory.find(s => s.id === nfSelectedOrderId);

                      if (!activeSale) return null;

                      const appCode = obterCodigoAcessoApp(activeSale);

                      return (
                        <div className="mt-4 pt-3 border-t border-dashed border-slate-300 text-center space-y-1">
                          {/* CODIGO APP */}
                          <div className="space-y-0.5 text-left">
                            <span className="text-[6.5px] text-slate-400 font-extrabold block uppercase tracking-wider">
                              Código de Acesso App Feira Livre Calculadora
                            </span>
                            <p className="text-[7.5px] text-indigo-900 font-mono font-black uppercase tracking-wider">
                              {appCode}
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Jagged thermal paper bottom effect */}
                    <div className="absolute bottom-0 inset-x-0 h-1 bg-repeat-x rotate-180" style={{ backgroundImage: 'radial-gradient(circle, transparent 2px, white 2px)', backgroundSize: '6px 4px', backgroundPosition: 'left top' }} />
                  </div>
                </div>



              </div>

            </div>

          </div>

        </div>

      ) : activeTab === 'armazenagem' ? (
        <div id="armazenagem-tab-panel" className="space-y-8 animate-fade-in pb-16">
          
          {/* Banner de Controle Vision AI v2 */}
          <div className="bg-slate-900 text-white rounded-[32px] p-6 border border-slate-800 shadow-xl flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-start md:items-center gap-4 text-left">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 shrink-0">
                <Cpu size={26} className="animate-pulse" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-400 font-extrabold px-2 py-0.5 rounded tracking-widest uppercase font-mono">
                    Multimodal Intelligence v2
                  </span>
                  <span className="text-[9px] bg-slate-800 text-slate-400 font-mono font-bold px-1.5 py-0.5 rounded uppercase">
                    Core Local
                  </span>
                </div>
                <h2 className="text-base md:text-lg font-black text-white uppercase tracking-tight mt-1.5">
                  Painel de Sensores Vision AI Integrado
                </h2>
                <p className="text-xs text-slate-400 font-medium max-w-2xl leading-relaxed mt-0.5">
                  Conecte balanças, audite fardos por detecção de imagens, faça OCR inteligente de lote e validade, e capture evidências de rastreabilidade local.
                </p>
              </div>
            </div>
            
            <button
              type="button"
              onClick={() => {
                setShowVisionAIModal(true);
              }}
              className="w-full md:w-auto shrink-0 px-6 py-4 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-950 font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-emerald-500/15 flex items-center justify-center gap-2.5 border-0 cursor-pointer"
            >
              <Camera size={14} /> Abrir Vision AI
            </button>
          </div>

          {/* 1. Métricas Bento-Style */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Archive size={20} />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Produtos Monitorados</span>
                <span className="text-xl font-black text-slate-800">{products.length} itens</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Cpu size={20} />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Leitores de Entrada</span>
                <span className="text-xl font-black text-slate-800">4 Câmeras</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <Scale size={20} />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Balança Integrada</span>
                <span className="text-xl font-black text-slate-800">USB / Bluetooth</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Alertas de Controle</span>
                <span className="text-xl font-black text-slate-800">
                  {Object.values(productsSmartMetadata).filter((m: any) => m.situacao === 'Quarentena' || m.situacao === 'Descartado').length} Alertas
                </span>
              </div>
            </div>
          </div>

          {/* 2. Conteúdo Principal Dividido em Colunas */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* COLUNA ESQUERDA: LISTA DE PRODUTOS */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-black text-slate-800">Produtos no Estoque</h3>
                    <p className="text-[11px] text-slate-400 font-medium">Selecione para ver a ficha ou pesar</p>
                  </div>
                  <span className="bg-emerald-50 text-emerald-700 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                    {products.length} itens salvos
                  </span>
                </div>

                {/* Filtros Internos */}
                <div className="space-y-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Pesquisar produto no estoque..."
                      value={traceabilityFilterSearch}
                      onChange={(e) => setTraceabilityFilterSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-semibold placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <select
                        value={traceabilityFilterStatus}
                        onChange={(e) => setTraceabilityFilterStatus(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200/80 p-2.5 rounded-xl text-[10px] font-bold text-slate-600 focus:outline-none"
                      >
                        <option value="">TODAS AS SITUAÇÕES</option>
                        <option value="Aprovado">🟢 Aprovado</option>
                        <option value="Em Análise">🟡 Em Análise</option>
                        <option value="Quarentena">🟠 Quarentena</option>
                        <option value="Descartado">🔴 Descartado</option>
                      </select>
                    </div>

                    <div>
                      <select
                        value={traceabilityFilterCategory}
                        onChange={(e) => setTraceabilityFilterCategory(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200/80 p-2.5 rounded-xl text-[10px] font-bold text-slate-600 focus:outline-none"
                      >
                        <option value="">TODAS AS CATEGORIAS</option>
                        <option value="Legumes, Verduras, Ervas e Raízes.">Legumes & Verduras</option>
                        <option value="Frutas Frescas">Frutas Frescas</option>
                        <option value="Laticínios e Ovos">Laticínios & Ovos</option>
                        <option value="Mercearia, Grãos e Temperos.">Mercearia & Grãos</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Lista de Cards de Produto */}
                <div className="space-y-3 max-h-[580px] overflow-y-auto pr-2 scrollbar-thin">
                  {products
                    .filter(p => {
                      const meta = productsSmartMetadata[p.id] || {};
                      const matchesSearch = p.name.toLowerCase().includes(traceabilityFilterSearch.toLowerCase()) || 
                                           (meta.marca && meta.marca.toLowerCase().includes(traceabilityFilterSearch.toLowerCase())) ||
                                           (meta.codigoGS1 && meta.codigoGS1.includes(traceabilityFilterSearch));
                      const matchesStatus = traceabilityFilterStatus ? meta.situacao === traceabilityFilterStatus : true;
                      const matchesCategory = traceabilityFilterCategory ? meta.categoria === traceabilityFilterCategory : true;
                      return matchesSearch && matchesStatus && matchesCategory;
                    })
                    .map(p => {
                      const meta = productsSmartMetadata[p.id] || {};
                      const isSelected = selectedTraceProductId === p.id;
                      
                      // Definir cor da situação do lote
                      const situacaoColors = {
                        'Aprovado': 'bg-emerald-50 text-emerald-700 border-emerald-100',
                        'Em Análise': 'bg-amber-50 text-amber-700 border-amber-100',
                        'Quarentena': 'bg-orange-50 text-orange-700 border-orange-100',
                        'Descartado': 'bg-rose-50 text-rose-700 border-rose-100'
                      };
                      const currentSituacao = meta.situacao || 'Aprovado';
                      
                      return (
                        <div
                          key={p.id}
                          className={cn(
                            "p-4 rounded-2xl border transition-all cursor-pointer relative",
                            isSelected 
                              ? "bg-emerald-50/40 border-emerald-500/30 ring-1 ring-emerald-500/20" 
                              : "bg-slate-50/50 hover:bg-slate-50 border-slate-100 hover:border-slate-200"
                          )}
                          onClick={() => selectProductForTraceability(p.id)}
                        >
                          <div className="flex gap-3.5 items-start">
                            {/* Thumbnail da Foto Principal */}
                            <div className="relative shrink-0">
                              {meta.fotoPrincipal ? (
                                <img
                                  src={meta.fotoPrincipal}
                                  alt={p.name}
                                  className="w-14 h-14 rounded-xl object-cover border border-slate-200/80"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-14 h-14 rounded-xl bg-slate-200 text-slate-500 flex flex-col items-center justify-center border border-slate-200">
                                  <Image size={16} />
                                  <span className="text-[8px] font-black uppercase mt-1">Sem Foto</span>
                                </div>
                              )}
                              
                              {/* Badge de situação pequena flutuante */}
                              <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full border border-white flex items-center justify-center shadow-sm" style={{
                                backgroundColor: currentSituacao === 'Aprovado' ? '#10b981' : currentSituacao === 'Em Análise' ? '#f59e0b' : currentSituacao === 'Quarentena' ? '#f97316' : '#ef4444'
                              }} />
                            </div>

                            {/* Informações Textuais */}
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex justify-between items-start gap-1">
                                <h4 className="text-xs font-black text-slate-800 truncate uppercase tracking-tight">{p.name}</h4>
                                <span className={cn("text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded border tracking-wider", situacaoColors[currentSituacao])}>
                                  {currentSituacao}
                                </span>
                              </div>
                              
                              <p className="text-[9px] text-slate-400 font-bold uppercase truncate">
                                {meta.marca ? `Marca: ${meta.marca}` : 'Marca não definida'} • {p.unit.toUpperCase()}
                              </p>
                              
                              <div className="flex items-center gap-1.5 pt-0.5 text-[9px] font-extrabold text-slate-500">
                                <span className="bg-slate-200/60 px-1.5 py-0.5 rounded text-slate-700">Ref: {meta.codigoInterno || `SKU-${p.id.substring(0, 5).toUpperCase()}`}</span>
                                {meta.lote && <span className="bg-indigo-50 px-1.5 py-0.5 rounded text-indigo-700 border border-indigo-100">Lote: {meta.lote}</span>}
                              </div>
                            </div>
                          </div>

                          {/* Seção Balança - Leitor de Peso por Produto */}
                          <div className="mt-3.5 pt-3 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5">
                              <Scale size={13} className="text-slate-400 shrink-0" />
                              <div className="text-left">
                                <span className="text-[7.5px] text-slate-400 font-extrabold uppercase block leading-none">Balança - Leitor de Peso</span>
                                <span className="text-xs font-mono font-black text-slate-700">
                                  {meta.peso ? `${Number(meta.peso).toFixed(3)} kg` : `${Number(p.weightPerUnit || 0).toFixed(3)} kg`}
                                </span>
                              </div>
                            </div>

                            {/* Seletor de Câmeras/Conectores e Leitor */}
                            <div className="flex items-center gap-1">
                              <select
                                value={isSelected && activeReaderType === 'balanca' ? scaleSourceMethod : 'ocr'}
                                onChange={(e) => {
                                  selectProductForTraceability(p.id);
                                  setScaleSourceMethod(e.target.value as any);
                                }}
                                className="bg-slate-100 border border-slate-200 rounded-lg p-1 text-[9px] font-black text-slate-600 focus:outline-none"
                              >
                                <option value="ocr">📷 Câmera (OCR Display)</option>
                                <option value="bluetooth">📶 Bluetooth Smart</option>
                                <option value="usb">🔌 USB Conectado</option>
                                <option value="serial">📠 Serial RS232</option>
                                <option value="photo">🖼️ Foto Balança</option>
                                <option value="manual">⌨️ Manual</option>
                              </select>

                              <button
                                type="button"
                                onClick={() => {
                                  selectProductForTraceability(p.id);
                                  const method = isSelected && activeReaderType === 'balanca' ? scaleSourceMethod : 'ocr';
                                  
                                  // Trigger scale reading
                                  setSelectedTraceProductId(p.id);
                                  setScaleSourceMethod(method);
                                  setActiveReaderType('balanca');
                                  setIsReaderActive(true);
                                  setIsSimulatingRead(true);

                                  // Simular leitura com timeout
                                  setTimeout(() => {
                                    const baseWeight = p.unit === 'kg' ? p.quantity : p.weightPerUnit || 0.850;
                                    const finalWeight = Number((baseWeight + (Math.random() * 0.4 - 0.2)).toFixed(3));
                                    const finalWeightClamped = Math.max(0.010, finalWeight);
                                    
                                    setCapturedWeightValue(finalWeightClamped);
                                    setTraceFormPeso(finalWeightClamped);
                                    setIsSimulatingRead(false);
                                    
                                    // Guardar automaticamente
                                    const updatedMetadata = {
                                      ...productsSmartMetadata,
                                      [p.id]: {
                                        ...(productsSmartMetadata[p.id] || {}),
                                        id: p.id,
                                        productName: p.name,
                                        peso: finalWeightClamped,
                                        marca: productsSmartMetadata[p.id]?.marca || '',
                                        categoria: productsSmartMetadata[p.id]?.categoria || p.segmento || 'Frutas Frescas',
                                        situacao: productsSmartMetadata[p.id]?.situacao || 'Aprovado'
                                      }
                                    };
                                    setProductsSmartMetadata(updatedMetadata);
                                    localStorage.setItem('feiralivre_products_smart_metadata', JSON.stringify(updatedMetadata));

                                    // Atualiza lista principal
                                    const updatedProds = products.map(item => {
                                      if (item.id === p.id) {
                                        return { ...item, weightPerUnit: finalWeightClamped };
                                      }
                                      return item;
                                    });
                                    setProducts(updatedProds);
                                    localStorage.setItem('feiralivre_products', JSON.stringify(updatedProds));

                                    // Show Toast
                                    setShowSuccessToast(true);
                                    setTimeout(() => setShowSuccessToast(false), 3000);
                                  }, 2000);
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[9px] uppercase tracking-wider px-2 py-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer border-0"
                              >
                                <Scale size={10} /> Ler Peso
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  
                  {products.length === 0 && (
                    <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-3xl space-y-3">
                      <Package size={28} className="text-slate-300 mx-auto" />
                      <div>
                        <h4 className="text-xs font-black text-slate-700 uppercase">Nenhum produto no estoque</h4>
                        <p className="text-[10px] text-slate-400 font-medium">Por favor, cadastre produtos na aba de "Produto" para gerenciar sua armazenagem.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* COLUNA DIREITA: CONSOLE SMART READER E FICHA COMPLETA */}
            <div className="lg:col-span-7 space-y-6">
              
              {!selectedTraceProductId ? (
                <div className="bg-white p-12 rounded-[32px] border border-slate-100 shadow-sm text-center space-y-4 flex flex-col items-center justify-center min-h-[500px]">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-400">
                    <Archive size={32} />
                  </div>
                  <div className="max-w-sm space-y-1">
                    <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Ficha & Leitor Inteligente</h3>
                    <p className="text-xs text-slate-400 font-medium leading-relaxed">
                      Selecione um produto da lista de estoque para realizar leituras inteligentes por câmera OCR, balança automatizada, leitura de lote 2D ou gerenciar a ficha técnica completa de rastreabilidade.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  
                  {/* CONSOLE DE LEITOR INTELIGENTE */}
                  <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[8px] text-emerald-600 font-extrabold uppercase tracking-widest block">Módulo Inteligente</span>
                        <h3 className="text-base font-black text-slate-800 uppercase">Leitor Integrado de Entrada</h3>
                      </div>
                      
                      {/* Método de leitura selecionado */}
                      <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveReaderType('ocr');
                            setIsReaderActive(false);
                          }}
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border-0",
                            activeReaderType === 'ocr' || activeReaderType === null
                              ? "bg-white text-slate-800 shadow-sm" 
                              : "text-slate-500 hover:text-slate-700"
                          )}
                        >
                          📷 OCR Texto
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveReaderType('balanca');
                            setIsReaderActive(false);
                          }}
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border-0",
                            activeReaderType === 'balanca' 
                              ? "bg-white text-slate-800 shadow-sm" 
                              : "text-slate-500 hover:text-slate-700"
                          )}
                        >
                          ⚖️ Balança
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveReaderType('etiqueta');
                            setIsReaderActive(false);
                          }}
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border-0",
                            activeReaderType === 'etiqueta' 
                              ? "bg-white text-slate-800 shadow-sm" 
                              : "text-slate-500 hover:text-slate-700"
                          )}
                        >
                          🏷️ Etiqueta 2D
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveReaderType('foto');
                            setIsReaderActive(false);
                          }}
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border-0",
                            activeReaderType === 'foto' 
                              ? "bg-white text-slate-800 shadow-sm" 
                              : "text-slate-500 hover:text-slate-700"
                          )}
                        >
                          🖼️ Foto ID
                        </button>
                      </div>
                    </div>

                    {/* INTERAÇÃO DA CÂMERA SIMULADA */}
                    <div className="bg-slate-900 rounded-3xl p-5 border border-slate-850 relative overflow-hidden text-center min-h-[220px] flex flex-col justify-between">
                      {/* Elementos de Câmera de Fundo */}
                      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]" />
                      
                      {/* Laser scanner vertical */}
                      {isReaderActive && (
                        <motion.div
                          animate={{ y: [0, 180, 0] }}
                          transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                          className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] z-20 pointer-events-none"
                        />
                      )}

                      {/* Top status overlay */}
                      <div className="z-10 flex justify-between items-center text-white text-[8px] font-mono tracking-widest uppercase">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("w-2 h-2 rounded-full", isReaderActive ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
                          <span>{isReaderActive ? "STREAM_ACTIVE" : "CAM_STANDBY"}</span>
                        </div>
                        <div className="text-slate-400">
                          {activeReaderType === 'ocr' || activeReaderType === null ? "MODO: OCR RECONHECIMENTO" : 
                           activeReaderType === 'balanca' ? "MODO: LEITOR DE BALANÇA" :
                           activeReaderType === 'etiqueta' ? "MODO: ETIQUETA LOTE 2D" : "MODO: IDENTIFICAÇÃO VISUAL"}
                        </div>
                      </div>

                      {/* Corpo do Feed / Simulação */}
                      <div className="my-auto py-4 z-10 flex flex-col items-center justify-center space-y-3">
                        {isSimulatingRead ? (
                          <div className="space-y-3">
                            <div className="w-10 h-10 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
                            <p className="text-xs font-bold text-emerald-400 font-mono tracking-wider animate-pulse">ANALISANDO DADOS COLETADOS...</p>
                          </div>
                        ) : !isReaderActive ? (
                          <div className="space-y-2">
                            <Camera size={36} className="text-slate-600 mx-auto block" />
                            <div className="space-y-0.5">
                              <h4 className="text-white text-xs font-black uppercase">Câmera desativada</h4>
                              <p className="text-slate-500 text-[10px] max-w-xs mx-auto">Ative a câmera para simular a leitura do produto e atualizar a ficha técnica.</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setIsReaderActive(true);
                              }}
                              className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-widest px-4 py-2 rounded-xl transition-all border-0 cursor-pointer"
                            >
                              Ativar Câmera
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2 text-center w-full max-w-sm">
                            {/* Alvos/Visores Virtuais */}
                            <div className="border border-dashed border-emerald-500/30 w-44 h-24 rounded-lg mx-auto flex items-center justify-center relative bg-emerald-500/5">
                              <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-emerald-400" />
                              <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-emerald-400" />
                              <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-emerald-400" />
                              <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-emerald-400" />
                              
                              {/* Texto do display da balança simulado */}
                              {activeReaderType === 'balanca' ? (
                                <div className="text-center font-mono space-y-0.5">
                                  <span className="text-[7px] text-emerald-300 font-bold uppercase tracking-widest">DISPLAY BALANÇA</span>
                                  <div className="text-xl font-black text-emerald-400 tracking-widest bg-black/60 px-2.5 py-1 rounded">
                                    {(capturedWeightValue || 1.250).toFixed(3)} <span className="text-[10px]">kg</span>
                                  </div>
                                </div>
                              ) : activeReaderType === 'etiqueta' ? (
                                <div className="space-y-1">
                                  <QrCode size={24} className="text-emerald-400 mx-auto animate-pulse" />
                                  <span className="text-[8px] text-emerald-300 font-bold block">DATAMATRIX / QR</span>
                                </div>
                              ) : activeReaderType === 'foto' ? (
                                <div className="space-y-1">
                                  <Image size={24} className="text-emerald-400 mx-auto" />
                                  <span className="text-[8px] text-emerald-300 font-bold block">RECONHECIMENTO VISUAL</span>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <Barcode size={24} className="text-emerald-400 mx-auto" />
                                  <span className="text-[8px] text-emerald-300 font-bold block">OCR TEXT SCAN</span>
                                </div>
                              )}
                            </div>

                            <p className="text-slate-400 text-[10px]">Aponte a câmera para o produto ou rótulo</p>
                            
                            <div className="flex justify-center gap-2 pt-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setIsSimulatingRead(true);
                                  setTimeout(() => {
                                    setIsSimulatingRead(false);
                                    
                                    const product = products.find(p => p.id === selectedTraceProductId);
                                    const pName = product ? product.name : 'Tomate';
                                    
                                    // Comportamento com base no modo selecionado
                                    if (activeReaderType === 'ocr' || activeReaderType === null) {
                                      setTraceFormMarca("Campo Verde Orgânicos");
                                      setTraceFormCategoria(product?.segmento || "Legumes, Verduras, Ervas e Raízes.");
                                      setTraceFormLote("L-OCR-" + Math.floor(Math.random() * 9000 + 1000));
                                      setTraceFormValidade("2026-08-25");
                                    } else if (activeReaderType === 'balanca') {
                                      const baseWeight = product?.unit === 'kg' ? product.quantity : product?.weightPerUnit || 1.200;
                                      const weight = Number((baseWeight + (Math.random() * 0.4 - 0.2)).toFixed(3));
                                      setCapturedWeightValue(Math.max(0.010, weight));
                                      setTraceFormPeso(Math.max(0.010, weight));
                                    } else if (activeReaderType === 'etiqueta') {
                                      setTraceFormCodigoGS1("789102" + Math.floor(Math.random() * 900000 + 100000));
                                      setTraceFormLote("LOT-EAN-" + Math.floor(Math.random() * 900 + 100));
                                      setTraceFormValidade("2026-09-15");
                                      setTraceFormFornecedor("Hortícola Sol do Amanhã");
                                      setTraceFormOrigem("Distribuidor CEAGESP SP");
                                    } else if (activeReaderType === 'foto') {
                                      setTraceFormMarca("Fazenda Vale Lindo");
                                      setTraceFormCategoria(product?.segmento || "Frutas Frescas");
                                      setTraceFormOrigem("Produtor Rural - Local");
                                    }

                                    // Show Toast
                                    setShowSuccessToast(true);
                                    setTimeout(() => setShowSuccessToast(false), 3000);
                                  }, 2000);
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider px-3.5 py-1.5 rounded-lg border-0 cursor-pointer"
                              >
                                Simular Leitura AI
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => setIsReaderActive(false)}
                                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold text-[10px] uppercase tracking-wider px-3.5 py-1.5 rounded-lg border-0 cursor-pointer"
                              >
                                Desativar
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Bottom parameters */}
                      <div className="z-10 flex justify-between text-slate-500 text-[7px] font-mono">
                        <span>FPS: 30 • RES: 1080P</span>
                        <span>ANTIGRAVITY SMART READING v2.5</span>
                      </div>
                    </div>
                  </div>

                  {/* FICHA DE CADASTRO E RASTREABILIDADE COMPLETA */}
                  <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                      <div>
                        <span className="text-[8px] text-emerald-600 font-extrabold uppercase tracking-widest block">Informações Técnicas</span>
                        <h3 className="text-base font-black text-slate-800 uppercase">Ficha Técnica e Rastreabilidade</h3>
                      </div>
                      <span className="bg-slate-100 text-slate-700 text-[9px] font-mono font-extrabold px-2.5 py-1 rounded-lg uppercase">
                        ID: {selectedTraceProductId}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      {/* Nome do Produto (Readonly / Sincronizado) */}
                      <div>
                        <label className="text-[9px] text-slate-400 font-extrabold uppercase block tracking-wider mb-1.5">Nome do Produto</label>
                        <input
                          type="text"
                          disabled
                          value={products.find(p => p.id === selectedTraceProductId)?.name || ''}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 focus:outline-none"
                        />
                      </div>

                      {/* Marca */}
                      <div>
                        <label className="text-[9px] text-slate-400 font-extrabold uppercase block tracking-wider mb-1.5">Marca Comercial</label>
                        <input
                          type="text"
                          placeholder="Ex: Sabor do Campo, Fazenda Real..."
                          value={traceFormMarca}
                          onChange={(e) => setTraceFormMarca(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>

                      {/* Categoria */}
                      <div>
                        <label className="text-[9px] text-slate-400 font-extrabold uppercase block tracking-wider mb-1.5">Categoria de Segmento</label>
                        <select
                          value={traceFormCategoria}
                          onChange={(e) => setTraceFormCategoria(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        >
                          {SEGM_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>

                      {/* Código GS1 */}
                      <div>
                        <label className="text-[9px] text-slate-400 font-extrabold uppercase block tracking-wider mb-1.5">Código GS1 (GTIN/EAN-13)</label>
                        <div className="relative">
                          <Barcode size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="7890000000000"
                            value={traceFormCodigoGS1}
                            onChange={(e) => setTraceFormCodigoGS1(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200/80 rounded-xl text-xs font-bold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          />
                        </div>
                      </div>

                      {/* Código Interno */}
                      <div>
                        <label className="text-[9px] text-slate-400 font-extrabold uppercase block tracking-wider mb-1.5">Código Interno (SKU)</label>
                        <input
                          type="text"
                          placeholder="Ex: TOM-ITA-01"
                          value={traceFormCodigoInterno}
                          onChange={(e) => setTraceFormCodigoInterno(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>

                      {/* Peso da Balança */}
                      <div>
                        <label className="text-[9px] text-slate-400 font-extrabold uppercase block tracking-wider mb-1.5">Peso Unitário / Fardo (kg)</label>
                        <div className="relative">
                          <Scale size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="number"
                            step="0.001"
                            placeholder="0.000"
                            value={traceFormPeso || ''}
                            onChange={(e) => setTraceFormPeso(Number(e.target.value))}
                            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200/80 rounded-xl text-xs font-mono font-bold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          />
                        </div>
                      </div>

                      {/* Lote */}
                      <div>
                        <label className="text-[9px] text-slate-400 font-extrabold uppercase block tracking-wider mb-1.5">Lote do Fornecedor</label>
                        <input
                          type="text"
                          placeholder="Ex: L-TOM-07B"
                          value={traceFormLote}
                          onChange={(e) => setTraceFormLote(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>

                      {/* Validade */}
                      <div>
                        <label className="text-[9px] text-slate-400 font-extrabold uppercase block tracking-wider mb-1.5">Validade do Lote</label>
                        <div className="relative">
                          <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="date"
                            value={traceFormValidade}
                            onChange={(e) => setTraceFormValidade(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200/80 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                          />
                        </div>
                      </div>

                      {/* Fornecedor */}
                      <div>
                        <label className="text-[9px] text-slate-400 font-extrabold uppercase block tracking-wider mb-1.5">Distribuidor / Fornecedor</label>
                        <input
                          type="text"
                          placeholder="Ex: Distribuidora HortiFruti S/A"
                          value={traceFormFornecedor}
                          onChange={(e) => setTraceFormFornecedor(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>

                      {/* Origem */}
                      <div>
                        <label className="text-[9px] text-slate-400 font-extrabold uppercase block tracking-wider mb-1.5">Origem / Cidade Produtora</label>
                        <input
                          type="text"
                          placeholder="Ex: Mogi das Cruzes - SP, CEAGESP..."
                          value={traceFormOrigem}
                          onChange={(e) => setTraceFormOrigem(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>
                    </div>

                    {/* Foto Principal & Fotos Extras */}
                    <div className="space-y-4 pt-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Foto Principal */}
                        <div className="space-y-2">
                          <label className="text-[9px] text-slate-400 font-extrabold uppercase block tracking-wider">Foto Principal do Produto</label>
                          <div className="flex gap-3 items-center">
                            {traceFormFotoPrincipal ? (
                              <div className="relative shrink-0">
                                <img
                                  src={traceFormFotoPrincipal}
                                  alt="Preview"
                                  className="w-16 h-16 rounded-xl object-cover border border-slate-200"
                                  referrerPolicy="no-referrer"
                                />
                                <button
                                  type="button"
                                  onClick={() => setTraceFormFotoPrincipal('')}
                                  className="absolute -top-1.5 -right-1.5 bg-slate-900 text-white p-0.5 rounded-full hover:bg-red-500 border-0"
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            ) : (
                              <div className="w-16 h-16 rounded-xl bg-slate-50 border border-dashed border-slate-300 flex items-center justify-center text-slate-400 shrink-0">
                                <Image size={18} />
                              </div>
                            )}

                            {/* Envio / URL */}
                            <div className="flex-1 space-y-2">
                              <input
                                type="text"
                                placeholder="Coloque o link da foto do produto..."
                                value={traceFormFotoPrincipal}
                                onChange={(e) => setTraceFormFotoPrincipal(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-slate-700 placeholder:text-slate-300 focus:outline-none"
                              />
                              <div className="flex gap-1.5">
                                <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded-md transition-all cursor-pointer inline-flex items-center gap-1">
                                  <Upload size={9} /> Enviar Arquivo
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                      if (e.target.files && e.target.files[0]) {
                                        const r = new FileReader();
                                        r.onload = (ev) => {
                                          if (ev.target?.result) setTraceFormFotoPrincipal(ev.target.result as string);
                                        };
                                        r.readAsDataURL(e.target.files[0]);
                                      }
                                    }}
                                    className="hidden"
                                  />
                                </label>
                                
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Set an eye-catching random vegetable/fruit photo URL
                                    const urls = [
                                      'https://images.unsplash.com/photo-1595855759920-86582396756a?auto=format&fit=crop&w=300&q=80',
                                      'https://images.unsplash.com/photo-1587049352846-4a222e784d38?auto=format&fit=crop&w=300&q=80',
                                      'https://images.unsplash.com/photo-1528750901443-e9c17796aa4a?auto=format&fit=crop&w=300&q=80',
                                      'https://images.unsplash.com/photo-1557800636-894a64c1696f?auto=format&fit=crop&w=300&q=80'
                                    ];
                                    setTraceFormFotoPrincipal(urls[Math.floor(Math.random() * urls.length)]);
                                  }}
                                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded-md transition-all border-0 cursor-pointer"
                                >
                                  Foto Demo
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Situação do Lote */}
                        <div className="space-y-2">
                          <label className="text-[9px] text-slate-400 font-extrabold uppercase block tracking-wider">Situação de Qualidade do Lote</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => setTraceFormSituacao('Aprovado')}
                              className={cn(
                                "p-2 rounded-xl text-[10px] font-extrabold uppercase border text-center transition-all flex items-center justify-center gap-1",
                                traceFormSituacao === 'Aprovado'
                                  ? "bg-emerald-50 border-emerald-500 text-emerald-700"
                                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                              )}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Aprovado
                            </button>
                            <button
                              type="button"
                              onClick={() => setTraceFormSituacao('Em Análise')}
                              className={cn(
                                "p-2 rounded-xl text-[10px] font-extrabold uppercase border text-center transition-all flex items-center justify-center gap-1",
                                traceFormSituacao === 'Em Análise'
                                  ? "bg-amber-50 border-amber-500 text-amber-700"
                                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                              )}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Em Análise
                            </button>
                            <button
                              type="button"
                              onClick={() => setTraceFormSituacao('Quarentena')}
                              className={cn(
                                "p-2 rounded-xl text-[10px] font-extrabold uppercase border text-center transition-all flex items-center justify-center gap-1",
                                traceFormSituacao === 'Quarentena'
                                  ? "bg-orange-50 border-orange-500 text-orange-700"
                                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                              )}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-500" /> Quarentena
                            </button>
                            <button
                              type="button"
                              onClick={() => setTraceFormSituacao('Descartado')}
                              className={cn(
                                "p-2 rounded-xl text-[10px] font-extrabold uppercase border text-center transition-all flex items-center justify-center gap-1",
                                traceFormSituacao === 'Descartado'
                                  ? "bg-rose-50 border-rose-500 text-rose-700"
                                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                              )}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Descartado
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Fotos Extras */}
                      <div className="space-y-2">
                        <label className="text-[9px] text-slate-400 font-extrabold uppercase block tracking-wider">Fotos de Apoio Extras ({traceFormFotosExtras.length})</label>
                        <div className="flex flex-wrap gap-2 items-center">
                          {traceFormFotosExtras.map((f, i) => (
                            <div key={i} className="relative">
                              <img
                                src={f}
                                alt={`Extra ${i+1}`}
                                className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                                referrerPolicy="no-referrer"
                              />
                              <button
                                type="button"
                                onClick={() => setTraceFormFotosExtras(traceFormFotosExtras.filter((_, idx) => idx !== i))}
                                className="absolute -top-1.5 -right-1.5 bg-slate-900 text-white p-0.5 rounded-full hover:bg-red-500 border-0"
                              >
                                <X size={8} />
                              </button>
                            </div>
                          ))}
                          
                          <label className="w-12 h-12 rounded-lg border border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 flex flex-col items-center justify-center text-slate-400 cursor-pointer transition-all">
                            <Plus size={14} />
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  const r = new FileReader();
                                  r.onload = (ev) => {
                                    if (ev.target?.result) setTraceFormFotosExtras([...traceFormFotosExtras, ev.target.result as string]);
                                  };
                                  r.readAsDataURL(e.target.files[0]);
                                }
                              }}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>

                      {/* Observações */}
                      <div>
                        <label className="text-[9px] text-slate-400 font-extrabold uppercase block tracking-wider mb-1.5">Observações Internas de Controle</label>
                        <textarea
                          rows={3}
                          placeholder="Digite aqui as notas de acondicionamento, restrições ou observações de quarentena do lote..."
                          value={traceFormObservacoes}
                          onChange={(e) => setTraceFormObservacoes(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-2xl p-3 text-xs font-semibold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>
                    </div>

                    {/* Botão de Envio */}
                    <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          const product = products.find(p => p.id === selectedTraceProductId);
                          if (product) selectProductForTraceability(product.id);
                        }}
                        className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[11px] uppercase tracking-wider rounded-2xl transition-all cursor-pointer border-0"
                      >
                        Reverter Modificações
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSaveTraceability(selectedTraceProductId)}
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] uppercase tracking-widest rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer border-0 flex items-center gap-2"
                      >
                        <Check size={14} /> Salvar Ficha de Rastreabilidade
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      ) : activeTab === 'visualizar_cupom' ? (
        <div id="visualizar-cupom-tab-panel" className="space-y-6 max-w-md mx-auto pb-12 animate-fade-in px-2 flex flex-col items-center">
          
          {/* Top Navigation */}
          <div className="w-full flex justify-between items-center bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab('notafiscal')}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[10px] uppercase tracking-widest rounded-xl transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 border-0"
            >
              <ArrowLeft size={12} /> Voltar para Nota Fiscal
            </button>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Nota Fiscal
            </span>
          </div>

          {/* THE MOCK THERMAL COUPON PAPER */}
          <div className="bg-slate-100 p-6 rounded-3xl border border-slate-200/50 shadow-inner flex flex-col items-center justify-center w-full">
            <div className="flex items-center gap-1.5 text-slate-500 font-extrabold text-[9px] uppercase tracking-widest mb-3">
              <Receipt size={12} className="text-slate-400" />
              <span>NOTA FISCAL</span>
            </div>
            
            <div 
              id="thermal-receipt-58mm"
              className="w-full max-w-[280px] bg-white border border-slate-200 p-4 shadow-lg font-mono text-[10px] text-slate-800 text-left relative overflow-hidden"
              style={{ 
                backgroundImage: 'linear-gradient(rgba(0,0,0,0.01) 50%, transparent 50%)',
                backgroundSize: '100% 4px',
                borderRadius: '4px'
              }}
            >
              {/* Jagged thermal paper top effect */}
              <div className="absolute top-0 inset-x-0 h-1 bg-repeat-x" style={{ backgroundImage: 'radial-gradient(circle, transparent 2px, white 2px)', backgroundSize: '6px 4px', backgroundPosition: 'left top' }} />

              {(() => {
                const selectedSale = nfSelectedOrderId === 'carrinho_ativo'
                  ? {
                      orderNumber: salesHistory.length + 1,
                      date: new Date().toLocaleString('pt-BR'),
                      companyName: nfEmitenteNome || '',
                      companyDoc: nfEmitenteDoc || '',
                      companyType: nfEmitenteTipo,
                      companyPapel: nfEmitentePapel,
                      vendorName: nfEmitenteNomeVendedor,
                      companyDocTipo: nfEmitenteDocTipo,
                      companyDocNumero: nfEmitenteDocNumero,
                      companyAddressTipo: nfEmitenteEnderecoTipo,
                      companyAddress: nfEmitenteEndereco
                    }
                  : salesHistory.find(s => s.id === nfSelectedOrderId);

                const saleIndex = salesHistory.findIndex(s => s.id === nfSelectedOrderId);
                const numPedido = nfSelectedOrderId === 'carrinho_ativo'
                  ? (salesHistory.length + 1)
                  : saleIndex !== -1
                  ? (salesHistory.length - saleIndex)
                  : selectedSale?.orderNumber ?? (salesHistory.length + 1);
                const dataEmissao = selectedSale?.date ?? new Date().toLocaleString('pt-BR');
                const emitenteNome = (nfEmitenteNome || selectedSale?.companyName || 'MINHA EMPRESA').trim();
                const emitenteDoc = (nfEmitenteDoc || selectedSale?.companyDoc || '').trim();
                
                const currentEmitenteTipo = selectedSale?.companyType || nfEmitenteTipo;
                const emitenteTipoLabel = currentEmitenteTipo === 'feirante_cpf'
                  ? (selectedSale?.companyDocTipo || nfEmitenteDocTipo || 'CPF').toUpperCase()
                  : 'CNPJ';

                const papelLabel = (nfEmitentePapel || selectedSale?.companyPapel || 'vendedor').toUpperCase();
                const papelNome = nfEmitenteNomeVendedor || selectedSale?.vendorName || '';
                const endTipoLabel = (nfEmitenteEnderecoTipo || selectedSale?.companyAddressTipo || 'comercial') === 'box' ? 'BOX' : (nfEmitenteEnderecoTipo || selectedSale?.companyAddressTipo || 'comercial') === 'barraca' ? 'BARRACA' : 'ENDEREÇO';
                const endDet = nfEmitenteEndereco || selectedSale?.companyAddress || '';

                return (
                  <div className="text-center space-y-1.5 pt-2 uppercase">
                    <p className="font-black text-[12px] text-slate-950 tracking-wider">NOTA FISCAL</p>
                    <p className="font-extrabold text-[9px] text-slate-800 tracking-wide">SISTEMA DE CONTROLE</p>
                    <p className="font-black text-[10px] text-indigo-950 pt-0.5">
                      PEDIDO #{numPedido}
                    </p>
                    <div className="my-1 border-b border-dashed border-slate-200" />
                    {emitenteNome && (
                      <p className="font-black text-[9px] text-slate-900 leading-tight">
                        {emitenteNome}
                      </p>
                    )}
                    {emitenteDoc && (
                      <p className="text-[8px] text-slate-600 font-bold">
                        {emitenteTipoLabel}: {emitenteDoc}
                      </p>
                    )}
                    {papelNome && (
                      <p className="text-[8px] text-slate-700 font-extrabold">
                        {papelLabel}: {papelNome}
                      </p>
                    )}
                    <p className="text-[7.5px] text-slate-600 font-semibold leading-tight">
                      {endTipoLabel}: {endDet ? endDet : 'ENDEREÇO NÃO ENCONTRADO'}
                    </p>
                    <p className="text-[7.5px] text-slate-500">Emissão: {dataEmissao}</p>
                  </div>
                );
              })()}

              <div className="my-2 border-b border-dashed border-slate-300" />

              {/* RECIPIENT */}
              <div className="space-y-0.5 uppercase text-[9px]">
                <p className="font-black">CLIENTE:</p>
                <p className="break-words font-semibold">{nfDestinatarioNome || 'CONSUMIDOR FINAL'}</p>
                {(() => {
                  const docLabel = (nfDestinatarioTipo === 'empresa_cnpj' || nfDestinatarioTipo === 'entrega_empresa') ? 'CNPJ' : 'CPF';
                  return <p>{docLabel}: {nfDestinatarioDoc || 'SEM CPF'}</p>;
                })()}
                {nfDestinatarioEndereco && (
                  <p className="text-[8px] break-words">ENDEREÇO: {nfDestinatarioEndereco}</p>
                )}
              </div>

              <div className="my-2 border-b border-dashed border-slate-300" />

              {/* ITEMS LIST */}
              <div className="space-y-3">
                <div className="font-black text-[9px] border-b border-slate-200 pb-1 text-left">
                  {nfItems.length <= 1 ? 'ITEM' : 'ITENS'}
                </div>

                {nfItems.length === 0 ? (
                  <div className="text-center py-4 text-slate-400 italic">
                    (Nenhum item lançado)
                  </div>
                ) : (
                  nfItems.map((item, idx) => {
                    const unitPrice = typeof item.price === 'number' ? item.price : 0;
                    return (
                      <div key={`${item.id}-${idx}`} className="space-y-1 text-left border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                        <p className="text-[9px] font-black text-slate-900">
                          {idx + 1} {item.name.toUpperCase()}
                          {item.barcode ? ` - código de barras: ${item.barcode}` : ''}
                        </p>
                        
                        <div className="pl-2 space-y-0.5 text-[8px] font-bold text-slate-500 uppercase leading-relaxed">
                          <p>QUANTIDADE: <span className="text-slate-950 font-black">{item.quantity}</span></p>
                          {(() => {
                            const displayPesoMedida = item.comercializacao || formatarMercadoria(item.weightPerUnit || 0, item.unit || 'unit');
                            return displayPesoMedida ? (
                              <p>PESO/MEDIDA: <span className="text-slate-950 font-black">{displayPesoMedida.toUpperCase()}</span></p>
                            ) : null;
                          })()}
                          {item.tamanho && (
                            <p>TAMANHO: <span className="text-slate-950 font-black">{item.tamanho.toUpperCase()}</span></p>
                          )}
                          <p>
                            VALOR UNITÁRIO: <span className="text-slate-950 font-black">R$ {unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            {" | "}
                            VALOR TOTAL: <span className="text-slate-950 font-black">R$ {(typeof item.total === 'number' ? item.total : item.quantity * unitPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="my-2 border-b border-dashed border-slate-300" />

              {/* TOTALS */}
              {(() => {
                const totalNf = nfItems.reduce((acc, i) => acc + (typeof i.total === 'number' ? i.total : (i.quantity * i.price)), 0);
                const totalQty = nfItems.reduce((acc, i) => acc + i.quantity, 0);
                return (
                  <div className="space-y-3 uppercase text-[9px] text-slate-800">
                    <div className="space-y-0.5 text-left text-slate-500 text-[8.5px] font-bold px-1">
                      <p className="flex justify-between">
                        <span>TOTAL DE ITENS:</span>
                        <span className="text-slate-950 font-extrabold">{totalQty}</span>
                      </p>
                    </div>

                    <div className="my-1 border-b border-dotted border-slate-300" />

                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-2 space-y-0.5 text-left">
                      <p className="flex justify-between font-black text-slate-900 border-b border-slate-200/50 pb-1 mb-1">
                        <span>MÉTODO DE PAGAMENTO:</span>
                        <span className="text-indigo-800">{obterLabelPagamento(nfPaymentMethod).toUpperCase()}</span>
                      </p>
                      <p className="flex justify-between font-bold text-slate-600">
                        <span>VALOR RECEBIDO:</span>
                        <span>R$ {nfAmountReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </p>
                      <p className="flex justify-between text-amber-800 font-extrabold">
                        <span>TROCO:</span>
                        <span>R$ {nfChange.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </p>
                    </div>

                    <p className="flex justify-between text-xs font-black text-slate-950 px-1 pt-0.5 border-t border-dashed border-slate-200 pt-1.5">
                      <span>TOTAL:</span>
                      <span className="text-emerald-700 font-bold">R$ {totalNf.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </p>
                  </div>
                );
              })()}

              <div className="my-3 border-b border-dashed border-slate-300" />

              {/* QUALITY CONTROL / GS1 BRASIL SEAL */}
              <div className="bg-slate-50 border border-slate-200/60 rounded p-2 text-center">
                <p className="text-[7.5px] text-slate-600 font-black leading-normal px-1 break-words uppercase">
                  VERIFICAÇÃO DA NOTA FISCAL POR CÓDIGO OU DOCUMENTO NO APLICATIVO OU SITE FEIRA LIVRE
                </p>
              </div>

              {/* QR CODE DE CONSULTA E CÓDIGO DO APP */}
              {(() => {
                const activeSale = nfSelectedOrderId === 'carrinho_ativo'
                  ? {
                      id: 'carrinho_ativo',
                      orderNumber: salesHistory.length + 1,
                      companyDoc: nfEmitenteDoc,
                      date: new Date().toLocaleString('pt-BR')
                    }
                  : salesHistory.find(s => s.id === nfSelectedOrderId);

                if (!activeSale) return null;

                const appCode = obterCodigoAcessoApp(activeSale);

                return (
                  <div className="mt-4 pt-3 border-t border-dashed border-slate-300 text-center space-y-1">
                    <div className="space-y-0.5 text-left">
                      <span className="text-[6.5px] text-slate-400 font-extrabold block uppercase tracking-wider">
                        Código de Acesso App Feira Livre Calculadora
                      </span>
                      <p className="text-[7.5px] text-indigo-900 font-mono font-black uppercase tracking-wider">
                        {appCode}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Jagged thermal paper bottom effect */}
              <div className="absolute bottom-0 inset-x-0 h-1 bg-repeat-x rotate-180" style={{ backgroundImage: 'radial-gradient(circle, transparent 2px, white 2px)', backgroundSize: '6px 4px', backgroundPosition: 'left top' }} />
            </div>

            {/* Ações do Cupom */}
            <div className="w-full max-w-[280px] mt-6 space-y-3" data-html2canvas-ignore="true">
              {/* Botão Verde pra Compartilhar */}
              <button
                type="button"
                onClick={compartilharCupomWidget}
                disabled={isSharingWidget || isSavingWidget || isPrintingBluetooth}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2 border-0"
              >
                {isSharingWidget ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Share2 size={14} />
                )}
                <span>{isSharingWidget ? "Compartilhando..." : "Compartilhar"}</span>
              </button>

              {/* Botão Laranja pra Imprimir */}
              <button
                type="button"
                onClick={imprimirCupomBluetooth}
                disabled={isSharingWidget || isSavingWidget || isPrintingBluetooth}
                className="w-full py-3.5 px-4 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2 border-0"
              >
                {isPrintingBluetooth ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Printer size={14} />
                )}
                <span>{isPrintingBluetooth ? "Imprimindo..." : "Imprimir Cupom"}</span>
              </button>

              {/* Botão Extra pra Salvar Imagem */}
              <button
                type="button"
                onClick={salvarCupomWidget}
                disabled={isSharingWidget || isSavingWidget || isPrintingBluetooth}
                className="w-full py-3.5 px-4 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-sm active:scale-95 cursor-pointer flex items-center justify-center gap-2 border-0"
              >
                {isSavingWidget ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                <span>{isSavingWidget ? "Salvando..." : "Salvar como Imagem"}</span>
              </button>
            </div>
          </div>

        </div>

      ) : null}
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

    <VisionAIModal
      isOpen={showVisionAIModal}
      onClose={() => {
        setShowVisionAIModal(false);
        if (selectedTraceProductId) {
          selectProductForTraceability(selectedTraceProductId);
        }
      }}
      products={products}
      productsSmartMetadata={productsSmartMetadata}
      selectedProductId={selectedTraceProductId || null}
      onSelectProduct={(pId) => selectProductForTraceability(pId)}
      onSaveMetadata={(prodId, updatedData) => {
        const updatedMetadata = {
          ...productsSmartMetadata,
          [prodId]: {
            ...productsSmartMetadata[prodId],
            ...updatedData,
            createdAt: productsSmartMetadata[prodId]?.createdAt || new Date().toISOString()
          }
        };
        setProductsSmartMetadata(updatedMetadata);
        localStorage.setItem('feiralivre_products_smart_metadata', JSON.stringify(updatedMetadata));
      }}
      onUpdateProductWeight={(prodId, weight) => {
        const updatedProducts = products.map(p => {
          if (p.id === prodId) {
            return {
              ...p,
              weightPerUnit: weight
            };
          }
          return p;
        });
        setProducts(updatedProducts);
        localStorage.setItem('feiralivre_products', JSON.stringify(updatedProducts));
      }}
    />

  </div>
  );
};

export default CalculatorScreen;
