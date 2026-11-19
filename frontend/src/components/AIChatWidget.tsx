import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  Camera,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { apiUrl } from '../lib/api';
import type { CategorySlug, Product } from '../types/grocery';
import { SafeImage } from './SafeImage';

interface ChatProductCard {
  id: string;
  slug: string;
  name: string;
  nameBn: string;
  brand: string;
  brandBn: string;
  category: string;
  price: number;
  originalPrice?: number;
  unit: string;
  unitBn: string;
  inStock: boolean;
  stockCount: number;
  image: string;
  description: string;
  descriptionBn: string;
  variants?: Array<{ label: string; labelBn?: string; price: number; originalPrice?: number }>;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  imagePreviewUrl?: string;
  detectedItemName?: string;
  products?: ChatProductCard[];
  isError?: boolean;
}

export const AIChatWidget: React.FC = () => {
  const { lang, products: catalogProducts, addToCart, formatPrice } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, isOpen]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const clearAttachment = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const resolveCartProduct = (card: ChatProductCard): Product => {
    const live = catalogProducts.find((p) => p.id === card.id);
    if (live) return live;
    return {
      id: card.id,
      slug: card.slug,
      name: card.name,
      nameBn: card.nameBn,
      brand: card.brand,
      brandBn: card.brandBn,
      category: card.category as CategorySlug,
      price: card.price,
      originalPrice: card.originalPrice,
      unit: card.unit,
      unitBn: card.unitBn,
      unitType: 'packet',
      variants: card.variants,
      rating: 4.8,
      reviewCount: 0,
      inStock: card.inStock,
      stockCount: card.stockCount,
      description: card.description,
      descriptionBn: card.descriptionBn,
      origin: 'Bangladesh',
      originBn: 'বাংলাদেশ',
      shelfLife: 'Fresh stock',
      shelfLifeBn: 'তাজা স্টক',
      image: card.image,
    };
  };

  const sendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    const fileToSend = overrideText ? null : selectedFile;
    if ((!text && !fileToSend) || sending) return;

    const userMsgId = `u-${Date.now()}`;
    const userBubbleImage = fileToSend && previewUrl ? previewUrl : undefined;

    const historyPayload = messages
      .filter((m) => !m.isError)
      .slice(-6)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: 'user',
        text:
          text ||
          (lang === 'bn' ? 'ছবির পণ্যটি সম্পর্কে বিস্তারিত বলুন' : 'Identify this product & details'),
        imagePreviewUrl: userBubbleImage,
      },
    ]);

    if (!overrideText) {
      setInput('');
      // Keep the previewUrl alive in message history; detach from composer without revoking
      setSelectedFile(null);
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('message', text);
      formData.append('lang', lang);
      formData.append('history', JSON.stringify(historyPayload));
      if (fileToSend) {
        formData.append('image', fileToSend);
      }

      const res = await fetch(apiUrl('/api/chat'), {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to get AI response.');
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: String(data.reply ?? ''),
          detectedItemName: data.detectedItemName ? String(data.detectedItemName) : undefined,
          products: Array.isArray(data.products) ? data.products : [],
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'model',
          text:
            (err as Error).message ||
            (lang === 'bn'
              ? 'এই মুহূর্তে এআই অ্যাসিস্ট্যান্টের সাথে সংযোগ করা যায়নি।'
              : 'Could not reach Avado AI right now.'),
          isError: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const quickPrompts =
    lang === 'bn'
      ? [
          'কোন কোন ফল আছে?',
          '৳১০০ থেকে ৳২৫০ টাকার মধ্যে কি কি পণ্য আছে?',
          'ডেলিভারি চার্জ ও প্রমো কোড কী কী?',
        ]
      : [
          'What fruits do you have?',
          'Show products between ৳100 and ৳250',
          'Delivery charges & promo codes?',
        ];

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={lang === 'bn' ? 'অ্যাভাডো এআই চ্যাট খুলুন' : 'Open Avado AI shopping assistant'}
          data-testid="ai-chat-launcher"
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 inline-flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white shadow-lg border border-emerald-600/40 transition-transform hover:scale-[1.02] cursor-pointer"
        >
          <span className="w-8 h-8 rounded-xl bg-amber-400 text-slate-900 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="text-left leading-tight">
            <span className="block text-sm font-bold">
              {lang === 'bn' ? 'অ্যাভাডো AI' : 'Avado AI'}
            </span>
            <span className="block text-[11px] text-emerald-100">
              {lang === 'bn' ? 'প্রশ্ন বা ছবি দিন' : 'Ask or upload photo'}
            </span>
          </span>
        </button>
      )}

      {isOpen && (
        <section
          aria-label={lang === 'bn' ? 'অ্যাভাডো এআই শপিং অ্যাসিস্ট্যান্ট' : 'Avado AI Shopping Assistant'}
          data-testid="ai-chat-panel"
          className="fixed bottom-3 right-3 left-3 sm:left-auto sm:bottom-6 sm:right-6 sm:w-[410px] h-[560px] max-h-[82vh] z-50 flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="bg-emerald-900 text-white px-4 py-3 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-900 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold truncate">
                  {lang === 'bn' ? 'অ্যাভাডো AI শপিং অ্যাসিস্ট্যান্ট' : 'Avado AI Assistant'}
                </h2>
                <p className="text-[11px] text-emerald-200 truncate">
                  {lang === 'bn'
                    ? 'লাইভ স্টোর ক্যাটালগ ও ছবির মাধ্যমে পণ্য খুঁজুন'
                    : 'Live database sync · Text, budget & photo search'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  aria-label={lang === 'bn' ? 'চ্যাট রিসেট করুন' : 'Clear chat'}
                  title={lang === 'bn' ? 'নতুন চ্যাট' : 'New chat'}
                  className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-emerald-800 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label={lang === 'bn' ? 'চ্যাট বন্ধ করুন' : 'Close AI assistant'}
                className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-emerald-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/70">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-2xl bg-white border border-slate-200 p-3.5 text-xs sm:text-sm text-slate-700 leading-relaxed">
                  <p className="font-bold text-slate-900 mb-1">
                    {lang === 'bn'
                      ? 'হ্যালো! আমি অ্যাভাডো AI।'
                      : 'Hello! I am Avado AI.'}
                  </p>
                  <p>
                    {lang === 'bn'
                      ? 'যেকোনো পণ্যের ছবি আপলোড করুন, ক্যাটাগরি (যেমন: কী কী ফল আছে) অথবা বাজেট রেঞ্জ (যেমন: ৳১০০–৳২৫০) লিখে প্রশ্ন করুন—আমি সরাসরি লাইভ স্টোর থেকে উত্তর দেবো।'
                      : 'Upload a product photo, ask about any category (e.g. fruits), or give a budget range (e.g. ৳100–৳250)—I search our live store catalog for you.'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-1">
                    {lang === 'bn' ? 'দ্রুত জিজ্ঞাসা করুন' : 'Quick questions'}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendMessage(prompt)}
                        className="text-left text-xs font-medium px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200 transition-colors cursor-pointer"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed whitespace-pre-line ${
                    msg.role === 'user'
                      ? 'bg-emerald-700 text-white'
                      : msg.isError
                      ? 'bg-orange-50 text-orange-900 border border-orange-200'
                      : 'bg-white text-slate-800 border border-slate-200 shadow-2xs'
                  }`}
                >
                  {msg.imagePreviewUrl && (
                    <img
                      src={msg.imagePreviewUrl}
                      alt={lang === 'bn' ? 'আপলোড করা পণ্যের ছবি' : 'Uploaded product photo'}
                      className="w-36 h-28 object-cover rounded-xl mb-2 border border-white/20"
                    />
                  )}
                  {msg.detectedItemName && (
                    <p className="text-[11px] font-bold text-emerald-700 mb-1">
                      {lang === 'bn' ? 'ছবিতে শনাক্ত হয়েছে:' : 'Detected in photo:'}{' '}
                      {msg.detectedItemName}
                    </p>
                  )}
                  <p>{msg.text}</p>
                </div>

                {msg.products && msg.products.length > 0 && (
                  <div className="w-full mt-2 space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                    {msg.products.map((prod) => (
                      <div
                        key={prod.id}
                        className="flex items-center gap-2.5 p-2 rounded-xl bg-white border border-slate-200 hover:border-emerald-400 transition-colors"
                      >
                        <Link
                          to={`/product/${prod.id}`}
                          onClick={() => setIsOpen(false)}
                          className="w-12 h-12 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden shrink-0 flex items-center justify-center"
                        >
                          <SafeImage
                            src={prod.image}
                            alt={lang === 'bn' ? prod.nameBn : prod.name}
                            className="w-full h-full object-contain"
                          />
                        </Link>
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/product/${prod.id}`}
                            onClick={() => setIsOpen(false)}
                            className="block text-xs font-bold text-slate-900 hover:text-emerald-800 truncate"
                          >
                            {lang === 'bn' ? prod.nameBn : prod.name}
                          </Link>
                          <div className="flex items-center gap-1.5 text-[11px] mt-0.5">
                            <span className="font-extrabold text-emerald-800 tabular-nums">
                              {formatPrice(prod.price)}
                            </span>
                            {prod.originalPrice && prod.originalPrice > prod.price && (
                              <span className="text-slate-400 line-through tabular-nums">
                                {formatPrice(prod.originalPrice)}
                              </span>
                            )}
                            <span className="text-slate-500">
                              · {lang === 'bn' ? prod.unitBn : prod.unit}
                            </span>
                          </div>
                          <p
                            className={`text-[10px] font-semibold mt-0.5 ${
                              prod.inStock ? 'text-emerald-700' : 'text-orange-600'
                            }`}
                          >
                            {prod.inStock
                              ? lang === 'bn'
                                ? `স্টকে আছে (${prod.stockCount})`
                                : `In stock (${prod.stockCount})`
                              : lang === 'bn'
                              ? 'স্টক শেষ'
                              : 'Out of stock'}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={!prod.inStock}
                          onClick={() => addToCart(resolveCartProduct(prod))}
                          aria-label={`Add ${prod.name} to cart`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-[11px] font-bold shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{lang === 'bn' ? 'যোগ' : 'Add'}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="flex items-start">
                <div className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 text-xs text-slate-600">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                  <span>
                    {lang === 'bn' ? 'ক্যাটালগ খুঁজছি...' : 'Checking live catalog...'}
                  </span>
                </div>
              </div>
            )}
            <div ref={endOfMessagesRef} />
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
            className="border-t border-slate-200 bg-white p-2.5 space-y-2 shrink-0"
          >
            {previewUrl && (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="w-10 h-10 rounded-lg object-cover border border-emerald-200"
                />
                <span className="text-xs font-medium text-emerald-900 truncate flex-1">
                  {selectedFile?.name || (lang === 'bn' ? 'ছবি সংযুক্ত' : 'Photo attached')}
                </span>
                <button
                  type="button"
                  onClick={clearAttachment}
                  aria-label={lang === 'bn' ? 'ছবি সরান' : 'Remove photo'}
                  className="p-1 text-emerald-800 hover:text-orange-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                id="ai-chat-image-upload"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
                className="sr-only"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label={lang === 'bn' ? 'পণ্যের ছবি আপলোড করুন' : 'Upload product photo'}
                title={lang === 'bn' ? 'ছবি দিন' : 'Upload product photo'}
                className="w-10 h-10 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center justify-center shrink-0 cursor-pointer"
              >
                <Camera className="w-4 h-4" aria-hidden="true" />
              </button>
              <label htmlFor="ai-chat-input" className="sr-only">
                {lang === 'bn' ? 'অ্যাভাডো এআই-কে জিজ্ঞাসা করুন' : 'Ask Avado AI'}
              </label>
              <input
                id="ai-chat-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  lang === 'bn'
                    ? 'পণ্য, দাম বা ছবির প্রশ্ন লিখুন...'
                    : 'Ask about products, budget or photo...'
                }
                className="flex-1 h-10 px-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <button
                type="submit"
                disabled={sending || (!input.trim() && !selectedFile)}
                aria-label={lang === 'bn' ? 'পাঠান' : 'Send message'}
                className="w-10 h-10 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white flex items-center justify-center shrink-0 cursor-pointer"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
};
