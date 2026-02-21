import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { startAuthentication } from '@simplewebauthn/browser';
import { useAuth } from '../../hooks/useAuth';
import { webauthnLoginStart, webauthnLoginFinish, setToken } from '../../api/client';
import styles from './Login.module.css';

export default function Login() {
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [biometricError, setBiometricError] = useState(null);
  const [webauthnSupported, setWebauthnSupported] = useState(false);
  const { login, loading, error } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if WebAuthn is supported by the browser
    if (
      window.PublicKeyCredential &&
      typeof window.PublicKeyCredential === 'function'
    ) {
      setWebauthnSupported(true);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await login(user, password);
    if (success) {
      navigate('/');
    }
  };

  const handleBiometricLogin = async () => {
    setBiometricLoading(true);
    setBiometricError(null);

    try {
      // Step 1: Get authentication options from server
      const options = await webauthnLoginStart();

      if (!options.hasCredentials) {
        setBiometricError('No tienes huella registrada. Entra con contraseña y regístrala desde la app.');
        return;
      }

      // Step 2: Trigger browser biometric prompt
      let assertion;
      try {
        assertion = await startAuthentication(options);
      } catch (authErr) {
        if (authErr.name === 'NotAllowedError') {
          setBiometricError('Autenticación cancelada o no autorizada.');
        } else {
          setBiometricError('Error con el sensor biométrico: ' + authErr.message);
        }
        return;
      }

      // Step 3: Verify with server and get JWT
      const result = await webauthnLoginFinish(assertion);

      if (result.token) {
        setToken(result.token);
        navigate('/');
      } else {
        setBiometricError('No se recibió token del servidor.');
      }
    } catch (err) {
      setBiometricError(err.message || 'Error de autenticación biométrica');
    } finally {
      setBiometricLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.logo}>🧠</div>
        <h1 className={styles.title}>KAI DOC</h1>
        <p className={styles.subtitle}>Ventana a la mente de Kai</p>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.field}>
          <label htmlFor="user">Usuario</label>
          <input
            id="user"
            type="text"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="Usuario"
            autoComplete="username"
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            autoComplete="current-password"
            required
          />
        </div>

        <button type="submit" className={styles.button} disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>

        {webauthnSupported && (
          <>
            <div className={styles.divider}>
              <span>o</span>
            </div>

            {biometricError && (
              <div className={styles.error}>{biometricError}</div>
            )}

            <button
              type="button"
              className={styles.biometricButton}
              onClick={handleBiometricLogin}
              disabled={biometricLoading}
            >
              {biometricLoading ? '⏳ Verificando...' : '🔐 Entrar con huella'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
