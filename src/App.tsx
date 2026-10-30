import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  LinearProgress,
  Menu,
  MenuItem,
  Snackbar,
  Switch,
  TextField,
  Tooltip,
} from '@mui/material';
import {
  AddRounded,
  ArrowUpwardRounded,
  AutoAwesomeOutlined,
  CheckRounded,
  ChevronRightRounded,
  CloseRounded,
  ContentCopyRounded,
  DeleteOutlineRounded,
  DownloadRounded,
  ExpandMoreRounded,
  GitHub,
  HistoryRounded,
  InfoOutlined,
  LanguageRounded,
  MenuRounded,
  OpenInNewRounded,
  SearchRounded,
  SettingsOutlined,
  StopRounded,
  WbSunnyOutlined,
  AccountBalanceWalletOutlined,
  TravelExploreRounded,
  TuneRounded,
  PublicRounded,
  CurrencyExchangeRounded,
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { detectToolRequest, loadModel, modelAvailability, planTool, streamReply } from './model';
import { capabilitySummary } from './capabilities';
import { summarizeTitle, titleCheckpoint } from './titles';
import type { ToolRequest } from './model';
import { loadConversations, saveConversations } from './storage';
import { runTool, safeUrl, toolInfo } from './tools';
import type {
  Conversation,
  Message,
  ModelSession,
  ModelStatus,
  ToolChoice,
  ToolId,
  ToolResult,
} from './types';

const toolIcons = {
  website: <LanguageRounded />,
  wikipedia: <LanguageRounded />,
  github: <GitHub />,
  places: <TravelExploreRounded />,
  weather: <WbSunnyOutlined />,
  ip: <PublicRounded />,
  currency: <CurrencyExchangeRounded />,
};
const waiting = [
  'Overthinking',
  'Consulting approximately three neurons',
  'Warming up the hamster wheel',
  'Making an educated-ish guess',
  'Wasting time, locally',
  'Pretending this is a supercomputer',
];
const statusLabels: Record<ModelStatus, string> = {
  checking: 'Checking local AI',
  unsupported: 'Local AI unavailable',
  unavailable: 'Model unavailable',
  downloadable: 'Model download needed',
  downloading: 'Downloading model',
  available: 'Local model available',
  ready: 'Running on your device',
  error: 'Model needs attention',
};
function Coin({ small = false }: { small?: boolean }) {
  return (
    <span className={`coin ${small ? 'small' : ''}`} aria-hidden="true">
      <span>¢</span>
      <i />
    </span>
  );
}
const id = () =>
  crypto.randomUUID?.() ??
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [tool, setTool] = useState<ToolChoice>('auto');
  const [toolsAnchor, setToolsAnchor] = useState<HTMLElement | null>(null);
  const [modelAnchor, setModelAnchor] = useState<HTMLElement | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [toolGuide, setToolGuide] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [status, setStatus] = useState<ModelStatus>('checking');
  const [progress, setProgress] = useState(0);
  const [modelError, setModelError] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [toast, setToast] = useState('');
  const [saveHistory, setSaveHistory] = useState(() => {
    try {
      return localStorage.getItem('cheapgpt.remember') !== 'false';
    } catch {
      return false;
    }
  });
  const base = useRef<ModelSession | null>(null);
  const titleController = useRef<AbortController | null>(null);
  const controller = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const active = conversations.find((c) => c.id === activeId);
  const messages = active?.messages || [];
  const isConcreteTool = tool !== 'none' && tool !== 'auto';
  const needsHttps = !window.isSecureContext && window.location.protocol === 'http:';

  useEffect(() => {
    let mounted = true;
    modelAvailability()
      ?.then((s) => {
        if (mounted)
          setStatus((current) =>
            current === 'checking' ? (s === 'downloading' ? 'downloadable' : s) : current,
          );
      })
      .catch(() => {
        if (mounted) setStatus((current) => (current === 'checking' ? 'error' : current));
      });
    if (!window.LanguageModel) setStatus('unsupported');
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    try {
      saveConversations(saveHistory ? conversations : []);
      localStorage.setItem('cheapgpt.remember', String(saveHistory));
    } catch {
      setToast('Browser storage is full or unavailable. This chat will only last for this visit.');
    }
  }, [conversations, saveHistory]);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages.at(-1)?.content, busy]);
  useEffect(
    () => () => {
      controller.current?.abort();
      base.current?.destroy();
    },
    [],
  );

  useEffect(() => {
    if (busy || !base.current) return;
    const chat = conversations.find((c) => c.id === activeId);
    if (!chat) return;
    const checkpoint = titleCheckpoint(chat);
    if (checkpoint === null) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      titleController.current = abort;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        abort.abort();
      }, 60000);
      try {
        const title = await summarizeTitle(base.current!, chat, abort.signal);
        if (abort.signal.aborted) return;
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== chat.id || c.titleManual || c.messages !== chat.messages) return c;
            const keep = title === 'KEEP' || title === c.title;
            return {
              ...c,
              title: title && !keep ? title : c.title,
              titleRound: checkpoint,
              titleStable: keep || checkpoint === 7,
            };
          }),
        );
      } catch {
        // A failed idle attempt is optional; never interrupt chat or retry in a loop.
        if (timedOut || !abort.signal.aborted)
          setConversations((prev) =>
            prev.map((c) =>
              c.id === chat.id && !c.titleManual ? { ...c, titleRound: checkpoint } : c,
            ),
          );
      } finally {
        clearTimeout(timeout);
        if (titleController.current === abort) titleController.current = null;
      }
    }, 8000);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [conversations, activeId, busy]);

  async function initialize(signal: AbortSignal) {
    setStatus('downloading');
    setModelError('');
    setProgress(0);
    try {
      // Called directly from Send, before any await, to preserve browser user activation.
      const session = await loadModel(setProgress, signal);
      if (signal.aborted) {
        session.destroy();
        signal.throwIfAborted();
      }
      base.current = session;
      setStatus('ready');
      return session;
    } catch (error) {
      setStatus(signal.aborted ? 'downloadable' : 'error');
      if (!signal.aborted)
        setModelError(error instanceof Error ? error.message : 'The local model could not start.');
      throw error;
    }
  }
  function newChat() {
    if (busy) return;
    setActiveId(null);
    setInput('');
    setTool('auto');
    setSidebar(false);
    setDrawer(false);
    textarea.current?.focus();
  }
  function updateMessage(chatId: string, messageId: string, patch: Partial<Message>) {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? { ...c, messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)) }
          : c,
      ),
    );
  }
  async function send() {
    const prompt = input.trim();
    if (!prompt || busy || controller.current) return;
    titleController.current?.abort();
    const chatId = activeId || id();
    const user: Message = { id: id(), role: 'user', content: prompt };
    const assistant: Message = { id: id(), role: 'assistant', content: '' };
    const history = [...messages, user];
    setConversations((prev) =>
      activeId
        ? prev.map((c) =>
            c.id === chatId
              ? { ...c, updatedAt: Date.now(), messages: [...history, assistant] }
              : c,
          )
        : [
            {
              id: chatId,
              title: prompt.slice(0, 60),
              updatedAt: Date.now(),
              messages: [user, assistant],
            },
            ...prev,
          ].slice(0, 50),
    );
    setActiveId(chatId);
    setInput('');
    setBusy(true);
    setSeconds(0);
    setPhase('');
    const abort = new AbortController();
    controller.current = abort;
    const start = performance.now();
    let content = '';
    let result: ToolResult | undefined;
    try {
      let model = base.current;
      let startupError = '';
      if (
        !model &&
        window.LanguageModel &&
        !needsHttps &&
        status !== 'unavailable' &&
        !['rename_conversation', 'capabilities'].includes(detectToolRequest(prompt)?.tool || '')
      ) {
        setPhase('Acquiring a few brain cells');
        try {
          model = await initialize(abort.signal);
        } catch (error) {
          if (abort.signal.aborted) throw error;
          startupError =
            error instanceof Error ? error.message : 'The local model could not start.';
        }
      }
      abort.signal.throwIfAborted();
      let request: ToolRequest | null = isConcreteTool
        ? { tool: tool as ToolId, query: prompt }
        : null;
      const explicit = detectToolRequest(prompt);
      if (explicit?.tool === 'rename_conversation' || explicit?.tool === 'capabilities')
        request = explicit;
      else if (tool === 'auto') {
        setPhase('Negotiating with the tool department');
        request = model ? await planTool(model, prompt, abort.signal) : detectToolRequest(prompt);
      }
      if (request?.tool === 'capabilities') {
        updateMessage(chatId, assistant.id, { content: capabilitySummary() });
        return;
      }
      if (request?.tool === 'rename_conversation') {
        const title = request.query.trim().slice(0, 80);
        if (!title) throw new Error('Please provide a nonempty conversation title.');
        setConversations((prev) =>
          prev.map((c) => (c.id === chatId ? { ...c, title, titleManual: true } : c)),
        );
        updateMessage(chatId, assistant.id, {
          content: `Conversation renamed to “${title}”. Automatic title updates are now off.`,
        });
        return;
      }
      if (request) {
        setPhase(`Borrowing facts from ${toolInfo.find((t) => t.id === request!.tool)?.name}`);
        result = await runTool(request.tool, request.query, abort.signal);
        updateMessage(chatId, assistant.id, { result });
      }
      abort.signal.throwIfAborted();
      setPhase('');
      if (result?.unavailable) {
        content = result.summary;
      } else if (model) {
        await streamReply(model, history, result, abort.signal, (chunk) => {
          content += chunk;
          updateMessage(chatId, assistant.id, { content });
        });
        if (!content.trim())
          throw new Error(
            'The model returned an empty response. Even our confidence has limits. Try again.',
          );
      } else if (result) {
        content = `${result.summary}\n\nLocal AI is off, so here are the facts straight from the source. No creative accounting.`;
      } else {
        throw new Error(
          startupError ||
            (needsHttps
              ? `Local AI needs HTTPS. [Open the secure version](${window.location.href.replace(/^http:/, 'https:')}) to use your browser’s model.`
              : status === 'unavailable'
                ? 'Your browser reports that its local model is unavailable on this device. Check browser support and hardware requirements.'
                : 'This browser does not expose the LanguageModel API. Try an eligible desktop Chrome or Chromium browser.'),
        );
      }
      updateMessage(chatId, assistant.id, {
        content,
        elapsed: Math.max(0.1, (performance.now() - start) / 1000),
      });
    } catch (error) {
      if (abort.signal.aborted)
        updateMessage(chatId, assistant.id, {
          content: content || 'Stopped. An excellent time-saving strategy.',
          interrupted: true,
          elapsed: (performance.now() - start) / 1000,
        });
      else
        updateMessage(chatId, assistant.id, {
          content:
            content ||
            (result
              ? `${result.summary}\n\nThe local model stumbled, but the source results are below.`
              : `Well, that was ambitious. ${error instanceof Error ? error.message : 'Something went wrong.'} ${!window.LanguageModel || needsHttps || status === 'unavailable' ? 'Public tools still work: try “Weather in Vancouver” or choose a tool from the menu.' : 'Try sending another message.'}`),
          error: true,
          elapsed: (performance.now() - start) / 1000,
        });
    } finally {
      setBusy(false);
      setPhase('');
      controller.current = null;
      textarea.current?.focus();
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast('Copied. A free second opinion awaits.');
    } catch {
      setToast('Clipboard access is unavailable in this browser.');
    }
  }
  function exportChat() {
    if (!active) return;
    const markdown =
      `# ${active.title}\n\n` +
      active.messages
        .map(
          (m) =>
            `## ${m.role === 'user' ? 'You' : 'CheapGPT'}\n\n${m.content}${m.result ? '\n\n' + m.result.sources.map((s) => `[${s.title}](${s.url})\n\n${s.detail}`).join('\n\n') : ''}`,
        )
        .join('\n\n');
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
    link.href = objectUrl;
    link.download = 'cheapgpt-conversation.md';
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  const sideContent = (
    <div className="sidebar-inner">
      <div className="sidebar-brand">
        <Coin small />
        <span>
          CheapGPT<span className="brand-dot">.</span>
        </span>
        <Tooltip title="Close sidebar">
          <IconButton
            size="small"
            aria-label="Close sidebar"
            onClick={() => {
              setSidebar(false);
              setDrawer(false);
            }}
          >
            <MenuRounded fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>
      <Button
        className="new-chat"
        variant="outlined"
        startIcon={<AddRounded />}
        fullWidth
        onClick={newChat}
        disabled={busy}
      >
        New chat<span className="key-hint">a fresh start</span>
      </Button>
      <button className="search-button" onClick={() => setSearchOpen(!searchOpen)}>
        <SearchRounded fontSize="small" /> Search conversations
      </button>
      {searchOpen && (
        <TextField
          size="small"
          autoFocus
          placeholder="Find a chat…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ htmlInput: { 'aria-label': 'Search conversations' } }}
        />
      )}
      <div className="history-title">
        YOUR CONVERSATIONS <span>{conversations.length.toString().padStart(2, '0')}</span>
      </div>
      <div className="history-list">
        {conversations.length === 0 ? (
          <div className="empty-history">
            <HistoryRounded />
            <p>No history. No baggage.</p>
            <span>
              Your questionable ideas
              <br />
              will live here.
            </span>
          </div>
        ) : (
          [...conversations]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
            .map((c) => (
              <div key={c.id} className={`history-item ${activeId === c.id ? 'selected' : ''}`}>
                <button
                  disabled={busy}
                  onClick={() => {
                    setActiveId(c.id);
                    setDrawer(false);
                  }}
                  title={c.title}
                >
                  {c.title}
                </button>
                <IconButton
                  disabled={busy}
                  size="small"
                  aria-label={`Delete ${c.title}`}
                  onClick={() => {
                    setConversations((prev) => prev.filter((v) => v.id !== c.id));
                    if (activeId === c.id) setActiveId(null);
                  }}
                >
                  <DeleteOutlineRounded fontSize="small" />
                </IconButton>
              </div>
            ))
        )}
        {search &&
          conversations.length > 0 &&
          !conversations.some((c) => c.title.toLowerCase().includes(search.toLowerCase())) && (
            <p className="no-results">No chats found. A clean record.</p>
          )}
      </div>
      <div className="sidebar-bottom">
        <div className="budget-note">
          <span className="note-star">✳</span>
          <strong>
            Less artificial.
            <br />
            More economical.
          </strong>
          <p>
            Your device. Your conversations.
            <br />
            Our very modest ambitions.
          </p>
          <span className="local-tag">
            <i /> Local by nature
          </span>
        </div>
        <button className="budget-profile" onClick={() => setSettings(true)}>
          <span className="profile-icon">
            <AccountBalanceWalletOutlined fontSize="small" />
          </span>
          <span>
            <strong>The budget plan</strong>
            <small>$0 / forever. Probably.</small>
          </span>
          <SettingsOutlined fontSize="small" />
        </button>
      </div>
    </div>
  );

  return (
    <div className={`app ${sidebar ? '' : 'sidebar-closed'}`}>
      {sidebar && <aside className="desktop-sidebar">{sideContent}</aside>}
      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        slotProps={{ paper: { sx: { width: 264, backgroundColor: '#f0f1ea' } } }}
      >
        {sideContent}
      </Drawer>
      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <IconButton
              className={sidebar ? 'mobile-menu' : ''}
              aria-label="Open sidebar"
              onClick={() => {
                if (window.innerWidth < 760) setDrawer(true);
                else setSidebar(true);
              }}
            >
              <MenuRounded fontSize="small" />
            </IconButton>
            <Button
              color="inherit"
              onClick={(e) => setModelAnchor(e.currentTarget)}
              endIcon={<ExpandMoreRounded />}
              className="model-picker"
            >
              CheapGPT <span className="model-version">mini</span>
            </Button>
            <span className="free-badge">FREE. OBVIOUSLY.</span>
          </div>
          <div className="topbar-right">
            <button
              className={`device-status ${status === 'ready' ? 'ready' : ''}`}
              onClick={() => setSettings(true)}
            >
              <i /> <span>{status === 'ready' ? 'On-device AI' : 'Local-first AI'}</span>
            </button>
            <Tooltip title="About CheapGPT">
              <IconButton aria-label="About CheapGPT" onClick={() => setSettings(true)}>
                <InfoOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          </div>
        </header>
        <Menu
          anchorEl={modelAnchor}
          open={Boolean(modelAnchor)}
          onClose={() => setModelAnchor(null)}
        >
          <MenuItem
            onClick={() => {
              setModelAnchor(null);
              setSettings(true);
            }}
          >
            <div className="model-menu">
              <strong>Browser’s built-in model</strong>
              <span>{statusLabels[status]}</span>
              <small>One model. Zero subscription tiers.</small>
            </div>
          </MenuItem>
        </Menu>
        <div className={`chat-layout ${messages.length ? 'has-messages' : 'empty-chat'}`}>
          {!messages.length ? (
            <section className="minimal-welcome">
              <h1>What can I help with?</h1>
            </section>
          ) : (
            <section className="messages" aria-label="Conversation">
              <div className="conversation-heading">
                <span>{active?.title}</span>
                <Tooltip title="Export conversation">
                  <IconButton size="small" aria-label="Export conversation" onClick={exportChat}>
                    <DownloadRounded fontSize="small" />
                  </IconButton>
                </Tooltip>
              </div>
              {messages.map((message, index) => (
                <article key={message.id} className={`message ${message.role}`}>
                  {message.role === 'assistant' && (
                    <div className="assistant-heading">
                      <Coin small />
                      <strong>CheapGPT</strong>
                      <span>doing its best</span>
                    </div>
                  )}
                  {message.content && (
                    <div className={`message-content ${message.error ? 'message-error' : ''}`}>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ href, children }) => (
                            <a href={safeUrl(href || '')} target="_blank" rel="noopener noreferrer">
                              {children}
                            </a>
                          ),
                          img: ({ alt }) => <span>[Image: {alt || 'remote image omitted'}]</span>,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}
                  {message.result && (
                    <div className="source-results">
                      <div className="source-heading">
                        {toolIcons[message.result.tool]}
                        <span>
                          {toolInfo.find((t) => t.id === message.result!.tool)?.name} · Public
                          sources
                        </span>
                      </div>
                      {message.result.sources.map((source, n) => (
                        <a
                          key={n}
                          className="source-card"
                          href={safeUrl(source.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <strong>
                            {source.title}
                            <OpenInNewRounded />
                          </strong>
                          <p>{source.detail}</p>
                        </a>
                      ))}
                    </div>
                  )}
                  {message.role === 'assistant' && !(busy && index === messages.length - 1) && (
                    <div className="message-actions">
                      <Tooltip title="Copy response">
                        <IconButton
                          size="small"
                          aria-label="Copy response"
                          onClick={() => copy(message.content)}
                        >
                          <ContentCopyRounded sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                      {message.elapsed !== undefined && (
                        <span>
                          {message.elapsed.toFixed(1)}s well wasted
                          {message.interrupted ? ' · Stopped' : ''}
                        </span>
                      )}
                    </div>
                  )}
                </article>
              ))}
              {busy && status === 'downloading' && (
                <div className="model-download" role="status">
                  <strong>
                    Downloading a few brain cells… {progress > 0 ? `${progress}%` : ''}
                  </strong>
                  <p>
                    Your browser is preparing its local model. The first download can be several
                    gigabytes. Your message is queued; we’ll answer as soon as the tiny brain is
                    ready.
                  </p>
                  <LinearProgress
                    variant={progress > 0 ? 'determinate' : 'indeterminate'}
                    value={progress}
                    aria-label="Local model download progress"
                  />
                </div>
              )}
              {busy && status !== 'downloading' && (
                <div className="thinking" role="status">
                  <span className="thinking-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  {phase || waiting[Math.floor(seconds / 6) % waiting.length]}
                  <span className="elapsed">{seconds}s wasted</span>
                </div>
              )}
              <div ref={bottom} />
            </section>
          )}
          <div className="composer-area">
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <textarea
                ref={textarea}
                aria-label="Message CheapGPT"
                placeholder={
                  isConcreteTool
                    ? toolInfo.find((t) => t.id === tool)?.placeholder
                    : 'Ask anything. Expect… something.'
                }
                value={input}
                rows={messages.length ? 2 : 1}
                maxLength={12000}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="composer-toolbar">
                <div className="composer-tools">
                  <Button
                    size="small"
                    startIcon={<TuneRounded />}
                    onClick={(e) => setToolsAnchor(e.currentTarget)}
                    className={tool !== 'none' ? 'tool-active' : ''}
                  >
                    {tool === 'none'
                      ? 'Tools'
                      : tool === 'auto'
                        ? 'Auto tools'
                        : toolInfo.find((t) => t.id === tool)?.name}
                    <ExpandMoreRounded sx={{ fontSize: 15, ml: 0.5 }} />
                  </Button>
                  <span className="toolbar-divider" />
                  <span className="local-caption">
                    <i />{' '}
                    {status === 'ready'
                      ? 'Brainpower: local'
                      : isConcreteTool
                        ? 'Public data, no AI needed'
                        : 'No cloud. No bill.'}
                  </span>
                </div>
                <Tooltip title={busy ? 'Stop generating' : 'Send message'}>
                  <span>
                    <IconButton
                      type={busy ? 'button' : 'submit'}
                      className="send-button"
                      aria-label={busy ? 'Stop generating' : 'Send message'}
                      disabled={!busy && !input.trim()}
                      onClick={busy ? () => controller.current?.abort() : undefined}
                    >
                      {busy ? <StopRounded /> : <ArrowUpwardRounded />}
                    </IconButton>
                  </span>
                </Tooltip>
              </div>
            </form>
            <Menu
              anchorEl={toolsAnchor}
              open={Boolean(toolsAnchor)}
              onClose={() => setToolsAnchor(null)}
              slotProps={{ paper: { sx: { width: 300, p: 0.5 } } }}
            >
              {[
                { id: 'none', name: 'Just chat', description: 'Keep it entirely on your device' },
                {
                  id: 'auto',
                  name: 'Let the tiny brain choose',
                  description: 'AI chooses one public tool when useful',
                },
                ...toolInfo,
              ].map((item) => (
                <MenuItem
                  key={item.id}
                  onClick={() => {
                    setTool(item.id as ToolChoice);
                    setToolsAnchor(null);
                  }}
                >
                  <span className="tool-menu-icon">
                    {item.id === 'none' ? (
                      <AutoAwesomeOutlined />
                    ) : item.id === 'auto' ? (
                      <TuneRounded />
                    ) : (
                      toolIcons[item.id as ToolId]
                    )}
                  </span>
                  <span className="tool-menu-label">
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </span>
                  {tool === item.id && <CheckRounded fontSize="small" />}
                </MenuItem>
              ))}
              <Divider />
              <MenuItem
                onClick={() => {
                  setToolsAnchor(null);
                  setToolGuide(true);
                }}
              >
                <InfoOutlined fontSize="small" sx={{ mr: 1.5 }} /> What gets sent to tools?
              </MenuItem>
            </Menu>
            {messages.length > 0 && !busy && status !== 'ready' && (
              <div className="setup-hint">
                <span className="status-dot" />
                <span>
                  {status === 'downloading'
                    ? `Downloading the brain… ${progress}%`
                    : isConcreteTool
                      ? 'This tool works without a local model.'
                      : needsHttps
                        ? 'Local AI needs a secure HTTPS connection.'
                        : status === 'downloadable' || status === 'available' || status === 'error'
                          ? 'Local AI starts with your next message.'
                          : 'A tiny brain needs a compatible browser.'}
                </span>
                <button onClick={() => setSettings(true)}>
                  {isConcreteTool
                    ? 'About local AI'
                    : status === 'downloading'
                      ? 'View progress'
                      : 'Browser support'}
                  <ChevronRightRounded />
                </button>
              </div>
            )}
            <p className="disclaimer">
              CheapGPT can make mistakes. It’s kind of the brand.{' '}
              <span>Double-check the important stuff.</span>
            </p>
          </div>
        </div>
      </main>
      <Dialog open={settings} onClose={() => setSettings(false)} fullWidth maxWidth="sm">
        <DialogTitle className="dialog-title">
          A little brain, on your device
          <IconButton aria-label="Close settings" onClick={() => setSettings(false)}>
            <CloseRounded />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <p className="dialog-intro">
            No AI subscriptions. No remote inference. Just your browser doing a surprising amount of
            work.
          </p>
          <div className="model-status-box">
            <span className={`status-dot ${status === 'ready' ? 'green' : ''}`} />
            <strong>{statusLabels[status]}</strong>
            {status === 'checking' && <CircularProgress size={16} />}
          </div>
          {needsHttps && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              This page is using HTTP. Your browser only exposes local AI on secure pages.{' '}
              <a href={window.location.href.replace(/^http:/, 'https:')}>Open the HTTPS version</a>.
              If it does not load securely, the site owner needs to configure HTTPS for this domain
              in GitHub Pages settings. Public tools still work over HTTP.
            </Alert>
          )}
          {status === 'unsupported' || status === 'unavailable' ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              Use a supported desktop Chrome or Chromium browser with the Prompt API available and
              eligible hardware. Browser version, region, storage, and device requirements vary.
              Public tools still work here.
            </Alert>
          ) : (
            status !== 'ready' && (
              <>
                <p>
                  The browser may download a model of several gigabytes the first time. It needs
                  compatible hardware, free disk space, and an internet connection for that
                  download. Chat inference then runs locally.
                </p>
                <p>
                  Send your first message to start the local model automatically. Download progress
                  appears right in the conversation. No extra setup dialog, no surprise
                  subscription.
                </p>
                {status === 'downloading' && (
                  <LinearProgress
                    variant={progress > 0 ? 'determinate' : 'indeterminate'}
                    value={progress}
                    sx={{ mt: 2 }}
                  />
                )}
              </>
            )
          )}
          {status === 'ready' && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Your local model is ready. You can close this panel and start a chat.
            </Alert>
          )}
          {modelError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {modelError}
            </Alert>
          )}
          <p>
            <a
              href="https://developer.chrome.com/docs/ai/prompt-api"
              target="_blank"
              rel="noopener noreferrer"
            >
              Browser support & setup <OpenInNewRounded sx={{ fontSize: 13 }} />
            </a>
          </p>
          <Divider sx={{ my: 2 }} />
          <div className="settings-row">
            <div>
              <strong>Remember conversations</strong>
              <p>Saved only in this browser. Shared device? Switch this off.</p>
            </div>
            <Switch
              checked={saveHistory}
              onChange={(_, value) => setSaveHistory(value)}
              slotProps={{ input: { 'aria-label': 'Remember conversations' } }}
            />
          </div>
          <div className="settings-row">
            <span>Make a fresh start.</span>
            <Button
              color="error"
              size="small"
              disabled={busy || !conversations.length}
              onClick={() => setConfirmClear(true)}
            >
              Delete all chats
            </Button>
          </div>
          <Divider sx={{ my: 2 }} />
          <p className="credits">
            An independent, good-humored project by{' '}
            <a href="https://github.com/predatorray" target="_blank" rel="noopener noreferrer">
              Wenhao Ji
            </a>
            . Not affiliated with OpenAI. MIT licensed.
          </p>
          <Button
            startIcon={<GitHub />}
            href="https://github.com/predatorray/CheapGPT"
            target="_blank"
            rel="noopener noreferrer"
            size="small"
          >
            View the source
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={toolGuide} onClose={() => setToolGuide(false)} fullWidth maxWidth="sm">
        <DialogTitle className="dialog-title">
          A few well-connected friends
          <IconButton aria-label="Close tool guide" onClick={() => setToolGuide(false)}>
            <CloseRounded />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <p>
            “Just chat” sends no prompts to any service. Selecting a tool sends your search text to
            that provider, which also sees your IP address. Auto tools is on by default: local AI
            chooses a tool when useful, with a fallback for explicit requests such as “weather in
            Vancouver” if AI is unavailable. The full conversation is never sent to a tool.
          </p>
          <p>
            Choose a tool for an exact lookup, even without AI. No keys, accounts, or paid services.
            These providers have usage policies and availability limits.
          </p>
          {toolInfo.map((t) => (
            <div key={t.id} className="tool-info">
              <span>{toolIcons[t.id]}</span>
              <div>
                <a href={t.url} target="_blank" rel="noopener noreferrer">
                  <strong>{t.name}</strong> ↗
                </a>
                <p>
                  {t.provider}. {t.quota}
                </p>
              </div>
            </div>
          ))}
          <p className="credits">
            Tool results are cached for five minutes in memory. For weather and IP lookups, enter an
            explicit city or address; we never request device geolocation. No analytics or tracking
            scripts.
          </p>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmClear} onClose={() => setConfirmClear(false)}>
        <DialogTitle>Delete every questionable idea?</DialogTitle>
        <DialogContent>
          This removes all saved conversations from this browser. This can’t be undone.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClear(false)}>Keep my ideas</Button>
          <Button
            color="error"
            onClick={() => {
              setConversations([]);
              setActiveId(null);
              setConfirmClear(false);
            }}
          >
            Delete all chats
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={5000}
        onClose={() => setToast('')}
        message={toast}
      />
    </div>
  );
}
