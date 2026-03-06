import { createContext, useState, useEffect, useRef, useCallback } from 'react';

export const AgentContext = createContext();

const ALL_AGENTS = [
  { id: 'kai', name: 'KAI', statusKey: 'kai' },
];

// Color del agente único
const DEFAULT_COLORS = {
  KAI: '#00d4aa',
};

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '0, 0, 0';
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
  root.style.removeProperty('--bg-base');
  root.style.removeProperty('--bg-surface');
  root.style.removeProperty('--bg-sidebar');
  root.style.removeProperty('--bg-card');
  root.style.removeProperty('--border');
}

// Mapeo agentId → nombre de modo
function agentName(id) {
  return ALL_AGENTS.find(a => a.id === id)?.name || 'CORE';
}

export function AgentContextProvider({ children }) {
  // agentId: siempre desde localStorage (solo identifica qué agente está activo)
  const [agentId, setAgentId] = useState(() => {
    try {
      const stored = localStorage.getItem('kai-agent-id');
      if (stored && ALL_AGENTS.some(a => a.id === stored)) return stored;
    } catch {}
    return 'kai';
  });

  // Colores: BD es la fuente de verdad. Este estado se puebla desde el backend al arrancar.
  const [modeColors, setModeColors] = useState(DEFAULT_COLORS);
  const colorsLoaded = useRef(false);

  // Estado de agentes (online/offline) — centralizado aquí
  const [agentStatuses, setAgentStatuses] = useState({});

  // Fetch agent statuses
  const refreshAgentStatuses = useCallback(async () => {
    try {
      const res = await fetch('/api/system/agents-status');
      if (res.ok) {
        const data = await res.json();
        setAgentStatuses(data);
      }
    } catch {}
  }, []);

  // Initial fetch + periodic refresh
  useEffect(() => {
    refreshAgentStatuses();
    const interval = setInterval(refreshAgentStatuses, 10000);
    return () => clearInterval(interval);
  }, [refreshAgentStatuses]);

  // Al arrancar: fetch de colores desde el backend
  useEffect(() => {
    async function loadColorsFromBackend() {
      try {
        const res = await fetch('/api/system/agent-settings');
        if (!res.ok) throw new Error('no response');
        const data = await res.json();

        const colors = { ...DEFAULT_COLORS };
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          Object.entries(data).forEach(([key, val]) => {
            if (val?.color) {
              const modeName = key.toUpperCase();
              if (modeName in colors) colors[modeName] = val.color;
            }
          });
        }

        setModeColors(colors);
        colorsLoaded.current = true;
      } catch {
        colorsLoaded.current = true;
      }
    }

    loadColorsFromBackend();
  }, []);

  // Aplicar accent cuando cambia agente o cuando se cargan los colores
  useEffect(() => {
    const name = agentName(agentId);
    document.documentElement.setAttribute('data-mode', name);
    applyAccent(modeColors[name] || DEFAULT_COLORS[name] || '#00d4aa');
  }, [agentId, modeColors]);

  // Cambiar de agente: aplica color del backend inmediatamente
  const setAgent = (newAgentId) => {
    if (ALL_AGENTS.some(a => a.id === newAgentId)) {
      setAgentId(newAgentId);
      localStorage.setItem('kai-agent-id', newAgentId);
    }
  };

  // Actualizar color de un modo (llamado desde SISTEMA tras guardar en BD)
  const setModeColor = (modeName, color) => {
    setModeColors(prev => ({ ...prev, [modeName]: color }));
  };

  // Solo mostrar agentes que están online
  const onlineAgents = ALL_AGENTS.filter(agent => {
    const status = agentStatuses[agent.statusKey];
    return !status || status.state !== 'offline';
  });

  const agent = ALL_AGENTS.find(a => a.id === agentId) || ALL_AGENTS[0];

  return (
    <AgentContext.Provider
      value={{
        agentId,
        agentName: agent.name,
        setAgent,
        agents: onlineAgents,        // Solo agentes online
        allAgents: ALL_AGENTS,       // Todos los agentes (para Sistema)
        agentStatuses,               // Estado de cada agente
        refreshAgentStatuses,        // Función para refrescar estado
        modeColors,
        setModeColor,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}
