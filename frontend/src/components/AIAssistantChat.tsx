/**
 * AI Assistant Chat Widget
 * Floating chat widget that appears on all pages, providing natural language
 * access to SalesPulse analytics data.
 */
import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Bot, X, ChevronDown, ChevronUp, Loader2, AlertCircle, Sparkles, BarChart3, Map, Users, TrendingUp, Target, Shield, Plane } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import Markdown from './Markdown'

/* ─────────────────────────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────────────────────────── */
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  data?: any
  isLoading?: boolean
  isError?: boolean
}

interface AIResponse {
  answer: string
  data?: {
    type: 'bar' | 'table' | 'line' | 'text'
    title: string
    data: any
    insights?: string[]
  }
  suggestions?: string[]
}

/* ─────────────────────────────────────────────────────────────────────────────
   Quick Suggestion Buttons
   ───────────────────────────────────────────────────────────────────────────── */
const QUESTION_CATEGORIES = [
  {
    label: 'Pipeline & Deals',
    icon: <BarChart3 size={13} />,
    questions: [
      'What is our pipeline health?',
      'How many open deals do we have?',
      'Show me deals closing this week',
      'Which deals might slip?',
      'What is our average deal size?',
    ],
  },
  {
    label: 'Revenue & Performance',
    icon: <TrendingUp size={13} />,
    questions: [
      'How is revenue trending?',
      'What did we make this month?',
      'What is our total revenue YTD?',
      'What is our forecast this quarter?',
      'Compare this quarter to last',
    ],
  },
  {
    label: 'Advisors',
    icon: <Users size={13} />,
    questions: [
      'Who are our top 5 advisors?',
      'What is our win rate?',
      'Who needs coaching?',
      'Show me funnel analysis',
      'Where are we losing deals?',
    ],
  },
  {
    label: 'Territory & Census',
    icon: <Map size={13} />,
    questions: [
      'How many members in Rochester?',
      'Which cities have highest penetration?',
      'Lowest penetration with high income?',
      'Compare Western vs Rochester vs Central',
      'Where should we focus to grow?',
    ],
  },
  {
    label: 'Insurance & Travel',
    icon: <Shield size={13} />,
    questions: [
      'What is our insurance penetration?',
      'How many travel customers by region?',
      'Top cities by travel revenue?',
      'What is our market share?',
      'Which industry has best win rate?',
    ],
  },
]

/* ─────────────────────────────────────────────────────────────────────────────
   Chat Message Component
   ───────────────────────────────────────────────────────────────────────────── */
const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === 'user'
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-[85%] ${isUser ? 'order-2' : 'order-1'}`}>
        {/* Avatar */}
        {!isUser && (
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Bot size={14} className="text-white" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">SalesPulse AI</span>
          </div>
        )}
        
        {/* Message Bubble */}
        <div className={`rounded-2xl px-4 py-3 ${
          isUser 
            ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-br-md' 
            : 'bg-muted/50 text-muted-foreground rounded-bl-md'
        }`}>
          {message.isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Analyzing your data...</span>
            </div>
          ) : message.isError ? (
            <div className="flex items-start gap-2 text-red-500">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span className="text-sm">{message.content}</span>
            </div>
          ) : (
            <Markdown compact>{message.content}</Markdown>
          )}
        </div>
        
        {/* Data Visualization */}
        {message.data && !message.isLoading && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 bg-card border rounded-xl p-4"
          >
            <h4 className="text-sm font-semibold mb-3">{message.data.title}</h4>
            
            {message.data.type === 'bar' && (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={message.data.data}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'var(--card)', 
                        border: '1px solid var(--border)',
                        borderRadius: '8px'
                      }} 
                    />
                    <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            
            {message.data.type === 'table' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      {message.data.data.columns.map((col: string) => (
                        <th key={col} className="text-left py-2 px-3 font-medium">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {message.data.data.rows.slice(0, 5).map((row: any[], i: number) => (
                      <tr key={i} className="border-b last:border-0">
                        {row.map((cell: any, j: number) => (
                          <td key={j} className="py-2 px-3">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {message.data.insights && message.data.insights.length > 0 && (
              <div className="mt-3 space-y-1">
                {message.data.insights.map((insight: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Sparkles size={12} className="mt-0.5 text-violet-500" />
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
        
        {/* Timestamp */}
        <div className={`text-[10px] text-muted-foreground/60 mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </motion.div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main Chat Widget Component
   ───────────────────────────────────────────────────────────────────────────── */
export default function AIAssistantChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [showQuestions, setShowQuestions] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { user } = useAuth()

  // AI chat restricted to superadmin and officer roles only
  const AI_ALLOWED_ROLES = ['superadmin', 'officer']
  if (!user || !AI_ALLOWED_ROLES.includes(user.role)) {
    return null
  }
  
  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])
  
  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])
  
  // Welcome message on first open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `Hey ${user?.name?.split(' ')[0] || 'there'}! I'm your SalesPulse AI assistant. Ask me anything about your sales data - pipeline health, win rates, at-risk deals, forecasting, or anything else you'd like to explore.`,
          timestamp: new Date(),
        }
      ])
    }
  }, [isOpen, user, messages.length])
  
  /* ── Send Message ─────────────────────────────────────────────────────────── */
  const sendMessage = async (text: string) => {
    if (!text.trim()) return
    
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    }
    
    const loadingMessage: Message = {
      id: `loading-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    }
    
    setMessages(prev => [...prev, userMessage, loadingMessage])
    setInput('')
    setIsTyping(true)
    
    try {
      const response = await api.post<AIResponse>('/api/ai/query', {
        query: text,
        context: messages.slice(-6).map(m => ({
          role: m.role,
          content: m.content
        }))
      })
      
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.data.answer,
        timestamp: new Date(),
        data: response.data.data,
      }
      
      setMessages(prev => {
        const filtered = prev.filter(m => !m.isLoading)
        return [...filtered, assistantMessage]
      })
    } catch (error: any) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: error?.response?.data?.detail || "I'm having trouble accessing the data right now. Please try again in a moment.",
        timestamp: new Date(),
        isError: true,
      }
      
      setMessages(prev => {
        const filtered = prev.filter(m => !m.isLoading)
        return [...filtered, errorMessage]
      })
    } finally {
      setIsTyping(false)
    }
  }
  
  /* ── Keyboard Handler ─────────────────────────────────────────────────────── */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }
  
  return (
    <>
      {/* ── Floating Button ─────────────────────────────────────────────────── */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.5, type: 'spring' }}
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 transition-shadow flex items-center justify-center group"
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
            >
              <X size={24} className="text-white" />
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
            >
              <Sparkles size={24} className="text-white" />
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Pulse indicator when closed */}
        {!isOpen && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background animate-pulse" />
        )}
      </motion.button>
      
      {/* ── Chat Panel ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 z-50 w-[420px] max-w-[calc(100vw-48px)] h-[600px] max-h-[calc(100vh-160px)] bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-violet-500/10 to-purple-500/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Bot size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="font-semibold">SalesPulse AI</h3>
                  <p className="text-xs text-muted-foreground">Natural language analytics</p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
              >
                <ChevronDown size={20} className="text-muted-foreground" />
              </button>
            </div>
            
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {messages.map(message => (
                <ChatMessage key={message.id} message={message} />
              ))}
              <div ref={messagesEndRef} />
            </div>
            
            {/* Question Library Dropdown */}
            <AnimatePresence>
              {showQuestions && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-t overflow-hidden"
                >
                  <div className="max-h-[240px] overflow-y-auto px-3 py-2 space-y-1 bg-muted/30">
                    {QUESTION_CATEGORIES.map((cat) => (
                      <div key={cat.label}>
                        <button
                          onClick={() => setExpandedCategory(expandedCategory === cat.label ? null : cat.label)}
                          className="flex items-center justify-between w-full px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                        >
                          <span className="flex items-center gap-2">{cat.icon}{cat.label}</span>
                          {expandedCategory === cat.label
                            ? <ChevronUp size={12} />
                            : <ChevronDown size={12} />}
                        </button>
                        <AnimatePresence>
                          {expandedCategory === cat.label && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="overflow-hidden"
                            >
                              {cat.questions.map((q, qi) => (
                                <button
                                  key={qi}
                                  onClick={() => {
                                    sendMessage(q)
                                    setShowQuestions(false)
                                    setExpandedCategory(null)
                                  }}
                                  className="block w-full text-left px-7 py-1.5 text-xs text-foreground/80 hover:bg-violet-500/10 hover:text-violet-600 rounded-md transition-colors"
                                >
                                  {q}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input */}
            <div className="p-4 border-t bg-muted/20">
              <div className="flex items-end gap-2">
                <button
                  onClick={() => setShowQuestions(!showQuestions)}
                  title="Browse questions"
                  className={`flex-shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center transition-colors ${
                    showQuestions
                      ? 'bg-violet-500/10 border-violet-500/30 text-violet-600'
                      : 'bg-background hover:bg-muted text-muted-foreground'
                  }`}
                >
                  <ChevronUp size={18} className={`transition-transform ${showQuestions ? 'rotate-180' : ''}`} />
                </button>
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about your sales data..."
                    rows={1}
                    className="w-full resize-none rounded-xl border bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                    style={{ maxHeight: '120px' }}
                  />
                </div>
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isTyping}
                  className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  <Send size={18} />
                </button>
              </div>
              <p className="text-[10px] text-center text-muted-foreground/60 mt-2">
                Powered by AI • Data refreshed hourly
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}