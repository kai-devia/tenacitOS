import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { isAuthenticated } from './api/client';
import Login from './components/Login/Login';
import Layout from './components/Layout/Layout';

// Sections
import Sistema from './components/Sistema/Sistema';
import Chat from './components/Chat/Chat';
import Tasks from './components/Tasks/Tasks';
import Pulse from './components/Pulse/Pulse';
import Mente from './components/Mente/Mente';
import Vault from './components/Vault/Vault';

// File viewer / editor (used inside Mente with nested routes)
import Dashboard from './components/Dashboard/Dashboard';
import MarkdownView from './components/MarkdownView/MarkdownView';
import Editor from './components/Editor/Editor';

// Legacy route redirects
function RedirectFile() {
  const { '*': path } = useParams();
  return <Navigate to={`/mente/file/${path}`} replace />;
}

function RedirectEdit() {
  const { '*': path } = useParams();
  return <Navigate to={`/mente/edit/${path}`} replace />;
}

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function PublicRoute({ children }) {
  if (isAuthenticated()) {
    return <Navigate to="/sistema" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Public: Login */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />

      {/* Protected: Main app */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* Default redirect to /sistema */}
        <Route index element={<Navigate to="/sistema" replace />} />

        {/* 🖥️ Sistema — system metrics */}
        <Route path="sistema" element={<Sistema />} />

        {/* 💬 Chat */}
        <Route path="chat" element={<Chat />} />

        {/* ☑ Tasks — Kanban board */}
        <Route path="tasks" element={<Tasks />} />

        {/* ♥ Pulse — system events */}
        <Route path="pulse" element={<Pulse />} />

        {/* Legacy redirect */}
        <Route path="heartpulse" element={<Navigate to="/tasks" replace />} />

        {/* 🔐 Vault — secrets manager */}
        <Route path="vault" element={<Vault />} />

        {/* 🧠 Mente — file tree + markdown viewer + editor */}
        <Route path="mente" element={<Mente />}>
          <Route index element={<Dashboard />} />
          <Route path="file/*" element={<MarkdownView />} />
          <Route path="edit/*" element={<Editor />} />
        </Route>

        {/* Legacy routes — redirect to Mente equivalents */}
        <Route path="file/*" element={<RedirectFile />} />
        <Route path="edit/*" element={<RedirectEdit />} />
        <Route path="events" element={<Navigate to="/pulse" replace />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/sistema" replace />} />
    </Routes>
  );
}
