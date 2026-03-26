/**
 * Holmes — TCLP Resource Library Chat Interface
 * Phase 3: Claude API Integration
 */

const { useState, useEffect, useRef } = React;

// =============================================================================
// Configuration
// =============================================================================

// For local development: create config.local.js with your API key (gitignored)
// For production: uses Netlify Function proxy (API key in environment variable)
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_KEY = window.HOLMES_CONFIG?.ANTHROPIC_API_KEY || null;

const API_CONFIG = (IS_LOCAL && API_KEY) ? {
  url: "https://api.anthropic.com/v1/messages",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true"
  }
} : {
  url: "/api/chat",
  headers: {
    "Content-Type": "application/json"
  }
};

const SYSTEM_PROMPT = `You are Holmes, a research librarian for the climate justice movement. 
You help advocates, organizers, and researchers find resources from a curated library.

When a user asks a question:
1. Review the provided candidate resources
2. Select the most relevant ones (usually 3–7)
3. Write a brief, conversational response that groups or contextualizes the resources
4. Mention each resource by its exact title — resource cards with full details will be displayed automatically below your response
5. Do NOT repeat descriptions, URLs, or detailed info about each resource — the cards handle that
6. If no resources are a strong match, say so honestly and suggest how the user might refine their search

If the user asks about something completely unrelated to climate, environment, justice, organizing, or social movements, politely redirect them. When declining off-topic requests, do NOT mention any resource titles — just briefly explain what topics you can help with.

Keep responses concise — a short intro paragraph, then just name the relevant resources with minimal commentary. Let the cards speak for themselves.

Prioritize resources from frontline and BIPOC-led organizations when they are relevant.

The candidate resources will be provided in JSON format at the end of each user message.`;

const STARTER_PROMPTS = [
  "What resources exist on environmental racism?",
  "How can I organize my community around climate issues?",
  "Find me toolkits for frontline communities",
  "What reports cover air quality and health?",
  "Resources on climate policy and advocacy"
];

// =============================================================================
// Resource Card Component
// =============================================================================

function ResourceCard({ resource }) {
  return (
    <div className="resource-card">
      <div className="resource-card__header">
        <h4 className="resource-card__title">
          <a href={resource.url} target="_blank" rel="noopener noreferrer">
            {resource.title}
          </a>
        </h4>
        {resource.type && (
          <span className="resource-card__badge">{resource.type}</span>
        )}
      </div>
      {resource.org && (
        <p className="resource-card__org">{resource.org}</p>
      )}
      {resource.description && (
        <p className="resource-card__description">{resource.description}</p>
      )}
    </div>
  );
}

// =============================================================================
// Message Component
// =============================================================================

function Message({ message, resources }) {
  const isUser = message.role === "user";
  
  return (
    <div className={`message message--${message.role}`}>
      <div className="message__content">
        <div className="message__text">
          {message.content.split('\n').map((paragraph, i) => (
            paragraph.trim() && <p key={i}>{paragraph}</p>
          ))}
        </div>
        {/* Render resource cards for assistant messages */}
        {!isUser && message.resources && message.resources.map(resource => (
          <ResourceCard key={resource.id} resource={resource} />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Typing Indicator Component
// =============================================================================

function TypingIndicator() {
  return (
    <div className="message message--assistant">
      <div className="typing" aria-label="Holmes is typing">
        <span className="typing__dot"></span>
        <span className="typing__dot"></span>
        <span className="typing__dot"></span>
      </div>
    </div>
  );
}

// =============================================================================
// Empty State Component
// =============================================================================

function EmptyState({ onPromptClick }) {
  return (
    <div className="chat__empty">
      <h2 className="chat__empty-title">Hi, I'm Holmes</h2>
      <p className="chat__empty-text">
        I can help you find climate justice resources from our library. 
        Ask me anything or try one of these prompts:
      </p>
      <div className="prompts">
        {STARTER_PROMPTS.map((prompt, i) => (
          <button
            key={i}
            className="prompts__button"
            onClick={() => onPromptClick(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Chat Input Component
// =============================================================================

function ChatInput({ onSubmit, disabled }) {
  const [input, setInput] = useState("");
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSubmit(input.trim());
      setInput("");
    }
  };
  
  return (
    <div className="chat__input-container">
      <form className="chat__input-form" onSubmit={handleSubmit}>
        <label htmlFor="chat-input" className="sr-only">
          Ask about climate justice resources
        </label>
        <input
          id="chat-input"
          type="text"
          className="chat__input"
          placeholder="Ask about climate justice resources..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={disabled}
        />
        <button
          type="submit"
          className="chat__submit"
          disabled={disabled || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}

// =============================================================================
// Main App Component
// =============================================================================

function App() {
  const [resources, setResources] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  
  // Load resources on mount
  useEffect(() => {
    fetch("data/resources.json")
      .then(res => {
        if (!res.ok) throw new Error("Failed to load resources");
        return res.json();
      })
      .then(data => setResources(data))
      .catch(err => {
        console.error("Error loading resources:", err);
        setError("Failed to load resource library. Please refresh the page.");
      });
  }, []);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);
  
  // Simple Levenshtein distance for fuzzy matching
  const levenshtein = (a, b) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        matrix[i][j] = b[i-1] === a[j-1] 
          ? matrix[i-1][j-1]
          : Math.min(matrix[i-1][j-1] + 1, matrix[i][j-1] + 1, matrix[i-1][j] + 1);
      }
    }
    return matrix[b.length][a.length];
  };
  
  // Check if term fuzzy-matches any word in text
  const fuzzyMatch = (term, text) => {
    // Exact substring match
    if (text.includes(term)) return true;
    
    // Fuzzy match against individual words
    const words = text.split(/\s+/);
    const maxDistance = term.length <= 5 ? 1 : 2; // Allow 1-2 typos based on word length
    
    return words.some(word => {
      if (Math.abs(word.length - term.length) > maxDistance) return false;
      return levenshtein(term, word) <= maxDistance;
    });
  };
  
  // Client-side scoring function with fuzzy matching
  const scoreResources = (query) => {
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    
    return resources
      .map(r => {
        let score = 0;
        const searchText = [
          r.title || "",
          r.description || "",
          r.org || "",
          ...(r.tags || [])
        ].join(" ").toLowerCase();
        
        const titleLower = (r.title || "").toLowerCase();
        const tagsLower = (r.tags || []).map(t => t.toLowerCase());
        
        terms.forEach(term => {
          // Exact matches
          if (searchText.includes(term)) {
            score += 1;
            if (tagsLower.some(tag => tag.includes(term))) score += 2;
            if (titleLower.includes(term)) score += 3;
          } 
          // Fuzzy matches (typo tolerance)
          else if (fuzzyMatch(term, searchText)) {
            score += 0.5;
            if (fuzzyMatch(term, titleLower)) score += 2;
          }
        });
        
        return { ...r, _score: score };
      })
      .filter(r => r._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 60);
  };
  
  // Normalize text for more forgiving title matching
  const normalizeText = (str) => str
    .toLowerCase()
    .replace(/[''`]/g, "'")     // Normalize quotes
    .replace(/[""]/g, '"')      // Normalize double quotes
    .replace(/°/g, ' degrees ') // Normalize degree symbol
    .replace(/[^\w\s]/g, ' ')   // Remove other special chars
    .replace(/\s+/g, ' ')       // Collapse whitespace
    .trim();
  
  // Extract mentioned resources from response text
  const extractMentionedResources = (responseText, candidates) => {
    const normalizedResponse = normalizeText(responseText);
    
    return candidates.filter(r => {
      const normalizedTitle = normalizeText(r.title);
      const titleWords = normalizedTitle.split(' ').filter(w => w.length > 3);
      const matchingWords = titleWords.filter(w => normalizedResponse.includes(w));
      return (matchingWords.length / titleWords.length > 0.6) || 
             responseText.includes(r.url);
    });
  };
  
  // Handle sending a message
  const handleSend = async (input) => {
    setError(null);
    
    // Add user message
    const userMessage = { role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    
    // Score and filter resources
    const candidates = scoreResources(input);
    
    // Build conversation history with candidates appended to user message
    const conversationHistory = [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      {
        role: "user",
        content: `${input}\n\n---\nCANDIDATE RESOURCES (${candidates.length} matches):\n${JSON.stringify(candidates, null, 2)}`
      }
    ];
    
    try {
      const response = await fetch(API_CONFIG.url, {
        method: "POST",
        headers: API_CONFIG.headers,
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          stream: true,
          system: SYSTEM_PROMPT,
          messages: conversationHistory
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API error: ${response.status}`);
      }
      
      // Add empty assistant message that we'll stream into
      const assistantMessageIndex = messages.length + 1; // +1 for the user message we just added
      setMessages(prev => [...prev, { role: "assistant", content: "", resources: [] }]);
      setIsLoading(false); // Hide typing indicator, we're streaming now
      
      // Read the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ""; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              
              // Handle content_block_delta events
              if (parsed.type === 'content_block_delta' && 
                  parsed.delta?.type === 'text_delta') {
                fullContent += parsed.delta.text;
                
                // Update the message content
                setMessages(prev => {
                  const updated = [...prev];
                  updated[assistantMessageIndex] = {
                    ...updated[assistantMessageIndex],
                    content: fullContent
                  };
                  return updated;
                });
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
      
      // After streaming completes, extract and add resource cards
      // Only show cards if we had meaningful candidate matches for the query
      // This prevents cards appearing when Claude's redirect response mentions topic keywords
      const mentionedResources = candidates.length >= 3 
        ? extractMentionedResources(fullContent, candidates)
        : [];
      setMessages(prev => {
        const updated = [...prev];
        updated[assistantMessageIndex] = {
          ...updated[assistantMessageIndex],
          content: fullContent || "I couldn't generate a response. Please try again.",
          resources: mentionedResources.slice(0, 7)
        };
        return updated;
      });
      
    } catch (err) {
      console.error("Claude API error:", err);
      setError(`Failed to get response: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handlePromptClick = (prompt) => {
    handleSend(prompt);
  };
  
  return (
    <div className="app">
      <header className="header">
        <h1 className="header__title">Holmes</h1>
        <p className="header__subtitle">
          Search the TCLP Climate Justice Resource Library with our chat agent Holmes
        </p>
      </header>
      
      <main className="chat" role="main">
        <div 
          className="chat__messages"
          role="log"
          aria-live="polite"
          aria-label="Chat messages"
        >
          {messages.length === 0 ? (
            <EmptyState onPromptClick={handlePromptClick} />
          ) : (
            <>
              {messages.map((msg, i) => (
                <Message key={i} message={msg} />
              ))}
              {isLoading && <TypingIndicator />}
            </>
          )}
          
          {error && (
            <div className="error">
              <p className="error__text">{error}</p>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
        
        <ChatInput onSubmit={handleSend} disabled={isLoading} />
      </main>
    </div>
  );
}

// =============================================================================
// Render
// =============================================================================

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
