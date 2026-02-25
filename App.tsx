
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, 
  PlusCircle, 
  Package, 
  Wallet, 
  Search,
  ShoppingCart,
  CheckCircle,
  Clock,
  AlertTriangle,
  Printer,
  Share2,
  Trash2,
  X,
  Repeat,
  Loader2,
  TrendingUp,
  Plus,
  Bell,
  Check,
  Database,
  ExternalLink,
  ChevronLeft,
  User,
  Phone,
  Layers,
  Banknote,
  Send,
  Download,
  Filter,
  Minus,
  Save,
  Edit3,
  Settings2,
  Menu,
  ShieldCheck,
  Zap,
  Gift,
  CreditCard,
  UserPlus
} from 'lucide-react';
import { Order, InventoryItem, OrderType, OrderStatus, LaundryItem, PaymentMethod, TwilioConfig, UserProfile, UserRole, Subscription, Offer, SubscriptionPackage } from './types';
import { BarcodeGenerator } from './components/BarcodeGenerator';
import { Auth } from './components/Auth';
import { supabase } from './supabase';
import { generateSmartReminder, MessageContext } from './services/geminiService';
import { sendTwilioWhatsApp } from './services/twilioService';

// Ensure html2pdf is available via window
declare var html2pdf: any;

const INITIAL_ITEMS = [
  { name: 'ثوب', price: 5, icon: '👕' },
  { name: 'غترة/شماغ', price: 3, icon: '🧣' },
  { name: 'قميص', price: 4, icon: '👔' },
  { name: 'بنطلون', price: 4, icon: '👖' },
  { name: 'تيشرت', price: 3, icon: '👕' },
  { name: 'فستان', price: 15, icon: '👗' },
  { name: 'جاكيت', price: 10, icon: '🧥' },
  { name: 'بطانية', price: 25, icon: '🛌' },
  { name: 'سجادة', price: 30, icon: '🧶' },
  { name: 'بدلة كاملة', price: 15, icon: '🤵' },
  { name: 'ملاءة سرير', price: 10, icon: '🛏️' },
];

const TAX_RATE = 0.15;

const DISCLAIMER_TEXT = "تنويه هام: المغسلة غير مسؤولة عن فقدان أي أغراض شخصية تُترك داخل الملابس عند استلامها، كما لا تتحمل مسؤولية حفظ الملابس أو الأغراض بعد مضي (15) يومًا من تاريخ الاستلام.";

const statusArabic: Record<OrderStatus, string> = {
  Received: 'تم الاستلام',
  Washing: 'جاري الغسيل',
  Ironing: 'جاري الكي',
  Ready: 'جاهز للاستلام',
  Delivered: 'تم التسليم',
};

const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ['dashboard', 'new-order', 'orders', 'inventory', 'finance', 'users', 'settings', 'offers', 'subscriptions'],
  manager: ['dashboard', 'new-order', 'orders', 'inventory', 'finance', 'offers', 'subscriptions'],
  staff: ['dashboard', 'new-order', 'orders', 'offers'],
};

const navItems = [
  { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { id: 'new-order', label: 'كاشير جديد', icon: PlusCircle },
  { id: 'orders', label: 'الطلبات', icon: Package },
  { id: 'inventory', label: 'المخزون', icon: Layers },
  { id: 'finance', label: 'الحسابات', icon: Wallet },
  { id: 'subscriptions', label: 'الاشتراكات', icon: CreditCard },
  { id: 'users', label: 'المستخدمين', icon: User },
  { id: 'settings', label: 'الإعدادات', icon: Settings2 },
];

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'new-order' | 'orders' | 'inventory' | 'finance' | 'users' | 'settings' | 'offers' | 'subscriptions'>('dashboard');
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subscriptionPackages, setSubscriptionPackages] = useState<SubscriptionPackage[]>([
    { id: '1', name: 'الباقة الفضية', total_items: 30, price: 150, duration_days: 30 },
    { id: '2', name: 'الباقة الذهبية', total_items: 60, price: 280, duration_days: 30 },
    { id: '3', name: 'الباقة الماسية', total_items: 100, price: 450, duration_days: 30 },
  ]);
  const [offers, setOffers] = useState<Offer[]>([
    { id: '1', title: 'عرض الـ 100 قطعة', description: 'اغسل 100 قطعة واحصل على 5 قطع مجاناً', threshold_items: 100, free_items: 5 },
    { id: '2', title: 'خصم الافتتاح', description: 'خصم 10% على جميع الطلبات لفترة محدودة', discount_percent: 10 }
  ]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [twilioConfig, setTwilioConfig] = useState<TwilioConfig>({
    accountSid: '',
    authToken: '',
    fromNumber: '',
    enabled: false
  });

  const [categories, setCategories] = useState(INITIAL_ITEMS);
  const [isEditingPrices, setIsEditingPrices] = useState(false);
  const [showCustomItemModal, setShowCustomItemModal] = useState(false);
  const [customItemForm, setCustomItemForm] = useState({ name: '', price: 0 });

  const [sendingMessageIds, setSendingMessageIds] = useState<Set<string>>(new Set());
  const [timeFilter, setTimeFilter] = useState<'all' | '1h' | '24h' | '48h'>('all');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');

  const [showPrintModal, setShowPrintModal] = useState<Order | null>(null);
  const [showEditOrderModal, setShowEditOrderModal] = useState<Order | null>(null);
  const [isInvModalOpen, setIsInvModalOpen] = useState(false);
  const [newInvItem, setNewInvItem] = useState({ name: '', stock: 0, unit: 'قطعة', threshold: 5 });
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [showAssignSubModal, setShowAssignSubModal] = useState<{ name: string, phone: string } | null>(null);
  const [packageForm, setPackageForm] = useState({ name: '', total_items: 0, price: 0, duration_days: 30 });
  
  const scanIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    // Auth listener
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserProfile(session.user.id);
    });

    supabase.from('orders').select('id', { count: 'exact', head: true }).limit(1)
      .then(({ error }) => {
        if (error) console.error("Supabase connection check failed:", error);
        else console.log("Supabase connection established.");
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchUserProfile(session.user.id);
      else setUserProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      fetchData();
      fetchSettings();
      if (userProfile?.role === 'admin') fetchProfiles();
      const savedCats = localStorage.getItem('laundry_categories');
      if (savedCats) setCategories(JSON.parse(savedCats));
    }
  }, [session, userProfile]);

  useEffect(() => {
    if (twilioConfig.enabled && session) {
      scanIntervalRef.current = window.setInterval(checkAndSendAutoReminders, 1000 * 60 * 5);
      return () => { if (scanIntervalRef.current) window.clearInterval(scanIntervalRef.current); };
    }
  }, [twilioConfig, orders, session]);

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) throw error;
      setUserProfile(data);
    } catch (e) {
      console.error("Failed to fetch profile:", e);
    }
  };

  const fetchProfiles = async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      setProfiles(data || []);
    } catch (e) {
      console.error("Failed to fetch profiles:", e);
    }
  };

  const updateUserRole = async (userId: string, role: UserRole) => {
    try {
      const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
      if (error) throw error;
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, role } : p));
      alert('تم تحديث صلاحية المستخدم بنجاح');
    } catch (e: any) {
      alert(`فشل التحديث: ${e.message}`);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const allowedNavItems = useMemo(() => {
    if (!userProfile) return [];
    const permissions = ROLE_PERMISSIONS[userProfile.role] || [];
    return navItems.filter(item => permissions.includes(item.id));
  }, [userProfile]);

  // Ensure active tab is allowed
  useEffect(() => {
    if (userProfile && !ROLE_PERMISSIONS[userProfile.role]?.includes(activeTab)) {
      setActiveTab('dashboard');
    }
  }, [userProfile, activeTab]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase.from('settings').select('value').eq('key', 'twilio').single();
      if (!error && data) {
        setTwilioConfig(data.value);
      }
    } catch (e) {
      console.error("Failed to fetch settings from DB:", e);
    }
  };

  const saveSettingsToDB = async () => {
    setSaveLoading(true);
    try {
      const { error } = await supabase.from('settings').upsert({
        key: 'twilio',
        value: twilioConfig,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

      if (error) throw error;
      alert('تم حفظ الإعدادات في قاعدة البيانات بنجاح ✅');
    } catch (e: any) {
      alert(`فشل حفظ الإعدادات: ${e.message}`);
    } finally {
      setSaveLoading(false);
    }
  };

  const triggerBackgroundNotification = async (order: Order, context: MessageContext) => {
    if (!twilioConfig.enabled || !twilioConfig.accountSid) return;
    try {
      const smartMsg = await generateSmartReminder(order, context);
      const fullMessage = `${smartMsg}\n\n📦 فاتورة: ${order.order_number}\n💰 الإجمالي: ${order.total.toFixed(2)} ريال\n📍 الحالة: ${statusArabic[order.status]}\n\n${DISCLAIMER_TEXT}`;
      await sendTwilioWhatsApp(order, fullMessage, twilioConfig);
    } catch (e) {
      console.error("Background notify error:", e);
    }
  };

  const checkAndSendAutoReminders = async () => {
    if (!twilioConfig.enabled || !twilioConfig.accountSid) return;
    const now = Date.now();
    for (const order of orders) {
      if (order.status === 'Delivered') continue;
      
      const orderTime = new Date(order.created_at).getTime();
      const hoursPassed = (now - orderTime) / 3600000;
      
      let key: keyof Order | null = null;
      let context: MessageContext | null = null;

      if (hoursPassed >= 48 && !order.notified_48h) { key = 'notified_48h'; context = 'REMINDER_48H'; }
      else if (hoursPassed >= 24 && !order.notified_24h) { key = 'notified_24h'; context = 'REMINDER_24H'; }
      else if (hoursPassed >= 1 && !order.notified_1h) { key = 'notified_1h'; context = 'REMINDER_1H'; }

      if (key && context) {
        try {
          const smartMsg = await generateSmartReminder(order, context);
          const fullMessage = `${smartMsg}\n\n📦 فاتورة: ${order.order_number}\n💰 الإجمالي: ${order.total.toFixed(2)} ريال\n📍 الحالة: ${statusArabic[order.status]}\n\n${DISCLAIMER_TEXT}`;
          const success = await sendTwilioWhatsApp(order, fullMessage, twilioConfig);
          if (success) {
            await supabase.from('orders').update({ [key]: true }).eq('id', order.id);
            setOrders(prev => prev.map(o => o.id === order.id ? { ...o, [key]: true } : o));
          }
        } catch (e) { console.error("Auto Send Fail:", e); }
      }
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setDbError(null);
    try {
      const { data: ordersData, error: ordersError } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (ordersError) throw ordersError;
      setOrders(ordersData || []);

      const { data: inventoryData, error: invError } = await supabase.from('inventory').select('*');
      if (invError) throw invError;
      setInventory(inventoryData || []);

      const { data: subsData, error: subsError } = await supabase.from('subscriptions').select('*');
      if (subsError) throw subsError;
      setSubscriptions(subsData || []);

      const { data: pkgsData, error: pkgsError } = await supabase.from('subscription_packages').select('*');
      if (pkgsError) throw pkgsError;
      if (pkgsData && pkgsData.length > 0) setSubscriptionPackages(pkgsData);

      const { data: catsData, error: catsError } = await supabase.from('categories').select('*').order('created_at', { ascending: true });
      if (catsError) throw catsError;
      if (catsData && catsData.length > 0) {
        setCategories(catsData);
      } else {
        // If no categories in DB, use INITIAL_ITEMS but don't save them automatically to avoid duplicates
        setCategories(INITIAL_ITEMS);
      }
    } catch (error: any) {
      console.error("Fetch Data Error:", error);
      setDbError(error.message || "فشل الاتصال بقاعدة البيانات");
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const totalRevenue = orders.filter(o => o.is_paid).reduce((acc, o) => acc + o.total, 0);
    const taxTotal = orders.filter(o => o.is_paid).reduce((acc, o) => acc + o.tax, 0);
    const pendingAmount = orders.filter(o => !o.is_paid).reduce((acc, o) => acc + o.total, 0);
    const pendingOrdersCount = orders.filter(o => o.status !== 'Delivered').length;
    const lowStockCount = inventory.filter(i => i.stock <= i.threshold).length;
    return { totalRevenue, taxTotal, pendingAmount, pendingOrdersCount, lowStockCount };
  }, [orders, inventory]);

  const getCustomerStats = (phone: string) => {
    const customerOrders = orders.filter(o => o.customer_phone === phone);
    const totalItems = customerOrders.reduce((acc, o) => acc + o.items.reduce((sum, item) => sum + item.quantity, 0), 0);
    const freeItems = customerOrders.filter(o => o.payment_method === 'Free').reduce((acc, o) => acc + o.items.reduce((sum, item) => sum + item.quantity, 0), 0);
    const paidItems = totalItems - freeItems;
    return { totalItems, freeItems, paidItems };
  };

  const getCustomerSubscription = (phone: string) => {
    return subscriptions.find(s => s.customer_phone === phone && s.is_active && new Date(s.expiry_date) > new Date());
  };

  const handleCreatePackage = async () => {
    if (!packageForm.name || packageForm.total_items <= 0 || packageForm.price <= 0) return alert('يرجى إدخال بيانات صحيحة');
    const newPkg: SubscriptionPackage = {
      id: Math.random().toString(36).substr(2, 9),
      ...packageForm
    };
    
    try {
      const { error } = await supabase.from('subscription_packages').insert([newPkg]);
      if (error) throw error;
      setSubscriptionPackages([...subscriptionPackages, newPkg]);
      setPackageForm({ name: '', total_items: 0, price: 0, duration_days: 30 });
      setShowPackageModal(false);
    } catch (e: any) {
      alert(`فشل الحفظ: ${e.message}`);
    }
  };

  const handleAssignSubscription = async (pkgId: string) => {
    if (!showAssignSubModal) return;
    const pkg = subscriptionPackages.find(p => p.id === pkgId);
    if (!pkg) return;

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + pkg.duration_days);

    const newSub: Subscription = {
      id: Math.random().toString(36).substr(2, 9),
      customer_name: showAssignSubModal.name,
      customer_phone: showAssignSubModal.phone,
      package_id: pkg.id,
      items_remaining: pkg.total_items,
      total_items: pkg.total_items,
      expiry_date: expiry.toISOString(),
      is_active: true
    };

    try {
      const { error } = await supabase.from('subscriptions').insert([newSub]);
      if (error) throw error;
      setSubscriptions([...subscriptions, newSub]);
      setShowAssignSubModal(null);
      alert(`تم تفعيل اشتراك ${pkg.name} للعميل بنجاح ✅`);
    } catch (e: any) {
      alert(`فشل تفعيل الاشتراك: ${e.message}`);
    }
  };

  const updateSubscriptionBalance = async (subId: string, newBalance: number) => {
    const safeBalance = Math.max(0, newBalance);
    try {
      const { error } = await supabase.from('subscriptions').update({ items_remaining: safeBalance }).eq('id', subId);
      if (error) throw error;
      setSubscriptions(prev => prev.map(s => 
        s.id === subId ? { ...s, items_remaining: safeBalance } : s
      ));
    } catch (e: any) {
      console.error("Failed to update balance in DB:", e);
    }
  };

  const deleteCategory = async (id: string) => {
    if (!id) return; // Can't delete initial items without ID
    if (!confirm('هل أنت متأكد من حذف هذا الصنف؟')) return;
    
    try {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
      setCategories(prev => prev.filter(c => (c as any).id !== id));
    } catch (e: any) {
      alert(`فشل الحذف: ${e.message}`);
    }
  };

  const [newOrder, setNewOrder] = useState<{
    customer_name: string;
    customer_phone: string;
    order_type: OrderType;
    items: LaundryItem[];
    is_paid: boolean;
    payment_method: PaymentMethod;
    custom_adjustment: number;
    is_free: boolean;
  }>({
    customer_name: '',
    customer_phone: '',
    order_type: 'Normal',
    items: [],
    is_paid: false,
    payment_method: 'Cash',
    custom_adjustment: 0,
    is_free: false
  });

  // Auto-select subscription if available
  useEffect(() => {
    if (newOrder.customer_phone.length >= 9) {
      const sub = getCustomerSubscription(newOrder.customer_phone);
      if (sub && !newOrder.is_free && newOrder.payment_method === 'Cash' && !newOrder.is_paid) {
        setNewOrder(prev => ({ ...prev, is_paid: true, payment_method: 'Subscription' }));
      }
    }
  }, [newOrder.customer_phone, subscriptions]);

  const currentSubtotal = useMemo(() => {
    if (newOrder.is_free) return 0;
    const itemsTotal = newOrder.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    return itemsTotal + (newOrder.custom_adjustment || 0);
  }, [newOrder.items, newOrder.custom_adjustment, newOrder.is_free]);

  const currentTax = useMemo(() => currentSubtotal * TAX_RATE, [currentSubtotal]);
  const currentTotal = useMemo(() => currentSubtotal + currentTax, [currentSubtotal, currentTax]);

  const togglePredefinedItem = (item: { name: string, price: number }) => {
    if (isEditingPrices) return;
    const existing = newOrder.items.find(i => i.name === item.name && i.price === item.price);
    if (existing) {
      setNewOrder(prev => ({
        ...prev,
        items: prev.items.map(i => (i.name === item.name && i.price === item.price) ? { ...i, quantity: i.quantity + 1 } : i)
      }));
    } else {
      const id = Math.random().toString(36).substr(2, 9);
      setNewOrder(prev => ({
        ...prev,
        items: [...prev.items, { id, name: item.name, quantity: 1, price: item.price }]
      }));
    }
  };

  const handleAddCustomItem = async () => {
    if (!customItemForm.name || customItemForm.price <= 0) return alert('يرجى إدخال اسم وسعر صحيح');
    
    try {
      const newCat = {
        name: customItemForm.name,
        price: customItemForm.price,
        icon: '✨'
      };
      
      const { data, error } = await supabase.from('categories').insert([newCat]).select();
      if (error) throw error;
      
      if (data && data.length > 0) {
        const savedCat = data[0];
        setCategories(prev => [...prev, savedCat]);
        
        // Also add to current order
        setNewOrder(prev => ({
          ...prev,
          items: [...prev.items, { id: savedCat.id, name: savedCat.name, quantity: 1, price: savedCat.price }]
        }));
      }
    } catch (e: any) {
      alert(`فشل إضافة الصنف: ${e.message}`);
    }
    
    setCustomItemForm({ name: '', price: 0 });
    setShowCustomItemModal(false);
  };

  const updateCategoryPrice = async (index: number, newPrice: number) => {
    const item = categories[index];
    const updated = [...categories];
    updated[index].price = newPrice;
    setCategories(updated);
    
    if ((item as any).id) {
      try {
        await supabase.from('categories').update({ price: newPrice }).eq('id', (item as any).id);
      } catch (e) {
        console.error("Failed to update price in DB:", e);
      }
    }
    localStorage.setItem('laundry_categories', JSON.stringify(updated));
  };

  const updateItemQuantity = (id: string, delta: number) => {
    setNewOrder(prev => ({
      ...prev,
      items: prev.items.map(i => {
        if (i.id === id) {
          const newQty = Math.max(1, i.quantity + delta);
          return { ...i, quantity: newQty };
        }
        return i;
      })
    }));
  };

  const handleCreateOrder = async () => {
    if (!newOrder.customer_name || !newOrder.customer_phone) return alert('يرجى إدخال اسم العميل ورقم هاتفه');
    if (newOrder.items.length === 0 && newOrder.custom_adjustment === 0) return alert('يرجى إضافة قطعة واحدة على الأقل');
    
    setLoading(true);
    const nowISO = new Date().toISOString();
    
    const orderData = {
      order_number: `ORD-${Date.now().toString().slice(-5)}`,
      customer_name: newOrder.customer_name,
      customer_phone: newOrder.customer_phone,
      order_type: newOrder.order_type,
      items: newOrder.items,
      subtotal: currentSubtotal,
      tax: currentTax,
      total: currentTotal,
      custom_adjustment: newOrder.custom_adjustment,
      is_paid: newOrder.is_paid || newOrder.is_free,
      payment_method: newOrder.is_free ? 'Free' : newOrder.payment_method,
      status: 'Received',
      created_at: nowISO,
      updated_at: nowISO
    };

    try {
      const { data, error } = await supabase.from('orders').insert([orderData]).select();
      if (error) throw error;
      
      if (data && data.length > 0) {
        const createdOrder = data[0];
        
        // Deduct from subscription if applicable
        const sub = getCustomerSubscription(newOrder.customer_phone);
        if (sub && (newOrder.payment_method === 'Subscription' || newOrder.is_free)) {
          const totalItemsInOrder = newOrder.items.reduce((acc, i) => acc + i.quantity, 0);
          if (totalItemsInOrder > 0) {
            await updateSubscriptionBalance(sub.id, sub.items_remaining - totalItemsInOrder);
          }
        }

        setOrders(prev => [createdOrder, ...prev]);
        setNewOrder({ customer_name: '', customer_phone: '', order_type: 'Normal', items: [], is_paid: false, payment_method: 'Cash', custom_adjustment: 0, is_free: false });
        setActiveTab('orders');
        handlePrintNewPage(createdOrder);

        // Auto msg
        triggerBackgroundNotification(createdOrder, 'RECEIVED');
      }
    } catch (e: any) {
      alert(`فشل الحفظ: ${e.message}`);
    } finally { 
      setLoading(false); 
    }
  };

  const updateOrderStatus = async (id: string, status: OrderStatus) => {
    try {
      const nowISO = new Date().toISOString();
      const { error } = await supabase.from('orders').update({ status, updated_at: nowISO }).eq('id', id);
      if (error) throw error;
      
      setOrders(prev => {
        const target = prev.find(o => o.id === id);
        if (target) {
          const updated = { ...target, status, updated_at: nowISO };
          if (status === 'Ready') {
            triggerBackgroundNotification(updated, 'READY');
          }
          return prev.map(o => o.id === id ? updated : o);
        }
        return prev;
      });
    } catch (e) { console.error(e); }
  };

  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);

  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);

  const deleteOrder = async (id: string, orderNumber: string) => {
    console.log("--- DELETE PROCESS STARTED ---");
    console.log("Order ID:", id);
    console.log("Order Number:", orderNumber);
    
    if (!id) {
      alert('خطأ: معرف الطلب مفقود');
      return;
    }
    
    setDeletingOrderId(id);
    try {
      console.log("Calling Supabase delete for ID:", id);
      
      const response = await supabase
        .from('orders')
        .delete()
        .eq('id', id);
        
      console.log("Supabase Response:", response);

      if (response.error) {
        console.error("Supabase error details:", response.error);
        throw response.error;
      }
      
      console.log("Delete successful in database. Updating local state...");
      setOrders(prev => {
        const filtered = prev.filter(o => o.id !== id);
        console.log(`Local state updated. Remaining orders: ${filtered.length}`);
        return filtered;
      });
      
      alert('تم حذف الطلب بنجاح ✅');
      setOrderToDelete(null);
      
    } catch (e: any) {
      console.error("Delete failed with error:", e);
      alert(`فشل الحذف: ${e.message || 'خطأ غير معروف'}`);
    } finally {
      setDeletingOrderId(null);
      console.log("--- DELETE PROCESS FINISHED ---");
    }
  };

  const handleUpdateOrder = async (updatedOrder: Order) => {
    try {
      const { error } = await supabase.from('orders').update(updatedOrder).eq('id', updatedOrder.id);
      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
      setShowEditOrderModal(null);
      alert('تم تحديث الطلب بنجاح');
    } catch (e: any) {
      alert(`فشل التحديث: ${e.message}`);
    }
  };

  const sendWhatsAppReminder = async (order: Order, context: MessageContext) => {
    if (sendingMessageIds.has(order.id)) return;
    setSendingMessageIds(prev => new Set(prev).add(order.id));
    
    const newWindow = window.open('about:blank', '_blank');
    if (!newWindow) {
      alert('الرجاء السماح بالنوافذ المنبثقة.');
      setSendingMessageIds(prev => { const n = new Set(prev); n.delete(order.id); return n; });
      return;
    }

    try {
      // تمرير السياق المطلوب (RECEIVED أو READY)
      const smartMsg = await generateSmartReminder(order, context);
      const fullMessage = `${smartMsg}\n\n📦 فاتورة: ${order.order_number}\n💰 الإجمالي: ${order.total.toFixed(2)} ريال\n📍 الحالة: ${statusArabic[order.status]}\n\n${DISCLAIMER_TEXT}`;
      
      const cleanPhone = order.customer_phone.replace(/\D/g, '');
      const finalPhone = cleanPhone.startsWith('966') ? cleanPhone : `966${cleanPhone.replace(/^0/, '')}`;
      newWindow.location.href = `https://wa.me/${finalPhone}?text=${encodeURIComponent(fullMessage)}`;
    } catch (error) { 
      newWindow.close(); 
      alert("خطأ في معالجة الرسالة."); 
    }
    setSendingMessageIds(prev => { const n = new Set(prev); n.delete(order.id); return n; });
  };

  const handleDownloadPDF = (order: Order) => {
    const element = document.getElementById('print-area');
    if (!element) return;
    
    const opt = {
      margin: [10, 10],
      filename: `Laundry-Invoice-${order.order_number}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, windowWidth: 800 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
  };

  const handleAddInventoryItem = async () => {
    if (!newInvItem.name) {
      alert('يرجى إدخال اسم المادة');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('inventory')
        .insert([{
          name: newInvItem.name,
          stock: newInvItem.stock,
          unit: newInvItem.unit,
          threshold: newInvItem.threshold
        }])
        .select();

      if (error) throw error;
      if (data) {
        setInventory([data[0], ...inventory]);
        setIsInvModalOpen(false);
        setNewInvItem({ name: '', stock: 0, unit: 'قطعة', threshold: 5 });
        alert('تم إضافة المادة بنجاح ✅');
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrintNewPage = (order: Order) => {
    // Expose a function to generate the WhatsApp URL
    (window as any).getWhatsAppUrlForPrint = async () => {
      try {
        const smartMsg = await generateSmartReminder(order, 'RECEIVED');
        const fullMessage = `${smartMsg}\n\n📦 فاتورة: ${order.order_number}\n💰 الإجمالي: ${order.total.toFixed(2)} ريال\n📍 الحالة: ${statusArabic[order.status]}\n\n${DISCLAIMER_TEXT}`;
        const cleanPhone = order.customer_phone.replace(/\D/g, '');
        const finalPhone = cleanPhone.startsWith('966') ? cleanPhone : `966${cleanPhone.replace(/^0/, '')}`;
        return `https://wa.me/${finalPhone}?text=${encodeURIComponent(fullMessage)}`;
      } catch (e) {
        console.error("Failed to generate WhatsApp URL:", e);
        throw e;
      }
    };

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const itemsHtml = order.items.map(item => `
      <tr>
        <td>${item.name}</td>
        <td style="text-align: center;">${item.quantity}</td>
        <td style="text-align: left;">${(item.price * item.quantity).toFixed(2)} ر.س</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html dir="rtl">
        <head>
          <title>فاتورة رقم ${order.order_number}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
            body { font-family: 'Cairo', sans-serif; padding: 40px; color: #1e293b; max-width: 800px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 40px; }
            .logo { font-size: 40px; font-weight: 900; background: #1e1b4b; color: #fff; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; border-radius: 24px; }
            .info { margin-bottom: 40px; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 24px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .info-item { display: flex; flex-direction: column; gap: 4px; }
            .info-label { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; }
            .info-value { font-size: 16px; font-weight: 900; color: #1e293b; }
            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
            .items-table th { text-align: right; padding: 12px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 14px; }
            .items-table td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 15px; font-weight: 700; }
            .summary { background: #f8fafc; padding: 32px; border-radius: 32px; margin-top: 40px; }
            .summary-item { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 14px; font-weight: 700; color: #64748b; }
            .summary-total { display: flex; justify-content: space-between; margin-top: 20px; padding-top: 20px; border-top: 2px dashed #e2e8f0; }
            .total-label { font-size: 20px; font-weight: 900; color: #1e293b; }
            .total-amount { font-size: 28px; font-weight: 900; color: #4f46e5; }
            .disclaimer { margin-top: 60px; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.8; padding: 0 40px; font-weight: 700; }
            .footer { margin-top: 60px; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 40px; display: flex; flex-direction: column; align-items: center; gap: 15px; }
            .btn { padding: 18px 60px; border: none; border-radius: 20px; font-size: 18px; font-weight: 900; cursor: pointer; transition: all 0.2s; width: 100%; max-width: 300px; }
            .btn-print { background: #4f46e5; color: white; box-shadow: 0 10px 20px rgba(79, 70, 229, 0.2); }
            .btn-whatsapp { background: #10b981; color: white; box-shadow: 0 10px 20px rgba(16, 185, 129, 0.2); }
            @media print {
              .no-print { display: none; }
              body { padding: 20px; }
              .summary { background: #fff; border: 1px solid #f1f5f9; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">M</div>
            <h1 style="margin: 0; font-size: 28px; font-weight: 900;">مغسلة التميز الذكية</h1>
            <p style="color: #64748b; font-weight: 700; margin-top: 8px;">فاتورة ضريبية مبسطة</p>
          </div>
          
          <div class="info">
            <div class="info-item"><span class="info-label">العميل</span><span class="info-value">${order.customer_name}</span></div>
            <div class="info-item"><span class="info-label">رقم الهاتف</span><span class="info-value" dir="ltr">${order.customer_phone}</span></div>
            <div class="info-item"><span class="info-label">رقم الفاتورة</span><span class="info-value">#${order.order_number}</span></div>
            <div class="info-item"><span class="info-label">التاريخ</span><span class="info-value">${new Date(order.created_at).toLocaleString('ar-SA')}</span></div>
          </div>

          <table class="items-table">
            <thead>
              <tr>
                <th>الصنف</th>
                <th style="text-align: center;">الكمية</th>
                <th style="text-align: left;">السعر</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="summary">
            <div class="summary-item"><span>المجموع الفرعي</span><span>${order.subtotal.toFixed(2)} ر.س</span></div>
            <div class="summary-item"><span>ضريبة القيمة المضافة (15%)</span><span>${order.tax.toFixed(2)} ر.س</span></div>
            ${order.custom_adjustment !== 0 ? `<div class="summary-item"><span>تعديل إضافي</span><span>${order.custom_adjustment.toFixed(2)} ر.س</span></div>` : ''}
            <div class="summary-total">
              <span class="total-label">الإجمالي النهائي</span>
              <span class="total-amount">${order.total.toFixed(2)} ر.س</span>
            </div>
          </div>

          <div class="disclaimer">
            تنويه هام: المغسلة غير مسؤولة عن فقدان أي أغراض شخصية تُترك داخل الملابس عند استلامها، كما لا تتحمل مسؤولية حفظ الملابس أو الأغراض بعد مضي (15) يومًا من تاريخ الاستلام.
          </div>

          <div class="footer no-print">
            <button class="btn btn-print" onclick="window.print()">طباعة الفاتورة</button>
            <button class="btn btn-whatsapp" onclick="handleWhatsApp()">إرسال واتساب يدوي</button>
            <p style="margin-top: 20px; font-size: 13px; color: #94a3b8; font-weight: 700;">شكراً لثقتكم بنا!</p>
          </div>

          <script>
            async function handleWhatsApp() {
              const btn = event.target;
              btn.disabled = true;
              const originalText = btn.innerText;
              btn.innerText = 'جاري التجهيز...';
              
              // Open window immediately to avoid popup blocker
              const waWindow = window.open('about:blank', '_blank');
              
              try {
                const url = await window.opener.getWhatsAppUrlForPrint();
                if (waWindow) {
                  waWindow.location.href = url;
                }
              } catch (e) {
                if (waWindow) waWindow.close();
                alert('حدث خطأ في تجهيز الرسالة');
              } finally {
                btn.disabled = false;
                btn.innerText = originalText;
              }
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleUpdateStock = async (id: string, delta: number) => {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    const newStock = Math.max(0, item.stock + delta);
    try {
      const { error } = await supabase.from('inventory').update({ stock: newStock }).eq('id', id);
      if (error) throw error;
      setInventory(inventory.map(i => i.id === id ? { ...i, stock: newStock } : i));
    } catch (e: any) { alert(e.message); }
  };

  const handleDeleteInventoryItem = async (id: string, name: string) => {
    console.log("Attempting to delete inventory item:", { id, name });
    try {
      console.log("Calling Supabase delete for inventory id:", id);
      const { error } = await supabase.from('inventory').delete().eq('id', id);
      if (error) {
        console.error("Supabase delete error:", error);
        throw error;
      }
      console.log("Delete successful, updating state");
      setInventory(prev => prev.filter(i => i.id !== id));
      alert('تم حذف المادة بنجاح ✅');
    } catch (e: any) { 
      console.error("Delete inventory item failed:", e);
      alert(e.message); 
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesSearch = o.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           o.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           o.customer_phone.includes(searchQuery);
      if (!matchesSearch) return false;
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (timeFilter !== 'all') {
        const hour = 3600000;
        const day = 86400000;
        const twoDays = 172800000;
        const orderTimestamp = new Date(o.created_at).getTime();
        const passedTimeMs = Date.now() - orderTimestamp;
        if (timeFilter === '1h') return passedTimeMs >= hour && passedTimeMs < day;
        if (timeFilter === '24h') return passedTimeMs >= day && passedTimeMs < twoDays;
        if (timeFilter === '48h') return passedTimeMs >= twoDays;
      }
      return true;
    });
  }, [orders, searchQuery, timeFilter, statusFilter]);

  if (!session) {
    return <Auth onAuthSuccess={() => {}} />;
  }

  if (dbError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <div className="bg-white p-8 rounded-3xl shadow-xl border-t-4 border-red-500 text-center">
          <Database size={48} className="mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-black mb-4">خطأ في الاتصال</h2>
          <p className="text-slate-500 mb-8">{dbError}</p>
          <button onClick={() => window.location.reload()} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold">تحديث الصفحة</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F3F4F6]">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-24 xl:w-64 bg-white border-l p-4 py-8 sticky top-0 h-screen no-print transition-all">
        <div className="flex items-center justify-center xl:justify-start gap-3 mb-12 px-2">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><ShoppingCart size={24} /></div>
          <div className="hidden xl:block"><h1 className="text-lg font-black leading-tight text-slate-800">المغسلة الذكية</h1><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Laundry Pro v5.8</p></div>
        </div>
        <nav className="space-y-4">
          {allowedNavItems.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`w-full flex flex-col xl:flex-row items-center gap-2 xl:gap-4 px-3 py-3 xl:px-5 xl:py-4 rounded-2xl transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}>
              <item.icon size={22} /><span className="text-[10px] xl:text-sm font-black">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-8 border-t border-slate-100">
          <div className="flex items-center gap-3 px-2 mb-6">
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500">
              <User size={20} />
            </div>
            <div className="hidden xl:block overflow-hidden">
              <p className="text-sm font-black text-slate-800 truncate">{userProfile?.full_name || userProfile?.email}</p>
              <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">{userProfile?.role === 'admin' ? 'مدير النظام' : userProfile?.role === 'manager' ? 'مشرف' : 'موظف'}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center xl:justify-start gap-4 px-5 py-4 rounded-2xl text-red-500 hover:bg-red-50 transition-all"
          >
            <X size={22} /><span className="hidden xl:block text-sm font-black">تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Mobile Navbar */}
      <nav className="md:hidden flex items-center justify-between px-6 py-4 bg-white border-b sticky top-0 z-[150] shadow-sm no-print">
        <div className="flex items-center gap-3"><ShoppingCart size={20} className="text-indigo-600" /><h1 className="text-lg font-black">المغسلة الذكية</h1></div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-slate-500"><Menu size={24} /></button>
      </nav>
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[140] no-print" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="absolute top-20 left-6 right-6 bg-white rounded-[2.5rem] p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
             <div className="space-y-3">
                {allowedNavItems.map(item => (
                  <button key={item.id} onClick={() => { setActiveTab(item.id as any); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-50'}`}><item.icon size={22} /><span className="text-sm font-black">{item.label}</span></button>
                ))}
                <div className="pt-4 mt-4 border-t border-slate-100">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500"><User size={20} /></div>
                    <div>
                      <p className="text-sm font-black text-slate-800">{userProfile?.full_name || userProfile?.email}</p>
                      <p className="text-[10px] font-bold text-indigo-600 uppercase">{userProfile?.role}</p>
                    </div>
                  </div>
                  <button onClick={handleLogout} className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-red-500 hover:bg-red-50 transition-all"><X size={22} /><span className="text-sm font-black">تسجيل الخروج</span></button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 p-4 lg:p-8 overflow-y-auto no-print">
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
          <div><h2 className="text-2xl font-black text-slate-900">{navItems.find(n => n.id === activeTab)?.label}</h2><p className="text-slate-500 text-sm font-medium">{new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p></div>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 lg:flex-none">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input type="text" placeholder="رقم الطلب أو العميل..." className="w-full lg:w-72 pr-12 pl-6 py-3.5 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm font-bold shadow-sm" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <button onClick={fetchData} className="p-3.5 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:bg-slate-50 active:scale-95 transition-all shadow-sm"><Repeat size={20} className={loading ? 'animate-spin' : ''} /></button>
          </div>
        </header>

        {activeTab === 'new-order' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
            <div className="lg:col-span-8 bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <h3 className="text-xl font-black flex items-center gap-3"><PlusCircle className="text-indigo-600" /> اختر الملابس</h3>
                <button onClick={() => setIsEditingPrices(!isEditingPrices)} className={`px-5 py-2 rounded-lg text-xs font-black flex items-center gap-2 transition-all ${isEditingPrices ? 'bg-orange-500 text-white' : 'bg-slate-50 text-slate-600 border'}`}><Settings2 size={14} /> {isEditingPrices ? 'حفظ الأسعار' : 'تعديل الأسعار'}</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 overflow-y-auto max-h-[60vh] pr-2 custom-scrollbar">
                {categories.map((item, idx) => (
                  <div key={idx} className="relative group">
                    <button onClick={() => togglePredefinedItem(item)} className="w-full flex flex-col items-center justify-center p-6 bg-white border border-slate-100 rounded-3xl hover:bg-indigo-600 hover:text-white transition-all active:scale-95 group-button">
                      <span className="text-3xl mb-3">{item.icon}</span>
                      <span className="text-sm font-black mb-1">{item.name}</span>
                      {isEditingPrices ? (
                        <div className="mt-2 flex flex-col items-center gap-2" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1 bg-orange-50 p-1 rounded-lg border border-orange-200">
                             <input type="number" className="w-12 bg-transparent text-center font-black text-xs text-orange-700 outline-none" value={item.price} onChange={(e) => updateCategoryPrice(idx, parseFloat(e.target.value) || 0)} />
                          </div>
                          {(item as any).id && (
                            <button onClick={() => deleteCategory((item as any).id)} className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-all">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ) : <span className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-200">{item.price} ريال</span>}
                    </button>
                  </div>
                ))}
                <button onClick={() => setShowCustomItemModal(true)} className="flex flex-col items-center justify-center p-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl hover:bg-indigo-50 transition-all active:scale-95"><Plus size={24} className="mb-2"/><span className="text-sm font-black">صنف مخصص</span></button>
              </div>
            </div>
            <div className="lg:col-span-4 bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100 flex flex-col h-full">
              <h3 className="text-xl font-black mb-6">تفاصيل العميل والطلب</h3>
              {newOrder.customer_phone && (
                <div className="mb-6 space-y-3">
                  <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm">
                          <Layers size={20} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase">إحصائيات العميل</p>
                          <p className="text-lg font-black text-indigo-700">{getCustomerStats(newOrder.customer_phone).totalItems} قطعة</p>
                        </div>
                      </div>
                      {getCustomerStats(newOrder.customer_phone).totalItems >= 100 && (
                        <div className="bg-emerald-500 text-white px-3 py-1 rounded-lg text-[10px] font-black animate-bounce">
                          مؤهل للمكافأة! 🎁
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-indigo-100/50">
                      <div className="text-center">
                        <p className="text-[9px] font-black text-slate-400 uppercase">مدفوع</p>
                        <p className="text-sm font-black text-indigo-600">{getCustomerStats(newOrder.customer_phone).paidItems}</p>
                      </div>
                      <div className="text-center border-r border-indigo-100/50">
                        <p className="text-[9px] font-black text-slate-400 uppercase">مجاني</p>
                        <p className="text-sm font-black text-emerald-600">{getCustomerStats(newOrder.customer_phone).freeItems}</p>
                      </div>
                    </div>
                  </div>

                  {getCustomerSubscription(newOrder.customer_phone) && (
                    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm">
                          <CreditCard size={20} />
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase">الرصيد المتبقي</p>
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-black text-emerald-700">{getCustomerSubscription(newOrder.customer_phone)?.items_remaining}</span>
                              <span className="text-xs font-bold text-emerald-600">/ {getCustomerSubscription(newOrder.customer_phone)?.total_items}</span>
                            </div>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-[9px] font-black text-slate-400 uppercase">ينتهي في</p>
                        <p className="text-[10px] font-bold text-emerald-600">{new Date(getCustomerSubscription(newOrder.customer_phone)!.expiry_date).toLocaleDateString('ar-SA')}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-4 mb-6">
                <div className="relative"><User className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="text" placeholder="اسم العميل" className="w-full pr-12 pl-4 py-4 bg-slate-50 border rounded-2xl outline-none font-bold" value={newOrder.customer_name} onChange={e => setNewOrder({...newOrder, customer_name: e.target.value})} /></div>
                <div className="relative text-left"><Phone className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="tel" placeholder="رقم الواتساب" className="w-full pr-12 pl-4 py-4 bg-slate-50 border rounded-2xl outline-none font-bold text-left" dir="ltr" value={newOrder.customer_phone} onChange={e => setNewOrder({...newOrder, customer_phone: e.target.value})} /></div>
                <div className="relative"><Banknote className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="number" placeholder="سعر مخصص / تعديل" className="w-full pr-12 pl-4 py-4 bg-indigo-50/50 border rounded-2xl outline-none font-bold" value={newOrder.custom_adjustment || ''} onChange={e => setNewOrder({...newOrder, custom_adjustment: parseFloat(e.target.value) || 0})} /></div>
              </div>
              <div className="flex gap-3 mb-6">
                 <button onClick={() => setNewOrder({...newOrder, order_type: 'Normal'})} className={`flex-1 py-3 rounded-xl border font-black ${newOrder.order_type === 'Normal' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white text-slate-400'}`}>عادي</button>
                 <button onClick={() => setNewOrder({...newOrder, order_type: 'Urgent'})} className={`flex-1 py-3 rounded-xl border font-black ${newOrder.order_type === 'Urgent' ? 'bg-red-50 border-red-500 text-red-700' : 'bg-white text-slate-400'}`}>مستعجل 🔥</button>
              </div>
              <button 
                onClick={() => setNewOrder({...newOrder, is_free: !newOrder.is_free})} 
                className={`w-full py-3 mb-6 rounded-xl border font-black transition-all flex items-center justify-center gap-2 ${newOrder.is_free ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg' : 'bg-white text-slate-400 border-slate-200'}`}
              >
                {newOrder.is_free ? <Check size={18} /> : <Gift size={18} />}
                {newOrder.is_free ? 'طلب مجاني ✅' : 'تحديد كطلب مجاني؟'}
              </button>
              <div className="flex-1 overflow-y-auto max-h-[30vh] space-y-3 mb-6 pr-1 custom-scrollbar">
                {newOrder.items.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border">
                    <span className="text-sm font-black">{item.name}</span>
                    <div className="flex items-center gap-3">
                      <button onClick={() => updateItemQuantity(item.id, -1)} className="w-8 h-8 bg-white border rounded-lg flex items-center justify-center text-red-500"><Trash2 size={14} /></button>
                      <span className="text-sm font-black">{item.quantity}</span>
                      <button onClick={() => updateItemQuantity(item.id, 1)} className="w-8 h-8 bg-white border rounded-lg flex items-center justify-center text-emerald-500"><Plus size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-[#1E1B4B] text-white p-8 rounded-[2.5rem] shadow-2xl mt-auto">
                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between items-center text-slate-400 text-sm font-bold"><span>المجموع:</span><span>{currentSubtotal.toFixed(2)} ر.س</span></div>
                    <div className="flex justify-between items-center text-slate-400 text-sm font-bold"><span>الضريبة (15%):</span><span>{currentTax.toFixed(2)} ر.س</span></div>
                    <div className="flex justify-between items-end border-t border-white/10 pt-4"><span className="font-black text-xl">الإجمالي</span><span className="font-black text-3xl text-indigo-400">{currentTotal.toFixed(2)} ر.س</span></div>
                  </div>
                 <div className="grid grid-cols-2 gap-3 mb-4">
                    <button onClick={() => setNewOrder({...newOrder, is_paid: !newOrder.is_paid})} className={`py-3 rounded-xl border font-black text-xs ${newOrder.is_paid ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white/5 border-white/10 text-white'}`}>{newOrder.is_paid ? 'تم السداد ✅' : 'لم يسدد'}</button>
                    {newOrder.is_paid && (
                      <select className="bg-white/10 border border-white/10 rounded-xl py-3 px-3 text-xs font-black text-white" value={newOrder.payment_method} onChange={e => setNewOrder({...newOrder, payment_method: e.target.value as any})}>
                        <option value="Cash" className="text-black">نقدي</option>
                        <option value="Card" className="text-black">شبكة</option>
                        {getCustomerSubscription(newOrder.customer_phone) && (
                          <option value="Subscription" className="text-black">من الاشتراك</option>
                        )}
                      </select>
                    )}
                 </div>
                 <button disabled={loading || (newOrder.items.length === 0 && newOrder.custom_adjustment === 0)} onClick={handleCreateOrder} className="w-full bg-white text-indigo-900 py-5 rounded-2xl font-black text-xl hover:bg-indigo-50 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-30">
                   {loading ? <Loader2 className="animate-spin" /> : <><Printer size={22} /> حفظ وطباعة</>}
                 </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3 bg-white border p-2 rounded-2xl">
                 <Filter size={16} className="text-slate-400 mr-2" />
                 <select className="bg-transparent text-sm font-black text-slate-700 outline-none" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
                    <option value="all">كل الحالات</option>{Object.entries(statusArabic).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                 </select>
              </div>
              <div className="flex gap-2 p-1.5 bg-white rounded-2xl border overflow-x-auto">
                {['all', '1h', '24h', '48h'].map(f => (
                  <button key={f} onClick={() => setTimeFilter(f as any)} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${timeFilter === f ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500'}`}>{f === 'all' ? 'الكل' : `+${f}`}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredOrders.map(order => (
                <div key={order.id} className="bg-white border-2 border-slate-50 rounded-[2.5rem] p-7 hover:border-indigo-100 transition-all group">
                   <div className="flex justify-between mb-4"><span className="text-[10px] font-mono bg-slate-50 px-2 py-1 rounded">#{order.order_number}</span><span className={`px-3 py-1 rounded-full text-[10px] font-black ${order.order_type === 'Urgent' ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-slate-50 text-slate-400'}`}>{order.order_type === 'Urgent' ? 'مستعجل 🔥' : 'عادي'}</span></div>
                   <h4 className="font-black text-xl mb-1">{order.customer_name}</h4>
                   <p className="text-sm font-bold text-indigo-500 mb-6">{order.customer_phone}</p>
                   <div className="grid grid-cols-2 gap-3 mb-6 p-4 bg-slate-50 rounded-3xl border">
                      <div><p className="text-[9px] font-black text-slate-400 uppercase mb-1">الحالة</p><select className="w-full bg-transparent font-black text-indigo-700 text-xs outline-none" value={order.status} onChange={e => updateOrderStatus(order.id, e.target.value as any)}>{Object.entries(statusArabic).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                      <div className="text-left border-r pr-3 border-slate-200"><p className="text-[9px] font-black text-slate-400 uppercase mb-1">الإجمالي</p><p className={`text-sm font-black ${order.is_paid ? 'text-emerald-600' : 'text-red-500'}`}>{order.total.toFixed(2)} ر.س</p></div>
                   </div>
                    {getCustomerSubscription(order.customer_phone) && (
                      <div className="mb-6 p-4 bg-emerald-50 rounded-3xl border border-emerald-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CreditCard size={16} className="text-emerald-600" />
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase">الرصيد المتبقي</p>
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-black text-emerald-700">{getCustomerSubscription(order.customer_phone)?.items_remaining}</span>
                              <span className="text-[10px] font-bold text-emerald-600">قطعة</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-left">
                          <p className="text-[9px] font-black text-slate-400 uppercase">المنتهي في</p>
                          <p className="text-[10px] font-bold text-emerald-600">{new Date(getCustomerSubscription(order.customer_phone)!.expiry_date).toLocaleDateString('ar-SA')}</p>
                        </div>
                      </div>
                    )}
                    {order.payment_method === 'Free' && (
                      <div className="mb-4 px-4 py-2 bg-emerald-500 text-white rounded-xl text-center text-xs font-black shadow-sm">
                        هذا الطلب مجاني 🎁
                      </div>
                    )}
                    <div className="grid grid-cols-4 gap-2">
                       <button onClick={(e) => { e.stopPropagation(); handlePrintNewPage(order); }} className="p-3 bg-white border rounded-xl flex items-center justify-center text-slate-500 hover:text-indigo-600 transition-all" title="طباعة"><Printer size={18} className="pointer-events-none" /></button>
                       <button onClick={(e) => { e.stopPropagation(); sendWhatsAppReminder(order, 'READY'); }} className="p-3 bg-white border rounded-xl flex items-center justify-center text-slate-500 hover:text-emerald-600 transition-all" title="واتساب"><Send size={18} className="pointer-events-none" /></button>
                       <button onClick={(e) => { e.stopPropagation(); setShowEditOrderModal(order); }} className="p-3 bg-white border rounded-xl flex items-center justify-center text-slate-500 hover:text-blue-600 transition-all" title="تعديل"><Edit3 size={18} className="pointer-events-none" /></button>
                        <button 
                          disabled={deletingOrderId === order.id}
                          onClick={(e) => { 
                            e.stopPropagation();
                            console.log("Setting order to delete:", order.order_number);
                            setOrderToDelete(order);
                          }} 
                          className="p-3 bg-white border rounded-xl flex items-center justify-center text-slate-500 hover:text-red-600 transition-all disabled:opacity-50" 
                          title="حذف"
                        >
                          {deletingOrderId === order.id ? <Loader2 size={18} className="animate-spin pointer-events-none" /> : <Trash2 size={18} className="pointer-events-none" />}
                        </button>
                       <button onClick={(e) => {
                         e.stopPropagation();
                         setNewOrder({
                           customer_name: order.customer_name,
                           customer_phone: order.customer_phone,
                           order_type: 'Normal',
                           items: [],
                           is_paid: false,
                           payment_method: 'Cash',
                           custom_adjustment: 0,
                           is_free: false
                         });
                         setActiveTab('new-order');
                       }} className="p-3 bg-white border rounded-xl flex items-center justify-center text-slate-500 hover:text-orange-600 transition-all" title="طلب جديد"><PlusCircle size={18} className="pointer-events-none" /></button>
                       <button onClick={(e) => { e.stopPropagation(); setShowAssignSubModal({ name: order.customer_name, phone: order.customer_phone }); }} className="p-3 bg-white border rounded-xl flex items-center justify-center text-slate-500 hover:text-indigo-600 transition-all" title="تفعيل اشتراك"><CreditCard size={18} className="pointer-events-none" /></button>
                       <button onClick={(e) => { e.stopPropagation(); updateOrderStatus(order.id, 'Delivered'); }} className="col-span-2 p-3 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-all gap-2 text-xs font-black"><CheckCircle size={18} className="pointer-events-none" /> تسليم</button>
                    </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'offers' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {offers.map(offer => (
                <div key={offer.id} className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/5 rounded-bl-full -mr-16 -mt-16 transition-all group-hover:scale-150"></div>
                  <div className="relative">
                    <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                      <Gift size={32} />
                    </div>
                    <h3 className="text-xl font-black mb-2">{offer.title}</h3>
                    <p className="text-slate-500 font-medium mb-6">{offer.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black">نشط الآن</span>
                      {offer.threshold_items && (
                        <span className="text-xs font-bold text-slate-400">الحد الأدنى: {offer.threshold_items} قطعة</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] p-8 flex flex-col items-center justify-center text-center">
                <PlusCircle size={48} className="text-slate-300 mb-4" />
                <h3 className="text-lg font-black text-slate-400">إضافة عرض جديد</h3>
                <p className="text-sm text-slate-400">قريباً في التحديث القادم</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'subscriptions' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-100">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                <div className="flex items-center gap-4">
                  <div className="p-4 bg-indigo-50 text-indigo-600 rounded-3xl">
                    <CreditCard size={32} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900">الاشتراكات الشهرية المقدمة</h3>
                    <p className="text-slate-400 font-bold text-sm">إدارة باقات العملاء المسبقة الدفع</p>
                  </div>
                </div>
                <button onClick={() => setShowPackageModal(true)} className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-lg shadow-indigo-100">
                  <PlusCircle size={20} /> إنشاء باقة جديدة
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {subscriptionPackages.map(pkg => (
                  <div key={pkg.id} className="bg-indigo-900 text-white rounded-[2rem] p-8 shadow-xl relative overflow-hidden group hover:scale-[1.02] transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-bl-full -mr-12 -mt-12 group-hover:scale-150 transition-all"></div>
                    <h4 className="text-lg font-black mb-1">{pkg.name}</h4>
                    <p className="text-indigo-300 text-xs mb-6">{pkg.total_items} قطعة / {pkg.duration_days} يوم</p>
                    <div className="flex items-end gap-1 mb-8">
                      <span className="text-4xl font-black">{pkg.price}</span>
                      <span className="text-sm font-bold opacity-60 mb-1">ريال</span>
                    </div>
                    <ul className="space-y-3 mb-8 text-sm font-medium">
                      <li className="flex items-center gap-2"><Check size={16} className="text-indigo-400" /> غسيل وكي</li>
                      <li className="flex items-center gap-2"><Check size={16} className="text-indigo-400" /> صالحة لمدة {pkg.duration_days} يوم</li>
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            {subscriptions.length > 0 && (
              <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-100">
                <h3 className="text-xl font-black mb-8">العملاء المشتركين حالياً</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-right">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="pb-4 font-black text-slate-400 text-sm">العميل</th>
                        <th className="pb-4 font-black text-slate-400 text-sm">الباقة</th>
                        <th className="pb-4 font-black text-slate-400 text-sm">الرصيد المتبقي</th>
                        <th className="pb-4 font-black text-slate-400 text-sm">تاريخ الانتهاء</th>
                        <th className="pb-4 font-black text-slate-400 text-sm">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {subscriptions.map(sub => {
                        const pkg = subscriptionPackages.find(p => p.id === sub.package_id);
                        const isExpired = new Date(sub.expiry_date) < new Date();
                        return (
                          <tr key={sub.id} className="hover:bg-slate-50/50 transition-all">
                            <td className="py-6">
                              <p className="font-black text-slate-800">{sub.customer_name}</p>
                              <p className="text-xs text-slate-400">{sub.customer_phone}</p>
                            </td>
                            <td className="py-6 font-bold text-indigo-600">{pkg?.name || 'باقة محذوفة'}</td>
                            <td className="py-6">
                              <div className="flex items-center gap-2">
                                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden max-w-[100px]">
                                  <div 
                                    className="bg-emerald-500 h-full" 
                                    style={{ width: `${(sub.items_remaining / sub.total_items) * 100}%` }}
                                  ></div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <input 
                                    type="number" 
                                    className="w-12 bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-xs font-black text-center"
                                    value={sub.items_remaining}
                                    onChange={(e) => updateSubscriptionBalance(sub.id, parseInt(e.target.value) || 0)}
                                  />
                                  <span className="text-xs font-bold text-slate-400">/ {sub.total_items}</span>
                                </div>
                              </div>
                            </td>
                            <td className="py-6 text-sm font-bold text-slate-500">
                              {new Date(sub.expiry_date).toLocaleDateString('ar-SA')}
                            </td>
                            <td className="py-6">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black ${
                                !isExpired && sub.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {!isExpired && sub.is_active ? 'نشط' : 'منتهي'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="space-y-6 animate-in zoom-in-95 duration-500">
            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
               <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-10">
                 <div>
                   <h3 className="text-xl font-black">المواد الاستهلاكية</h3>
                   <p className="text-slate-400 text-sm font-bold">إدارة المخزون والمواد المستخدمة</p>
                 </div>
                 <div className="flex items-center gap-3 w-full md:w-auto">
                   <div className="relative flex-1 md:w-64">
                     <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                     <input 
                       type="text" 
                       placeholder="بحث في المخزون..." 
                       className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                       value={searchQuery}
                       onChange={(e) => setSearchQuery(e.target.value)}
                     />
                   </div>
                   <button onClick={fetchData} className="p-3 bg-slate-50 text-slate-500 rounded-2xl hover:text-indigo-600 transition-all">
                     <Repeat size={20} />
                   </button>
                   <button onClick={() => setIsInvModalOpen(true)} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all">
                     <Plus size={18} /> إضافة مادة
                   </button>
                 </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {inventory
                   .filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
                   .map(item => (
                    <div key={item.id} className="bg-white border-2 border-slate-50 rounded-[2.5rem] p-8 hover:border-indigo-100 transition-all group">
                      <div className="flex justify-between items-center mb-6">
                        <div className={`p-4 rounded-2xl transition-all ${item.stock <= item.threshold ? 'bg-red-50 text-red-500' : 'bg-indigo-50 text-indigo-600'}`}>
                          <Layers size={24} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteInventoryItem(item.id, item.name); }} className="p-2 text-slate-300 hover:text-red-500 transition-all">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                      <h4 className="text-lg font-black text-slate-800 mb-1">{item.name}</h4>
                      <div className="flex items-baseline gap-2 mb-8">
                        <p className={`text-4xl font-black ${item.stock <= item.threshold ? 'text-red-500' : 'text-indigo-600'}`}>{item.stock}</p>
                        <span className="text-sm font-bold text-slate-400">{item.unit}</span>
                      </div>
                      
                      {item.stock <= item.threshold && (
                        <div className="flex items-center gap-2 text-red-500 text-[10px] font-black uppercase tracking-wider mb-6 bg-red-50 w-fit px-3 py-1 rounded-full">
                          <AlertTriangle size={12} /> مخزون منخفض
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button onClick={() => handleUpdateStock(item.id, 1)} className="flex-1 bg-slate-100 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-200 transition-all">
                          <Plus size={16} /> زيادة
                        </button>
                        <button onClick={() => handleUpdateStock(item.id, -1)} className="flex-1 bg-white border border-slate-100 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all">
                          <Minus size={16} /> نقص
                        </button>
                      </div>
                    </div>
                  ))}
               </div>
               
               {inventory.length === 0 && !loading && (
                 <div className="text-center py-20">
                   <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-300">
                     <Package size={40} />
                   </div>
                   <h3 className="text-xl font-black text-slate-800 mb-2">لا يوجد مواد في المخزون</h3>
                   <p className="text-slate-400 font-bold">ابدأ بإضافة المواد الاستهلاكية التي تستخدمها في المغسلة</p>
                 </div>
               )}
            </div>
          </div>
        )}

        {activeTab === 'finance' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
                   <h3 className="text-xl font-black mb-8">الأداء المالي</h3>
                   <div className="h-64 bg-slate-50 rounded-[2rem] border-2 border-dashed flex items-center justify-center p-8 text-center text-slate-400 font-bold"><TrendingUp size={48} className="text-indigo-600 mr-4 opacity-40" /> الرسوم البيانية تتطلب بيانات أكثر للتحليل..</div>
                </div>
                <div className="bg-[#1E1B4B] text-white rounded-[2.5rem] p-10 shadow-2xl space-y-8">
                   <h3 className="text-xl font-black flex items-center gap-3"><Wallet className="text-indigo-400" /> ملخص الخزينة</h3>
                   <div className="border-b border-white/10 pb-6"><p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">إجمالي المبيعات</p><p className="text-4xl font-black text-indigo-400">{stats.totalRevenue.toFixed(2)} <span className="text-xs">ر.س</span></p></div>
                   <div className="border-b border-white/10 pb-6"><p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">المبالغ غير المحصلة</p><p className="text-3xl font-black text-red-400">{stats.pendingAmount.toFixed(2)} <span className="text-xs">ر.س</span></p></div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'users' && userProfile?.role === 'admin' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-10">
                <h3 className="text-xl font-black flex items-center gap-3">
                  <ShieldCheck className="text-indigo-600" /> إدارة المستخدمين والصلاحيات
                </h3>
                <button onClick={fetchProfiles} className="p-3 bg-slate-50 rounded-xl text-slate-500 hover:text-indigo-600 transition-all">
                  <Repeat size={20} />
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-right">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-4 font-black text-slate-400 text-sm">المستخدم</th>
                      <th className="pb-4 font-black text-slate-400 text-sm">البريد الإلكتروني</th>
                      <th className="pb-4 font-black text-slate-400 text-sm">الصلاحية الحالية</th>
                      <th className="pb-4 font-black text-slate-400 text-sm">تغيير الصلاحية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {profiles.map(profile => (
                      <tr key={profile.id} className="group hover:bg-slate-50/50 transition-all">
                        <td className="py-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-black">
                              {profile.full_name?.[0] || profile.email?.[0].toUpperCase()}
                            </div>
                            <span className="font-black text-slate-800">{profile.full_name || 'بدون اسم'}</span>
                          </div>
                        </td>
                        <td className="py-6 text-sm font-bold text-slate-500">{profile.email}</td>
                        <td className="py-6">
                          <span className={`px-4 py-1.5 rounded-full text-[10px] font-black ${
                            profile.role === 'admin' ? 'bg-indigo-100 text-indigo-700' :
                            profile.role === 'manager' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {profile.role === 'admin' ? 'مدير نظام' : profile.role === 'manager' ? 'مشرف' : 'موظف'}
                          </span>
                        </td>
                        <td className="py-6">
                          <select 
                            className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-black outline-none focus:ring-2 focus:ring-indigo-500/20"
                            value={profile.role}
                            onChange={(e) => updateUserRole(profile.id, e.target.value as UserRole)}
                            disabled={profile.id === session?.user?.id}
                          >
                            <option value="staff">موظف</option>
                            <option value="manager">مشرف</option>
                            <option value="admin">مدير نظام</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-100">
              <div className="flex items-center gap-4 mb-10"><div className="p-4 bg-indigo-50 text-indigo-600 rounded-3xl"><Settings2 size={32} /></div><div><h3 className="text-2xl font-black text-slate-900">إعدادات Twilio</h3><p className="text-slate-400 font-bold text-sm">لإرسال إشعارات الواتساب التلقائية في الخلفية</p></div></div>
              <div className="space-y-6">
                 <div className="flex items-center justify-between mb-4"><h4 className="text-lg font-black flex items-center gap-2"><Zap className="text-orange-500" /> تفعيل الإرسال التلقائي</h4><input type="checkbox" checked={twilioConfig.enabled} onChange={e => setTwilioConfig({...twilioConfig, enabled: e.target.checked})} className="w-6 h-6 accent-indigo-600" /></div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 bg-slate-50 rounded-[2rem] border">
                    <div className="space-y-2"><label className="text-xs font-black text-slate-400 uppercase">Account SID</label><input type="text" className="w-full px-6 py-4 bg-white border rounded-2xl font-mono text-sm" value={twilioConfig.accountSid} onChange={e => setTwilioConfig({...twilioConfig, accountSid: e.target.value})} /></div>
                    <div className="space-y-2"><label className="text-xs font-black text-slate-400 uppercase">Auth Token</label><input type="password" className="w-full px-6 py-4 bg-white border rounded-2xl font-mono text-sm" value={twilioConfig.authToken} onChange={e => setTwilioConfig({...twilioConfig, authToken: e.target.value})} /></div>
                    <div className="space-y-2"><label className="text-xs font-black text-slate-400 uppercase">Twilio Phone (WhatsApp)</label><input type="text" className="w-full px-6 py-4 bg-white border rounded-2xl font-mono text-sm" placeholder="+14155238886" value={twilioConfig.fromNumber} onChange={e => setTwilioConfig({...twilioConfig, fromNumber: e.target.value})} /></div>
                 </div>
                 <button disabled={saveLoading} onClick={saveSettingsToDB} className="w-full bg-indigo-600 text-white py-5 rounded-[2rem] font-black text-xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all">
                   {saveLoading ? <Loader2 className="animate-spin" /> : <><Save size={24} /> حفظ الإعدادات</>}
                 </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          userProfile?.role !== 'staff' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-in slide-in-from-bottom-4">
               {[
                 { label: 'صافي الدخل', value: `${stats.totalRevenue.toFixed(2)} ر.س`, icon: Banknote, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                 { label: 'طلبات جارية', value: stats.pendingOrdersCount, icon: Clock, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                 { label: 'مبالغ معلقة', value: `${stats.pendingAmount.toFixed(2)} ر.س`, icon: Wallet, color: 'text-orange-600', bg: 'bg-orange-50' },
                 { label: 'نقص المخزون', value: stats.lowStockCount, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
               ].map((s, i) => (
                 <div key={i} className="bg-white p-6 rounded-[2rem] border shadow-sm group hover:scale-105 transition-all">
                   <div className={`p-4 ${s.bg} ${s.color} rounded-2xl w-fit mb-4`}><s.icon size={24} /></div>
                   <p className="text-slate-400 text-[10px] font-black uppercase mb-1">{s.label}</p>
                   <p className="text-2xl font-black text-slate-800">{s.value}</p>
                 </div>
               ))}
            </div>
          ) : (
            <div className="bg-white p-12 rounded-[2.5rem] border shadow-sm text-center animate-in fade-in">
              <ShieldCheck size={48} className="mx-auto text-indigo-600 mb-4 opacity-20" />
              <h3 className="text-xl font-black text-slate-800 mb-2">مرحباً بك في نظام المغسلة الذكية</h3>
              <p className="text-slate-500 font-medium">استخدم القائمة الجانبية للبدء في معالجة الطلبات.</p>
            </div>
          )
        )}
      </main>

      {/* Modals */}
      {showPackageModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200] p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black">إنشاء باقة اشتراك جديدة</h3>
              <button onClick={() => setShowPackageModal(false)} className="p-2 bg-slate-100 rounded-xl text-slate-500"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase">اسم الباقة</label>
                <input type="text" placeholder="مثال: الباقة البرونزية" className="w-full px-5 py-4 bg-slate-50 border rounded-2xl outline-none font-bold" value={packageForm.name} onChange={e => setPackageForm({...packageForm, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase">عدد القطع</label>
                  <input type="number" placeholder="30" className="w-full px-5 py-4 bg-slate-50 border rounded-2xl outline-none font-bold" value={packageForm.total_items || ''} onChange={e => setPackageForm({...packageForm, total_items: parseInt(e.target.value) || 0})} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase">السعر (ريال)</label>
                  <input type="number" placeholder="150" className="w-full px-5 py-4 bg-slate-50 border rounded-2xl outline-none font-bold" value={packageForm.price || ''} onChange={e => setPackageForm({...packageForm, price: parseFloat(e.target.value) || 0})} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase">المدة (أيام)</label>
                <input type="number" placeholder="30" className="w-full px-5 py-4 bg-slate-50 border rounded-2xl outline-none font-bold" value={packageForm.duration_days || ''} onChange={e => setPackageForm({...packageForm, duration_days: parseInt(e.target.value) || 0})} />
              </div>
              <button onClick={handleCreatePackage} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black mt-4">حفظ الباقة</button>
            </div>
          </div>
        </div>
      )}

      {isInvModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200] p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black">إضافة مادة جديدة للمخزون</h3>
              <button onClick={() => setIsInvModalOpen(false)} className="p-2 bg-slate-100 rounded-xl text-slate-500"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase">اسم المادة</label>
                <input type="text" placeholder="مثال: صابون سائل" className="w-full px-5 py-4 bg-slate-50 border rounded-2xl outline-none font-bold" value={newInvItem.name} onChange={e => setNewInvItem({...newInvItem, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase">الكمية الحالية</label>
                  <input type="number" placeholder="0" className="w-full px-5 py-4 bg-slate-50 border rounded-2xl outline-none font-bold" value={newInvItem.stock || ''} onChange={e => setNewInvItem({...newInvItem, stock: parseInt(e.target.value) || 0})} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase">الوحدة</label>
                  <input type="text" placeholder="قطعة / لتر" className="w-full px-5 py-4 bg-slate-50 border rounded-2xl outline-none font-bold" value={newInvItem.unit} onChange={e => setNewInvItem({...newInvItem, unit: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-400 uppercase">حد التنبيه (عند الوصول لهذا الرقم سيظهر تنبيه)</label>
                <input type="number" placeholder="5" className="w-full px-5 py-4 bg-slate-50 border rounded-2xl outline-none font-bold" value={newInvItem.threshold || ''} onChange={e => setNewInvItem({...newInvItem, threshold: parseInt(e.target.value) || 0})} />
              </div>
              <button 
                onClick={handleAddInventoryItem} 
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black mt-4 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <><Save size={20} /> حفظ المادة</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAssignSubModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200] p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black">تفعيل اشتراك للعميل</h3>
              <button onClick={() => setShowAssignSubModal(null)} className="p-2 bg-slate-100 rounded-xl text-slate-500"><X size={20} /></button>
            </div>
            <div className="mb-8 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
              <p className="text-sm font-black text-indigo-900">{showAssignSubModal.name}</p>
              <p className="text-xs font-bold text-indigo-600">{showAssignSubModal.phone}</p>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-black text-slate-400 uppercase mb-2">اختر الباقة المناسبة</p>
              {subscriptionPackages.map(pkg => (
                <button 
                  key={pkg.id} 
                  onClick={() => handleAssignSubscription(pkg.id)}
                  className="w-full flex items-center justify-between p-5 bg-white border-2 border-slate-50 rounded-2xl hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
                >
                  <div className="text-right">
                    <p className="font-black text-slate-800 group-hover:text-indigo-900">{pkg.name}</p>
                    <p className="text-xs font-bold text-slate-400">{pkg.total_items} قطعة - {pkg.duration_days} يوم</p>
                  </div>
                  <p className="font-black text-indigo-600">{pkg.price} ريال</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showCustomItemModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200] p-4">
           <div className="bg-white rounded-[3rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95">
              <h3 className="text-xl font-black mb-6">صنف مخصص</h3>
              <input type="text" placeholder="اسم الصنف" className="w-full px-5 py-4 bg-slate-50 border rounded-2xl mb-4 outline-none font-bold" value={customItemForm.name} onChange={e => setCustomItemForm({...customItemForm, name: e.target.value})} />
              <input type="number" placeholder="السعر" className="w-full px-5 py-4 bg-slate-50 border rounded-2xl mb-8 outline-none font-bold" value={customItemForm.price || ''} onChange={e => setCustomItemForm({...customItemForm, price: parseFloat(e.target.value) || 0})} />
              <button onClick={handleAddCustomItem} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black">إضافة للسلة</button>
           </div>
        </div>
      )}

      {showEditOrderModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-2xl font-black">تعديل الطلب #{showEditOrderModal.order_number}</h3>
              <button onClick={() => setShowEditOrderModal(null)} className="p-3 bg-slate-50 rounded-2xl text-slate-400 hover:text-red-500 transition-all"><X size={24} /></button>
            </div>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">اسم العميل</label>
                  <input 
                    type="text" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-black outline-none focus:border-indigo-500 transition-all"
                    value={showEditOrderModal.customer_name}
                    onChange={e => setShowEditOrderModal({...showEditOrderModal, customer_name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">رقم الهاتف</label>
                  <input 
                    type="text" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-black outline-none focus:border-indigo-500 transition-all"
                    value={showEditOrderModal.customer_phone}
                    onChange={e => setShowEditOrderModal({...showEditOrderModal, customer_phone: e.target.value})}
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase mb-2">حالة الطلب</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-black outline-none focus:border-indigo-500 transition-all"
                  value={showEditOrderModal.status}
                  onChange={e => setShowEditOrderModal({...showEditOrderModal, status: e.target.value as OrderStatus})}
                >
                  {Object.entries(statusArabic).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">طريقة الدفع</label>
                  <select 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-black outline-none focus:border-indigo-500 transition-all"
                    value={showEditOrderModal.payment_method}
                    onChange={e => setShowEditOrderModal({...showEditOrderModal, payment_method: e.target.value as PaymentMethod})}
                  >
                    <option value="Cash">نقدي</option>
                    <option value="Card">شبكة</option>
                    <option value="Subscription">من الاشتراك</option>
                    <option value="Free">مجاني</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button 
                    onClick={() => setShowEditOrderModal({...showEditOrderModal, is_paid: !showEditOrderModal.is_paid})}
                    className={`w-full p-4 rounded-2xl font-black text-sm border transition-all ${showEditOrderModal.is_paid ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-200 text-slate-400'}`}
                  >
                    {showEditOrderModal.is_paid ? 'تم السداد ✅' : 'لم يسدد'}
                  </button>
                </div>
              </div>
            </div>
            <div className="p-8 border-t border-slate-100 flex gap-3">
              <button 
                onClick={() => handleUpdateOrder(showEditOrderModal)}
                className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black text-lg shadow-lg hover:bg-indigo-700 active:scale-95 transition-all"
              >
                حفظ التغييرات
              </button>
              <button 
                onClick={() => setShowEditOrderModal(null)}
                className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black text-lg hover:bg-slate-200 active:scale-95 transition-all"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {orderToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[250] p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-md p-10 shadow-2xl relative animate-in zoom-in duration-200">
            <div className="text-center">
              <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={40} />
              </div>
              <h2 className="text-2xl font-black mb-2">تأكيد الحذف</h2>
              <p className="text-slate-500 font-bold mb-8">
                هل أنت متأكد من حذف الطلب رقم <span className="text-red-600 font-black">{orderToDelete.order_number}</span> نهائياً من قاعدة البيانات؟
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setOrderToDelete(null)}
                  className="py-4 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200 transition-all"
                >
                  إلغاء
                </button>
                <button 
                  disabled={deletingOrderId === orderToDelete.id}
                  onClick={() => deleteOrder(orderToDelete.id, orderToDelete.order_number)}
                  className="py-4 bg-red-600 text-white rounded-2xl font-black shadow-lg shadow-red-200 hover:bg-red-700 transition-all flex items-center justify-center gap-2"
                >
                  {deletingOrderId === orderToDelete.id ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      جاري الحذف...
                    </>
                  ) : (
                    <>
                      <Trash2 size={20} />
                      حذف نهائي
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPrintModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200] p-4 no-print">
          <div className="bg-white rounded-[3rem] w-full max-w-lg p-10 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowPrintModal(null)} className="absolute top-8 left-8 p-3 bg-slate-100 rounded-2xl text-slate-500"><X size={20} /></button>
            <div id="print-area" className="text-center bg-white p-6 rounded-3xl">
              <div className="mb-8"><div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl font-black">M</div><h2 className="text-2xl font-black mb-1">مغسلة التميز الذكية</h2></div>
              <div className="border-y border-slate-100 py-6 mb-8 text-right space-y-3">
                <div className="flex justify-between items-center text-xs"><span>العميل:</span><span className="font-black">{showPrintModal.customer_name}</span></div>
                <div className="flex justify-between items-center text-xs"><span>رقم الهاتف:</span><span dir="ltr" className="font-bold">{showPrintModal.customer_phone}</span></div>
                <div className="flex justify-between items-center text-xs"><span>رقم الفاتورة:</span><span className="font-mono font-black">{showPrintModal.order_number}</span></div>
                <div className="flex justify-between items-center text-xs"><span>التاريخ:</span><span className="font-bold">{new Date(showPrintModal.created_at).toLocaleString('ar-SA')}</span></div>
              </div>
              <div className="space-y-4 mb-10 text-right">
                {showPrintModal.items.map(item => (
                  <div key={item.id} className="flex justify-between items-center text-sm"><span>{item.name} x{item.quantity}</span><span>{(item.price * item.quantity).toFixed(2)} ر.س</span></div>
                ))}
              </div>
              <div className="bg-slate-50 p-8 rounded-[2.5rem] border mb-6"><div className="flex justify-between text-2xl font-black pt-4"><span>الإجمالي</span><span className="text-indigo-600">{showPrintModal.total.toFixed(2)} ر.س</span></div></div>
              <div className="text-[10px] text-slate-400 font-bold mb-8 leading-relaxed text-center">
                تنويه هام: المغسلة غير مسؤولة عن فقدان أي أغراض شخصية تُترك داخل الملابس عند استلامها، كما لا تتحمل مسؤولية حفظ الملابس أو الأغراض بعد مضي (15) يومًا من تاريخ الاستلام.
              </div>
              <BarcodeGenerator value={showPrintModal.order_number} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
              <button onClick={() => window.print()} className="bg-indigo-600 text-white py-5 rounded-2xl font-black text-lg shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3"><Printer size={22}/> طباعة</button>
              <button onClick={() => handleDownloadPDF(showPrintModal)} className="bg-orange-500 text-white py-5 rounded-2xl font-black text-lg shadow-xl hover:bg-orange-600 transition-all flex items-center justify-center gap-3"><Download size={22}/> تحميل PDF</button>
              {/* هنا نرسل RECEIVED لأننا في الفاتورة */}
              <button onClick={() => sendWhatsAppReminder(showPrintModal, 'RECEIVED')} className="bg-emerald-500 text-white py-5 rounded-2xl font-black text-lg shadow-xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-3 sm:col-span-2"><Send size={22}/> إرسال واتساب يدوي</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
