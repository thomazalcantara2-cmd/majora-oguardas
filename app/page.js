'use client';

import { useState, Fragment } from 'react';

const STEPS = ['search', 'password', 'data'];
const GRUPO_DA_ETAPA = { search: 0, password: 0, data: 1 };
const GRUPOS = ['Identificação', 'Resposta ao Recurso'];

export default function Page() {
  const [step, setStep] = useState('search');
  const [loading, setLoading] = useState(false);

  const [cpf, setCpf] = useState('');
  const [searchError, setSearchError] = useState('');

  const [selectedId, setSelectedId] = useState(null);
  const [selectedName, setSelectedName] = useState('');
  const [senha, setSenha] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [dados, setDados] = useState(null);

  function irParaEtapa(novaEtapa) {
    setStep(novaEtapa);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function buscarPorCpf() {
    const cpfDigitos = cpf.replace(/\D/g, '');
    if (cpfDigitos.length !== 11) {
      setSearchError('Digite os 11 números do CPF.');
      return;
    }
    setSearchError('');
    setLoading(true);
    try {
      const resp = await fetch('/api/buscar-cpf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf: cpfDigitos })
      });
      const json = await resp.json();
      if (!json.ok) {
        setSearchError(json.message);
        return;
      }
      setSelectedId(json.id);
      setSelectedName(json.nome);
      setSenha('');
      setPasswordError('');
      irParaEtapa('password');
    } catch (err) {
      setSearchError('Erro ao consultar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function validarSenha() {
    if (senha.length !== 4) {
      setPasswordError('Digite os 4 dígitos da senha.');
      return;
    }
    setPasswordError('');
    setLoading(true);
    try {
      const resp = await fetch('/api/validar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedId, senha })
      });
      const json = await resp.json();
      if (!json.ok) {
        setPasswordError(json.message);
        setSenha('');
        return;
      }
      setDados(json.dados);
      irParaEtapa('data');
    } catch (err) {
      setPasswordError('Erro ao validar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const grupoAtual = GRUPO_DA_ETAPA[step];

  return (
    <div className="page-shell">
      <header className="site-header">
        <div className="header-inner">
          <img src="/logo-pmjg.png" alt="Jaboatão dos Guararapes" className="header-logo" />
          <span className="header-divider" aria-hidden="true" />
          <div className="header-text">
            <p className="header-overline">Prefeitura do Jaboatão dos Guararapes</p>
            <p className="header-title">Secretaria Executiva de Gestão de Pessoas</p>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-inner">
          <div className="hero-content">
            <span className="hero-badge">Recurso Administrativo</span>
            <h1 className="hero-title">
              Majoração
              <br />
              de jornada
            </h1>
            <p className="hero-lede">
              Consulte a resposta da SEGEP ao recurso apresentado sobre a majoração da jornada dos Guardas Municipais
              de 30 (trinta) para 40 (quarenta) horas.
            </p>
          </div>
        </div>
      </section>

      <div className="container">
        <div className="etapas-card">
          <div className="etapas-row">
            {GRUPOS.map((label, i) => (
              <Fragment key={label}>
                {i > 0 && <div className={`etapa-linha ${i <= grupoAtual ? 'done' : ''}`} />}
                <div className={`etapa ${i < grupoAtual ? 'done' : i === grupoAtual ? 'current' : ''}`}>
                  <div className="etapa-circulo">{i + 1}</div>
                  <div className="etapa-rotulo">{label}</div>
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      <div className="content-col">
        <main style={{ position: 'relative' }}>
        {step === 'search' && (
          <section className="card">
            <h2>Digite seu CPF</h2>
            <p className="lede">
              Usamos o CPF completo só para localizar o seu registro — em seguida você confirma a identidade com a
              senha.
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              maxLength={14}
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && buscarPorCpf()}
            />
            <button type="button" className="btn btn-primary" onClick={buscarPorCpf} disabled={loading}>
              Continuar
            </button>
            {!searchError && <p className="hint">Digite os 11 números do CPF (com ou sem pontuação).</p>}
            {searchError && <p className="msg msg-error">{searchError}</p>}
          </section>
        )}

        {step === 'password' && (
          <section className="card">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setSelectedId(null);
                setSenha('');
                setPasswordError('');
                irParaEtapa('search');
              }}
            >
              &larr; Voltar
            </button>
            <h2>Confirme sua identidade</h2>
            <p className="lede">
              Encontramos: <strong>{selectedName}</strong>. É você?
            </p>
            <label htmlFor="password-input">Senha — últimos 4 dígitos do seu CPF</label>
            <input
              id="password-input"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoComplete="off"
              placeholder="••••"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && validarSenha()}
            />
            <p className="field-hint">
              Como você já digitou o CPF completo, esta etapa serve para confirmar que não houve engano na
              digitação.
            </p>
            <button type="button" className="btn btn-primary" onClick={validarSenha} disabled={loading}>
              Confirmar identidade
            </button>
            {passwordError && <p className="msg msg-error">{passwordError}</p>}
          </section>
        )}

        {step === 'data' && dados && (
          <section className="card">
            <h2>Resposta ao seu recurso</h2>
            <p className="lede">Confira abaixo a resposta da SEGEP ao recurso administrativo que você apresentou.</p>

            <label htmlFor="f-matricula">Matrícula</label>
            <input id="f-matricula" type="text" className="mono" value={dados.matricula} disabled readOnly />

            <label htmlFor="f-nome">Nome</label>
            <input id="f-nome" type="text" value={dados.nome} disabled readOnly />

            {dados.respostaRecursoUrl ? (
              <a
                href={dados.respostaRecursoUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
                style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
              >
                Baixar resposta ao recurso (PDF)
              </a>
            ) : (
              <p className="msg msg-warn">
                A resposta ao seu recurso ainda não está disponível para consulta. Tente novamente mais tarde.
              </p>
            )}

            {dados.recursoApresentadoUrl && (
              <a
                href={dados.recursoApresentadoUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost"
                style={{ display: 'block', textAlign: 'center', marginTop: 14 }}
              >
                Baixar o recurso que você apresentou (PDF)
              </a>
            )}
          </section>
        )}

        {loading && (
          <div className="loading-overlay">
            <div className="spinner" />
          </div>
        )}
        </main>

        <footer className="app-footer">
          <p>SEGEP — Secretaria Executiva de Gestão de Pessoas</p>
        </footer>
      </div>
    </div>
  );
}
