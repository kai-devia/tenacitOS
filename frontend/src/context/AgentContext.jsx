import { createContext, useState, useEffect } from 'react';

export const AgentContext = createContext();

const AGENTS = [
  { id: 'kai',    name: 'CORE' },
  { id: 'po-kai', name: 'PO'   },
];

// Default accent colors per mode
const DEFAULT_COLORS = {
  CORE: '#00d4aa',
  PO:   '#f59e0b',
};

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '0, 0, 0';
}

function hexToHsl(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 0, 0];
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function darken(hex, amount = 0.15) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return hex;
  const r = Math.max(0, Math.round(parseInt(result[1], 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(result[2], 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(result[3], 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function applyAccent(hex) {
  const root = document.documentElement;
  root.style.setProperty('--accent', hex);
  root.style.setProperty('--accent-hover', darken(hex));
  root.style.setProperty('--accent-rgb', hexToRgb(hex));

  // Derive subtle background tints from the accent hue
  const [h, s] = hexToHsl(hex);
  // Very dark tinted backgrounds — same structure as CSS :root but hue-matched
  root.style.setProperty('--bg-base',    hslToHex(h, Math.min(s, 30), 5));
  root.style.setProperty('--bg-surface', hslToHex(h, Math.min(s, 25), 9));
  root.style.setProperty('--bg-sidebar', hslToHex(h, Math.min(s, 20), 7));
  root.style.setProperty('--bg-card',    hslToHex(h, Math.min(s, 20), 11));
  root.style.setProperty('--border',     hslToHex(h, Math.min(s, 20), 18));
}

export function AgentContextProvider({ children }) {
  const [agentId, setAgentId] = useState('kai');
  const [modeColors, setModeColors] = useState(() => {
    try {
      const stored = localStorage.getItem('kai-mode-colors');
      return stored ? { ...DEFAULT_COLORS, ...JSON.parse(stored) } : { ...DEFAULT_COLORS };
    } catch {
      return { ...DEFAULT_COLORS };
    }
  });

  // Load agent from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('kai-agent-id');
    if (stored && AGENTS.some(a => a.id === stored)) {
      setAgentId(stored);
    }
  }, []);

  // Apply data-mode + accent color whenever agentId or modeColors change
  useEffect(() => {
    const agent = AGENTS.find(a => a.id === agentId) || AGENTS[0];
    document.documentElement.setAttribute('data-mode', agent.name);
    applyAccent(modeColors[agent.name] || DEFAULT_COLORS[agent.name] || '#00d4aa');
  }, [agentId, modeColors]);

  const setAgent = (newAgentId) => {
    if (AGENTS.some(a => a.id === newAgentId)) {
      setAgentId(newAgentId);
      localStorage.setItem('kai-agent-id', newAgentId);
    }
  };

  const setModeColor = (modeName, color) => {
    setModeColors(prev => {
      const next = { ...prev, [modeName]: color };
      localStorage.setItem('kai-mode-colors', JSON.stringify(next));
      return next;
    });
    // Apply immediately if it's the active mode — don't wait for useEffect
    const currentAgent = AGENTS.find(a => a.id === agentId);
    if (currentAgent && currentAgent.name === modeName) {
      applyAccent(color);
    }
  };

  const agent = AGENTS.find(a => a.id === agentId) || AGENTS[0];

  return (
    <AgentContext.Provider
      value={{
        agentId,
        agentName: agent.name,
        setAgent,
        agents: AGENTS,
        modeColors,
        setModeColor,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}
